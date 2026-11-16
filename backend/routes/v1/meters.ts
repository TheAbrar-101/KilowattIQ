/**
 * Express REST API Routes - Real Household Meter Readings, Gemini Vision Scan & SMS Log
 *
 * Endpoints:
 * - GET    /api/v1/meters/readings?householdId=...    List real readings + computed Daily & MTD metrics
 * - POST   /api/v1/meters/readings                    Validate & save manual / confirmed scanned reading
 * - DELETE /api/v1/meters/readings/:id                Delete a reading and recompute metrics
 * - POST   /api/v1/meters/scan                        Server-side Gemini Vision meter display scan (NEVER auto-saves)
 * - POST   /api/v1/meters/parse-sms                   Parse utility recharge/bill SMS for confirmation (NEVER auto-saves)
 * - GET    /api/v1/meters/sms?householdId=...         List confirmed utility SMS records
 * - POST   /api/v1/meters/sms                         Save confirmed utility SMS record
 * - DELETE /api/v1/meters/sms/:id                     Delete an SMS record
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import {
  MeterReadingService,
  MeterReadingValidationError,
  computeMeterUsageMetrics,
} from '../../../src/server/meters/meterReadingService';
import { MeterVisionService, MeterVisionError } from '../../../src/server/meters/meterVisionService';
import { parseUtilitySms } from '../../../src/server/meters/smsParser';

const router = Router();
const db = SupabaseService.getInstance();
const readingService = MeterReadingService.getInstance();
const visionService = MeterVisionService.getInstance();

function resolveHouseholdId(req: AuthenticatedRequest): string {
  return (
    (req.query.householdId as string) ||
    (req.body?.householdId as string) ||
    req.user?.householdIds?.[0] ||
    '11111111-1111-4111-a111-111111111111'
  );
}

async function resolveSanctionedLoad(householdId: string): Promise<number> {
  try {
    const hh = await db.getHouseholdById(householdId);
    if (hh && typeof hh.sanctionedLoadKw === 'number' && hh.sanctionedLoadKw > 0) {
      return hh.sanctionedLoadKw;
    }
  } catch {
    // Fallback to standard 3.0 kW residential LT-A load
  }
  return 3.0;
}

// GET /api/v1/meters/readings
router.get('/readings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const readings = readingService.getReadings(householdId);
    const sanctionedLoadKw = await resolveSanctionedLoad(householdId);
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw);

    return res.json({
      status: 'success',
      data: {
        householdId,
        readings,
        metrics,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to load household meter readings.',
    });
  }
});

// POST /api/v1/meters/readings
router.post('/readings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const { readingKwh, readingDate, source, notes, confidence } = req.body || {};

    if (readingKwh === undefined || readingKwh === null || readingKwh === '' || Number.isNaN(Number(readingKwh))) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_KWH',
        message: 'Please enter a valid numeric kWh meter reading.',
      });
    }

    const saved = readingService.addReading(householdId, {
      readingKwh: Number(readingKwh),
      readingDate: String(readingDate || new Date().toISOString().slice(0, 10)),
      source: source === 'METER_SCAN' ? 'METER_SCAN' : 'MANUAL',
      notes,
      confidence,
    });

    const readings = readingService.getReadings(householdId);
    const sanctionedLoadKw = await resolveSanctionedLoad(householdId);
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw);

    return res.status(201).json({
      status: 'success',
      message: 'Meter reading saved successfully.',
      data: {
        reading: saved,
        readings,
        metrics,
      },
    });
  } catch (err: any) {
    if (err instanceof MeterReadingValidationError) {
      return res.status(err.statusCode).json({
        status: 'error',
        code: err.code,
        message: err.message,
        details: err.details,
      });
    }
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to save meter reading.',
    });
  }
});

// DELETE /api/v1/meters/readings/:id
router.delete('/readings/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const deleted = readingService.deleteReading(householdId, req.params.id);
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Meter reading not found.',
      });
    }

    const readings = readingService.getReadings(householdId);
    const sanctionedLoadKw = await resolveSanctionedLoad(householdId);
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw);

    return res.json({
      status: 'success',
      message: 'Meter reading removed.',
      data: { readings, metrics },
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to delete meter reading.',
    });
  }
});

// POST /api/v1/meters/scan (Server-side Gemini Vision ONLY — NEVER auto-saves)
router.post('/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_IMAGE',
        message: 'Please select or capture a meter display photo to scan.',
      });
    }

    const extraction = await visionService.extractMeterReadingFromImage(
      imageBase64,
      typeof mimeType === 'string' ? mimeType : 'image/jpeg'
    );

    return res.json({
      status: 'success',
      message: 'Meter reading extracted for confirmation. Review and save to record.',
      data: extraction,
    });
  } catch (err: any) {
    if (err instanceof MeterVisionError) {
      return res.status(err.statusCode).json({
        status: 'error',
        code: err.code,
        message: err.message,
      });
    }
    return res.status(500).json({
      status: 'error',
      code: 'METER_SCAN_FAILED',
      message: 'Unable to scan the meter photo right now. Please try again or enter the reading manually.',
    });
  }
});

// POST /api/v1/meters/parse-sms (Parses SMS text for confirmation — NEVER auto-saves)
router.post('/parse-sms', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { smsText } = req.body || {};
    if (typeof smsText !== 'string' || !smsText.trim()) {
      return res.status(400).json({
        status: 'error',
        code: 'EMPTY_SMS',
        message: 'Please paste a utility recharge or bill SMS first.',
      });
    }

    const parsed = parseUtilitySms(smsText);
    return res.json({
      status: 'success',
      data: parsed,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: 'Unable to parse this SMS message. Please try again.',
    });
  }
});

// GET /api/v1/meters/sms
router.get('/sms', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const records = readingService.getSmsRecords(householdId);
    return res.json({
      status: 'success',
      data: records,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to load saved SMS records.',
    });
  }
});

// POST /api/v1/meters/sms
router.post('/sms', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const { smsType, utility, amountBdt, date, balanceBdt, unitsKwh, token, rawText } = req.body || {};

    const saved = readingService.addSmsRecord(householdId, {
      smsType: smsType || 'UNKNOWN',
      utility: utility || null,
      amountBdt: amountBdt !== null && amountBdt !== undefined && amountBdt !== '' ? Number(amountBdt) : null,
      date: date || null,
      balanceBdt: balanceBdt !== null && balanceBdt !== undefined && balanceBdt !== '' ? Number(balanceBdt) : null,
      unitsKwh: unitsKwh !== null && unitsKwh !== undefined && unitsKwh !== '' ? Number(unitsKwh) : null,
      token: token || null,
      rawText: String(rawText || ''),
    });

    const records = readingService.getSmsRecords(householdId);

    return res.status(201).json({
      status: 'success',
      message: 'Utility SMS record saved.',
      data: {
        record: saved,
        records,
      },
    });
  } catch (err: any) {
    if (err instanceof MeterReadingValidationError) {
      return res.status(err.statusCode).json({
        status: 'error',
        code: err.code,
        message: err.message,
      });
    }
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to save SMS record.',
    });
  }
});

// DELETE /api/v1/meters/sms/:id
router.delete('/sms/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const deleted = readingService.deleteSmsRecord(householdId, req.params.id);
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'SMS record not found.',
      });
    }
    const records = readingService.getSmsRecords(householdId);
    return res.json({
      status: 'success',
      data: records,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to delete SMS record.',
    });
  }
});

export default router;
