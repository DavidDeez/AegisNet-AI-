import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { aegisApi } from '../api/client';
import type { MonitoringResponse } from '../types/aegis';
import { AnimatedMetric } from '../components/InteractiveEffects';

export const MonitoringScreen: React.FC = () => {
  const [subTab, setSubTab] = useState<'drift' | 'telemetry' | 'errors'>('drift');
  const [data, setData] = useState<MonitoringResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMonitoring = async () => {
    setLoading(true);
    try {
      const res = await aegisApi.getMonitoring();
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitoring();
  }, []);

  if (!data) {
    return (
      <div className="p-6 text-xs text-slate-400 font-mono max-w-6xl mx-auto">
        [SYS] Loading system telemetry and drift indicators...
      </div>
    );
  }

  const critThresh = Math.max(0.01, data.drift_thresholds.psi_critical || 0.25);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Unified 4-Column Horizontal Telemetry Ledger (Aligned with Overview) */}
      <div className="bg-[#0d1117] border border-white/10 rounded overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07] font-mono">
          <div
            onClick={() => setSubTab('telemetry')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400 tracking-wider">
              <span>01 // INFERENCE LATENCY</span>
              <span className="text-emerald-400">P95</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-semibold text-white">
                <AnimatedMetric
                  value={data.avg_latency_ms}
                  decimals={1}
                  suffix=" ms"
                />
              </span>
              <span className="text-xs text-emerald-300">
                p95: {data.p95_latency_ms.toFixed(1)} ms
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Peak Observed: {data.max_latency_ms.toFixed(1)} ms
            </div>
          </div>

          <div
            onClick={() => setSubTab('drift')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400 tracking-wider">
              <span>02 // DRIFT PSI (MEAN / MAX)</span>
              <span className="text-amber-300">
                CRIT ≥ {data.drift_thresholds.psi_critical}
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-semibold text-slate-100">
                {data.avg_drift_psi.toFixed(4)}
              </span>
              <span className="text-xs text-amber-200">
                max: {data.max_drift_psi.toFixed(4)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Warn Threshold: PSI ≥ {data.drift_thresholds.psi_warning}
            </div>
          </div>

          <div
            onClick={() => setSubTab('telemetry')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400 tracking-wider">
              <span>03 // SCORED THROUGHPUT</span>
              <span className="text-[#79c0ff]">BATCHES</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-semibold text-white">
                <AnimatedMetric value={data.total_flows_scored} />
              </span>
              <span className="text-xs text-slate-400">
                {data.total_requests} reqs
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              Model: {data.active_model_version}
            </div>
          </div>

          <div
            onClick={() => setSubTab('errors')}
            className="p-4 space-y-1 interactive-ledger-cell cursor-pointer"
          >
            <div className="flex items-center justify-between text-[10px] text-slate-400 tracking-wider">
              <span>04 // VALIDATION FAULTS</span>
              <span className="text-slate-500">GUARD</span>
            </div>
            <div className="flex items-baseline justify-between pt-0.5">
              <span className="text-2xl font-semibold text-amber-300">
                <AnimatedMetric value={data.error_count} />
              </span>
              <span className="text-xs text-slate-400">
                HTTP 4xx/5xx
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              Schema & boundary sanitizer
            </div>
          </div>
        </div>
      </div>

      {/* GradeGuide Sub-Navigation Bar (.nav-tab) */}
      <div className="flex items-center justify-between border-b border-[#30363d]">
        <div className="nav-container border-b-0">
          <div
            className={`nav-tab ${subTab === 'drift' ? 'active' : ''}`}
            onClick={() => setSubTab('drift')}
          >
            1. Feature Distribution Drift (PSI Matrix)
          </div>
          <div
            className={`nav-tab ${subTab === 'telemetry' ? 'active' : ''}`}
            onClick={() => setSubTab('telemetry')}
          >
            2. Inference Batch Telemetry Log ({data.recent_telemetry.length})
          </div>
          <div
            className={`nav-tab ${subTab === 'errors' ? 'active' : ''}`}
            onClick={() => setSubTab('errors')}
          >
            3. Operational Fault Log ({data.operational_errors.length})
          </div>
        </div>

        <button
          onClick={loadMonitoring}
          className="px-2.5 py-1 mb-1 rounded-[4px] bg-[#21262d] border border-[#30363d] text-xs font-mono text-slate-300 hover:text-white hover:border-[#79c0ff] inline-flex items-center gap-1.5 transition"
          title="Refresh Telemetry"
        >
          <RefreshCw
            className={`w-3 h-3 ${loading ? 'animate-spin text-[#79c0ff]' : ''}`}
          />
          <span>REFRESH</span>
        </button>
      </div>

      {/* TAB 1: Symmetrical 3-Column Feature Drift (PSI) Grid */}
      {subTab === 'drift' && (
        <div className="bg-[#0d1117] border border-white/10 rounded p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] pb-3 font-mono">
            <span className="text-xs font-semibold text-slate-200">
              POPULATION STABILITY INDEX (PSI) // INCOMING QUANTILES VS. TRAINING REFERENCE
            </span>
            <span className="text-[11px] text-slate-400">
              STABLE &lt; {data.drift_thresholds.psi_warning} // WARN ≥{' '}
              {data.drift_thresholds.psi_warning} // CRIT ≥{' '}
              {data.drift_thresholds.psi_critical}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {data.latest_feature_drift.map((d, idx) => {
              const isCrit = d.status === 'CRITICAL_DRIFT';
              const isWarn = d.status === 'MODERATE_DRIFT';
              const badgeColor = isCrit
                ? 'text-red-300 bg-red-500/15 border-red-500/35'
                : isWarn
                ? 'text-amber-300 bg-amber-500/15 border-amber-500/35'
                : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35';
              const barColor = isCrit
                ? 'bg-red-500'
                : isWarn
                ? 'bg-amber-400'
                : 'bg-emerald-500';
              const barPct = Math.min(100, (d.psi / (critThresh * 1.4)) * 100);

              return (
                <div
                  key={d.feature}
                  className="p-3.5 rounded-[4px] bg-[#090c10] border border-white/[0.07] flex flex-col justify-between space-y-2.5 text-xs font-mono"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-100 font-medium truncate">
                      {String(idx + 1).padStart(2, '0')}. {d.feature}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded-[2px] border shrink-0 ${badgeColor}`}
                    >
                      {d.status.replace('_DRIFT', '')}
                    </span>
                  </div>

                  {/* Aligned PSI Bar + Score */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">PSI SCORE</span>
                      <span className="text-white font-semibold">
                        {d.psi.toFixed(4)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-[#07080c] rounded-full overflow-hidden border border-white/[0.05]">
                      <div
                        className={`h-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.max(4, barPct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Symmetrical 2-Column Baseline vs Batch Medians */}
                  <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/[0.06] text-[10px]">
                    <div>
                      <span className="text-slate-500 block">TRAIN MEDIAN</span>
                      <span className="text-slate-300">{d.train_median}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block">BATCH MEDIAN</span>
                      <span className="text-[#79c0ff]">{d.batch_median}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Full-Width Aligned Inference Telemetry Table */}
      {subTab === 'telemetry' && (
        <div className="bg-[#0d1117] border border-white/10 rounded overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between font-mono">
            <span className="text-xs font-semibold text-slate-200">
              RECENT INFERENCE BATCH TELEMETRY LEDGER
            </span>
            <span className="text-[11px] text-slate-400">
              TOTAL REQUESTS: {data.total_requests}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                  <th className="py-2.5 px-5">BATCH_ID</th>
                  <th className="py-2.5 px-3">ENDPOINT</th>
                  <th className="py-2.5 px-3 text-right">FLOWS</th>
                  <th className="py-2.5 px-3 text-right">LATENCY</th>
                  <th className="py-2.5 px-3 text-right">MAX_PSI</th>
                  <th className="py-2.5 px-3 text-right">MEAN_ENTROPY</th>
                  <th className="py-2.5 px-5 text-right">HTTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data.recent_telemetry.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 px-5 text-[#79c0ff] font-medium">
                      {t.batch_id}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{t.endpoint}</td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {t.record_count}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300">
                      {t.latency_ms.toFixed(1)} ms
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {t.drift_psi_max.toFixed(4)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {t.mean_entropy.toFixed(3)}
                    </td>
                    <td
                      className={`py-2.5 px-5 text-right font-semibold ${
                        t.status_code >= 400
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {t.status_code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Operational Error & Validation Fault Log */}
      {subTab === 'errors' && (
        <div className="bg-[#0d1117] border border-white/10 rounded p-5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <span className="text-xs font-semibold text-slate-200">
              OPERATIONAL VALIDATION & API FAULT LOG
            </span>
            <span className="text-[11px] text-slate-400">
              RECORDED FAULTS: {data.operational_errors.length}
            </span>
          </div>

          {data.operational_errors.length === 0 ? (
            <div className="py-12 text-center text-xs text-emerald-400">
              [ZERO_OPERATIONAL_FAULTS_RECORDED // ALL_REQUESTS_NOMINAL]
            </div>
          ) : (
            <div className="space-y-2">
              {data.operational_errors.map((err) => (
                <div
                  key={err.id}
                  className="p-3 rounded-[4px] bg-red-950/30 border border-red-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-red-200"
                >
                  <div>
                    <span className="font-semibold text-red-300">
                      [HTTP {err.status_code}]
                    </span>{' '}
                    <span className="text-slate-300">{err.endpoint}</span> —{' '}
                    <span>{err.error_message}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {err.created_at}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
