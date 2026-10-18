import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CreditCard,
  Zap,
  CheckCircle2,
  Download,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  ArrowRight,
  Plus,
  Trash2,
  Star,
  Sliders,
  AlertCircle,
  FileText,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Smartphone,
  ExternalLink,
  Flame,
  BadgeAlert,
  Calendar,
  DollarSign
} from 'lucide-react';
import {
  PaymentProvider,
  PaymentType,
  PaymentReceipt,
  SavedPaymentMethod,
  AutoPayConfig,
} from '../../server/payments/types';
import { Household } from '../../../shared/types/household';
import { useAuth } from '../../context/AuthContext';
import { UserRole, normalizeRole, canModifyBilling } from '../../server/auth/roles';

interface PaymentsTabProps {
  household: Household;
  token?: string | null;
}

export const PaymentsTab: React.FC<PaymentsTabProps> = ({ household, token }) => {
  const { user } = useAuth();
  const currentRole: UserRole = normalizeRole(user?.householdRole || user?.role);
  const canPay = canModifyBilling(currentRole, user?.auditorExpiresAt);

  const [activeSubTab, setActiveSubTab] = useState<'PAY_BILL' | 'PREPAID' | 'AUTOPAY' | 'METHODS' | 'HISTORY'>('PAY_BILL');
  const [methods, setMethods] = useState<SavedPaymentMethod[]>([]);
  const [history, setHistory] = useState<PaymentReceipt[]>([]);
  const [autoPay, setAutoPay] = useState<AutoPayConfig | null>(null);

  // Bill payment form state
  const [billAmount, setBillAmount] = useState<number>(2280);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('BKASH');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('01711889210');
  const [otpInput, setOtpInput] = useState<string>('1234');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Prepaid top-up state
  const [topUpAmount, setTopUpAmount] = useState<number>(1000);
  const [prepaidBalance, setPrepaidBalance] = useState<number>(342.5);

  // Success Modal state
  const [latestReceipt, setLatestReceipt] = useState<PaymentReceipt | null>(null);
  const [isCopiedToken, setIsCopiedToken] = useState<boolean>(false);

  // Add Method Modal state
  const [showAddMethodModal, setShowAddMethodModal] = useState<boolean>(false);
  const [newMethodProvider, setNewMethodProvider] = useState<PaymentProvider>('BKASH');
  const [newMethodPhone, setNewMethodPhone] = useState<string>('');
  const [newMethodAlias, setNewMethodAlias] = useState<string>('');
  const [newMethodOtp, setNewMethodOtp] = useState<string>('');
  const [isSavingMethod, setIsSavingMethod] = useState<boolean>(false);

  // AutoPay edit state
  const [autoPayEnabled, setAutoPayEnabled] = useState<boolean>(true);
  const [autoPayCap, setAutoPayCap] = useState<number>(4500);
  const [autoPayTrigger, setAutoPayTrigger] = useState<'POSTPAID_DUE_DATE' | 'PREPAID_LOW_BALANCE'>('PREPAID_LOW_BALANCE');
  const [autoPayThreshold, setAutoPayThreshold] = useState<number>(200);
  const [autoPayConfirmed, setAutoPayConfirmed] = useState<boolean>(false);
  const [autoPaySaving, setAutoPaySaving] = useState<boolean>(false);
  const [autoPaySuccessMsg, setAutoPaySuccessMsg] = useState<string | null>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      const [methodsRes, historyRes, autoPayRes] = await Promise.all([
        fetch(`/api/v1/payments/methods?householdId=${household.id}`, { headers: authHeaders }),
        fetch(`/api/v1/payments/history?householdId=${household.id}`, { headers: authHeaders }),
        fetch(`/api/v1/payments/auto-pay?householdId=${household.id}`, { headers: authHeaders }),
      ]);

      const methodsJson = await methodsRes.json();
      const historyJson = await historyRes.json();
      const autoPayJson = await autoPayRes.json();

      if (methodsJson.status === 'success' && methodsJson.data?.methods) {
        setMethods(methodsJson.data.methods);
        const defaultMethod = methodsJson.data.methods.find((m: SavedPaymentMethod) => m.isDefault);
        if (defaultMethod) {
          setSelectedMethodId(defaultMethod.id);
          setSelectedProvider(defaultMethod.provider);
        }
      }

      if (historyJson.status === 'success' && historyJson.data?.history) {
        setHistory(historyJson.data.history);
      }

      if (autoPayJson.status === 'success' && autoPayJson.data?.config) {
        const cfg = autoPayJson.data.config;
        setAutoPay(cfg);
        setAutoPayEnabled(cfg.isEnabled);
        setAutoPayCap(cfg.monthlyCapBDT);
        setAutoPayTrigger(cfg.triggerType);
        setAutoPayThreshold(cfg.lowBalanceThresholdBDT);
        setAutoPayConfirmed(cfg.confirmedByUser);
      }
    } catch (err) {
      console.warn('[PaymentsTab] Error fetching initial data:', err);
    }
  }, [household.id, token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Pay Postpaid Bill
  const handlePayBill = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/v1/payments/pay-bill', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          amountBDT: billAmount,
          provider: selectedProvider,
          accountNumber: household.accountNumber,
          meterNumber: 'MTR-DESCO-9921',
          utilityProvider: household.utilityProvider || 'DESCO',
          consumerName: household.name,
          consumerPhone: phoneInput,
          savedMethodId: selectedMethodId,
          otpOrToken: otpInput,
        }),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.receipt) {
        setLatestReceipt(json.data.receipt);
        setHistory(prev => [json.data.receipt, ...prev]);
      } else {
        alert(json.message || 'Payment failed');
      }
    } catch (err: any) {
      alert(err?.message || 'Payment request failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Prepaid Meter Top-Up
  const handlePrepaidTopUp = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/v1/payments/prepaid-topup', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          amountBDT: topUpAmount,
          provider: selectedProvider,
          accountNumber: household.accountNumber,
          meterNumber: 'MTR-DESCO-9921',
          utilityProvider: household.utilityProvider || 'DESCO',
          consumerName: household.name,
          consumerPhone: phoneInput,
          savedMethodId: selectedMethodId,
          otpOrToken: otpInput,
        }),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.receipt) {
        setLatestReceipt(json.data.receipt);
        setHistory(prev => [json.data.receipt, ...prev]);
        setPrepaidBalance(prev => prev + topUpAmount * 0.85); // simulated updated balance
      } else {
        alert(json.message || 'Top-up failed');
      }
    } catch (err: any) {
      alert(err?.message || 'Top-up request failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Add New Payment Method
  const handleSaveMethod = async () => {
    if (!newMethodPhone || !newMethodOtp) {
      alert('Phone number and OTP verification required');
      return;
    }

    setIsSavingMethod(true);
    try {
      const res = await fetch('/api/v1/payments/methods', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          provider: newMethodProvider,
          phoneNumber: newMethodPhone,
          alias: newMethodAlias || `${newMethodProvider} Wallet`,
          otp: newMethodOtp,
          isDefault: methods.length === 0,
        }),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.method) {
        setMethods(prev => [json.data.method, ...prev]);
        setShowAddMethodModal(false);
        setNewMethodPhone('');
        setNewMethodAlias('');
        setNewMethodOtp('');
      } else {
        alert(json.message || 'Failed to save method');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to save tokenized method');
    } finally {
      setIsSavingMethod(false);
    }
  };

  // Handle Delete Method
  const handleDeleteMethod = async (id: string) => {
    if (!confirm('Are you sure you want to remove this tokenized payment method?')) return;
    try {
      const res = await fetch(`/api/v1/payments/methods/${id}?householdId=${household.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const json = await res.json();
      if (json.status === 'success') {
        setMethods(prev => prev.filter(m => m.id !== id));
      }
    } catch (err) {
      console.warn('Failed to delete method:', err);
    }
  };

  // Handle Save AutoPay Config
  const handleSaveAutoPay = async () => {
    if (autoPayEnabled && !autoPayConfirmed) {
      alert('You must confirm authorization before enabling Auto-Pay.');
      return;
    }

    setAutoPaySaving(true);
    try {
      const res = await fetch('/api/v1/payments/auto-pay', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          householdId: household.id,
          isEnabled: autoPayEnabled,
          monthlyCapBDT: autoPayCap,
          triggerType: autoPayTrigger,
          lowBalanceThresholdBDT: autoPayThreshold,
          confirmedByUser: autoPayConfirmed,
          paymentMethodId: selectedMethodId || methods[0]?.id,
        }),
      });

      const json = await res.json();
      if (json.status === 'success' && json.data?.config) {
        setAutoPay(json.data.config);
        setAutoPaySuccessMsg('Auto-Pay settings saved successfully!');
        setTimeout(() => setAutoPaySuccessMsg(null), 3500);
      } else {
        alert(json.message || 'Failed to save AutoPay');
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to save AutoPay');
    } finally {
      setAutoPaySaving(false);
    }
  };

  // Copy STS token
  const handleCopySts = (sts: string) => {
    navigator.clipboard.writeText(sts.replace(/\s+/g, ''));
    setIsCopiedToken(true);
    setTimeout(() => setIsCopiedToken(false), 2500);
  };

  // Download Receipt as Text/HTML document
  const handleDownloadReceipt = (rcpt: PaymentReceipt) => {
    const receiptContent = `
=============================================================
         KILOWATTIQ OFFICIAL PAYMENT RECEIPT
             Bangladesh Electrical Grid Utility
=============================================================
Utility Provider:   ${rcpt.utilityProvider}
Consumer Name:      ${rcpt.consumerName}
Account Number:     ${rcpt.accountNumber}
Meter Number:       ${rcpt.meterNumber}
Date & Time:        ${new Date(rcpt.paidAt).toLocaleString()}
Transaction ID:     ${rcpt.transactionId}
Utility BERC Ref:   ${rcpt.utilityReferenceId}
Payment Channel:    ${rcpt.provider} (Tokenized PGW)
Transaction Type:   ${rcpt.paymentType === 'PREPAID_TOPUP' ? 'Smart Prepaid Top-Up' : 'Postpaid Bill Settlement'}
Status:             ${rcpt.status}

-------------------------------------------------------------
FINANCIAL BREAKDOWN:
-------------------------------------------------------------
Gross Paid Amount:  BDT ৳${rcpt.amountBDT.toLocaleString()}
Net Energy Amount:  BDT ৳${rcpt.netEnergyAmountBDT.toLocaleString()}
Statutory VAT (5%): BDT ৳${rcpt.vatBDT.toLocaleString()}
Sanctioned Demand:  BDT ৳${rcpt.demandChargeBDT.toLocaleString()}
Meter Rent:         BDT ৳${rcpt.meterRentBDT.toLocaleString()}
${rcpt.energyUnitsCreditedKwh ? `Credited Energy:    ${rcpt.energyUnitsCreditedKwh} kWh` : ''}
${rcpt.prepaidTokenSTS ? `\n=============================================================\n20-DIGIT STS PREPAID RECHARGE TOKEN:\n>> ${rcpt.prepaidTokenSTS} <<\n(Enter this 20-digit code into your physical meter keypad)\n=============================================================` : ''}

Thank you for choosing KilowattIQ Smart Energy Solutions.
For support, contact 16120 (DESCO) or 16116 (DPDC).
=============================================================
    `.trim();

    const blob = new Blob([receiptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KilowattIQ_Receipt_${rcpt.utilityReferenceId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Role-gated banner if user is not Owner/Admin */}
      {!canPay && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold">Billing & Payment Actions Locked (Owner Only)</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-300 opacity-90 mt-0.5">
                Your active role is <strong className="uppercase">{currentRole.replace('_', ' ')}</strong>. Under Supabase Row Level Security (RLS), bill settlement, prepaid recharge, and auto-pay changes are restricted to Household Owners.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-200/50 dark:bg-amber-900/60 font-bold uppercase shrink-0">
            RLS Enforced
          </span>
        </div>
      )}

      {/* Top Banner & Navigation Sub-Tabs */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-500 dark:text-amber-400">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  Bill Payment & Prepaid Top-Up
                </h2>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> PCI-Safe
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Pay {household.utilityProvider || 'DESCO'} / DPDC bills or generate 20-digit STS tokens via bKash, Nagad & Rocket
              </p>
            </div>
          </div>

          {/* Big Tactile Navigation Switcher (Outfit font) */}
          <div className="flex items-center gap-1.5 overflow-x-auto bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-none">
            {[
              { id: 'PAY_BILL', label: 'Pay Bill' },
              { id: 'PREPAID', label: 'Prepaid Top-Up' },
              { id: 'AUTOPAY', label: 'Auto-Pay' },
              { id: 'METHODS', label: 'Saved Wallets' },
              { id: 'HISTORY', label: 'Receipts' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-black tracking-wide whitespace-nowrap transition-all cursor-pointer font-display ${
                  activeSubTab === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-extrabold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIEW 1: PAY BILL */}
      {activeSubTab === 'PAY_BILL' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bill Overview Card */}
          <div className="lg:col-span-1 bg-gradient-to-br from-amber-500/10 via-white dark:via-slate-900 to-slate-50 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-display">
                Active Statement
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                DUE SOON
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-sans block">Total Outstanding</span>
              <div className="text-3xl font-black font-mono text-slate-900 dark:text-white my-1">
                ৳{billAmount.toLocaleString()} <span className="text-xs font-sans text-slate-500">BDT</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                Billing Cycle: October 2026 • Due: 25 Oct 2026
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Account Number:</span>
                <span className="font-bold text-slate-900 dark:text-white">{household.accountNumber || '8820-9941-01'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Meter Number:</span>
                <span className="font-bold text-slate-900 dark:text-white">MTR-DESCO-9921</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tariff Schedule:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">Residential LT-A (285 kWh)</span>
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-950/70 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
              <div className="flex justify-between">
                <span>Energy Cost (Slabs 1–3):</span>
                <span className="font-bold">৳1,940.04</span>
              </div>
              <div className="flex justify-between">
                <span>Demand Charge (4.5 kW):</span>
                <span>৳189.00</span>
              </div>
              <div className="flex justify-between">
                <span>Meter Rent:</span>
                <span>৳40.00</span>
              </div>
              <div className="flex justify-between text-amber-700 dark:text-amber-300 font-bold border-t border-slate-200 dark:border-slate-800 pt-1">
                <span>5% Statutory VAT:</span>
                <span>৳108.45</span>
              </div>
            </div>
          </div>

          {/* Payment Selection & Checkout Card */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Select Payment Channel
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Choose your preferred mobile banking wallet or tokenized method
              </p>
            </div>

            {/* Provider Big Selection Cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'BKASH', name: 'bKash', color: 'from-[#e2136e] to-[#c2105e]', label: 'bKash Direct' },
                { id: 'NAGAD', name: 'Nagad', color: 'from-[#f7941d] to-[#d67b0d]', label: 'Nagad PGW' },
                { id: 'ROCKET', name: 'Rocket', color: 'from-[#8c3494] to-[#6d2574]', label: 'DBBL Rocket' },
              ].map(prov => (
                <button
                  key={prov.id}
                  onClick={() => setSelectedProvider(prov.id as any)}
                  className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedProvider === prov.id
                      ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-500/40 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-tr ${prov.color} flex items-center justify-center text-white font-bold text-xs shadow-sm font-display`}>
                    {prov.name[0]}
                  </div>
                  <span className="text-xs font-black font-display">{prov.name}</span>
                  <span className="text-[10px] text-slate-400 font-sans">{prov.label}</span>
                </button>
              ))}
            </div>

            {/* Form Fields: Phone & OTP challenge */}
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 font-display">
                    Wallet Mobile Number
                  </label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 font-display">
                    OTP Verification Token
                  </label>
                  <input
                    type="text"
                    value={otpInput}
                    onChange={e => setOtpInput(e.target.value)}
                    placeholder="4-digit OTP"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Saved Tokenized Methods Shortcut */}
              {methods.length > 0 && (
                <div className="pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5 font-display">
                    Or select a saved 1-Click tokenized wallet:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {methods.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setSelectedMethodId(m.id);
                          setSelectedProvider(m.provider);
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-display flex items-center gap-1.5 transition-all cursor-pointer ${
                          selectedMethodId === m.id
                            ? 'bg-amber-500/15 border-amber-500 text-amber-900 dark:text-amber-200 font-bold'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{m.alias}</span>
                        <span className="font-mono text-[10px] opacity-75">({m.maskedIdentifier})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Big Obvious Button (Outfit Font) */}
            <button
              onClick={handlePayBill}
              disabled={isProcessing}
              className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-sm tracking-wider uppercase rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 font-display disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Settling with {household.utilityProvider || 'DESCO'} Grid Gateway...</span>
                </>
              ) : (
                <>
                  <span>Pay ৳{billAmount.toLocaleString()} BDT with {selectedProvider}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: PREPAID TOP-UP */}
      {activeSubTab === 'PREPAID' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Smart Prepaid Meter Status Card */}
          <div className="lg:col-span-1 bg-gradient-to-br from-emerald-500/10 via-white dark:via-slate-900 to-slate-50 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-display">
                Smart Prepaid AMI Meter
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                ONLINE
              </span>
            </div>

            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-sans block">Remaining Balance</span>
              <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 my-1">
                ৳{prepaidBalance.toFixed(2)} <span className="text-xs font-sans text-slate-500">BDT</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                Equivalent to ~{Math.round(prepaidBalance / 7.34)} kWh at current Step 3 rate
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs font-mono">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Account Number:</span>
                <span className="font-bold text-slate-900 dark:text-white">{household.accountNumber || '8820-9941-01'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>STS Meter ID:</span>
                <span className="font-bold text-slate-900 dark:text-white">MTR-DESCO-9921</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Emergency Credit:</span>
                <span className="font-bold text-slate-900 dark:text-white">Available (৳300)</span>
              </div>
            </div>

            <div className="bg-white/70 dark:bg-slate-950/70 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300">
              💡 <strong>Top-Up Guide:</strong> When recharged, the system generates a 20-digit encrypted STS token. Enter the 20 digits into your meter keypad followed by the blue or enter button.
            </div>
          </div>

          {/* Prepaid Top-Up Form */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-5 shadow-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Prepaid Meter Recharge
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Instant 20-digit STS token generation for {household.utilityProvider || 'DESCO'} prepaid meters
              </p>
            </div>

            {/* Quick Preset Buttons (Outfit font) */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2 font-display">
                Select Recharge Amount
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[500, 1000, 2000, 3000, 5000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setTopUpAmount(amt)}
                    className={`py-2.5 rounded-xl border text-xs font-black font-display transition-all cursor-pointer ${
                      topUpAmount === amt
                        ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm font-extrabold'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    ৳{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Real-time Estimated Units Calculation */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-900 dark:text-amber-300 block font-display">
                  Estimated Credited Units:
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                  After 5% statutory VAT, demand charge and meter rent deduction
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg font-black font-mono text-amber-800 dark:text-amber-300">
                  ~{Number(((topUpAmount * 0.95 - 166) / 7.34).toFixed(1))} kWh
                </span>
              </div>
            </div>

            {/* Provider Big Selection Cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'BKASH', name: 'bKash', color: 'from-[#e2136e] to-[#c2105e]', label: 'bKash Direct' },
                { id: 'NAGAD', name: 'Nagad', color: 'from-[#f7941d] to-[#d67b0d]', label: 'Nagad PGW' },
                { id: 'ROCKET', name: 'Rocket', color: 'from-[#8c3494] to-[#6d2574]', label: 'DBBL Rocket' },
              ].map(prov => (
                <button
                  key={prov.id}
                  onClick={() => setSelectedProvider(prov.id as any)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    selectedProvider === prov.id
                      ? 'bg-amber-500/10 border-amber-500 shadow-md ring-2 ring-amber-500/40 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-tr ${prov.color} flex items-center justify-center text-white font-bold text-xs font-display`}>
                    {prov.name[0]}
                  </div>
                  <span className="text-xs font-black font-display">{prov.name}</span>
                </button>
              ))}
            </div>

            {/* Big Obvious Button (Outfit Font) */}
            <button
              onClick={handlePrepaidTopUp}
              disabled={isProcessing}
              className="w-full py-4 px-6 bg-amber-500 hover:bg-amber-400 active:scale-[0.99] text-slate-950 font-black text-sm tracking-wider uppercase rounded-2xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 font-display disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Processing STS Top-Up via {selectedProvider}...</span>
                </>
              ) : (
                <>
                  <span>Top-Up ৳{topUpAmount.toLocaleString()} & Generate 20-Digit Token</span>
                  <Zap className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: AUTO-PAY */}
      {activeSubTab === 'AUTOPAY' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-6 shadow-xs max-w-3xl">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  Auto-Pay & Threshold Pilot
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Automatically recharge prepaid meters or settle monthly bills without manual intervention
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoPayEnabled}
                onChange={e => setAutoPayEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            {/* Monthly Spending Cap */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 font-display">
                  Monthly Spending Cap (Maximum Safe Limit)
                </label>
                <span className="text-base font-black font-mono text-amber-700 dark:text-amber-400">
                  ৳{autoPayCap.toLocaleString()} BDT
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="10000"
                step="500"
                value={autoPayCap}
                onChange={e => setAutoPayCap(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <span className="text-[11px] text-slate-500 font-sans block">
                Auto-Pay will immediately suspend if cumulative debits reach ৳{autoPayCap.toLocaleString()} within a calendar month.
              </span>
            </div>

            {/* Trigger Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 font-display">
                Trigger Condition
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAutoPayTrigger('PREPAID_LOW_BALANCE')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    autoPayTrigger === 'PREPAID_LOW_BALANCE'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-xs font-bold font-display block">Low Prepaid Balance</span>
                  <span className="text-[10px] font-sans opacity-80 block mt-0.5">
                    Recharge ৳1,000 whenever meter credit drops below ৳{autoPayThreshold}.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoPayTrigger('POSTPAID_DUE_DATE')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    autoPayTrigger === 'POSTPAID_DUE_DATE'
                      ? 'bg-amber-500/10 border-amber-500 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="text-xs font-bold font-display block">Postpaid Due Date</span>
                  <span className="text-[10px] font-sans opacity-80 block mt-0.5">
                    Automatically settle bill 3 days before DESCO late fee penalty.
                  </span>
                </button>
              </div>
            </div>

            {/* Safety Confirmation Notice */}
            <div className="bg-amber-50 dark:bg-amber-950/40 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPayConfirmed}
                  onChange={e => setAutoPayConfirmed(e.target.checked)}
                  className="mt-1 w-4 h-4 text-amber-500 rounded focus:ring-amber-400"
                />
                <span className="text-xs text-amber-950 dark:text-amber-200 font-sans leading-relaxed">
                  <strong>Explicit User Authorization:</strong> I authorize KilowattIQ to automatically debit my saved tokenized mobile banking wallet up to ৳{autoPayCap.toLocaleString()} BDT per month for verified utility charges. I understand I can pause or modify this cap at any time.
                </span>
              </label>
            </div>

            {autoPaySuccessMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{autoPaySuccessMsg}</span>
              </div>
            )}

            <button
              onClick={handleSaveAutoPay}
              disabled={autoPaySaving}
              className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl font-display transition-all cursor-pointer disabled:opacity-50"
            >
              {autoPaySaving ? 'Updating...' : 'Save Auto-Pay Rules'}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 4: SAVED WALLETS (PCI-SAFE) */}
      {activeSubTab === 'METHODS' && (
        <div className="space-y-4 max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                Tokenized Payment Wallets
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                PCI-DSS Safe: raw PINs are never stored. Only authenticated agreement tokens.
              </p>
            </div>

            <button
              onClick={() => setShowAddMethodModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl font-display transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Link New Wallet</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {methods.map(method => (
              <div
                key={method.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 relative shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-display bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {method.provider}
                  </span>
                  {method.isDefault && (
                    <span className="text-[9px] font-bold font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                      DEFAULT
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white font-display">
                    {method.alias}
                  </h4>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 block mt-0.5">
                    {method.maskedIdentifier}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-[10px] font-mono text-slate-400">
                    Vault Token: {method.token.slice(0, 14)}...
                  </span>
                  <button
                    onClick={() => handleDeleteMethod(method.id)}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    title="Remove method"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 5: RECEIPTS & HISTORY */}
      {activeSubTab === 'HISTORY' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
              Payment & Top-Up History
            </h3>
            <span className="text-xs text-slate-500 font-mono">{history.length} Transactions</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map(item => (
              <div key={item.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-900 dark:text-white font-display">
                      {item.paymentType === 'PREPAID_TOPUP' ? 'Smart Prepaid Top-Up' : 'DESCO LT-A Postpaid Bill'}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Ref: {item.utilityReferenceId} • TrxID: {item.transactionId} • Channel: {item.provider}
                  </p>
                  {item.prepaidTokenSTS && (
                    <div className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <span>STS: {item.prepaidTokenSTS}</span>
                      <button
                        onClick={() => handleCopySts(item.prepaidTokenSTS!)}
                        className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        title="Copy 20-digit token"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-white block">
                      ৳{item.amountBDT.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.paidAt).toLocaleDateString()}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDownloadReceipt(item)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                    title="Download Receipt"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONFETTI-LITE SUCCESS MODAL WITH MOTION ANIMATION */}
      <AnimatePresence>
        {latestReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            {/* Confetti-lite floating particles (Motion) */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(24)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    opacity: 1,
                    y: -20,
                    x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800),
                    rotate: 0,
                    scale: Math.random() * 0.8 + 0.6,
                  }}
                  animate={{
                    opacity: [1, 1, 0],
                    y: [0, (typeof window !== 'undefined' ? window.innerHeight : 600) + 50],
                    x: `+=${(Math.random() - 0.5) * 120}`,
                    rotate: Math.random() * 360,
                  }}
                  transition={{
                    duration: 2.8 + Math.random() * 1.5,
                    ease: 'easeOut',
                    delay: Math.random() * 0.3,
                  }}
                  className={`absolute w-2.5 h-2.5 rounded-sm ${
                    ['bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-rose-400', 'bg-purple-400'][i % 5]
                  }`}
                />
              ))}
            </div>

            {/* Modal Card */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 15 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl max-w-md w-full text-center space-y-4 relative z-10"
            >
              <div className="w-14 h-14 bg-emerald-500/15 text-emerald-500 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/30">
                <Check className="w-7 h-7 stroke-[3]" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white font-display">
                  Payment Successful!
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  Verified by Bangladesh Energy Regulatory Commission (BERC)
                </p>
              </div>

              <div className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                ৳{latestReceipt.amountBDT.toLocaleString()} <span className="text-xs font-sans text-slate-500">BDT</span>
              </div>

              {/* 20-Digit STS Prepaid Token Display if Prepaid Top-Up */}
              {latestReceipt.prepaidTokenSTS && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-2 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wider font-display">
                      20-Digit STS Prepaid Token:
                    </span>
                    <button
                      onClick={() => handleCopySts(latestReceipt.prepaidTokenSTS!)}
                      className="flex items-center gap-1 text-[10px] font-bold font-display text-amber-700 dark:text-amber-300 hover:underline cursor-pointer"
                    >
                      {isCopiedToken ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{isCopiedToken ? 'Copied!' : 'Copy Token'}</span>
                    </button>
                  </div>
                  <div className="font-mono text-base font-black tracking-widest text-slate-900 dark:text-white text-center py-1 bg-white/70 dark:bg-slate-950/70 rounded-xl border border-amber-300 dark:border-amber-800">
                    {latestReceipt.prepaidTokenSTS}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block text-center font-sans">
                    Enter this sequence on your physical prepaid meter keypad followed by Enter.
                  </span>
                </div>
              )}

              {/* Details table */}
              <div className="space-y-1.5 text-xs font-mono text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 text-left">
                <div className="flex justify-between">
                  <span>Utility Ref:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{latestReceipt.utilityReferenceId}</span>
                </div>
                <div className="flex justify-between">
                  <span>TrxID ({latestReceipt.provider}):</span>
                  <span className="font-bold text-slate-900 dark:text-white">{latestReceipt.transactionId}</span>
                </div>
                {latestReceipt.energyUnitsCreditedKwh && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Credited Units:</span>
                    <span>+{latestReceipt.energyUnitsCreditedKwh} kWh</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleDownloadReceipt(latestReceipt)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 font-display transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Receipt</span>
                </button>
                <button
                  onClick={() => setLatestReceipt(null)}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl font-display transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ADD TOKENIZED WALLET */}
      <AnimatePresence>
        {showAddMethodModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md w-full space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                  Link Tokenized Wallet
                </h3>
                <button
                  onClick={() => setShowAddMethodModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 font-display">
                    Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['BKASH', 'NAGAD', 'ROCKET'] as PaymentProvider[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setNewMethodProvider(p)}
                        className={`py-2 rounded-xl text-xs font-bold font-display border transition-all cursor-pointer ${
                          newMethodProvider === p
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-black'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 font-display">
                    Wallet Label / Alias
                  </label>
                  <input
                    type="text"
                    value={newMethodAlias}
                    onChange={e => setNewMethodAlias(e.target.value)}
                    placeholder="e.g. Personal bKash"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 font-display">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={newMethodPhone}
                    onChange={e => setNewMethodPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 font-display">
                    OTP Verification Challenge
                  </label>
                  <input
                    type="text"
                    value={newMethodOtp}
                    onChange={e => setNewMethodOtp(e.target.value)}
                    placeholder="Enter 4-digit code"
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] text-slate-500 font-sans">
                  🔒 <strong>PCI Security Notice:</strong> KilowattIQ never requests or stores your bKash/Nagad PIN. The provider issues an encrypted vault token for verified recurring bills.
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setShowAddMethodModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMethod}
                  disabled={isSavingMethod}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl font-display"
                >
                  {isSavingMethod ? 'Saving...' : 'Link Token'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
