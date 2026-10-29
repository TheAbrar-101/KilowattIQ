import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface EmptyStateProps {
  icon?: LucideIcon;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  actionLabelEn?: string;
  actionLabelBn?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Sparkles,
  titleEn,
  titleBn,
  descriptionEn,
  descriptionBn,
  actionLabelEn,
  actionLabelBn,
  onAction,
  actionIcon: ActionIcon,
  className = '',
}) => {
  const { language } = useLanguage();
  const title = language === 'bn' ? titleBn : titleEn;
  const description = language === 'bn' ? descriptionBn : descriptionEn;
  const actionLabel = language === 'bn' ? actionLabelBn : actionLabelEn;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800/80 max-w-lg mx-auto ${className}`}
    >
      {/* Friendly Illustration Badge */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/5">
          <Icon className="w-10 h-10" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-xs shadow-md">
          ✓
        </div>
      </div>

      {/* Typography: Title (Outfit) & Body (Plus Jakarta Sans) */}
      <h3 className="text-lg sm:text-xl font-bold text-white font-['Outfit'] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-300 dark:text-slate-100 font-['Plus_Jakarta_Sans'] max-w-md mb-6 leading-relaxed">
        {description}
      </p>

      {/* One Clear CTA Button (min-h-[44px], rounded-xl, Outfit 600, focus ring) */}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          aria-label={actionLabel}
          className="min-h-[44px] px-6 py-2.5 rounded-xl font-semibold font-['Outfit'] text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          <span>{actionLabel}</span>
        </button>
      )}
    </motion.div>
  );
};
