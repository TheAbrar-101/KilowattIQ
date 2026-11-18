import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera,
  CheckCircle2,
  ClipboardPaste,
  Gauge,
  MessageSquareText,
  Plus,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Wallet,
  Upload,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import {
  ManualMeterReading,
  MeterScanResult,
  MeterUsageMetrics,
  ParsedUtilitySms,
  SavedSmsRecord,
} from '../../server/meters/types';
import { useLanguage } from '../../context/LanguageContext';

export type MeterWorkflowTab = 'ADD_READING' | 'SCAN_METER' | 'PASTE_SMS';

interface RealMeterHubProps {
  household: Household;
  token?: string | null;
  initialWorkflow?: MeterWorkflowTab;
  onMetricsUpdated?: (metrics: MeterUsageMetrics) => void;
}

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

async function compressImageForUpload(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });

  // Resize large mobile camera captures cleanly to keep Gemini Vision uploads fast
  if (file.size <= 900 * 1024 || typeof document === 'undefined') {
    return { base64: dataUrl, mimeType: file.type || 'image/jpeg' };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ base64: dataUrl, mimeType: file.type || 'image/jpeg' });
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: compressed, mimeType: 'image/jpeg' });
    };
    img.onerror = () => resolve({ base64: dataUrl, mimeType: file.type || 'image/jpeg' });
    img.src = dataUrl;
  });
}

const getReadingsStorageKey = (householdId: string) =>
  `kilowattiq_real_readings_${householdId}`;
const getSmsStorageKey = (householdId: string) =>
  `kilowattiq_real_sms_${householdId}`;

