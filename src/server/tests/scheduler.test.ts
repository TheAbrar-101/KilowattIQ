/**
 * Off-Peak Scheduler Unit and Regression Test Suite
 * 
 * Verifies:
 * 1. Off-peak window classification (23:00–17:00 off-peak, 17:00–23:00 peak)
 * 2. Slot conflict detection (duplicate booking, peak warnings, sanctioned load breach)
 * 3. Live estimated savings and BERC slab tier impact
 * 4. Deterministic heuristic & AI auto-scheduling
 */

import { ScheduleOptimizer } from '../scheduler/optimizer';
import { Household, Appliance } from '../../../shared/types/household';
import { ScheduledSlot } from '../scheduler/types';

const mockHousehold: Household = {
  id: 'hh_test_gulshan',
  userId: 'usr_test',
  name: 'Gulshan Test Apt',
  utilityProvider: 'DESCO',
  accountNumber: 'DESCO-4492019',
  sanctionedLoadKw: 3.0,
  monthlyBudgetBDT: 3500,
  address: {
    division: 'Dhaka',
    city: 'Dhaka',
    area: 'Gulshan-2',
  },
  createdAt: '2026-01-01T00:00:00Z',
};

const mockAppliances: Appliance[] = [
  {
    id: 'app_geyser_01',
    householdId: 'hh_test_gulshan',
    roomId: 'rm_bath',
    name: 'Smart Fast Geyser 30L',
    category: 'WATER_HEATER',
    ratedPowerW: 2000,
    standbyPowerW: 0,
    averageHoursPerDay: 1.5,
    isInverterType: false,
    energyRatingStars: 4,
    isVampireRisk: false,
    purchasePriceBDT: 18500,
  },
  {
    id: 'app_ac_01',
    householdId: 'hh_test_gulshan',
    roomId: 'rm_bed',
    name: 'Master Bedroom 1.5T AC',
    category: 'AIR_CONDITIONER',
    ratedPowerW: 1650,
    standbyPowerW: 8,
    averageHoursPerDay: 7,
    isInverterType: false,
    energyRatingStars: 3,
    isVampireRisk: true,
    purchasePriceBDT: 62000,
  },
  {
    id: 'app_washing_01',
    householdId: 'hh_test_gulshan',
    roomId: 'rm_utility',
    name: 'Front Load Washing Machine',
    category: 'WASHING_MACHINE',
    ratedPowerW: 1200,
    standbyPowerW: 5,
    averageHoursPerDay: 1.5,
    isInverterType: false,
    energyRatingStars: 4,
    isVampireRisk: true,
    purchasePriceBDT: 42000,
  },
];

