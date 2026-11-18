/**
 * Server-Side Meter Display Vision Scanner using @google/genai
 *
 * Security & Hardening Rules:
 * - Runs strictly on the Node.js Express server using `process.env.GEMINI_API_KEY`.
 * - Model name is read from `process.env.GEMINI_VISION_MODEL` (documented default:
 *   DEFAULT_GEMINI_VISION_MODEL = 'gemini-4-hydrogen'). Never silently ignores invalid model errors.
 * - Rejects non-image payloads (via MIME check + decoded raster magic bytes) and >4 MB images.
 * - Enforces per-user scan rate limiting (10 scans/hour, 100 scans/day -> HTTP 429).
 * - NEVER auto-saves extracted readings or masks errors with simulated OCR output.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { MeterScanResult } from './types';
import { SupabaseService } from '../../../backend/services/SupabaseService';

/**
 * Documented default Gemini Vision model for meter OCR.
 * Override cleanly in deployment via `process.env.GEMINI_VISION_MODEL`.
 */
export const DEFAULT_GEMINI_VISION_MODEL = 'gemini-4-hydrogen';

export const MAX_SCAN_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB decoded ceiling
export const SCAN_HOURLY_LIMIT = 10;
export const SCAN_DAILY_LIMIT = 100;

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export function resolveGeminiVisionModel(): string {
  const configured = process.env.GEMINI_VISION_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_VISION_MODEL;
}

export function isInvalidModelApiError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const msg = String(err?.message || '').toLowerCase();
  if (status === 404 || msg.includes('not_found') || msg.includes('404')) {
    return true;
  }
  if (
    msg.includes('model') &&
    (msg.includes('not found') ||
      msg.includes('invalid') ||
      msg.includes('unsupported') ||
      msg.includes('does not exist') ||
      msg.includes('unknown model'))
  ) {
    return true;
  }
  return false;
}

function hasValidRasterImageSignature(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }
  // GIF: GIF87a or GIF89a
  const ascii6 = buf.subarray(0, 6).toString('ascii');
  if (ascii6 === 'GIF87a' || ascii6 === 'GIF89a') return true;
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  // HEIC / HEIF / AVIF (ISO BMFF container with ftyp box at offset 4)
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return true;
  }
  return false;
}

export class MeterVisionError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, code: string = 'METER_SCAN_FAILED', statusCode: number = 500) {
    super(message);
    this.name = 'MeterVisionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface ScanRateLimitStatus {
  allowed: boolean;
  hourlyCount: number;
  dailyCount: number;
  hourlyLimit: number;
  dailyLimit: number;
  retryAfterSeconds: number;
}

/**
 * Persistent Per-User Rate Limiter for POST /meters/scan (10/hour, 100/day).
 * Stores scan timestamps in Supabase `meter_scan_rate_limits` when connected,
 * or atomically on disk when Supabase is unavailable (no in-memory-only Map).
 */
export class ScanRateLimiter {
  private readonly storePath: string;

  constructor(storePath?: string) {
    this.storePath = storePath || path.join(os.tmpdir(), 'kilowattiq-scan-ratelimit.json');
  }

