/**
 * KilowattIQ Unified Alerts System - Type Definitions
 * 
 * Rules:
 * 1. SLAB_BREACH_IMMINENT: Within 5% of next BERC LT-A tariff tier
 * 2. BUDGET_CONSUMED_80: Monthly budget 80% consumed
 * 3. PROJECTED_OVERAGE_10: Projected month-end overage > 10% of cap
 * 4. VAMPIRE_LOAD_HIGH: Standby vampire load > 15% of daily total
 * 5. VOLTAGE_ANOMALY: Grid voltage out of safe 195V–245V window for > 2 min
 * 6. DEVICE_OFFLINE: IoT telemetry device offline > 30 min
 * 
 * Channels:
 * - EMAIL: Resend API dispatcher
 * - SMS: Bangladesh Local SMS Gateway (e.g. Onnorokom / SSL Wireless / Greenweb)
 * - WHATSAPP: Twilio WhatsApp Business API
 * - WEB_PUSH: VAPID Web Push protocol
 */

export type AlertRuleType =
  | 'SLAB_BREACH_IMMINENT'
  | 'BUDGET_CONSUMED_80'
  | 'PROJECTED_OVERAGE_10'
  | 'VAMPIRE_LOAD_HIGH'
  | 'VOLTAGE_ANOMALY'
  | 'DEVICE_OFFLINE';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP' | 'WEB_PUSH';

export interface QuietHoursConfig {
  enabled: boolean;
  startTime: string; // "HH:MM" 24h format, e.g. "23:00"
  endTime: string;   // "HH:MM" 24h format, e.g. "07:00"
  timezone: string;  // e.g. "Asia/Dhaka"
}

export interface UserAlertPreferences {
  householdId: string;
  userId: string;
  enabledRules: Record<AlertRuleType, boolean>;
  enabledChannels: Record<NotificationChannel, boolean>;
  quietHours: QuietHoursConfig;
  contacts: {
    email?: string;
    phone?: string;
    whatsappNumber?: string;
    pushSubscription?: any;
  };
  updatedAt: string;
}

export interface AlertRecord {
  id: string;
  householdId: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  title: string;
  titleBn: string;
  message: string;
  messageBn: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  dismissed: boolean;
  dismissedAt?: string;
  channelsSent: NotificationChannel[];
  metadata?: Record<string, any>;
}

export interface ChannelDeliveryResult {
  channel: NotificationChannel;
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
  timestamp: string;
}

export interface AlertEvaluationResult {
  householdId: string;
  evaluatedAt: string;
  triggeredAlerts: AlertRecord[];
  deliveries: ChannelDeliveryResult[];
  quietHoursActive: boolean;
}
