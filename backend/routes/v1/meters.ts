/**
 * Express REST API Routes - Real Household Meter Readings, Gemini Vision Scan & SMS Log
 *
 * Hardened Endpoints:
 * - GET    /api/v1/meters/readings?householdId=...    List user's real readings + Daily & Billing-Cycle MTD metrics
 * - POST   /api/v1/meters/readings                    Validate & save manual / confirmed scanned reading (supports meter replacement segments)
 * - DELETE /api/v1/meters/readings/:id                Delete a reading owned by the user and recompute metrics
 * - PUT    /api/v1/meters/billing-day                 Configure household billing cycle start day (1-31, default 1)
 * - POST   /api/v1/meters/scan                        Rate-limited (10/hr, 100/day) server-side Gemini Vision scan (rejects non-images & >4MB; NEVER auto-saves)
 * - POST   /api/v1/meters/parse-sms                   Parse utility recharge/bill SMS (masks STS tokens to last 4 digits; NEVER auto-saves)
 * - GET    /api/v1/meters/sms?householdId=...         List confirmed utility SMS records owned by the user
 * - POST   /api/v1/meters/sms                         Save confirmed utility SMS record (stores only last 4 digits of STS token)
 * - DELETE /api/v1/meters/sms/:id                     Delete an SMS record owned by the user
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import {
  MeterReadingService,
  MeterReadingValidationError,
  computeMeterUsageMetrics,
  normalizeBillingDay,
} from '../../../src/server/meters/meterReadingService';
import {
  MeterVisionService,
  MeterVisionError,
  ScanRateLimiter,
} from '../../../src/server/meters/meterVisionService';
import { parseUtilitySms } from '../../../src/server/meters/smsParser';
import {
  getDhakaBillingCycleTiming,
  getDhakaDateString,
} from '../../../shared/utils/dhakaTime';

const router = Router();
const db = SupabaseService.getInstance();
const readingService = MeterReadingService.getInstance();
const visionService = MeterVisionService.getInstance();
const scanRateLimiter = new ScanRateLimiter();

function resolveHouseholdId(req: AuthenticatedRequest): string {
  return (
    (req.query.householdId as string) ||
    (req.body?.householdId as string) ||
    req.user?.householdIds?.[0] ||
    '11111111-1111-4111-a111-111111111111'
  );
}

function resolveUserId(req: AuthenticatedRequest): string {
  return req.user?.id || 'usr_dhaka_01';
}

function resolveAuthToken(req: AuthenticatedRequest): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return undefined;
}

async function resolveHouseholdBillingConfig(
  householdId: string,
  userId: string,
  authToken?: string
): Promise<{ sanctionedLoadKw: number; billingDay: number }> {
  let sanctionedLoadKw = 3.0;
  let billingDay = 1;
  try {
    const hh = await db.getHouseholdById(householdId);
    if (hh && typeof hh.sanctionedLoadKw === 'number' && hh.sanctionedLoadKw > 0) {
      sanctionedLoadKw = hh.sanctionedLoadKw;
    }
    if (hh && typeof hh.billingDay === 'number') {
      billingDay = normalizeBillingDay(hh.billingDay);
    }
  } catch {
    // Fallback to defaults
  }

  try {
    const persistedBillingDay = await readingService.getHouseholdBillingDay(
      householdId,
      userId,
      authToken
    );
    if (persistedBillingDay) {
      billingDay = normalizeBillingDay(persistedBillingDay);
    }
  } catch {
    // Retain fallback billingDay
  }

  return { sanctionedLoadKw, billingDay };
}

// GET /api/v1/meters/readings
router.get('/readings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const readings = await readingService.getReadings(householdId, userId, authToken);
    const { sanctionedLoadKw, billingDay } = await resolveHouseholdBillingConfig(
      householdId,
      userId,
      authToken
    );
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw, undefined, billingDay);

    return res.json({
      status: 'success',
      data: {
        householdId,
        billingDay,
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
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const { readingKwh, readingDate, source, notes, confidence, isMeterReplacement } = req.body || {};

    if (
      readingKwh === undefined ||
      readingKwh === null ||
      readingKwh === '' ||
      Number.isNaN(Number(readingKwh))
    ) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_KWH',
        message: 'Please enter a valid numeric kWh meter reading.',
      });
    }

    const saved = await readingService.addReading(
      householdId,
      userId,
      {
        readingKwh: Number(readingKwh),
        readingDate: String(readingDate || getDhakaDateString()),
        source: source === 'METER_SCAN' ? 'METER_SCAN' : 'MANUAL',
        notes,
        confidence,
        isMeterReplacement: Boolean(isMeterReplacement),
      },
      authToken
    );

    const readings = await readingService.getReadings(householdId, userId, authToken);
    const { sanctionedLoadKw, billingDay } = await resolveHouseholdBillingConfig(
      householdId,
      userId,
      authToken
    );
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw, undefined, billingDay);

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

// PUT /api/v1/meters/billing-day
router.put('/billing-day', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const rawDay = Number(req.body?.billingDay);

    if (!Number.isInteger(rawDay) || rawDay < 1 || rawDay > 31) {
      return res.status(400).json({
        status: 'error',
        code: 'INVALID_BILLING_DAY',
        message: 'Billing day must be a whole number between 1 and 31.',
      });
    }

    const billingDay = await readingService.setHouseholdBillingDay(
      householdId,
      userId,
      rawDay,
      authToken
    );
    const readings = await readingService.getReadings(householdId, userId, authToken);
    const { sanctionedLoadKw } = await resolveHouseholdBillingConfig(householdId, userId, authToken);
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw, undefined, billingDay);

    return res.json({
      status: 'success',
      message: `Billing cycle day updated to day ${billingDay} of each month.`,
      data: {
        billingDay,
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
      });
    }
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to update billing day.',
    });
  }
});

// DELETE /api/v1/meters/readings/:id
router.delete('/readings/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const deleted = await readingService.deleteReading(
      householdId,
      userId,
      req.params.id,
      authToken
    );
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Meter reading not found.',
      });
    }

    const readings = await readingService.getReadings(householdId, userId, authToken);
    const { sanctionedLoadKw, billingDay } = await resolveHouseholdBillingConfig(
      householdId,
      userId,
      authToken
    );
    const metrics = computeMeterUsageMetrics(readings, sanctionedLoadKw, undefined, billingDay);

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

// POST /api/v1/meters/scan (Rate-limited 10/hr & 100/day per user, rejects non-images, NEVER auto-saves)
router.post('/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = resolveUserId(req);
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        status: 'error',
        code: 'NON_IMAGE_DATA',
        message: 'Please select or capture a valid meter display photo to scan.',
      });
    }

    // Enforce per-user rate limit (10/hour, 100/day -> HTTP 429)
    await scanRateLimiter.consumeOrReject(userId);

    // Validate image MIME & magic bytes & <= 4MB before calling Gemini Vision
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

// POST /api/v1/meters/parse-sms (Parses SMS text & masks STS token — NEVER auto-saves)
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
  } catch {
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
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const records = await readingService.getSmsRecords(householdId, userId, authToken);
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
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const { smsType, utility, amountBdt, date, balanceBdt, unitsKwh, tokenLast4, token, rawText } =
      req.body || {};

    const saved = await readingService.addSmsRecord(
      householdId,
      userId,
      {
        smsType: smsType || 'UNKNOWN',
        utility: utility || null,
        amountBdt:
          amountBdt !== null && amountBdt !== undefined && amountBdt !== ''
            ? Number(amountBdt)
            : null,
        date: date || null,
        balanceBdt:
          balanceBdt !== null && balanceBdt !== undefined && balanceBdt !== ''
            ? Number(balanceBdt)
            : null,
        unitsKwh:
          unitsKwh !== null && unitsKwh !== undefined && unitsKwh !== ''
            ? Number(unitsKwh)
            : null,
        tokenLast4: tokenLast4 || null,
        token: token || null,
        rawText: String(rawText || ''),
      },
      authToken
    );

    const records = await readingService.getSmsRecords(householdId, userId, authToken);

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
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const deleted = await readingService.deleteSmsRecord(
      householdId,
      userId,
      req.params.id,
      authToken
    );
    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'SMS record not found.',
      });
    }
    const records = await readingService.getSmsRecords(householdId, userId, authToken);
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

// GET /api/v1/meters/alerts/dismissed?householdId=...&cycleStartDate=...
router.get('/alerts/dismissed', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const { billingDay } = await resolveHouseholdBillingConfig(householdId, userId, authToken);
    const activeCycleStart = getDhakaBillingCycleTiming(new Date(), billingDay).cycleStartDate;
    const cycleStartDate = String(req.query.cycleStartDate || activeCycleStart);

    const dismissedAlertKeys = await readingService.getDismissedSlabAlerts(
      householdId,
      cycleStartDate,
      authToken
    );

    return res.json({
      status: 'success',
      data: {
        householdId,
        cycleStartDate,
        dismissedAlertKeys,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to load dismissed slab alerts.',
    });
  }
});

// POST /api/v1/meters/alerts/dismiss
router.post('/alerts/dismiss', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = resolveHouseholdId(req);
    const userId = resolveUserId(req);
    const authToken = resolveAuthToken(req);
    const { billingDay } = await resolveHouseholdBillingConfig(householdId, userId, authToken);
    const activeCycleStart = getDhakaBillingCycleTiming(new Date(), billingDay).cycleStartDate;
    const cycleStartDate = String(req.body?.cycleStartDate || activeCycleStart);
    const alertKey = String(req.body?.alertKey || '').trim();

    const dismissedAlertKeys = await readingService.dismissSlabAlert(
      householdId,
      userId,
      cycleStartDate,
      alertKey,
      authToken
    );

    return res.status(201).json({
      status: 'success',
      data: {
        householdId,
        cycleStartDate,
        dismissedAlertKeys,
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
      message: err?.message || 'Failed to dismiss slab alert.',
    });
  }
});

export default router;
