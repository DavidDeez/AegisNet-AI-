import React, { useRef, useState } from 'react';
import type { ThreatIntelResponse } from '../types/aegis';
import { SeverityBadge, TriageBadge } from '../components/Badge';

interface Props {
  data: ThreatIntelResponse | null;
  loading: boolean;
  onInspectEvent: (eventUid: string) => void;
}

export const ThreatIntelScreen: React.FC<Props> = ({
  data,
  loading,
  onInspectEvent,
}) => {
  const [showSpec, setShowSpec] = useState(false);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const [crosshair, setCrosshair] = useState<{
    visible: boolean;
    xPct: number;
    yPct: number;
  }>({ visible: false, xPct: 50, yPct: 50 });
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  if (loading && !data) {
    return (
      <div className="p-6 text-xs text-slate-400 font-mono">
        [SYS] Aggregating threat telemetry...
      </div>
    );
  }

  if (!data || data.total_analyzed === 0) {
    return (
      <div className="bg-[#0d1117] border border-white/10 rounded p-10 text-center space-y-2">
        <div className="text-xs font-mono text-slate-500">
          [NO_THREAT_TELEMETRY]
        </div>
        <p className="text-xs text-slate-400">
          Ingest a flow dataset in the Detection Center to populate decision-plane distributions.
        </p>
      </div>
    );
  }

  const openSet = data.open_set_evaluation || {};
  const perFamily: Array<any> = openSet.per_family_detection || [];

  const handlePlaneMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!planeRef.current) return;
    const rect = planeRef.current.getBoundingClientRect();
    const xPct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)
    );
    const yPct = Math.max(
      0,
      Math.min(100, (1 - (e.clientY - rect.top) / rect.height) * 100)
    );
    setCrosshair({ visible: true, xPct, yPct });
  };

  const getQuadrantName = (xPct: number, yPct: number) => {
    const entropy = yPct / 100;
    if (xPct >= 95 && entropy >= 0.55) return 'OPEN_SET_HIGH_ENTROPY_OUTLIER';
    if (xPct >= 95) return 'STRUCTURAL_IF_ANOMALY_ZONE';
    if (entropy >= 0.55) return 'AMBIGUOUS_DECISION_BOUNDARY';
    return 'CLOSED_SET_SUPERVISED_REGIME';
  };

  return (
    <div className="space-y-4">
      {/* Compact Console Header Bar with Collapsible Taxonomy Specification */}
      <div className="bg-[#0d1117] border border-white/10 rounded px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="text-slate-200 font-semibold">
            OPEN-SET THREAT & UNCERTAINTY TELEMETRY
          </span>
          <span className="text-[10px] text-slate-500">
            [N={data.total_analyzed} FLOWS // HELD_OUT:{' '}
            {data.held_out_families.join(', ')}]
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowSpec((prev) => !prev)}
          className="px-2.5 py-1 text-[10px] rounded-[2px] bg-[#090c10] border border-white/10 text-slate-300 hover:text-white"
        >
          {showSpec ? '[- HIDE TAXONOMY SPEC]' : '[? TAXONOMY & SCORE SPEC]'}
        </button>
      </div>

      {showSpec && (
        <div className="bg-[#0d1117] border border-white/10 rounded p-4 space-y-3">
          <div className="text-[11px] font-mono text-slate-400">
            NOTE: Closed-set calibrated probabilities P(y|x), Shannon entropy H(p)/ln(K), and Isolation Forest anomaly percentiles are strictly separated. Anomaly scores measure structural deviation from training benign flows and are never treated as calibrated probabilities of maliciousness.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(data.taxonomy_definitions).map(([key, desc]) => (
              <div
                key={key}
                className="p-3 rounded-[3px] bg-[#090c10] border border-white/[0.07] space-y-1.5"
              >
                <TriageBadge category={key as any} />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2D Risk & Uncertainty Decision Plane with JavaScript Laser Crosshair Reticle */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-[#0d1117] border border-white/10 rounded flex flex-col justify-between">
          <div className="px-4 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="text-xs font-semibold text-slate-200">
              DECISION PLANE // IF_ANOMALY_PERCENTILE (X) VS. SHANNON_ENTROPY (Y)
            </span>
            {crosshair.visible ? (
              <span className="text-[10px] text-slate-300 bg-[#090c10] px-2 py-0.5 rounded-[2px] border border-white/10">
                RETICLE // IF: p{crosshair.xPct.toFixed(1)} | H(p):{' '}
                {(crosshair.yPct / 100).toFixed(3)} |{' '}
                {getQuadrantName(crosshair.xPct, crosshair.yPct)}
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">
                [MOVE CURSOR OVER PLANE FOR LIVE RETICLE]
              </span>
            )}
          </div>

          <div className="p-4">
            <div
              ref={planeRef}
              onMouseMove={handlePlaneMouseMove}
              onMouseLeave={() => {
                setCrosshair((prev) => ({ ...prev, visible: false }));
                setHoveredPoint(null);
              }}
              className="relative h-72 w-full bg-[#07080c] border border-white/10 rounded-[2px] overflow-hidden cursor-crosshair select-none"
            >
              {/* Dynamic JavaScript Laser Crosshairs */}
              {crosshair.visible && (
                <>
                  <div
                    className="absolute top-0 bottom-0 border-l border-white/20 pointer-events-none"
                    style={{ left: `${crosshair.xPct}%` }}
                  />
                  <div
                    className="absolute left-0 right-0 border-t border-white/20 pointer-events-none"
                    style={{ bottom: `${crosshair.yPct}%` }}
                  />
                </>
              )}

              {/* Threshold hairlines */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-sky-400/35 pointer-events-none"
                style={{ bottom: '55%' }}
              >
                <span className="text-[10px] font-mono text-sky-300/80 pl-2">
                  τ_H = 0.55 (Entropy Ceiling)
                </span>
              </div>
              <div
                className="absolute top-0 bottom-0 border-l border-dashed border-amber-400/35 pointer-events-none"
                style={{ left: '95%' }}
              >
                <span className="text-[10px] font-mono text-amber-300/80 -ml-14 mt-1 inline-block">
                  τ_IF = p95.0
                </span>
              </div>

              {/* Scatter Points */}
              {data.uncertainty_vs_anomaly_points.map((pt) => {
                const xPct = Math.max(1.5, Math.min(98.5, pt.anomaly_percentile));
                const yPct = Math.max(
                  3,
                  Math.min(97, pt.predictive_entropy * 100)
                );
                const isHovered = hoveredPoint?.event_uid === pt.event_uid;
                const colorMap: Record<string, string> = {
                  KNOWN_ATTACK: 'bg-red-500 border-red-200',
                  ANOMALOUS_UNKNOWN: 'bg-amber-400 border-amber-100',
                  UNCERTAIN: 'bg-sky-400 border-sky-100',
                  BENIGN: 'bg-emerald-500/65 border-emerald-200/60',
                };
                return (
                  <button
                    key={pt.event_uid}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onClick={() => onInspectEvent(pt.event_uid)}
                    style={{ left: `${xPct}%`, bottom: `${yPct}%` }}
                    className={`absolute w-2.5 h-2.5 -ml-1.25 -mb-1.25 rounded-[1px] border transition-transform ${
                      isHovered
                        ? 'scale-[2.2] z-20 ring-2 ring-white'
                        : 'hover:scale-150 z-10'
                    } ${colorMap[pt.triage_category] || 'bg-slate-400'}`}
                  />
                );
              })}

              {/* Floating Hovered Node Telemetry HUD Inside Decision Plane */}
              {hoveredPoint && (
                <div className="absolute top-3 left-3 z-30 glass-modal rounded-[3px] p-3 text-[11px] font-mono space-y-1.5 pointer-events-none w-72">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="text-white font-semibold">
                      {hoveredPoint.event_uid}
                    </span>
                    <SeverityBadge severity={hoveredPoint.severity} />
                  </div>
                  <div className="flex items-center justify-between">
                    <TriageBadge category={hoveredPoint.triage_category} />
                    <span className="text-slate-300">
                      PORT: {hoveredPoint.dst_port}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] border-t border-white/10">
                    <div>
                      <span className="text-slate-500 block">P(y|x)</span>
                      <span className="text-slate-100">
                        {(hoveredPoint.supervised_confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">ENTROPY</span>
                      <span className="text-sky-300">
                        {hoveredPoint.predictive_entropy.toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">IF_PCTL</span>
                      <span className="text-amber-300">
                        p{hoveredPoint.anomaly_percentile.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-4 py-2 bg-[#090c10]/60 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-4 text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 inline-block" /> KNOWN_ATTACK
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 bg-amber-400 inline-block" />{' '}
                OPEN_SET_ANOMALY
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 bg-sky-400 inline-block" /> HIGH_ENTROPY
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 bg-emerald-500 inline-block" /> BENIGN
              </span>
            </div>
            <span className="text-slate-500">
              SAMPLE: LATEST {data.uncertainty_vs_anomaly_points.length} FLOWS
            </span>
          </div>
        </div>

        {/* Held-Out Attack-Family Open-Set Benchmark (4 cols) */}
        <div className="lg:col-span-4 bg-[#0d1117] interactive-tilt border border-white/10 rounded flex flex-col justify-between">
          <div>
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between font-mono">
              <span className="text-xs font-semibold text-slate-200">
                OPEN-SET HOLDOUT EVALUATION
              </span>
              <span className="text-[10px] text-slate-500">[UNSEEN CLASSES]</span>
            </div>

            <div className="grid grid-cols-2 divide-x divide-b divide-white/[0.07] font-mono text-xs">
              <div className="p-3 interactive-ledger-cell">
                <div className="text-[10px] text-slate-500">OPEN-SET AUROC</div>
                <div className="text-lg font-semibold text-amber-200 mt-0.5">
                  {openSet.auroc !== undefined
                    ? openSet.auroc.toFixed(4)
                    : '—'}
                </div>
              </div>
              <div className="p-3 interactive-ledger-cell">
                <div className="text-[10px] text-slate-500">OPEN-SET AUPRC</div>
                <div className="text-lg font-semibold text-slate-100 mt-0.5">
                  {openSet.auprc !== undefined
                    ? openSet.auprc.toFixed(4)
                    : '—'}
                </div>
              </div>
            </div>

            <div className="p-4 space-y-2.5">
              <div className="text-[10px] font-mono text-slate-400">
                EXCLUDED TRAINING FAMILIES: {data.held_out_families.join(', ')}
              </div>
              {perFamily.map((fam: any) => (
                <div
                  key={fam.attack_family}
                  className="p-3 rounded-[2px] bg-[#090c10] border border-white/[0.07] space-y-1 text-xs font-mono"
                >
                  <div className="flex justify-between">
                    <span className="text-slate-100 font-semibold">
                      {fam.attack_family}
                    </span>
                    <span className="text-amber-300">
                      RECALL: {(fam.detection_recall * 100).toFixed(1)}% (
                      {fam.detected_count}/{fam.support})
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>MEAN_IF: {fam.mean_anomaly_score.toFixed(3)}</span>
                    <span>
                      MEAN_ENTROPY: {fam.mean_predictive_entropy.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-2 bg-[#090c10]/60 border-t border-white/[0.07] text-[10px] font-mono text-slate-500">
            THRESHOLD: 95TH PERCENTILE TRAINING BENIGN BASELINE
          </div>
        </div>
      </div>

      {/* Targeted Destination Ports & Suspicious Source Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#0d1117] border border-white/10 rounded">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between font-mono">
            <span className="text-xs font-semibold text-slate-200">
              TARGET_PORT_DISTRIBUTION (NON-BENIGN)
            </span>
            <span className="text-[10px] text-slate-500">[TOP 15]</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                  <th className="py-2 px-4">DST_PORT</th>
                  <th className="py-2 px-3">PROTO</th>
                  <th className="py-2 px-3">TRIAGE STATE</th>
                  <th className="py-2 px-3 text-right">FLOWS</th>
                  <th className="py-2 px-4 text-right">MEAN IF PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.targeted_ports.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 px-4 text-slate-100">{p.dst_port}</td>
                    <td className="py-2 px-3 text-slate-400">{p.protocol}</td>
                    <td className="py-2 px-3">
                      <TriageBadge category={p.triage_category} />
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {p.count}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300/90">
                      p{p.avg_anomaly_pct.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0d1117] border border-white/10 rounded">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between font-mono">
            <span className="text-xs font-semibold text-slate-200">
              SOURCE_ENDPOINT_AGGREGATION (NON-BENIGN)
            </span>
            <span className="text-[10px] text-slate-500">[FLOW CONTEXT]</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                  <th className="py-2 px-4">SRC_IP</th>
                  <th className="py-2 px-3 text-right">ALERTS</th>
                  <th className="py-2 px-3 text-right">KNOWN_SIG</th>
                  <th className="py-2 px-3 text-right">ANOMALIES</th>
                  <th className="py-2 px-4 text-right">PEAK IF PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.suspicious_sources.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 px-4 text-slate-200">{s.src_ip}</td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {s.event_count}
                    </td>
                    <td className="py-2 px-3 text-right text-red-300">
                      {s.known_attack_count}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300">
                      {s.anomaly_count}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-300/90">
                      p{s.max_anomaly_pct.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
