import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { RecommendationEngine } from '../../engine/RecommendationEngine';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/recommendations?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
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

// PUT /api/v1/recommendations/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const success = await db.updateSuggestionStatus(req.params.id, status || 'resolved');
  res.json({ status: success ? 'success' : 'error', message: `Recommendation marked as ${status}` });
});

export default router;
