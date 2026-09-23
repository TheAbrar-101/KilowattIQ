import React, { useState } from 'react';
import { Zap, Shield, Mail, Lock, User, Phone, CheckCircle2, AlertCircle, ArrowRight, Sparkles, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AuthPage: React.FC = () => {
  const { signIn, signUp, error: authContextError, loading } = useAuth();
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [showDbGuide, setShowDbGuide] = useState<boolean>(false);

  // Form State
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setInfoMessage(null);

    if (isRegisterMode) {
      if (!fullName.trim()) {
        setFormError('Please enter your Full Name.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setFormError('Please enter a valid email address.');
        return;
      }
      if (password.length < 6) {
        setFormError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setFormError('Passwords do not match.');
        return;
      }

      try {
        await signUp(fullName, email, phone, password);
      } catch (err: any) {
        // Auth error handled by AuthContext
      }
    } else {
      if (!email.trim() || !password) {
        setFormError('Please enter email and password.');
        return;
      }

      try {
        await signIn(email, password);
      } catch (err: any) {
        // Auth error handled by AuthContext
      }
    }
  };

  const handleDemoLogin = async (demoType: 'consumer' | 'admin') => {
    setFormError(null);
    try {
      if (demoType === 'admin') {
        await signIn('admin@kilowattiq.bd', 'admin123');
      } else {
        await signIn('demo@kilowattiq.bd', 'demo123');
      }
    } catch (err: any) {
      console.error('Demo login error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Background Decorative Elements */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10">
        
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl mb-4 shadow-lg shadow-emerald-500/10">
            <Zap className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
            Kilowatt<span className="text-emerald-500">IQ</span>
          </h1>
          <p className="text-slate-400 text-sm">
            AI-Powered Smart Energy & Tariff Analytics for Bangladesh
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-md">
          
          {/* Instant Prototype Access Hero Section */}
          <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
                  Interactive Prototype Ready
                </span>
              </div>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/20">
                No setup required
              </span>
            </div>
            
            <p className="text-xs text-slate-300 mb-3.5 leading-relaxed">
              Launch directly into the fully simulated live smart grid prototype with pre-loaded DESCO AMI meters, appliance telemetry, and Bangladesh slab tariff analytics.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleDemoLogin('consumer')}
                className="group w-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 hover:border-emerald-400 rounded-xl p-3 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-300 group-hover:text-emerald-200">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Gulshan Resident</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-300">
                  Live dashboard, IoT telemetry, slab tariffs & AI advisor
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="group w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 rounded-xl p-3 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300 group-hover:text-amber-200">
                    <Shield className="w-3.5 h-3.5 text-amber-400" />
                    <span>Grid Administrator</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <span className="text-[10px] text-slate-400 group-hover:text-slate-300">
                  National utility grid, BERC tariffs & load stress monitor
                </span>
              </button>
            </div>
          </div>

          <div className="relative flex py-2 items-center mb-5">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase font-semibold tracking-wider text-slate-500">
              Or sign in with custom account
            </span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl border border-slate-800/80 mb-6">
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(false);
                setFormError(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                !isRegisterMode
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(true);
                setFormError(null);
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all ${
                isRegisterMode
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Register Household
            </button>
          </div>

          {/* Errors Display */}
          {(formError || authContextError) && (
            <div className="mb-6 bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex flex-col gap-2 text-xs text-rose-300">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError || authContextError}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDbGuide(!showDbGuide)}
                className="text-left text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-1 mt-1 cursor-pointer"
              >
                <span>Connecting your own Supabase database? Click for instructions</span>
                {showDbGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* Supabase Connection Setup Guide Collapsible */}
          {showDbGuide && (
            <div className="mb-6 bg-slate-950 border border-emerald-500/30 rounded-xl p-4 text-xs text-slate-300 space-y-3 shadow-inner">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <Database className="w-4 h-4" />
                <span>Supabase Setup Guide</span>
              </div>
              <ol className="list-decimal pl-4 space-y-2 text-[11px] text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-white">Run Database Migrations:</strong> In your Supabase Dashboard, open <em>SQL Editor</em> and run the script in <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded text-[10px]">supabase/migrations/20260810000000_complete_kilowattiq_schema.sql</code>.
                </li>
                <li>
                  <strong className="text-white">Add Environment Variables:</strong> Under <em>Project Settings &gt; API</em> in Supabase, copy your keys and add them to your environment variables:
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-slate-400 font-mono text-[10px]">
                    <li><strong className="text-slate-200">SUPABASE_URL</strong>: https://your-id.supabase.co</li>
                    <li><strong className="text-slate-200">SUPABASE_ANON_KEY</strong>: eyJhbGci...</li>
                    <li><strong className="text-slate-200">SUPABASE_SERVICE_ROLE_KEY</strong>: eyJhbGci...</li>
                  </ul>
                </li>
                <li>
                  <strong className="text-white">Disable Email Confirmation (Optional):</strong> In Supabase under <em>Authentication &gt; Providers &gt; Email</em>, toggle off &quot;Confirm email&quot; for instant logins without email verification.
                </li>
              </ol>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {isRegisterMode && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name <span className="text-emerald-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Tanvir Hossain"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                      required={isRegisterMode}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="tel"
                      placeholder="+880 1711-000000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Address <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="tanvir@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password <span className="text-emerald-400">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                />
              </div>
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Confirm Password <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    required={isRegisterMode}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isRegisterMode ? 'Create Account & Access' : 'Sign In to Dashboard'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Shortcuts */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-3">
              Quick One-Click Demo Access
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('consumer')}
                className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Gulshan Resident</span>
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('admin')}
                className="bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Grid Administrator</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          Secured by Supabase Auth & PostgreSQL Row-Level Security (RLS)
        </p>

      </div>
    </div>
  );
};