  private readDiskMap(): Record<string, number[]> {
    try {
      if (!fs.existsSync(this.storePath)) return {};
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeDiskMap(data: Record<string, number[]>): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${this.storePath}.${process.pid}.${Math.random().toString(36).slice(2, 6)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, this.storePath);
  }

  public async consumeOrReject(userId: string, nowMs: number = Date.now()): Promise<ScanRateLimitStatus> {
    const cleanUser = (userId || '').trim() || 'anonymous';
    const oneHourAgo = nowMs - 60 * 60 * 1000;
    const oneDayAgo = nowMs - 24 * 60 * 60 * 1000;

    const db = SupabaseService.getInstance();
    if (!db.isUsingMock() && db.getClient()) {
      try {
        const client = db.getClient()!;
        const dayIso = new Date(oneDayAgo).toISOString();
        const { data, error } = await client
          .from('meter_scan_rate_limits')
          .select('scanned_at')
          .eq('user_id', cleanUser)
          .gte('scanned_at', dayIso);

        if (!error && Array.isArray(data)) {
          const timestamps = data
            .map((r: any) => new Date(r.scanned_at).getTime())
            .filter((t) => Number.isFinite(t));
          const hourly = timestamps.filter((t) => t > oneHourAgo);
          const daily = timestamps.filter((t) => t > oneDayAgo);

          if (hourly.length >= SCAN_HOURLY_LIMIT) {
            const oldestHour = Math.min(...hourly);
            const retryAfter = Math.max(1, Math.ceil((oldestHour + 3600000 - nowMs) / 1000));
            throw new MeterVisionError(
              `Scan limit reached (${SCAN_HOURLY_LIMIT} scans per hour). Please wait a bit before scanning again or enter your reading manually.`,
              'SCAN_RATE_LIMIT_EXCEEDED',
              429
            );
          }
          if (daily.length >= SCAN_DAILY_LIMIT) {
            const oldestDay = Math.min(...daily);
            const retryAfter = Math.max(1, Math.ceil((oldestDay + 86400000 - nowMs) / 1000));
            throw new MeterVisionError(
              `Daily scan limit reached (${SCAN_DAILY_LIMIT} scans per day). Please try again tomorrow or enter your reading manually.`,
              'SCAN_RATE_LIMIT_EXCEEDED',
              429
            );
          }

          await client.from('meter_scan_rate_limits').insert({
            user_id: cleanUser,
            scanned_at: new Date(nowMs).toISOString(),
          });

          return {
            allowed: true,
            hourlyCount: hourly.length + 1,
            dailyCount: daily.length + 1,
            hourlyLimit: SCAN_HOURLY_LIMIT,
            dailyLimit: SCAN_DAILY_LIMIT,
            retryAfterSeconds: 0,
          };
        }
      } catch (err: any) {
        if (err instanceof MeterVisionError) throw err;
        // Fall through to persistent disk rate limiter if table query failed
      }
    }

    const map = this.readDiskMap();
    const recent = (map[cleanUser] || []).filter((ts) => typeof ts === 'number' && ts > oneDayAgo);
    const hourly = recent.filter((ts) => ts > oneHourAgo);

    if (hourly.length >= SCAN_HOURLY_LIMIT) {
      map[cleanUser] = recent;
      this.writeDiskMap(map);
      throw new MeterVisionError(
        `Scan limit reached (${SCAN_HOURLY_LIMIT} scans per hour). Please wait a bit before scanning again or enter your reading manually.`,
        'SCAN_RATE_LIMIT_EXCEEDED',
        429
      );
    }

    if (recent.length >= SCAN_DAILY_LIMIT) {
      map[cleanUser] = recent;
      this.writeDiskMap(map);
      throw new MeterVisionError(
        `Daily scan limit reached (${SCAN_DAILY_LIMIT} scans per day). Please try again tomorrow or enter your reading manually.`,
        'SCAN_RATE_LIMIT_EXCEEDED',
        429
      );
    }

    recent.push(nowMs);
    map[cleanUser] = recent;
    this.writeDiskMap(map);

    return {
      allowed: true,
      hourlyCount: hourly.length + 1,
      dailyCount: recent.length,
      hourlyLimit: SCAN_HOURLY_LIMIT,
      dailyLimit: SCAN_DAILY_LIMIT,
      retryAfterSeconds: 0,
    };
  }
}

export type VisionGenerateFn = (params: {
  model: string;
  mimeType: string;
  base64Data: string;
  prompt: string;
}) => Promise<string | undefined>;

export class MeterVisionService {
  private static instance: MeterVisionService;
  private readonly customGenerate?: VisionGenerateFn;

  constructor(customGenerate?: VisionGenerateFn) {
    this.customGenerate = customGenerate;
  }

  public static getInstance(): MeterVisionService {
    if (!MeterVisionService.instance) {
      MeterVisionService.instance = new MeterVisionService();
    }
    return MeterVisionService.instance;
  }

