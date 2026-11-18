import React, { useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  AlertCircle,
  GitCompare,
  RefreshCw,
} from 'lucide-react';
import { aegisApi } from '../api/client';
import type { MonitoringResponse } from '../types/aegis';

export const MonitoringScreen: React.FC = () => {
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
      <div className="p-8 text-sm text-slate-400 font-mono">
        Loading system telemetry and drift indicators...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>INFERENCE LATENCY (AVG / P95)</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-slate-100">
            {data.avg_latency_ms.toFixed(1)} ms{' '}
            <span className="text-sm text-emerald-300">
              / {data.p95_latency_ms.toFixed(1)} ms
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Max Observed: {data.max_latency_ms.toFixed(1)} ms
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>DATA DRIFT (MEAN / MAX PSI)</span>
            <GitCompare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-sky-300">
            {data.avg_drift_psi.toFixed(4)} / {data.max_drift_psi.toFixed(4)}
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Warn ≥ {data.drift_thresholds.psi_warning} | Crit ≥{' '}
            {data.drift_thresholds.psi_critical}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>BATCH REQUESTS / FLOWS</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-slate-100">
            {data.total_requests} / {data.total_flows_scored.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Active Model: {data.active_model_version}
          </div>
        </div>

        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>OPERATIONAL ERRORS</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-mono font-semibold text-amber-300">
            {data.error_count}
          </div>
          <div className="text-[11px] font-mono text-slate-500">
            Rejected uploads or validation faults
          </div>
        </div>
      </div>

      {/* Feature Drift (PSI) & Recent Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Population Stability Index per Feature */}
        <div className="lg:col-span-5 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Feature Distribution Drift (Population Stability Index)
              </h3>
              <p className="text-xs text-slate-400">
                Compares incoming flow quantiles against training reference deciles
              </p>
            </div>
            <button
              onClick={loadMonitoring}
              className="p-1.5 rounded bg-[#161b22] border border-[#21262d] text-slate-300 hover:text-white"
              title="Refresh Telemetry"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {data.latest_feature_drift.map((d) => {
              const badgeColor =
                d.status === 'CRITICAL_DRIFT'
                  ? 'text-red-300 bg-red-500/15 border-red-500/35'
                  : d.status === 'MODERATE_DRIFT'
                  ? 'text-amber-300 bg-amber-500/15 border-amber-500/35'
                  : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35';
              return (
                <div
                  key={d.feature}
                  className="p-2.5 rounded bg-[#161b22]/60 border border-[#21262d] space-y-1 text-xs font-mono"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-200">{d.feature}</span>
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded border ${badgeColor}`}
                    >
                      PSI: {d.psi.toFixed(4)} ({d.status})
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Train Median: {d.train_median}</span>
                    <span>Batch Median: {d.batch_median}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inference Telemetry Log */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Recent Inference Batch Telemetry
            </h3>
            <p className="text-xs text-slate-400">
              Per-batch latency, drift PSI, mean predictive entropy, and status codes
            </p>
          </div>

          <div className="overflow-x-auto max-h-[320px]">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400">
                  <th className="py-2 pr-2">BATCH ID</th>
                  <th className="py-2 px-2">ENDPOINT</th>
                  <th className="py-2 px-2 text-right">FLOWS</th>
                  <th className="py-2 px-2 text-right">LATENCY</th>
                  <th className="py-2 px-2 text-right">MAX PSI</th>
                  <th className="py-2 px-2 text-right">ENTROPY</th>
                  <th className="py-2 pl-2 text-right">HTTP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {data.recent_telemetry.map((t) => (
                  <tr key={t.id} className="hover:bg-[#161b22]/60">
                    <td className="py-2 pr-2 text-sky-400">{t.batch_id}</td>
                    <td className="py-2 px-2 text-slate-300">{t.endpoint}</td>
                    <td className="py-2 px-2 text-right text-slate-200">
                      {t.record_count}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-300">
                      {t.latency_ms.toFixed(1)} ms
                    </td>
                    <td className="py-2 px-2 text-right text-amber-300">
                      {t.drift_psi_max.toFixed(4)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {t.mean_entropy.toFixed(3)}
                    </td>
                    <td
                      className={`py-2 pl-2 text-right ${
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

          {data.operational_errors.length > 0 && (
            <div className="space-y-2 border-t border-[#21262d] pt-3">
              <div className="text-xs font-mono text-red-300">
                OPERATIONAL VALIDATION & API ERROR LOG
              </div>
              {data.operational_errors.slice(0, 5).map((err) => (
                <div
                  key={err.id}
                  className="p-2 rounded bg-red-950/30 border border-red-500/30 text-xs font-mono text-red-200"
                >
                  [{err.status_code}] {err.endpoint}: {err.error_message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
