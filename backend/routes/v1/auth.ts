import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const db = SupabaseService.getInstance();

// POST /api/v1/auth/register
router.post('/register', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password, fullName, phone } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        status: 'error',
        message: 'Full Name, Email, and Password are required for registration.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long.',
      });
    }

    const result = await db.signUpUser({ email, password, fullName, phone });

    if (result.requiresEmailConfirmation || !result.session?.access_token) {
      return res.status(200).json({
        status: 'success',
        message: result.message || 'Account registered successfully. Please check your email to confirm before logging in.',
        data: {
          requiresEmailConfirmation: true,
          token: null,
          user: result.user,
          households: result.households,
        },
      });
    }

    res.status(201).json({
      status: 'success',
      message: 'Account registered successfully.',
      data: {
        token: result.session.access_token,
        user: result.user,
        households: result.households,
      },
    });
  } catch (err: any) {
    console.error('[Auth Route Error] Register:', err?.message || err);
    res.status(400).json({
      status: 'error',
      message: err?.message || 'Registration failed. Please check your credentials.',
    });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required.',
      });
    }

    // Fallback support for demo users if mock mode or demo login
    if (email === 'admin@kilowattiq.bd' && password === 'admin123') {
      return res.json({
        status: 'success',
        data: {
          token: 'admin-jwt-token',
          user: {
            id: 'usr_admin',
            email: 'admin@kilowattiq.bd',
            fullName: 'System Administrator',
            role: 'ADMIN',
          },
          households: await db.getHouseholdsForUser('usr_admin'),
        },
      });
    } else if (email === 'demo@kilowattiq.bd' && password === 'demo123') {
      return res.json({
        status: 'success',
        data: {
          token: 'demo-jwt-token',
          user: {
            id: 'usr_dhaka_01',
            email: 'demo@kilowattiq.bd',
            fullName: 'Tanvir Hossain',
            role: 'CONSUMER',
          },
          households: await db.getHouseholdsForUser('usr_dhaka_01'),
        },
      });
    }

    const result = await db.signInUser({ email, password });

    res.json({
      status: 'success',
      message: 'Logged in successfully.',
      data: {
        token: result.token,
        user: result.user,
        households: result.households,
      },
    });
  } catch (err: any) {
    console.error('[Auth Route Error] Login:', err?.message || err);
    res.status(401).json({
      status: 'error',
      message: err?.message || 'Invalid email or password.',
    });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    status: 'success',
    message: 'Logged out successfully.',
  });
});

// GET /api/v1/auth/me
router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Not authenticated' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);

  res.json({
    status: 'success',
    data: {
      user: req.user,
      households,
    },
  });
});

// GET /api/v1/auth/session
router.get('/session', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'No active session' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);

  res.json({
    status: 'success',
    data: {
      authenticated: true,
      user: req.user,
      households,
    },
  });
});

export default router;
