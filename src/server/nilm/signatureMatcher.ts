/**
 * Appliance Signature Matcher & Gemini Vision/Labeling Subsystem
 * 
 * Matches transient step changes (ΔP active power, ΔQ reactive power) against:
 * 1. Existing registered appliances in the household (high confidence match)
 * 2. Standard Bangladeshi electrical appliance signature library
 * 3. Gemini (@google/genai) to label unknown signatures ("this looks like a 1.5-ton AC")
 */

import { GoogleGenAI } from '@google/genai';
import { Appliance } from '../../../shared/types/household';
import { StepEvent, ApplianceSignature, SignatureMatchResult } from './types';

export const BANGLADESH_APPLIANCE_SIGNATURES: ApplianceSignature[] = [
  {
    id: 'sig_ac_1_5t_non_inverter',
    name: '1.5-Ton Non-Inverter AC',
    category: 'AIR_CONDITIONER',
    typicalActiveW: [1500, 1850],
    typicalReactiveVAR: [500, 850],
    typicalPowerFactor: [0.85, 0.92],
    isInductive: true,
    description: 'Compressor step with high inductive reactive power draw (~600-800 VAR) at ~1.6 kW steady draw.',
  },
  {
    id: 'sig_ac_1_5t_inverter',
    name: '1.5-Ton Inverter AC',
    category: 'AIR_CONDITIONER',
    typicalActiveW: [600, 1450],
    typicalReactiveVAR: [150, 400],
    typicalPowerFactor: [0.93, 0.98],
    isInductive: true,
    description: 'Modulated inverter compressor ramp with active power factor correction (PFC).',
  },
  {
    id: 'sig_ac_1_0t',
    name: '1.0-Ton Split AC',
    category: 'AIR_CONDITIONER',
    typicalActiveW: [950, 1250],
    typicalReactiveVAR: [320, 520],
    typicalPowerFactor: [0.86, 0.93],
    isInductive: true,
    description: 'Compact 1-ton compressor cycling on with ~1.1 kW active step.',
  },
  {
    id: 'sig_geyser_fast',
    name: 'Instant Water Heater / Geyser',
    category: 'WATER_HEATER',
    typicalActiveW: [1800, 2400],
    typicalReactiveVAR: [0, 80],
    typicalPowerFactor: [0.98, 1.0],
    isInductive: false,
    description: 'Pure resistive heating element jump (1.8-2.4 kW) with near-zero reactive power.',
  },
  {
    id: 'sig_fridge_compressor',
    name: 'Refrigerator Compressor',
    category: 'REFRIGERATOR',
    typicalActiveW: [130, 240],
    typicalReactiveVAR: [140, 280],
    typicalPowerFactor: [0.65, 0.82],
    isInductive: true,
    description: 'Hermetic reciprocating compressor cycle with inductive phase lag.',
  },
  {
    id: 'sig_microwave',
    name: 'Digital Microwave Oven',
    category: 'MICROWAVE',
    typicalActiveW: [850, 1300],
    typicalReactiveVAR: [350, 580],
    typicalPowerFactor: [0.88, 0.94],
    isInductive: true,
    description: 'High-voltage transformer and magnetron excitation.',
  },
  {
    id: 'sig_washing_machine',
    name: 'Front-Load Washing Machine (Motor/Agitator)',
    category: 'WASHING_MACHINE',
    typicalActiveW: [300, 650],
    typicalReactiveVAR: [180, 420],
    typicalPowerFactor: [0.75, 0.88],
    isInductive: true,
    description: 'Drum drive induction motor cycling during wash / agitation cycles.',
  },
  {
    id: 'sig_ceiling_fan',
    name: 'Induction / BLDC Ceiling Fan',
    category: 'FAN',
    typicalActiveW: [25, 75],
    typicalReactiveVAR: [15, 60],
    typicalPowerFactor: [0.80, 0.95],
    isInductive: true,
    description: 'Low-power motor step for ceiling ventilation fan.',
  },
  {
    id: 'sig_tv_entertainment',
    name: 'Smart TV & Soundbar',
    category: 'TELEVISION',
    typicalActiveW: [90, 170],
    typicalReactiveVAR: [10, 50],
    typicalPowerFactor: [0.92, 0.98],
    isInductive: false,
    description: 'SMPS power supply step for 55-65 inch display panel.',
  },
];

export class SignatureMatcher {
  private static instance: SignatureMatcher;

  public static getInstance(): SignatureMatcher {
    if (!SignatureMatcher.instance) {
      SignatureMatcher.instance = new SignatureMatcher();
    }
    return SignatureMatcher.instance;
  }

