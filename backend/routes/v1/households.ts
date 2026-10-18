import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { SupabaseService } from '../../services/SupabaseService';
import { MemberService } from '../../services/MemberService';
import { AuditService } from '../../services/AuditService';
import {
  UserRole,
  canToggleLoads,
  canModifyBilling,
  canManageMembers,
  canViewAuditLogs,
  isAuditorExpired,
  normalizeRole,
} from '../../../src/server/auth/roles';

const router = Router();
const db = SupabaseService.getInstance();
const memberService = MemberService.getInstance();
const auditService = AuditService.getInstance();

function resolveUserRole(req: AuthenticatedRequest, householdId: string): {
  role: UserRole;
  isExpired: boolean;
} {
  const userId = req.user?.id || 'usr_dhaka_01';
  const systemRole = req.user?.role;
  const householdRole = req.user?.householdRole;

  if (householdRole) {
    const isExp = householdRole === 'utility_auditor' && isAuditorExpired(req.user?.auditorExpiresAt);
    return { role: householdRole, isExpired: isExp };
  }

  const resolved = memberService.resolveUserRoleInHousehold(householdId, userId, systemRole);
  return { role: resolved.role, isExpired: resolved.isExpired };
}

function isHouseholdAuthorized(req: AuthenticatedRequest, householdId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'ADMIN' || req.user.role === 'admin') return true;
  if (req.user.householdIds && req.user.householdIds.includes(householdId)) return true;
  // Standard demo household fallback for preview user
  if (householdId === '11111111-1111-4111-a111-111111111111' || householdId === 'hh_gulshan_01') return true;
  return false;
}

// GET /api/v1/my-households & /api/v1/households/my-households
router.get('/my-households', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({ status: 'success', data: households });
});

// GET /api/v1/households - Get authorized user households only
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const households = await db.getHouseholdsForUser(req.user.id);
  res.json({ status: 'success', data: households });
});

// GET /api/v1/households/:id
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: You do not have permission to access this household.',
    });
  }

  const { role, isExpired } = resolveUserRole(req, id);
  if (isExpired) {
    return res.status(403).json({
      status: 'error',
      code: 'AUDITOR_ACCESS_EXPIRED',
      message: 'Utility auditor access expired. Please request a new invitation from the household owner.',
    });
  }

  const household = await db.getHouseholdById(id);
  if (!household) {
    return res.status(404).json({ status: 'error', message: 'Household not found' });
  }

  // If utility auditor, log read access
  if (role === 'utility_auditor') {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Utility Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'AUDITOR_HOUSEHOLD_VIEW',
      entityType: 'report',
      entityId: id,
      entityName: household.name,
      details: { accessMode: 'READ_ONLY_AUDIT' },
      status: 'SUCCESS',
    });
  }

  res.json({ status: 'success', data: { ...household, currentUserRole: role } });
});

// POST /api/v1/households
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'Authentication required' });
  }

  const newHousehold = await db.createHousehold({
    userId: req.user.id,
    name: req.body.name || 'New Bangladesh Household',
    utilityProvider: req.body.utilityProvider || 'DESCO',
    accountNumber: req.body.accountNumber || 'DESCO-0001',
    sanctionedLoadKw: req.body.sanctionedLoadKw || 3.0,
    monthlyBudgetBDT: req.body.monthlyBudgetBDT || 3500,
    address: req.body.address || { division: 'Dhaka', city: 'Dhaka', area: 'Dhanmondi' },
  });
  res.status(201).json({ status: 'success', data: newHousehold });
});

// ====================================================================
// HOUSEHOLD MEMBERS & RBAC INVITATION ROUTES
// ====================================================================

// GET /api/v1/households/:id/members
router.get('/:id/members', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const { role, isExpired } = resolveUserRole(req, id);
  if (isExpired) {
    return res.status(403).json({
      status: 'error',
      code: 'AUDITOR_ACCESS_EXPIRED',
      message: 'Auditor access has expired.',
    });
  }

  const members = memberService.getMembers(id);
  const invitations = memberService.getInvitations(id);

  if (role === 'utility_auditor') {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Utility Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'AUDITOR_MEMBERS_VIEW',
      entityType: 'member',
      details: { memberCount: members.length },
      status: 'SUCCESS',
    });
  }

  return res.json({
    status: 'success',
    data: {
      householdId: id,
      currentUserRole: role,
      members,
      invitations,
    },
  });
});

