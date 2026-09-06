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
        fallbackReason: 'GEMINI_API_KEY is not configured in backend environment.',
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

      // Call Gemini 2.0 Flash with timeout wrapper
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 6 seconds')), 6000)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-2.0-flash',
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
      };
    }
  }
}
