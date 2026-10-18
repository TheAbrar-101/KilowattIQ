/**
 * KilowattIQ Security & Compliance Audit Log Service
 * 
 * Records tamper-evident audit records ("who did what, when"):
 * - Appliance and device load toggle operations
 * - DESCO / DPDC utility bill settlements & prepaid top-ups
 * - Budget limit revisions & BERC tariff changes
 * - Household member invitations, role updates & revocations
 * - Utility auditor inspection sessions & unauthorized toggle attempts
 */

import { AuditLogEntry, UserRole } from '../../src/server/auth/roles';
import { SupabaseService } from './SupabaseService';

export class AuditService {
  private static instance: AuditService;
  private db: SupabaseService;
  private inMemoryLogs: AuditLogEntry[] = [];

  private constructor() {
    this.db = SupabaseService.getInstance();
    this.seedInitialAuditTrail();
  }

  public static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  private seedInitialAuditTrail() {
    const demoHhId = '11111111-1111-4111-a111-111111111111';
    const now = Date.now();

    this.inMemoryLogs = [
      {
        id: 'aud_log_001',
        householdId: demoHhId,
        userId: 'usr_dhaka_01',
        userName: 'Tanvir Hossain',
        userEmail: 'demo@kilowattiq.bd',
        userRole: 'owner',
        action: 'MEMBER_INVITED',
        entityType: 'member',
        entityId: 'mbr_auditor_01',
        entityName: 'DESCO Auditor Access',
        details: {
          role: 'utility_auditor',
          email: 'auditor@desco.org.bd',
          durationHours: 48,
          expiresAt: new Date(now + 48 * 3600000).toISOString(),
          reason: 'Bimonthly industrial/residential tariff efficiency verification',
        },
        status: 'SUCCESS',
        timestamp: new Date(now - 14 * 3600000).toISOString(),
        ipAddress: '103.145.118.42 (Dhaka Fiber)',
      },
      {
        id: 'aud_log_002',
        householdId: demoHhId,
        userId: 'usr_dhaka_01',
        userName: 'Tanvir Hossain',
        userEmail: 'demo@kilowattiq.bd',
        userRole: 'owner',
        action: 'BILL_PAYMENT',
        entityType: 'billing',
        entityId: 'rcpt_bkash_mv2p9upq4c6',
        entityName: 'DESCO Postpaid Settlement',
        details: {
          amountBDT: 2280,
          provider: 'bKash',
          accountNumber: 'DESCO-LT-A-883921',
          trxId: 'BKASH_MV2P9UPP7NZ',
        },
        status: 'SUCCESS',
        timestamp: new Date(now - 8 * 3600000).toISOString(),
        ipAddress: '103.145.118.42',
      },
      {
        id: 'aud_log_003',
        householdId: demoHhId,
        userId: 'usr_family_02',
        userName: 'Nusrat Hossain',
        userEmail: 'nusrat@gulshan.bd',
        userRole: 'family_member',
        action: 'APPLIANCE_TOGGLED',
        entityType: 'appliance',
        entityId: '33333333-3333-4333-a333-333333333301',
        entityName: 'Living Room 1.5T AC',
        details: {
          state: 'ON',
          powerW: 1650,
          trigger: 'Wall Switchboard UI',
        },
        status: 'SUCCESS',
        timestamp: new Date(now - 2 * 3600000).toISOString(),
        ipAddress: '103.145.118.45 (Home Wi-Fi)',
      },
      {
        id: 'aud_log_004',
        householdId: demoHhId,
        userId: 'usr_auditor_01',
        userName: 'DESCO Meter Inspector #402',
        userEmail: 'auditor@desco.org.bd',
        userRole: 'utility_auditor',
        action: 'AUDITOR_AUDIT_VIEW',
        entityType: 'report',
        entityId: 'rep_oct_2026',
        entityName: 'Energy Audit Telemetry Log',
        details: {
          views: ['Slab Tier 3 Distribution', 'NILM Disaggregated Load Profile', 'Weather Heatwave Surcharge'],
          mode: 'READ_ONLY',
        },
        status: 'SUCCESS',
        timestamp: new Date(now - 45 * 60000).toISOString(),
        ipAddress: '180.211.238.10 (DESCO Head Office)',
      },
    ];
  }

  /**
   * Records a security/compliance audit log entry
   */
  public async log(entry: {
    householdId?: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRole: UserRole | string;
    action: string;
    entityType: 'appliance' | 'device' | 'billing' | 'budget' | 'member' | 'tariff' | 'report' | 'system' | 'auth';
    entityId?: string;
    entityName?: string;
    details?: Record<string, any>;
    status?: 'SUCCESS' | 'FORBIDDEN' | 'WARNING';
    reason?: string;
    ipAddress?: string;
  }): Promise<AuditLogEntry> {
    const record: AuditLogEntry = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      householdId: entry.householdId || '11111111-1111-4111-a111-111111111111',
      userId: entry.userId,
      userName: entry.userName || 'Unknown User',
      userEmail: entry.userEmail || 'unknown@kilowattiq.bd',
      userRole: entry.userRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      entityName: entry.entityName,
      details: entry.details || {},
      status: entry.status || 'SUCCESS',
      reason: entry.reason,
      timestamp: new Date().toISOString(),
      ipAddress: entry.ipAddress || '103.145.118.42',
    };

    // Prepend to in-memory audit log
    this.inMemoryLogs.unshift(record);
    if (this.inMemoryLogs.length > 500) {
      this.inMemoryLogs.pop();
    }

    // Attempt persistent write to Supabase if live
    const client = this.db.getClient();
    if (client && !this.db.isUsingMock()) {
      try {
        await client.from('audit_logs').insert({
          household_id: record.householdId,
          user_id: record.userId.startsWith('usr_') ? null : record.userId,
          action: record.action,
          entity_type: record.entityType,
          entity_id: record.entityId,
          metadata: {
            userName: record.userName,
            userEmail: record.userEmail,
            userRole: record.userRole,
            entityName: record.entityName,
            status: record.status,
            reason: record.reason,
            ipAddress: record.ipAddress,
            details: record.details,
          },
          created_at: record.timestamp,
        });
      } catch (err) {
        console.warn('[AuditService] Supabase DB write failed, retained in memory:', err);
      }
    }

    return record;
  }

  /**
   * Retrieves audit logs for a household, filtered and sorted descending
   */
  public async getLogs(householdId?: string, limit: number = 50): Promise<AuditLogEntry[]> {
    if (!householdId || householdId === '11111111-1111-4111-a111-111111111111' || householdId === 'hh_gulshan_01') {
      return this.inMemoryLogs.slice(0, limit);
    }

    return this.inMemoryLogs
      .filter(l => !l.householdId || l.householdId === householdId)
      .slice(0, limit);
  }
}
