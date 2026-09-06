import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { RecommendationEngine } from '../../engine/RecommendationEngine';
import { GeminiAdvisorService } from '../../services/GeminiAdvisorService';
import { TariffCalculator } from '../../engine/TariffCalculator';
import { BudgetEngine } from '../../engine/BudgetEngine';
import { VampirePowerEngine } from '../../engine/VampirePowerEngine';

const router = Router();
const db = SupabaseService.getInstance();

function isHouseholdAuthorized(req: AuthenticatedRequest, householdId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN') return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  if (householdId === '11111111-1111-4111-a111-111111111111' || householdId === 'hh_gulshan_01') return true;
  return false;
}

// GET /api/v1/recommendations?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || '11111111-1111-4111-a111-111111111111';
  const dbSuggestions = await db.getSuggestions(householdId);

  if (dbSuggestions && dbSuggestions.length > 0) {
    const formatted = dbSuggestions.map(s => ({
      id: s.id,
      householdId: s.householdId,
      title: s.title,
      type: s.type as any,
      severity: s.severity as any,
      status: s.status as any,
      description: s.description,
      estimatedMonthlySavingsBDT: s.estimatedMonthlySavingsBDT,
      paybackPeriodMonths: s.type === 'roi' ? 22 : undefined,
      actionableStep: s.actionableStep,
    }));
    return res.json({ status: 'success', data: formatted });
  }

  // Fallback to engine calculation if no records in database
  const appliances = await db.getAppliances(householdId);
  const recommendations = RecommendationEngine.generateRecommendations(
    appliances,
    285,
    'Step 3 (201 - 300 kWh)'
  );

  res.json({ status: 'success', data: recommendations });
});

// POST /api/v1/recommendations/ai-advisor
router.post('/ai-advisor', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required. Please log in.' });
  }

  const { householdId = '11111111-1111-4111-a111-111111111111', language = 'en' } = req.body || {};

  if (!isHouseholdAuthorized(req, householdId)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household data.' });
  }

  const lang: 'en' | 'bn' = language === 'bn' ? 'bn' : 'en';

  try {
    const household = await db.getHouseholdById(householdId);
    const appliances = await db.getAppliances(householdId);
    const rooms = await db.getRooms(householdId);

    // Calculate current load
    let currentActiveWatts = 0;
    for (const app of appliances) {
      if (db.isApplianceOn(app.id)) {
        currentActiveWatts += app.ratedPowerW;
      }
    }

    const estimatedMonthlyKwh = 285;
    const sanctionedLoadKw = household?.sanctionedLoadKw || 3.0;
    const monthlyBudgetBDT = household?.monthlyBudgetBDT || 4500;

    // Run deterministic engines
    const deterministicRecommendations = RecommendationEngine.generateRecommendations(
      appliances,
      estimatedMonthlyKwh,
      'Step 3 (201 - 300 kWh)'
    );

    const tariffCost = TariffCalculator.calculateCost(estimatedMonthlyKwh, sanctionedLoadKw);
    const budgetStatus = BudgetEngine.evaluateBudget(
      householdId,
      monthlyBudgetBDT,
      estimatedMonthlyKwh,
      15,
      30,
      sanctionedLoadKw
    );

    const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
    const totalVampireBDT = vampireReports.reduce((acc, v) => acc + v.monthlyWastedBDT, 0);

    // Invoke Gemini AI Advisor with deterministic metrics
    const aiResult = await GeminiAdvisorService.generateAdvisory({
      householdName: household?.name || 'Gulshan Residence',
      sanctionedLoadKw,
      currentActiveWatts,
      monthlyKwh: budgetStatus.projectedKwh,
      projectedBillBDT: budgetStatus.projectedCostBDT,
      monthlyBudgetBDT,
      overagePercentage: budgetStatus.overagePercentage,
      tariffSlabName: tariffCost.slabBreakdown?.[2]?.stepName || 'Step 3 (201 - 300 kWh)',
      vampirePowerBDT: totalVampireBDT,
      topAppliances: appliances.slice(0, 5).map(a => ({
        name: a.name,
        powerW: a.ratedPowerW,
        isOn: db.isApplianceOn(a.id),
      })),
      deterministicRecommendations,
      language: lang,
    });

    res.json({
      status: 'success',
      data: {
        available: aiResult.available,
        aiAdvice: aiResult.aiAdvice,
        fallbackReason: aiResult.fallbackReason,
        sourceMetrics: {
          currentLoadW: currentActiveWatts,
          projectedBillBDT: budgetStatus.projectedCostBDT,
          monthlyBudgetBDT,
          vampireWasteBDT: totalVampireBDT,
          sanctionedLoadKw,
          tariffSlabName: 'Step 3 (201 - 300 kWh)',
        },
        deterministicRecommendations,
      },
    });
  } catch (err: any) {
    console.error('Error in AI advisor endpoint:', err);
    res.status(500).json({ status: 'error', message: 'Internal server error processing AI advisor.' });
  }
});

// PUT /api/v1/recommendations/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const success = await db.updateSuggestionStatus(req.params.id, status || 'resolved');
  res.json({ status: success ? 'success' : 'error', message: `Recommendation marked as ${status}` });
});

export default router;