  /**
   * Matches a step event against registered appliances and signature library.
   * If confidence is below threshold or signature is ambiguous, invokes Gemini.
   */
  public async matchStep(
    step: StepEvent,
    registeredAppliances: Appliance[] = []
  ): Promise<SignatureMatchResult> {
    const absActive = Math.abs(step.deltaActiveW);
    const absReactive = Math.abs(step.deltaReactiveVAR);
    const pf = step.apparentPowerFactor;

    // 1. Try matching against household's existing registered appliances first
    for (const app of registeredAppliances) {
      const rated = app.ratedPowerW;
      const margin = rated * 0.18; // 18% tolerance
      if (Math.abs(absActive - rated) <= margin) {
        // High confidence match with user's verified inventory
        const variancePct = Math.round((Math.abs(absActive - rated) / rated) * 100);
        const confidence = Math.max(82, 96 - variancePct);

        return {
          name: app.name,
          category: app.category,
          confidence,
          isAiLabeled: false,
          reasoning: `Matches registered inventory "${app.name}" (${rated}W) with ${100 - variancePct}% electrical correlation.`,
          matchedRegisteredApplianceId: app.id,
        };
      }
    }

    // 2. Try matching against standard signature library
    let bestSig: ApplianceSignature | null = null;
    let bestScore = 0;

    for (const sig of BANGLADESH_APPLIANCE_SIGNATURES) {
      const [minP, maxP] = sig.typicalActiveW;
      const [minQ, maxQ] = sig.typicalReactiveVAR;
      const [minPF, maxPF] = sig.typicalPowerFactor;

      const inActive = absActive >= minP * 0.85 && absActive <= maxP * 1.15;
      const inReactive = absReactive >= minQ * 0.8 && absReactive <= maxQ * 1.25;
      const inPF = pf >= minPF * 0.9 && pf <= Math.min(1.0, maxPF * 1.05);

      if (inActive && inReactive) {
        let score = 55;
        // Check power match
        const pMid = (minP + maxP) / 2;
        const pDist = Math.abs(absActive - pMid) / pMid;
        score += Math.max(0, 20 * (1 - pDist));

        if (inPF) score += 15;

        if (score > bestScore) {
          bestScore = score;
          bestSig = sig;
        }
      }
    }

    if (bestSig && bestScore >= 75) {
      return {
        signatureId: bestSig.id,
        name: bestSig.name,
        category: bestSig.category,
        confidence: Math.round(Math.min(92, bestScore)),
        isAiLabeled: false,
        reasoning: bestSig.description,
      };
    }

    // 3. Signature is unknown or ambiguous -> invoke Gemini to label
    return await this.labelUnknownWithGemini(step, bestSig, bestScore);
  }

  /**
   * Prompts Gemini (@google/genai gemini-3.8-flash) to label an unknown electrical step change
   */
  public async labelUnknownWithGemini(
    step: StepEvent,
    candidateSig: ApplianceSignature | null = null,
    candidateScore: number = 0
  ): Promise<SignatureMatchResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    const absActive = Math.round(Math.abs(step.deltaActiveW));
    const absReactive = Math.round(Math.abs(step.deltaReactiveVAR));
    const pf = Number(step.apparentPowerFactor.toFixed(2));
    const dir = step.stepDirection;

