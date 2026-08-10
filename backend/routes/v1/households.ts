import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

function isHouseholdAuthorized(req: AuthenticatedRequest, householdId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN') return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  // Standard demo household fallback for preview user
  if (householdId === '11111111-1111-4111-a111-111111111111') return true;
  return false;
}

// GET /api/v1/my-households & /api/v1/households/my-households
router.get('/my-households', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({ status: 'success', data: households });
});

// GET /api/v1/households - Get authorized user households only
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({ status: 'success', data: households });
});

// GET /api/v1/households/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: You do not have permission to access this household.',
    });
  }

  const household = await db.getHouseholdById(id);
  if (!household) {
    return res.status(404).json({ status: 'error', message: 'Household not found' });
  }
  res.json({ status: 'success', data: household });
});

// POST /api/v1/households
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const newHousehold = await db.createHousehold({
    userId: req.user.id,
    name: req.body.name || 'New Bangladesh Household',
    utilityProvider: req.body.utilityProvider || 'DESCO',
    accountNumber: req.body.accountNumber || 'DESCO-0001',
    sanctionedLoadKw: req.body.sanctionedLoadKw || 3.0,
    monthlyBudgetBDT: req.body.monthlyBudgetBDT || 3500,
    address: req.body.address || { division: 'Dhaka', city: 'Dhaka', area: 'Dhanmondi' },
  });
  res.status(201).json({ status: 'success', data: newHousehold });
});

// GET /api/v1/households/:id/rooms
router.get('/:id/rooms', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const rooms = await db.getRooms(id);
  res.json({ status: 'success', data: rooms });
});

// POST /api/v1/households/:id/rooms
router.post('/:id/rooms', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const room = await db.createRoom({
    householdId: id,
    name: req.body.name,
    floorLevel: req.body.floorLevel || 1,
    icon: req.body.icon || 'home',
  });
  res.status(201).json({ status: 'success', data: room });
});

// GET /api/v1/households/:id/appliances
router.get('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const appliances = await db.getAppliances(id);
  res.json({ status: 'success', data: appliances });
});

// POST /api/v1/households/:id/appliances
router.post('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const appliance = await db.createAppliance({
    householdId: id,
    roomId: req.body.roomId,
    name: req.body.name,
    category: req.body.category || 'OTHER',
    ratedPowerW: Number(req.body.ratedPowerW) || 100,
    standbyPowerW: Number(req.body.standbyPowerW) || 5,
    averageHoursPerDay: Number(req.body.averageHoursPerDay) || 6,
    isInverterType: Boolean(req.body.isInverterType),
    isVampireRisk: Boolean(req.body.isVampireRisk),
    purchasePriceBDT: Number(req.body.purchasePriceBDT) || 0,
  });
  res.status(201).json({ status: 'success', data: appliance });
});

export default router;
