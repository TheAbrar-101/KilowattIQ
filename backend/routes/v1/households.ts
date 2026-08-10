import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/households - Get user households (isolation enforced per user)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_dhaka_01';
  const households = await db.getHouseholds(userId);
  res.json({ status: 'success', data: households });
});

// GET /api/v1/households/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const household = await db.getHouseholdById(req.params.id);
  if (!household) {
    return res.status(404).json({ status: 'error', message: 'Household not found' });
  }
  res.json({ status: 'success', data: household });
});

// POST /api/v1/households
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || 'usr_dhaka_01';
  const newHousehold = await db.createHousehold({
    userId,
    name: req.body.name || 'New Residence',
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
  const rooms = await db.getRooms(req.params.id);
  res.json({ status: 'success', data: rooms });
});

// POST /api/v1/households/:id/rooms
router.post('/:id/rooms', async (req: AuthenticatedRequest, res: Response) => {
  const room = await db.createRoom({
    householdId: req.params.id,
    name: req.body.name,
    floorLevel: req.body.floorLevel || 1,
    icon: req.body.icon || 'home',
  });
  res.status(201).json({ status: 'success', data: room });
});

// GET /api/v1/households/:id/appliances
router.get('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const appliances = await db.getAppliances(req.params.id);
  res.json({ status: 'success', data: appliances });
});

// POST /api/v1/households/:id/appliances
router.post('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const appliance = await db.createAppliance({
    householdId: req.params.id,
    roomId: req.body.roomId,
    name: req.body.name,
    category: req.body.category || 'OTHER',
    ratedPowerW: Number(req.body.ratedPowerW) || 100,
    standbyPowerW: Number(req.body.standbyPowerW) || 5,
    averageHoursPerDay: Number(req.body.averageHoursPerDay) || 6,
    isInverterType: Boolean(req.body.isInverterType),
    isVampireRisk: Boolean(req.body.isVampireRisk),
  });
  res.status(201).json({ status: 'success', data: appliance });
});

export default router;