function readStoredArray<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredArray<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export const RealMeterHub: React.FC<RealMeterHubProps> = ({
  household,
  token,
  initialWorkflow = 'ADD_READING',
  onMetricsUpdated,
}) => {
  const { language, formatCurrency, formatNumber } = useLanguage();
  const [workflow, setWorkflow] = useState<MeterWorkflowTab>(initialWorkflow);

  // Loaded household readings, metrics, and saved SMS records
  const [readings, setReadings] = useState<ManualMeterReading[]>([]);
  const [metrics, setMetrics] = useState<MeterUsageMetrics | null>(null);
  const [smsRecords, setSmsRecords] = useState<SavedSmsRecord[]>([]);
  const [loadStatus, setLoadStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Flow 1: Add Manual Reading
  const todayStr = new Date().toISOString().slice(0, 10);
  const [manualKwh, setManualKwh] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(todayStr);
  const [manualNotes, setManualNotes] = useState<string>('');
  const [manualStatus, setManualStatus] = useState<AsyncStatus>('idle');
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  // Flow 2: Scan Meter (Gemini Vision on server, confirm/edit BEFORE saving)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<AsyncStatus>('idle');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<MeterScanResult | null>(null);
  const [confirmScanKwh, setConfirmScanKwh] = useState<string>('');
  const [confirmScanDate, setConfirmScanDate] = useState<string>(todayStr);
  const [confirmScanStatus, setConfirmScanStatus] = useState<AsyncStatus>('idle');
  const [confirmScanMessage, setConfirmScanMessage] = useState<string | null>(null);

  // Flow 3: Paste SMS (parse -> confirm/edit -> save)
  const [smsInput, setSmsInput] = useState<string>('');
  const [smsParseStatus, setSmsParseStatus] = useState<AsyncStatus>('idle');
  const [smsParseError, setSmsParseError] = useState<string | null>(null);
  const [parsedSms, setParsedSms] = useState<ParsedUtilitySms | null>(null);
  const [confirmSmsAmount, setConfirmSmsAmount] = useState<string>('');
  const [confirmSmsDate, setConfirmSmsDate] = useState<string>('');
  const [confirmSmsBalance, setConfirmSmsBalance] = useState<string>('');
  const [confirmSmsUtility, setConfirmSmsUtility] = useState<string>('');
  const [confirmSmsSaveStatus, setConfirmSmsSaveStatus] = useState<AsyncStatus>('idle');
  const [confirmSmsMessage, setConfirmSmsMessage] = useState<string | null>(null);

  const fetchAllMeterData = useCallback(async () => {
    setLoadStatus('loading');
    setLoadError(null);
    const baseHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const postHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...baseHeaders,
    };

    try {
      const [readingsRes, smsRes] = await Promise.all([
        fetch(`/api/v1/meters/readings?householdId=${encodeURIComponent(household.id)}`, {
          headers: baseHeaders,
        }),
        fetch(`/api/v1/meters/sms?householdId=${encodeURIComponent(household.id)}`, {
          headers: baseHeaders,
        }),
      ]);
      const readingsJson = await readingsRes.json();
      const smsJson = await smsRes.json();

      if (!readingsRes.ok || readingsJson.status !== 'success') {
        throw new Error(readingsJson.message || 'Unable to load meter readings.');
      }

      let resolvedReadings: ManualMeterReading[] = readingsJson.data.readings || [];
      let resolvedMetrics: MeterUsageMetrics | null = readingsJson.data.metrics || null;

      // Rehydrate from browser localStorage if server in-memory store restarted/cold-started empty
      const readingsKey = getReadingsStorageKey(household.id);
      if (resolvedReadings.length === 0) {
        const storedReadings = readStoredArray<ManualMeterReading>(readingsKey);
        if (storedReadings.length > 0) {
          const sortedChron = [...storedReadings].sort((a, b) =>
            a.readingDate.localeCompare(b.readingDate) || a.createdAt.localeCompare(b.createdAt)
          );
          for (const item of sortedChron) {
            const replayRes = await fetch('/api/v1/meters/readings', {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify({
                householdId: household.id,
                readingKwh: item.readingKwh,
                readingDate: item.readingDate,
                source: item.source,
                confidence: item.confidence,
                notes: item.notes,
              }),
            });
            if (replayRes.ok) {
              const replayJson = await replayRes.json();
              if (replayJson.status === 'success') {
                resolvedReadings = replayJson.data.readings || resolvedReadings;
                resolvedMetrics = replayJson.data.metrics || resolvedMetrics;
              }
            }
          }
          writeStoredArray(readingsKey, resolvedReadings);
        }
      } else {
        writeStoredArray(readingsKey, resolvedReadings);
      }

      setReadings(resolvedReadings);
      setMetrics(resolvedMetrics);
      if (onMetricsUpdated && resolvedMetrics) {
        onMetricsUpdated(resolvedMetrics);
      }

      let resolvedSms: SavedSmsRecord[] =
        smsRes.ok && smsJson.status === 'success' ? smsJson.data || [] : [];
      const smsKey = getSmsStorageKey(household.id);
      if (resolvedSms.length === 0) {
        const storedSms = readStoredArray<SavedSmsRecord>(smsKey);
        if (storedSms.length > 0) {
          const oldestFirst = [...storedSms].reverse();
          for (const item of oldestFirst) {
            const replaySmsRes = await fetch('/api/v1/meters/sms', {
              method: 'POST',
              headers: postHeaders,
              body: JSON.stringify({
                householdId: household.id,
                smsType: item.smsType,
                utility: item.utility,
                amountBdt: item.amountBdt,
                date: item.date,
                balanceBdt: item.balanceBdt,
                unitsKwh: item.unitsKwh,
                token: item.token,
                rawText: item.rawText,
              }),
            });
            if (replaySmsRes.ok) {
              const replaySmsJson = await replaySmsRes.json();
              if (replaySmsJson.status === 'success') {
                resolvedSms = replaySmsJson.data.records || resolvedSms;
              }
            }
          }
          writeStoredArray(smsKey, resolvedSms);
        }
      } else {
        writeStoredArray(smsKey, resolvedSms);
      }

      setSmsRecords(resolvedSms);
      setLoadStatus('success');
    } catch (err: any) {
      setLoadStatus('error');
      setLoadError(
        language === 'bn'
          ? 'আপনার মিটার রিডিং লোড করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
          : err?.message || 'Unable to load your meter readings. Please try again.'
      );
    }
  }, [household.id, token, language, onMetricsUpdated]);

  useEffect(() => {
    fetchAllMeterData();
  }, [fetchAllMeterData]);

  // Helper: Check client-side monotonic constraint before submitting
  const validateAgainstExisting = (val: number, dateStr: string): string | null => {
    let prev: ManualMeterReading | null = null;
    let next: ManualMeterReading | null = null;
    for (const r of readings) {
      if (r.readingDate <= dateStr) {
        prev = r;
      } else if (!next) {
        next = r;
      }
    }
    if (prev && val < prev.readingKwh) {
      return language === 'bn'
        ? `রিডিং (${formatNumber(val)} kWh) পূর্ববর্তী রিডিংয়ের (${formatNumber(prev.readingKwh)} kWh, ${prev.readingDate}) চেয়ে কম হতে পারবে না।`
        : `Reading (${val} kWh) cannot be lower than the previous reading (${prev.readingKwh} kWh on ${prev.readingDate}).`;
    }
    if (next && val > next.readingKwh) {
      return language === 'bn'
        ? `রিডিং (${formatNumber(val)} kWh) পরবর্তী তারিখের রিডিংয়ের (${formatNumber(next.readingKwh)} kWh, ${next.readingDate}) চেয়ে বেশি হতে পারবে না।`
        : `Reading (${val} kWh) cannot be higher than the later reading (${next.readingKwh} kWh on ${next.readingDate}).`;
    }
    return null;
  };

  // Flow 1 Handler: Add Manual Reading
  const handleAddManualReading = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const numericVal = Number(manualKwh);
    if (manualKwh.trim() === '' || !Number.isFinite(numericVal) || numericVal < 0) {
      setManualStatus('error');
      setManualMessage(
        language === 'bn'
          ? 'অনুগ্রহ করে সঠিক ধনাত্মক মিটার রিডিং (kWh) লিখুন।'
          : 'Please enter a valid non-negative meter reading (kWh).'
      );
      return;
    }

    const clientCheck = validateAgainstExisting(numericVal, manualDate);
    if (clientCheck) {
      setManualStatus('error');
      setManualMessage(clientCheck);
      return;
    }

    setManualStatus('loading');
    setManualMessage(null);
    try {
      const res = await fetch('/api/v1/meters/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          householdId: household.id,
          readingKwh: numericVal,
          readingDate: manualDate,
          source: 'MANUAL',
          notes: manualNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not save reading.');
      }

      setReadings(json.data.readings);
      writeStoredArray(getReadingsStorageKey(household.id), json.data.readings || []);
      setMetrics(json.data.metrics);
      if (onMetricsUpdated && json.data.metrics) {
        onMetricsUpdated(json.data.metrics);
      }

      setManualKwh('');
      setManualNotes('');
      setManualStatus('success');
      setManualMessage(
        language === 'bn'
          ? 'মিটার রিডিং সফলভাবে সংরক্ষণ করা হয়েছে।'
          : 'Meter reading saved to your real household log.'
      );
    } catch (err: any) {
      setManualStatus('error');
      setManualMessage(err?.message || 'Failed to save meter reading. Please try again.');
    }
  };

  // Flow 2 Handler: Scan Meter Photo via Server Gemini Vision (never auto-saves)
  const handleMeterPhotoSelected = async (file: File) => {
    setScanStatus('loading');
    setScanError(null);
    setScanResult(null);
    setConfirmScanStatus('idle');
    setConfirmScanMessage(null);

    try {
      const { base64, mimeType } = await compressImageForUpload(file);
      setScanPreviewUrl(base64);

      const res = await fetch('/api/v1/meters/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not read meter photo.');
      }

      const extraction: MeterScanResult = json.data;
      setScanResult(extraction);
      setConfirmScanKwh(extraction.readingKwh !== null ? String(extraction.readingKwh) : '');
      setConfirmScanDate(todayStr);
      setScanStatus('success');
    } catch (err: any) {
      setScanStatus('error');
      setScanError(
        err?.message ||
          (language === 'bn'
            ? 'মিটারের ছবি পড়া সম্ভব হয়নি। পরিষ্কার ছবি দিয়ে আবার চেষ্টা করুন।'
            : 'Unable to scan the meter photo right now. Please try again with a clearer photo.')
      );
    }
  };

  // Flow 2 Step 2: Confirm & Save Scanned Reading
  const handleConfirmScannedReading = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Number(confirmScanKwh);
    if (confirmScanKwh.trim() === '' || !Number.isFinite(numericVal) || numericVal < 0) {
      setConfirmScanStatus('error');
      setConfirmScanMessage(
        language === 'bn'
          ? 'সংরক্ষণ করার আগে সঠিক kWh সংখ্যা নিশ্চিত বা সংশোধন করুন।'
          : 'Please confirm or enter a valid kWh reading before saving.'
      );
      return;
    }

    const clientCheck = validateAgainstExisting(numericVal, confirmScanDate);
    if (clientCheck) {
      setConfirmScanStatus('error');
      setConfirmScanMessage(clientCheck);
      return;
    }

    setConfirmScanStatus('loading');
    setConfirmScanMessage(null);

    try {
      const res = await fetch('/api/v1/meters/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          householdId: household.id,
          readingKwh: numericVal,
          readingDate: confirmScanDate,
          source: 'METER_SCAN',
          confidence: scanResult?.confidence,
          notes: scanResult?.rawText ? `Scanned: ${scanResult.rawText}` : 'Confirmed meter scan',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not save scanned reading.');
      }

      setReadings(json.data.readings);
      writeStoredArray(getReadingsStorageKey(household.id), json.data.readings || []);
      setMetrics(json.data.metrics);
      if (onMetricsUpdated && json.data.metrics) {
        onMetricsUpdated(json.data.metrics);
      }

      setConfirmScanStatus('success');
      setConfirmScanMessage(
        language === 'bn'
          ? 'যাচাইকৃত মিটার রিডিং সংরক্ষণ করা হয়েছে।'
          : 'Confirmed meter scan saved to your readings.'
      );
    } catch (err: any) {
      setConfirmScanStatus('error');
      setConfirmScanMessage(err?.message || 'Failed to save confirmed reading. Please try again.');
    }
  };

  // Flow 3 Step 1: Parse Utility SMS (never auto-saves)
  const handleParseSms = async () => {
    if (!smsInput.trim()) {
      setSmsParseStatus('error');
      setSmsParseError(
        language === 'bn'
          ? 'অনুগ্রহ করে প্রথমে আপনার বিদ্যুৎ রিচার্জ বা বিল এসএমএস পেস্ট করুন।'
          : 'Please paste a utility recharge or bill SMS first.'
      );
      return;
    }

    setSmsParseStatus('loading');
    setSmsParseError(null);
    setParsedSms(null);
    setConfirmSmsSaveStatus('idle');
    setConfirmSmsMessage(null);

    try {
      const res = await fetch('/api/v1/meters/parse-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ smsText: smsInput }),
      });

      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Unable to parse SMS.');
      }

      const result: ParsedUtilitySms = json.data;
      if (!result.parsed) {
        setSmsParseStatus('error');
        setSmsParseError(
          language === 'bn'
            ? 'এই এসএমএস থেকে বিলের পরিমাণ, ব্যালেন্স বা তারিখ শনাক্ত করা যায়নি। পুরো এসএমএস কপি করে আবার চেষ্টা করুন।'
            : result.failureReason ||
              'Could not extract amount, date, or balance from this SMS. Please check the text and try again.'
        );
        return;
      }

      setParsedSms(result);
      setConfirmSmsAmount(result.amountBdt !== null ? String(result.amountBdt) : '');
      setConfirmSmsDate(result.date || todayStr);
      setConfirmSmsBalance(result.balanceBdt !== null ? String(result.balanceBdt) : '');
      setConfirmSmsUtility(result.utility || household.utilityProvider || 'DESCO');
      setSmsParseStatus('success');
    } catch (err: any) {
      setSmsParseStatus('error');
      setSmsParseError(err?.message || 'Failed to parse SMS. Please try again.');
    }
  };

  // Flow 3 Step 2: Confirm & Save SMS Record
  const handleConfirmSaveSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedSms) return;

    const amt = confirmSmsAmount.trim() !== '' ? Number(confirmSmsAmount) : null;
    const bal = confirmSmsBalance.trim() !== '' ? Number(confirmSmsBalance) : null;

    if ((amt === null || Number.isNaN(amt)) && (bal === null || Number.isNaN(bal)) && parsedSms.unitsKwh === null) {
      setConfirmSmsSaveStatus('error');
      setConfirmSmsMessage(
        language === 'bn'
          ? 'সংরক্ষণ করতে অন্তত টাকার পরিমাণ বা ব্যালেন্স দিন।'
          : 'Please include at least an amount or balance before saving.'
      );
      return;
    }

    setConfirmSmsSaveStatus('loading');
    setConfirmSmsMessage(null);

    try {
      const res = await fetch('/api/v1/meters/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          householdId: household.id,
          smsType: parsedSms.smsType,
          utility: confirmSmsUtility || null,
          amountBdt: amt,
          date: confirmSmsDate || null,
          balanceBdt: bal,
          unitsKwh: parsedSms.unitsKwh,
          token: parsedSms.token,
          rawText: parsedSms.rawText,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not save SMS record.');
      }

      setSmsRecords(json.data.records || []);
      writeStoredArray(getSmsStorageKey(household.id), json.data.records || []);
      setConfirmSmsSaveStatus('success');
      setConfirmSmsMessage(
        language === 'bn'
          ? 'এসএমএস তথ্য সফলভাবে সংরক্ষণ করা হয়েছে।'
          : 'Confirmed SMS record saved.'
      );
    } catch (err: any) {
      setConfirmSmsSaveStatus('error');
      setConfirmSmsMessage(err?.message || 'Failed to save SMS record. Please try again.');
    }
  };

  const handleDeleteReading = async (id: string) => {
    try {
      const res = await fetch(
        `/api/v1/meters/readings/${encodeURIComponent(id)}?householdId=${encodeURIComponent(household.id)}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const json = await res.json();
      if (res.ok && json.status === 'success') {
        const nextReadings = json.data.readings || [];
        setReadings(nextReadings);
        writeStoredArray(getReadingsStorageKey(household.id), nextReadings);
        setMetrics(json.data.metrics || null);
        if (onMetricsUpdated && json.data.metrics) {
          onMetricsUpdated(json.data.metrics);
        }
      }
    } catch {
      // Non-blocking error
    }
  };

  const handleDeleteSms = async (id: string) => {
    try {
      const res = await fetch(
        `/api/v1/meters/sms/${encodeURIComponent(id)}?householdId=${encodeURIComponent(household.id)}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const json = await res.json();
      if (res.ok && json.status === 'success') {
        const nextSms = json.data || [];
        setSmsRecords(nextSms);
        writeStoredArray(getSmsStorageKey(household.id), nextSms);
      }
    } catch {
      // Non-blocking error
    }
  };

  const latestBalanceSms = smsRecords.find((s) => s.balanceBdt !== null) || null;
  const chronologicalDesc = [...readings].reverse();

  return (
    <div className="space-y-5 font-['Plus_Jakarta_Sans']">
      {/* Summary KPI Cards from Real Readings Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Daily Usage */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
              {language === 'bn' ? 'দৈনিক ব্যবহার' : 'Daily Usage'}
            </span>
            <TrendingUp className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {metrics?.dailyUsageKwh !== null && metrics?.dailyUsageKwh !== undefined
                ? `${formatNumber(metrics.dailyUsageKwh.toFixed(2))} kWh`
                : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {metrics?.dailySpanDays
              ? language === 'bn'
                ? `সর্বশেষ ${formatNumber(metrics.dailySpanDays)} দিনের গড়`
                : `Avg over last ${metrics.dailySpanDays} day${metrics.dailySpanDays > 1 ? 's' : ''}`
              : language === 'bn'
                ? 'হিসাব করতে অন্তত ২টি রিডিং যোগ করুন'
                : 'Add 2+ readings to calculate'}
          </p>
        </div>

        {/* Month-to-Date Usage */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
              {language === 'bn' ? 'চলতি মাসের ব্যবহার (MTD)' : 'Month-to-Date Usage'}
            </span>
            <Calendar className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {metrics?.monthToDateKwh !== null && metrics?.monthToDateKwh !== undefined
                ? `${formatNumber(metrics.monthToDateKwh.toFixed(1))} kWh`
                : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics?.monthToDateEstimatedCostBdt !== null && metrics?.monthToDateEstimatedCostBdt !== undefined
              ? `${language === 'bn' ? 'আনুমানিক বিল:' : 'Est. BERC Bill:'} ${formatCurrency(metrics.monthToDateEstimatedCostBdt)}`
              : metrics?.monthLabel || todayStr.slice(0, 7)}
          </p>
        </div>

        {/* Latest Meter Reading */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
              {language === 'bn' ? 'সর্বশেষ মিটার রিডিং' : 'Latest Meter Reading'}
            </span>
            <Gauge className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {metrics?.latestReading
                ? `${formatNumber(metrics.latestReading.readingKwh)} kWh`
                : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics?.latestReading
              ? `${metrics.latestReading.readingDate} • ${
                  metrics.latestReading.source === 'METER_SCAN'
                    ? language === 'bn'
                      ? 'ছবি স্ক্যান'
                      : 'Meter Scan'
                    : language === 'bn'
                      ? 'ম্যানুয়াল'
                      : 'Manual'
                }`
              : language === 'bn'
                ? 'কোনো রিডিং নেই'
                : 'No readings logged yet'}
          </p>
        </div>

        {/* Latest SMS Balance */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-['Outfit']">
              {language === 'bn' ? 'সর্বশেষ এসএমএস ব্যালেন্স' : 'Latest SMS Balance'}
            </span>
            <Wallet className="w-4 h-4 text-sky-500 dark:text-sky-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {latestBalanceSms?.balanceBdt !== null && latestBalanceSms?.balanceBdt !== undefined
                ? formatCurrency(latestBalanceSms.balanceBdt, { showDecimals: true })
                : '—'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {latestBalanceSms
              ? `${latestBalanceSms.utility || household.utilityProvider} • ${latestBalanceSms.date || latestBalanceSms.createdAt.slice(0, 10)}`
              : language === 'bn'
                ? 'ইউটিলিটি এসএমএস পেস্ট করুন'
                : 'Paste a utility SMS to track'}
          </p>
        </div>
      </div>

      {/* Load Error State */}
      {loadStatus === 'error' && loadError && (
        <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={fetchAllMeterData}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-['Outfit'] font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            {language === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Try again'}
          </button>
        </div>
      )}

      {/* Workflow Selector & Input Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
              {language === 'bn'
                ? 'আইওটি হার্ডওয়্যার ছাড়াই প্রকৃত মিটার ট্র্যাকিং'
                : 'Track Your Meter Without IoT Hardware'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
              {language === 'bn'
                ? 'ম্যানুয়াল রিডিং দিন, মিটারের ছবি তুলুন অথবা ইউটিলিটি এসএমএস পেস্ট করুন।'
                : 'Log manual meter readings, scan your meter photo, or paste a DESCO/DPDC/BPDB SMS.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setWorkflow('ADD_READING')}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-['Outfit'] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                workflow === 'ADD_READING'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">{language === 'bn' ? 'রিডিং যোগ' : 'Add reading'}</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkflow('SCAN_METER')}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-['Outfit'] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                workflow === 'SCAN_METER'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span className="truncate">{language === 'bn' ? 'মিটার স্ক্যান' : 'Scan meter'}</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkflow('PASTE_SMS')}
              className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-['Outfit'] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                workflow === 'PASTE_SMS'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              <ClipboardPaste className="w-4 h-4 shrink-0" />
              <span className="truncate">{language === 'bn' ? 'এসএমএস পেস্ট' : 'Paste SMS'}</span>
            </button>
          </div>
        </div>

        {/* 1. ADD READING FLOW */}
        {workflow === 'ADD_READING' && (
          <form onSubmit={handleAddManualReading} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']">
                  {language === 'bn' ? 'মিটার রিডিং (kWh)' : 'Meter Reading (kWh)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={manualKwh}
                  onChange={(e) => {
                    setManualKwh(e.target.value);
                    if (manualStatus !== 'idle') {
                      setManualStatus('idle');
                      setManualMessage(null);
                    }
                  }}
                  placeholder={metrics?.latestReading ? `>= ${metrics.latestReading.readingKwh}` : 'e.g. 12845.5'}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']">
                  {language === 'bn' ? 'তারিখ' : 'Reading Date'}
                </label>
                <input
                  type="date"
                  required
                  value={manualDate}
                  onChange={(e) => {
                    setManualDate(e.target.value);
                    if (manualStatus !== 'idle') {
                      setManualStatus('idle');
                      setManualMessage(null);
                    }
                  }}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']">
                  {language === 'bn' ? 'নোট (ঐচ্ছিক)' : 'Note (Optional)'}
                </label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder={language === 'bn' ? 'যেমন: রাতের রিডিং' : 'e.g. Night check'}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            {metrics?.latestReading && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {language === 'bn'
                  ? `সর্বশেষ সংরক্ষিত রিডিং: ${formatNumber(metrics.latestReading.readingKwh)} kWh (${metrics.latestReading.readingDate}) — নতুন রিডিং এর কম হতে পারবে না।`
                  : `Previous reading: ${metrics.latestReading.readingKwh} kWh on ${metrics.latestReading.readingDate} — new readings cannot be lower.`}
              </p>
            )}

            {manualMessage && (
              <div
                className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  manualStatus === 'error'
                    ? 'bg-amber-400/15 border-amber-400/50 text-amber-900 dark:text-amber-200'
                    : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {manualStatus === 'error' ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  )}
                  <span>{manualMessage}</span>
                </div>
                {manualStatus === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      setManualStatus('idle');
                      setManualMessage(null);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 font-['Outfit'] font-semibold text-xs cursor-pointer self-start sm:self-auto"
                  >
                    {language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={manualStatus === 'loading'}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {manualStatus === 'loading' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>
                  {manualStatus === 'loading'
                    ? language === 'bn'
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : language === 'bn'
                      ? 'রিডিং সংরক্ষণ করুন'
                      : 'Save Reading'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* 2. SCAN METER FLOW (Gemini Vision on Server, NEVER Auto-Saves) */}
        {workflow === 'SCAN_METER' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              aria-label={language === 'bn' ? 'মিটারের ছবি নির্বাচন করুন' : 'Select or capture meter display photo'}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleMeterPhotoSelected(file);
                }
                e.target.value = '';
              }}
            />

            <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 bg-slate-50 dark:bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
                    {language === 'bn'
                      ? 'মিটার ডিসপ্লের ছবি আপলোড বা তুলুন'
                      : 'Upload or Capture Meter Display Photo'}
                  </h4>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                    {language === 'bn'
                      ? 'জেমিনি ভিশন মিটারের সংখ্যা পড়বে। সংরক্ষণের আগে আপনি নিজে সংখ্যাটি যাচাই ও পরিবর্তন করতে পারবেন।'
                      : 'Server-side Gemini Vision reads your kWh display. You will confirm and edit the number before saving.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={scanStatus === 'loading'}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400 shrink-0"
              >
                {scanStatus === 'loading' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>
                  {scanStatus === 'loading'
                    ? language === 'bn'
                      ? 'ছবি বিশ্লেষণ হচ্ছে...'
                      : 'Reading Meter...'
                    : language === 'bn'
                      ? 'মিটার ছবি তুলুন / আপলোড'
                      : 'Scan Meter Photo'}
                </span>
              </button>
            </div>

            {scanStatus === 'error' && scanError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{scanError}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-['Outfit'] font-semibold text-xs cursor-pointer"
                  >
                    {language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkflow('ADD_READING')}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-['Outfit'] font-semibold text-xs cursor-pointer"
                  >
                    {language === 'bn' ? 'ম্যানুয়ালি লিখুন' : 'Enter manually'}
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation Card (NEVER auto-saved!) */}
            {scanStatus === 'success' && scanResult && (
              <form
                onSubmit={handleConfirmScannedReading}
                className="rounded-2xl border border-amber-400/50 bg-amber-400/5 p-4 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
                      {language === 'bn'
                        ? 'সংরক্ষণের আগে রিডিং যাচাই ও সংশোধন করুন (অটো-সেভ হয়নি)'
                        : 'Review & Edit Before Saving (Not Saved Yet)'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {scanResult.meterType} • {Math.round(scanResult.confidence * 100)}% conf.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  {scanPreviewUrl && (
                    <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-h-40 flex items-center justify-center">
                      <img
                        src={scanPreviewUrl}
                        alt={language === 'bn' ? 'স্ক্যান করা মিটারের ছবি' : 'Scanned meter display'}
                        className="max-h-40 w-auto object-contain"
                      />
                    </div>
                  )}

                  <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']">
                        {language === 'bn' ? 'শনাক্তকৃত রিডিং (kWh)' : 'Extracted Reading (kWh)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={confirmScanKwh}
                        onChange={(e) => {
                          setConfirmScanKwh(e.target.value);
                          if (confirmScanStatus !== 'idle') {
                            setConfirmScanStatus('idle');
                            setConfirmScanMessage(null);
                          }
                        }}
                        placeholder={language === 'bn' ? 'সঠিক kWh লিখুন' : 'Enter or edit kWh'}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-amber-400/60 text-sm font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']">
                        {language === 'bn' ? 'রিডিংয়ের তারিখ' : 'Reading Date'}
                      </label>
                      <input
                        type="date"
                        required
                        value={confirmScanDate}
                        onChange={(e) => setConfirmScanDate(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>

                    <div className="sm:col-span-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                      {scanResult.rawText && (
                        <div>
                          <span className="font-semibold">{language === 'bn' ? 'ডিসপ্লে টেক্সট:' : 'Display text:'}</span>{' '}
                          <span className="font-mono">{scanResult.rawText}</span> ({scanResult.unitDetected})
                        </div>
                      )}
                      <div>{scanResult.notes}</div>
                    </div>
                  </div>
                </div>

                {confirmScanMessage && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      confirmScanStatus === 'error'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-900 dark:text-amber-200'
                        : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                    }`}
                  >
                    {confirmScanStatus === 'error' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                    )}
                    <span>{confirmScanMessage}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="submit"
                    disabled={confirmScanStatus === 'loading'}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <FileCheck2 className="w-4 h-4" />
                    <span>
                      {confirmScanStatus === 'loading'
                        ? language === 'bn'
                          ? 'সংরক্ষণ হচ্ছে...'
                          : 'Saving...'
                        : language === 'bn'
                          ? 'নিশ্চিত করে সংরক্ষণ করুন'
                          : 'Confirm & Save Reading'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScanStatus('idle');
                      setScanResult(null);
                      setScanPreviewUrl(null);
                      setConfirmScanMessage(null);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-['Outfit'] font-semibold text-xs cursor-pointer"
                  >
                    {language === 'bn' ? 'বাতিল' : 'Discard'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* 3. PASTE SMS FLOW */}
        {workflow === 'PASTE_SMS' && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="utility-sms-textarea"
                className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5 font-['Outfit']"
              >
                {language === 'bn'
                  ? 'ইউটিলিটি রিচার্জ বা বিল এসএমএস এখানে পেস্ট করুন'
                  : 'Paste Utility Recharge or Bill SMS'}
              </label>
              <textarea
                id="utility-sms-textarea"
                rows={3}
                value={smsInput}
                onChange={(e) => {
                  setSmsInput(e.target.value);
                  if (smsParseStatus !== 'idle') {
                    setSmsParseStatus('idle');
                    setSmsParseError(null);
                  }
                }}
                placeholder={
                  language === 'bn'
                    ? 'উদাহরণ: DESCO: Recharge Tk 1000.00 successful on 16/11/2026. Token: 1234-5678-9012-3456-7890. Bal: Tk 1342.50'
                    : 'e.g. DESCO: Recharge Tk 1000.00 successful on 16/11/2026. Token: 1234-5678-9012-3456-7890. Bal: Tk 1342.50'
                }
                className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={smsParseStatus === 'loading'}
                onClick={handleParseSms}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {smsParseStatus === 'loading' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquareText className="w-4 h-4" />
                )}
                <span>
                  {smsParseStatus === 'loading'
                    ? language === 'bn'
                      ? 'বিশ্লেষণ হচ্ছে...'
                      : 'Parsing SMS...'
                    : language === 'bn'
                      ? 'এসএমএস বিশ্লেষণ করুন'
                      : 'Parse SMS'}
                </span>
              </button>

              {smsInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSmsInput('');
                    setParsedSms(null);
                    setSmsParseStatus('idle');
                    setSmsParseError(null);
                    setConfirmSmsMessage(null);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-['Outfit'] font-semibold text-xs cursor-pointer"
                >
                  {language === 'bn' ? 'মুছে ফেলুন' : 'Clear'}
                </button>
              )}
            </div>

            {/* Plain-language SMS Parsing Failure State */}
            {smsParseStatus === 'error' && smsParseError && (
              <div className="p-3.5 rounded-xl bg-amber-400/15 border border-amber-400/50 text-xs text-amber-950 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                  <span>{smsParseError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleParseSms}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-400 text-slate-950 font-['Outfit'] font-semibold text-xs cursor-pointer self-start sm:self-auto shrink-0"
                >
                  {language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
                </button>
              </div>
            )}

            {/* Confirmation Form for Parsed SMS */}
            {smsParseStatus === 'success' && parsedSms && (
              <form
                onSubmit={handleConfirmSaveSms}
                className="rounded-2xl border border-amber-400/50 bg-amber-400/5 p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
                    {language === 'bn'
                      ? 'শনাক্তকৃত এসএমএস তথ্য যাচাই করে সংরক্ষণ করুন'
                      : 'Confirm Parsed SMS Details Before Saving'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {parsedSms.smsType}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 font-['Outfit']">
                      {language === 'bn' ? 'পরিমাণ (৳)' : 'Amount (৳)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={confirmSmsAmount}
                      onChange={(e) => setConfirmSmsAmount(e.target.value)}
                      placeholder="Not detected"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 font-['Outfit']">
                      {language === 'bn' ? 'তারিখ' : 'Date'}
                    </label>
                    <input
                      type="date"
                      value={confirmSmsDate}
                      onChange={(e) => setConfirmSmsDate(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 font-['Outfit']">
                      {language === 'bn' ? 'ব্যালেন্স (৳)' : 'Balance (৳)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={confirmSmsBalance}
                      onChange={(e) => setConfirmSmsBalance(e.target.value)}
                      placeholder="If present"
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1 font-['Outfit']">
                      {language === 'bn' ? 'বিতরণ কোম্পানি' : 'Utility'}
                    </label>
                    <input
                      type="text"
                      value={confirmSmsUtility}
                      onChange={(e) => setConfirmSmsUtility(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                {(parsedSms.unitsKwh !== null || parsedSms.token) && (
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-300 flex flex-wrap gap-4">
                    {parsedSms.unitsKwh !== null && (
                      <span>
                        {language === 'bn' ? 'ইউনিট:' : 'Units:'} {formatNumber(parsedSms.unitsKwh)} kWh
                      </span>
                    )}
                    {parsedSms.token && (
                      <span>
                        {language === 'bn' ? 'টোকেন:' : 'Token:'} {parsedSms.token}
                      </span>
                    )}
                  </div>
                )}

                {confirmSmsMessage && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      confirmSmsSaveStatus === 'error'
                        ? 'bg-amber-400/15 border-amber-400/50 text-amber-900 dark:text-amber-200'
                        : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{confirmSmsMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={confirmSmsSaveStatus === 'loading'}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>
                    {confirmSmsSaveStatus === 'loading'
                      ? language === 'bn'
                        ? 'সংরক্ষণ হচ্ছে...'
                        : 'Saving...'
                      : language === 'bn'
                        ? 'নিশ্চিত করে সংরক্ষণ করুন'
                        : 'Confirm & Save SMS Record'}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Real Meter Readings History & Empty State */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 font-['Outfit']">
            {language === 'bn' ? 'আপনার মিটার রিডিংয়ের তালিকা' : 'Your Meter Readings'} (
            <span className="font-mono tabular-nums">{formatNumber(readings.length)}</span>)
          </h4>
        </div>

        {readings.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Gauge className="w-6 h-6" />
            </div>
            <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-['Outfit']">
              {language === 'bn' ? 'এখনো কোনো প্রকৃত মিটার রিডিং যোগ করা হয়নি' : 'No Real Meter Readings Logged Yet'}
            </h5>
            <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
              {language === 'bn'
                ? 'দৈনিক ব্যবহার এবং চলতি মাসের খরচ হিসাব করতে অন্তত ২টি মিটার রিডিং যোগ করুন অথবা মিটারের ছবি স্ক্যান করুন।'
                : 'Add your first cumulative kWh meter reading or scan your meter display to compute daily usage and month-to-date BERC costs.'}
            </p>
            <button
              type="button"
              onClick={() => setWorkflow('ADD_READING')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs inline-flex items-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <Plus className="w-4 h-4" />
              <span>{language === 'bn' ? 'প্রথম রিডিং যোগ করুন' : 'Add Your First Reading'}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-['Outfit']">
                <tr>
                  <th className="py-2 pr-3 text-left">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                  <th className="py-2 px-3 text-left">{language === 'bn' ? 'মাধ্যম' : 'Source'}</th>
                  <th className="py-2 px-3 text-right">{language === 'bn' ? 'রিডিং (kWh)' : 'Reading (kWh)'}</th>
                  <th className="py-2 px-3 text-right">{language === 'bn' ? 'ব্যবহৃত (kWh)' : 'Delta (kWh)'}</th>
                  <th className="py-2 pl-3 text-right">{language === 'bn' ? 'অপসারণ' : 'Remove'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {chronologicalDesc.map((r, idx) => {
                  const prevChron = chronologicalDesc[idx + 1];
                  const delta = prevChron ? Number((r.readingKwh - prevChron.readingKwh).toFixed(2)) : null;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {r.readingDate}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold font-['Outfit'] text-slate-700 dark:text-slate-300">
                          {r.source === 'METER_SCAN'
                            ? language === 'bn'
                              ? 'ছবি স্ক্যান'
                              : 'Meter Scan'
                            : language === 'bn'
                              ? 'ম্যানুয়াল'
                              : 'Manual'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(r.readingKwh.toFixed(2))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {delta !== null ? `+${formatNumber(delta.toFixed(2))}` : '—'}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteReading(r.id)}
                          aria-label={language === 'bn' ? `${r.readingDate} তারিখের রিডিং মুছুন` : `Delete reading from ${r.readingDate}`}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Saved Utility SMS Log */}
      {smsRecords.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 font-['Outfit']">
              {language === 'bn' ? 'সংরক্ষিত ইউটিলিটি এসএমএস রেকর্ড' : 'Saved Utility SMS Records'} (
              <span className="font-mono tabular-nums">{formatNumber(smsRecords.length)}</span>)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-['Outfit']">
                <tr>
                  <th className="py-2 pr-3 text-left">{language === 'bn' ? 'তারিখ' : 'Date'}</th>
                  <th className="py-2 px-3 text-left">{language === 'bn' ? 'ধরণ / ইউটিলিটি' : 'Type / Utility'}</th>
                  <th className="py-2 px-3 text-right">{language === 'bn' ? 'পরিমাণ (৳)' : 'Amount'}</th>
                  <th className="py-2 px-3 text-right">{language === 'bn' ? 'ব্যালেন্স (৳)' : 'Balance'}</th>
                  <th className="py-2 pl-3 text-right">{language === 'bn' ? 'অপসারণ' : 'Remove'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {smsRecords.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {s.date || s.createdAt.slice(0, 10)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                      {s.utility || household.utilityProvider} • {s.smsType}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                      {s.amountBdt !== null ? formatCurrency(s.amountBdt, { showDecimals: true }) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {s.balanceBdt !== null ? formatCurrency(s.balanceBdt, { showDecimals: true }) : '—'}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteSms(s.id)}
                        aria-label={language === 'bn' ? 'এসএমএস রেকর্ড মুছুন' : 'Delete SMS record'}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
