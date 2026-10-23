/**
 * Express REST API Routes - Bangla Voice Interaction & Speech Services
 * 
 * Routes:
 * - POST /api/v1/voice/query : Handles user queries in Bangla (e.g. "আমার বিল কেন এত বেশি?"),
 *   runs Gemini prompt template with strict Bangla enforcement, and returns both text & TTS meta.
 * - POST /api/v1/voice/stt   : Speech-to-text fallback with Gemini audio transcription
 * - POST /api/v1/voice/tts   : Text-to-speech phonetic prepper & metadata
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { transcribeAudioWithGemini, isBanglaText } from '../../../src/server/voice/stt';
import { createBanglaTtsMetadata } from '../../../src/server/voice/tts';
import { generateBanglaVoiceAdvisory } from '../../../src/server/voice/promptTemplate';
import { TariffCalculator } from '../../engine/TariffCalculator';
import { BudgetEngine } from '../../engine/BudgetEngine';
import { VampirePowerEngine } from '../../engine/VampirePowerEngine';

const router = Router();
const db = SupabaseService.getInstance();

// POST /api/v1/voice/query
router.post('/query', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query = 'আমার বিল কেন এত বেশি?', householdId = '11111111-1111-4111-a111-111111111111' } = req.body || {};

    const household = await db.getHouseholdById(householdId);
    const appliances = await db.getAppliances(householdId);
    const rooms = await db.getRooms(householdId);

    // Calculate current live watts
    let currentActiveWatts = 0;
    let acWatts = 0;
    let isAcOn = false;

    for (const app of appliances) {
      if (db.isApplianceOn(app.id)) {
        currentActiveWatts += app.ratedPowerW;
        if (/ac|air conditioner|এসি/i.test(app.name)) {
          isAcOn = true;
          acWatts = app.ratedPowerW;
        }
      }
    }

    const estimatedMonthlyKwh = 285;
    const sanctionedLoadKw = household?.sanctionedLoadKw || 3.0;
    const monthlyBudgetBDT = household?.monthlyBudgetBDT || 3000;

    const tariffCost = TariffCalculator.calculateCost(estimatedMonthlyKwh, sanctionedLoadKw);
    const budgetStatus = BudgetEngine.evaluateBudget(
      householdId,
      monthlyBudgetBDT,
      estimatedMonthlyKwh,
      15,
      30,
      sanctionedLoadKw
    );

    const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
    const totalVampireBDT = vampireReports.reduce((acc, v) => acc + v.monthlyWastedBDT, 0);

    const slabAnalysis = TariffCalculator.analyzeSlabThreshold(
      estimatedMonthlyKwh,
      15,
      30,
      sanctionedLoadKw
    );

    const advisory = await generateBanglaVoiceAdvisory(query, {
      householdName: household?.name || 'Gulshan Residence',
      utilityProvider: household?.utilityProvider || 'DESCO',
      sanctionedLoadKw,
      currentActiveWatts: currentActiveWatts || 4296,
      monthlyEstimatedKwh: budgetStatus.projectedKwh,
      projectedBillBDT: budgetStatus.projectedCostBDT,
      monthlyBudgetBDT,
      currentTariffStep: slabAnalysis.currentSlabName,
      stepRateBDT: 7.34,
      nextStepThresholdKwh: slabAnalysis.thresholdKwh || 300,
      kwhToNextStep: slabAnalysis.kwhRemainingToBreach || 15,
      vampireWasteBDT: totalVampireBDT,
      topApplianceName: 'Master Bedroom 1.5T AC',
      topApplianceWatts: acWatts || 1650,
      isAcOn,
      heatwaveBillImpactBDT: 0,
    });

    return res.json({
      status: 'success',
      data: advisory,
    });
  } catch (err: any) {
    console.error('[VoiceQuery ERROR]:', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to process voice query advisory',
    });
  }
});

// POST /api/v1/voice/stt (Gemini Audio STT Fallback)
router.post('/stt', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body || {};

    if (!audioBase64) {
      return res.status(400).json({
        status: 'error',
        message: 'audioBase64 string is required for audio transcription fallback',
      });
    }

    const result = await transcribeAudioWithGemini(audioBase64, mimeType);
    return res.json({
      status: 'success',
      data: result,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Speech-to-text transcription failed',
    });
  }
});

// POST /api/v1/voice/tts
router.post('/tts', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { text = '' } = req.body || {};
    const ttsMeta = createBanglaTtsMetadata(text);

    return res.json({
      status: 'success',
      data: ttsMeta,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'TTS metadata generation failed',
    });
  }
});

export default router;
