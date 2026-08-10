import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/profile
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  const profile = await db.getProfile(req.user.id);
  res.json({
    status: 'success',
    data: profile || {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.fullName,
      phone: req.user.phone,
      role: req.user.role,
    },
  });
});

// PUT /api/v1/profile
router.put('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    const { fullName, phone, role } = req.body;
    const updated = await db.updateProfile(req.user.id, { fullName, phone, role });
    res.json({
      status: 'success',
      message: 'Profile updated successfully.',
      data: updated,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err?.message || 'Failed to update profile.',
    });
  }
});

export default router;