// POST /api/v1/households/:id/members/invite
router.post('/:id/members/invite', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role } = resolveUserRole(req, id);
  if (!canManageMembers(role)) {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'unknown',
      userName: req.user?.fullName || 'User',
      userEmail: req.user?.email || 'unknown',
      userRole: role,
      action: 'UNAUTHORIZED_INVITE_ATTEMPT',
      entityType: 'member',
      details: { attemptedRole: req.body.role, targetEmail: req.body.email },
      status: 'FORBIDDEN',
      reason: 'Role lacks canManageMembers privilege (Owner or Admin required)',
    });

    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins have permission to invite new members.',
    });
  }

  const { email, fullName, role: inviteRole, durationHours } = req.body;
  if (!email) {
    return res.status(400).json({ status: 'error', message: 'Email is required to invite a member.' });
  }

  try {
    const result = await memberService.inviteMember({
      householdId: id,
      email,
      fullName,
      role: normalizeRole(inviteRole || 'family_member'),
      durationHours: durationHours ? Number(durationHours) : 48,
      invitedBy: {
        id: req.user?.id || 'usr_dhaka_01',
        fullName: req.user?.fullName || 'Tanvir Hossain',
        email: req.user?.email || 'demo@kilowattiq.bd',
      },
    });

    return res.status(201).json({
      status: 'success',
      data: result,
      message: `Invitation successfully sent to ${email} as ${result.invitation.role}.`,
    });
  } catch (err: any) {
    return res.status(400).json({ status: 'error', message: err?.message || 'Failed to send invitation.' });
  }
});

// DELETE /api/v1/households/:id/members/:memberId
router.delete('/:id/members/:memberId', async (req: AuthenticatedRequest, res: Response) => {
  const { id, memberId } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role } = resolveUserRole(req, id);
  if (!canManageMembers(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins can remove members.',
    });
  }

  try {
    const success = await memberService.removeMember(id, memberId, {
      id: req.user?.id || 'usr_dhaka_01',
      fullName: req.user?.fullName || 'Tanvir Hossain',
      email: req.user?.email || 'demo@kilowattiq.bd',
      role,
    });

    return res.json({ status: 'success', message: 'Member removed successfully.', data: { success } });
  } catch (err: any) {
    return res.status(400).json({ status: 'error', message: err?.message || 'Could not remove member.' });
  }
});

// DELETE /api/v1/households/:id/invitations/:inviteId
router.delete('/:id/invitations/:inviteId', async (req: AuthenticatedRequest, res: Response) => {
  const { id, inviteId } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role } = resolveUserRole(req, id);
  if (!canManageMembers(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins can revoke invitations.',
    });
  }

  const success = await memberService.revokeInvitation(id, inviteId, {
    id: req.user?.id || 'usr_dhaka_01',
    fullName: req.user?.fullName || 'Tanvir Hossain',
    email: req.user?.email || 'demo@kilowattiq.bd',
    role,
  });

  return res.json({ status: 'success', message: 'Invitation revoked.', data: { success } });
});

// ====================================================================
// AUDIT LOG TABLE & COMPLIANCE ROUTE ("WHO DID WHAT, WHEN")
// ====================================================================

// GET /api/v1/households/:id/audit-logs
router.get('/:id/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role, isExpired } = resolveUserRole(req, id);
  if (isExpired) {
    return res.status(403).json({
      status: 'error',
      code: 'AUDITOR_ACCESS_EXPIRED',
      message: 'Auditor access has expired.',
    });
  }

  // Check audit log permission (Owner, Auditor, Admin)
  if (!canViewAuditLogs(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Family members cannot view system audit logs. Only Owners, Utility Auditors, and Admins have audit privileges.',
    });
  }

  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const logs = await auditService.getLogs(id, limit);

  // If auditor inspected the log, record that action
  if (role === 'utility_auditor') {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Utility Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'AUDITOR_INSPECTED_LOGS',
      entityType: 'system',
      details: { recordsReturned: logs.length },
      status: 'SUCCESS',
    });
  }

  return res.json({
    status: 'success',
    data: {
      householdId: id,
      total: logs.length,
      logs,
    },
  });
});

// ====================================================================
// APPLIANCES & LOAD TOGGLE (ENFORCING RLS & RBAC SOURCE OF TRUTH)
// ====================================================================

// GET /api/v1/households/:id/rooms
router.get('/:id/rooms', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const rooms = await db.getRooms(id);
  res.json({ status: 'success', data: rooms });
});

// POST /api/v1/households/:id/rooms
router.post('/:id/rooms', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role } = resolveUserRole(req, id);
  if (!canManageMembers(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins can create new rooms.',
    });
  }

  const room = await db.createRoom({
    householdId: id,
    name: req.body.name,
    floorLevel: req.body.floorLevel || 1,
    icon: req.body.icon || 'home',
  });
  res.status(201).json({ status: 'success', data: room });
});

