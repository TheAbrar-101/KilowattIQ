/**
 * AlertsTab Component
 * 
 * Purpose:
 * Unified Energy Alerts & Notification Management interface for KilowattIQ.
 * Provides intuitive rule toggles, multi-channel notification routing (Email, SMS,
 * WhatsApp, Web Push), a peaceful Quiet Hours scheduler, instant channel testing,
 * and an actionable recent alerts feed with calm amber warnings and dismiss controls.
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  Moon,
  Clock,
  Mail,
  MessageSquare,
  Smartphone,
  Radio,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  ShieldCheck,
  Zap,
  Sliders,
  Check,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Household } from '../../../shared/types/household';
import { useAuth } from '../../context/AuthContext';
import {
  AlertRecord,
  AlertRuleType,
  NotificationChannel,
  UserAlertPreferences,
} from '../../server/alerts/types';

interface AlertsTabProps {
  household: Household;
}

interface AlertRuleMeta {
  key: AlertRuleType;
  title: string;
  titleBn: string;
  desc: string;
  badge: string;
}

const ALERT_RULES: AlertRuleMeta[] = [
  {
    key: 'SLAB_BREACH_IMMINENT',
    title: 'Slab Tier Transition Buffer (Within 5%)',
    titleBn: 'বিইআরসি পরবর্তী স্ল্যাবে পৌঁছানোর আগাম সতর্কতা (৫% বাকি)',
    desc: 'Notifies when cumulative energy reaches within 5% of your current BERC slab ceiling before the next tier rate takes effect.',
    badge: 'BERC TARIFF',
  },
  {
    key: 'BUDGET_CONSUMED_80',
    title: 'Monthly Budget 80% Consumed',
    titleBn: 'মাসিক নির্ধারিত বাজেটের ৮০% খরচ সম্পন্ন',
    desc: 'Issues a gentle notification when estimated monthly power spend touches 80% of your target budget.',
    badge: 'BUDGET PACE',
  },
  {
    key: 'PROJECTED_OVERAGE_10',
    title: 'Projected Month-End Overage (>10%)',
    titleBn: 'মাস শেষে বাজেট ১০% এর বেশি অতিক্রান্ত হওয়ার পূর্বাভাস',
    desc: 'Predictive alert triggered if real-time daily burn rates forecast total bill exceeding your monthly budget by over 10%.',
    badge: 'PREDICTIVE',
  },
  {
    key: 'VAMPIRE_LOAD_HIGH',
    title: 'Standby Vampire Waste (>15% of Daily Total)',
    titleBn: 'স্ট্যান্ডবাই বিদ্যুৎ অপচয় দৈনিক ব্যবহারের ১৫% এর বেশি',
    desc: 'Detects continuous background power draw from idle appliances exceeding 15% of household daily consumption.',
    badge: 'EFFICIENCY',
  },
  {
    key: 'VOLTAGE_ANOMALY',
    title: 'Grid Voltage Fluctuation (>2 min Outside 195V–245V)',
    titleBn: 'গ্রিড ভোল্টেজ নিরাপদ সীমার (১৯৫V–২৪৫V) বাইরে ২ মিনিটের বেশি',
    desc: 'Monitors RMS grid voltage and alerts if power sags or surges beyond the standard DESCO/DPDC tolerance.',
    badge: 'GRID HEALTH',
  },
  {
    key: 'DEVICE_OFFLINE',
    title: 'Smart IoT Adapter Signal Idle (>30 min)',
    titleBn: 'স্মার্ট মিটার বা প্লাগ অ্যাডাপ্টার ৩০ মিনিট ধরে ডেটাহীন',
    desc: 'Alerts if an energy monitoring plug or PZEM distribution sensor stops transmitting telemetry packets.',
    badge: 'CONNECTIVITY',
  },
];

export const AlertsTab: React.FC<AlertsTabProps> = ({ household }) => {
  const { token } = useAuth();

  const [preferences, setPreferences] = useState<UserAlertPreferences | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Auth Header
  const headers = {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };

  useEffect(() => {
    fetchAlertsData();
  }, [household.id]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const fetchAlertsData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch preferences
      const prefRes = await fetch(`/api/v1/alerts/preferences?householdId=${household.id}`, { headers });
      const prefJson = await prefRes.json();
      if (prefJson.status === 'success') {
        setPreferences(prefJson.data);
      }

      // 2. Fetch alerts feed
      const alertRes = await fetch(`/api/v1/alerts?householdId=${household.id}`, { headers });
      const alertJson = await alertRes.json();
      if (alertJson.status === 'success') {
        setAlerts(alertJson.data.alerts);
      }
    } catch (err) {
      console.error('Error loading alerts:', err);
      showToast('Could not sync alert preferences.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle individual rule
  const handleToggleRule = async (ruleKey: AlertRuleType) => {
    if (!preferences) return;

    const newRules = {
      ...preferences.enabledRules,
      [ruleKey]: !preferences.enabledRules[ruleKey],
    };

    const updated = {
      ...preferences,
      enabledRules: newRules,
    };
    setPreferences(updated);

    await savePreferences(updated, `Rule "${ruleKey}" preference updated.`);
  };

  // Toggle notification channel
  const handleToggleChannel = async (channelKey: NotificationChannel) => {
    if (!preferences) return;

    const newChannels = {
      ...preferences.enabledChannels,
      [channelKey]: !preferences.enabledChannels[channelKey],
    };

    const updated = {
      ...preferences,
      enabledChannels: newChannels,
    };
    setPreferences(updated);

    await savePreferences(updated, `Notification channel "${channelKey}" updated.`);
  };

  // Update quiet hours
  const handleQuietHoursChange = async (updates: Partial<UserAlertPreferences['quietHours']>) => {
    if (!preferences) return;

    const updated = {
      ...preferences,
      quietHours: {
        ...preferences.quietHours,
        ...updates,
      },
    };
    setPreferences(updated);

    await savePreferences(updated, 'Quiet hours settings saved.');
  };

  // Save preferences to backend
  const savePreferences = async (updatedPrefs: UserAlertPreferences, successText: string) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/v1/alerts/preferences', {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedPrefs),
      });
      const json = await res.json();
      if (json.status === 'success') {
        showToast(successText, 'success');
      }
    } catch (err) {
      console.error('Error updating preferences:', err);
      showToast('Error saving changes to server.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger immediate Rule Evaluation
  const handleRunEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/v1/alerts/evaluate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ householdId: household.id }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        showToast('Alert engine evaluation complete. Active rules checked.', 'info');
        // Refresh feed
        const alertRes = await fetch(`/api/v1/alerts?householdId=${household.id}`, { headers });
        const alertJson = await alertRes.json();
        if (alertJson.status === 'success') {
          setAlerts(alertJson.data.alerts);
        }
      }
    } catch (err) {
      console.error('Error evaluating alerts:', err);
      showToast('Error evaluating alert rules.', 'error');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Trigger Send Test Alert
  const handleSendTestAlert = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/v1/alerts/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({ householdId: household.id }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        showToast('Test notification dispatched through active channels.', 'success');
        // Insert test alert into top of local feed
        if (json.data?.alert) {
          setAlerts(prev => [json.data.alert, ...prev]);
        }
      }
    } catch (err) {
      console.error('Error sending test alert:', err);
      showToast('Error delivering test alert.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // Acknowledge alert
  const handleAcknowledge = async (alertId: string) => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers,
      });
      const json = await res.json();
      if (json.status === 'success') {
        setAlerts(prev =>
          prev.map(a => (a.id === alertId ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() } : a))
        );
        showToast('Alert marked as acknowledged.', 'info');
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  };

  // Dismiss alert
  const handleDismiss = async (alertId: string) => {
    try {
      const res = await fetch(`/api/v1/alerts/${alertId}/dismiss`, {
        method: 'PUT',
        headers,
      });
      const json = await res.json();
      if (json.status === 'success') {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        showToast('Alert dismissed.', 'info');
      }
    } catch (err) {
      console.error('Error dismissing alert:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-amber-500 dark:text-amber-400 animate-spin mx-auto" />
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-display">Loading Energy Alert Subsystem...</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          Verifying BERC LT-A thresholds, channel gateways & scheduled quiet hours
        </p>
      </div>
    );
  }

  const activeAlertsCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs font-bold font-display ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700/80'
                : toastMessage.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/90 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-700/80'
                : 'bg-amber-50 dark:bg-amber-950/90 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700/80'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />}
            {toastMessage.type === 'error' && <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />}
            {toastMessage.type === 'info' && <BellRing className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Calm Header */}
      <div className="bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                <Bell className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                <span>Unified Alerts & Notification Engine</span>
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800/80 font-mono">
                CALM AMBER PROTOCOL
              </span>
              {activeAlertsCount > 0 ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40 font-mono">
                  {activeAlertsCount} ACTIVE
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-mono">
                  ALL CALM
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
              Non-alarming energy intelligence warnings for slab jumps, overage pacing, and vampire leaks.
              Designed with quiet hours so your rest is never disturbed.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRunEvaluation}
              disabled={isEvaluating}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold font-display px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-500 dark:text-amber-400 ${isEvaluating ? 'animate-spin' : ''}`} />
              <span>{isEvaluating ? 'Evaluating...' : 'Evaluate Rules'}</span>
            </button>

            <button
              onClick={handleSendTestAlert}
              disabled={isTesting}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black font-display px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Send Test Alert</span>
            </button>
          </div>
        </div>

        {/* Quiet Hours Summary Card */}
        {preferences && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 rounded-lg text-indigo-600 dark:text-indigo-300 shrink-0">
                <Moon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              </div>
              <div className="space-y-0.5">
                <p className="font-bold text-slate-900 dark:text-white font-display flex items-center gap-1.5">
                  <span>Nighttime Quiet Hours</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${preferences.quietHours.enabled ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                    {preferences.quietHours.enabled ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                  {preferences.quietHours.enabled
                    ? `Silences non-critical chimes between ${preferences.quietHours.startTime} and ${preferences.quietHours.endTime} (${preferences.quietHours.timezone}).`
                    : 'Alert notifications will be sent at all hours.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
              <span className="text-slate-500 font-sans">Window:</span>
              <span className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-amber-700 dark:text-amber-300 font-bold">
                {preferences.quietHours.startTime} – {preferences.quietHours.endTime}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Rules & Channel Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): 6 Rules Toggle List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                <Sliders className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                <span>Deterministic Alert Rules (Evaluated Every 5 Minutes)</span>
              </h4>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono">
                6 RULES CONFIGURED
              </span>
            </div>

            {/* Toggle List (Large tap targets, min 48px, high contrast) */}
            <div className="space-y-3">
              {preferences &&
                ALERT_RULES.map(rule => {
                  const isEnabled = preferences.enabledRules[rule.key];
                  return (
                    <div
                      key={rule.key}
                      onClick={() => handleToggleRule(rule.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToggleRule(rule.key);
                        }
                      }}
                      className={`min-h-[58px] p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 select-none ${
                        isEnabled
                          ? 'bg-slate-50 dark:bg-slate-950/80 border-slate-300 dark:border-slate-700/90 hover:border-amber-500/50'
                          : 'bg-slate-50/40 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/50 opacity-60 hover:opacity-80'
                      }`}
                    >
                      <div className="space-y-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 dark:text-white font-display">
                            {rule.title}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono border border-slate-300 dark:border-slate-700">
                            {rule.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-700 dark:text-amber-300/90 font-sans leading-normal font-medium">
                          {rule.titleBn}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans leading-relaxed">
                          {rule.desc}
                        </p>
                      </div>

                      {/* Large Switch Target */}
                      <div className="shrink-0 pt-0.5">
                        <div
                          className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                            isEnabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-800'
                          }`}
                        >
                          <motion.div
                            animate={{ x: isEnabled ? 24 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            className="w-5 h-5 bg-white dark:bg-slate-950 rounded-full shadow-md flex items-center justify-center"
                          >
                            {isEnabled ? (
                              <Check className="w-3 h-3 text-amber-500 dark:text-amber-400 stroke-[3]" />
                            ) : (
                              <EyeOff className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
                            )}
                          </motion.div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Notification Channels & Quiet Hours Picker */}
        <div className="space-y-6">
          {/* Notification Channels */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                <Radio className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                <span>Delivery Channels</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Choose how you want notifications delivered.
              </p>
            </div>

            {preferences && (
              <div className="space-y-2.5 text-xs">
                {/* Email (Resend) */}
                <div
                  onClick={() => handleToggleChannel('EMAIL')}
                  role="button"
                  tabIndex={0}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    preferences.enabledChannels.EMAIL
                      ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    <div>
                      <p className="font-bold font-display">Email (Resend)</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {preferences.contacts.email || 'Configured in account'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${preferences.enabledChannels.EMAIL ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    {preferences.enabledChannels.EMAIL ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* SMS (Local BD Gateway) */}
                <div
                  onClick={() => handleToggleChannel('SMS')}
                  role="button"
                  tabIndex={0}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    preferences.enabledChannels.SMS
                      ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                    <div>
                      <p className="font-bold font-display">SMS (BD Gateway)</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        {preferences.contacts.phone || '+880 Mobile'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${preferences.enabledChannels.SMS ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    {preferences.enabledChannels.SMS ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* WhatsApp (Twilio) */}
                <div
                  onClick={() => handleToggleChannel('WHATSAPP')}
                  role="button"
                  tabIndex={0}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    preferences.enabledChannels.WHATSAPP
                      ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <MessageSquare className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                    <div>
                      <p className="font-bold font-display">WhatsApp (Twilio)</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Verified Business</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${preferences.enabledChannels.WHATSAPP ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    {preferences.enabledChannels.WHATSAPP ? 'ON' : 'OFF'}
                  </span>
                </div>

                {/* Web Push (VAPID) */}
                <div
                  onClick={() => handleToggleChannel('WEB_PUSH')}
                  role="button"
                  tabIndex={0}
                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    preferences.enabledChannels.WEB_PUSH
                      ? 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                      : 'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-400 dark:text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <BellRing className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                    <div>
                      <p className="font-bold font-display">Web Push (VAPID)</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Instant Browser Banners</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${preferences.enabledChannels.WEB_PUSH ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                    {preferences.enabledChannels.WEB_PUSH ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quiet Hours Picker */}
          {preferences && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
                  <Moon className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                  <span>Quiet Hours Schedule</span>
                </h4>
                <input
                  type="checkbox"
                  aria-label="Enable Quiet Hours"
                  checked={preferences.quietHours.enabled}
                  onChange={e => handleQuietHoursChange({ enabled: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed font-sans text-[11px]">
                  Silence non-critical notifications during sleep. Essential safety alerts will still record in your dashboard feed.
                </p>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 font-display mb-1 uppercase tracking-wider">
                      Sleep Time (Start)
                    </label>
                    <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                      <input
                        type="time"
                        value={preferences.quietHours.startTime}
                        disabled={!preferences.quietHours.enabled}
                        onChange={e => handleQuietHoursChange({ startTime: e.target.value })}
                        className="bg-transparent text-slate-800 dark:text-white font-mono text-xs focus:outline-none w-full disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 font-display mb-1 uppercase tracking-wider">
                      Wake Time (End)
                    </label>
                    <div className="flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
                      <input
                        type="time"
                        value={preferences.quietHours.endTime}
                        disabled={!preferences.quietHours.enabled}
                        onChange={e => handleQuietHoursChange({ endTime: e.target.value })}
                        className="bg-transparent text-slate-800 dark:text-white font-mono text-xs focus:outline-none w-full disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between font-mono">
                  <span>Timezone</span>
                  <span className="text-slate-700 dark:text-slate-300 font-bold">{preferences.quietHours.timezone}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Alerts Feed Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs dark:shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-display">
              <BellRing className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Recent Energy Alerts & Advisory Feed</span>
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
              Acknowledge alerts once reviewed, or dismiss them from your active console.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono self-start sm:self-auto">
            {alerts.length} Records in Feed
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800/60 rounded-xl space-y-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500 dark:text-emerald-400 mx-auto" />
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-display">
              All Systems Calm & Nominal
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans max-w-md mx-auto">
              Your household is operating within safe voltage windows, balanced tariff buffers, and normal budget bounds.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map(item => {
              const formattedTime = new Date(item.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all ${
                    item.acknowledged
                      ? 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/60 text-slate-500 dark:text-slate-400'
                      : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-600/40 text-slate-800 dark:text-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 max-w-3xl">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider ${
                            item.severity === 'CRITICAL'
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : item.severity === 'WARNING'
                              ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60'
                              : 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-400 border border-sky-300 dark:border-sky-800/60'
                          }`}
                        >
                          {item.severity}
                        </span>

                        <h5 className="text-xs font-bold text-slate-900 dark:text-white font-display">
                          {item.title}
                        </h5>

                        {item.acknowledged && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            ACKNOWLEDGED
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-amber-800 dark:text-amber-200/90 font-sans font-medium">
                        {item.titleBn}
                      </p>

                      <p className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-relaxed">
                        {item.message}
                      </p>

                      <p className="text-xs text-slate-500 dark:text-slate-400 font-sans leading-relaxed">
                        {item.messageBn}
                      </p>

                      <div className="flex items-center gap-3 pt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        <span>Recorded: {formattedTime}</span>
                        {item.channelsSent && item.channelsSent.length > 0 && (
                          <span>Dispatched via: {item.channelsSent.join(', ')}</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 self-end sm:self-auto">
                      {!item.acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(item.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold font-display rounded-lg border border-slate-300 dark:border-slate-700 transition-all cursor-pointer active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                          <span>Acknowledge</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDismiss(item.id)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-bold font-display rounded-lg border border-slate-200 dark:border-slate-800 transition-all cursor-pointer active:scale-95"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertsTab;
