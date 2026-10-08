/**
 * Alert History & Event Feed Store
 * 
 * Purpose:
 * Stores, queries, acknowledges, and dismisses active and historic alerts.
 * Keeps an in-memory audit trail of recent alerts for quick retrieval and UI feeds.
 */

import { AlertRecord, AlertRuleType, AlertSeverity, NotificationChannel } from './types';

export class AlertHistoryStore {
  private static instance: AlertHistoryStore;
  private alerts: AlertRecord[] = [];

  private constructor() {
    this.seedRecentAlerts();
  }

  static getInstance(): AlertHistoryStore {
    if (!AlertHistoryStore.instance) {
      AlertHistoryStore.instance = new AlertHistoryStore();
    }
    return AlertHistoryStore.instance;
  }

  private seedRecentAlerts(): void {
    const hhId = '11111111-1111-4111-a111-111111111111';
    const now = Date.now();

    this.alerts = [
      {
        id: 'alt_slab_01',
        householdId: hhId,
        ruleType: 'SLAB_BREACH_IMMINENT',
        severity: 'WARNING',
        title: 'Slab Step 3 Transition Impending (285 kWh / 300 kWh)',
        titleBn: '৩য় স্ল্যাব সমাপ্তির পথে (২৮৫ kWh / ৩০০ kWh)',
        message: 'Your home is at 285 kWh (95% of Step 3). Remaining buffer is 15 kWh before moving to Step 4 rate (৳8.69/kWh).',
        messageBn: 'আপনার বাসার ব্যবহার ২৮৫ ইউনিট। পরবর্তী ৪র্থ স্ল্যাবে পৌঁছাতে আর মাত্র ১৫ ইউনিট বাকি রয়েছে।',
        timestamp: new Date(now - 1000 * 60 * 35).toISOString(),
        acknowledged: false,
        dismissed: false,
        channelsSent: ['EMAIL', 'WEB_PUSH'],
        metadata: { currentKwh: 285, slabCeiling: 300, remainingBuffer: 15 },
      },
      {
        id: 'alt_vampire_01',
        householdId: hhId,
        ruleType: 'VAMPIRE_LOAD_HIGH',
        severity: 'WARNING',
        title: 'Elevated Vampire Standby Loss Detected',
        titleBn: 'স্ট্যান্ডবাই বিদ্যুৎ অপচয় স্বাভাবিকের চেয়ে বেশি',
        message: 'Continuous standby draw is 24 W (17.5% of average baseline). Unplugging unused entertainment gear can save ৳138/month.',
        messageBn: 'বাসার সার্বক্ষণিক স্ট্যান্ডবাই অপচয় ২৪ ওয়াট। অব্যবহৃত প্লাগগুলো বন্ধ রাখলে মাসে ৳১৩৮ সাশ্রয় হবে।',
        timestamp: new Date(now - 1000 * 60 * 120).toISOString(),
        acknowledged: true,
        acknowledgedAt: new Date(now - 1000 * 60 * 60).toISOString(),
        dismissed: false,
        channelsSent: ['WEB_PUSH'],
        metadata: { standbyWatts: 24, percentOfDaily: 17.5 },
      },
      {
        id: 'alt_voltage_01',
        householdId: hhId,
        ruleType: 'VOLTAGE_ANOMALY',
        severity: 'WARNING',
        title: 'Grid Voltage Fluctuation Restored',
        titleBn: 'গ্রিড ভোল্টেজ স্বাভাবিক অবস্থায় ফিরে এসেছে',
        message: 'Voltage dipped to 191.4 V for 2.4 minutes earlier today. Voltage has safely returned to nominal 221.8 V.',
        messageBn: 'পূর্বে গ্রিড ভোল্টেজ ১৯১.৪ ভোল্টে নেমেছিল। বর্তমানে ২২১.৮ ভোল্টে স্বাভাবিক রয়েছে।',
        timestamp: new Date(now - 1000 * 60 * 360).toISOString(),
        acknowledged: true,
        acknowledgedAt: new Date(now - 1000 * 60 * 300).toISOString(),
        dismissed: true,
        dismissedAt: new Date(now - 1000 * 60 * 240).toISOString(),
        channelsSent: ['SMS', 'WHATSAPP'],
        metadata: { recordedVoltage: 191.4, durationMinutes: 2.4 },
      },
    ];
  }

  getAlerts(householdId: string, includeDismissed: boolean = false): AlertRecord[] {
    return this.alerts
      .filter(a => (a.householdId === householdId || householdId === 'ALL') && (includeDismissed || !a.dismissed))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  addAlert(alert: AlertRecord): AlertRecord {
    // Prevent duplicate spam of identical rule within 30 minutes
    const recentDuplicate = this.alerts.find(
      a =>
        a.householdId === alert.householdId &&
        a.ruleType === alert.ruleType &&
        !a.dismissed &&
        Date.now() - new Date(a.timestamp).getTime() < 1000 * 60 * 30
    );

    if (recentDuplicate) {
      return recentDuplicate;
    }

    this.alerts.unshift(alert);
    if (this.alerts.length > 200) {
      this.alerts = this.alerts.slice(0, 200);
    }
    return alert;
  }

  acknowledgeAlert(alertId: string): AlertRecord | null {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return null;

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    return alert;
  }

  dismissAlert(alertId: string): AlertRecord | null {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return null;

    alert.dismissed = true;
    alert.dismissedAt = new Date().toISOString();
    return alert;
  }

  createTestAlert(
    householdId: string,
    channels: NotificationChannel[] = ['EMAIL', 'WEB_PUSH']
  ): AlertRecord {
    const testAlert: AlertRecord = {
      id: `alt_test_${Date.now()}`,
      householdId,
      ruleType: 'SLAB_BREACH_IMMINENT',
      severity: 'WARNING',
      title: 'Simulated Energy Advisory Notice',
      titleBn: 'পরীক্ষামূলক এনার্জি নোটিশ',
      message: 'This is a test notification confirming your KilowattIQ alert channels are configured and responsive.',
      messageBn: 'আপনার কিলোওয়াট আইকিউ নোটিফিকেশন চ্যানেলগুলো সক্রিয় এবং সঠিকভাবে কাজ করছে।',
      timestamp: new Date().toISOString(),
      acknowledged: false,
      dismissed: false,
      channelsSent: [...channels],
      metadata: { test: true },
    };

    return this.addAlert(testAlert);
  }
}
