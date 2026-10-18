/**
 * KilowattIQ Multi-Role Access Control (RBAC) & Permission Engine
 * 
 * Defines the 4 canonical roles:
 * 1. OWNER: Full control over household, appliances, tariffs, budgets, billing, invitations.
 * 2. FAMILY_MEMBER: View live telemetry & toggle loads/appliances. Billing, budgets, and member changes locked.
 * 3. UTILITY_AUDITOR: Read-only, time-limited access (audited). Cannot toggle loads or edit settings.
 * 4. ADMIN: System-level cross-tenant oversight with complete RLS administrative bypass.
 * 
 * Enforced at:
 * - Supabase Row Level Security (RLS) PostgreSQL policies
 * - Express API middleware and route handlers
 * - Audit log ledger (all auditor views and restricted attempts logged)
 */

export type UserRole = 'owner' | 'family_member' | 'utility_auditor' | 'admin';

export type RoleAlias = 'owner' | 'member' | 'family_member' | 'auditor' | 'utility_auditor' | 'admin' | 'household_user' | 'CONSUMER' | 'ADMIN';

export interface RoleCapability {
  canViewTelemetry: boolean;
  canToggleLoads: boolean;
  canModifyBilling: boolean;
  canManageBudgets: boolean;
  canManageMembers: boolean;
  canViewAuditLogs: boolean;
  canExportReports: boolean;
  isCrossTenantAdmin: boolean;
  isTimeLimited: boolean;
  isAudited: boolean;
}

export interface RoleMetadata {
  id: UserRole;
  label: string;
  labelBn: string;
  badgeText: string;
  badgeTextBn: string;
  description: string;
  descriptionBn: string;
  icon: string;
  color: {
    bg: string;
    text: string;
    border: string;
    darkBg: string;
    darkText: string;
    darkBorder: string;
  };
  capabilities: RoleCapability;
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleMetadata> = {
  owner: {
    id: 'owner',
    label: 'Household Owner',
    labelBn: 'বাসার মালিক (সম্পূর্ণ নিয়ন্ত্রণ)',
    badgeText: 'Owner',
    badgeTextBn: 'মালিক',
    description: 'Full administrative control over household settings, appliance switching, tariffs, budgets, and member invitations.',
    descriptionBn: 'বাসার সকল সেটিংস, সরঞ্জাম চালু/বন্ধ, ট্যারিফ, বাজেট এবং সদস্য ব্যবস্থাপনার পূর্ণ ক্ষমতা।',
    icon: 'Crown',
    color: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
      darkBg: 'dark:bg-emerald-950/60',
      darkText: 'dark:text-emerald-300',
      darkBorder: 'dark:border-emerald-800',
    },
    capabilities: {
      canViewTelemetry: true,
      canToggleLoads: true,
      canModifyBilling: true,
      canManageBudgets: true,
      canManageMembers: true,
      canViewAuditLogs: true,
      canExportReports: true,
      isCrossTenantAdmin: false,
      isTimeLimited: false,
      isAudited: false,
    },
  },
  family_member: {
    id: 'family_member',
    label: 'Family Member',
    labelBn: 'পরিবারের সদস্য',
    badgeText: 'Family Member',
    badgeTextBn: 'সদস্য',
    description: 'Can monitor real-time consumption and toggle appliance loads. Cannot pay bills, alter budgets, or modify tariffs.',
    descriptionBn: 'বিদ্যুৎ খরচ দেখা ও সরঞ্জাম অন/অফ করতে পারে। বিল পরিশোধ বা বাজেট পরিবর্তন নিষেধ।',
    icon: 'Users',
    color: {
      bg: 'bg-sky-50',
      text: 'text-sky-700',
      border: 'border-sky-200',
      darkBg: 'dark:bg-sky-950/60',
      darkText: 'dark:text-sky-300',
      darkBorder: 'dark:border-sky-800',
    },
    capabilities: {
      canViewTelemetry: true,
      canToggleLoads: true,
      canModifyBilling: false,
      canManageBudgets: false,
      canManageMembers: false,
      canViewAuditLogs: false,
      canExportReports: true,
      isCrossTenantAdmin: false,
      isTimeLimited: false,
      isAudited: false,
    },
  },
  utility_auditor: {
    id: 'utility_auditor',
    label: 'Utility Auditor',
    labelBn: 'ইউটিলিটি নিরীক্ষক (রিড-অনলি)',
    badgeText: 'Auditor (Read-Only)',
    badgeTextBn: 'নিরীক্ষক (রিড-অনলি)',
    description: 'Read-only access for DESCO/DPDC energy audits. Time-limited with active session logging; cannot toggle loads or change billing.',
    descriptionBn: 'ডেসকো/ডিপিডিসি এনার্জি অডিটের জন্য সময়সীমিত রিড-অনলি এক্সেস। সরঞ্জাম নিয়ন্ত্রণ বা বিল পরিবর্তন নিষেধ।',
    icon: 'FileSearch',
    color: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      darkBg: 'dark:bg-purple-950/60',
      darkText: 'dark:text-purple-300',
      darkBorder: 'dark:border-purple-800',
    },
    capabilities: {
      canViewTelemetry: true,
      canToggleLoads: false,
      canModifyBilling: false,
      canManageBudgets: false,
      canManageMembers: false,
      canViewAuditLogs: true,
      canExportReports: true,
      isCrossTenantAdmin: false,
      isTimeLimited: true,
      isAudited: true,
    },
  },
  admin: {
    id: 'admin',
    label: 'System Administrator',
    labelBn: 'সিস্টেম অ্যাডমিনিস্ট্রেটর',
    badgeText: 'Admin (Cross-Tenant)',
    badgeTextBn: 'সিস্টেম অ্যাডমিন',
    description: 'Cross-tenant oversight across all households, hardware adapters, and system configurations with full audit privileges.',
    descriptionBn: 'সকল খানা (household) ও সিস্টেম অ্যাডমিনিস্ট্রেশনের পূর্ণ তত্ত্বাবধান ক্ষমতা।',
    icon: 'ShieldAlert',
    color: {
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-300',
      darkBg: 'dark:bg-amber-950/60',
      darkText: 'dark:text-amber-300',
      darkBorder: 'dark:border-amber-700',
    },
    capabilities: {
      canViewTelemetry: true,
      canToggleLoads: true,
      canModifyBilling: true,
      canManageBudgets: true,
      canManageMembers: true,
      canViewAuditLogs: true,
      canExportReports: true,
      isCrossTenantAdmin: true,
      isTimeLimited: false,
      isAudited: false,
    },
  },
};

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  expiresAt: string | null; // ISO Date string for auditors, null for permanent members
  invitedBy?: string;
  status: 'active' | 'pending' | 'expired' | 'revoked';
  createdAt: string;
  lastActiveAt?: string;
}

