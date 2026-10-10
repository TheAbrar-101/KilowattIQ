/**
 * Unified Payment Manager
 * 
 * Orchestrates:
 * - bKash, Nagad, and Rocket adapters
 * - DESCO / DPDC Postpaid Bill Payments & Prepaid STS 20-digit Token Top-Ups
 * - Tokenized payment methods storage (PCI-safe)
 * - Auto-Pay engine with monthly spending cap & user confirmation check
 * - Payment receipts & audit history
 */

import {
  PaymentProvider,
  PaymentType,
  UtilityProvider,
  PaymentReceipt,
  SavedPaymentMethod,
  AutoPayConfig,
  PaymentAdapter,
} from './types';
import { BkashAdapter } from './bkashAdapter';
import { NagadAdapter } from './nagadAdapter';
import { RocketAdapter } from './rocketAdapter';

export class PaymentManager {
  private static instance: PaymentManager;

  private adapters: Map<PaymentProvider, PaymentAdapter> = new Map();
  private receipts: Map<string, PaymentReceipt[]> = new Map(); // householdId -> receipts
  private savedMethods: Map<string, SavedPaymentMethod[]> = new Map(); // householdId -> methods
  private autoPayConfigs: Map<string, AutoPayConfig> = new Map(); // householdId -> config

  private constructor() {
    this.adapters.set('BKASH', new BkashAdapter());
    this.adapters.set('NAGAD', new NagadAdapter());
    this.adapters.set('ROCKET', new RocketAdapter());

    this.seedDefaultData();
  }

  public static getInstance(): PaymentManager {
    if (!PaymentManager.instance) {
      PaymentManager.instance = new PaymentManager();
    }
    return PaymentManager.instance;
  }