// GET /api/v1/households/:id/appliances
router.get('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const appliances = await db.getAppliances(id);
  res.json({ status: 'success', data: appliances });
});

// POST /api/v1/households/:id/appliances
router.post('/:id/appliances', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied.' });
  }

  const { role } = resolveUserRole(req, id);
  if (!canManageMembers(role)) {
    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Only Household Owners or Admins can register new appliances.',
    });
  }

  const appliance = await db.createAppliance({
    householdId: id,
    roomId: req.body.roomId,
    name: req.body.name,
    category: req.body.category || 'OTHER',
    ratedPowerW: Number(req.body.ratedPowerW) || 100,
    standbyPowerW: Number(req.body.standbyPowerW) || 5,
    averageHoursPerDay: Number(req.body.averageHoursPerDay) || 6,
    isInverterType: Boolean(req.body.isInverterType),
    isVampireRisk: Boolean(req.body.isVampireRisk),
    purchasePriceBDT: Number(req.body.purchasePriceBDT) || 0,
  });

  await auditService.log({
    householdId: id,
    userId: req.user?.id || 'usr_dhaka_01',
    userName: req.user?.fullName || 'Household Owner',
    userEmail: req.user?.email || 'demo@kilowattiq.bd',
    userRole: role,
    action: 'APPLIANCE_CREATED',
    entityType: 'appliance',
    entityId: appliance.id,
    entityName: appliance.name,
    details: { ratedPowerW: appliance.ratedPowerW, category: appliance.category },
    status: 'SUCCESS',
  });

  res.status(201).json({ status: 'success', data: appliance });
});

// POST /api/v1/households/:id/appliances/:applianceId/toggle
// ENFORCES: Owner (YES), Family Member (YES), Utility Auditor (FORBIDDEN, AUDITED)
router.post('/:id/appliances/:applianceId/toggle', async (req: AuthenticatedRequest, res: Response) => {
  const { id, applianceId } = req.params;
  if (!isHouseholdAuthorized(req, id)) {
    return res.status(403).json({ status: 'error', message: 'Access denied to requested household.' });
  }

  const { role, isExpired } = resolveUserRole(req, id);

  // 1. Check expiration for auditors
  if (role === 'utility_auditor' && isExpired) {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'EXPIRED_ACCESS_ATTEMPT',
      entityType: 'appliance',
      entityId: applianceId,
      status: 'FORBIDDEN',
      reason: 'Auditor token expired',
    });

    return res.status(403).json({
      status: 'error',
      code: 'AUDITOR_ACCESS_EXPIRED',
      message: 'Utility auditor access expired. Toggle operations are prohibited.',
    });
  }

  // 2. Check load toggle permission (Auditors FORBIDDEN)
  if (!canToggleLoads(role)) {
    await auditService.log({
      householdId: id,
      userId: req.user?.id || 'usr_auditor_01',
      userName: req.user?.fullName || 'Utility Auditor',
      userEmail: req.user?.email || 'auditor@desco.org.bd',
      userRole: role,
      action: 'UNAUTHORIZED_LOAD_TOGGLE_ATTEMPT',
      entityType: 'appliance',
      entityId: applianceId,
      status: 'FORBIDDEN',
      reason: 'Utility auditors have read-only access and cannot toggle electrical loads.',
    });

    return res.status(403).json({
      status: 'error',
      code: 'ROLE_FORBIDDEN',
      message: 'Utility auditors have read-only access and cannot toggle electrical loads.',
    });
  }

  const { isOn } = req.body || {};
  const result = await db.toggleAppliance(applianceId, isOn);

  // Audit log the successful toggle
  await auditService.log({
    householdId: id,
    userId: req.user?.id || 'usr_dhaka_01',
    userName: req.user?.fullName || 'User',
    userEmail: req.user?.email || 'user@kilowattiq.bd',
    userRole: role,
    action: 'APPLIANCE_TOGGLED',
    entityType: 'appliance',
    entityId: applianceId,
    details: { newState: result.isOn ? 'ON' : 'OFF' },
    status: 'SUCCESS',
  });

  res.json({
    status: 'success',
    data: {
      applianceId: result.applianceId,
      householdId: id,
      isOn: result.isOn,
      updatedAt: new Date().toISOString(),
      performedBy: {
        userId: req.user?.id,
        role,
      },
    },
  });
});

export default router;
