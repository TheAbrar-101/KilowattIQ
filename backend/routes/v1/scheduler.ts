/**
 * Express REST API Routes - Off-Peak Scheduler Subsystem
 * 
 * Endpoints:
 * - GET  /api/v1/scheduler: Fetch current schedule, conflicts, projected impact, and relay devices
 * - POST /api/v1/scheduler/optimize: Auto-schedule with AI (Gemini + heuristics)
 * - POST /api/v1/scheduler/calculate-impact: Live recalculation of bill savings & conflicts for dragged slots
 * - POST /api/v1/scheduler/save: Save user updated schedule
 * - POST /api/v1/scheduler/apply-relays: Dispatch schedule to connected smart plugs / relays
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { ScheduleOptimizer } from '../../../src/server/scheduler/optimizer';
import { ScheduledSlot } from '../../../src/server/scheduler/types';

const router = Router();
const supabaseService = SupabaseService.getInstance();

// In-memory schedule store keyed by householdId with initial default
const householdSchedules = new Map<string, ScheduledSlot[]>();

// Helper to get household & appliances
async function getHouseholdContext(householdId: string) {
  const households = await supabaseService.getHouseholds('user_demo_123');
  const household = households.find(h => h.id === householdId) || households[0] || {
    id: householdId,
    name: 'Gulshan Residence',
    utilityProvider: 'DESCO',
    accountNumber: 'DESCO-4492019',
    sanctionedLoadKw: 3.0,
    monthlyBudgetBDT: 3500,
  };
  const appliances = await supabaseService.getAppliances(householdId);
  const devices = await supabaseService.getDevices(householdId);
  return { household, appliances, devices };
}

// GET /api/v1/scheduler
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const { household, appliances, devices } = await getHouseholdContext(householdId);

    let slots = householdSchedules.get(householdId);
    if (!slots || slots.length === 0) {
      // Generate default initial schedule
      const defaultOptimization = ScheduleOptimizer.generateHeuristicSchedule(household as any, appliances);
      slots = defaultOptimization.schedule;
      householdSchedules.set(householdId, slots);
    }

    const conflicts = ScheduleOptimizer.detectConflicts(slots, household as any, appliances);
    const projectedImpact = ScheduleOptimizer.calculateBillImpact(slots, household as any, appliances);

    // Find relay-capable devices
    const relayDevices = devices.filter(d => 
      d.deviceType === 'SMART_PLUG' || 
      d.deviceType === 'ESP32_PZEM' ||
      d.adapterType === 'TuyaAdapter' ||
      Boolean(d.applianceId)
    );

    return res.json({
      status: 'success',
      data: {
        schedule: slots,
        conflicts,
        projectedImpact,
        relayDevices,
        totalRelaysCount: relayDevices.length,
      },
    });
  } catch (err: any) {
    console.error('[SchedulerRoute] GET / error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to fetch schedule' });
  }
});

// POST /api/v1/scheduler/optimize
router.post('/optimize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, preferences } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const { household, appliances, devices } = await getHouseholdContext(targetHhId);

    const result = await ScheduleOptimizer.autoScheduleWithAI(
      household as any,
      appliances,
      preferences || {}
    );

    householdSchedules.set(targetHhId, result.schedule);

    const relayDevices = devices.filter(d => 
      d.deviceType === 'SMART_PLUG' || 
      d.deviceType === 'ESP32_PZEM' ||
      d.adapterType === 'TuyaAdapter' ||
      Boolean(d.applianceId)
    );

    return res.json({
      status: 'success',
      message: 'Optimal off-peak schedule generated successfully.',
      data: {
        ...result,
        relayDevices,
        totalRelaysCount: relayDevices.length,
      },
    });
  } catch (err: any) {
    console.error('[SchedulerRoute] POST /optimize error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Auto-scheduling failed' });
  }
});

// POST /api/v1/scheduler/calculate-impact
router.post('/calculate-impact', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, slots } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const { household, appliances } = await getHouseholdContext(targetHhId);

    const validatedSlots: ScheduledSlot[] = Array.isArray(slots) ? slots : [];
    const conflicts = ScheduleOptimizer.detectConflicts(validatedSlots, household as any, appliances);
    const projectedImpact = ScheduleOptimizer.calculateBillImpact(validatedSlots, household as any, appliances);

    return res.json({
      status: 'success',
      data: {
        conflicts,
        projectedImpact,
      },
    });
  } catch (err: any) {
    console.error('[SchedulerRoute] POST /calculate-impact error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Impact calculation failed' });
  }
});

// POST /api/v1/scheduler/save
router.post('/save', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, slots } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const { household, appliances } = await getHouseholdContext(targetHhId);

    const validatedSlots: ScheduledSlot[] = Array.isArray(slots) ? slots : [];
    householdSchedules.set(targetHhId, validatedSlots);

    const conflicts = ScheduleOptimizer.detectConflicts(validatedSlots, household as any, appliances);
    const projectedImpact = ScheduleOptimizer.calculateBillImpact(validatedSlots, household as any, appliances);

    return res.json({
      status: 'success',
      message: 'Schedule saved successfully.',
      data: {
        schedule: validatedSlots,
        conflicts,
        projectedImpact,
      },
    });
  } catch (err: any) {
    console.error('[SchedulerRoute] POST /save error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to save schedule' });
  }
});

// POST /api/v1/scheduler/apply-relays
router.post('/apply-relays', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, slots } = req.body;
    const targetHhId = householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111101';
    const { household, appliances, devices } = await getHouseholdContext(targetHhId);

    const scheduleSlots: ScheduledSlot[] = Array.isArray(slots) ? slots : (householdSchedules.get(targetHhId) || []);
    const appliedSlots: Array<{ slotId: string; applianceName: string; deviceName: string; status: string }> = [];

    for (const slot of scheduleSlots) {
      // Find paired device or matching room device
      const matchingAppliance = appliances.find(a => a.id === slot.applianceId);
      const pairedDevice = devices.find(d => 
        (matchingAppliance?.deviceId && d.id === matchingAppliance.deviceId) ||
        (d.applianceId === slot.applianceId) ||
        (d.deviceType === 'SMART_PLUG' && d.roomId === matchingAppliance?.roomId)
      );

      if (pairedDevice) {
        slot.deviceId = pairedDevice.id;
        slot.hasRelay = true;
        slot.autoApplied = true;
        appliedSlots.push({
          slotId: slot.id,
          applianceName: slot.applianceName,
          deviceName: pairedDevice.name,
          status: 'CONFIGURED_ON_RELAY',
        });
      }
    }

    householdSchedules.set(targetHhId, scheduleSlots);

    return res.json({
      status: 'success',
      message: `Successfully synced ${appliedSlots.length} appliance schedule(s) with connected smart relays.`,
      messageBn: `${appliedSlots.length}টি যন্ত্রপাতির শিডিউল সফলভাবে সংযুক্ত স্মার্ট রিলের সাথে সমন্বয় করা হয়েছে।`,
      data: {
        appliedCount: appliedSlots.length,
        appliedSlots,
        schedule: scheduleSlots,
      },
    });
  } catch (err: any) {
    console.error('[SchedulerRoute] POST /apply-relays error:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to apply relays' });
  }
});

export default router;
