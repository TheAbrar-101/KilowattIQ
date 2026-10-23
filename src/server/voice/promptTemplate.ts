/**
 * KilowattIQ Bangla Voice Advisor Prompt Template & Query Engine
 * 
 * Enforces strict Bangla generation when user input is in Bangla (or when asked).
 * Grounded in deterministic metrics from:
 * - BERC LT-A Tariff Slabs (Step 1 to Step 6)
 * - Active load (W) & non-inverter AC continuous draw
 * - Vampire standby power leakage
 * - Heatwave Cooling Degree Days (CDD) surcharge
 */

import { GoogleGenAI, Type } from '@google/genai';
import { isBanglaText } from './stt';
import { prepareBengaliForSpeech, createBanglaTtsMetadata, BanglaTtsMetadata } from './tts';

export interface VoiceAdvisorContext {
  householdName: string;
  utilityProvider: string;
  sanctionedLoadKw: number;
  currentActiveWatts: number;
  monthlyEstimatedKwh: number;
  projectedBillBDT: number;
  monthlyBudgetBDT: number;
  currentTariffStep: string;
  stepRateBDT: number;
  nextStepThresholdKwh: number;
  kwhToNextStep: number;
  vampireWasteBDT: number;
  topApplianceName: string;
  topApplianceWatts: number;
  isAcOn: boolean;
  heatwaveBillImpactBDT: number;
}

export interface VoiceAdvisoryOutput {
  query: string;
  isBanglaQuery: boolean;
  headline: string;
  spokenSummary: string; // Tailored for TTS (bn-BD) speech synthesis
  detailedExplanation: string;
  causes: Array<{
    title: string;
    description: string;
    impactBDT: number;
    severity: 'high' | 'medium' | 'low';
  }>;
  actionableSteps: string[];
  estimatedMonthlySavingsBDT: number;
  ttsMeta: BanglaTtsMetadata;
  source: 'GEMINI_AI' | 'DETERMINISTIC_ENGINE';
}

/**
 * Builds the strict prompt template that forces Gemini to answer entirely in natural Bangla.
 */
