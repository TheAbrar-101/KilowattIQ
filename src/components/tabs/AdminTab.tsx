import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  Plus,
  Edit3,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import { TariffVersion, SlabTier } from '../../../shared/types/energy';
import {
  getTariffVersions,
  setTariffVersions,
  DEFAULT_TARIFF_FIXED_CHARGES,
} from '../../../shared/constants/bdTariffs';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

interface AdminTabProps {
  households: Household[];
}

export const AdminTab: React.FC<AdminTabProps> = ({ households }) => {
  const { token } = useAuth();
  const { language, formatNumber } = useLanguage();

  const [versions, setVersions] = useState<TariffVersion[]>(() => getTariffVersions());
  const [usingFallback, setUsingFallback] = useState<boolean>(false);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [editingVersion, setEditingVersion] = useState<TariffVersion | null>(null);
  const [isNewVersion, setIsNewVersion] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadTariffVersions = async () => {
    setFetchStatus('loading');
    setFetchError(null);
    try {
      const res = await fetch('/api/v1/tariffs/versions', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Unable to load tariff versions.');
      }
      if (Array.isArray(json.data?.versions)) {
        setTariffVersions(json.data.versions);
        setVersions(json.data.versions);
      }
      setUsingFallback(Boolean(json.data?.usingFallback));
      setFetchStatus('success');
    } catch (err: any) {
      setUsingFallback(true);
      setFetchStatus('error');
      setFetchError(err?.message || 'Could not reach the tariff service.');
    }
  };

  useEffect(() => {
    loadTariffVersions();
  }, [token]);

  const handleStartAdd = () => {
    const latest = versions[versions.length - 1] || getTariffVersions()[0];
    const today = new Date().toISOString().slice(0, 10);
    setIsNewVersion(true);
    setSaveStatus('idle');
    setSaveMessage(null);
    setEditingVersion({
      version_id: `BERC-LTA-${today.slice(0, 7)}`,
      effective_from: today,
      source_note: 'BERC LT-A Residential Tariff Revision',
      last_verified_date: null,
      demandChargePerKw: latest?.demandChargePerKw ?? DEFAULT_TARIFF_FIXED_CHARGES.demandChargePerKw,
      meterRent: latest?.meterRent ?? DEFAULT_TARIFF_FIXED_CHARGES.meterRent,
      vatPercent: latest?.vatPercent ?? DEFAULT_TARIFF_FIXED_CHARGES.vatPercent,
      charges_verified: false,
      slabs: latest ? latest.slabs.map(s => ({ ...s })) : [],
    });
  };

  const handleStartEdit = (ver: TariffVersion) => {
    setIsNewVersion(false);
    setSaveStatus('idle');
    setSaveMessage(null);
    setEditingVersion({
      ...ver,
      slabs: ver.slabs.map(s => ({ ...s })),
    });
  };

  const handleSlabChange = (index: number, field: keyof SlabTier, rawValue: string | boolean) => {
    if (!editingVersion) return;
    const nextSlabs = editingVersion.slabs.map((s, idx) => {
      if (idx !== index) return s;
      if (field === 'ratePerKwh' || field === 'minKwh') {
        return { ...s, [field]: Number(rawValue) || 0 };
      }
      if (field === 'maxKwh') {
        return { ...s, maxKwh: rawValue === '' ? null : Number(rawValue) };
      }
      if (field === 'isLifeline') {
        return { ...s, isLifeline: Boolean(rawValue) };
      }
      return { ...s, [field]: String(rawValue) };
    });
    setEditingVersion({ ...editingVersion, slabs: nextSlabs });
  };

  const handleSaveVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVersion) return;
    setSaveStatus('loading');
    setSaveMessage(null);

    try {
      const endpoint = isNewVersion
        ? '/api/v1/tariffs/versions'
        : `/api/v1/tariffs/versions/${encodeURIComponent(editingVersion.version_id)}`;
      const method = isNewVersion ? 'POST' : 'PUT';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(editingVersion),
      });

      const json = await res.json();
      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'Failed to save tariff version.');
      }

      if (Array.isArray(json.data?.versions)) {
        setTariffVersions(json.data.versions);
        setVersions(json.data.versions);
      }
      setSaveStatus('success');
      setSaveMessage(
        language === 'bn'
          ? `ট্যারিফ সংস্করণ ${editingVersion.version_id} সংরক্ষিত হয়েছে।`
          : `Saved tariff version ${editingVersion.version_id} (effective ${editingVersion.effective_from}).`
      );
      setEditingVersion(null);
    } catch (err: any) {
      setSaveStatus('error');
      setSaveMessage(err?.message || 'Unable to save tariff version.');
    }
  };

  return (
    <div className="space-y-4">
      {/* System Admin Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 font-['Outfit']">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>
                {language === 'bn'
                  ? 'সিস্টেম অ্যাডমিনিস্ট্রেশন ও আইওটি অপারেশন'
                  : 'System Administration & IoT Operations'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-300 font-['Plus_Jakarta_Sans']">
              Multi-household isolation, versioned BERC LT-A tariff governance, and global adapter oversight
            </p>
          </div>
          <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            OPERATIONAL
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">DATABASE BACKEND</span>
            <span className="font-bold text-emerald-400 font-mono text-[11px]">Supabase PostgreSQL</span>
            <p className="text-[10px] text-slate-400">Row-Level Security (RLS)</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">AUTHENTICATION</span>
            <span className="font-bold text-slate-200 font-mono text-[11px]">Supabase Auth / JWT</span>
            <p className="text-[10px] text-slate-400">Per-household data isolation</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">ACTIVE IOT ADAPTERS</span>
            <span className="font-bold text-amber-400 font-mono text-[11px]">5 Adapters Active</span>
            <p className="text-[10px] text-slate-400">Mock, Tuya, MQTT, DESCO, Composite</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">NATIONAL GRID</span>
            <span className="font-bold text-slate-200 font-mono text-[11px]">50.0 Hz Frequency</span>
            <p className="text-[10px] text-slate-400">Nominal 220V - 230V AC</p>
          </div>
        </div>
      </div>

      {/* BERC Tariff Version Manager */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider font-['Outfit']">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {language === 'bn'
                  ? 'বিইআরসি (BERC) এলটি-এ ট্যারিফ সংস্করণ ব্যবস্থাপনা'
                  : 'BERC LT-A Versioned Tariff Registry'}
              </span>
            </h4>
            <p className="text-[11px] text-slate-300 font-['Plus_Jakarta_Sans']">
              {language === 'bn'
                ? 'বিলিং সময়কাল অনুযায়ী কার্যকর স্ল্যাব রেট যোগ বা সম্পাদনা করুন।'
                : 'Add or edit effective-dated residential tariff versions. Calculations match effective_from by billing period.'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartAdd}
            aria-label="Add new tariff version"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-300"
          >
            <Plus className="w-4 h-4" />
            <span>{language === 'bn' ? 'নতুন ট্যারিফ সংস্করণ যোগ করুন' : 'Add Tariff Version'}</span>
          </button>
        </div>

        {usingFallback && (
          <div
            role="status"
            className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-200 font-['Plus_Jakarta_Sans']"
          >
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {language === 'bn'
                ? 'Using built-in tariff data — ডাটাবেস সংযোগ না থাকায় পঠনযোগ্য বিল্ট-ইন ট্যারিফ ডেটা ব্যবহৃত হচ্ছে।'
                : 'Using built-in tariff data — database unavailable (read-only fallback mode).'}
            </span>
          </div>
        )}

        {fetchStatus === 'error' && (
          <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200">
            <span className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{fetchError || 'Unable to sync tariff registry.'}</span>
            </span>
            <button
              type="button"
              onClick={loadTariffVersions}
              aria-label="Try loading tariff versions again"
              className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-['Outfit'] font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}</span>
            </button>
          </div>
        )}

        {saveStatus === 'success' && saveMessage && (
          <div className="bg-emerald-950/60 border border-emerald-700/60 rounded-xl p-3 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {saveStatus === 'error' && saveMessage && (
          <div className="bg-amber-950/60 border border-amber-500/50 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-slate-300 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Version ID</th>
                <th className="py-2.5 px-3">Effective From</th>
                <th className="py-2.5 px-3">Last Verified</th>
                <th className="py-2.5 px-3 text-right">Demand (৳/kW)</th>
                <th className="py-2.5 px-3 text-right">Meter Rent</th>
                <th className="py-2.5 px-3 text-right">VAT</th>
                <th className="py-2.5 px-3 text-center">Charges Status</th>
                <th className="py-2.5 px-3 text-right">Slabs</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200 text-[11px]">
              {versions.map((ver) => (
                <tr key={ver.version_id} className="hover:bg-slate-900/60">
                  <td className="py-2.5 px-3 font-mono font-bold text-amber-400">{ver.version_id}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">{ver.effective_from}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-300">
                    {ver.last_verified_date ? (
                      ver.last_verified_date
                    ) : (
                      <span className="text-amber-400 font-semibold">Not verified</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">৳{(ver.demandChargePerKw ?? 42).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">৳{(ver.meterRent ?? 40).toFixed(2)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ver.vatPercent ?? 5}%</td>
                  <td className="py-2.5 px-3 text-center">
                    {ver.charges_verified ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-mono font-bold uppercase">
                        Verified
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded bg-amber-950/70 text-amber-400 border border-amber-500/40 text-[10px] font-mono font-bold uppercase">
                        unverified
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatNumber(ver.slabs.length)}</td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(ver)}
                      aria-label={`Edit tariff version ${ver.version_id}`}
                      className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-['Outfit'] font-semibold text-xs transition-all cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                      <span>{language === 'bn' ? 'সম্পাদনা' : 'Edit'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Inline Editor Form for Adding/Editing a Tariff Version */}
        {editingVersion && (
          <form onSubmit={handleSaveVersion} className="bg-slate-950 border border-amber-500/40 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider font-['Outfit']">
                {isNewVersion
                  ? (language === 'bn' ? 'নতুন ট্যারিফ সংস্করণ তৈরি করুন' : 'Create New Tariff Version')
                  : `${language === 'bn' ? 'সংস্করণ সম্পাদনা:' : 'Editing Version:'} ${editingVersion.version_id}`}
              </h5>
              <button
                type="button"
                onClick={() => setEditingVersion(null)}
                aria-label="Close tariff editor"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Version ID</label>
                <input
                  type="text"
                  required
                  disabled={!isNewVersion}
                  value={editingVersion.version_id}
                  onChange={(e) => setEditingVersion({ ...editingVersion, version_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs disabled:opacity-60 focus:border-amber-400 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Effective From</label>
                <input
                  type="date"
                  required
                  value={editingVersion.effective_from}
                  onChange={(e) => setEditingVersion({ ...editingVersion, effective_from: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-amber-400 focus:outline-hidden"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">Last Verified Date</label>
                  {editingVersion.last_verified_date && (
                    <button
                      type="button"
                      onClick={() => setEditingVersion({ ...editingVersion, last_verified_date: null })}
                      className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                    >
                      Mark Not verified
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={editingVersion.last_verified_date || ''}
                  onChange={(e) =>
                    setEditingVersion({
                      ...editingVersion,
                      last_verified_date: e.target.value ? e.target.value : null,
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-amber-400 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Source Note</label>
                <input
                  type="text"
                  required
                  value={editingVersion.source_note}
                  onChange={(e) => setEditingVersion({ ...editingVersion, source_note: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:border-amber-400 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Demand (৳/kW) {!editingVersion.charges_verified && <span className="text-amber-400">• unverified</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editingVersion.demandChargePerKw ?? 42}
                  onChange={(e) => setEditingVersion({ ...editingVersion, demandChargePerKw: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tabular-nums text-xs focus:border-amber-400 focus:outline-hidden"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Meter Rent</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingVersion.meterRent ?? 40}
                    onChange={(e) => setEditingVersion({ ...editingVersion, meterRent: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tabular-nums text-xs focus:border-amber-400 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">VAT %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingVersion.vatPercent ?? 5}
                    onChange={(e) => setEditingVersion({ ...editingVersion, vatPercent: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono tabular-nums text-xs focus:border-amber-400 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(editingVersion.charges_verified)}
                onChange={(e) => setEditingVersion({ ...editingVersion, charges_verified: e.target.checked })}
                className="accent-amber-400 cursor-pointer"
              />
              <span>
                {language === 'bn'
                  ? 'ডিমান্ড চার্জ, মিটার ভাড়া ও ভ্যাট যাচাইকৃত হিসেবে চিহ্নিত করুন'
                  : 'Mark demand charge, meter rent, and VAT as verified'}
              </span>
            </label>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase">
                  <tr>
                    <th className="py-2 px-3">Step Name</th>
                    <th className="py-2 px-3 text-right">Min kWh</th>
                    <th className="py-2 px-3 text-right">Max kWh</th>
                    <th className="py-2 px-3 text-right">Rate (BDT/kWh)</th>
                    <th className="py-2 px-3 text-center">Lifeline Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {editingVersion.slabs.map((slab, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={slab.stepName}
                          onChange={(e) => handleSlabChange(idx, 'stepName', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={slab.minKwh}
                          onChange={(e) => handleSlabChange(idx, 'minKwh', e.target.value)}
                          className="w-20 ml-auto block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono tabular-nums text-xs"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          placeholder="∞"
                          value={slab.maxKwh ?? ''}
                          onChange={(e) => handleSlabChange(idx, 'maxKwh', e.target.value)}
                          className="w-20 ml-auto block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono tabular-nums text-xs"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          step="0.01"
                          value={slab.ratePerKwh}
                          onChange={(e) => handleSlabChange(idx, 'ratePerKwh', e.target.value)}
                          className="w-24 ml-auto block bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-right text-amber-400 font-bold font-mono tabular-nums text-xs"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Is lifeline slab for ${slab.stepName}`}
                          checked={Boolean(slab.isLifeline)}
                          onChange={(e) => handleSlabChange(idx, 'isLifeline', e.target.checked)}
                          className="accent-amber-400 cursor-pointer"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingVersion(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-['Outfit'] font-semibold text-xs cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={saveStatus === 'loading'}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-['Outfit'] font-semibold text-xs flex items-center gap-1.5 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-300"
              >
                <Save className="w-4 h-4" />
                <span>
                  {saveStatus === 'loading'
                    ? (language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving...')
                    : (language === 'bn' ? 'সংরক্ষণ করুন' : 'Save Tariff Version')}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Household Isolation Oversight Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider font-['Outfit']">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Managed Households Data Isolation Table</span>
        </h4>

        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-2 px-3">Household ID</th>
                <th className="py-2 px-3">Name / Area</th>
                <th className="py-2 px-3">Utility Provider</th>
                <th className="py-2 px-3 text-right">Load Cap</th>
                <th className="py-2 px-3 text-center">Isolation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-mono text-[11px]">
              {households.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 px-3 text-amber-400 font-bold">{h.id}</td>
                  <td className="py-2 px-3 font-sans text-slate-200">{h.name} ({h.address.area})</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">{h.utilityProvider}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-200">{h.sanctionedLoadKw} kW</td>
                  <td className="py-2 px-3 text-center">
                    <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                      ENFORCED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
