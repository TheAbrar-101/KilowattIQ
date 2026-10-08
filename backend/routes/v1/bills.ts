/**
 * Express REST API Routes - Bill Verification & OCR Subsystem
 * 
 * Endpoints:
 * - POST   /api/v1/bills/extract: Run Gemini Vision OCR on bill photo
 * - POST   /api/v1/bills/verify: Verify bill numbers against TariffCalculator
 * - GET    /api/v1/bills/history: Retrieve verified bill history for trend
 * - DELETE /api/v1/bills/:id: Delete verification record
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { BillOcrExtractor } from '../../../src/server/bills/ocrExtractor';
import { BillVerifier } from '../../../src/server/bills/billVerifier';

const router = Router();
const ocrExtractor = BillOcrExtractor.getInstance();
const billVerifier = BillVerifier.getInstance();

// POST /api/v1/bills/extract
router.post('/extract', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { imageBase64, mimeType, manualData } = req.body;

    if (manualData) {
      const extracted = ocrExtractor.parseManualInput(manualData);
      return res.json({
        status: 'success',
        message: 'Bill data processed successfully.',
        data: extracted,
      });
    }

    if (!imageBase64) {
      return res.status(400).json({
        status: 'error',
        message: 'Either imageBase64 or manualData is required.',
      });
    }

    const extracted = await ocrExtractor.extractFromImage(imageBase64, mimeType || 'image/jpeg');
    return res.json({
      status: 'success',
      message: 'Bill OCR extraction completed.',
      data: extracted,
    });
  } catch (err: any) {
    console.error('[BillsRoute] Extraction error:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to extract bill parameters.',
    });
  }
});

// POST /api/v1/bills/verify
router.post('/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { householdId, billData, sanctionedLoadKw, billImageUrl } = req.body;

    const targetHouseholdId = householdId || (req.user?.id ? `hh_${req.user.id}` : 'hh_default');

    if (!billData || typeof billData.unitsKwh !== 'number' || typeof billData.totalBdt !== 'number') {
      return res.status(400).json({
        status: 'error',
        message: 'Valid billData containing unitsKwh and totalBdt is required.',
      });
    }

    const result = billVerifier.verifyBill(
      targetHouseholdId,
      billData,
      sanctionedLoadKw,
      billImageUrl
    );

    return res.json({
      status: 'success',
      message: 'Bill verified against BERC residential slabs.',
      data: result,
    });
  } catch (err: any) {
    console.error('[BillsRoute] Verification error:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to verify bill.',
    });
  }
});

// GET /api/v1/bills/history
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || (req.user?.id ? `hh_${req.user.id}` : 'hh_default');
    const history = billVerifier.getHistory(householdId);

    return res.json({
      status: 'success',
      data: history,
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to retrieve bill history.',
    });
  }
});

// DELETE /api/v1/bills/:id
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || (req.user?.id ? `hh_${req.user.id}` : 'hh_default');
    const recordId = req.params.id;

    billVerifier.deleteHistoryRecord(householdId, recordId);
    return res.json({
      status: 'success',
      message: 'Bill record deleted.',
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err.message || 'Failed to delete bill record.',
    });
  }
});

export default router;