export function buildBanglaVoiceAdvisorPrompt(
  userQuery: string,
  context: VoiceAdvisorContext
): { systemInstruction: string; userPrompt: string } {
  const isBangla = isBanglaText(userQuery);

  const systemInstruction = `You are KilowattIQ's Expert Bangladeshi Household Energy Voice Advisor.
The user is speaking to you using Voice Interaction in Bangladesh.

CRITICAL LANGUAGE RULE:
${isBangla ? `The user's query is in BANGLA: "${userQuery}".
YOU MUST RESPOND 100% IN NATURAL, POLITE, CONVERSATIONAL BENGALI (বাংলা).
NEVER switch to English. Every field (headline, spokenSummary, detailedExplanation, causes, actionableSteps) MUST be written in natural Bengali suitable for spoken Text-to-Speech (TTS).
Avoid stiff literal translation; use standard Bangladeshi everyday phrasing (যেমন: "আপনার বিল বেশি আসার মূল কারণ হলো...", "বিদ্যুৎ বিল কমাতে এখনই...", "টাকা সাশ্রয় হবে")` : `Provide the response in the language matching the user's intent, with high precision and clarity.`}

STRICT TECHNICAL GROUNDING RULES:
1. Ground your explanation in the household's actual metrics:
   - Monthly Consumption: ${context.monthlyEstimatedKwh} kWh
   - Projected Bill: ৳${context.projectedBillBDT} BDT (Budget: ৳${context.monthlyBudgetBDT})
   - Current BERC Tariff Step: ${context.currentTariffStep} (Current unit rate: ৳${context.stepRateBDT}/unit)
   - Buffer to next higher tariff slab: Only ${context.kwhToNextStep} kWh remaining before crossing into higher unit rate!
   - Active Power Load: ${context.currentActiveWatts} Watts (${context.isAcOn ? `AC is currently running drawing ${context.topApplianceWatts}W` : 'AC is off'})
   - Standby Vampire Waste: ~৳${context.vampireWasteBDT}/month
   - Weather / Heatwave Surcharge: +৳${context.heatwaveBillImpactBDT}
2. Explain specifically WHY the bill is high:
   - Explain the BERC Step tariff jumping penalty (Bangladesh slab system).
   - Explain non-inverter compressor cycling in summer.
   - Explain vampire loads left plugged in.
3. The 'spokenSummary' field will be read aloud via Web Speech Synthesis (TTS). Keep it punchy, conversational, and under 3-4 sentences without asterisks or tables.`;

  const userPrompt = `ব্যবহারকারীর প্রশ্ন (User Voice Query): "${userQuery}"

বর্তমান গৃহস্থালি পরিস্থিতি (Current Context):
- গ্রাহক: ${context.householdName} (${context.utilityProvider})
- মাসিক সম্ভাব্য বিল: ৳${context.projectedBillBDT} (বাজেট ৳${context.monthlyBudgetBDT})
- বর্তমান ট্যারিফ স্ল্যাব: ${context.currentTariffStep} (দর: ৳${context.stepRateBDT}/ইউনিট)
- পরবর্তী উচ্চ স্ল্যাবের বাকি: মাত্র ${context.kwhToNextStep} ইউনিট
- চলমান লোড: ${context.currentActiveWatts} ওয়াট
- ভ্যাম্পায়ার পাওয়ার অপচয়: ৳${context.vampireWasteBDT} / মাস
- তীব্র গরমে বাড়তি খরচ: ৳${context.heatwaveBillImpactBDT}

দয়া করে ব্যবহারকারীকে বাংলায় বুঝিয়ে বলুন কেন বিল বেশি এবং এখনই কী কী পদক্ষেপ নেওয়া উচিত।`;

  return { systemInstruction, userPrompt };
}

/**
 * Deterministic Bangla energy advisory fallback when Gemini is unavailable or offline
 */
export function generateDeterministicBanglaAdvisory(
  userQuery: string,
  context: VoiceAdvisorContext
): VoiceAdvisoryOutput {
  const isHighBillQuery = /বিল.*বেশি|কেন.*বেশি|বেশি.*বিল|high.*bill/i.test(userQuery);
  const isAcQuery = /এসি|ac|cooler|ঠান্ডা/i.test(userQuery);
  const isVampireQuery = /ভ্যাম্পায়ার|স্ট্যান্ডবাই|vampire|standby/i.test(userQuery);

  let headline = 'আপনার বিদ্যুৎ বিল কেন বেশি এবং কমানোর উপায়';
  let spokenSummary = `আপনার বর্তমান প্রজেক্টেড বিল ২,২৭৭ টাকা, যা বাজেটের কাছাকাছি। বিল বেশি আসার প্রধান কারণ ডেসকো স্টেপ ৩ স্ল্যাবে পৌঁছানো এবং নন-ইনভার্টার এসির টানা ব্যবহার। এসি ২৫ ডিগ্রিতে চালালে এবং অপ্রয়োজনীয় প্লাগ খুলে রাখলে মাসে প্রায় ৭৫০ টাকা সাশ্রয় সম্ভব।`;
  let detailedExplanation = `কিলোভোল্টআইকিউ অ্যানালিটিক্স অনুযায়ী আপনার বাসা বর্তমানে ডেসকোর 'স্টেপ ৩' (২০১-৩০০ ইউনিট) ট্যারিফ স্ল্যাবে রয়েছে। মাত্র ১৫ ইউনিট অতিরিক্ত ব্যবহার করলেই আপনি পরবর্তী 'স্টেপ ৪' স্ল্যাবে চলে যাবেন, যেখানে প্রতি ইউনিটের দর উল্লেখযোগ্য হারে বৃদ্ধি পায়। এছাড়াও মাস্টার বেডরুমের ১.৫ টন নন-ইনভার্টার এসি একটানা চলায় দিনে প্রায় ১১ ইউনিট বিদ্যুৎ খরচ হচ্ছে।`;

  if (isAcQuery) {
    headline = 'এসি ব্যবহারে বিদ্যুৎ খরচ বিশ্লেষণ ও সাশ্রয়ী টিপস';
    spokenSummary = `আপনার ১.৫ টন নন-ইনভার্টার এসি দিনে ৮ ঘণ্টা চললে মাসে প্রায় ১,৪৫০ টাকা বাড়তি খরচ হয়। তাপমাত্রা ১৮ ডিগ্রির বদলে ২৫ ডিগ্রিতে রাখলে এবং ফ্যান একসাথে চালালে বিদ্যুৎ খরচ ৩৫ শতাংশ কমে আসবে।`;
    detailedExplanation = `গ্রীষ্মকালে ঢাকার অতিরিক্ত আর্দ্রতা ও তাপমাত্রার কারণে নন-ইনভার্টার এসির কম্প্রেসর বিরতিহীনভাবে ১,৬৫০ ওয়াট বিদ্যুৎ টানে। ইনভার্টার প্রযুক্তিতে রূপান্তর অথবা সঠিক থার্মোস্ট্যাট সেটিংসে মাসে সর্বোচ্চ ১,৪৫০ টাকা সাশ্রয় করা সম্ভব।`;
  } else if (isVampireQuery) {
    headline = 'ভ্যাম্পায়ার ও স্ট্যান্ডবাই পাওয়ার অপচয় রোধ';
    spokenSummary = `টিভি, রাউটার ও চার্জার বন্ধ থাকলেও স্ট্যান্ডবাই মোডে মাসে প্রায় ১৮০ টাকার বিদ্যুৎ অপচয় করছে। রাতে স্মার্ট প্লাগের সাহায্যে এগুলি স্বয়ংক্রিয়ভাবে বন্ধ রাখলে এই অপচয় সম্পূর্ণ রোধ করা সম্ভব।`;
    detailedExplanation = `লিভিং রুমের স্মার্ট টিভি ও সেট-টপ বক্স অফ থাকা অবস্থায়ও অনবরত ১২ ওয়াট ফ্যান্টম লোড টেনে নেয়। স্মার্ট প্লাগ দিয়ে শিডিউল করে রাত ১২টা থেকে সকাল ৬টা পর্যন্ত বিদ্যুৎ সংযোগ বিচ্ছিন্ন রাখা সবচেয়ে কার্যকর সমাধান।`;
  }

  const causes = [
    {
      title: 'ট্যারিফ স্ল্যাব অতিক্রমের ঝুঁকি (Step 3 → Step 4)',
      description: `বর্তমানে আপনার ব্যবহার ২৮৫ ইউনিট। পরবর্তী স্ল্যাব শুরু হতে বাকি মাত্র ${context.kwhToNextStep} ইউনিট। পরবর্তী ধাপে প্রতি ইউনিটের দাম বৃদ্ধি পাবে।`,
      impactBDT: 320,
      severity: 'high' as const,
    },
    {
      title: 'নন-ইনভার্টার এসি একটানা লোড',
      description: 'গরমের কারণে মাস্টার বেডরুমের এসি একটানা ১,৬৫০ ওয়াট টানছে। তাপমাত্রা ২৫° সেঃ এ রাখলে তাৎক্ষণিক সাশ্রয় হবে।',
      impactBDT: 580,
      severity: 'high' as const,
    },
    {
      title: 'স্ট্যান্ডবাই ভ্যাম্পায়ার লোড অপচয়',
      description: 'টিভি, মাইক্রোওয়েভ ও চার্জার প্লাগে থাকায় প্রতি মাসে স্ট্যান্ডবাই মোডে বিদ্যুৎ অপচয় হচ্ছে।',
      impactBDT: context.vampireWasteBDT || 180,
      severity: 'medium' as const,
    },
  ];

  const actionableSteps = [
    'এসি ১৮° থেকে বাড়িয়ে ২৫° সেটিংসে রাখুন (প্রতি ১ ডিগ্রিতে ৫% বিদ্যুৎ সাশ্রয়)',
    'পিক আওয়ার (বিকাল ৫টা থেকে রাত ১১টা) এর পরিবর্তে অফ-পিক আওয়ারে ওয়াশিং মেশিন চালান',
    'টিভি ও সেট-টপ বক্সের প্রধান সুইচ বন্ধ করুন অথবা স্মার্ট প্লাগ শিডিউল করুন',
    'মাসে ৩০০ ইউনিটের নিচে থাকতে প্রতি সপ্তাহে বিদ্যুৎ খরচের নোটিফিকেশন চেক করুন',
  ];

  return {
    query: userQuery,
    isBanglaQuery: isBanglaText(userQuery),
    headline,
    spokenSummary,
    detailedExplanation,
    causes,
    actionableSteps,
    estimatedMonthlySavingsBDT: 760,
    ttsMeta: createBanglaTtsMetadata(spokenSummary),
    source: 'DETERMINISTIC_ENGINE',
  };
}

/**
 * Orchestrates voice advisory generation using Gemini with deterministic fallback
 */
export async function generateBanglaVoiceAdvisory(
  userQuery: string,
  context?: Partial<VoiceAdvisorContext>
): Promise<VoiceAdvisoryOutput> {
  const fullContext: VoiceAdvisorContext = {
    householdName: context?.householdName || 'Gulshan Residence',
    utilityProvider: context?.utilityProvider || 'DESCO',
    sanctionedLoadKw: context?.sanctionedLoadKw || 3.0,
    currentActiveWatts: context?.currentActiveWatts || 4296,
    monthlyEstimatedKwh: context?.monthlyEstimatedKwh || 285,
    projectedBillBDT: context?.projectedBillBDT || 2277,
    monthlyBudgetBDT: context?.monthlyBudgetBDT || 3000,
    currentTariffStep: context?.currentTariffStep || 'Step 3 (201 - 300 kWh)',
    stepRateBDT: context?.stepRateBDT || 7.34,
    nextStepThresholdKwh: context?.nextStepThresholdKwh || 300,
    kwhToNextStep: context?.kwhToNextStep || 15,
    vampireWasteBDT: context?.vampireWasteBDT || 180,
    topApplianceName: context?.topApplianceName || 'Master Bedroom 1.5T AC',
    topApplianceWatts: context?.topApplianceWatts || 1650,
    isAcOn: context?.isAcOn ?? true,
    heatwaveBillImpactBDT: context?.heatwaveBillImpactBDT || 0,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return generateDeterministicBanglaAdvisory(userQuery, fullContext);
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const { systemInstruction, userPrompt } = buildBanglaVoiceAdvisorPrompt(userQuery, fullContext);

    const schema = {
      type: Type.OBJECT,
      properties: {
        headline: { type: Type.STRING, description: 'Short punchy headline in natural Bangla' },
        spokenSummary: { type: Type.STRING, description: 'Spoken answer for TTS in natural Bangla (3-4 sentences)' },
        detailedExplanation: { type: Type.STRING, description: 'In-depth explanation in natural Bangla referencing BERC slabs and appliances' },
        causes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              impactBDT: { type: Type.NUMBER },
              severity: { type: Type.STRING },
            },
            required: ['title', 'description', 'impactBDT', 'severity'],
          },
        },
        actionableSteps: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        estimatedMonthlySavingsBDT: { type: Type.NUMBER },
      },
      required: ['headline', 'spokenSummary', 'detailedExplanation', 'causes', 'actionableSteps', 'estimatedMonthlySavingsBDT'],
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Voice Advisor Gemini API timeout')), 6500)
    );

    const generatePromise = ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });

    const response = (await Promise.race([generatePromise, timeoutPromise])) as any;
    const jsonText = response.text;
    if (!jsonText) throw new Error('Empty response from Gemini');

    const parsed = JSON.parse(jsonText);
    const spokenSummary = parsed.spokenSummary || parsed.headline;

    return {
      query: userQuery,
      isBanglaQuery: isBanglaText(userQuery),
      headline: parsed.headline,
      spokenSummary,
      detailedExplanation: parsed.detailedExplanation,
      causes: parsed.causes || [],
      actionableSteps: parsed.actionableSteps || [],
      estimatedMonthlySavingsBDT: Number(parsed.estimatedMonthlySavingsBDT) || 650,
      ttsMeta: createBanglaTtsMetadata(spokenSummary),
      source: 'GEMINI_AI',
    };
  } catch (err: any) {
    console.warn('[VoiceAdvisor] Falling back to deterministic Bangla advisory:', err?.message);
    return generateDeterministicBanglaAdvisory(userQuery, fullContext);
  }
}
