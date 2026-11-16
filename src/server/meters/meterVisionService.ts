/**
 * Server-Side Meter Display Vision Scanner using @google/genai
 *
 * Security & Correctness Rules:
 * - Runs strictly on the Node.js Express server using `process.env.GEMINI_API_KEY`.
 * - NEVER exposes the API key to the browser.
 * - NEVER auto-saves extracted readings to any database/store.
 * - NEVER masks missing-key or upstream Gemini errors with simulated OCR readings.
 */

import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { MeterScanResult } from './types';

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

export class MeterVisionService {
  private static instance: MeterVisionService;

  public static getInstance(): MeterVisionService {
    if (!MeterVisionService.instance) {
      MeterVisionService.instance = new MeterVisionService();
    }
    return MeterVisionService.instance;
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

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      throw new MeterVisionError('Please upload a valid meter photo.', 'INVALID_IMAGE', 400);
    }

    let cleanBase64 = imageBase64.trim();
    let resolvedMime = mimeType || 'image/jpeg';

    if (cleanBase64.includes(',')) {
      const [prefix, data] = cleanBase64.split(',', 2);
      cleanBase64 = data;
      const mimeMatch = prefix.match(/:(.*?);/);
      if (mimeMatch && mimeMatch[1]) {
        resolvedMime = mimeMatch[1];
      }
    }

    if (!cleanBase64) {
      throw new MeterVisionError('Uploaded image file is empty.', 'EMPTY_IMAGE', 400);
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Inspect this photo of an electricity meter display (DESCO, DPDC, BPDB, BREB, NESCO, WZPDCL digital prepaid, digital postpaid, or mechanical dial register).
Read the cumulative energy reading in kWh (total active energy, e.g., OBIS 1.8.0 / Total kWh / cumulative register).
Important:
- Do NOT confuse remaining prepaid credit balance (Tk / BDT / ৳), voltage (V), current (A), or time/date codes with cumulative kWh.
- If the display clearly shows BDT/Tk currency or volts/amps instead of cumulative kWh, set readingKwh to null and explain in notes.
- If a decimal point is visible, include the exact decimal value; otherwise return the integer shown.
- Keep notes concise and factual for the user to review and confirm before saving.`;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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

      const text = response.text?.trim();
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
      };
    } catch (err: any) {
      if (err instanceof MeterVisionError) throw err;
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
