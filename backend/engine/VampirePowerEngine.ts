import { VampirePowerReport } from '../../shared/types/energy';
import { Appliance, Room } from '../../shared/types/household';

export class VampirePowerEngine {
  /**
   * Audits appliances for standby/vampire power loss during off-hours
   */
  static analyzeVampirePower(
    appliances: Appliance[],
    rooms: Room[],
    avgKwhCostBDT: number = 8.02 // Step 4 default BD slab rate
  ): VampirePowerReport[] {
    const roomMap = new Map<string, string>(rooms.map(r => [r.id, r.name]));

    return appliances
      .filter(app => app.standbyPowerW > 2 || app.isVampireRisk)
      .map(app => {
        const standbyWatts = app.standbyPowerW || 12;
        // Non-active hours in a 24h day
        const standbyHoursPerDay = Math.max(0, 24 - app.averageHoursPerDay);
        const dailyStandbyKwh = (standbyWatts * standbyHoursPerDay) / 1000;
        const monthlyWastedBDT = dailyStandbyKwh * 30 * avgKwhCostBDT;
        const annualWastedBDT = monthlyWastedBDT * 12;

        let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
        if (monthlyWastedBDT > 250) severity = 'HIGH';
        else if (monthlyWastedBDT > 80) severity = 'MEDIUM';

        return {
          applianceId: app.id,
          applianceName: app.name,
          roomName: roomMap.get(app.roomId) || 'Main Area',
          standbyWatts,
          dailyStandbyKwh: Number(dailyStandbyKwh.toFixed(3)),
          monthlyWastedBDT: Number(monthlyWastedBDT.toFixed(2)),
          annualWastedBDT: Number(annualWastedBDT.toFixed(2)),
          severity,
        };
      })
      .sort((a, b) => b.monthlyWastedBDT - a.monthlyWastedBDT);
  }
}
