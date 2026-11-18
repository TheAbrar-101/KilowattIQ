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

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const TARGET_UPLOAD_BYTES = 3.6 * 1024 * 1024;

function estimateBase64Bytes(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

async function compressImageForUpload(
  file: File,
  language: 'en' | 'bn' = 'en'
): Promise<{ base64: string; mimeType: string }> {
  const allowedPrefix = file.type ? file.type.toLowerCase().startsWith('image/') : false;
  const hasImageExt = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '');
  if (!allowedPrefix && !hasImageExt) {
    throw new Error(
      language === 'bn'
        ? 'শুধুমাত্র ছবি ফাইল (JPEG, PNG, WebP) আপলোড করা যাবে। অন্য ফাইল গ্রহণযোগ্য নয়।'
        : 'Only image files (JPEG, PNG, WebP) can be scanned. Non-image files are not allowed.'
    );
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () =>
      reject(
        new Error(
          language === 'bn' ? 'ছবি ফাইলটি পড়া যায়নি।' : 'Failed to read selected image file.'
        )
      );
    reader.readAsDataURL(file);
  });

  if (typeof document === 'undefined') {
    if (estimateBase64Bytes(dataUrl) > MAX_UPLOAD_BYTES) {
      throw new Error('Image exceeds the 4 MB upload limit.');
    }
    return { base64: dataUrl, mimeType: file.type || 'image/jpeg' };
  }

  const compressedDataUrl: string = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(
          new Error(
            language === 'bn'
              ? 'ব্রাউজারে ছবিটি প্রসেস করা যায়নি। অন্য ছবি দিন।'
              : 'Could not process the selected image in browser. Please try another photo.'
          )
        );
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      let output = canvas.toDataURL('image/jpeg', 0.7);
      if (estimateBase64Bytes(output) > TARGET_UPLOAD_BYTES) {
        output = canvas.toDataURL('image/jpeg', 0.55);
      }
      resolve(output);
    };
    img.onerror = () =>
      reject(
        new Error(
          language === 'bn'
            ? 'ফাইলটি বৈধ ছবি হিসেবে লোড করা যায়নি। অনুগ্রহ করে JPEG বা PNG মিটারের ছবি দিন।'
            : 'Selected file could not be decoded as an image. Please upload a valid JPEG or PNG meter photo.'
        )
      );
    img.src = dataUrl;
  });

  if (estimateBase64Bytes(compressedDataUrl) > MAX_UPLOAD_BYTES) {
    throw new Error(
      language === 'bn'
        ? 'সংকোচনের পরেও ছবিটি ৪ মেগাবাইটের বেশি বড়। অনুগ্রহ করে মিটারের কাছ থেকে ছোট ছবি তুলুন।'
        : 'Photo is still larger than 4 MB after compression. Please crop closer to the meter display or choose a smaller photo.'
    );
  }

  return { base64: compressedDataUrl, mimeType: 'image/jpeg' };
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

  // Household Billing Cycle Day (1..31, default 1)
  const initialBillingDay = household.billingDay && household.billingDay >= 1 ? household.billingDay : 1;
  const [billingDay, setBillingDay] = useState<number>(initialBillingDay);
  const [billingDayInput, setBillingDayInput] = useState<number>(initialBillingDay);
  const [billingDayStatus, setBillingDayStatus] = useState<AsyncStatus>('idle');
  const [billingDayMessage, setBillingDayMessage] = useState<string | null>(null);

  // Flow 1: Add Manual Reading
  const todayStr = new Date().toISOString().slice(0, 10);
  const [manualKwh, setManualKwh] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(todayStr);
  const [manualNotes, setManualNotes] = useState<string>('');
  const [isMeterReplacement, setIsMeterReplacement] = useState<boolean>(false);
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

      const resolvedReadings: ManualMeterReading[] = readingsJson.data.readings || [];
      const resolvedMetrics: MeterUsageMetrics | null = readingsJson.data.metrics || null;
      const serverBillingDay =
        typeof readingsJson.data.billingDay === 'number'
          ? readingsJson.data.billingDay
          : resolvedMetrics?.billingDay || initialBillingDay;

      setBillingDay(serverBillingDay);
      setBillingDayInput(serverBillingDay);
      setReadings(resolvedReadings);
      setMetrics(resolvedMetrics);
      if (onMetricsUpdated && resolvedMetrics) {
        onMetricsUpdated(resolvedMetrics);
      }

      const resolvedSms: SavedSmsRecord[] =
        smsRes.ok && smsJson.status === 'success' ? smsJson.data || [] : [];
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
  }, [household.id, initialBillingDay, token, language, onMetricsUpdated]);

  useEffect(() => {
    fetchAllMeterData();
  }, [fetchAllMeterData]);

  // Update household billing cycle day (1..31)
  const handleSaveBillingDay = async () => {
    const parsedDay = Math.floor(Number(billingDayInput));
    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
      setBillingDayStatus('error');
      setBillingDayMessage(
        language === 'bn'
          ? 'বিলিং তারিখ ১ থেকে ৩১-এর মধ্যে হতে হবে।'
          : 'Billing day must be between 1 and 31.'
      );
      return;
    }

    setBillingDayStatus('loading');
    setBillingDayMessage(null);
    try {
      const res = await fetch('/api/v1/meters/billing-day', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ householdId: household.id, billingDay: parsedDay }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Unable to update billing day.');
      }
      setBillingDay(json.data.billingDay);
      setBillingDayInput(json.data.billingDay);
      setReadings(json.data.readings || readings);
      setMetrics(json.data.metrics || metrics);
      if (onMetricsUpdated && json.data.metrics) {
        onMetricsUpdated(json.data.metrics);
      }
      setBillingDayStatus('success');
      setBillingDayMessage(
        language === 'bn'
          ? `বিলিং চক্র মাসের ${formatNumber(json.data.billingDay)} তারিখে নির্ধারিত হয়েছে।`
          : `Billing cycle updated to start on day ${json.data.billingDay}.`
      );
    } catch (err: any) {
      setBillingDayStatus('error');
      setBillingDayMessage(err?.message || 'Failed to update billing day.');
    }
  };

  // Helper: Check client-side monotonic constraint strictly within target meter segment
  const validateAgainstExisting = (
    val: number,
    dateStr: string,
    replacementMode: boolean = false
  ): string | null => {
    if (replacementMode || readings.length === 0) {
      return null;
    }

    let anchorBeforeOrOn: ManualMeterReading | null = null;
    for (const r of readings) {
      if (r.readingDate <= dateStr) {
        anchorBeforeOrOn = r;
      }
    }
    const targetSegment = anchorBeforeOrOn
      ? anchorBeforeOrOn.meterSegment || 1
      : readings[0].meterSegment || 1;
    const segmentReadings = readings.filter((r) => (r.meterSegment || 1) === targetSegment);

    let prev: ManualMeterReading | null = null;
    let next: ManualMeterReading | null = null;
    for (const r of segmentReadings) {
      if (r.readingDate <= dateStr) {
        prev = r;
      } else if (!next) {
        next = r;
      }
    }
    if (prev && val < prev.readingKwh) {
      return language === 'bn'
        ? `রিডিং (${formatNumber(val)} kWh) পূর্ববর্তী রিডিংয়ের (${formatNumber(prev.readingKwh)} kWh, ${prev.readingDate}) চেয়ে কম হতে পারবে না। নতুন মিটার লাগানো হলে "আমি মিটার পরিবর্তন করেছি" টিক দিন।`
        : `Reading (${val} kWh) cannot be lower than the previous reading (${prev.readingKwh} kWh on ${prev.readingDate}). Check "I replaced my meter" if you installed a new meter.`;
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

    const clientCheck = validateAgainstExisting(numericVal, manualDate, isMeterReplacement);
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
          isMeterReplacement,
          notes: manualNotes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not save reading.');
      }

      setReadings(json.data.readings);
      setMetrics(json.data.metrics);
      if (onMetricsUpdated && json.data.metrics) {
        onMetricsUpdated(json.data.metrics);
      }

      setManualKwh('');
      setManualNotes('');
      setIsMeterReplacement(false);
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
      const { base64, mimeType } = await compressImageForUpload(file, language);
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

    const clientCheck = validateAgainstExisting(numericVal, confirmScanDate, false);
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
          tokenLast4: parsedSms.tokenLast4,
          rawText: parsedSms.rawText,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Could not save SMS record.');
      }

      setSmsRecords(json.data.records || []);
      setConfirmSmsSaveStatus('success');
      setConfirmSmsMessage(
        language === 'bn'
          ? 'এসএমএস তথ্য সফলভাবে সংরক্ষণ করা হয়েছে (সম্পূর্ণ টোকেন সংরক্ষণ করা হয়নি)।'
          : 'Confirmed SMS record saved (only last 4 token digits retained).'
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
              : metrics?.cycleStartDate
                ? `${metrics.cycleStartDate} → ${metrics.cycleEndDate}`
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

      {/* Household Billing Cycle Start Day Config Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="font-['Outfit'] font-semibold text-slate-900 dark:text-slate-100">
            {language === 'bn' ? 'বিলিং চক্রের দিন:' : 'Billing Cycle Day:'}
          </span>
          <span className="font-mono tabular-nums text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            {metrics?.cycleStartDate && metrics?.cycleEndDate
              ? `${metrics.cycleStartDate} → ${metrics.cycleEndDate} (${language === 'bn' ? `প্রতি মাসের ${formatNumber(billingDay)} তারিখ` : `Day ${billingDay}`})`
              : language === 'bn'
                ? `প্রতি মাসের ${formatNumber(billingDay)} তারিখ`
                : `Day ${billingDay} of month`}
          </span>
          {billingDayMessage && (
            <span
              className={`text-[11px] ${
                billingDayStatus === 'error'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {billingDayMessage}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label
            htmlFor="household-billing-day-input"
            className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 font-['Outfit']"
          >
            {language === 'bn' ? 'দিন (১–৩১)' : 'Day (1–31)'}
          </label>
          <input
            id="household-billing-day-input"
            type="number"
            min={1}
            max={31}
            value={billingDayInput}
            onChange={(e) => {
              setBillingDayInput(Number(e.target.value));
              if (billingDayStatus !== 'idle') {
                setBillingDayStatus('idle');
                setBillingDayMessage(null);
              }
            }}
            className="w-20 min-h-[44px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="button"
            disabled={billingDayStatus === 'loading'}
            onClick={handleSaveBillingDay}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-400 dark:hover:bg-amber-300 text-white dark:text-slate-950 font-['Outfit'] font-semibold text-xs cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {billingDayStatus === 'loading'
              ? language === 'bn'
                ? 'সংরক্ষণ হচ্ছে...'
                : 'Saving...'
              : language === 'bn'
                ? 'তারিখ সংরক্ষণ'
                : 'Save Day'}
          </button>
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

            {/* Meter Replacement Option */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-start sm:items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isMeterReplacement}
                  onChange={(e) => {
                    setIsMeterReplacement(e.target.checked);
                    if (manualStatus !== 'idle') {
                      setManualStatus('idle');
                      setManualMessage(null);
                    }
                  }}
                  className="mt-0.5 sm:mt-0 w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-['Outfit']">
                  {language === 'bn' ? 'আমি আমার মিটার পরিবর্তন করেছি' : 'I replaced my meter'}
                </span>
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {isMeterReplacement
                  ? language === 'bn'
                    ? 'পুরনো রিডিং রেখে নতুন মিটার সেগমেন্ট শুরু হবে (ঋণাত্মক ব্যবহার হিসাব হবে না)।'
                    : 'Starts a new meter segment while keeping old readings; usage will stay non-negative.'
                  : language === 'bn'
                    ? 'নতুন মিটার লাগালে টিক দিন (রিডিং ০ বা কম থেকে শুরু হলে)।'
                    : 'Check this only if your utility installed a replacement meter.'}
              </span>
            </div>

            {metrics?.latestReading && !isMeterReplacement && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {language === 'bn'
                  ? `সর্বশেষ সংরক্ষিত রিডিং (সেগমেন্ট #${formatNumber(metrics.activeSegment)}): ${formatNumber(metrics.latestReading.readingKwh)} kWh (${metrics.latestReading.readingDate}) — নতুন রিডিং এর কম হতে পারবে না।`
                  : `Previous reading (Segment #${metrics.activeSegment}): ${metrics.latestReading.readingKwh} kWh on ${metrics.latestReading.readingDate} — new readings cannot be lower.`}
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

                {(parsedSms.unitsKwh !== null || parsedSms.tokenMasked || parsedSms.tokenLast4) && (
                  <div className="rounded-xl bg-white/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="flex flex-wrap gap-4">
                      {parsedSms.unitsKwh !== null && (
                        <span>
                          {language === 'bn' ? 'ইউনিট:' : 'Units:'} {formatNumber(parsedSms.unitsKwh)} kWh
                        </span>
                      )}
                      {(parsedSms.tokenMasked || parsedSms.tokenLast4) && (
                        <span>
                          {language === 'bn' ? 'মাস্কড টোকেন:' : 'Token (masked):'}{' '}
                          {parsedSms.tokenMasked || `****-****-****-****-${parsedSms.tokenLast4}`}
                        </span>
                      )}
                    </div>
                    {(parsedSms.tokenMasked || parsedSms.tokenLast4) && (
                      <p className="text-[11px] font-['Plus_Jakarta_Sans'] text-slate-500 dark:text-slate-400">
                        {language === 'bn'
                          ? 'নিরাপত্তা নীতি: আপনার প্রিপেইড STS টোকেনের কেবল শেষ ৪টি অঙ্ক সংরক্ষণ করা হবে; সম্পূর্ণ টোকেন সংরক্ষণ করা হয় না।'
                          : 'Privacy notice: Only the last 4 digits of your STS token are stored. The full 20-digit token is masked and never saved.'}
                      </p>
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
                  const sameSegment =
                    prevChron && (prevChron.meterSegment || 1) === (r.meterSegment || 1);
                  const delta = sameSegment
                    ? Number((r.readingKwh - prevChron.readingKwh).toFixed(2))
                    : null;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {r.readingDate}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold font-['Outfit'] text-slate-700 dark:text-slate-300">
                            {r.source === 'METER_SCAN'
                              ? language === 'bn'
                                ? 'ছবি স্ক্যান'
                                : 'Meter Scan'
                              : language === 'bn'
                                ? 'ম্যানুয়াল'
                                : 'Manual'}
                          </span>
                          {(r.meterSegment || 1) > 1 && (
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-400/20 text-[10px] font-mono font-semibold text-amber-800 dark:text-amber-200">
                              {r.isMeterReplacement
                                ? language === 'bn'
                                  ? `নতুন মিটার #${formatNumber(r.meterSegment)}`
                                  : `New meter #${r.meterSegment}`
                                : language === 'bn'
                                  ? `সেগমেন্ট #${formatNumber(r.meterSegment)}`
                                  : `Seg #${r.meterSegment}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(r.readingKwh.toFixed(2))}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {r.isMeterReplacement
                          ? language === 'bn'
                            ? 'নতুন মিটার'
                            : 'New meter'
                          : delta !== null
                            ? `+${formatNumber(delta.toFixed(2))}`
                            : '—'}
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
                      <div>
                        {s.utility || household.utilityProvider} • {s.smsType}
                      </div>
                      {(s.tokenMasked || s.tokenLast4) && (
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {language === 'bn' ? 'টোকেন:' : 'Token:'}{' '}
                          {s.tokenMasked || `****-****-****-****-${s.tokenLast4}`}
                        </div>
                      )}
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
