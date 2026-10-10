/**
 * Unified Payment System Types & Provider Interface
 * 
 * Target Ecosystem:
 * - Payment Providers: bKash (bKash Direct PGW), Nagad (Nagad PGW), Rocket (DBBL MBSS)
 * - Utilities: DESCO, DPDC, BPDB, WZPDCL
 * - Transaction Types: Postpaid Bill Payment, Smart Prepaid STS Meter Top-Up
 * - PCI-Safe Tokenization: No raw PINs or card numbers stored; strictly provider agreement tokens
 */

export type PaymentProvider = 'BKASH' | 'NAGAD' | 'ROCKET' | 'CARD';

export type PaymentType = 'POSTPAID_BILL' | 'PREPAID_TOPUP';

export type UtilityProvider = 'DESCO' | 'DPDC' | 'BPDB' | 'WZPDCL';

export type PaymentStatus = 'INITIATED' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface SavedPaymentMethod {
  id: string;
  householdId: string;
  provider: PaymentProvider;
  maskedIdentifier: string; // e.g., "017***88921" or "**** 4242"
  token: string;            // Provider vault token (PCI-safe)
  alias: string;
  isDefault: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PaymentReceipt {
  id: string;
  householdId: string;
  transactionId: string;       // Provider TrxID e.g., "BKASH_992178AB"
  utilityReferenceId: string;  // Utility BERC confirmation e.g., "DESCO_BILL_88209941"
  accountNumber: string;
  meterNumber: string;
  utilityProvider: UtilityProvider;
  provider: PaymentProvider;
  paymentType: PaymentType;
  amountBDT: number;
  netEnergyAmountBDT: number;
  vatBDT: number;
  demandChargeBDT: number;
  meterRentBDT: number;
  energyUnitsCreditedKwh?: number; // Calculated kWh added to meter
  prepaidTokenSTS?: string;        // 20-digit encrypted STS token e.g. "8821 4402 1195 3302 9184"
  status: PaymentStatus;
  paidAt: string;
  consumerName: string;
  consumerPhone: string;
  notes?: string;
}

export interface AutoPayConfig {
  householdId: string;
  isEnabled: boolean;
  paymentMethodId: string;
  monthlyCapBDT: number;
  triggerType: 'POSTPAID_DUE_DATE' | 'PREPAID_LOW_BALANCE';
  lowBalanceThresholdBDT: number; // e.g. Trigger recharge when balance < ৳200
  topUpAmountBDT: number;         // e.g. ৳1,000 auto top-up
  confirmedByUser: boolean;
  userConfirmationTimestamp?: string;
  totalSpentThisMonthBDT: number;
  lastRunAt?: string;
}

export interface InitiatePaymentResult {
  paymentId: string;
  provider: PaymentProvider;
  amountBDT: number;
  invoiceNumber: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  clientChallengeToken?: string;
}

export interface ExecutePaymentResult {
  success: boolean;
  paymentId: string;
  trxId: string;
  provider: PaymentProvider;
  amountBDT: number;
  providerTimestamp: string;
  status: PaymentStatus;
}

export interface TokenizeWalletResult {
  token: string;
  provider: PaymentProvider;
  maskedIdentifier: string;
}

export interface PaymentAdapter {
  readonly name: string;
  readonly provider: PaymentProvider;

  initiatePayment(params: {
    amountBDT: number;
    invoiceNumber: string;
    consumerPhone: string;
    callbackUrl?: string;
  }): Promise<InitiatePaymentResult>;

  executePayment(
    paymentId: string,
    verification: {
      otpOrToken: string;
      maskedIdentifier?: string;
    }
  ): Promise<ExecutePaymentResult>;

  tokenizeWallet(
    consumerPhone: string,
    verificationOtp: string
  ): Promise<TokenizeWalletResult>;

  verifyTransaction(trxId: string): Promise<{
    verified: boolean;
    amountBDT: number;
    providerTimestamp: string;
  }>;
}
