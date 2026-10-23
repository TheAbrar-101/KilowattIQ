/**
 * KilowattIQ Bangla Voice Interaction Unit Tests
 * 
 * Verifies:
 * 1. Bangla Script Detection & STT Normalization
 * 2. Bangla Phonetic Prepping & TTS Metadata (bn-BD)
 * 3. Strict Prompt Template Generation for Bangla Queries
 * 4. Grounded Voice Advisory for "আমার বিল কেন এত বেশি?"
 */

import { isBanglaText, normalizeBanglaTranscript, transcribeAudioWithGemini } from '../voice/stt';
import { prepareBengaliForSpeech, createBanglaTtsMetadata, convertToBengaliDigits } from '../voice/tts';
import { buildBanglaVoiceAdvisorPrompt, generateBanglaVoiceAdvisory } from '../voice/promptTemplate';

async function runBanglaVoiceTests() {
  console.log('--- RUNNING BANGLA VOICE INTERACTION TESTS ---');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, desc: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  // Test 1: Bangla Script Detection
  assert(isBanglaText('আমার বিল কেন এত বেশি?'), 'Detects pure Bengali Unicode script');
  assert(isBanglaText('এসি চালালে কত খরচ?'), 'Detects Bengali script in AC query');
  assert(!isBanglaText('Why is my bill so high?'), 'Rejects pure English text from Bangla detector');

  // Test 2: STT Normalization
  const rawSpoken = '   আমার বিল কেন এত বেশি    ';
  assert(normalizeBanglaTranscript(rawSpoken) === 'আমার বিল কেন এত বেশি?', 'Normalizes whitespace and appends question mark');

  // Test 3: Audio STT Fallback
  const sttResult = await transcribeAudioWithGemini('dummy_base64');
  assert(sttResult.isBangla === true, 'STT fallback returns Bangla text');
  assert(sttResult.transcript.includes('বিল'), 'STT fallback transcript contains energy keyword');

  // Test 4: Phonetic Prepping for Web Speech Synthesis
  const sampleWithSymbols = 'আপনার বিল ৳2,277 BDT। এসি ১.৫ kW এবং টিভি 100 W বিদ্যুৎ টানে Step 3 তে।';
  const prepped = prepareBengaliForSpeech(sampleWithSymbols);
  assert(!prepped.includes('৳'), 'Removes raw ৳ symbol for speech synthesis');
  assert(prepped.includes('টাকা'), 'Replaces currency symbol with spoken "টাকা"');
  assert(prepped.includes('কিলোওয়াট'), 'Converts kW to spoken Bengali');
  assert(prepped.includes('ওয়াট'), 'Converts W to spoken Bengali');
  assert(prepped.includes('তৃতীয় ধাপ'), 'Converts Step 3 to spoken Bengali');

  // Test 5: Bangla TTS Metadata
  const ttsMeta = createBanglaTtsMetadata('আপনার বিল বেশি আসার মূল কারণ হলো এসি একটানা চলা।');
  assert(ttsMeta.lang === 'bn-BD', 'TTS metadata configures bn-BD language');
  assert(ttsMeta.rate === 0.95, 'TTS metadata specifies relaxed pacing for intelligibility');

  // Test 6: Prompt Template forces Bangla when input is Bangla
  const testContext = {
    householdName: 'Gulshan Residence',
    utilityProvider: 'DESCO',
    sanctionedLoadKw: 3.0,
    currentActiveWatts: 4296,
    monthlyEstimatedKwh: 285,
    projectedBillBDT: 2277,
    monthlyBudgetBDT: 3000,
    currentTariffStep: 'Step 3 (201 - 300 kWh)',
    stepRateBDT: 7.34,
    nextStepThresholdKwh: 300,
    kwhToNextStep: 15,
    vampireWasteBDT: 180,
    topApplianceName: 'Master Bedroom 1.5T AC',
    topApplianceWatts: 1650,
    isAcOn: true,
    heatwaveBillImpactBDT: 0,
  };

  const { systemInstruction, userPrompt } = buildBanglaVoiceAdvisorPrompt('আমার বিল কেন এত বেশি?', testContext);
  assert(systemInstruction.includes('100% IN NATURAL, POLITE, CONVERSATIONAL BENGALI (বাংলা)'), 'System instruction strictly forces Bengali for Bangla queries');
  assert(userPrompt.includes('আমার বিল কেন এত বেশি?'), 'Prompt contains user query in Bangla');
  assert(userPrompt.includes('ট্যারিফ স্ল্যাব'), 'Prompt incorporates deterministic tariff slab context');

  // Test 7: Advisory Response to "আমার বিল কেন এত বেশি?"
  const advisory = await generateBanglaVoiceAdvisory('আমার বিল কেন এত বেশি?', testContext);
  assert(advisory.isBanglaQuery === true, 'Flags advisory as Bangla query');
  assert(isBanglaText(advisory.headline), 'Headline is in Bengali');
  assert(isBanglaText(advisory.spokenSummary), 'Spoken summary is in natural Bengali');
  assert(advisory.spokenSummary.includes('বিল') || advisory.spokenSummary.includes('টাকা'), 'Spoken summary discusses bill and money');
  assert(advisory.causes.length >= 2, 'Advisory lists at least 2 contributing causes');
  assert(advisory.actionableSteps.length >= 2, 'Advisory lists concrete actionable steps in Bengali');
  assert(advisory.estimatedMonthlySavingsBDT > 0, 'Advisory provides positive monthly savings projection');

  // Test 8: Digits conversion
  assert(convertToBengaliDigits('2026') === '২০২৬', 'Converts English numbers to Bengali digits');

  console.log(`\n🎉 All ${passed}/${total} Bangla voice interaction tests passed!`);
}

runBanglaVoiceTests().catch(err => {
  console.error('Test runner failure:', err);
  process.exit(1);
});