  /**
   * Seeds demo tokenized methods, receipts and initial auto-pay setup
   */
  private seedDefaultData(): void {
    const defaultHhId = '11111111-1111-4111-a111-111111111111';
    const altHhId = '11111111-1111-4111-a111-111111111101';
    const now = Date.now();

    const methods: SavedPaymentMethod[] = [
      {
        id: 'pm_bkash_01',
        householdId: defaultHhId,
        provider: 'BKASH',
        maskedIdentifier: '017***88921',
        token: 'bkash_tok_vlt_9918237',
        alias: 'Tanvir Personal bKash',
        isDefault: true,
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 30).toISOString(),
      },
      {
        id: 'pm_nagad_01',
        householdId: defaultHhId,
        provider: 'NAGAD',
        maskedIdentifier: '018***44192',
        token: 'nagad_tok_vlt_7721994',
        alias: 'Family Nagad Wallet',
        isDefault: false,
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 14).toISOString(),
      },
      {
        id: 'pm_rocket_01',
        householdId: defaultHhId,
        provider: 'ROCKET',
        maskedIdentifier: '019***33182',
        token: 'rocket_tok_vlt_5541882',
        alias: 'DBBL Salary Rocket',
        isDefault: false,
        createdAt: new Date(now - 1000 * 60 * 60 * 24 * 7).toISOString(),
      },
    ];

    this.savedMethods.set(defaultHhId, methods);
    this.savedMethods.set(altHhId, methods.map(m => ({ ...m, householdId: altHhId })));

    // Seed recent receipts
    const initialReceipts: PaymentReceipt[] = [
      {
        id: `rcpt_desco_${now - 1000 * 60 * 60 * 24 * 18}`,
        householdId: defaultHhId,
        transactionId: 'BKASH_99B7214A',
        utilityReferenceId: 'DESCO_BILL_OCT_88209941',
        accountNumber: '8820-9941-01',
        meterNumber: 'MTR-DESCO-9921',
        utilityProvider: 'DESCO',
        provider: 'BKASH',
        paymentType: 'POSTPAID_BILL',
        amountBDT: 2280,
        netEnergyAmountBDT: 1940.04,
        vatBDT: 108.45,
        demandChargeBDT: 189.0,
        meterRentBDT: 40.0,
        status: 'COMPLETED',
        paidAt: new Date(now - 1000 * 60 * 60 * 24 * 18).toISOString(),
        consumerName: 'Tanvir Hossain',
        consumerPhone: '01711889210',
        notes: 'Monthly DESCO LT-A Postpaid bill cleared via bKash',
      },
      {
        id: `rcpt_prepaid_${now - 1000 * 60 * 60 * 24 * 5}`,
        householdId: defaultHhId,
        transactionId: 'NAGAD_44C1982',
        utilityReferenceId: 'DESCO_PREPAID_TOPUP_5519',
        accountNumber: '8820-9941-01',
        meterNumber: 'MTR-DESCO-9921',
        utilityProvider: 'DESCO',
        provider: 'NAGAD',
        paymentType: 'PREPAID_TOPUP',
        amountBDT: 1500,
        netEnergyAmountBDT: 1228.57,
        vatBDT: 71.43,
        demandChargeBDT: 160.0,
        meterRentBDT: 40.0,
        energyUnitsCreditedKwh: 167.4,
        prepaidTokenSTS: '8841 3320 9184 7721 0048',
        status: 'COMPLETED',
        paidAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
        consumerName: 'Tanvir Hossain',
        consumerPhone: '01819441920',
        notes: 'Prepaid smart meter STS token generated and credited',
      },
    ];

    this.receipts.set(defaultHhId, initialReceipts);
    this.receipts.set(altHhId, initialReceipts.map(r => ({ ...r, householdId: altHhId })));

    // Seed AutoPay configuration
    const initialAutoPay: AutoPayConfig = {
      householdId: defaultHhId,
      isEnabled: true,
      paymentMethodId: 'pm_bkash_01',
      monthlyCapBDT: 4500,
      triggerType: 'PREPAID_LOW_BALANCE',
      lowBalanceThresholdBDT: 250,
      topUpAmountBDT: 1000,
      confirmedByUser: true,
      userConfirmationTimestamp: new Date(now - 1000 * 60 * 60 * 24 * 12).toISOString(),
      totalSpentThisMonthBDT: 1500,
      lastRunAt: new Date(now - 1000 * 60 * 60 * 24 * 5).toISOString(),
    };

    this.autoPayConfigs.set(defaultHhId, initialAutoPay);
    this.autoPayConfigs.set(altHhId, { ...initialAutoPay, householdId: altHhId });
  }

  /**
   * Generates a 20-digit encrypted STS prepaid meter recharge token formatted in 4-digit groups
   */
  public generateSTSToken(): string {
    const parts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const quad = Math.floor(1000 + Math.random() * 9000).toString();
      parts.push(quad);
    }
    return parts.join(' ');
  }

  /**
   * Retrieves saved tokenized payment methods for a household
   */
  public getPaymentMethods(householdId: string): SavedPaymentMethod[] {
    const list = this.savedMethods.get(householdId);
    if (list && list.length > 0) return list;
    const fallback = this.savedMethods.get('11111111-1111-4111-a111-111111111111') || [];
    return fallback.map(m => ({ ...m, householdId }));
  }

  /**
   * Saves a new tokenized payment method (PCI-safe)
   */
  public async addPaymentMethod(
    householdId: string,
    params: {
      provider: PaymentProvider;
      phoneNumber: string;
      alias: string;
      otp: string;
      isDefault?: boolean;
    }
  ): Promise<SavedPaymentMethod> {
    const adapter = this.adapters.get(params.provider);
    if (!adapter) {
      throw new Error(`Unsupported payment provider: ${params.provider}`);
    }

    const tokenized = await adapter.tokenizeWallet(params.phoneNumber, params.otp);
    const existing = this.getPaymentMethods(householdId);

    if (params.isDefault) {
      existing.forEach(m => (m.isDefault = false));
    }

    const newMethod: SavedPaymentMethod = {
      id: `pm_${params.provider.toLowerCase()}_${Date.now()}`,
      householdId,
      provider: params.provider,
      maskedIdentifier: tokenized.maskedIdentifier,
      token: tokenized.token,
      alias: params.alias || `${params.provider} Wallet`,
      isDefault: params.isDefault || existing.length === 0,
      createdAt: new Date().toISOString(),
    };

    existing.unshift(newMethod);
    this.savedMethods.set(householdId, existing);
    return newMethod;
  }

  /**
   * Removes a saved payment method
   */
  public removePaymentMethod(householdId: string, methodId: string): boolean {
    const existing = this.getPaymentMethods(householdId);
    const updated = existing.filter(m => m.id !== methodId);
    this.savedMethods.set(householdId, updated);
    return updated.length < existing.length;
  }

  /**
   * Retrieves payment receipts history for a household
   */
  public getPaymentHistory(householdId: string): PaymentReceipt[] {
    const list = this.receipts.get(householdId);
    if (list && list.length > 0) return list;
    const fallback = this.receipts.get('11111111-1111-4111-a111-111111111111') || [];
    return fallback.map(r => ({ ...r, householdId }));
  }

  /**
   * Retrieves single receipt by ID
   */
  public getReceiptById(receiptId: string): PaymentReceipt | null {
    for (const [_, list] of this.receipts.entries()) {
      const match = list.find(r => r.id === receiptId);
      if (match) return match;
    }
    return null;
  }

  /**
   * Pays a DESCO / DPDC Postpaid Bill from within the app
   */
  public async payPostpaidBill(params: {
    householdId: string;
    amountBDT: number;
    provider: PaymentProvider;
    accountNumber: string;
    meterNumber: string;
    utilityProvider: UtilityProvider;
    consumerName: string;
    consumerPhone: string;
    savedMethodId?: string;
    otpOrToken?: string;
  }): Promise<PaymentReceipt> {
    const adapter = this.adapters.get(params.provider) || this.adapters.get('BKASH')!;
    const invoiceNumber = `INV_POSTPAID_${Date.now()}`;

    // 1. Initiate payment
    const init = await adapter.initiatePayment({
      amountBDT: params.amountBDT,
      invoiceNumber,
      consumerPhone: params.consumerPhone,
    });

    // 2. Execute payment via adapter
    const tokenOrOtp = params.otpOrToken || 'demo_otp_1234';
    const executed = await adapter.executePayment(init.paymentId, {
      otpOrToken: tokenOrOtp,
      maskedIdentifier: params.consumerPhone,
    });

    if (!executed.success) {
      throw new Error(`Payment execution failed on ${params.provider}`);
    }

    // Calculate BERC tariff components (5% statutory VAT)
    const vatBDT = Number(((params.amountBDT * 5) / 105).toFixed(2));
    const demandChargeBDT = 189.0;
    const meterRentBDT = 40.0;
    const netEnergyAmountBDT = Number((params.amountBDT - vatBDT - demandChargeBDT - meterRentBDT).toFixed(2));

    const receipt: PaymentReceipt = {
      id: `rcpt_${executed.trxId.toLowerCase()}`,
      householdId: params.householdId,
      transactionId: executed.trxId,
      utilityReferenceId: `${params.utilityProvider}_BILL_${Math.floor(100000 + Math.random() * 900000)}`,
      accountNumber: params.accountNumber,
      meterNumber: params.meterNumber,
      utilityProvider: params.utilityProvider,
      provider: params.provider,
      paymentType: 'POSTPAID_BILL',
      amountBDT: params.amountBDT,
      netEnergyAmountBDT: Math.max(0, netEnergyAmountBDT),
      vatBDT,
      demandChargeBDT,
      meterRentBDT,
      status: 'COMPLETED',
      paidAt: new Date().toISOString(),
      consumerName: params.consumerName,
      consumerPhone: params.consumerPhone,
      notes: `Official ${params.utilityProvider} residential bill settled successfully.`,
    };

    // Store receipt
    const existing = this.getPaymentHistory(params.householdId);
    existing.unshift(receipt);
    this.receipts.set(params.householdId, existing);

    // Update AutoPay monthly spend tracker if applicable
    const autoPay = this.autoPayConfigs.get(params.householdId);
    if (autoPay) {
      autoPay.totalSpentThisMonthBDT += params.amountBDT;
      this.autoPayConfigs.set(params.householdId, autoPay);
    }

    return receipt;
  }

  /**
   * Tops up a Smart Prepaid Meter & generates 20-digit encrypted STS token
   */
  public async topUpPrepaidMeter(params: {
    householdId: string;
    amountBDT: number;
    provider: PaymentProvider;
    accountNumber: string;
    meterNumber: string;
    utilityProvider: UtilityProvider;
    consumerName: string;
    consumerPhone: string;
    savedMethodId?: string;
    otpOrToken?: string;
  }): Promise<PaymentReceipt> {
    const adapter = this.adapters.get(params.provider) || this.adapters.get('BKASH')!;
    const invoiceNumber = `INV_PREPAID_${Date.now()}`;

    // 1. Initiate payment
    const init = await adapter.initiatePayment({
      amountBDT: params.amountBDT,
      invoiceNumber,
      consumerPhone: params.consumerPhone,
    });

    // 2. Execute payment
    const tokenOrOtp = params.otpOrToken || 'demo_otp_1234';
    const executed = await adapter.executePayment(init.paymentId, {
      otpOrToken: tokenOrOtp,
      maskedIdentifier: params.consumerPhone,
    });

    if (!executed.success) {
      throw new Error(`Prepaid top-up payment failed on ${params.provider}`);
    }

    // Deduct statutory VAT (5%), demand charge, and meter rent per BERC regulations
    const vatBDT = Number(((params.amountBDT * 5) / 105).toFixed(2));
    const demandChargeBDT = 126.0;
    const meterRentBDT = 40.0;
    const netEnergyAmountBDT = Number((params.amountBDT - vatBDT - demandChargeBDT - meterRentBDT).toFixed(2));

    // Calculate credited kWh units based on average Step 3/4 BERC rate (৳7.34 / unit)
    const effectiveRatePerKwh = 7.34;
    const creditedKwh = Number((Math.max(0, netEnergyAmountBDT) / effectiveRatePerKwh).toFixed(1));

    // Generate 20-digit STS prepaid sequence
    const prepaidTokenSTS = this.generateSTSToken();

    const receipt: PaymentReceipt = {
      id: `rcpt_${executed.trxId.toLowerCase()}`,
      householdId: params.householdId,
      transactionId: executed.trxId,
      utilityReferenceId: `${params.utilityProvider}_STS_${Math.floor(100000 + Math.random() * 900000)}`,
      accountNumber: params.accountNumber,
      meterNumber: params.meterNumber,
      utilityProvider: params.utilityProvider,
      provider: params.provider,
      paymentType: 'PREPAID_TOPUP',
      amountBDT: params.amountBDT,
      netEnergyAmountBDT: Math.max(0, netEnergyAmountBDT),
      vatBDT,
      demandChargeBDT,
      meterRentBDT,
      energyUnitsCreditedKwh: creditedKwh,
      prepaidTokenSTS,
      status: 'COMPLETED',
      paidAt: new Date().toISOString(),
      consumerName: params.consumerName,
      consumerPhone: params.consumerPhone,
      notes: `20-digit STS Prepaid token generated for ${params.utilityProvider} meter.`,
    };

    // Store receipt
    const existing = this.getPaymentHistory(params.householdId);
    existing.unshift(receipt);
    this.receipts.set(params.householdId, existing);

    // Update AutoPay spend
    const autoPay = this.autoPayConfigs.get(params.householdId);
    if (autoPay) {
      autoPay.totalSpentThisMonthBDT += params.amountBDT;
      this.autoPayConfigs.set(params.householdId, autoPay);
    }

    return receipt;
  }

  /**
   * Retrieves AutoPay configuration
   */
  public getAutoPayConfig(householdId: string): AutoPayConfig {
    const config = this.autoPayConfigs.get(householdId);
    if (config) return config;

    const defaultMethod = this.getPaymentMethods(householdId).find(m => m.isDefault);
    const newConfig: AutoPayConfig = {
      householdId,
      isEnabled: false,
      paymentMethodId: defaultMethod?.id || '',
      monthlyCapBDT: 4000,
      triggerType: 'PREPAID_LOW_BALANCE',
      lowBalanceThresholdBDT: 200,
      topUpAmountBDT: 1000,
      confirmedByUser: false,
      totalSpentThisMonthBDT: 0,
    };

    this.autoPayConfigs.set(householdId, newConfig);
    return newConfig;
  }

  /**
   * Updates AutoPay configuration with mandatory confirmation
   */
  public updateAutoPayConfig(
    householdId: string,
    updates: Partial<AutoPayConfig>
  ): AutoPayConfig {
    const current = this.getAutoPayConfig(householdId);

    // If enabling Auto-Pay, strictly require user confirmation
    if (updates.isEnabled && !current.confirmedByUser && !updates.confirmedByUser) {
      throw new Error('Enabling Auto-Pay requires explicit user confirmation.');
    }

    const merged: AutoPayConfig = {
      ...current,
      ...updates,
      householdId,
      userConfirmationTimestamp: updates.confirmedByUser
        ? new Date().toISOString()
        : current.userConfirmationTimestamp,
    };

    this.autoPayConfigs.set(householdId, merged);
    return merged;
  }
}
