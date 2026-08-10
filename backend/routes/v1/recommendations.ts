import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { RecommendationEngine } from '../../engine/RecommendationEngine';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/recommendations?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const appliances = await db.getAppliances(householdId);

  const recommendations = RecommendationEngine.generateRecommendations(
    appliances,
    285,
    'Step 3 (201 - 300 kWh)'
  );

  res.json({ status: 'success', data: recommendations });
});

export default router;
