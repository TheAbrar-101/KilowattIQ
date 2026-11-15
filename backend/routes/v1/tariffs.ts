import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { RedisCacheService } from '../../../src/server/cache/redis';
import {
  getTariffVersionForBillingPeriod,
  DEFAULT_TARIFF_FIXED_CHARGES,
} from '../../../shared/constants/bdTariffs';
import { TariffVersion } from '../../../shared/types/energy';

const router = Router();
const db = SupabaseService.getInstance();
const redis = RedisCacheService.getInstance();

function isAdminUser(req: AuthenticatedRequest): boolean {
  const role = (req.user?.role || '').toUpperCase();
  const hhRole = (req.user?.householdRole || '').toLowerCase();
  return role === 'ADMIN' || hhRole === 'admin';
}

// GET /api/v1/tariffs?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const tariffType = (req.query.tariffType as string) || 'SLAB';

  // Check Redis cache first
  const cached = await redis.getTariffSlabs(tariffType);
  if (cached && !req.query.no_cache) {
    return res.json({ status: 'success', source: 'REDIS_CACHE', data: cached });
  }

  const tariffData = await db.getTariffs(householdId, req.query.billingPeriod as string | undefined);

  // Cache tariff slabs in Redis (24-hour TTL)
  await redis.setTariffSlabs(tariffType, tariffData);

  res.json({ status: 'success', source: tariffData?.using_fallback ? 'BUILTIN_FALLBACK' : 'DATABASE', data: tariffData });
});

// GET /api/v1/tariffs/versions?billingPeriod=YYYY-MM-DD
router.get('/versions', async (req: AuthenticatedRequest, res: Response) => {
  const billingPeriod = req.query.billingPeriod as string | undefined;
  const { versions, usingFallback, source } = await db.getTariffVersionsFromDb();
  const activeVersion = getTariffVersionForBillingPeriod(billingPeriod);

  res.json({
    status: 'success',
    source,
    data: {
      versions,
      activeVersion,
      usingFallback,
      fallbackNotice: usingFallback ? 'Using built-in tariff data' : null,
    },
  });
});

// POST /api/v1/tariffs/versions (Admin add or edit tariff version)
router.post('/versions', async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: Only Admin users can create or edit tariff versions.',
    });
  }

  const body = req.body || {};
  const {
    version_id,
    effective_from,
    source_note,
    last_verified_date,
    slabs,
    demandChargePerKw,
    meterRent,
    vatPercent,
    charges_verified,
    flatRatePerKwh,
    touRates,
    seasonalMultipliers,
  } = body;

  if (!version_id || typeof version_id !== 'string' || !version_id.trim()) {
    return res.status(400).json({ status: 'error', message: 'version_id is required.' });
  }
  if (!effective_from || !/^\d{4}-\d{2}-\d{2}/.test(String(effective_from))) {
    return res.status(400).json({ status: 'error', message: 'effective_from (YYYY-MM-DD) is required.' });
  }
  if (!Array.isArray(slabs) || slabs.length === 0) {
    return res.status(400).json({ status: 'error', message: 'slabs[] must be a non-empty array.' });
  }

  for (const s of slabs) {
    if (typeof s.minKwh !== 'number' || typeof s.ratePerKwh !== 'number' || !s.stepName) {
      return res.status(400).json({
        status: 'error',
        message: 'Each slab requires numeric minKwh, ratePerKwh, and string stepName.',
      });
    }
  }

  const parsedVerifiedDate =
    last_verified_date === null || last_verified_date === undefined || String(last_verified_date).trim() === ''
      ? null
      : String(last_verified_date).trim().slice(0, 10);

  const newVersion: TariffVersion = {
    version_id: version_id.trim(),
    effective_from: String(effective_from).slice(0, 10),
    source_note: typeof source_note === 'string' && source_note.trim()
      ? source_note.trim()
      : 'Admin custom BERC tariff entry',
    last_verified_date: parsedVerifiedDate,
    demandChargePerKw: typeof demandChargePerKw === 'number'
      ? demandChargePerKw
      : DEFAULT_TARIFF_FIXED_CHARGES.demandChargePerKw,
    meterRent: typeof meterRent === 'number'
      ? meterRent
      : DEFAULT_TARIFF_FIXED_CHARGES.meterRent,
    vatPercent: typeof vatPercent === 'number'
      ? vatPercent
      : DEFAULT_TARIFF_FIXED_CHARGES.vatPercent,
    charges_verified: Boolean(charges_verified),
    flatRatePerKwh: typeof flatRatePerKwh === 'number' ? flatRatePerKwh : undefined,
    touRates,
    seasonalMultipliers,
    slabs: slabs.map((s: any, idx: number) => ({
      step: typeof s.step === 'number' ? s.step : idx,
      minKwh: Number(s.minKwh),
      maxKwh: s.maxKwh === null || s.maxKwh === '' || s.maxKwh === undefined ? null : Number(s.maxKwh),
      ratePerKwh: Number(s.ratePerKwh),
      stepName: String(s.stepName),
      isLifeline: Boolean(s.isLifeline),
    })),
  };

  const updatedBy = req.user?.email || req.user?.id || 'admin';
  const dbResult = await db.upsertTariffVersionInDb(newVersion, updatedBy);

  if (!dbResult.ok) {
    return res.status(503).json({
      status: 'error',
      usingFallback: true,
      fallbackNotice: 'Using built-in tariff data',
      message: dbResult.error || 'Database unavailable: using built-in read-only tariff data.',
    });
  }

  await redis.invalidateTariffCache();

  res.json({
    status: 'success',
    message: `Tariff version ${newVersion.version_id} saved to database (effective ${newVersion.effective_from}).`,
    data: {
      version: dbResult.version,
      versions: dbResult.versions,
      usingFallback: false,
      fallbackNotice: null,
    },
  });
});

