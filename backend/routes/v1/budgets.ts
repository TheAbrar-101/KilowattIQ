import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/budgets?householdId=...
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const budgetData = await db.getBudgets(householdId);
  res.json({ status: 'success', data: budgetData });
});

export default router;
