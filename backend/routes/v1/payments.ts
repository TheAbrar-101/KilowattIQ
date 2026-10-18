/**
 * Express REST API Routes - Bill Payments, Prepaid Top-Up & Tokenized Wallets
 * 
 * RBAC Enforced:
 * - Read (methods, history, receipts): Household members (Owner, Family, Auditor)
 * - Mutations (pay-bill, prepaid-topup, auto-pay, methods): OWNER & ADMIN ONLY.
 *   Family members and Utility auditors are rejected with HTTP 403 Forbidden.
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { PaymentManager } from '../../../src/server/payments/paymentManager';
import { PaymentProvider, UtilityProvider } from '../../../src/server/payments/types';
import { SupabaseService } from '../../services/SupabaseService';
import { AuditService } from '../../services/AuditService';
import { canModifyBilling, normalizeRole, UserRole } from '../../../src/server/auth/roles';

const router = Router();
const paymentManager = PaymentManager.getInstance();
const db = SupabaseService.getInstance();
const auditService = AuditService.getInstance();

function checkBillingPermission(req: AuthenticatedRequest, householdId: string): { allowed: boolean; role: UserRole } {
  const role = normalizeRole(req.user?.householdRole || req.user?.role);
  return { allowed: canModifyBilling(role), role };
}

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

// POST /api/v1/payments/methods (Owner/Admin only)
router.post('/methods', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { allowed, role } = checkBillingPermission(req, householdId);

    if (!allowed) {
      await auditService.log({
        householdId,
        userId: req.user?.id || 'unknown',
        userName: req.user?.fullName || 'User',
        userEmail: req.user?.email || 'unknown',
        userRole: role,
        action: 'UNAUTHORIZED_PAYMENT_METHOD_ATTEMPT',
        entityType: 'billing',
        status: 'FORBIDDEN',
        reason: 'Role lacks canModifyBilling privilege',
      });

      return res.status(403).json({
        status: 'error',
        code: 'ROLE_FORBIDDEN',
        message: 'Only Household Owners and Admins can manage payment methods.',
      });
    }

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

    await auditService.log({
      householdId,
      userId: req.user?.id || 'usr_dhaka_01',
      userName: req.user?.fullName || 'Owner',
      userEmail: req.user?.email || 'demo@kilowattiq.bd',
      userRole: role,
      action: 'PAYMENT_METHOD_ADDED',
      entityType: 'billing',
      entityId: saved.id,
      entityName: `${saved.provider} (${saved.maskedIdentifier})`,
      status: 'SUCCESS',
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

// DELETE /api/v1/payments/methods/:id (Owner/Admin only)
router.delete('/methods/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { allowed, role } = checkBillingPermission(req, householdId);

    if (!allowed) {
      return res.status(403).json({
        status: 'error',
        code: 'ROLE_FORBIDDEN',
        message: 'Only Household Owners and Admins can delete payment methods.',
      });
    }

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

// POST /api/v1/payments/pay-bill (Owner/Admin only)
router.post('/pay-bill', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { allowed, role } = checkBillingPermission(req, householdId);

    if (!allowed) {
      await auditService.log({
        householdId,
        userId: req.user?.id || 'unknown',
        userName: req.user?.fullName || 'User',
        userEmail: req.user?.email || 'unknown',
        userRole: role,
        action: 'UNAUTHORIZED_BILL_PAYMENT_ATTEMPT',
        entityType: 'billing',
        details: { attemptedAmountBDT: req.body.amountBDT },
        status: 'FORBIDDEN',
        reason: 'Family members and auditors cannot pay utility bills.',
      });

      return res.status(403).json({
        status: 'error',
        code: 'ROLE_FORBIDDEN',
        message: 'Only Household Owners and Admins have authorization to pay utility bills.',
      });
    }

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

    await auditService.log({
      householdId,
      userId: req.user?.id || 'usr_dhaka_01',
      userName: req.user?.fullName || 'Owner',
      userEmail: req.user?.email || 'demo@kilowattiq.bd',
      userRole: role,
      action: 'BILL_PAYMENT',
      entityType: 'billing',
      entityId: receipt.id,
      entityName: `${receipt.utilityProvider} Postpaid Bill ৳${receipt.amountBDT}`,
      details: {
        trxId: receipt.transactionId,
        amountBDT: receipt.amountBDT,
        provider: receipt.provider,
        accountNumber: receipt.accountNumber,
      },
      status: 'SUCCESS',
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

// POST /api/v1/payments/prepaid-topup (Owner/Admin only)
router.post('/prepaid-topup', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { allowed, role } = checkBillingPermission(req, householdId);

    if (!allowed) {
      await auditService.log({
        householdId,
        userId: req.user?.id || 'unknown',
        userName: req.user?.fullName || 'User',
        userEmail: req.user?.email || 'unknown',
        userRole: role,
        action: 'UNAUTHORIZED_PREPAID_TOPUP_ATTEMPT',
        entityType: 'billing',
        details: { attemptedAmountBDT: req.body.amountBDT },
        status: 'FORBIDDEN',
        reason: 'Family members and auditors cannot top up prepaid meters.',
      });

      return res.status(403).json({
        status: 'error',
        code: 'ROLE_FORBIDDEN',
        message: 'Only Household Owners and Admins have authorization to top up prepaid meters.',
      });
    }

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

    await auditService.log({
      householdId,
      userId: req.user?.id || 'usr_dhaka_01',
      userName: req.user?.fullName || 'Owner',
      userEmail: req.user?.email || 'demo@kilowattiq.bd',
      userRole: role,
      action: 'PREPAID_TOPUP',
      entityType: 'billing',
      entityId: receipt.id,
      entityName: `Prepaid Meter Top-Up ৳${receipt.amountBDT}`,
      details: {
        trxId: receipt.transactionId,
        amountBDT: receipt.amountBDT,
        stsToken: receipt.prepaidTokenSTS,
        creditedKwh: receipt.energyUnitsCreditedKwh,
        provider: receipt.provider,
      },
      status: 'SUCCESS',
    });

    return res.json({
      status: 'success',
      data: { receipt },
      message: 'Prepaid top-up successful; 20-digit STS token generated',
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
      data: { history },
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
      return res.status(404).json({ status: 'error', message: 'Payment receipt not found' });
    }
    return res.json({ status: 'success', data: { receipt } });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to fetch receipt' });
  }
});

// GET /api/v1/payments/auto-pay
router.get('/auto-pay', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = (req.query.householdId as string) || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const autoPay = paymentManager.getAutoPayConfig(householdId);

    return res.json({
      status: 'success',
      data: { autoPay },
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', message: err?.message || 'Failed to fetch AutoPay configuration' });
  }
});

// POST /api/v1/payments/auto-pay (Owner/Admin only)
router.post('/auto-pay', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const householdId = req.body.householdId || req.user?.householdIds?.[0] || '11111111-1111-4111-a111-111111111111';
    const { allowed, role } = checkBillingPermission(req, householdId);

    if (!allowed) {
      return res.status(403).json({
        status: 'error',
        code: 'ROLE_FORBIDDEN',
        message: 'Only Household Owners and Admins can configure AutoPay.',
      });
    }

    const {
      enabled,
      monthlyCapBDT,
      savedMethodId,
      triggerCondition,
      thresholdBalanceBDT,
      confirmedByUser,
    } = req.body;

    const updated = paymentManager.updateAutoPayConfig(householdId, {
      isEnabled: Boolean(enabled),
      monthlyCapBDT: Number(monthlyCapBDT) || 4500,
      paymentMethodId: savedMethodId || 'pm_bkash_default',
      triggerType: triggerCondition || 'PREPAID_LOW_BALANCE',
      lowBalanceThresholdBDT: Number(thresholdBalanceBDT) || 200,
      confirmedByUser: Boolean(confirmedByUser),
    });

    await auditService.log({
      householdId,
      userId: req.user?.id || 'usr_dhaka_01',
      userName: req.user?.fullName || 'Owner',
      userEmail: req.user?.email || 'demo@kilowattiq.bd',
      userRole: role,
      action: 'AUTOPAY_UPDATED',
      entityType: 'billing',
      details: {
        enabled: updated.isEnabled,
        monthlyCapBDT: updated.monthlyCapBDT,
        trigger: updated.triggerType,
      },
      status: 'SUCCESS',
    });

    return res.json({
      status: 'success',
      data: { autoPay: updated },
      message: 'AutoPay configuration updated successfully',
    });
  } catch (err: any) {
    return res.status(400).json({ status: 'error', message: err?.message || 'Failed to update AutoPay config' });
  }
});

export default router;
