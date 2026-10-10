/**
 * Express REST API Routes - Bill Payments, Prepaid Top-Up & Tokenized Wallets
 * 
 * Endpoints:
 * - POST   /api/v1/payments/pay-bill: Settle DESCO/DPDC residential utility bill
 * - POST   /api/v1/payments/prepaid-topup: Top up prepaid meter and receive 20-digit STS token
 * - GET    /api/v1/payments/methods: Get saved tokenized payment methods (PCI-safe)
 * - POST   /api/v1/payments/methods: Save new tokenized wallet
 * - DELETE /api/v1/payments/methods/:id: Delete tokenized wallet
 * - GET    /api/v1/payments/history: Retrieve transaction history & receipts
 * - GET    /api/v1/payments/receipts/:id: Retrieve single receipt
 * - GET    /api/v1/payments/auto-pay: Get AutoPay configuration
 * - POST   /api/v1/payments/auto-pay: Update AutoPay with user confirmation
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { PaymentManager } from '../../../src/server/payments/paymentManager';
import { PaymentProvider, UtilityProvider } from '../../../src/server/payments/types';
import { SupabaseService } from '../../services/SupabaseService';

const router = Router();
const paymentManager = PaymentManager.getInstance();
const db = SupabaseService.getInstance();

// GET /api/v1/payments/methods
router.get('/methods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const methods = paymentManager.getPaymentMethods(householdId);

    return res.json({
      status: 'success',
      data: { methods },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to fetch payment methods' });
  }
});

// POST /api/v1/payments/methods
router.post('/methods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { provider, phoneNumber, alias, otp, isDefault } = req.body;

    if (!provider || !phoneNumber || !otp) {
      return res.status(400).json({ status: 'error', message: 'provider, phoneNumber, and otp are required' });
    }

    const saved = await paymentManager.addPaymentMethod(householdId, {
      provider: provider as PaymentProvider,
      phoneNumber,
      alias: alias || `${provider} Account`,
      otp,
      isDefault: Boolean(isDefault),
    });

    return res.json({
      status: 'success',
      data: { method: saved },
      message: `${provider} tokenized wallet saved securely (PCI-safe)`,
    });
  } catch (err: any) {
    return res.status(400).json({ status: 'error', message: err?.message || 'Failed to save payment method' });
  }
});

// DELETE /api/v1/payments/methods/:id
router.delete('/methods/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const methodId = req.params.id;

    const removed = paymentManager.removePaymentMethod(householdId, methodId);
    return res.json({
      status: 'success',
      data: { removed },
      message: removed ? 'Payment method deleted' : 'Payment method not found',
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to delete payment method' });
  }
});

// POST /api/v1/payments/pay-bill
router.post('/pay-bill', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const household = await db.getHouseholdById(householdId);

    const {
      amountBDT,
      provider = 'BKASH',
      accountNumber,
      meterNumber,
      utilityProvider = 'DESCO',
      consumerName,
      consumerPhone,
      savedMethodId,
      otpOrToken,
    } = req.body;

    if (!amountBDT || amountBDT <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid amountBDT is required' });
    }

    const receipt = await paymentManager.payPostpaidBill({
      householdId,
      amountBDT: Number(amountBDT),
      provider: provider as PaymentProvider,
      accountNumber: accountNumber || household?.accountNumber || '8820-9941-01',
      meterNumber: meterNumber || 'MTR-DESCO-9921',
      utilityProvider: (utilityProvider || household?.utilityProvider || 'DESCO') as UtilityProvider,
      consumerName: consumerName || household?.name || 'Tanvir Hossain',
      consumerPhone: consumerPhone || '01711889210',
      savedMethodId,
      otpOrToken,
    });

    return res.json({
      status: 'success',
      data: { receipt },
      message: 'Utility bill paid successfully',
    });
  } catch (err: any) {
    console.error('[PaymentRoute ERROR] pay-bill failed:', err);
    return res.status(400).json({ status: 'error', message: err?.message || 'Bill payment failed' });
  }
});

// POST /api/v1/payments/prepaid-topup
router.post('/prepaid-topup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const household = await db.getHouseholdById(householdId);

    const {
      amountBDT,
      provider = 'BKASH',
      accountNumber,
      meterNumber,
      utilityProvider = 'DESCO',
      consumerName,
      consumerPhone,
      savedMethodId,
      otpOrToken,
    } = req.body;

    if (!amountBDT || amountBDT <= 0) {
      return res.status(400).json({ status: 'error', message: 'Valid amountBDT is required' });
    }

    const receipt = await paymentManager.topUpPrepaidMeter({
      householdId,
      amountBDT: Number(amountBDT),
      provider: provider as PaymentProvider,
      accountNumber: accountNumber || household?.accountNumber || '8820-9941-01',
      meterNumber: meterNumber || 'MTR-DESCO-9921',
      utilityProvider: (utilityProvider || household?.utilityProvider || 'DESCO') as UtilityProvider,
      consumerName: consumerName || household?.name || 'Tanvir Hossain',
      consumerPhone: consumerPhone || '01711889210',
      savedMethodId,
      otpOrToken,
    });

    return res.json({
      status: 'success',
      data: {
        receipt,
        stsToken: receipt.prepaidTokenSTS,
        energyUnitsCreditedKwh: receipt.energyUnitsCreditedKwh,
      },
      message: 'Prepaid top-up completed and 20-digit STS token generated',
    });
  } catch (err: any) {
    console.error('[PaymentRoute ERROR] prepaid-topup failed:', err);
    return res.status(400).json({ status: 'error', message: err?.message || 'Prepaid top-up failed' });
  }
});

// GET /api/v1/payments/history
router.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const history = paymentManager.getPaymentHistory(householdId);

    return res.json({
      status: 'success',
      data: {
        history,
        totalTransactions: history.length,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to fetch payment history' });
  }
});

// GET /api/v1/payments/receipts/:id
router.get('/receipts/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const receipt = paymentManager.getReceiptById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ status: 'error', message: 'Receipt not found' });
    }

    return res.json({
      status: 'success',
      data: { receipt },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to retrieve receipt' });
  }
});

// GET /api/v1/payments/auto-pay
router.get('/auto-pay', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const config = paymentManager.getAutoPayConfig(householdId);

    return res.json({
      status: 'success',
      data: { config },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to fetch auto-pay config' });
  }
});

// POST /api/v1/payments/auto-pay
router.post('/auto-pay', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { isEnabled, paymentMethodId, monthlyCapBDT, triggerType, lowBalanceThresholdBDT, topUpAmountBDT, confirmedByUser } = req.body;

    const updated = paymentManager.updateAutoPayConfig(householdId, {
      isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : undefined,
      paymentMethodId,
      monthlyCapBDT: monthlyCapBDT !== undefined ? Number(monthlyCapBDT) : undefined,
      triggerType,
      lowBalanceThresholdBDT: lowBalanceThresholdBDT !== undefined ? Number(lowBalanceThresholdBDT) : undefined,
      topUpAmountBDT: topUpAmountBDT !== undefined ? Number(topUpAmountBDT) : undefined,
      confirmedByUser: confirmedByUser !== undefined ? Boolean(confirmedByUser) : undefined,
    });

    return res.json({
      status: 'success',
      data: { config: updated },
      message: 'Auto-Pay settings updated successfully',
    });
  } catch (err: any) {
    return res.status(400).json({ status: 'error', message: err?.message || 'Failed to update auto-pay config' });
  }
});

export default router;
