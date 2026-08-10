import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { TariffCalculator } from '../../engine/TariffCalculator';
import { VampirePowerEngine } from '../../engine/VampirePowerEngine';
import { ROICalculator } from '../../engine/ROICalculator';
import { ReportService } from '../../services/ReportService';

const router = Router();
const db = SupabaseService.getInstance();

// GET /api/v1/reports/export?householdId=...
router.get('/export', async (req: AuthenticatedRequest, res: Response) => {
  const householdId = (req.query.householdId as string) || 'hh_gulshan_01';
  const household = await db.getHouseholdById(householdId);

  if (!household) {
    return res.status(404).json({ status: 'error', message: 'Household not found' });
  }

  const rooms = await db.getRooms(householdId);
  const appliances = await db.getAppliances(householdId);

  const costCalc = TariffCalculator.calculateCost(285, household.sanctionedLoadKw, 'SLAB');
  const vampireReports = VampirePowerEngine.analyzeVampirePower(appliances, rooms);
  
  const defaultRoi = [
    ROICalculator.calculateUpgradeROI('1.5T Non-Inverter AC', '1.5T 5-Star Inverter AC', 1650, 1050, 7, 62000, 8.02),
    ROICalculator.calculateUpgradeROI('75W Standard Fan', '28W BLDC Fan', 75, 28, 12, 4200, 8.02)
  ];

  const csvContent = ReportService.generateCSVReport(household, costCalc, vampireReports, defaultRoi);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=KilowattIQ_Audit_${householdId}.csv`);
  res.status(200).send(csvContent);
});

export default router;
