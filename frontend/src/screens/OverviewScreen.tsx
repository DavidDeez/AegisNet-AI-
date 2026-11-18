import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Layers,
  Radar,
  ShieldAlert,
  ArrowUpRight,
} from 'lucide-react';
import type { OverviewResponse } from '../types/aegis';
import { ReviewBadge, SeverityBadge, TriageBadge } from '../components/Badge';

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
  if (loading && !data) {
    return (
      <div className="p-8 text-sm text-slate-400 font-mono">
        Loading operational telemetry from backend...
      </div>
    );
  }

  if (!data || data.total_events === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-10 text-center space-y-4">
        <Radar className="w-10 h-10 text-slate-500 mx-auto" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-slate-200">
            No Network Flows Analyzed Yet
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            AegisNet never displays fabricated threat metrics. Upload a CSV flow
            capture or run a reproducible CIC-IDS2017 benchmark evaluation slice
            in the Detection Center to populate operational telemetry.
          </p>
        </div>
        <button
          onClick={() => onNavigate('detection')}
          className="px-4 py-2 text-xs font-medium bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded hover:bg-sky-500/30 transition"
        >
          Open Detection Center
        </button>
      </div>
    );
  }

  const total = Math.max(1, data.total_events);
  const severities: Array<{ key: string; label: string; color: string }> = [
    { key: 'CRITICAL', label: 'Critical', color: 'bg-red-500' },
    { key: 'HIGH', label: 'High', color: 'bg-orange-500' },
    { key: 'MEDIUM', label: 'Medium', color: 'bg-amber-500' },
    { key: 'LOW', label: 'Low', color: 'bg-sky-500' },
    { key: 'INFO', label: 'Info (Benign)', color: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ANALYZED FLOWS</span>
            <Layers className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-slate-100">
            {data.total_events.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Pending Analyst Triage: {data.pending_triage}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>KNOWN ATTACKS</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-red-300">
            {data.known_attacks.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {((data.known_attacks / total) * 100).toFixed(1)}% of traffic | Mean Conf:{' '}
            {(data.avg_confidence * 100).toFixed(1)}%
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>ANOMALOUS / UNKNOWN</span>
            <AlertTriangle className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-purple-300">
            {data.anomalous_unknown.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Isolation Forest Outlier (Not Calibrated Prob)
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>UNCERTAIN EVENTS</span>
            <HelpCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-amber-300">
            {data.uncertain_events.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Mean Shannon Entropy: {data.avg_entropy.toFixed(3)}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>VERIFIED BENIGN</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-mono font-semibold text-emerald-300">
            {data.benign_events.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {((data.benign_events / total) * 100).toFixed(1)}% normal baseline
          </div>
        </div>
      </div>

      {/* Middle Analytical Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Triage & Classification Breakdown */}
        <div className="lg:col-span-2 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Classification & Open-Set Triage Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Separates calibrated supervised classifications from Isolation Forest structural anomalies and high-entropy uncertain flows
              </p>
            </div>
            <button
              onClick={() => onNavigate('threat-intel')}
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
            >
              Threat Intel <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400 font-mono">
                  <th className="py-2 pr-3">PREDICTED LABEL</th>
                  <th className="py-2 px-3">TRIAGE TAXONOMY</th>
                  <th className="py-2 px-3 text-right">FLOWS</th>
                  <th className="py-2 px-3 text-right">SHARE</th>
                  <th className="py-2 px-3 text-right">MEAN CONFIDENCE</th>
                  <th className="py-2 px-3 text-right">MEAN ENTROPY</th>
                  <th className="py-2 pl-3 text-right">ANOMALY PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {data.attack_class_breakdown.map((row, idx) => (
                  <tr key={idx} className="hover:bg-[#161b22]/60">
                    <td className="py-2.5 pr-3 font-mono font-medium text-slate-200">
                      {row.predicted_label}
                    </td>
                    <td className="py-2.5 px-3">
                      <TriageBadge category={row.triage_category} />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                      {row.count}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                      {((row.count / total) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sky-300">
                      {(row.mean_confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                      {row.mean_entropy.toFixed(3)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono text-purple-300">
                      p{row.mean_anomaly_pct.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Severity Distribution & System Health */}
        <div className="space-y-6">
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">
              Severity Distribution
            </h3>
            <div className="space-y-3">
              {severities.map((sev) => {
                const count = data.severity_distribution[sev.key] || 0;
                const pct = (count / total) * 100;
                return (
                  <div key={sev.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-mono">{sev.label}</span>
                      <span className="text-slate-400 font-mono">
                        {count} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-[#161b22] rounded overflow-hidden">
                      <div
                        className={`h-full ${sev.color}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Inference & Model Status
              </h3>
              <Cpu className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-slate-400 text-[10px]">ACTIVE MODEL</div>
                <div className="text-slate-200 truncate mt-0.5">
                  {data.system_health.active_model_version}
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-slate-400 text-[10px]">P95 LATENCY</div>
                <div className="text-emerald-300 mt-0.5">
                  {data.system_health.p95_latency_ms.toFixed(1)} ms
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-slate-400 text-[10px]">CLOSED-SET F1</div>
                <div className="text-sky-300 mt-0.5">
                  {data.active_model
                    ? (data.active_model.macro_f1 * 100).toFixed(2) + '%'
                    : 'N/A'}
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-slate-400 text-[10px]">OPEN-SET AUROC</div>
                <div className="text-purple-300 mt-0.5">
                  {data.active_model
                    ? data.active_model.open_set_auroc.toFixed(4)
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Analyzed Network Events */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Recent Analyzed Network Flow Events
            </h3>
            <p className="text-xs text-slate-400">
              Click any flow record to inspect full feature values, uncertainty breakdown, and TreeSHAP attributions
            </p>
          </div>
          <button
            onClick={() => onNavigate('events')}
            className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-mono"
          >
            Open Event Explorer <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#21262d] text-slate-400 font-mono">
                <th className="py-2 pr-3">EVENT UID</th>
                <th className="py-2 px-3">SOURCE → DESTINATION</th>
                <th className="py-2 px-3">TRIAGE CATEGORY</th>
                <th className="py-2 px-3">PREDICTED CLASS</th>
                <th className="py-2 px-3">SEVERITY</th>
                <th className="py-2 px-3 text-right">CONFIDENCE</th>
                <th className="py-2 px-3 text-right">ENTROPY</th>
                <th className="py-2 px-3 text-right">ANOMALY SCORE</th>
                <th className="py-2 pl-3">REVIEW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#161b22]">
              {data.recent_events.map((ev) => (
                <tr
                  key={ev.event_uid}
                  onClick={() => onInspectEvent(ev.event_uid)}
                  className="hover:bg-[#161b22] cursor-pointer transition-colors"
                >
                  <td className="py-2.5 pr-3 font-mono text-sky-400">
                    {ev.event_uid}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {ev.src_ip}:{ev.src_port} → {ev.dst_ip}:{ev.dst_port}{' '}
                    <span className="text-slate-500">({ev.protocol})</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <TriageBadge category={ev.triage_category} />
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-200">
                    {ev.predicted_label}
                  </td>
                  <td className="py-2.5 px-3">
                    <SeverityBadge severity={ev.severity} />
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-sky-300">
                    {(ev.supervised_confidence * 100).toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                    {ev.predictive_entropy.toFixed(3)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-purple-300">
                    {ev.anomaly_score.toFixed(3)} (p{ev.anomaly_percentile.toFixed(1)})
                  </td>
                  <td className="py-2.5 pl-3">
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