// PUT /api/v1/tariffs/versions/:versionId (Admin edit existing version)
router.put('/versions/:versionId', async (req: AuthenticatedRequest, res: Response) => {
  if (!isAdminUser(req)) {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: Only Admin users can edit tariff versions.',
    });
  }

  const versionId = req.params.versionId;
  const { versions: currentVersions, usingFallback } = await db.getTariffVersionsFromDb();

  if (usingFallback) {
    return res.status(503).json({
      status: 'error',
      usingFallback: true,
      fallbackNotice: 'Using built-in tariff data',
      message: 'Database unavailable: using built-in read-only tariff data. Connect Supabase to save changes.',
    });
  }

  const existing = currentVersions.find(v => v.version_id === versionId);
  if (!existing) {
    return res.status(404).json({ status: 'error', message: `Tariff version ${versionId} not found.` });
  }

  const body = req.body || {};
  const hasExplicitVerifiedDate = Object.prototype.hasOwnProperty.call(body, 'last_verified_date');
  const nextVerifiedDate = hasExplicitVerifiedDate
    ? (body.last_verified_date === null || body.last_verified_date === ''
      ? null
      : String(body.last_verified_date).slice(0, 10))
    : existing.last_verified_date;

  const merged: TariffVersion = {
    ...existing,
    ...body,
    version_id: existing.version_id,
    effective_from: body.effective_from ? String(body.effective_from).slice(0, 10) : existing.effective_from,
    last_verified_date: nextVerifiedDate,
    charges_verified: typeof body.charges_verified === 'boolean' ? body.charges_verified : Boolean(existing.charges_verified),
    slabs: Array.isArray(body.slabs) ? body.slabs : existing.slabs,
  };

  const updatedBy = req.user?.email || req.user?.id || 'admin';
  const dbResult = await db.upsertTariffVersionInDb(merged, updatedBy);

  if (!dbResult.ok) {
    return res.status(503).json({
      status: 'error',
      usingFallback: true,
      fallbackNotice: 'Using built-in tariff data',
      message: dbResult.error || 'Database unavailable: could not save tariff version.',
    });
  }

  await redis.invalidateTariffCache();

  res.json({
    status: 'success',
    message: `Tariff version ${versionId} updated in database.`,
    data: {
      version: dbResult.version,
      versions: dbResult.versions,
      usingFallback: false,
      fallbackNotice: null,
    },
  });
});

// POST /api/v1/tariffs/update (or tariff change event)
router.post('/update', async (req: AuthenticatedRequest, res: Response) => {
  const { tariffType = 'SLAB' } = req.body || {};

  // Invalidate Redis tariff cache on tariff rate/slab changes
  await redis.invalidateTariffCache();

  res.json({
    status: 'success',
    message: `Tariff configuration updated and Redis cache invalidated for ${tariffType}`,
  });
});

export default router;
