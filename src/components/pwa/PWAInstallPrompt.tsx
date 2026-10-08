import React, { useState } from 'react';
import { Download, X, Share, PlusSquare, Zap, Smartphone, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isDismissed, install, dismissPrompt } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);

  // If already installed or user dismissed within 7 days, don't show the intrusive mobile banner
  if (isInstalled || isDismissed) {
    return null;
  }

  // Only show the prompt if browser supports install or if on iOS Safari
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      await install();
    }
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-50 pointer-events-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-2xl shadow-slate-950/40 relative">
            {/* Close / Dismiss button */}
            <button
              onClick={dismissPrompt}
              aria-label="Dismiss install prompt for 7 days"
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5 pr-6">
              {/* KilowattIQ App Icon */}
              <div className="w-12 h-12 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center shrink-0 shadow-md">
                <Zap className="w-6 h-6 text-amber-400 fill-amber-400" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">
                    Install KilowattIQ
                  </h4>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono">
                    PWA
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-snug font-sans">
                  Install for quick access, offline readings & real-time telemetry updates right from your home screen.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3.5 flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 font-bold font-display text-xs py-2 px-3.5 rounded-xl transition-all shadow-md cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{isIOS ? 'Install on iOS' : 'Install App'}</span>
              </button>

              <button
                onClick={dismissPrompt}
                className="py-2 px-3 text-xs font-bold font-display text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Not now
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS Safari Guided Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-amber-500/40">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Install on iPhone / iPad
                </h3>
              </div>
              <button
                onClick={() => setShowIOSModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Apple Safari requires adding to home screen through the share sheet:
            </p>

            <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="flex items-center gap-1.5">
                  Tap the <Share className="w-3.5 h-3.5 text-sky-500 inline" /> <strong>Share</strong> button in Safari toolbar.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                  2
                </span>
                <span className="flex items-center gap-1.5">
                  Scroll down and tap <PlusSquare className="w-3.5 h-3.5 text-emerald-500 inline" /> <strong>Add to Home Screen</strong>.
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top right to complete installation.
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIOSModal(false);
                dismissPrompt();
              }}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold font-display transition-colors cursor-pointer"
            >
              Got it
            </button>
          </motion.div>
        </div>
      )}
    </>
  );
};
