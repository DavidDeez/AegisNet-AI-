import React, { useState } from 'react';
import {
  Upload,
  Play,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { aegisApi } from '../api/client';
import type { DetectionBatchResult } from '../types/aegis';
import { SeverityBadge, TriageBadge } from '../components/Badge';

interface Props {
  onBatchAnalyzed: () => void;
  onInspectEvent: (eventUid: string) => void;
}

const PRESET_FLOW_PROFILES: Record<
  string,
  { label: string; description: string; payload: Record<string, any> }
> = {
  dos_hulk: {
    label: 'DoS Hulk HTTP Flood Pattern',
    description:
      'High packet rate HTTP flood to port 80 with elevated backward response payload.',
    payload: {
      src_ip: '172.16.0.108',
      dst_ip: '192.168.10.50',
      destination_port: 80,
      protocol: 'TCP',
      flow_duration: 135000,
      total_fwd_packets: 30,
      total_backward_packets: 24,
      total_length_of_fwd_packets: 11400,
      total_length_of_bwd_packets: 27600,
      fwd_packet_length_max: 680,
      fwd_packet_length_mean: 380,
      bwd_packet_length_max: 1460,
      bwd_packet_length_mean: 1150,
      flow_bytes_s: 288888.9,
      flow_packets_s: 400.0,
      flow_iat_mean: 2547.2,
      flow_iat_std: 3100.0,
      flow_iat_max: 9800.0,
      fwd_iat_mean: 4500.0,
      bwd_iat_mean: 5625.0,
      fwd_psh_flags: 5,
      syn_flag_count: 2,
      rst_flag_count: 1,
      ack_flag_count: 54,
      average_packet_size: 722.2,
      init_win_bytes_forward: 512,
      active_mean: 4500,
    },
  },
  port_scan: {
    label: 'TCP SYN PortScan Probe',
    description:
      'Ultra-short 1-packet probe with minimal payload and SYN/RST flags.',
    payload: {
      src_ip: '172.16.0.135',
      dst_ip: '192.168.10.51',
      destination_port: 3389,
      protocol: 'TCP',
      flow_duration: 420,
      total_fwd_packets: 1,
      total_backward_packets: 1,
      total_length_of_fwd_packets: 6,
      total_length_of_bwd_packets: 6,
      fwd_packet_length_max: 6,
      fwd_packet_length_mean: 6,
      bwd_packet_length_max: 6,
      bwd_packet_length_mean: 6,
      flow_bytes_s: 28571.4,
      flow_packets_s: 4761.9,
      flow_iat_mean: 420.0,
      flow_iat_std: 0.0,
      flow_iat_max: 420.0,
      fwd_iat_mean: 420.0,
      bwd_iat_mean: 0.0,
      fwd_psh_flags: 0,
      syn_flag_count: 1,
      rst_flag_count: 1,
      ack_flag_count: 0,
      average_packet_size: 6.0,
      init_win_bytes_forward: 1024,
      active_mean: 0,
    },
  },
  unseen_botnet_c2: {
    label: 'Unseen C2 Beacon Pattern (Held-Out Anomaly Test)',
    description:
      'Long-duration periodic flow on port 8443 with tiny window size and high PSH count (excluded from supervised training).',
    payload: {
      src_ip: '192.168.10.114',
      dst_ip: '198.51.100.44',
      destination_port: 8443,
      protocol: 'TCP',
      flow_duration: 1950000,
      total_fwd_packets: 36,
      total_backward_packets: 34,
      total_length_of_fwd_packets: 2520,
      total_length_of_bwd_packets: 2312,
      fwd_packet_length_max: 260,
      fwd_packet_length_mean: 70,
      bwd_packet_length_max: 240,
      bwd_packet_length_mean: 68,
      flow_bytes_s: 2477.9,
      flow_packets_s: 35.9,
      flow_iat_mean: 28260.0,
      flow_iat_std: 41000.0,
      flow_iat_max: 145000.0,
      fwd_iat_mean: 54166.0,
      bwd_iat_mean: 57352.0,
      fwd_psh_flags: 22,
      syn_flag_count: 4,
      rst_flag_count: 3,
      ack_flag_count: 70,
      average_packet_size: 69.0,
      init_win_bytes_forward: 128,
      active_mean: 290000,
    },
  },
  benign_https: {
    label: 'Standard Benign HTTPS Session',
    description:
      'Normal TLS 1.3 web transaction on port 443 within baseline IAT and window bounds.',
    payload: {
      src_ip: '192.168.10.25',
      dst_ip: '172.16.0.12',
      destination_port: 443,
      protocol: 'TCP',
      flow_duration: 32000,
      total_fwd_packets: 11,
      total_backward_packets: 13,
      total_length_of_fwd_packets: 2640,
      total_length_of_bwd_packets: 6760,
      fwd_packet_length_max: 512,
      fwd_packet_length_mean: 240,
      bwd_packet_length_max: 1240,
      bwd_packet_length_mean: 520,
      flow_bytes_s: 293750.0,
      flow_packets_s: 750.0,
      flow_iat_mean: 1391.3,
      flow_iat_std: 1520.0,
      flow_iat_max: 4800.0,
      fwd_iat_mean: 2909.0,
      bwd_iat_mean: 2461.5,
      fwd_psh_flags: 1,
      syn_flag_count: 1,
      rst_flag_count: 0,
      ack_flag_count: 23,
      average_packet_size: 391.7,
      init_win_bytes_forward: 29200,
      active_mean: 14000,
    },
  },
};

export const DetectionCenterScreen: React.FC<Props> = ({
  onBatchAnalyzed,
  onInspectEvent,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deduplicate, setDeduplicate] = useState(true);
  const [sliceSize, setSliceSize] = useState(60);
  const [includeHeldOut, setIncludeHeldOut] = useState(true);
  const [sliceSeed, setSliceSeed] = useState(105);

  const [selectedPreset, setSelectedPreset] = useState('dos_hulk');
  const [customFlow, setCustomFlow] = useState<Record<string, any>>(
    PRESET_FLOW_PROFILES.dos_hulk.payload
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionBatchResult | null>(null);

  const handlePresetChange = (key: string) => {
    setSelectedPreset(key);
    if (PRESET_FLOW_PROFILES[key]) {
      setCustomFlow({ ...PRESET_FLOW_PROFILES[key].payload });
    }
  };

  const handleUploadCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await aegisApi.uploadCsv(selectedFile, deduplicate);
      setResult(res);
      onBatchAnalyzed();
    } catch (err: any) {
      setError(err.message || 'CSV upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRunBenchmarkSlice = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await aegisApi.analyzeBenchmarkSlice(
        sliceSize,
        includeHeldOut,
        sliceSeed
      );
      setResult(res);
      setSliceSeed((prev) => prev + 7);
      onBatchAnalyzed();
    } catch (err: any) {
      setError(err.message || 'Failed to score benchmark slice');
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyzeSingleFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await aegisApi.analyzeFlows(
        `interactive_inspector_${selectedPreset}`,
        [customFlow]
      );
      setResult(res);
      onBatchAnalyzed();
    } catch (err: any) {
      setError(err.message || 'Flow analysis failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-950/50 border border-red-500/40 rounded-lg p-4 flex items-center gap-3 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Three Ingestion Modes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Upload CSV Network Flow Dataset */}
        <form
          onSubmit={handleUploadCsv}
          className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                1. CSV Flow Dataset Upload
              </h3>
              <Upload className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-xs text-slate-400">
              Upload CIC-IDS2017 or canonical network flow `.csv` files (up to 50 MB). Automatically sanitizes `Infinity`/`NaN` cells, validates schema, and removes duplicates.
            </p>

            <label className="block border border-dashed border-[#30363d] hover:border-sky-500/50 rounded-lg p-4 text-center cursor-pointer bg-[#090c10] transition">
              <FileSpreadsheet className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
              <span className="text-xs text-slate-300 font-mono block truncate">
                {selectedFile
                  ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                  : 'Select .csv network flow file'}
              </span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) =>
                  setSelectedFile(e.target.files ? e.target.files[0] : null)
                }
                className="hidden"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={deduplicate}
                onChange={(e) => setDeduplicate(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900"
              />
              Deduplicate identical flow records before inference
            </label>
          </div>

          <button
            type="submit"
            disabled={!selectedFile || busy}
            className="w-full py-2 px-4 text-xs font-mono font-medium rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 disabled:opacity-40 transition"
          >
            {busy ? 'Validating & Scoring...' : 'Validate & Analyze CSV'}
          </button>
        </form>

        {/* 2. Reproducible CIC-IDS2017 Benchmark Slice */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                2. CIC-IDS2017 Benchmark Batch
              </h3>
              <Play className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xs text-slate-400">
              Evaluate a reproducible slice of CIC-IDS2017-schema flows containing benign traffic, known attacks (`DoS Hulk`, `PortScan`, `DDoS`, `BruteForce`), and held-out unseen families (`Botnet`, `WebAttack`).
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-mono">
                  BATCH FLOW COUNT
                </label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={sliceSize}
                  onChange={(e) => setSliceSize(Number(e.target.value))}
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 font-mono text-slate-200"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-mono">
                  RANDOM SEED
                </label>
                <input
                  type="number"
                  value={sliceSeed}
                  onChange={(e) => setSliceSeed(Number(e.target.value))}
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 font-mono text-slate-200"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeHeldOut}
                onChange={(e) => setIncludeHeldOut(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900"
              />
              Include held-out unseen attack families (`Botnet`, `WebAttack`)
            </label>
          </div>

          <button
            type="button"
            onClick={handleRunBenchmarkSlice}
            disabled={busy}
            className="w-full py-2 px-4 text-xs font-mono font-medium rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-40 transition"
          >
            {busy ? 'Scoring Batch...' : `Analyze ${sliceSize} Benchmark Flows`}
          </button>
        </div>

        {/* 3. Interactive Single-Flow Telemetry Inspector */}
        <form
          onSubmit={handleAnalyzeSingleFlow}
          className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                3. Structured Flow Inspector
              </h3>
              <Sliders className="w-4 h-4 text-purple-400" />
            </div>

            <div>
              <label className="text-[11px] font-mono text-slate-400 block mb-1">
                LOAD BASELINE TEMPLATE
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
              >
                {Object.entries(PRESET_FLOW_PROFILES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                {PRESET_FLOW_PROFILES[selectedPreset]?.description}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div>
                <label className="text-[10px] text-slate-400 block">DST PORT</label>
                <input
                  type="number"
                  value={customFlow.destination_port}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      destination_port: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">DURATION (μs)</label>
                <input
                  type="number"
                  value={customFlow.flow_duration}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      flow_duration: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">BYTES/S</label>
                <input
                  type="number"
                  value={customFlow.flow_bytes_s}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      flow_bytes_s: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">FWD PKTS</label>
                <input
                  type="number"
                  value={customFlow.total_fwd_packets}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      total_fwd_packets: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">SYN FLAGS</label>
                <input
                  type="number"
                  value={customFlow.syn_flag_count}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      syn_flag_count: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">INIT WIN</label>
                <input
                  type="number"
                  value={customFlow.init_win_bytes_forward}
                  onChange={(e) =>
                    setCustomFlow({
                      ...customFlow,
                      init_win_bytes_forward: Number(e.target.value),
                    })
                  }
                  className="w-full bg-[#090c10] border border-[#21262d] rounded px-2 py-1 text-slate-200"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 px-4 text-xs font-mono font-medium rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-40 transition"
          >
            {busy ? 'Scoring Flow...' : 'Score & Explain Single Flow'}
          </button>
        </form>
      </div>

      {/* Validation, Uncertainty & Scoring Results */}
      {result && (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#21262d] pb-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Batch Analysis Complete — {result.source_name} ({result.batch_id})
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Model: {result.model_version} | Latency: {result.latency_ms} ms | Max Feature Drift PSI:{' '}
                  {result.drift_report.psi_max.toFixed(4)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#21262d] text-slate-300">
                Retained: {result.validation_report.valid_rows_retained}/
                {result.validation_report.total_rows_received}
              </span>
              <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#21262d] text-slate-300">
                Duplicates Removed: {result.validation_report.duplicate_rows_removed}
              </span>
              <span className="px-2.5 py-1 rounded bg-[#161b22] border border-[#21262d] text-slate-300">
                Inf/NaN Sanitized:{' '}
                {result.validation_report.infinite_value_cells +
                  result.validation_report.missing_value_cells}
              </span>
            </div>
          </div>

          {result.validation_report.warnings.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-500/30 rounded p-3 text-xs text-amber-200 font-mono space-y-1">
              <div className="font-semibold">DATA VALIDATION SANITIZATION LOG:</div>
              {result.validation_report.warnings.map((w, idx) => (
                <div key={idx}>• {w}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400 font-mono">
                  <th className="py-2 pr-3">EVENT UID</th>
                  <th className="py-2 px-3">FLOW ENDPOINTS</th>
                  <th className="py-2 px-3">TRIAGE OUTCOME</th>
                  <th className="py-2 px-3">PREDICTED LABEL</th>
                  <th className="py-2 px-3">GROUND TRUTH</th>
                  <th className="py-2 px-3">SEVERITY</th>
                  <th className="py-2 px-3 text-right">CONFIDENCE</th>
                  <th className="py-2 px-3 text-right">ENTROPY</th>
                  <th className="py-2 px-3 text-right">IF ANOMALY</th>
                  <th className="py-2 pl-3">RATIONALE PREVIEW</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {result.events.slice(0, 40).map((ev) => (
                  <tr
                    key={ev.event_uid}
                    onClick={() => onInspectEvent(ev.event_uid)}
                    className="hover:bg-[#161b22] cursor-pointer"
                  >
                    <td className="py-2 pr-3 font-mono text-sky-400">
                      {ev.event_uid}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-300">
                      {ev.src_ip} → {ev.dst_ip}:{ev.dst_port}
                    </td>
                    <td className="py-2 px-3">
                      <TriageBadge category={ev.triage_category} />
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-200">
                      {ev.predicted_label}
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400">
                      {ev.ground_truth_label || '—'}
                    </td>
                    <td className="py-2 px-3">
                      <SeverityBadge severity={ev.severity} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sky-300">
                      {(ev.supervised_confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300">
                      {ev.predictive_entropy.toFixed(3)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-purple-300">
                      {ev.anomaly_score.toFixed(3)} (p{ev.anomaly_percentile.toFixed(1)})
                    </td>
                    <td className="py-2 pl-3 text-slate-400 max-w-xs truncate">
                      {ev.rationale_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
