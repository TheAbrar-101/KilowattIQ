/**
 * User Alert Preferences Store
 * 
 * Purpose:
 * Persists and provides access to per-household alert configuration,
 * selected notification channels, quiet hour boundaries, and contact details.
 */

import { UserAlertPreferences } from './types';

export class AlertPreferencesStore {
  private static instance: AlertPreferencesStore;
  private preferencesMap = new Map<string, UserAlertPreferences>();

  private constructor() {
    this.seedDefaults();
  }

  static getInstance(): AlertPreferencesStore {
    if (!AlertPreferencesStore.instance) {
      AlertPreferencesStore.instance = new AlertPreferencesStore();
    }
    return AlertPreferencesStore.instance;
  }

  private seedDefaults(): void {
    // Default seed for primary test household
    const defaultHhId = '11111111-1111-4111-a111-111111111111';
    this.preferencesMap.set(defaultHhId, {
      householdId: defaultHhId,
      userId: 'u0000000-0000-0000-0000-000000000001',
      enabledRules: {
        SLAB_BREACH_IMMINENT: true,
        BUDGET_CONSUMED_80: true,
        PROJECTED_OVERAGE_10: true,
        VAMPIRE_LOAD_HIGH: true,
        VOLTAGE_ANOMALY: true,
        DEVICE_OFFLINE: true,
      },
      enabledChannels: {
        EMAIL: true,
        SMS: true,
        WHATSAPP: true,
        WEB_PUSH: true,
      },
      quietHours: {
        enabled: true,
        startTime: '23:00',
        endTime: '07:00',
        timezone: 'Asia/Dhaka',
      },
      contacts: {
        email: 'tanvir.energy@kilowattiq.local',
        phone: '+8801711234567',
        whatsappNumber: '+8801711234567',
      },
      updatedAt: new Date().toISOString(),
    });
  }

  getPreferences(householdId: string): UserAlertPreferences {
    const existing = this.preferencesMap.get(householdId);
    if (existing) return existing;

    // Create default config on first access
    const fresh: UserAlertPreferences = {
      householdId,
      userId: 'u0000000-0000-0000-0000-000000000001',
      enabledRules: {
        SLAB_BREACH_IMMINENT: true,
        BUDGET_CONSUMED_80: true,
        PROJECTED_OVERAGE_10: true,
        VAMPIRE_LOAD_HIGH: true,
        VOLTAGE_ANOMALY: true,
        DEVICE_OFFLINE: true,
      },
      enabledChannels: {
        EMAIL: true,
        SMS: true,
        WHATSAPP: true,
        WEB_PUSH: true,
      },
      quietHours: {
        enabled: true,
        startTime: '23:00',
        endTime: '07:00',
        timezone: 'Asia/Dhaka',
      },
      contacts: {
        email: 'consumer@kilowattiq.local',
        phone: '+8801711000000',
        whatsappNumber: '+8801711000000',
      },
      updatedAt: new Date().toISOString(),
    };

    this.preferencesMap.set(householdId, fresh);
    return fresh;
  }

  updatePreferences(
    householdId: string,
    updates: Partial<UserAlertPreferences>
  ): UserAlertPreferences {
    const current = this.getPreferences(householdId);
    const merged: UserAlertPreferences = {
      ...current,
      ...updates,
      enabledRules: {
        ...current.enabledRules,
        ...(updates.enabledRules || {}),
      },
      enabledChannels: {
        ...current.enabledChannels,
        ...(updates.enabledChannels || {}),
      },
      quietHours: {
        ...current.quietHours,
        ...(updates.quietHours || {}),
      },
      contacts: {
        ...current.contacts,
        ...(updates.contacts || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    this.preferencesMap.set(householdId, merged);
    return merged;
  }
}