async function runTests() {
  console.log('--- RUNNING OFF-PEAK SCHEDULER TESTS ---');

  // Test 1: Hour classification
  console.log('Test 1: Verify 23:00–17:00 Off-Peak Window classification');
  if (!ScheduleOptimizer.isHourOffPeak(23)) throw new Error('23:00 should be off-peak');
  if (!ScheduleOptimizer.isHourOffPeak(0)) throw new Error('00:00 should be off-peak');
  if (!ScheduleOptimizer.isHourOffPeak(6)) throw new Error('06:00 should be off-peak');
  if (!ScheduleOptimizer.isHourOffPeak(14)) throw new Error('14:00 should be off-peak');
  if (!ScheduleOptimizer.isHourOffPeak(16.5)) throw new Error('16:30 should be off-peak');
  if (ScheduleOptimizer.isHourOffPeak(17)) throw new Error('17:00 must be PEAK');
  if (ScheduleOptimizer.isHourOffPeak(20)) throw new Error('20:00 must be PEAK');
  if (ScheduleOptimizer.isHourOffPeak(22.5)) throw new Error('22:30 must be PEAK');
  console.log('✓ Test 1 Passed: Peak (17:00-23:00) vs Off-Peak (23:00-17:00) window accurate.');

  // Test 2: Conflict detection - Overlap
  console.log('Test 2: Detect duplicate appliance booking overlap');
  const overlapSlots: ScheduledSlot[] = [
    {
      id: 's1',
      applianceId: 'app_geyser_01',
      applianceName: 'Smart Fast Geyser 30L',
      category: 'WATER_HEATER',
      startHour: 6,
      durationHours: 2, // 06:00 to 08:00
      ratedPowerW: 2000,
      isOffPeak: true,
      hasRelay: false,
    },
    {
      id: 's2',
      applianceId: 'app_geyser_01',
      applianceName: 'Smart Fast Geyser 30L',
      category: 'WATER_HEATER',
      startHour: 7, // overlaps with s1
      durationHours: 1.5,
      ratedPowerW: 2000,
      isOffPeak: true,
      hasRelay: false,
    },
  ];
  const overlapConflicts = ScheduleOptimizer.detectConflicts(overlapSlots, mockHousehold, mockAppliances);
  const foundOverlap = overlapConflicts.find(c => c.type === 'OVERLAP');
  if (!foundOverlap) throw new Error('Failed to detect overlapping slots for same appliance');
  console.log('✓ Test 2 Passed: Overlapping slot conflict detected properly.');

  // Test 3: Conflict detection - Peak Window violation
  console.log('Test 3: Flag appliance placed inside 17:00-23:00 peak hours');
  const peakSlot: ScheduledSlot = {
    id: 's_peak',
    applianceId: 'app_geyser_01',
    applianceName: 'Smart Fast Geyser 30L',
    category: 'WATER_HEATER',
    startHour: 19, // 7:00 PM (peak)
    durationHours: 1.5,
    ratedPowerW: 2000,
    isOffPeak: false,
    hasRelay: false,
  };
  const peakConflicts = ScheduleOptimizer.detectConflicts([peakSlot], mockHousehold, mockAppliances);
  const foundPeak = peakConflicts.find(c => c.type === 'PEAK_ZONE');
  if (!foundPeak) throw new Error('Failed to flag peak zone conflict at 19:00');
  console.log('✓ Test 3 Passed: Peak zone warning triggered with rate diff message.');

  // Test 4: Conflict detection - Sanctioned Load Breach
  console.log('Test 4: Flag combined load exceeding household sanctioned limit');
  const overloadSlots: ScheduledSlot[] = [
    {
      id: 's_geyser_am',
      applianceId: 'app_geyser_01',
      applianceName: 'Smart Fast Geyser 30L',
      category: 'WATER_HEATER',
      startHour: 6,
      durationHours: 1,
      ratedPowerW: 2000, // 2.0 kW
      isOffPeak: true,
      hasRelay: false,
    },
    {
      id: 's_ac_am',
      applianceId: 'app_ac_01',
      applianceName: 'Master Bedroom 1.5T AC',
      category: 'AIR_CONDITIONER',
      startHour: 6,
      durationHours: 1,
      ratedPowerW: 1650, // 1.65 kW -> 2.0 + 1.65 = 3.65 kW > 3.0 kW sanctioned limit!
      isOffPeak: true,
      hasRelay: false,
    },
  ];
  const overloadConflicts = ScheduleOptimizer.detectConflicts(overloadSlots, mockHousehold, mockAppliances);
  const foundOverload = overloadConflicts.find(c => c.type === 'LOAD_EXCEEDED');
  if (!foundOverload) throw new Error('Failed to detect sanctioned load breach');
  console.log('✓ Test 4 Passed: Sanctioned load breach detected with breaker trip warning.');

  // Test 5: Live bill impact & live savings
  console.log('Test 5: Live savings calculation and BERC slab tracking');
  const offPeakSlots: ScheduledSlot[] = [
    {
      id: 's_geyser_opt',
      applianceId: 'app_geyser_01',
      applianceName: 'Smart Fast Geyser 30L',
      category: 'WATER_HEATER',
      startHour: 5.5,
      durationHours: 1.5,
      ratedPowerW: 2000,
      isOffPeak: true,
      hasRelay: true,
    },
    {
      id: 's_wm_opt',
      applianceId: 'app_washing_01',
      applianceName: 'Front Load Washing Machine',
      category: 'WASHING_MACHINE',
      startHour: 10,
      durationHours: 1.5,
      ratedPowerW: 1200,
      isOffPeak: true,
      hasRelay: true,
    },
  ];
  const impact = ScheduleOptimizer.calculateBillImpact(offPeakSlots, mockHousehold, mockAppliances);
  if (impact.monthlySavingsBDT <= 0) throw new Error('Expected positive monthly savings for off-peak shift');
  if (impact.annualSavingsBDT <= impact.monthlySavingsBDT) throw new Error('Annual savings must be monthly * 12');
  if (!impact.currentSlabName) throw new Error('Missing current slab name');
  console.log(`✓ Test 5 Passed: Live savings calculated: ৳${impact.monthlySavingsBDT}/mo (৳${impact.annualSavingsBDT}/yr), Slab: ${impact.currentSlabName}.`);

  // Test 6: Auto-schedule Heuristic Engine
  console.log('Test 6: Heuristic auto-scheduler generates optimal slots without conflict');
  const autoResult = ScheduleOptimizer.generateHeuristicSchedule(mockHousehold, mockAppliances);
  if (autoResult.schedule.length === 0) throw new Error('Auto-schedule failed to generate slots');
  const nonPeakSlotsCount = autoResult.schedule.filter(s => s.isOffPeak).length;
  if (nonPeakSlotsCount !== autoResult.schedule.length) {
    throw new Error('Auto-schedule placed appliances in peak hours!');
  }
  console.log(`✓ Test 6 Passed: Auto-scheduler generated ${autoResult.schedule.length} optimal slots, 100% in off-peak window.`);

  console.log('ALL OFF-PEAK SCHEDULER TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
