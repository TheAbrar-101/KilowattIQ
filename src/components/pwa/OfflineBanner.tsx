import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [lastTelemetry, setLastTelemetry] = useState<{
    activeWatts?: number;
    totalKwh?: number;
    timestamp?: string;
  } | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      readCachedData();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
      readCachedData();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const readCachedData = () => {
    try {
      const raw = localStorage.getItem('kilowattiq_last_telemetry');
      if (raw) {
        setLastTelemetry(JSON.parse(raw));
      }
    } catch (e) {}
  };

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      setIsRetrying(false);
      if (navigator.onLine) {
        setIsOnline(true);
      }
    }, 800);
  };

  if (isOnline) {
    return null;
  }

  const formattedTime = lastTelemetry?.timestamp
    ? new Date(lastTelemetry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Earlier';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium sticky top-14 z-40 backdrop-blur-md"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-bold font-display text-slate-900 dark:text-white">
              You're offline — showing last known readings
            </span>
            <span className="hidden md:inline text-slate-600 dark:text-slate-400 font-sans">
              (Cached at {formattedTime}
              {lastTelemetry?.activeWatts ? ` • ${(lastTelemetry.activeWatts / 1000).toFixed(2)} kW` : ''})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-display text-[11px] transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
