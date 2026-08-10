import React from 'react';
import { ShieldCheck, Cpu, Database, Server, Activity, Users } from 'lucide-react';
import { Household } from '../../../shared/types/household';

interface AdminTabProps {
  households: Household[];
}

export const AdminTab: React.FC<AdminTabProps> = ({ households }) => {
  return (
    <div className="space-y-4">
      
      {/* System Admin Overview Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>System Administration & IoT Operations</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Multi-household isolation, database schema state, and global adapter telemetry oversight
            </p>
          </div>
          <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            OPERATIONAL
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">DATABASE BACKEND</span>
            <span className="font-bold text-emerald-400 font-mono text-[11px]">Supabase PostgreSQL</span>
            <p className="text-[10px] text-slate-400">Row-Level Security (RLS)</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">AUTHENTICATION</span>
            <span className="font-bold text-slate-200 font-mono text-[11px]">Supabase Auth / JWT</span>
            <p className="text-[10px] text-slate-400">Per-household data isolation</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">ACTIVE IOT ADAPTERS</span>
            <span className="font-bold text-amber-400 font-mono text-[11px]">5 Adapters Active</span>
            <p className="text-[10px] text-slate-400">Mock, Tuya, MQTT, DESCO, Composite</p>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs space-y-0.5">
            <span className="text-[9px] font-bold text-slate-500 uppercase block">NATIONAL GRID</span>
            <span className="font-bold text-slate-200 font-mono text-[11px]">50.0 Hz Frequency</span>
            <p className="text-[10px] text-slate-400">Nominal 220V - 230V AC</p>
          </div>
        </div>
      </div>

      {/* Household Isolation Oversight Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
        <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
          <Users className="w-3.5 h-3.5 text-emerald-400" />
          <span>Managed Households Data Isolation Table</span>
        </h4>

        <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
              <tr>
                <th className="py-2 px-3">Household ID</th>
                <th className="py-2 px-3">Name / Area</th>
                <th className="py-2 px-3">Utility Provider</th>
                <th className="py-2 px-3">Load Cap</th>
                <th className="py-2 px-3">Isolation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300 font-mono text-[11px]">
              {households.map((h) => (
                <tr key={h.id}>
                  <td className="py-2 px-3 text-amber-400 font-bold">{h.id}</td>
                  <td className="py-2 px-3 font-sans text-slate-200">{h.name} ({h.address.area})</td>
                  <td className="py-2 px-3 text-emerald-400 font-bold">{h.utilityProvider}</td>
                  <td className="py-2 px-3 text-slate-200">{h.sanctionedLoadKw} kW</td>
                  <td className="py-2 px-3">
                    <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                      ENFORCED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
