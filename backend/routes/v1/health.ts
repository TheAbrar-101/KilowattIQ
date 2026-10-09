/**
 * Express REST API Routes - Appliance Health Degradation Subsystem
 * 
 * Endpoints:
 * - GET  /api/v1/health/appliances: Retrieve health scores & degradation findings for household
 * - POST /api/v1/health/diagnose: Run ad-hoc degradation analysis on appliance signals
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { DegradationDetector } from '../../../src/server/health/degradationDetector';

const router = Router();
const supabaseService = SupabaseService.getInstance();
const detector = DegradationDetector.getInstance();

// GET /api/v1/health/appliances
router.get('/appliances', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const appliances = await supabaseService.getAppliances(householdId);

    const reports = detector.evaluateHousehold(appliances);

    // Summary counts
    const criticalCount = reports.filter(r => r.status === 'REPLACE_RECOMMENDED').length;
    const warningCount = reports.filter(r => r.status === 'NEEDS_SERVICE').length;
    const healthyCount = reports.filter(r => r.status === 'HEALTHY').length;

    return res.json({
      status: 'success',
      data: {
        reports,
        summary: {
          total: reports.length,
          criticalCount,
          warningCount,
          healthyCount,
          averageHealthScore: Math.round(reports.reduce((acc, r) => acc + r.healthScore, 0) / (reports.length || 1)),
        },
      },
    });
  } catch (err: any) {
    console.error('[HealthRoute] Error fetching appliance health:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch appliance health' });
  }
});

// POST /api/v1/health/diagnose
router.post('/diagnose', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { appliance, signals } = req.body;
    if (!appliance) {
      return res.status(400).json({ status: 'error', message: 'Appliance object is required' });
    }

    const report = detector.evaluateApplianceHealth(appliance, signals);
    return res.json({
      status: 'success',
      data: report,
    });
  } catch (err: any) {
    console.error('[HealthRoute] Error diagnosing appliance:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to diagnose appliance' });
  }
});

export default router;
