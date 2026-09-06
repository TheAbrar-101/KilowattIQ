import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { TariffCalculator } from '../../engine/TariffCalculator';
import { BudgetEngine } from '../../engine/BudgetEngine';
import { VampirePowerEngine } from '../../engine/VampirePowerEngine';
import { ROICalculator } from '../../engine/ROICalculator';
import { TariffType } from '../../../shared/types/energy';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/analytics/cost?householdId=...&tariffType=SLAB&kwh=...
router.get('/cost', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const household = await db.getHouseholdById(householdId);
  const kwh = Number(req.query.kwh) || 285;
  const tariffType = ((req.query.tariffType as string)?.toUpperCase() as TariffType) || 'SLAB';

  const sanctionedLoad = household?.sanctionedLoadKw || 4.5;
  const cost = TariffCalculator.calculateCost(kwh, sanctionedLoad, tariffType);

  res.json({ status: 'success', data: cost });
});

// GET /api/v1/analytics/budget?householdId=...
router.get('/budget', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const household = await db.getHouseholdById(householdId);
  const currentKwh = Number(req.query.currentKwh) || 210;
  const daysPassed = Number(req.query.daysPassed) || 18;

  const budgetBDT = household?.monthlyBudgetBDT || 4500;
  const loadKw = household?.sanctionedLoadKw || 4.5;

  const status = BudgetEngine.evaluateBudget(
    householdId,
    budgetBDT,
    currentKwh,
    daysPassed,
    30,
    loadKw,
    'SLAB'
  );

  res.json({ status: 'success', data: status });
});

// GET /api/v1/analytics/vampire-power?householdId=...
router.get('/vampire-power', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const rooms = await db.getRooms(householdId);
  const appliances = await db.getAppliances(householdId);

  const report = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
  res.json({ status: 'success', data: report });
});

// POST /api/v1/analytics/roi
router.post('/roi', (req: AuthenticatedRequest, res: Response) => {
  const {
    currentApplianceName,
    proposedApplianceName,
    currentWatts,
    proposedWatts,
    usageHoursPerDay,
    initialInvestmentBDT,
    electricityRateBDT,
  } = req.body;

  const result = ROICalculator.calculateUpgradeROI(
    currentApplianceName || 'Non-Inverter AC 1.5 Ton',
    proposedApplianceName || '5-Star Inverter AC 1.5 Ton',
    Number(currentWatts) || 1650,
    Number(proposedWatts) || 1050,
    Number(usageHoursPerDay) || 7,
    Number(initialInvestmentBDT) || 62000,
    Number(electricityRateBDT) || 8.02
  );

  res.json({ status: 'success', data: result });
});

// GET /api/v1/analytics/monthly-trend?householdId=...
router.get('/monthly-trend', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const household = await db.getHouseholdById(householdId);
  const budgetBDT = household?.monthlyBudgetBDT || 4500;
  const loadKw = household?.sanctionedLoadKw || 3.0;

  const months = ['Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026'];
  const baseKwh = [240, 265, 310, 325, 295, 285];

  const trend = months.map((month, idx) => {
    const kwh = baseKwh[idx];
    const cost = TariffCalculator.calculateCost(kwh, loadKw, 'SLAB');

    return {
      month,
      consumptionKwh: kwh,
      costBDT: cost.grossTotalBDT,
      budgetBDT,
      effectiveRateBDT: cost.effectiveRatePerKwh,
      isOverBudget: cost.grossTotalBDT > budgetBDT,
    };
  });

  res.json({
    status: 'success',
    data: {
      householdId,
      sanctionedLoadKw: loadKw,
      monthlyBudgetBDT: budgetBDT,
      trend,
    },
  });
});

export default router;
