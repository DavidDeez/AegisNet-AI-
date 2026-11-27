import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { NetworkEventRecord, OverviewResponse } from '../types/aegis';
import { ReviewBadge, SeverityBadge, TriageBadge } from '../components/Badge';
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
        [SYS] Initializing telemetry stream...
      </div>
    );
  }

  if (!data || data.total_events === 0) {
    return (
      <div className="bg-[#0d1117] border border-white/10 rounded p-10 text-center space-y-4">
        <div className="text-xs font-mono text-slate-500 uppercase tracking-widest">
          [TELEMETRY BUFFER EMPTY]
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-200">
            Zero Network Flow Records in Active Ledger
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Ingest a PCAP/CICFlowMeter CSV capture or execute a benchmark evaluation batch in the Detection Center.
          </p>
        </div>
        <button
          onClick={() => onNavigate('detection')}
          className="px-4 py-1.5 text-xs font-mono bg-white/5 text-slate-200 border border-white/15 rounded hover:bg-white/10 transition"
        >
          OPEN DETECTION CENTER →
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
    { key: 'CRITICAL', label: 'SEV-1 // CRITICAL', color: 'bg-red-500' },
    { key: 'HIGH', label: 'SEV-2 // HIGH', color: 'bg-orange-500' },
    { key: 'MEDIUM', label: 'SEV-3 // MEDIUM', color: 'bg-amber-400' },
    { key: 'LOW', label: 'SEV-4 // LOW', color: 'bg-sky-400' },
    { key: 'INFO', label: 'SEV-5 // BENIGN BASELINE', color: 'bg-emerald-500/80' },
  ];

  return (
    <div className="space-y-4">
      {/* Floating Cursor-Following Forensic HUD Popover */}
      <FlowHoverHud
        event={hoveredEvent}
        x={cursorPos.x}
        y={cursorPos.y}
      />

      {/* Unified Horizontal Telemetry Ledger with Interactive Segment Highlight */}
      <div className="bg-[#0d1117] border border-white/10 rounded overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07]">
          <div
            onMouseEnter={() => setHighlightedSegment('ALL')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('events')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tracking-wider">
              <span>01 // INGESTED FLOWS</span>
              <span className="text-slate-500">TOTAL</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-mono font-semibold text-white">
                <AnimatedMetric value={data.total_events} />
              </span>
              <span className="text-[11px] font-mono text-amber-300/90">
                <AnimatedMetric value={data.pending_triage} suffix=" queued" />
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Mean IF Percentile: p
              <AnimatedMetric value={data.avg_anomaly_percentile} decimals={1} />
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('KNOWN_ATTACK')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('events')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tracking-wider">
              <span>02 // KNOWN SIGNATURES</span>
              <span className="text-red-400 font-semibold">
                <AnimatedMetric value={knownPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-mono font-semibold text-red-300">
                <AnimatedMetric value={data.known_attacks} />
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                P̄={(data.avg_confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Calibrated closed-set RF match
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('ANOMALOUS_UNKNOWN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('threat-intel')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tracking-wider">
              <span>03 // OPEN-SET ANOMALIES</span>
              <span className="text-amber-300 font-semibold">
                <AnimatedMetric value={anomPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-mono font-semibold text-amber-200">
                <AnimatedMetric value={data.anomalous_unknown} />
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                IF ≥ p95.0
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Unseen structural deviation (non-prob)
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('UNCERTAIN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            onClick={() => onNavigate('threat-intel')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tracking-wider">
              <span>04 // HIGH-ENTROPY QUEUE</span>
              <span className="text-sky-300 font-semibold">
                <AnimatedMetric value={uncPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-mono font-semibold text-sky-200">
                <AnimatedMetric value={data.uncertain_events} />
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                H̄={data.avg_entropy.toFixed(3)}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Normalized Shannon entropy H(p)/ln(K)
            </div>
          </div>

          <div
            onMouseEnter={() => setHighlightedSegment('BENIGN')}
            onMouseLeave={() => setHighlightedSegment(null)}
            className="p-4 space-y-1 interactive-ledger-cell"
          >
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tracking-wider">
              <span>05 // BASELINE BENIGN</span>
              <span className="text-emerald-400 font-semibold">
                <AnimatedMetric value={benignPct} decimals={1} suffix="%" />
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-mono font-semibold text-emerald-300">
                <AnimatedMetric value={data.benign_events} />
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                NOMINAL
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Within training benign distribution
            </div>
          </div>
        </div>

        {/* Interactive Proportional Traffic Composition Strip */}
        <div className="px-4 py-2 bg-[#090c10] border-t border-white/[0.07] flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            COMPOSITION
          </span>
          <div className="h-2 flex-1 bg-slate-900 rounded-[1px] overflow-hidden flex gap-[1px]">
            <div
              style={{ width: `${knownPct}%` }}
              className={`bg-red-500 h-full transition-all duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'KNOWN_ATTACK'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
              title={`Known Attacks: ${knownPct.toFixed(1)}%`}
            />
            <div
              style={{ width: `${anomPct}%` }}
              className={`bg-amber-400 h-full transition-all duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'ANOMALOUS_UNKNOWN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
              title={`Open-Set Anomalies: ${anomPct.toFixed(1)}%`}
            />
            <div
              style={{ width: `${uncPct}%` }}
              className={`bg-sky-400 h-full transition-all duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'UNCERTAIN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
              title={`High Entropy / Uncertain: ${uncPct.toFixed(1)}%`}
            />
            <div
              style={{ width: `${benignPct}%` }}
              className={`bg-emerald-500/80 h-full transition-all duration-300 ${
                highlightedSegment &&
                highlightedSegment !== 'ALL' &&
                highlightedSegment !== 'BENIGN'
                  ? 'opacity-25'
                  : 'opacity-100'
              }`}
              title={`Benign Baseline: ${benignPct.toFixed(1)}%`}
            />
          </div>
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono text-slate-400 shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-500 inline-block" /> KNOWN
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-amber-400 inline-block" /> ANOMALY
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-sky-400 inline-block" /> UNCERTAIN
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 inline-block" /> BENIGN
            </span>
          </div>
        </div>
      </div>

      {/* Middle Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Classification & Open-Set Triage Ledger (8 cols) */}
        <div className="lg:col-span-8 bg-[#0d1117] border border-white/10 rounded flex flex-col justify-between">
          <div>
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                  CLASSIFICATION & TRIAGE LEDGER
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  [HOVER TO HIGHLIGHT // CLICK TO FILTER]
                </span>
              </div>
              <button
                onClick={() => onNavigate('threat-intel')}
                className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1 font-mono"
              >
                DECISION PLANE <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                    <th className="py-2 px-4">CLASSIFICATION</th>
                    <th className="py-2 px-3">TRIAGE STATE</th>
                    <th className="py-2 px-3 text-right">COUNT</th>
                    <th className="py-2 px-3 text-right">RATIO</th>
                    <th className="py-2 px-3 text-right">MEAN P(y|x)</th>
                    <th className="py-2 px-3 text-right">MEAN ENTROPY</th>
                    <th className="py-2 px-4 text-right">IF PERCENTILE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {data.attack_class_breakdown.map((row, idx) => (
                    <tr
                      key={idx}
                      onMouseEnter={() =>
                        setHighlightedSegment(row.triage_category)
                      }
                      onMouseLeave={() => setHighlightedSegment(null)}
                      onClick={() => onNavigate('events')}
                      className="cursor-pointer"
                    >
                      <td className="py-2 px-4 font-medium text-slate-100">
                        {row.predicted_label}
                      </td>
                      <td className="py-2 px-3">
                        <TriageBadge category={row.triage_category} />
                      </td>
                      <td className="py-2 px-3 text-right text-slate-200">
                        {row.count}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-400">
                        {((row.count / total) * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-200">
                        {(row.mean_confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {row.mean_entropy.toFixed(3)}
                      </td>
                      <td className="py-2 px-4 text-right text-amber-300/90">
                        p{row.mean_anomaly_pct.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-4 py-2 bg-[#090c10]/60 border-t border-white/[0.07] flex items-center justify-between text-[10px] font-mono text-slate-500">
            <span>
              SUPERVISED: CALIBRATED RANDOM FOREST (PLATT SIGMOID, 3-FOLD CV)
            </span>
            <span>OPEN-SET: ISOLATION FOREST (BENIGN REFERENCE QUANTILES)</span>
          </div>
        </div>

        {/* Right Column: Severity Breakdown & Engine Benchmark Metrics (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#0d1117] interactive-tilt border border-white/10 rounded">
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                SEVERITY ALLOCATION
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                [N={data.total_events}]
              </span>
            </div>
            <div className="p-4 space-y-2.5">
              {severities.map((sev) => {
                const count = data.severity_distribution[sev.key] || 0;
                const pct = (count / total) * 100;
                return (
                  <div key={sev.key} className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-300">{sev.label}</span>
                      <span className="text-slate-400">
                        {count}{' '}
                        <span className="text-slate-500">
                          ({pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#07080c] rounded-[1px] overflow-hidden border border-white/[0.06]">
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

          <div className="bg-[#0d1117] interactive-tilt border border-white/10 rounded">
            <div className="px-4 py-2.5 border-b border-white/[0.07] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                MODEL & CALIBRATION TELEMETRY
              </span>
              <button
                onClick={() => onNavigate('model-lab')}
                className="text-[10px] font-mono text-slate-400 hover:text-white"
              >
                LAB →
              </button>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.07] text-xs font-mono">
              <div className="p-3 interactive-ledger-cell">
                <div className="text-slate-500 text-[10px]">CLOSED-SET F1</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {data.active_model
                    ? (data.active_model.macro_f1 * 100).toFixed(2) + '%'
                    : '—'}
                </div>
              </div>
              <div className="p-3 interactive-ledger-cell">
                <div className="text-slate-500 text-[10px]">OPEN-SET AUROC</div>
                <div className="text-amber-200 font-semibold mt-0.5">
                  {data.active_model
                    ? data.active_model.open_set_auroc.toFixed(4)
                    : '—'}
                </div>
              </div>
              <div className="p-3 interactive-ledger-cell">
                <div className="text-slate-500 text-[10px]">CALIBRATION ECE</div>
                <div className="text-slate-200 mt-0.5">
                  {data.active_model
                    ? data.active_model.expected_calibration_error.toFixed(4)
                    : '—'}
                </div>
              </div>
              <div className="p-3 interactive-ledger-cell">
                <div className="text-slate-500 text-[10px]">MAX DRIFT PSI</div>
                <div className="text-slate-200 mt-0.5">
                  {data.system_health.max_drift_psi.toFixed(4)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GradeGuide ScoreRing Circular Gauges + 90-Day Telemetry Activity Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-[#0d1117] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <ScoreRing
            score={
              data.active_model ? data.active_model.macro_f1 * 100 : 100
            }
            label="Closed-Set Macro F1"
            sublabel="Calibrated Random Forest"
            color="#39d353"
          />
          <ScoreRing
            score={
              data.active_model ? data.active_model.open_set_auroc * 100 : 99.9
            }
            label="Open-Set AUROC"
            sublabel="Held-Out Unseen Families"
            color="#d2a8ff"
          />
          <ScoreRing
            score={data.avg_confidence * 100}
            label="Mean Confidence"
            sublabel={`Entropy H̄=${data.avg_entropy.toFixed(3)}`}
            color="#79c0ff"
          />
        </div>
        <div className="lg:col-span-5">
          <ActivityHeatmap totalEvents={data.total_events} />
        </div>
      </div>

      {/* Bottom: Live Flow Inspection Stream with Hover HUD Reticle */}
      <div className="bg-[#0d1117] border border-white/10 rounded">
        <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
              RECENT FLOW TELEMETRY LEDGER
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              [HOVER ROW FOR LIVE HUD TELEMETRY // CLICK FOR FULL FORENSIC VIEW]
            </span>
          </div>
          <button
            onClick={() => onNavigate('events')}
            className="text-[11px] text-slate-300 hover:text-white inline-flex items-center gap-1 font-mono"
          >
            FULL EXPLORER <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>

        <div
          className="overflow-x-auto"
          onMouseLeave={() => setHoveredEvent(null)}
        >
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                <th className="py-2 px-4">EVENT UID</th>
                <th className="py-2 px-3">SRC_ENDPOINT → DST_ENDPOINT</th>
                <th className="py-2 px-3">TRIAGE STATE</th>
                <th className="py-2 px-3">CLASSIFICATION</th>
                <th className="py-2 px-3">SEV</th>
                <th className="py-2 px-3 text-right">P(y|x)</th>
                <th className="py-2 px-3 text-right">ENTROPY</th>
                <th className="py-2 px-3 text-right">IF_SCORE (PCTL)</th>
                <th className="py-2 px-4">DISPOSITION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {data.recent_events.map((ev) => (
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
                  <td className="py-2 px-4 text-slate-200 font-medium">
                    {ev.event_uid}
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {ev.src_ip}:{ev.src_port} → {ev.dst_ip}:{ev.dst_port}{' '}
                    <span className="text-slate-500">[{ev.protocol}]</span>
                  </td>
                  <td className="py-2 px-3">
                    <TriageBadge category={ev.triage_category} />
                  </td>
                  <td className="py-2 px-3 text-slate-100">
                    {ev.predicted_label}
                  </td>
                  <td className="py-2 px-3">
                    <SeverityBadge severity={ev.severity} />
                  </td>
                  <td className="py-2 px-3 text-right text-slate-200">
                    {(ev.supervised_confidence * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {ev.predictive_entropy.toFixed(3)}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-300/90">
                    {ev.anomaly_score.toFixed(3)} (p
                    {ev.anomaly_percentile.toFixed(1)})
                  </td>
                  <td className="py-2 px-4">
                    <ReviewBadge status={ev.review_status} />
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
