import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  X,
  History,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Zap,
  DollarSign,
  UserPlus,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  Download
} from 'lucide-react';
import { Household } from '../../../shared/types/household';
import { AuditLogEntry, UserRole, ROLE_DEFINITIONS } from '../../server/auth/roles';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  household: Household;
  currentUserRole: UserRole;
  token?: string | null;
}

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  household,
  currentUserRole,
  token,
}) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'TOGGLE' | 'BILLING' | 'MEMBERS' | 'AUDITOR'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    if (!household?.id) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/v1/households/${household.id}/audit-logs?limit=100`, { headers });
      const json = await res.json();

      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Failed to retrieve audit log trail.');
      }

      setLogs(json.data?.logs || []);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Access error retrieving audit trail.');
    } finally {
      setIsLoading(false);
    }
  }, [household?.id, token]);

  useEffect(() => {
    if (isOpen) {
      fetchAuditLogs();
    }
  }, [isOpen, fetchAuditLogs]);

  if (!isOpen) return null;

  // Filter logs based on category and search
  const filteredLogs = logs.filter((log) => {
    if (selectedFilter === 'TOGGLE' && !log.action.includes('TOGGLE')) return false;
    if (selectedFilter === 'BILLING' && !['BILL_PAYMENT', 'PREPAID_TOPUP', 'AUTOPAY_UPDATED'].includes(log.action)) return false;
    if (selectedFilter === 'MEMBERS' && !['MEMBER_INVITED', 'MEMBER_REMOVED', 'INVITATION_REVOKED'].includes(log.action)) return false;
    if (selectedFilter === 'AUDITOR' && !log.action.includes('AUDITOR')) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        log.userName.toLowerCase().includes(term) ||
        log.userEmail.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        (log.entityName && log.entityName.toLowerCase().includes(term))
      );
    }
    return true;
  });

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Security & Compliance Audit Trail
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-500/30">
                  Tamper-Evident
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
                {household.name} • Cryptographic logging of &quot;who did what, when&quot; across load controls and billing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAuditLogs}
              title="Refresh audit logs"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none">
            {[
              { id: 'ALL', label: 'All Actions' },
              { id: 'TOGGLE', label: 'Load Toggles' },
              { id: 'BILLING', label: 'Billing & Top-ups' },
              { id: 'MEMBERS', label: 'Member Access' },
              { id: 'AUDITOR', label: 'Auditor Inspects' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-display whitespace-nowrap transition-all cursor-pointer ${
                  selectedFilter === f.id
                    ? 'bg-amber-500 text-slate-950 font-extrabold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search user, action, entity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:border-amber-500 focus:outline-none dark:text-white"
            />
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {errorMessage ? (
            <div className="p-6 text-center text-rose-600 dark:text-rose-400 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl">
              <ShieldAlert className="w-6 h-6 mx-auto mb-2 text-rose-500" />
              <p className="font-bold">{errorMessage}</p>
              <p className="text-[11px] mt-1 text-slate-500">
                Ensure you are logged in as a Household Owner, Utility Auditor, or System Admin.
              </p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-12 text-xs font-mono text-slate-400">Loading audit trail...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">No audit log records found for this filter.</div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-display">
                      <th className="py-2.5 px-3">When (Timestamp)</th>
                      <th className="py-2.5 px-3">Who (Actor)</th>
                      <th className="py-2.5 px-3">What (Action)</th>
                      <th className="py-2.5 px-3">Target Entity</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 font-sans">
                    {filteredLogs.map((log) => {
                      const roleMeta = ROLE_DEFINITIONS[log.userRole as UserRole] || ROLE_DEFINITIONS.family_member;

                      return (
                        <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          {/* When */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {formatRelativeTime(log.timestamp)}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>

                          {/* Who */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {log.userName}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {log.userEmail}
                                </span>
                              </div>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border font-display ${roleMeta.color.bg} ${roleMeta.color.text} ${roleMeta.color.border} ${roleMeta.color.darkBg} ${roleMeta.color.darkText} ${roleMeta.color.darkBorder}`}
                              >
                                {roleMeta.badgeText}
                              </span>
                            </div>
                          </td>

                          {/* What */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-amber-700 dark:text-amber-400 text-[11px]">
                              {log.action}
                            </span>
                            {log.details?.state && (
                              <span className="ml-1 text-[10px] font-mono font-bold text-slate-500">
                                → {log.details.state}
                              </span>
                            )}
                          </td>

                          {/* Target */}
                          <td className="py-2.5 px-3 max-w-[200px] truncate">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {log.entityName || log.entityId || log.entityType}
                            </span>
                            {log.details?.amountBDT && (
                              <span className="block text-[10px] font-mono text-emerald-600 font-bold">
                                ৳{log.details.amountBDT}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {log.status === 'SUCCESS' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>VERIFIED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 font-mono">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>DENIED</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <span>Showing {filteredLogs.length} audit trail records</span>
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
