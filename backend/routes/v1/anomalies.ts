/**
 * Express REST API Routes - Electrical Anomaly, Leakage & Wiring Diagnostics
 * 
 * Endpoints:
 * - GET  /api/v1/anomalies: List detected anomalies for household
 * - POST /api/v1/anomalies/evaluate: Evaluate telemetry reading against anomaly detector
 * - POST /api/v1/anomalies/:id/resolve: Mark specific anomaly as resolved
 * - POST /api/v1/anomalies/simulate: Trigger test anomaly injection
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { AnomalyDetector } from '../../../src/server/anomaly/detector';
import { AnomalyType } from '../../../src/server/anomaly/types';

const router = Router();
const detector = AnomalyDetector.getInstance();

// GET /api/v1/anomalies
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const anomalies = detector.getAnomalies(householdId);

    const activeCount = anomalies.filter(a => a.status === 'ACTIVE').length;
    const highSeverityCount = anomalies.filter(a => a.status === 'ACTIVE' && a.severity === 'HIGH').length;

    return res.json({
      status: 'success',
      data: {
        anomalies,
        summary: {
          total: anomalies.length,
          activeCount,
          highSeverityCount,
        },
      },
    });
  } catch (err: any) {
    console.error('[AnomaliesRoute] Error fetching anomalies:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch anomalies' });
  }
});

// POST /api/v1/anomalies/evaluate
router.post('/evaluate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, telemetry, context } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    if (!telemetry) {
      return res.status(400).json({ status: 'error', message: 'telemetry payload is required' });
    }

    const detected = await detector.evaluateReading(telemetry, {
      householdId: targetHhId,
      ...(context || {}),
    });

    return res.json({
      status: 'success',
      data: {
        detectedCount: detected.length,
        anomalies: detected,
      },
    });
  } catch (err: any) {
    console.error('[AnomaliesRoute] Error evaluating reading:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Evaluation failed' });
  }
});

// POST /api/v1/anomalies/:id/resolve
router.post('/:id/resolve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const anomalyId = req.params.id;
    const householdId = (req.body.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    const resolved = detector.markAsResolved(householdId, anomalyId);

    if (!resolved) {
      return res.status(404).json({ status: 'error', message: `Anomaly ${anomalyId} not found` });
    }

    return res.json({
      status: 'success',
      message: 'Anomaly marked as resolved.',
      messageBn: 'ত্রুটি সফলভাবে সমাধান হিসেবে চিহ্নিত করা হয়েছে।',
      data: resolved,
    });
  } catch (err: any) {
    console.error('[AnomaliesRoute] Error resolving anomaly:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to resolve anomaly' });
  }
});

// POST /api/v1/anomalies/simulate
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, type } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const anomalyType: AnomalyType = type || 'POWER_DRAW_ALL_OFF';

    const simulated = await detector.simulateAnomaly(targetHhId, anomalyType);

    return res.json({
      status: 'success',
      message: `Simulated anomaly (${anomalyType}) generated successfully.`,
      data: simulated,
    });
  } catch (err: any) {
    console.error('[AnomaliesRoute] Error simulating anomaly:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Simulation failed' });
  }
});

export default router;