export interface HouseholdInvitation {
  id: string;
  householdId: string;
  email: string;
  fullName?: string;
  role: UserRole;
  invitedBy: string;
  invitedByName?: string;
  expiresAt: string | null;
  inviteToken: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
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
  status: 'SUCCESS' | 'FORBIDDEN' | 'WARNING';
  reason?: string;
  timestamp: string;
  ipAddress?: string;
}

/**
 * Normalizes any legacy or external role string to standard UserRole
 */
export function normalizeRole(roleString?: string | null): UserRole {
  if (!roleString) return 'owner';
  const lower = roleString.toLowerCase().trim();
  if (lower === 'admin' || lower === 'administrator') return 'admin';
  if (lower === 'utility_auditor' || lower === 'auditor') return 'utility_auditor';
  if (lower === 'family_member' || lower === 'member') return 'family_member';
  if (lower === 'owner' || lower === 'household_user' || lower === 'consumer') return 'owner';
  return 'family_member';
}

/**
 * Checks if a utility auditor's time-limited access has expired
 */
export function isAuditorExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const expTime = new Date(expiresAt).getTime();
  if (isNaN(expTime)) return false;
  return Date.now() > expTime;
}

/**
 * Returns hours remaining for a time-limited auditor, or null if permanent/unlimited
 */
export function getRemainingAuditorHours(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const expTime = new Date(expiresAt).getTime();
  if (isNaN(expTime)) return null;
  const diffMs = expTime - Date.now();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
}

/**
 * Evaluates whether a role is authorized to toggle electrical loads
 */
export function canToggleLoads(role: UserRole, expiresAt?: string | null): boolean {
  if (role === 'admin' || role === 'owner' || role === 'family_member') {
    return true;
  }
  // Utility auditors NEVER have load toggle authorization
  if (role === 'utility_auditor') {
    return false;
  }
  return false;
}

/**
 * Evaluates whether a role is authorized to change billing, payments, or budgets
 */
export function canModifyBilling(role: UserRole, expiresAt?: string | null): boolean {
  if (role === 'admin' || role === 'owner') {
    return true;
  }
  // Family members and Auditors CANNOT modify billing
  return false;
}

/**
 * Evaluates whether a role is authorized to invite or remove household members
 */
export function canManageMembers(role: UserRole, expiresAt?: string | null): boolean {
  return role === 'admin' || role === 'owner';
}

/**
 * Evaluates whether a role is authorized to inspect audit logs
 */
export function canViewAuditLogs(role: UserRole, expiresAt?: string | null): boolean {
  if (isAuditorExpired(expiresAt)) return false;
  return role === 'admin' || role === 'owner' || role === 'utility_auditor';
}

/**
 * Evaluates overall household read access (checking expiration if auditor)
 */
export function canAccessHousehold(role: UserRole, expiresAt?: string | null): boolean {
  if (role === 'admin' || role === 'owner' || role === 'family_member') {
    return true;
  }
  if (role === 'utility_auditor') {
    return !isAuditorExpired(expiresAt);
  }
  return false;
}
