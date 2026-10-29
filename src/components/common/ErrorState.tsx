import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface ErrorStateProps {
  titleEn?: string;
  titleBn?: string;
  messageEn?: string;
  messageBn?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  titleEn = 'Unable to Load Data',
  titleBn = 'ডাটা লোড করা সম্ভব হয়নি',
  messageEn = 'We encountered a connection issue while communicating with the service. Please verify your internet connection and try again.',
  messageBn = 'সার্ভারের সাথে যোগাযোগের সময় একটি সমস্যা হয়েছে। অনুগ্রহ করে ইন্টারনেট সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।',
  onRetry,
  isRetrying = false,
  className = '',
}) => {
  const { language } = useLanguage();
  const title = language === 'bn' ? titleBn : titleEn;
  const message = language === 'bn' ? messageBn : messageEn;
  const retryLabel = language === 'bn' ? 'পুনরায় চেষ্টা করুন' : 'Try Again';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center p-8 sm:p-10 text-center rounded-2xl bg-slate-900/80 border border-amber-500/30 max-w-lg mx-auto ${className}`}
    >
      {/* Friendly Error Icon */}
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-lg shadow-amber-500/5">
        <AlertCircle className="w-8 h-8" />
      </div>

      {/* Typography: Title (Outfit) & Plain Language Body (Plus Jakarta Sans) */}
      <h3 className="text-lg sm:text-xl font-bold text-white font-['Outfit'] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-300 dark:text-slate-100 font-['Plus_Jakarta_Sans'] max-w-md mb-6 leading-relaxed">
        {message}
      </p>

      {/* Try Again Button (Outfit 600, min-h-[44px], rounded-xl, focus rings) */}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          aria-label={retryLabel}
          className="min-h-[44px] px-6 py-2.5 rounded-xl font-semibold font-['Outfit'] text-sm bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-500/20 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? (language === 'bn' ? 'লোড হচ্ছে...' : 'Retrying...') : retryLabel}</span>
        </button>
      )}
    </motion.div>
  );
};
