import React from 'react';
import type { ReviewStatus, SeverityLevel, TriageCategory } from '../types/aegis';

export const TriageBadge: React.FC<{ category: TriageCategory }> = ({
  category,
}) => {
  const styles: Record<TriageCategory, string> = {
    KNOWN_ATTACK:
      'bg-red-500/20 text-red-200 border-red-400/40 shadow-[0_0_12px_rgba(239,68,68,0.22)]',
    ANOMALOUS_UNKNOWN:
      'bg-purple-500/20 text-purple-200 border-purple-400/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]',
    UNCERTAIN:
      'bg-amber-500/20 text-amber-200 border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
    BENIGN:
      'bg-emerald-500/20 text-emerald-200 border-emerald-400/40 shadow-[0_0_10px_rgba(16,185,129,0.18)]',
  };

  const labels: Record<TriageCategory, string> = {
    KNOWN_ATTACK: 'KNOWN ATTACK',
    ANOMALOUS_UNKNOWN: 'ANOMALOUS / UNKNOWN',
    UNCERTAIN: 'UNCERTAIN',
    BENIGN: 'BENIGN',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-mono font-medium tracking-tight rounded-full border backdrop-blur-md ${
        styles[category] || 'bg-slate-800/80 text-slate-200 border-slate-600'
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
    CRITICAL:
      'bg-red-950/80 text-red-200 border-red-400/50 shadow-[0_0_10px_rgba(239,68,68,0.25)]',
    HIGH: 'bg-orange-950/80 text-orange-200 border-orange-400/50',
    MEDIUM: 'bg-amber-950/80 text-amber-200 border-amber-400/50',
    LOW: 'bg-sky-950/80 text-sky-200 border-sky-400/50',
    INFO: 'bg-slate-900/70 text-slate-300 border-slate-600/50',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded-md border backdrop-blur-sm ${
        styles[severity] || styles.INFO
      }`}
    >
      {severity}
    </span>
  );
};

export const ReviewBadge: React.FC<{ status: ReviewStatus }> = ({ status }) => {
  const styles: Record<ReviewStatus, string> = {
    UNREVIEWED: 'bg-slate-800/70 text-slate-300 border-slate-600/60',
    CONFIRMED_THREAT:
      'bg-red-500/20 text-red-200 border-red-400/45 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
    FALSE_POSITIVE:
      'bg-emerald-500/20 text-emerald-200 border-emerald-400/45',
    ESCALATED:
      'bg-purple-500/20 text-purple-200 border-purple-400/45 shadow-[0_0_10px_rgba(168,85,247,0.2)]',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono rounded-md border backdrop-blur-sm ${
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
        <span className="text-slate-300">{label}</span>
        <span className="font-mono font-semibold text-white">{valueText}</span>
      </div>
      <div className="h-2 w-full bg-slate-950/80 rounded-full overflow-hidden border border-white/10 p-[1px]">
        <div
          className={`h-full rounded-full transition-all duration-300 shadow-[0_0_10px_currentColor] ${colorClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {subtitle && (
        <p className="text-[11px] text-slate-400 leading-tight">{subtitle}</p>
      )}
    </div>
  );
};
