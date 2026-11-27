import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { NetworkEventRecord, OverviewResponse } from '../types/aegis';
import { SeverityBadge, TriageBadge } from '../components/Badge';
import {
  ActivityHeatmap,
  AnimatedMetric,
  FlowHoverHud,
  ScoreRing,
} from '../components/InteractiveEffects';

interface Props {
  data: OverviewResponse | null;
  loading: boolean;
  onInspectEvent: (eventUid: string) => void;
  onNavigate: (tab: string) => void;
}

export const OverviewScreen: React.FC<Props> = ({
  data,
  loading,
  onInspectEvent,
  onNavigate,
}) => {
  const [hoveredEvent, setHoveredEvent] = useState<NetworkEventRecord | null>(
    null
  );
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [highlightedSegment, setHighlightedSegment] = useState<string | null>(
    null
  );

  if (loading && !data) {
    return (
      <div className="p-6 text-xs text-slate-400 font-mono">
        Loading telemetry...
      </div>
    );
  }

  if (!data || data.total_events === 0) {
    return (
      <div className="bg-[#0d1117] border border-white/10 rounded p-10 text-center space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">
          No Flows Analyzed Yet
        </h3>
        <button
          onClick={() => onNavigate('detection')}
          className="px-4 py-1.5 text-xs font-mono bg-white/5 text-slate-200 border border-white/15 rounded hover:bg-white/10 transition"
        >
          Open Detection Center →
        </button>
      </div>
    );
  }

  const total = Math.max(1, data.total_events);
  const benignPct = (data.benign_events / total) * 100;
  const knownPct = (data.known_attacks / total) * 100;
  const anomPct = (data.anomalous_unknown / total) * 100;
  const uncPct = (data.uncertain_events / total) * 100;

  const severities: Array<{ key: string; label: string; color: string }> = [
    { key: 'CRITICAL', label: 'Critical', color: 'bg-red-500' },
    { key: 'HIGH', label: 'High', color: 'bg-orange-500' },
    { key: 'MEDIUM', label: 'Medium', color: 'bg-amber-400' },
    { key: 'INFO', label: 'Benign', color: 'bg-emerald-500/80' },
  ];

  return (
    <div className="space-y-5">
      <FlowHoverHud event={hoveredEvent} x={cursorPos.x} y={cursorPos.y} />

      {/* 1. Minimalist Top Metric Ledger + Composition Bar */}
      <div className="bg-[#0d1117] border border-white/10 rounded overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07]">
          <div
            onMouseEnter={() => setHighlightedSegment('ALL')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('events')}
            className="p-5 interactive-ledger-cell cursor-pointer"
          >
            <div className="text-xs text-[#8b949e]">Total Flows</div>
            <div className="text-3xl font-heading font-bold text-white mt-1">
              <AnimatedMetric value={data.total_events} />
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('KNOWN_ATTACK')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('events')}
            className="p-5 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#8b949e]">
              <span>Known Threats</span>
              <span className="font-mono text-red-400">
                <AnimatedMetric value={knownPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-red-300 mt-1">
              <AnimatedMetric value={data.known_attacks} />
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('ANOMALOUS_UNKNOWN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('threat-intel')}
            className="p-5 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#8b949e]">
              <span>Anomalies</span>
              <span className="font-mono text-amber-300">
                <AnimatedMetric value={anomPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-amber-200 mt-1">
              <AnimatedMetric value={data.anomalous_unknown} />
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('UNCERTAIN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('threat-intel')}
            className="p-5 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-xs text-[#8b949e]">
              <span>Uncertain</span>
              <span className="font-mono text-sky-300">
                <AnimatedMetric value={uncPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-sky-200 mt-1">
              <AnimatedMetric value={data.uncertain_events} />
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('BENIGN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            className="p-5 interactive-ledger-cell"
          >
            <div className="flex items-center justify-between text-xs text-[#8b949e]">
              <span>Benign</span>
              <span className="font-mono text-emerald-400">
                <AnimatedMetric value={benignPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="text-3xl font-heading font-bold text-emerald-300 mt-1">
              <AnimatedMetric value={data.benign_events} />
            </div>
          </div>
        </div>

        {/* Clean Visual Traffic Composition Strip */}
        <div className="px-5 py-2.5 bg-[#090c10] border-t border-white/[0.07] flex items-center gap-4">
          <div className="h-1.5 flex-1 bg-slate-900 rounded-full overflow-hidden flex gap-[1px]">
            <div
              style={{ width: `${knownPct}%` }}
              className={`bg-red-500 h-full transition-opacity duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'KNOWN_ATTACK'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
            />
            <div
              style={{ width: `${anomPct}%` }}
              className={`bg-amber-400 h-full transition-opacity duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'ANOMALOUS_UNKNOWN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
            />
            <div
              style={{ width: `${uncPct}%` }}
              className={`bg-sky-400 h-full transition-opacity duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'UNCERTAIN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
            />
            <div
              style={{ width: `${benignPct}%` }}
              className={`bg-emerald-500/80 h-full transition-opacity duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'BENIGN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
            />
          </div>
        </div>
      </div>

      {/* 2. Visual Gauges, Heatmap & Severity Row (Minimal Text, High Visual Signal) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-[#0d1117] p-5 grid grid-cols-3 gap-3 items-center">
          <ScoreRing
            score={data.active_model ? data.active_model.macro_f1 * 100 : 100}
            label="Macro F1"
            color="#39d353"
            size={78}
          />
          <ScoreRing
            score={
              data.active_model ? data.active_model.open_set_auroc * 100 : 99.9
            }
            label="Open-Set"
            color="#d2a8ff"
            size={78}
          />
          <ScoreRing
            score={data.avg_confidence * 100}
            label="Confidence"
            color="#79c0ff"
            size={78}
          />
        </div>

        <div className="lg:col-span-4">
          <ActivityHeatmap totalEvents={data.total_events} />
        </div>

        <div className="lg:col-span-3 bg-[#0d1117] p-5 space-y-2.5 flex flex-col justify-center">
          {severities.map((sev) => {
            const count = data.severity_distribution[sev.key] || 0;
            const pct = (count / total) * 100;
            return (
              <div key={sev.key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{sev.label}</span>
                  <span className="font-mono text-slate-400">{count}</span>
                </div>
                <div className="h-1.5 w-full bg-[#07080c] rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${sev.color}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Clean 5-Column Recent Events Table (Full Details Appear on Hover HUD) */}
      <div className="bg-[#0d1117] border border-white/10 rounded">
        <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-sm font-heading font-semibold text-white">
            Recent Flows
          </h3>
          <button
            onClick={() => onNavigate('events')}
            className="text-xs text-[#79c0ff] hover:text-white inline-flex items-center gap-1 font-mono"
          >
            View All <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className="overflow-x-auto"
          onMouseLeave={() => setHoveredEvent(null)}
        >
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.07] text-[11px] text-[#8b949e] bg-[#090c10]/50">
                <th className="py-2.5 px-5">Event</th>
                <th className="py-2.5 px-4">Endpoints</th>
                <th className="py-2.5 px-4">Triage</th>
                <th className="py-2.5 px-4">Class</th>
                <th className="py-2.5 px-4">Severity</th>
                <th className="py-2.5 px-5 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {data.recent_events.slice(0, 8).map((ev) => (
                <tr
                  key={ev.event_uid}
                  onMouseEnter={(e) => {
                    setHoveredEvent(ev);
                    setCursorPos({ x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => {
                    setCursorPos({ x: e.clientX, y: e.clientY });
                  }}
                  onClick={() => {
                    setHoveredEvent(null);
                    onInspectEvent(ev.event_uid);
                  }}
                  className="cursor-pointer"
                >
                  <td className="py-3 px-5 text-[#79c0ff] font-medium">
                    {ev.event_uid}
                  </td>
                  <td className="py-3 px-4 text-slate-300">
                    {ev.src_ip} → {ev.dst_ip}:{ev.dst_port}
                  </td>
                  <td className="py-3 px-4">
                    <TriageBadge category={ev.triage_category} />
                  </td>
                  <td className="py-3 px-4 text-slate-100">
                    {ev.predicted_label}
                  </td>
                  <td className="py-3 px-4">
                    <SeverityBadge severity={ev.severity} />
                  </td>
                  <td className="py-3 px-5 text-right text-slate-200">
                    {(ev.supervised_confidence * 100).toFixed(1)}%
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