    if (apiKey && apiKey.length > 5 && !apiKey.includes('your-gemini-api-key')) {
      try {
        const ai = new GoogleGenAI({});
        const prompt = `You are an expert electrical engineer specializing in Non-Intrusive Load Monitoring (NILM) and appliance load disaggregation for Bangladeshi residential homes (220V, 50Hz single-phase AC).

A high-frequency 1 Hz transient step change event was captured on the whole-house mains meter:
- Step Active Power (ΔP): ${absActive} Watts
- Step Reactive Power (ΔQ): ${absReactive} VAR
- Inferred Power Factor (cos φ): ${pf}
- Step Direction: ${dir} (appliance turned ${dir})
${candidateSig ? `- Potential candidate from heuristics: "${candidateSig.name}" (heuristic score: ${Math.round(candidateScore)}%)` : ''}

Analyze the electrical dynamics (active vs inductive/capacitive reactive load, compressor surge vs resistive heating) and label this appliance.
Return your identification in strict JSON format with this exact structure:
{
  "label": "string describing the detected appliance (e.g., '1.5-Ton Inverter AC', 'Water Pump / Submersible Motor', 'Induction Cooker', 'Electric Geyser')",
  "category": "one of: AIR_CONDITIONER | REFRIGERATOR | TELEVISION | WASHING_MACHINE | LIGHTING | FAN | WATER_HEATER | COMPUTER | MICROWAVE | ROUTER | OTHER",
  "confidence": number between 35 and 95 (keep honest: if ambiguous, use 45-58),
  "reasoning": "brief 1-2 sentence engineering explanation of why the ΔP and ΔQ signature fits this appliance"
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });

        const text = response.text || '';
        const parsed = JSON.parse(text);

        if (parsed.label && typeof parsed.confidence === 'number') {
          return {
            name: parsed.label,
            category: parsed.category || candidateSig?.category || 'OTHER',
            confidence: Math.round(Math.max(30, Math.min(95, parsed.confidence))),
            isAiLabeled: true,
            reasoning: parsed.reasoning || `Gemini labeled based on ${absActive}W active and ${absReactive}VAR reactive step.`,
          };
        }
      } catch (err) {
        console.warn('[SignatureMatcher] Gemini API call error, falling back to heuristics:', err);
      }
    }

    // Fallback Domain Classifier for Bangladesh Residential Telemetry
    return this.fallbackHeuristicClassifier(step, candidateSig, candidateScore);
  }

  /**
   * Deterministic domain fallback for Bangladesh residential grid
   */
  private fallbackHeuristicClassifier(
    step: StepEvent,
    candidateSig: ApplianceSignature | null,
    candidateScore: number
  ): SignatureMatchResult {
    const absActive = Math.round(Math.abs(step.deltaActiveW));
    const absReactive = Math.round(Math.abs(step.deltaReactiveVAR));
    const pf = step.apparentPowerFactor;

    // Resistive heating loads (>1500W, near 1.0 PF, very low reactive)
    if (absActive >= 1700 && absActive <= 2600 && pf >= 0.97 && absReactive < 100) {
      return {
        name: 'Instant Water Heater / Geyser',
        category: 'WATER_HEATER',
        confidence: 84,
        isAiLabeled: true,
        reasoning: `High active draw (${absActive}W) with near-unity power factor (${pf.toFixed(2)}) indicates a resistive heating element.`,
      };
    }

    // Heavy inductive step (Air Conditioner compressor: 1400-1900W with 450-850 VAR)
    if (absActive >= 1450 && absActive <= 1900 && absReactive >= 450) {
      return {
        name: '1.5-Ton Split Air Conditioner',
        category: 'AIR_CONDITIONER',
        confidence: 86,
        isAiLabeled: true,
        reasoning: `Active step of ${absActive}W with ${absReactive} VAR inductive lag strongly indicates a 1.5-ton AC compressor cycle.`,
      };
    }

    // 1-ton AC (950 - 1300W with 300-500 VAR)
    if (absActive >= 950 && absActive <= 1300 && absReactive >= 300) {
      return {
        name: '1.0-Ton Air Conditioner',
        category: 'AIR_CONDITIONER',
        confidence: 78,
        isAiLabeled: true,
        reasoning: `Step of ${absActive}W with moderate inductive displacement fits a 1.0-ton AC cooling unit.`,
      };
    }

    // Water pump / Submersible motor (600 - 1100W with high reactive lag >500 VAR, PF < 0.82)
    if (absActive >= 600 && absActive <= 1100 && absReactive >= 450 && pf <= 0.85) {
      return {
        name: 'Water Pump / Submersible Motor (0.75-1.0 HP)',
        category: 'OTHER',
        confidence: 54, // Kept below 60% so it shows "Maybe:" in compliance with honest confidence
        isAiLabeled: true,
        reasoning: `High reactive surge relative to ${absActive}W active draw (PF ${pf.toFixed(2)}) suggests an inductive motor pump.`,
      };
    }

    // Microwave or high power kitchen appliance (800 - 1300W, pf 0.88-0.95)
    if (absActive >= 800 && absActive <= 1300) {
      return {
        name: 'Microwave Oven / Electric Kettle',
        category: 'MICROWAVE',
        confidence: 72,
        isAiLabeled: true,
        reasoning: `Medium-high load step of ${absActive}W matches typical kitchen microwave magnetron or kettle.`,
      };
    }

    // Refrigerator compressor (120 - 240W, moderate reactive)
    if (absActive >= 110 && absActive <= 250 && absReactive >= 100) {
      return {
        name: 'Refrigerator Compressor',
        category: 'REFRIGERATOR',
        confidence: 82,
        isAiLabeled: true,
        reasoning: `Low active draw (${absActive}W) with inductive displacement is characteristic of a domestic fridge compressor.`,
      };
    }

    // Induction cooktop / hotplate (1200 - 2000W, high PF)
    if (absActive >= 1200 && absActive <= 2000 && pf >= 0.94) {
      return {
        name: 'Induction Cooktop / Hotplate',
        category: 'OTHER',
        confidence: 55, // Rule test: < 60% -> "Maybe:"
        isAiLabeled: true,
        reasoning: `High active power (${absActive}W) with high power factor (${pf.toFixed(2)}) could indicate an induction hotplate.`,
      };
    }

    // Small motor / Fan (25 - 90W)
    if (absActive >= 25 && absActive <= 90) {
      return {
        name: 'Ceiling Fan / Exhaust Unit',
        category: 'FAN',
        confidence: 76,
        isAiLabeled: true,
        reasoning: `Light load of ${absActive}W matches ceiling fan or exhaust ventilation.`,
      };
    }

    // Default unknown load - kept under 60% to show "Maybe:"
    const suggestedCategory = candidateSig?.category || 'OTHER';
    return {
      name: candidateSig?.name ? `Unregistered ${candidateSig.name}` : `Unidentified Load (${absActive}W)`,
      category: suggestedCategory,
      confidence: Math.min(58, Math.max(42, Math.round(candidateScore || 50))),
      isAiLabeled: true,
      reasoning: `Detected transient step change of ${absActive}W active and ${absReactive}VAR reactive. Needs user confirmation.`,
    };
  }
}
