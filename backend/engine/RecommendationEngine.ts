import { RecommendationItem } from '../../shared/types/energy';
import { Appliance } from '../../shared/types/household';

export class RecommendationEngine {
  /**
   * Generates localized energy efficiency recommendations
   */
  static generateRecommendations(
    appliances: Appliance[],
    currentMonthlyKwh: number,
    currentStepName: string
  ): RecommendationItem[] {
    const recommendations: RecommendationItem[] = [];

    // Check for Non-Inverter AC
    const nonInverterACs = appliances.filter(a => a.category === 'AIR_CONDITIONER' && !a.isInverterType);
    if (nonInverterACs.length > 0) {
      recommendations.push({
        id: 'rec_ac_inverter',
        title: 'Upgrade Non-Inverter AC to 5-Star Inverter Model',
        category: 'APPLIANCE_UPGRADE',
        priority: 'HIGH',
        description: `You have ${nonInverterACs.length} non-inverter Air Conditioner(s). Replacing a 1.5 Ton non-inverter AC with an inverter AC reduces cooling power consumption by up to 45% in Bangladeshi summer conditions.`,
        estimatedMonthlySavingsBDT: 1450 * nonInverterACs.length,
        actionableStep: 'Set target temperature to 25°C and consider replacing non-inverter units to achieve a ~1.8 year payback period.',
      });
    }

    // Peak-hour load shifting
    if (currentMonthlyKwh > 200) {
      recommendations.push({
        id: 'rec_peak_shift',
        title: 'Shift Heavy Load Usage Away From Peak Hours (5 PM - 11 PM)',
        category: 'PEAK_SHIFTING',
        priority: 'HIGH',
        description: 'Running water heaters (geysers), washing machines, and water pumps during evening peak hours (17:00 to 23:00) puts high demand on national grid and increases peak tariff rates.',
        estimatedMonthlySavingsBDT: 380,
        actionableStep: 'Schedule water pumping and laundry operations between 7:00 AM and 4:00 PM.',
      });
    }

    // Vampire power elimination
    const vampireCount = appliances.filter(a => a.isVampireRisk || a.standbyPowerW > 10).length;
    if (vampireCount > 0) {
      recommendations.push({
        id: 'rec_vampire_kill',
        title: 'Eliminate Phantom Standby Power with Smart Plugs',
        category: 'VAMPIRE_POWER',
        priority: 'MEDIUM',
        description: `Found ${vampireCount} appliances drawing continuous standby power (TV set-top boxes, microwave clocks, chargers).`,
        estimatedMonthlySavingsBDT: 240,
        actionableStep: 'Use smart Wi-Fi cut-off plugs or main switch extension boards to cut power automatically at night.',
      });
    }

    // Fridge coils & temperature optimization
    const fridges = appliances.filter(a => a.category === 'REFRIGERATOR');
    if (fridges.length > 0) {
      recommendations.push({
        id: 'rec_fridge_opt',
        title: 'Optimize Refrigerator Wall Clearance & Gasket Seal',
        category: 'BEHAVIORAL',
        priority: 'LOW',
        description: 'Keeping refrigerators too close to walls reduces heat dissipation from condenser coils, forcing compressor to work 20% harder.',
        estimatedMonthlySavingsBDT: 160,
        actionableStep: 'Maintain at least 4 inches (10 cm) clearance behind the refrigerator and inspect door magnetic rubber seals.',
      });
    }

    return recommendations;
  }
}
