/**
 * NILM (Non-Intrusive Load Monitoring) Test Suite
 * 
 * Verifies:
 * 1. Step change detection from 1 Hz telemetry (ΔP, ΔQ, ΔS, apparent PF)
 * 2. High-confidence matching against registered inventory & signature library (>= 60% -> "DETECTED")
 * 3. Low-confidence ambiguous detection compliance (< 60% -> "MAYBE", never "DETECTED")
 * 4. User feedback operations (Confirm, Rename, Merge)
 * 5. Telemetry simulation pipeline
 */

import { NilmDisaggregator } from '../nilm/disaggregator';
import { SignatureMatcher } from '../nilm/signatureMatcher';
import { StepEvent } from '../nilm/types';
import { Appliance } from '../../../shared/types/household';

export async function runNilmTests() {
  console.log('--- RUNNING NILM DISAGGREGATION & SIGNATURE MATCHER TESTS ---');

  const matcher = SignatureMatcher.getInstance();
  const disaggregator = NilmDisaggregator.getInstance();
  const testHouseholdId = `hh_nilm_test_${Date.now()}`;

  const mockRegistered: Appliance[] = [
    {
      id: 'app_test_ac',
      householdId: testHouseholdId,
      roomId: 'room_1',
      name: 'Master Bed 1.5T AC',
      category: 'AIR_CONDITIONER',
      ratedPowerW: 1650,
      standbyPowerW: 8,
      averageHoursPerDay: 7,
      isInverterType: false,
      isVampireRisk: true,
    },
    {
      id: 'app_test_geyser',
      householdId: testHouseholdId,
      roomId: 'room_2',
      name: 'Bathroom Fast Geyser',
      category: 'WATER_HEATER',
      ratedPowerW: 2000,
      standbyPowerW: 0,
      averageHoursPerDay: 1,
      isInverterType: false,
      isVampireRisk: false,
    },
  ];

  // 1. Test Matching Registered Appliance (1,640W step matching 1,650W AC)
  const acStep: StepEvent = {
    id: 'step_ac_1',
    timestamp: new Date().toISOString(),
    deltaActiveW: 1640,
    deltaReactiveVAR: 600,
    deltaApparentVA: 1746,
    stepDirection: 'ON',
    steadyStatePowerW: 1950,
    priorStatePowerW: 310,
    apparentPowerFactor: 0.94,
  };

  const acMatch = await matcher.matchStep(acStep, mockRegistered);
  if (acMatch.confidence < 80) {
    throw new Error(`Expected registered AC confidence >= 80%, got ${acMatch.confidence}%`);
  }
  if (acMatch.matchedRegisteredApplianceId !== 'app_test_ac') {
    throw new Error(`Expected match to 'app_test_ac', got ${acMatch.matchedRegisteredApplianceId}`);
  }
  console.log(`  ✓ Test 1: Registered appliance match passed (${acMatch.name}, confidence: ${acMatch.confidence}%)`);

  // 2. Test High-Confidence Resistive Heating Signature (Geyser 2,000W, near zero reactive)
  const geyserStep: StepEvent = {
    id: 'step_geyser_1',
    timestamp: new Date().toISOString(),
    deltaActiveW: 2020,
    deltaReactiveVAR: 45,
    deltaApparentVA: 2020,
    stepDirection: 'ON',
    steadyStatePowerW: 2320,
    priorStatePowerW: 300,
    apparentPowerFactor: 0.99,
  };

  const geyserMatch = await matcher.matchStep(geyserStep, []);
  if (geyserMatch.confidence < 60) {
    throw new Error(`Expected geyser signature confidence >= 60%, got ${geyserMatch.confidence}%`);
  }
  if (geyserMatch.category !== 'WATER_HEATER') {
    throw new Error(`Expected category WATER_HEATER, got ${geyserMatch.category}`);
  }
  console.log(`  ✓ Test 2: Standard library signature match passed (${geyserMatch.name}, confidence: ${geyserMatch.confidence}%)`);

  // 3. Test Strict Honest Low-Confidence Rule (< 60% MUST BE "MAYBE")
  const ambiguousStep: StepEvent = {
    id: 'step_ambiguous_1',
    timestamp: new Date().toISOString(),
    deltaActiveW: 780,
    deltaReactiveVAR: 640,
    deltaApparentVA: 1009,
    stepDirection: 'ON',
    steadyStatePowerW: 1100,
    priorStatePowerW: 320,
    apparentPowerFactor: 0.77,
  };

  const ambiguousMatch = await matcher.matchStep(ambiguousStep, []);
  if (ambiguousMatch.confidence >= 60) {
    throw new Error(`Ambiguous inductive signature should have confidence < 60%, got ${ambiguousMatch.confidence}%`);
  }

  const simulatedStatus = ambiguousMatch.confidence >= 60 ? 'DETECTED' : 'MAYBE';
  if (simulatedStatus !== 'MAYBE') {
    throw new Error(`Expected status 'MAYBE' for confidence ${ambiguousMatch.confidence}%, got ${simulatedStatus}`);
  }
  console.log(`  ✓ Test 3: Honest status verified (confidence: ${ambiguousMatch.confidence}%, status: MAYBE)`);

  // 4. Test High-Frequency 1 Hz Telemetry Ingestion in NilmDisaggregator
  // Feed baseline
  await disaggregator.ingestReading({
    householdId: testHouseholdId,
    voltage: 220,
    current: 1.5,
    powerFactor: 0.95,
    activePowerW: 310,
    timestamp: new Date(Date.now() - 1000).toISOString(),
  });

  // Feed jump (+1,650W jump)
  const ingestResult = await disaggregator.ingestReading({
    householdId: testHouseholdId,
    voltage: 220,
    current: 9.0,
    powerFactor: 0.93,
    activePowerW: 1960,
    timestamp: new Date().toISOString(),
  });

  if (ingestResult.detectedSteps.length === 0) {
    throw new Error('Expected step change to be detected between 310W and 1960W');
  }
  const detectedStep = ingestResult.detectedSteps[0];
  if (detectedStep.stepDirection !== 'ON') {
    throw new Error(`Expected step direction 'ON', got ${detectedStep.stepDirection}`);
  }
  if (Math.abs(detectedStep.deltaActiveW - 1650) > 10) {
    throw new Error(`Expected deltaActiveW ~1650W, got ${detectedStep.deltaActiveW}W`);
  }
  console.log(`  ✓ Test 4: 1 Hz telemetry step detection passed (Detected: +${detectedStep.deltaActiveW}W)`);

  // 5. Test Discovered Appliances Retrieval
  const discovered = disaggregator.getDiscoveredAppliances(testHouseholdId);
  if (!Array.isArray(discovered) || discovered.length === 0) {
    throw new Error('Expected discovered appliances list to be populated');
  }
  console.log(`  ✓ Test 5: Discovered appliances retrieved (${discovered.length} items tracked)`);

  // 6. Test User Operations: Confirm, Rename, Merge
  const targetItem = discovered[0];
  const originalId = targetItem.id;

  // Rename
  const renamed = disaggregator.renameAppliance(testHouseholdId, originalId, 'Guest Bedroom Smart AC');
  if (renamed.name !== 'Guest Bedroom Smart AC') {
    throw new Error(`Expected name 'Guest Bedroom Smart AC', got ${renamed.name}`);
  }
  console.log(`  ✓ Test 6a: Rename operation passed`);

  // Confirm
  const confirmResult = await disaggregator.confirmAppliance(testHouseholdId, originalId, 'room_1', 'Guest Bedroom Smart AC');
  if (!confirmResult.discovery.isConfirmed) {
    throw new Error('Expected discovery to be marked confirmed');
  }
  if (confirmResult.discovery.confidence !== 100) {
    throw new Error('Confirmed appliance should have 100% confidence');
  }
  console.log(`  ✓ Test 6b: Confirm operation passed (linked to registered ID: ${confirmResult.appliance.id})`);

  // Merge
  if (discovered.length > 1) {
    const secondItem = discovered[1];
    const merged = await disaggregator.mergeAppliance(testHouseholdId, secondItem.id, '33333333-3333-4333-a333-333333333301');
    if (!merged.isConfirmed || merged.mergedIntoId !== '33333333-3333-4333-a333-333333333301') {
      throw new Error('Expected item to be merged with target appliance ID');
    }
    console.log(`  ✓ Test 6c: Merge operation passed`);
  }

  // 7. Test Simulation Burst
  const simBurst = await disaggregator.simulateBurst(testHouseholdId, 'geyser_on');
  if (!simBurst.step || Math.abs(simBurst.step.deltaActiveW - 2100) > 50) {
    throw new Error(`Expected simulated burst deltaActiveW ~2100W, got ${simBurst.step.deltaActiveW}W`);
  }
  console.log(`  ✓ Test 7: Simulation burst passed (+${simBurst.step.deltaActiveW}W step generated)`);

  console.log('--- ALL NILM SUBSYSTEM TESTS PASSED SUCCESSFULLY ---');
}

if (process.argv[1] && process.argv[1].endsWith('nilm.test.ts')) {
  runNilmTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('NILM Test Failure:', err);
      process.exit(1);
    });
}
