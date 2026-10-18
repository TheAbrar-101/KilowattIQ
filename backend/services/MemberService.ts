/**
 * KilowattIQ Household Member & Access Control Service
 * 
 * Manages:
 * - Household member roster and role assignments (Owner, Family Member, Utility Auditor, Admin)
 * - Time-limited access for Utility Auditors (with expiration date calculation)
 * - Email invitation lifecycle (invite, verify, revoke)
 */

import {
  HouseholdMember,
  HouseholdInvitation,
  UserRole,
  isAuditorExpired,
  normalizeRole,
} from '../../src/server/auth/roles';
import { AuditService } from './AuditService';

export class MemberService {
  private static instance: MemberService;
  private members: Map<string, HouseholdMember[]> = new Map();
  private invitations: Map<string, HouseholdInvitation[]> = new Map();
  private auditService: AuditService;

  private constructor() {
    this.auditService = AuditService.getInstance();
    this.seedInitialMembers();
  }

  public static getInstance(): MemberService {
    if (!MemberService.instance) {
      MemberService.instance = new MemberService();
    }
    return MemberService.instance;
  }

  private seedInitialMembers() {
    const demoHhId = '11111111-1111-4111-a111-111111111111';
    const now = Date.now();

    const initialMembers: HouseholdMember[] = [
      {
        id: 'mbr_owner_01',
        householdId: demoHhId,
        userId: 'usr_dhaka_01',
        email: 'demo@kilowattiq.bd',
        fullName: 'Tanvir Hossain',
        role: 'owner',
        expiresAt: null,
        status: 'active',
        createdAt: '2026-08-01T08:00:00Z',
        lastActiveAt: new Date(now - 120000).toISOString(),
      },
      {
        id: 'mbr_family_02',
        householdId: demoHhId,
        userId: 'usr_family_02',
        email: 'nusrat@gulshan.bd',
        fullName: 'Nusrat Hossain',
        role: 'family_member',
        expiresAt: null,
        status: 'active',
        invitedBy: 'usr_dhaka_01',
        createdAt: '2026-08-05T10:30:00Z',
        lastActiveAt: new Date(now - 3600000).toISOString(),
      },
      {
        id: 'mbr_auditor_03',
        householdId: demoHhId,
        userId: 'usr_auditor_01',
        email: 'auditor@desco.org.bd',
        fullName: 'DESCO Meter Inspector #402',
        role: 'utility_auditor',
        expiresAt: new Date(now + 46 * 3600000).toISOString(), // ~46 hours remaining
        status: 'active',
        invitedBy: 'usr_dhaka_01',
        createdAt: '2026-10-17T09:00:00Z',
        lastActiveAt: new Date(now - 45 * 60000).toISOString(),
      },
    ];

    const initialInvites: HouseholdInvitation[] = [
      {
        id: 'inv_991823',
        householdId: demoHhId,
        email: 'engineer@desco.gov.bd',
        fullName: 'DESCO Grid Engineer',
        role: 'utility_auditor',
        invitedBy: 'usr_dhaka_01',
        invitedByName: 'Tanvir Hossain',
        expiresAt: new Date(now + 7 * 86400000).toISOString(),
        inviteToken: 'inv_tok_39af8b912c49e',
        status: 'pending',
        createdAt: new Date(now - 24 * 3600000).toISOString(),
      },
    ];

    this.members.set(demoHhId, initialMembers);
    this.invitations.set(demoHhId, initialInvites);
  }

  private resolveHouseholdId(id?: string): string {
    if (!id || id === 'hh_gulshan_01' || id === 'default') {
      return '11111111-1111-4111-a111-111111111111';
    }
    return id;
  }

  /**
   * Retrieves all members of a household
   */
  public getMembers(householdId?: string): HouseholdMember[] {
    const hhId = this.resolveHouseholdId(householdId);
    const list = this.members.get(hhId) || [];
    // Dynamically update expired status for auditors
    return list.map(m => {
      if (m.role === 'utility_auditor' && isAuditorExpired(m.expiresAt)) {
        return { ...m, status: 'expired' };
      }
      return m;
    });
  }

  /**
   * Retrieves pending invitations for a household
   */
  public getInvitations(householdId?: string): HouseholdInvitation[] {
    const hhId = this.resolveHouseholdId(householdId);
    return this.invitations.get(hhId) || [];
  }

  /**
   * Finds a member by user ID in a specific household
   */
  public getMemberByUserId(householdId: string, userId: string): HouseholdMember | null {
    const members = this.getMembers(householdId);
    return members.find(m => m.userId === userId) || null;
  }

  /**
   * Resolves the user's active role in a household
   */
  public resolveUserRoleInHousehold(householdId: string, userId: string, systemRole?: string): {
    role: UserRole;
    isExpired: boolean;
    member: HouseholdMember | null;
  } {
    if (systemRole === 'ADMIN' || systemRole === 'admin') {
      return { role: 'admin', isExpired: false, member: null };
    }

    const member = this.getMemberByUserId(householdId, userId);
    if (!member) {
      // Default to owner for demo user, otherwise family_member
      if (userId === 'usr_dhaka_01' || userId === 'usr_admin') {
        return { role: 'owner', isExpired: false, member: null };
      }
      return { role: 'family_member', isExpired: false, member: null };
    }

    const isExpired = member.role === 'utility_auditor' && isAuditorExpired(member.expiresAt);
    return {
      role: member.role,
      isExpired,
      member,
    };
  }