  public validateAndDecodeImage(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
  ): { cleanBase64: string; resolvedMime: string; byteLength: number } {
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new MeterVisionError('Please upload a valid meter photo.', 'NON_IMAGE_DATA', 400);
    }

    let cleanBase64 = imageBase64.trim();
    let resolvedMime = (mimeType || 'image/jpeg').trim().toLowerCase();

    if (cleanBase64.startsWith('data:')) {
      const commaIdx = cleanBase64.indexOf(',');
      if (commaIdx === -1) {
        throw new MeterVisionError(
          'Uploaded data is not a valid image.',
          'NON_IMAGE_DATA',
          400
        );
      }
      const prefix = cleanBase64.slice(0, commaIdx);
      cleanBase64 = cleanBase64.slice(commaIdx + 1).trim();
      const mimeMatch = prefix.match(/^data:([^;]+);base64$/i);
      if (mimeMatch && mimeMatch[1]) {
        resolvedMime = mimeMatch[1].trim().toLowerCase();
      } else {
        throw new MeterVisionError(
          'Uploaded file must be a base64-encoded meter image.',
          'NON_IMAGE_DATA',
          400
        );
      }
    }

    if (!ALLOWED_IMAGE_MIMES.has(resolvedMime)) {
      throw new MeterVisionError(
        `Unsupported file type "${resolvedMime}". Only JPEG, PNG, WebP, GIF, or HEIC meter photos are accepted.`,
        'NON_IMAGE_DATA',
        400
      );
    }

    if (!cleanBase64 || !/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
      throw new MeterVisionError(
        'Uploaded payload does not contain valid image data.',
        'NON_IMAGE_DATA',
        400
      );
    }

    const compactBase64 = cleanBase64.replace(/\s+/g, '');
    const decoded = Buffer.from(compactBase64, 'base64');

    if (decoded.length === 0) {
      throw new MeterVisionError('Uploaded image file is empty.', 'EMPTY_IMAGE', 400);
    }

    if (decoded.length > MAX_SCAN_IMAGE_BYTES) {
      throw new MeterVisionError(
        'Photo exceeds the 4 MB upload limit even after compression. Please crop closer to the meter display or enter your reading manually.',
        'IMAGE_TOO_LARGE',
        413
      );
    }

    if (!hasValidRasterImageSignature(decoded)) {
      throw new MeterVisionError(
        'Uploaded content is not a valid image file (non-image data rejected). Please upload a real JPEG or PNG photo of your meter.',
        'NON_IMAGE_DATA',
        400
      );
    }

    return {
      cleanBase64: compactBase64,
      resolvedMime: resolvedMime === 'image/jpg' ? 'image/jpeg' : resolvedMime,
      byteLength: decoded.length,
    };
  }

  public async extractMeterReadingFromImage(
    imageBase64: string,
    mimeType: string = 'image/jpeg'
  ): Promise<MeterScanResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (!apiKey || apiKey.length < 10 || apiKey.includes('your-gemini-api-key')) {
      throw new MeterVisionError(
        'Gemini Vision scanning is not configured on the server (missing GEMINI_API_KEY). Please enter your meter reading manually or add the key in Settings > Secrets.',
        'GEMINI_KEY_MISSING',
        503
      );
    }

    const { cleanBase64, resolvedMime } = this.validateAndDecodeImage(imageBase64, mimeType);
    const modelName = resolveGeminiVisionModel();

    const prompt = `Inspect this photo of an electricity meter display (DESCO, DPDC, BPDB, BREB, NESCO, WZPDCL digital prepaid, digital postpaid, or mechanical dial register).
Read the cumulative energy reading in kWh (total active energy, e.g., OBIS 1.8.0 / Total kWh / cumulative register).
Important:
- Do NOT confuse remaining prepaid credit balance (Tk / BDT / ৳), voltage (V), current (A), or time/date codes with cumulative kWh.
- If the display clearly shows BDT/Tk currency or volts/amps instead of cumulative kWh, set readingKwh to null and explain in notes.
- If a decimal point is visible, include the exact decimal value; otherwise return the integer shown.
- Keep notes concise and factual for the user to review and confirm before saving.`;

