import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Mail,
  UserPlus,
  Users,
  Shield,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldAlert,
  Crown,
  FileSearch,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import {
  UserRole,
  ROLE_DEFINITIONS,
  HouseholdMember,
  HouseholdInvitation,
  getRemainingAuditorHours,
  canManageMembers,
} from '../../server/auth/roles';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: Household;
  currentUserRole: UserRole;
  token?: string | null;
  onMembersUpdated?: () => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  household,
  currentUserRole,
  token,
  onMembersUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'INVITE' | 'ROSTER'>('INVITE');
  const [emailInput, setEmailInput] = useState<string>('');
  const [fullNameInput, setFullNameInput] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'family_member' | 'utility_auditor'>('family_member');
  const [durationHours, setDurationHours] = useState<number>(48);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const isOwnerOrAdmin = canManageMembers(currentUserRole);

  const fetchRoster = useCallback(async () => {
    if (!household?.id) return;
    setIsLoadingRoster(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/households/${household.id}/members`, { headers });
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        setMembers(json.data.members || []);
        setInvitations(json.data.invitations || []);
      }
    } catch (err) {
      console.warn('[InviteMemberModal] Failed to load roster:', err);
    } finally {
      setIsLoadingRoster(false);
    }
  }, [household?.id, token]);

  useEffect(() => {
    if (isOpen) {
      fetchRoster();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, fetchRoster]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setErrorMessage('Please enter an email address.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/households/${household.id}/members/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: emailInput.trim(),
          fullName: fullNameInput.trim() || undefined,
          role: selectedRole,
          durationHours: selectedRole === 'utility_auditor' ? durationHours : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Failed to send invitation.');
      }

      setSuccessMessage(
        selectedRole === 'utility_auditor'
          ? `Utility auditor invitation issued to ${emailInput} with ${durationHours} hours read-only access.`
          : `Family member access granted to ${emailInput}.`
      );
      setEmailInput('');
      setFullNameInput('');
      fetchRoster();
      onMembersUpdated?.();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error creating invitation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [memberToRemoveId, setMemberToRemoveId] = useState<string | null>(null);

  const handleRemoveMember = async (memberId: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/households/${household.id}/members/${memberId}`, {
        method: 'DELETE',
        headers,
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Failed to remove member.');
      }

      fetchRoster();
      onMembersUpdated?.();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to remove member');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/households/${household.id}/invitations/${inviteId}`, {
        method: 'DELETE',
        headers,
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Failed to revoke invite.');
      }

      fetchRoster();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to revoke invite');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
                <span>Household Members & Access Control</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                {household.name} • Manage roles, family permissions, and auditor sessions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 pt-2 gap-4 text-xs font-bold font-display bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('INVITE')}
            className={`pb-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'INVITE'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Member via Email</span>
          </button>

          <button
            onClick={() => setActiveTab('ROSTER')}
            className={`pb-2.5 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ROSTER'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Active Members ({members.length})</span>
            {invitations.length > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-full font-mono">
                {invitations.length} pending
              </span>
            )}
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Permission Notice if current user is not owner/admin */}
          {!isOwnerOrAdmin && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Member Invitation Restricted</p>
                <p className="text-[11px] mt-0.5 opacity-90">
                  Your current role is <strong className="uppercase">{currentUserRole}</strong>. Only Household Owners and System Admins have authority to invite or revoke household members.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'INVITE' ? (
            <form onSubmit={handleSendInvite} className="space-y-4">
              {errorMessage && (
                <div className="bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-display">
                    Member Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      disabled={!isOwnerOrAdmin || isSubmitting}
                      placeholder="e.g. member@family.bd"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-amber-500 focus:outline-none dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-display">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={!isOwnerOrAdmin || isSubmitting}
                    placeholder="e.g. Nusrat Hossain"
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-amber-500 focus:outline-none dark:text-white"
                  />
                </div>
              </div>

              {/* Role Selection Cards */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-display">
                  Assign Household Role
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Family Member */}
                  <div
                    onClick={() => isOwnerOrAdmin && setSelectedRole('family_member')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      selectedRole === 'family_member'
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-950/40 shadow-xs ring-1 ring-sky-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-300 font-display">
                          <Users className="w-4 h-4 text-sky-500" />
                          Family Member
                        </span>
                        {selectedRole === 'family_member' && <Check className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        View live telemetry & toggle appliances/relays. <strong>Billing & budgets locked.</strong>
                      </p>
                    </div>
                    <div className="mt-2 text-[10px] text-sky-600 dark:text-sky-400 font-mono font-medium">
                      Permanent Access • No Time Limit
                    </div>
                  </div>

                  {/* Option 2: Utility Auditor */}
                  <div
                    onClick={() => isOwnerOrAdmin && setSelectedRole('utility_auditor')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      selectedRole === 'utility_auditor'
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/40 shadow-xs ring-1 ring-purple-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 font-display">
                          <FileSearch className="w-4 h-4 text-purple-500" />
                          Utility Auditor (DESCO / DPDC)
                        </span>
                        {selectedRole === 'utility_auditor' && <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        <strong>Read-only access.</strong> Cannot toggle loads or alter tariffs. All inspection views are audited.
                      </p>
                    </div>
                    <div className="mt-2 text-[10px] text-purple-600 dark:text-purple-400 font-mono font-medium">
                      Time-Limited • Auto-Expires
                    </div>
                  </div>
                </div>
              </div>

              {/* Auditor Duration Picker (Shown only if utility_auditor is selected) */}
              {selectedRole === 'utility_auditor' && (
                <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 font-display">
                      <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      Auditor Access Validity Window
                    </span>
                    <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">
                      {durationHours < 24 ? `${durationHours} Hours` : `${durationHours / 24} Day(s)`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {[
                      { label: '24 Hours', val: 24 },
                      { label: '48 Hours', val: 48 },
                      { label: '7 Days', val: 168 },
                      { label: '30 Days', val: 720 },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setDurationHours(opt.val)}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer font-display ${
                          durationHours === opt.val
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <p className="text-[10px] text-purple-700 dark:text-purple-300">
                    After this period, Supabase RLS policies automatically terminate access with HTTP 403.
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={!isOwnerOrAdmin || isSubmitting}
                  className={`px-5 py-2.5 rounded-xl font-bold font-display text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer ${
                    isOwnerOrAdmin
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold active:scale-95'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Sending Invitation...' : 'Send Invitation & Grant Role'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Roster Tab */
            <div className="space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-display">
                  Current Household Roster ({members.length})
                </h3>

                {isLoadingRoster ? (
                  <div className="text-center py-6 text-xs text-slate-400 font-mono">Loading members...</div>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const roleMeta = ROLE_DEFINITIONS[member.role] || ROLE_DEFINITIONS.family_member;
                      const hoursLeft = getRemainingAuditorHours(member.expiresAt);
                      const isExpired = member.role === 'utility_auditor' && hoursLeft === 0;

                      return (
                        <div
                          key={member.id}
                          className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 text-xs">
                              {member.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">{member.fullName}</span>
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border font-display ${roleMeta.color.bg} ${roleMeta.color.text} ${roleMeta.color.border} ${roleMeta.color.darkBg} ${roleMeta.color.darkText} ${roleMeta.color.darkBorder}`}
                                >
                                  {roleMeta.badgeText}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{member.email}</p>
                              {member.role === 'utility_auditor' && (
                                <p className="text-[10px] mt-0.5 font-mono">
                                  {isExpired ? (
                                    <span className="text-rose-600 font-bold">Access Expired</span>
                                  ) : (
                                    <span className="text-purple-600 dark:text-purple-400">
                                      Expires in ~{hoursLeft} hours
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>

                          {isOwnerOrAdmin && member.role !== 'owner' && (
                            memberToRemoveId === member.id ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    handleRemoveMember(member.id);
                                    setMemberToRemoveId(null);
                                  }}
                                  className="min-h-[44px] px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-['Outfit'] font-semibold"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setMemberToRemoveId(null)}
                                  className="min-h-[44px] px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-['Outfit']"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setMemberToRemoveId(member.id)}
                                title="Revoke member access"
                                aria-label={`Revoke access for ${member.fullName}`}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-rose-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pending Invitations */}
              {invitations.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 font-display">
                    Pending Email Invitations ({invitations.length})
                  </h3>

                  <div className="space-y-2">
                    {invitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">{inv.email}</span>
                            <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300 font-mono">
                              {inv.role}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            Token: {inv.inviteToken.slice(0, 14)}...
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copyToClipboard(inv.inviteToken, inv.id)}
                            className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedToken === inv.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedToken === inv.id ? 'Copied' : 'Copy Token'}</span>
                          </button>

                          {isOwnerOrAdmin && (
                            <button
                              onClick={() => handleRevokeInvite(inv.id)}
                              className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-[10px] font-bold text-rose-600 dark:text-rose-400 cursor-pointer"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-mono">Security Model: Supabase Row Level Security (RLS)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold font-display hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-slate-700 dark:text-slate-300"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