  /**
   * Invites a new household member via email
   */
  public async inviteMember(params: {
    householdId: string;
    email: string;
    fullName?: string;
    role: UserRole;
    durationHours?: number; // for utility_auditor
    invitedBy: { id: string; fullName: string; email: string };
  }): Promise<{ invitation: HouseholdInvitation; autoJoinedMember?: HouseholdMember }> {
    const hhId = this.resolveHouseholdId(params.householdId);
    const role = normalizeRole(params.role);

    let expiresAt: string | null = null;
    if (role === 'utility_auditor') {
      const hours = params.durationHours || 48;
      expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
    }

    const token = `inv_tok_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
    const invitation: HouseholdInvitation = {
      id: `inv_${Date.now()}`,
      householdId: hhId,
      email: params.email.trim().toLowerCase(),
      fullName: params.fullName || params.email.split('@')[0],
      role,
      invitedBy: params.invitedBy.id,
      invitedByName: params.invitedBy.fullName,
      expiresAt,
      inviteToken: token,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const currentInvites = this.invitations.get(hhId) || [];
    currentInvites.unshift(invitation);
    this.invitations.set(hhId, currentInvites);

    // Also directly provision an active member record for instant testing in applet
    const newMember: HouseholdMember = {
      id: `mbr_${Date.now()}`,
      householdId: hhId,
      userId: `usr_${Math.random().toString(36).substring(2, 8)}`,
      email: invitation.email,
      fullName: invitation.fullName || 'Invited User',
      role,
      expiresAt,
      invitedBy: params.invitedBy.id,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    const currentMembers = this.members.get(hhId) || [];
    currentMembers.push(newMember);
    this.members.set(hhId, currentMembers);

    // Audit log
    await this.auditService.log({
      householdId: hhId,
      userId: params.invitedBy.id,
      userName: params.invitedBy.fullName,
      userEmail: params.invitedBy.email,
      userRole: 'owner',
      action: 'MEMBER_INVITED',
      entityType: 'member',
      entityId: newMember.id,
      entityName: `${newMember.fullName} (${newMember.role})`,
      details: {
        email: invitation.email,
        role: newMember.role,
        expiresAt: newMember.expiresAt,
        token: invitation.inviteToken,
      },
      status: 'SUCCESS',
    });

    return { invitation, autoJoinedMember: newMember };
  }

  /**
   * Revokes or deletes a pending invitation
   */
  public async revokeInvitation(householdId: string, inviteId: string, actor: { id: string; fullName: string; email: string; role: string }): Promise<boolean> {
    const hhId = this.resolveHouseholdId(householdId);
    const invites = this.invitations.get(hhId) || [];
    const target = invites.find(i => i.id === inviteId);

    if (!target) return false;

    this.invitations.set(hhId, invites.filter(i => i.id !== inviteId));

    await this.auditService.log({
      householdId: hhId,
      userId: actor.id,
      userName: actor.fullName,
      userEmail: actor.email,
      userRole: actor.role,
      action: 'INVITATION_REVOKED',
      entityType: 'member',
      entityId: inviteId,
      entityName: target.email,
      details: { email: target.email, role: target.role },
      status: 'SUCCESS',
    });

    return true;
  }

  /**
   * Removes an existing member from the household
   */
  public async removeMember(householdId: string, memberId: string, actor: { id: string; fullName: string; email: string; role: string }): Promise<boolean> {
    const hhId = this.resolveHouseholdId(householdId);
    const members = this.members.get(hhId) || [];
    const target = members.find(m => m.id === memberId);

    if (!target) return false;
    if (target.role === 'owner' && members.filter(m => m.role === 'owner').length <= 1) {
      throw new Error('Cannot remove the sole Household Owner.');
    }

    this.members.set(hhId, members.filter(m => m.id !== memberId));

    await this.auditService.log({
      householdId: hhId,
      userId: actor.id,
      userName: actor.fullName,
      userEmail: actor.email,
      userRole: actor.role,
      action: 'MEMBER_REMOVED',
      entityType: 'member',
      entityId: memberId,
      entityName: `${target.fullName} (${target.role})`,
      details: { email: target.email, removedRole: target.role },
      status: 'SUCCESS',
    });

    return true;
  }

  /**
   * Updates an existing member's role or expiration
   */
  public async updateMember(householdId: string, memberId: string, updates: { role?: UserRole; expiresAt?: string | null }, actor: { id: string; fullName: string; email: string; role: string }): Promise<HouseholdMember | null> {
    const hhId = this.resolveHouseholdId(householdId);
    const members = this.members.get(hhId) || [];
    const idx = members.findIndex(m => m.id === memberId);

    if (idx === -1) return null;

    const oldRole = members[idx].role;
    const updated: HouseholdMember = {
      ...members[idx],
      ...(updates.role ? { role: updates.role } : {}),
      ...(updates.expiresAt !== undefined ? { expiresAt: updates.expiresAt } : {}),
    };

    members[idx] = updated;
    this.members.set(hhId, members);

    await this.auditService.log({
      householdId: hhId,
      userId: actor.id,
      userName: actor.fullName,
      userEmail: actor.email,
      userRole: actor.role,
      action: 'MEMBER_ROLE_UPDATED',
      entityType: 'member',
      entityId: memberId,
      entityName: `${updated.fullName} (${updated.role})`,
      details: { oldRole, newRole: updated.role, expiresAt: updated.expiresAt },
      status: 'SUCCESS',
    });

    return updated;
  }
}
