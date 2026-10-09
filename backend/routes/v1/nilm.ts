/**
 * Express REST API Routes - NILM (Non-Intrusive Load Monitoring) Subsystem
 * 
 * Endpoints:
 * - GET  /api/v1/nilm/discovered: List discovered appliances for household
 * - POST /api/v1/nilm/confirm: Confirm discovered appliance into official inventory
 * - POST /api/v1/nilm/rename: Rename discovered appliance
 * - POST /api/v1/nilm/merge: Merge discovered detection with an existing registered appliance
 * - POST /api/v1/nilm/simulate: Trigger 1 Hz telemetry burst with distinct step change
 * - GET  /api/v1/nilm/events: List recent transient step change events
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { NilmDisaggregator } from '../../../src/server/nilm/disaggregator';

const router = Router();
const disaggregator = NilmDisaggregator.getInstance();

// GET /api/v1/nilm/discovered
router.get('/discovered', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const discovered = disaggregator.getDiscoveredAppliances(householdId);
    return res.json({
      status: 'success',
      data: discovered,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error fetching discovered appliances:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch discovered appliances' });
  }
});

// POST /api/v1/nilm/confirm
router.post('/confirm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, discoveryId, roomId, customName } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    if (!discoveryId) {
      return res.status(400).json({ status: 'error', message: 'discoveryId is required' });
    }

    const result = await disaggregator.confirmAppliance(targetHhId, discoveryId, roomId, customName);
    return res.json({
      status: 'success',
      message: 'Appliance successfully confirmed into household inventory.',
      data: result,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error confirming appliance:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to confirm appliance' });
  }
});

// POST /api/v1/nilm/rename
router.post('/rename', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, discoveryId, newName } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    if (!discoveryId || !newName) {
      return res.status(400).json({ status: 'error', message: 'discoveryId and newName are required' });
    }

    const updated = disaggregator.renameAppliance(targetHhId, discoveryId, newName);
    return res.json({
      status: 'success',
      message: 'Appliance successfully renamed.',
      data: updated,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error renaming appliance:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to rename appliance' });
  }
});

// POST /api/v1/nilm/merge
router.post('/merge', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, discoveryId, targetApplianceId } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    if (!discoveryId || !targetApplianceId) {
      return res.status(400).json({ status: 'error', message: 'discoveryId and targetApplianceId are required' });
    }

    const merged = await disaggregator.mergeAppliance(targetHhId, discoveryId, targetApplianceId);
    return res.json({
      status: 'success',
      message: 'Appliance successfully merged with existing registered appliance.',
      data: merged,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error merging appliance:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to merge appliance' });
  }
});

// POST /api/v1/nilm/simulate
router.post('/simulate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, scenario } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';

    const result = await disaggregator.simulateBurst(targetHhId, scenario || 'ac_on');
    return res.json({
      status: 'success',
      message: `Simulation burst executed for scenario: ${scenario || 'ac_on'}.`,
      data: result,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error simulating step:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to simulate step' });
  }
});

// GET /api/v1/nilm/events
router.get('/events', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const events = disaggregator.getRecentSteps();
    return res.json({
      status: 'success',
      data: events,
    });
  } catch (err: any) {
    console.error('[NilmRoute] Error fetching steps:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch step events' });
  }
});

export default router;
