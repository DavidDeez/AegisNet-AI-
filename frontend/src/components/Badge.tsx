import React from 'react';
import type { ReviewStatus, SeverityLevel, TriageCategory } from '../types/aegis';

export const TriageBadge: React.FC<{ category: TriageCategory }> = ({
  category,
}) => {
  const styles: Record<TriageCategory, string> = {
    KNOWN_ATTACK:
      'bg-red-500/15 text-red-300 border-red-500/35',
    ANOMALOUS_UNKNOWN:
      'bg-purple-500/15 text-purple-300 border-purple-500/35',
    UNCERTAIN:
      'bg-amber-500/15 text-amber-300 border-amber-500/35',
    BENIGN:
      'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  };

  const labels: Record<TriageCategory, string> = {
    KNOWN_ATTACK: 'KNOWN ATTACK',
    ANOMALOUS_UNKNOWN: 'ANOMALOUS / UNKNOWN',
    UNCERTAIN: 'UNCERTAIN',
    BENIGN: 'BENIGN',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium tracking-tight rounded border ${
        styles[category] || 'bg-slate-800 text-slate-300 border-slate-700'
      }`}
    >
      {labels[category] || category}
    </span>
  );
};

export const SeverityBadge: React.FC<{ severity: SeverityLevel }> = ({
  severity,
}) => {
  const styles: Record<SeverityLevel, string> = {
    CRITICAL: 'bg-red-950/80 text-red-300 border-red-500/40',
    HIGH: 'bg-orange-950/80 text-orange-300 border-orange-500/40',
    MEDIUM: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
    LOW: 'bg-sky-950/80 text-sky-300 border-sky-500/40',
    INFO: 'bg-slate-900 text-slate-400 border-slate-700/60',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded border ${
        styles[severity] || styles.INFO
      }`}
    >
      {severity}
    </span>
  );
};

export const ReviewBadge: React.FC<{ status: ReviewStatus }> = ({ status }) => {
  const styles: Record<ReviewStatus, string> = {
    UNREVIEWED: 'bg-slate-800/80 text-slate-300 border-slate-700',
    CONFIRMED_THREAT: 'bg-red-500/15 text-red-300 border-red-500/35',
    FALSE_POSITIVE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    ESCALATED: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono rounded border ${
        styles[status] || styles.UNREVIEWED
      }`}
    >
      {status.replace('_', ' ')}
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
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono font-medium text-slate-200">{valueText}</span>
      </div>
      <div className="h-1.5 w-full bg-[#161b22] rounded-full overflow-hidden border border-[#21262d]">
        <div
          className={`h-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {subtitle && (
        <p className="text-[11px] text-slate-500 leading-tight">{subtitle}</p>
      )}
    </div>
  );
};
