/**
 * Appliance Health Degradation Detector Test Suite
 * 
 * Verifies:
 * 1. Rising standby power signal detection (aging PSU)
 * 2. Compressor inrush current increasing (AC/fridge)
 * 3. Power factor drift downward
 * 4. Runtime creep (cycle duration expansion)
 * 5. Accurate health score 0–100 calculation
 * 6. Score < 70 threshold: "This fridge may need servicing soon"
 * 7. Score < 40 threshold: "Consider replacing — here's the ROI" with linkToRoi: true
 */

import { DegradationDetector } from '../health/degradationDetector';
import { Appliance } from '../../../shared/types/household';

const mockHealthyInverterAC: Appliance = {
  id: 'app_inverter_ac_01',
  householdId: 'hh_test',
  roomId: 'rm_bed',
  name: 'Master Bed 1.5T 5-Star Inverter AC',
  category: 'AIR_CONDITIONER',
  ratedPowerW: 1100,
  standbyPowerW: 2,
  averageHoursPerDay: 7,
  isInverterType: true,
  energyRatingStars: 5,
  isVampireRisk: false,
};

const mockDegradedFridge: Appliance = {
  id: 'app_old_fridge_01',
  householdId: 'hh_test',
  roomId: 'rm_kitchen',
  name: 'Frost Double Door Fridge',
  category: 'REFRIGERATOR',
  ratedPowerW: 220,
  standbyPowerW: 18,
  averageHoursPerDay: 24,
  isInverterType: false,
  energyRatingStars: 2,
  isVampireRisk: true,
};

const mockCriticalOldAC: Appliance = {
  id: 'app_critical_old_ac_01',
  householdId: 'hh_test',
  roomId: 'rm_living',
  name: '1.5 Ton Non-Inverter Split AC',
  category: 'AIR_CONDITIONER',
  ratedPowerW: 1950,
  standbyPowerW: 24,
  averageHoursPerDay: 6,
  isInverterType: false,
  energyRatingStars: 1,
  isVampireRisk: true,
};

async function runTests() {
  console.log('--- RUNNING APPLIANCE HEALTH DEGRADATION TESTS ---');
  const detector = DegradationDetector.getInstance();

  // Test 1: Healthy Appliance Evaluation (Score >= 70, no critical degradation)
  console.log('Test 1: Pristine Inverter AC should evaluate as HEALTHY (score >= 70)');
  const healthyReport = detector.evaluateApplianceHealth(mockHealthyInverterAC);
  if (healthyReport.healthScore < 70) {
    throw new Error(`Expected health score >= 70 for healthy inverter AC, got ${healthyReport.healthScore}`);
  }
  if (healthyReport.status !== 'HEALTHY') {
    throw new Error(`Expected status 'HEALTHY', got ${healthyReport.status}`);
  }
  if (healthyReport.linkToRoi) {
    throw new Error('Healthy appliance should not link to ROI replacement');
  }
  console.log(`  ✓ Test 1 Passed: Healthy AC evaluated (Score: ${healthyReport.healthScore}/100, Status: ${healthyReport.status})`);

  // Test 2: Moderate Degradation (< 70 threshold)
  // Fridge with rising standby + inrush surge + runtime creep
  console.log('Test 2: Moderate degradation fridge should trigger < 70 "This fridge may need servicing soon"');
  const fridgeReport = detector.evaluateApplianceHealth(mockDegradedFridge);
  if (fridgeReport.healthScore >= 70) {
    throw new Error(`Expected fridge health score < 70, got ${fridgeReport.healthScore}`);
  }
  if (!fridgeReport.recommendation.toLowerCase().includes('may need servicing soon')) {
    throw new Error(`Expected recommendation to include "may need servicing soon", got "${fridgeReport.recommendation}"`);
  }
  if (fridgeReport.status !== 'NEEDS_SERVICE' && fridgeReport.status !== 'REPLACE_RECOMMENDED') {
    throw new Error(`Expected status NEEDS_SERVICE or REPLACE_RECOMMENDED, got ${fridgeReport.status}`);
  }
  console.log(`  ✓ Test 2 Passed: Fridge flagged correctly (Score: ${fridgeReport.healthScore}/100, Msg: "${fridgeReport.recommendation}")`);

  // Test 3: Severe Degradation (< 40 threshold)
  // Non-inverter AC with massive inrush, low PF (0.69), high standby (24W), and high runtime creep
  console.log('Test 3: Severe degradation AC should trigger < 40 "Consider replacing — here\'s the ROI"');
  const criticalReport = detector.evaluateApplianceHealth(mockCriticalOldAC);
  if (criticalReport.healthScore >= 40) {
    throw new Error(`Expected critical AC health score < 40, got ${criticalReport.healthScore}`);
  }
  if (criticalReport.status !== 'REPLACE_RECOMMENDED') {
    throw new Error(`Expected status 'REPLACE_RECOMMENDED', got ${criticalReport.status}`);
  }
  if (criticalReport.recommendation !== "Consider replacing — here's the ROI") {
    throw new Error(`Expected exact recommendation "Consider replacing — here's the ROI", got "${criticalReport.recommendation}"`);
  }
  if (!criticalReport.linkToRoi) {
    throw new Error('Expected linkToRoi to be true when score < 40');
  }
  if (!criticalReport.suggestedReplacement) {
    throw new Error('Expected suggested replacement for ROI calculation');
  }
  console.log(`  ✓ Test 3 Passed: Critical AC flagged with ROI link (Score: ${criticalReport.healthScore}/100, Link: ${criticalReport.linkToRoi})`);

  // Test 4: Verify the 4 Individual Signals Monitored
  console.log('Test 4: Verify monitoring of all 4 individual electrical signals');
  const customSignalsReport = detector.evaluateApplianceHealth(mockHealthyInverterAC, {
    standbyBaselineW: 4,
    standbyPowerW: 19, // Rising standby (+375%)
    inrushBaselineA: 10,
    inrushCurrentA: 24, // Inrush surge (+140%)
    powerFactorBaseline: 0.95,
    powerFactor: 0.71, // PF drift (-25%)
    runtimeBaselineMinutes: 20,
    runtimeMinutesPerCycle: 42, // Runtime creep (+110%)
  });

  const findingTypes = customSignalsReport.findings.map(f => f.type);
  if (!findingTypes.includes('RISING_STANDBY')) throw new Error('Missing RISING_STANDBY finding');
  if (!findingTypes.includes('INRUSH_SURGE')) throw new Error('Missing INRUSH_SURGE finding');
  if (!findingTypes.includes('PF_DRIFT')) throw new Error('Missing PF_DRIFT finding');
  if (!findingTypes.includes('RUNTIME_CREEP')) throw new Error('Missing RUNTIME_CREEP finding');
  console.log(`  ✓ Test 4 Passed: All 4 signals detected (Findings: ${findingTypes.join(', ')})`);

  // Test 5: Household batch evaluation
  console.log('Test 5: Batch evaluate household appliances');
  const batch = detector.evaluateHousehold([mockHealthyInverterAC, mockDegradedFridge, mockCriticalOldAC]);
  if (batch.length !== 3) throw new Error('Batch evaluation returned incorrect length');
  console.log(`  ✓ Test 5 Passed: Batch evaluation processed ${batch.length} appliances successfully`);

  console.log('--- ALL APPLIANCE HEALTH DEGRADATION TESTS PASSED ---');
}

runTests().catch(err => {
  console.error('Degradation Test Failure:', err);
  process.exit(1);
});
