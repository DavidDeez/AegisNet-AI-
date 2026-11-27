import React from 'react';
import type { ReviewStatus, SeverityLevel, TriageCategory } from '../types/aegis';

export const TriageBadge: React.FC<{ category: TriageCategory }> = ({
  category,
}) => {
  const styles: Record<
    TriageCategory,
    { box: string; dot: string; label: string }
  > = {
    KNOWN_ATTACK: {
      box: 'bg-red-500/[0.08] text-red-300 border-white/10 border-l-2 border-l-red-400',
      dot: 'bg-red-400',
      label: 'KNOWN_ATTACK',
    },
    ANOMALOUS_UNKNOWN: {
      box: 'bg-amber-500/[0.08] text-amber-200 border-white/10 border-l-2 border-l-amber-400',
      dot: 'bg-amber-400',
      label: 'OPEN_SET_ANOMALY',
    },
    UNCERTAIN: {
      box: 'bg-sky-500/[0.08] text-sky-200 border-white/10 border-l-2 border-l-sky-400',
      dot: 'bg-sky-400',
      label: 'HIGH_ENTROPY',
    },
    BENIGN: {
      box: 'bg-emerald-500/[0.06] text-emerald-300/90 border-white/10 border-l-2 border-l-emerald-400/80',
      dot: 'bg-emerald-400',
      label: 'BENIGN',
    },
  };

  const cfg = styles[category] || {
    box: 'bg-slate-800/70 text-slate-300 border-white/10',
    dot: 'bg-slate-400',
    label: category,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-medium tracking-wider rounded-[3px] border ${cfg.box}`}
    >
      <span className={`w-1.5 h-1.5 rounded-[1px] ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: SeverityLevel }> = ({
  severity,
}) => {
  const styles: Record<SeverityLevel, string> = {
    CRITICAL: 'bg-red-950/60 text-red-300 border-red-500/30',
    HIGH: 'bg-orange-950/60 text-orange-300 border-orange-500/30',
    MEDIUM: 'bg-amber-950/60 text-amber-300 border-amber-500/30',
    LOW: 'bg-sky-950/60 text-sky-300 border-sky-500/30',
    INFO: 'bg-slate-900/60 text-slate-400 border-white/10',
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium tracking-wider rounded-[2px] border ${
        styles[severity] || styles.INFO
      }`}
    >
      {severity}
    </span>
  );
};

export const ReviewBadge: React.FC<{ status: ReviewStatus }> = ({ status }) => {
  const styles: Record<ReviewStatus, string> = {
    UNREVIEWED: 'bg-slate-900/70 text-slate-400 border-white/10',
    CONFIRMED_THREAT: 'bg-red-500/10 text-red-300 border-red-500/30',
    FALSE_POSITIVE: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    ESCALATED: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono tracking-wider rounded-[2px] border ${
        styles[status] || styles.UNREVIEWED
      }`}
    >
      {status}
    </span>
  );
};

export const ScoreMeter: React.FC<{
  label: string;
  valueText: string;
  percent: number;
  colorClass?: string;
  subtitle?: string;
}> = ({
  label,
  valueText,
  percent,
  colorClass = 'bg-sky-400',
  subtitle,
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-300">{label}</span>
        <span className="font-semibold text-slate-100">{valueText}</span>
      </div>
      <div className="h-1.5 w-full bg-[#07080c] rounded-[2px] overflow-hidden border border-white/10">
        <div
          className={`h-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {subtitle && (
        <p className="text-[10px] font-mono text-slate-500 leading-tight">
          {subtitle}
        </p>
      )}
    </div>
  );
};
