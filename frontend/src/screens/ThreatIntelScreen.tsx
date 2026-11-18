import React from 'react';
import { Shield, Info, Crosshair, Network } from 'lucide-react';
import type { ThreatIntelResponse } from '../types/aegis';
import { TriageBadge } from '../components/Badge';

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
  if (loading && !data) {
    return (
      <div className="p-8 text-sm text-slate-400 font-mono">
        Loading threat intelligence aggregations...
      </div>
    );
  }

  if (!data || data.total_analyzed === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-10 text-center space-y-2">
        <Shield className="w-8 h-8 text-slate-500 mx-auto" />
        <div className="text-sm font-semibold text-slate-200">
          No Threat Intelligence Events Recorded
        </div>
        <p className="text-xs text-slate-400">
          Analyze a network flow capture in the Detection Center to populate threat intelligence distributions.
        </p>
      </div>
    );
  }

  const openSet = data.open_set_evaluation || {};
  const perFamily: Array<any> = openSet.per_family_detection || [];

  return (
    <div className="space-y-6">
      {/* Scientific Rigor & Taxonomy Banner */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-200">
              Scientific Distinction: Known Attack Probability vs. Anomaly Score vs. Predictive Uncertainty
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              AegisNet strictly separates closed-set supervised probabilities from unsupervised anomaly scores.
              An Isolation Forest anomaly score quantifies structural deviation from training benign traffic and is{' '}
              <span className="text-slate-200 font-medium">
                never treated as a calibrated probability of maliciousness or a guaranteed zero-day confirmation
              </span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {Object.entries(data.taxonomy_definitions).map(([key, desc]) => (
            <div
              key={key}
              className="p-3 rounded bg-[#161b22]/90 border border-[#21262d] space-y-1.5"
            >
              <TriageBadge category={key as any} />
              <p className="text-[11px] text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Uncertainty vs Anomaly Plane (Interactive 2D Quadrant Inspection) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Risk & Uncertainty Decision Plane (Anomaly Percentile vs. Shannon Entropy)
              </h3>
              <p className="text-xs text-slate-400">
                X-Axis: Isolation Forest Anomaly Percentile (0–100) | Y-Axis: Predictive Entropy H(p)/ln(K) (0–1). Click any point to inspect flow.
              </p>
            </div>
          </div>

          <div className="relative h-72 w-full bg-[#090c10] border border-[#21262d] rounded overflow-hidden p-4">
            {/* Threshold guide lines */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-amber-500/40 pointer-events-none"
              style={{ bottom: '55%' }}
            >
              <span className="text-[10px] font-mono text-amber-400/80 pl-2">
                Entropy Ceiling (0.55)
              </span>
            </div>
            <div
              className="absolute top-0 bottom-0 border-l border-dashed border-purple-500/40 pointer-events-none"
              style={{ left: '95%' }}
            >
              <span className="text-[10px] font-mono text-purple-400/80 -ml-16 mt-1 inline-block">
                p95 Anomaly
              </span>
            </div>

            {/* Scatter Points */}
            {data.uncertainty_vs_anomaly_points.map((pt) => {
              const xPct = Math.max(2, Math.min(98, pt.anomaly_percentile));
              const yPct = Math.max(4, Math.min(96, pt.predictive_entropy * 100));
              const colorMap: Record<string, string> = {
                KNOWN_ATTACK: 'bg-red-500 border-red-300',
                ANOMALOUS_UNKNOWN: 'bg-purple-500 border-purple-300',
                UNCERTAIN: 'bg-amber-400 border-amber-200',
                BENIGN: 'bg-emerald-500/60 border-emerald-300/60',
              };
              return (
                <button
                  key={pt.event_uid}
                  onClick={() => onInspectEvent(pt.event_uid)}
                  title={`${pt.event_uid} | ${pt.triage_category} (${pt.predicted_label})\nConfidence: ${(pt.supervised_confidence * 100).toFixed(1)}% | Entropy: ${pt.predictive_entropy.toFixed(3)} | Anomaly: p${pt.anomaly_percentile.toFixed(1)}`}
                  style={{ left: `${xPct}%`, bottom: `${yPct}%` }}
                  className={`absolute w-2.5 h-2.5 -ml-1.25 -mb-1.25 rounded-full border transition-transform hover:scale-150 ${
                    colorMap[pt.triage_category] || 'bg-sky-400'
                  }`}
                />
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-mono text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Known Attack
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" /> Anomalous / Unknown
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Uncertain
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Benign
            </span>
          </div>
        </div>

        {/* Held-Out Unseen Attack Family Benchmark Summary */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Held-Out Attack-Family Evaluation
            </h3>
            <Crosshair className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Attack families <span className="font-mono text-purple-300">{data.held_out_families.join(', ')}</span> were excluded from supervised training to measure open-set anomaly detection on unseen attack behaviors.
          </p>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 bg-[#161b22] border border-[#21262d] rounded">
              <div className="text-slate-400 text-[10px]">OPEN-SET AUROC</div>
              <div className="text-lg font-semibold text-purple-300 mt-0.5">
                {openSet.auroc !== undefined ? openSet.auroc.toFixed(4) : 'N/A'}
              </div>
            </div>
            <div className="p-3 bg-[#161b22] border border-[#21262d] rounded">
              <div className="text-slate-400 text-[10px]">OPEN-SET AUPRC</div>
              <div className="text-lg font-semibold text-sky-300 mt-0.5">
                {openSet.auprc !== undefined ? openSet.auprc.toFixed(4) : 'N/A'}
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-xs font-mono text-slate-400">
              HELD-OUT FAMILY DETECTION BREAKDOWN
            </div>
            {perFamily.map((fam: any) => (
              <div
                key={fam.attack_family}
                className="p-3 rounded bg-[#161b22]/70 border border-[#21262d] space-y-1 text-xs font-mono"
              >
                <div className="flex justify-between">
                  <span className="text-slate-200 font-semibold">
                    {fam.attack_family} (Unseen)
                  </span>
                  <span className="text-purple-300">
                    Recall: {(fam.detection_recall * 100).toFixed(1)}% ({fam.detected_count}/{fam.support})
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>Mean IF Score: {fam.mean_anomaly_score.toFixed(3)}</span>
                  <span>Mean Entropy: {fam.mean_predictive_entropy.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Targeted Destination Ports & Suspicious Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Targeted Destination Ports (Non-Benign Traffic)
            </h3>
            <Network className="w-4 h-4 text-sky-400" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400">
                  <th className="py-2 pr-3">DST PORT</th>
                  <th className="py-2 px-3">PROTO</th>
                  <th className="py-2 px-3">TRIAGE CATEGORY</th>
                  <th className="py-2 px-3 text-right">EVENTS</th>
                  <th className="py-2 pl-3 text-right">MEAN ANOMALY PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {data.targeted_ports.map((p, i) => (
                  <tr key={i} className="hover:bg-[#161b22]/60">
                    <td className="py-2 pr-3 text-sky-300">{p.dst_port}</td>
                    <td className="py-2 px-3 text-slate-400">{p.protocol}</td>
                    <td className="py-2 px-3">
                      <TriageBadge category={p.triage_category} />
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {p.count}
                    </td>
                    <td className="py-2 pl-3 text-right text-purple-300">
                      p{p.avg_anomaly_pct.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">
            Top Suspicious Source Endpoints (Flow Context)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400">
                  <th className="py-2 pr-3">SOURCE IP</th>
                  <th className="py-2 px-3 text-right">TOTAL ALERTS</th>
                  <th className="py-2 px-3 text-right">KNOWN ATTACKS</th>
                  <th className="py-2 px-3 text-right">ANOMALIES</th>
                  <th className="py-2 pl-3 text-right">MAX ANOMALY PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {data.suspicious_sources.map((s, i) => (
                  <tr key={i} className="hover:bg-[#161b22]/60">
                    <td className="py-2 pr-3 text-slate-200">{s.src_ip}</td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {s.event_count}
                    </td>
                    <td className="py-2 px-3 text-right text-red-300">
                      {s.known_attack_count}
                    </td>
                    <td className="py-2 px-3 text-right text-purple-300">
                      {s.anomaly_count}
                    </td>
                    <td className="py-2 pl-3 text-right text-purple-300">
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
