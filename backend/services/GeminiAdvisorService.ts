import { GoogleGenAI, Type } from '@google/genai';
import { AiAdvisoryResponse, RecommendationItem } from '../../shared/types/energy';

export interface EnergyContextPayload {
  householdName: string;
  sanctionedLoadKw: number;
  currentActiveWatts: number;
  monthlyKwh: number;
  projectedBillBDT: number;
  monthlyBudgetBDT: number;
  overagePercentage: number;
  tariffSlabName: string;
  vampirePowerBDT: number;
  topAppliances: Array<{ name: string; powerW: number; isOn: boolean }>;
  deterministicRecommendations: RecommendationItem[];
  language: 'en' | 'bn';
}

export class GeminiAdvisorService {
  /**
   * Generates natural language AI energy advisory content based on deterministic backend calculations.
   */
  static async generateAdvisory(
    payload: EnergyContextPayload
  ): Promise<{ available: boolean; aiAdvice?: AiAdvisoryResponse; fallbackReason?: string }> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === '') {
      return {
        available: false,
        fallbackReason: 'GEMINI_API_KEY is not configured in backend environment. Operating in Deterministic Energy Advisory mode.',
        aiAdvice: this.generateDeterministicFallback(payload),
      };
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const advisorySchema = {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'Executive energy summary explaining usage and financial projection.',
          },
          priorityActions: {
            type: Type.ARRAY,
            description: 'Prioritized energy and cost savings actions.',
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                reason: { type: Type.STRING },
                impact: { type: Type.STRING, description: 'high, medium, or low' },
              },
              required: ['title', 'reason', 'impact'],
            },
          },
          explanation: {
            type: Type.STRING,
            description: 'Detailed breakdown explaining DESCO tariff slabs, peak load reduction, or vampire power savings.',
          },
          language: { type: Type.STRING, description: 'en or bn' },
        },
        required: ['summary', 'priorityActions', 'explanation', 'language'],
      };

      const systemInstruction = `You are KilowattIQ's Expert Household Energy Advisor for Bangladesh.
Your role is to summarize and explain the deterministic energy calculations provided in the prompt for a Bangladeshi household user.

STRICT CONSTRAINTS:
1. DO NOT invent, alter, or override ANY numerical values. All cost estimates (BDT), kWh numbers, current load (Watts), and savings figures MUST come directly from the supplied data.
2. DO NOT claim physical IoT hardware is connected or DESCO live API connectivity unless explicitly stated in the input data.
3. If language is 'bn', write ALL fields (summary, priorityActions, explanation) in natural, idiomatic Bangla suitable for Bangladeshi homeowners. Do not use literal robotic translations or unneeded English technical jargon.
4. If language is 'en', write in clear, professional, friendly English.
5. Explain recommendations using supplied deterministic values and Bangladesh DESCO LT-A tariff slab context.`;

      const promptText = `Please analyze the following household energy metrics and deterministic recommendations:

Household Name: ${payload.householdName}
Sanctioned Load: ${payload.sanctionedLoadKw} kW
Current Active Load: ${payload.currentActiveWatts} W
Current Estimated Monthly Consumption: ${payload.monthlyKwh} kWh
Projected Monthly Bill: BDT ${payload.projectedBillBDT}
Monthly Budget: BDT ${payload.monthlyBudgetBDT} (Overage: ${payload.overagePercentage}%)
Current Tariff Slab: ${payload.tariffSlabName}
Standby / Vampire Power Waste: BDT ${payload.vampirePowerBDT} / month

Top Appliances:
${payload.topAppliances.map(a => `- ${a.name}: ${a.powerW}W (${a.isOn ? 'ON' : 'OFF'})`).join('\n')}

Deterministic Recommendations from Calculation Engine:
${payload.deterministicRecommendations
  .map(
    (r, i) =>
      `${i + 1}. [${r.priority}] ${r.title}\n   Description: ${r.description}\n   Est. Monthly Savings: BDT ${r.estimatedMonthlySavingsBDT}\n   Actionable Step: ${r.actionableStep}`
  )
  .join('\n\n')}

Requested Response Language: ${payload.language === 'bn' ? 'Bangla (bn)' : 'English (en)'}

Return the advisory response in the requested JSON structure.`;

      // Call Gemini Flash with timeout wrapper
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 6 seconds')), 6000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptText,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: advisorySchema,
        },
      });

      const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

      const jsonText = response.text;
      if (!jsonText) {
        throw new Error('Empty response from Gemini API');
      }

      const parsed: AiAdvisoryResponse = JSON.parse(jsonText);

      // Validate required properties
      if (!parsed.summary || !Array.isArray(parsed.priorityActions) || !parsed.explanation) {
        throw new Error('Incomplete JSON schema returned by Gemini model');
      }

      // Ensure valid impact values
      const validActions = parsed.priorityActions.map(act => ({
        title: act.title || 'Action',
        reason: act.reason || '',
        impact: (['high', 'medium', 'low'].includes(act.impact?.toLowerCase())
          ? act.impact.toLowerCase()
          : 'medium') as 'high' | 'medium' | 'low',
      }));

      return {
        available: true,
        aiAdvice: {
          summary: parsed.summary,
          priorityActions: validActions,
          explanation: parsed.explanation,
          language: payload.language === 'bn' ? 'bn' : 'en',
        },
      };
    } catch (err: any) {
      let cleanReason = 'AI service temporarily unavailable.';

      const rawMsg = err?.message || String(err);
      if (typeof rawMsg === 'string') {
        try {
          const parsedErr = JSON.parse(rawMsg);
          if (parsedErr?.error?.message) {
            cleanReason = parsedErr.error.message;
          } else {
            cleanReason = rawMsg;
          }
        } catch {
          cleanReason = rawMsg;
        }
      }

      if (
        cleanReason.includes('Quota exceeded') ||
        cleanReason.includes('429') ||
        cleanReason.includes('RESOURCE_EXHAUSTED') ||
        cleanReason.includes('limit: 0')
      ) {
        cleanReason = 'Gemini API free tier quota or rate limit reached. Rule-based energy advisor calculations active.';
      }

      console.warn(`[GeminiAdvisorService] Advisory fallback triggered: ${cleanReason}`);

      return {
        available: false,
        fallbackReason: cleanReason,
        aiAdvice: this.generateDeterministicFallback(payload),
      };
    }
  }

  /**
   * Generates deterministic, localized energy advisory in English or Bangla
   * when LLM credentials are not configured or rate-limited.
   */
  private static generateDeterministicFallback(payload: EnergyContextPayload): AiAdvisoryResponse {
    const isBn = payload.language === 'bn';

    if (isBn) {
      const summary = `${payload.householdName}-এর বর্তমান সক্রিয় বিদ্যুৎ লোড ${payload.currentActiveWatts} ওয়াট এবং মাসিক আনুমানিক খরচ ${payload.monthlyKwh} ইউনিট (আনুমানিক মোট বিল: ৳${payload.projectedBillBDT.toLocaleString('en-US', { maximumFractionDigits: 0 })})। অনুমোদিত লোড ${payload.sanctionedLoadKw} কিলোওয়াট এবং মাসিক বাজেট ৳${payload.monthlyBudgetBDT.toLocaleString('en-US', { maximumFractionDigits: 0 })}-এর বিপরীতে আপনার খরচ বর্তমানে ${
        payload.overagePercentage > 0
          ? `${payload.overagePercentage.toFixed(1)}% বাজেটের বেশি রয়েছে।`
          : 'বাজেটের মধ্যে সুরক্ষিত রয়েছে।'
      }`;

      const priorityActions = (payload.deterministicRecommendations || []).slice(0, 3).map(rec => ({
        title: rec.title,
        reason: rec.description,
        impact: rec.priority.toLowerCase() as 'high' | 'medium' | 'low',
      }));

      if (priorityActions.length === 0) {
        priorityActions.push(
          {
            title: 'পিক আওয়ার লোড স্থানান্তর',
            reason: 'বিকাল ৫টা থেকে রাত ১১টা পর্যন্ত উচ্চ শক্তির এসি বা গিজার ব্যবহার কমিয়ে বিদ্যুতের চাপ হ্রাস করুন।',
            impact: 'high',
          },
          {
            title: 'স্ট্যান্ডবাই ভ্যাম্পায়ার বিদ্যুৎ রোধ',
            reason: `স্ট্যান্ডবাই মোডে টিভি, মাইক্রোওয়েভ ও চার্জার বন্ধ করে মাসে প্রায় ৳${payload.vampirePowerBDT} সাশ্রয় করুন।`,
            impact: 'medium',
          }
        );
      }

      const explanation = `১. ডেসকো/ডিপিডিসি স্ল্যাব বিশ্লেষণ: আপনার পরিবার বর্তমানে "${payload.tariffSlabName}" স্তরে বিদ্যুৎ ব্যবহার করছে। পরবর্তী উচ্চতর স্ল্যাবে গেলে প্রতি ইউনিটের মূল্য উল্লেখযোগ্য হারে বৃদ্ধি পাবে।
২. অনুমোদিত লোড সুরক্ষা: আপনার সর্বোচ্চ অনুমোদিত লোড ${payload.sanctionedLoadKw} kW। একাধিক ভারী সরঞ্জাম (যেমন একাধিক এসি ও ওয়াটার হিটার) একসাথে চালালে অতিরিক্ত লোড পেনাল্টি বা মিটার ট্রিপ হতে পারে।
৩. ভ্যাম্পায়ার পাওয়ার: স্ট্যান্ডবাই প্লাগ লোড থেকে মাসে আনুমানিক ৳${payload.vampirePowerBDT} অপচয় হচ্ছে। স্মার্ট প্লাগ বা সুইচ ব্যবহার করে এই সাশ্রয় নিশ্চিত করা সম্ভব।`;

      return {
        summary,
        priorityActions,
        explanation,
        language: 'bn',
      };
    }

    // English Fallback
    const summary = `${payload.householdName} is currently drawing ${payload.currentActiveWatts} W of active load with projected monthly consumption of ${payload.monthlyKwh} kWh (projected bill: ৳${payload.projectedBillBDT.toLocaleString('en-US', { maximumFractionDigits: 0 })}). Compared against your sanctioned load of ${payload.sanctionedLoadKw} kW and monthly budget of ৳${payload.monthlyBudgetBDT.toLocaleString('en-US', { maximumFractionDigits: 0 })}, usage is ${
      payload.overagePercentage > 0
        ? `${payload.overagePercentage.toFixed(1)}% over your set budget.`
        : 'well within your allocated monthly budget.'
    }`;

    const priorityActions = (payload.deterministicRecommendations || []).slice(0, 3).map(rec => ({
      title: rec.title,
      reason: rec.description,
      impact: rec.priority.toLowerCase() as 'high' | 'medium' | 'low',
    }));

    if (priorityActions.length === 0) {
      priorityActions.push(
        {
          title: 'Shift Inductive Loads off Peak Hours',
          reason: 'Avoid concurrent running of Air Conditioners and Water Geysers during national peak hours (5:00 PM – 11:00 PM).',
          impact: 'high',
        },
        {
          title: 'Eliminate Phantom Standby Waste',
          reason: `Unplug idle appliances (microwave clocks, TV standby, set-top boxes) to reclaim ~৳${payload.vampirePowerBDT}/month in wasted energy.`,
          impact: 'medium',
        }
      );
    }

    const explanation = `1. DESCO LT-A Slab Context: Your household is currently consuming in "${payload.tariffSlabName}". Under Bangladesh BERC residential tariff rules, crossing into higher tiers incurs steeper marginal rates per kWh.
2. Sanctioned Demand Management: Your sanctioned load is ${payload.sanctionedLoadKw} kW. Keeping combined peak load under this threshold avoids utility demand penalties and feeder circuit breaker trips.
3. Standby Vampire Loads: Approximately ৳${payload.vampirePowerBDT}/month is lost to standby leakage. Using smart power strips for entertainment units and chargers delivers immediate recurring savings.`;

    return {
      summary,
      priorityActions,
      explanation,
      language: 'en',
    };
  }
}
