import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  FileSearch,
  ExternalLink,
  ShieldCheck,
  Building,
  Calendar,
  Zap,
  Info,
  Trash2,
  HelpCircle,
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import { VerificationResult, ExtractedBillData, BillHistoryRecord } from '../../server/bills/types';
import { useAuth } from '../../context/AuthContext';

interface VerifyBillSectionProps {
  household: Household;
}

export const VerifyBillSection: React.FC<VerifyBillSectionProps> = ({ household }) => {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mode: 'PHOTO' or 'MANUAL'
  const [entryMode, setEntryMode] = useState<'PHOTO' | 'MANUAL'>('PHOTO');

  // Photo Upload State
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Manual Form State
  const [manualForm, setManualForm] = useState({
    utility: household.utilityProvider || 'DESCO',
    month: 'October 2026',
    unitsKwh: 285,
    totalBdt: 2580, // Example with discrepancy
    sanctionedLoadKw: household.sanctionedLoadKw || 3.0,
    previousReading: 12540,
    presentReading: 12825,
    customerAccount: 'ACC-8821940',
    meterNumber: 'MTR-55102',
  });

  // Current Verification State
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bill History State
  const [history, setHistory] = useState<BillHistoryRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Dispute Draft Language Toggle & Copied State
  const [disputeLang, setDisputeLang] = useState<'en' | 'bn'>('en');
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);
  const [showDetailedSlabs, setShowDetailedSlabs] = useState<boolean>(false);

  // Fetch bill history on mount
  useEffect(() => {
    fetchHistory();
  }, [household.id]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/v1/bills/history?householdId=${household.id}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setHistory(data.data);
      }
    } catch (err) {
      console.warn('Failed to load bill history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedImage(reader.result);
        triggerOcrExtraction(reader.result, file.type);
      }
    };
    reader.readAsDataURL(file);
  };

  // Run OCR on the image
  const triggerOcrExtraction = async (base64Img: string, mimeType: string = 'image/jpeg') => {
    setIsExtracting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/bills/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          imageBase64: base64Img,
          mimeType,
        }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        const extracted: ExtractedBillData = data.data;
        // Populate manual form with extracted parameters for verification
        setManualForm(prev => ({
          ...prev,
          utility: extracted.utility || prev.utility,
          month: extracted.month || prev.month,
          unitsKwh: extracted.unitsKwh,
          totalBdt: extracted.totalBdt,
          sanctionedLoadKw: extracted.sanctionedLoadKw || prev.sanctionedLoadKw,
          previousReading: extracted.meterReading.previous ?? prev.previousReading,
          presentReading: extracted.meterReading.present ?? prev.presentReading,
          customerAccount: extracted.customerAccount || prev.customerAccount,
          meterNumber: extracted.meterNumber || prev.meterNumber,
        }));

        // Immediately verify extracted bill against BERC slabs
        await runVerification(extracted, base64Img);
      } else {
        setErrorMsg(data.message || 'Could not extract bill parameters.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred during bill OCR.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Run Tariff verification against BERC slabs
  const runVerification = async (billData: ExtractedBillData, imgUrl?: string) => {
    setIsVerifying(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/bills/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          householdId: household.id,
          billData,
          sanctionedLoadKw: manualForm.sanctionedLoadKw || household.sanctionedLoadKw,
          billImageUrl: imgUrl || selectedImage || undefined,
        }),
      });
      const data = await res.json();
      if (data.status === 'success' && data.data) {
        setVerificationResult(data.data);
        fetchHistory(); // Refresh history
      } else {
        setErrorMsg(data.message || 'Failed to verify bill.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Verification network error.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle manual submit
  const handleManualVerify = () => {
    const billData: ExtractedBillData = {
      utility: (manualForm.utility as any) || 'DESCO',
      month: manualForm.month,
      unitsKwh: Number(manualForm.unitsKwh),
      totalBdt: Number(manualForm.totalBdt),
      sanctionedLoadKw: Number(manualForm.sanctionedLoadKw),
      meterReading: {
        previous: Number(manualForm.previousReading),
        present: Number(manualForm.presentReading),
        difference: Number(manualForm.unitsKwh),
      },
      customerAccount: manualForm.customerAccount,
      meterNumber: manualForm.meterNumber,
      confidence: 1.0,
      notes: 'Manually entered parameters',
    };

    runVerification(billData);
  };

  // Load a quick sample test bill
  const loadPresetBill = (type: 'accurate' | 'overcharged' | 'lifeline') => {
    if (type === 'accurate') {
      // 285 kWh accurately calculated is ~৳2,277.49
      const data: ExtractedBillData = {
        utility: 'DESCO',
        month: 'September 2026',
        unitsKwh: 285,
        totalBdt: 2280,
        sanctionedLoadKw: 3.0,
        meterReading: { previous: 12255, present: 12540, difference: 285 },
        customerAccount: 'DESCO-AC-910482',
        meterNumber: 'MTR-88190',
        confidence: 0.98,
      };
      setManualForm({
        utility: data.utility,
        month: data.month,
        unitsKwh: data.unitsKwh,
        totalBdt: data.totalBdt,
        sanctionedLoadKw: data.sanctionedLoadKw || 3.0,
        previousReading: 12255,
        presentReading: 12540,
        customerAccount: data.customerAccount || '',
        meterNumber: data.meterNumber || '',
      });
      runVerification(data);
    } else if (type === 'overcharged') {
      // 285 kWh billed at ৳2,580 (৳302 / ~13.3% discrepancy)
      const data: ExtractedBillData = {
        utility: 'DPDC',
        month: 'August 2026',
        unitsKwh: 285,
        totalBdt: 2580,
        sanctionedLoadKw: 3.0,
        meterReading: { previous: 11970, present: 12255, difference: 285 },
        customerAccount: 'DPDC-AC-40291',
        meterNumber: 'DPDC-MTR-9940',
        confidence: 0.95,
      };
      setManualForm({
        utility: data.utility,
        month: data.month,
        unitsKwh: data.unitsKwh,
        totalBdt: data.totalBdt,
        sanctionedLoadKw: data.sanctionedLoadKw || 3.0,
        previousReading: 11970,
        presentReading: 12255,
        customerAccount: data.customerAccount || '',
        meterNumber: data.meterNumber || '',
      });
      runVerification(data);
    } else {
      // Lifeline 45 kWh (Step 1 @ ৳4.63) -> ~৳236.70
      const data: ExtractedBillData = {
        utility: 'DESCO',
        month: 'July 2026',
        unitsKwh: 45,
        totalBdt: 240,
        sanctionedLoadKw: 2.0,
        meterReading: { previous: 8100, present: 8145, difference: 45 },
        customerAccount: 'DESCO-LIFE-1029',
        meterNumber: 'MTR-00412',
        confidence: 0.99,
      };
      setManualForm({
        utility: data.utility,
        month: data.month,
        unitsKwh: data.unitsKwh,
        totalBdt: data.totalBdt,
        sanctionedLoadKw: data.sanctionedLoadKw || 2.0,
        previousReading: 8100,
        presentReading: 8145,
        customerAccount: data.customerAccount || '',
        meterNumber: data.meterNumber || '',
      });
      runVerification(data);
    }
  };

  const handleCopyDispute = (lang: 'en' | 'bn') => {
    if (!verificationResult) return;
    const text = lang === 'en' ? verificationResult.disputeMessage.en : verificationResult.disputeMessage.bn;
    navigator.clipboard.writeText(text);
    setCopiedStatus(lang);
    setTimeout(() => setCopiedStatus(null), 2500);
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await fetch(`/api/v1/bills/${id}?householdId=${household.id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      setHistory(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.warn('Failed to delete history record:', e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl p-5 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <FileSearch className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                Verify My Bill — AI & BERC Tariff Audit
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono">
                DESCO / DPDC
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-sans max-w-2xl leading-relaxed">
              Upload a snapshot of your paper electricity bill or enter numbers manually. Our Gemini Vision pipeline extracts billing parameters, recalculates every slab with BERC official LT-A tariff rates, and generates copy-ready dispute letters if a discrepancy exceeds 5%.
            </p>
          </div>

          {/* Quick Demo Sample Bills */}
          <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 font-display">1-Click Quick Samples:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => loadPresetBill('overcharged')}
                className="px-2.5 py-1 text-[11px] font-bold font-display rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-300 border border-amber-500/40 transition-all cursor-pointer"
                title="Loads 285 kWh bill with 13% overcharge to test dispute flow"
              >
                ⚡ Test &gt;5% Overcharge
              </button>
              <button
                onClick={() => loadPresetBill('accurate')}
                className="px-2.5 py-1 text-[11px] font-bold font-display rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer"
                title="Loads standard 285 kWh bill that matches BERC calculations"
              >
                ✓ Accurate Match
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Input Stage: Photo Upload vs Manual Entry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Input Form / Upload Zone */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            
            {/* Mode Switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-display">
                Input Method
              </span>
              <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                <button
                  onClick={() => setEntryMode('PHOTO')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold font-display transition-all cursor-pointer ${
                    entryMode === 'PHOTO'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Photo OCR</span>
                </button>
                <button
                  onClick={() => setEntryMode('MANUAL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold font-display transition-all cursor-pointer ${
                    entryMode === 'MANUAL'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Manual Entry</span>
                </button>
              </div>
            </div>

            {/* Photo Mode */}
            {entryMode === 'PHOTO' && (
              <div className="space-y-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-amber-500/40 hover:border-amber-500 rounded-xl p-6 text-center transition-all bg-amber-500/5 hover:bg-amber-500/10 cursor-pointer group"
                >
                  {selectedImage ? (
                    <div className="space-y-3">
                      <div className="relative inline-block max-h-48 overflow-hidden rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
                        <img
                          src={selectedImage}
                          alt="Uploaded Electricity Bill"
                          className="max-h-48 w-auto object-contain mx-auto"
                        />
                        {isExtracting && (
                          <div className="absolute inset-0 bg-slate-950/70 flex flex-col items-center justify-center gap-2 text-amber-400 text-xs font-bold font-display backdrop-blur-xs">
                            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                            <span>Gemini Vision OCR scanning...</span>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Click to change photo
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-3">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-display">
                          Upload Bill Photo (DESCO / DPDC)
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          PNG, JPG, or camera snapshot up to 10MB
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {isExtracting && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-200 font-display">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                    <span>Extracting month, units (kWh), total BDT, and meter readings...</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual Form Inputs */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Utility Provider
                  </label>
                  <select
                    value={manualForm.utility}
                    onChange={e => setManualForm(prev => ({ ...prev, utility: e.target.value }))}
                    className="w-full text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="DESCO">DESCO (Dhaka North)</option>
                    <option value="DPDC">DPDC (Dhaka South)</option>
                    <option value="BPDB">BPDB (National)</option>
                    <option value="BREB">BREB (Palli Bidyut)</option>
                    <option value="WZPDCL">WZPDCL (Khulna/Barisal)</option>
                    <option value="NESCO">NESCO (Rajshahi/Rangpur)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Billing Month
                  </label>
                  <input
                    type="text"
                    value={manualForm.month}
                    onChange={e => setManualForm(prev => ({ ...prev, month: e.target.value }))}
                    placeholder="e.g. October 2026"
                    className="w-full text-xs font-bold font-sans rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Units Consumed (kWh) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualForm.unitsKwh}
                    onChange={e => setManualForm(prev => ({ ...prev, unitsKwh: Math.max(0, Number(e.target.value)) }))}
                    className="w-full text-sm font-bold font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Total Billed BDT (৳) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualForm.totalBdt}
                    onChange={e => setManualForm(prev => ({ ...prev, totalBdt: Math.max(0, Number(e.target.value)) }))}
                    className="w-full text-sm font-bold font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Collapsible Meter Reading Details */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Prev Reading (kWh)
                  </label>
                  <input
                    type="number"
                    value={manualForm.previousReading}
                    onChange={e => setManualForm(prev => ({ ...prev, previousReading: Number(e.target.value) }))}
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Present Reading (kWh)
                  </label>
                  <input
                    type="number"
                    value={manualForm.presentReading}
                    onChange={e => setManualForm(prev => ({ ...prev, presentReading: Number(e.target.value) }))}
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Sanctioned Load (kW)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={manualForm.sanctionedLoadKw}
                    onChange={e => setManualForm(prev => ({ ...prev, sanctionedLoadKw: Number(e.target.value) }))}
                    className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1 font-display">
                    Account / Consumer ID
                  </label>
                  <input
                    type="text"
                    value={manualForm.customerAccount}
                    onChange={e => setManualForm(prev => ({ ...prev, customerAccount: e.target.value }))}
                    className="w-full text-xs font-sans rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                onClick={handleManualVerify}
                disabled={isVerifying || manualForm.unitsKwh <= 0}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-display text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditing against BERC Slabs...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Audit & Verify Bill Numbers</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Side-by-Side Comparison & Audit Verdict */}
        <div className="lg:col-span-7 space-y-4">
          {verificationResult ? (
            <div className="space-y-4">
              
              {/* Verdict Header Card */}
              <div className={`p-4 rounded-2xl border transition-all ${
                verificationResult.summary.hasDiscrepancy
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      verificationResult.summary.hasDiscrepancy
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-emerald-500 text-slate-950'
                    }`}>
                      {verificationResult.summary.hasDiscrepancy ? (
                        <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold font-display">
                          {verificationResult.summary.hasDiscrepancy
                            ? 'Check with Utility — Discrepancy Flagged'
                            : 'Bill Verified — Accurate & Compliant'}
                        </h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                          verificationResult.summary.hasDiscrepancy
                            ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {verificationResult.summary.differencePercent > 0 ? '+' : ''}
                          {verificationResult.summary.differencePercent}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {verificationResult.summary.hasDiscrepancy
                          ? `Utility billed ৳${verificationResult.summary.billedTotalBdt} BDT, but BERC official slabs recalculate to ৳${verificationResult.summary.calculatedTotalBdt} BDT (Variance: ৳${Math.abs(verificationResult.summary.differenceBdt)} BDT).`
                          : `Utility billed ৳${verificationResult.summary.billedTotalBdt} BDT, which matches the BERC residential calculation (৳${verificationResult.summary.calculatedTotalBdt} BDT within tolerance).`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                      Side-by-Side Bill Reconciliation Table
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {verificationResult.utility} • {verificationResult.month}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] uppercase font-bold text-slate-500 font-display border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4">Line Item</th>
                        <th className="py-2.5 px-3 text-right">Utility Stated</th>
                        <th className="py-2.5 px-3 text-right">KilowattIQ BERC</th>
                        <th className="py-2.5 px-3 text-right">Difference</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {[
                        verificationResult.comparison.energyCost,
                        verificationResult.comparison.demandCharge,
                        verificationResult.comparison.meterRent,
                        verificationResult.comparison.vat,
                        verificationResult.comparison.grossTotal,
                      ].map((row, idx) => {
                        const isTotal = row.item === 'Total Payable Bill';
                        const isOver = row.status === 'OVERCHARGED';
                        const isUnder = row.status === 'UNDERCHARGED';

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                              isTotal ? 'bg-amber-500/5 font-bold border-t-2 border-slate-300 dark:border-slate-700' : ''
                            }`}
                          >
                            <td className="py-2.5 px-4">
                              <span className="font-display font-bold text-slate-900 dark:text-slate-100 block">
                                {row.item}
                              </span>
                              <span className="text-[10px] text-slate-400 font-sans block">
                                {row.itemBn}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                              ৳{row.utility.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-amber-700 dark:text-amber-400 font-bold">
                              ৳{row.kilowattiq.toFixed(2)}
                            </td>
                            <td className={`py-2.5 px-3 text-right ${
                              Math.abs(row.difference) > 1
                                ? isOver
                                  ? 'text-rose-500 font-bold'
                                  : 'text-sky-500 font-bold'
                                : 'text-slate-400'
                            }`}>
                              {row.difference > 0 ? `+৳${row.difference.toFixed(2)}` : `৳${row.difference.toFixed(2)}`}
                              {Math.abs(row.diffPercent) > 0 && (
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({row.diffPercent > 0 ? '+' : ''}{row.diffPercent}%)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              {Math.abs(row.diffPercent) <= 1.0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-display">
                                  <Check className="w-3 h-3" /> Exact
                                </span>
                              ) : isOver ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 font-display">
                                  +Over
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 font-display">
                                  -Under
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Slab breakdown accordion button */}
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => setShowDetailedSlabs(!showDetailedSlabs)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-amber-500 font-display transition-colors cursor-pointer"
                  >
                    <span>View Official BERC Telescopic Slab Breakdown</span>
                    {showDetailedSlabs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Total: {verificationResult.unitsKwh} Units
                  </span>
                </div>

                {/* Expanded Slabs */}
                {showDetailedSlabs && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                    {verificationResult.slabBreakdown.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-200 dark:border-slate-800/60 last:border-0">
                        <span className="font-display font-bold text-slate-800 dark:text-slate-200">
                          {s.stepName}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500">{s.kwhInSlab} kWh @ ৳{s.rate}/unit</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">৳{s.costBDT.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Copy-Ready Dispute Letter (Visible if Discrepancy > 5%) */}
              {verificationResult.summary.hasDiscrepancy && (
                <div className="bg-white dark:bg-slate-900 border border-amber-500/40 rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
                        Copy-Ready Utility Dispute Draft
                      </h4>
                    </div>

                    {/* Language Switcher */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => setDisputeLang('en')}
                        className={`px-2.5 py-1 text-[11px] font-bold font-display rounded-md transition-all cursor-pointer ${
                          disputeLang === 'en'
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        English
                      </button>
                      <button
                        onClick={() => setDisputeLang('bn')}
                        className={`px-2.5 py-1 text-[11px] font-bold font-display rounded-md transition-all cursor-pointer ${
                          disputeLang === 'bn'
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        বাংলা
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-400 font-sans">
                    Send this formal letter to {verificationResult.utility} customer care or submit it to the billing executive for manual reconciliation.
                  </p>

                  {/* Letter Content Preview Box */}
                  <div className="relative">
                    <pre className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-800 dark:text-slate-200 font-sans leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto select-all">
                      {disputeLang === 'en'
                        ? verificationResult.disputeMessage.en
                        : verificationResult.disputeMessage.bn}
                    </pre>

                    <button
                      onClick={() => handleCopyDispute(disputeLang)}
                      className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold font-display rounded-lg shadow-md transition-all cursor-pointer active:scale-95"
                    >
                      {copiedStatus === disputeLang ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Letter</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                <FileSearch className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-display">
                No Bill Audited Yet
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto font-sans leading-relaxed">
                Upload a bill image on the left, or click one of the 1-click test samples above to see instant side-by-side verification and dispute letter generation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bill History & Trend Log */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-display">
              Saved Bill History & Variance Trend
            </h4>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {history.length} Audited Bills Saved
          </span>
        </div>

        {history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {history.map((record) => (
              <div
                key={record.id}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 relative group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-display block">
                      {record.month}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {record.utility} • {record.unitsKwh} kWh
                    </span>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-display ${
                    record.hasDiscrepancy
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {record.hasDiscrepancy ? 'Check Utility' : 'Accurate'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-slate-200 dark:border-slate-800/60">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Billed:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      ৳{record.billedTotalBdt}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">BERC Slabs:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      ৳{record.calculatedTotalBdt}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans pt-1">
                  <span>
                    Variance: {record.differencePercent > 0 ? '+' : ''}{record.differencePercent}%
                  </span>
                  <button
                    onClick={() => handleDeleteHistory(record.id)}
                    className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Remove record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 font-mono text-center py-4">
            No historical bill records audited yet.
          </p>
        )}
      </div>
    </div>
  );
};
