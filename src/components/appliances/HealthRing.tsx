import React from 'react';

interface HealthRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

export const HealthRing: React.FC<HealthRingProps> = ({
  score,
  size = 42,
  strokeWidth = 3.5,
  showText = true,
  className = '',
  onClick,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Determine color scheme based on health score
  let strokeColor = 'stroke-emerald-500';
  let textColor = 'text-emerald-400';
  let glowColor = 'rgba(16, 185, 129, 0.25)';

  if (clampedScore < 40) {
    strokeColor = 'stroke-rose-500';
    textColor = 'text-rose-400';
    glowColor = 'rgba(244, 63, 94, 0.35)';
  } else if (clampedScore < 70) {
    strokeColor = 'stroke-amber-500';
    textColor = 'text-amber-400';
    glowColor = 'rgba(245, 158, 11, 0.3)';
  }

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center select-none ${
        onClick ? 'cursor-pointer hover:scale-105 active:scale-95 transition-transform' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      title={`Electrical Health Score: ${clampedScore}/100`}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Subtle background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-800 dark:text-slate-800/80"
        />
        {/* Subtle glow filter */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${strokeColor} transition-all duration-500 ease-out`}
          style={{ filter: `drop-shadow(0 0 3px ${glowColor})` }}
        />
      </svg>

      {showText && (
        <span
          className={`absolute text-[10px] font-mono font-extrabold tracking-tighter ${textColor}`}
        >
          {clampedScore}
        </span>
      )}
    </div>
  );
};