    try {
      let text: string | undefined;

      if (this.customGenerate) {
        text = await this.customGenerate({
          model: modelName,
          mimeType: resolvedMime,
          base64Data: cleanBase64,
          prompt,
        });
      } else {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: resolvedMime,
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                readingKwh: {
                  type: Type.NUMBER,
                  description: 'Extracted cumulative electricity meter reading in kWh, or null if not clearly readable.',
                  nullable: true,
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Confidence score from 0.0 to 1.0.',
                },
                meterType: {
                  type: Type.STRING,
                  description: 'One of PREPAID_DIGITAL, POSTPAID_DIGITAL, ANALOG_DIAL, or UNKNOWN.',
                },
                unitDetected: {
                  type: Type.STRING,
                  description: 'Unit shown on screen (e.g., kWh, Tk, V, A, or UNKNOWN).',
                },
                rawText: {
                  type: Type.STRING,
                  description: 'Exact characters/digits visible on the meter screen.',
                },
                notes: {
                  type: Type.STRING,
                  description: 'Helpful confirmation note for the homeowner (e.g. glare, partial digit, or OBIS code seen).',
                },
              },
              required: ['confidence', 'meterType', 'unitDetected', 'rawText', 'notes'],
            },
          },
        });

        text = response.text?.trim();
      }

      if (!text) {
        throw new MeterVisionError(
          'Could not read the meter display from this photo. Please try a clearer, well-lit photo or enter the reading manually.',
          'UNREADABLE_METER',
          422
        );
      }

      const parsed = JSON.parse(text);
      const readingKwh =
        typeof parsed.readingKwh === 'number' && Number.isFinite(parsed.readingKwh) && parsed.readingKwh >= 0
          ? Number(parsed.readingKwh.toFixed(2))
          : null;

      const validMeterTypes = ['PREPAID_DIGITAL', 'POSTPAID_DIGITAL', 'ANALOG_DIAL', 'UNKNOWN'] as const;
      const meterType = validMeterTypes.includes(parsed.meterType) ? parsed.meterType : 'UNKNOWN';

      return {
        readingKwh,
        confidence:
          typeof parsed.confidence === 'number'
            ? Math.max(0, Math.min(1, Number(parsed.confidence.toFixed(2))))
            : 0.5,
        meterType,
        unitDetected: String(parsed.unitDetected || 'UNKNOWN'),
        rawText: String(parsed.rawText || ''),
        notes: String(
          parsed.notes ||
            (readingKwh === null
              ? 'No cumulative kWh figure was clearly readable in this image.'
              : 'Please verify the extracted number against your meter display before saving.')
        ),
        modelUsed: modelName,
      };
    } catch (err: any) {
      if (err instanceof MeterVisionError) throw err;

      if (isInvalidModelApiError(err)) {
        throw new MeterVisionError(
          `Invalid or unsupported Gemini Vision model "${modelName}". Please check process.env.GEMINI_VISION_MODEL (default: "${DEFAULT_GEMINI_VISION_MODEL}") or enter the reading manually.`,
          'INVALID_GEMINI_MODEL',
          400
        );
      }

      const msg = String(err?.message || '');
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
        throw new MeterVisionError(
          'Gemini API key was rejected. Please verify your API key in Settings > Secrets or enter the reading manually.',
          'GEMINI_AUTH_ERROR',
          502
        );
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new MeterVisionError(
          'Gemini Vision rate limit reached. Please wait a moment and try again, or enter the reading manually.',
          'GEMINI_RATE_LIMIT',
          429
        );
      }
      throw new MeterVisionError(
        'Unable to read the meter photo right now. Please try again with a clearer photo or enter the reading manually.',
        'GEMINI_UPSTREAM_ERROR',
        502
      );
    }
  }
}
