/**
 * Express REST API Routes - Unified Alerts Subsystem
 * 
 * Endpoints:
 * - GET  /api/v1/alerts: Fetch recent alerts feed
 * - GET  /api/v1/alerts/preferences: Fetch alert preferences and quiet hours
 * - PUT  /api/v1/alerts/preferences: Update alert preferences and quiet hours
 * - POST /api/v1/alerts/evaluate: Run AlertEngine deterministic evaluation
 * - POST /api/v1/alerts/test: Trigger simulated test alert across channels
 * - PUT  /api/v1/alerts/:id/acknowledge: Acknowledge alert
 * - PUT  /api/v1/alerts/:id/dismiss: Dismiss alert
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { AlertEngine } from '../../../src/server/alerts/AlertEngine';
import { AlertPreferencesStore } from '../../../src/server/alerts/AlertPreferencesStore';
import { AlertHistoryStore } from '../../../src/server/alerts/AlertHistoryStore';

const router = Router();
const engine = AlertEngine.getInstance();
const prefStore = AlertPreferencesStore.getInstance();
const historyStore = AlertHistoryStore.getInstance();

// GET /api/v1/alerts?householdId=...&includeDismissed=...
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
  const includeDismissed = req.query.includeDismissed === 'true';

  const alerts = historyStore.getAlerts(householdId, includeDismissed);
  return res.json({
    status: 'success',
    data: {
      householdId,
      totalCount: alerts.length,
      alerts,
    },
  });
});

// GET /api/v1/alerts/preferences?householdId=...
router.get('/preferences', (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
  const preferences = prefStore.getPreferences(householdId);

  return res.json({
    status: 'success',
    data: preferences,
  });
});

// PUT /api/v1/alerts/preferences
router.put('/preferences', (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.body.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
  const updates = req.body;

  const updated = prefStore.updatePreferences(householdId, updates);
  return res.json({
    status: 'success',
    message: 'Alert preferences and quiet hours saved.',
    data: updated,
  });
});

// POST /api/v1/alerts/evaluate
router.post('/evaluate', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.body.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';

  try {
    const evalResult = await engine.evaluateHousehold(householdId);
    return res.json({
      status: 'success',
      data: evalResult,
    });
  } catch (err: any) {
    console.error('Error running alert evaluation:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Error evaluating alert rules.',
    });
  }
});

// POST /api/v1/alerts/test
router.post('/test', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.body.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
  const requestedChannels = req.body.channels || ['EMAIL', 'WEB_PUSH'];

  const alert = historyStore.createTestAlert(householdId, requestedChannels);
  const prefs = prefStore.getPreferences(householdId);
  const dispatcher = new (await import('../../../src/server/alerts/channels/channelDispatcher')).ChannelDispatcher();
  const delivery = await dispatcher.dispatch(alert, prefs);

  return res.json({
    status: 'success',
    message: 'Test alert generated and dispatched through selected channels.',
    data: {
      alert,
      deliveries: delivery.deliveries,
      quietHoursSuppressed: delivery.quietHoursSuppressed,
    },
  });
});

// PUT /api/v1/alerts/:id/acknowledge
router.put('/:id/acknowledge', (req: AuthenticatedRequest, res: Response) => {
  const alertId = req.params.id;
  const alert = historyStore.acknowledgeAlert(alertId);

  if (!alert) {
    return res.status(404).json({ status: 'error', message: 'Alert not found' });
  }

  return res.json({
    status: 'success',
    message: 'Alert acknowledged.',
    data: alert,
  });
});

// PUT /api/v1/alerts/:id/dismiss
router.put('/:id/dismiss', (req: AuthenticatedRequest, res: Response) => {
  const alertId = req.params.id;
  const alert = historyStore.dismissAlert(alertId);

  if (!alert) {
    return res.status(404).json({ status: 'error', message: 'Alert not found' });
  }

  return res.json({
    status: 'success',
    message: 'Alert dismissed.',
    data: alert,
  });
});

export default router;
