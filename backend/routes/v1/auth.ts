import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

const router = Router();

router.post('/login', (req: AuthenticatedRequest, res: Response) => {
  const { email, password } = req.body;
  // Supabase Auth simulation / interface
  const isDemoAdmin = email === 'admin@kilowattiq.bd';
  res.json({
    status: 'success',
    data: {
      token: isDemoAdmin ? 'admin-jwt-token' : 'demo-jwt-token',
      user: {
        id: isDemoAdmin ? 'usr_admin' : 'usr_dhaka_01',
        email: email || 'demo@kilowattiq.bd',
        fullName: isDemoAdmin ? 'System Administrator' : 'Tanvir Hossain',
        role: isDemoAdmin ? 'ADMIN' : 'CONSUMER',
      },
    },
  });
});

router.post('/register', (req: AuthenticatedRequest, res: Response) => {
  const { email, fullName } = req.body;
  res.json({
    status: 'success',
    data: {
      token: 'demo-jwt-token',
      user: {
        id: `usr_${Date.now()}`,
        email: email || 'newuser@kilowattiq.bd',
        fullName: fullName || 'New Bangladeshi Household User',
        role: 'CONSUMER',
      },
    },
  });
});

router.get('/profile', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    status: 'success',
    data: req.user,
  });
});

export default router;
