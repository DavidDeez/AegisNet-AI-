import React, { useState } from 'react';
import { Upload, Play, Sliders, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { aegisApi } from '../api/client';
import type { DetectionBatchResult, NetworkEventRecord } from '../types/aegis';
import { SeverityBadge, TriageBadge } from '../components/Badge';
import { FlowHoverHud } from '../components/InteractiveEffects';

interface Props {
  onBatchAnalyzed: () => void;
  onInspectEvent: (eventUid: string) => void;
}

const PRESET_FLOW_PROFILES: Record<
  string,
  { label: string; description: string; payload: Record<string, any> }
> = {
  dos_hulk: {
    label: 'DoS Hulk HTTP Flood',
    description: 'High packet-rate HTTP GET flood on TCP/80.',
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
    description: 'Single-packet SYN/RST port probe with 6-byte payload.',
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
    label: 'Unseen C2 Beacon (Open-Set Holdout)',
    description: 'Periodic C2 beacon on TCP/8443 excluded from RF training.',
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
  mitm_relay: {
    label: 'MITM ARP-Relay & TLS Downgrade',
    description: 'Double-hop IAT jitter, 128B window resize, and RST/PSH spikes.',
    payload: {
      src_ip: '192.168.1.44',
      dst_ip: '10.0.0.15',
      destination_port: 443,
      protocol: 'TCP',
      flow_duration: 1420000,
      total_fwd_packets: 42,
      total_backward_packets: 39,
      total_length_of_fwd_packets: 5250,
      total_length_of_bwd_packets: 5850,
      fwd_packet_length_max: 480,
      fwd_packet_length_mean: 125,
      bwd_packet_length_max: 520,
      bwd_packet_length_mean: 150,
      flow_bytes_s: 7816.9,
      flow_packets_s: 57.0,
      flow_iat_mean: 17750.0,
      flow_iat_std: 68400.0,
      flow_iat_max: 215000.0,
      fwd_iat_mean: 33809.5,
      bwd_iat_mean: 36410.2,
      fwd_psh_flags: 24,
      syn_flag_count: 5,
      rst_flag_count: 4,
      ack_flag_count: 81,
      average_packet_size: 137.0,
      init_win_bytes_forward: 128,
      active_mean: 265000,
    },
  },
  benign_https: {
    label: 'Benign TLS 1.3 Session',
    description: 'Nominal HTTPS transaction on TCP/443.',
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
  const [subTab, setSubTab] = useState<'csv' | 'benchmark' | 'probe' | 'results'>('csv');
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
  const [hoveredEvent, setHoveredEvent] = useState<NetworkEventRecord | null>(
    null
  );
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

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
      setSubTab('results');
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
      setSubTab('results');
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
        `vector_probe_${selectedPreset}`,
        [customFlow]
      );
      setResult(res);
      setSubTab('results');
      onBatchAnalyzed();
    } catch (err: any) {
      setError(err.message || 'Flow analysis failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      <FlowHoverHud
        event={hoveredEvent}
        x={cursorPos.x}
        y={cursorPos.y}
      />

      {error && (
        <div className="bg-red-950/50 border border-red-500/40 rounded-[3px] p-3 flex items-center gap-2.5 text-xs font-mono text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>[INGEST_FAULT] {error}</span>
        </div>
      )}

      {/* GradeGuide Sub-Navigation Bar (.nav-tab) */}
      <div className="nav-container">
        <div
          className={`nav-tab ${subTab === 'csv' ? 'active' : ''}`}
          onClick={() => setSubTab('csv')}
        >
          1. CSV Dataset Upload
        </div>
        <div
          className={`nav-tab ${subTab === 'benchmark' ? 'active' : ''}`}
          onClick={() => setSubTab('benchmark')}
        >
          2. CIC-IDS2017 Benchmark Slice
        </div>
        <div
          className={`nav-tab ${subTab === 'probe' ? 'active' : ''}`}
          onClick={() => setSubTab('probe')}
        >
          3. Single-Flow Vector Probe
        </div>
        {result && (
          <div
            className={`nav-tab ${subTab === 'results' ? 'active' : ''}`}
            onClick={() => setSubTab('results')}
          >
            4. Scored Batch Output ({result.events.length})
          </div>
        )}
      </div>

      {/* TAB 1: CSV Capture Ingest */}
      {subTab === 'csv' && (
        <form
          onSubmit={handleUploadCsv}
          className="max-w-xl bg-[#0d1117] border border-white/10 rounded flex flex-col justify-between"
        >
          <div>
            <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between font-mono">
              <span className="text-xs font-semibold text-slate-200">
                INGEST // PCAP_FLOW_CSV
              </span>
              <Upload className="w-4 h-4 text-[#79c0ff]" />
            </div>

            <div className="p-6 space-y-4">
              <label className="block border border-dashed border-white/20 hover:border-[#79c0ff] rounded-[6px] p-8 text-center cursor-pointer bg-[#090c10] transition">
                <FileSpreadsheet className="w-7 h-7 text-[#79c0ff] mx-auto mb-2" />
                <span className="text-sm text-slate-100 font-mono block truncate">
                  {selectedFile
                    ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`
                    : 'SELECT CICFLOWMETER / NETFLOW .CSV'}
                </span>
                <span className="text-[11px] font-mono text-slate-500 block mt-1.5">
                  MAX 50 MB // AUTO-SANITIZES NaN & INF
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

              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deduplicate}
                  onChange={(e) => setDeduplicate(e.target.checked)}
                  className="rounded-[2px] border-slate-700 bg-slate-900"
                />
                DROP DUPLICATE FLOW VECTORS
              </label>
            </div>
          </div>

          <div className="p-6 pt-0">
            <button
              type="submit"
              disabled={!selectedFile || busy}
              className="w-full py-2.5 px-4 text-xs font-mono font-medium rounded-[6px] bg-[#21262d] text-white border border-[#30363d] hover:border-[#79c0ff] disabled:opacity-40 transition"
            >
              {busy ? 'RUNNING PIPELINE...' : 'EXEC // VALIDATE & SCORE CSV'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Holdout Benchmark Slice */}
      {subTab === 'benchmark' && (
        <div className="max-w-xl bg-[#0d1117] border border-white/10 rounded flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between font-mono">
              <span className="text-xs font-semibold text-slate-200">
                REPLAY // CICIDS2017_SLICE
              </span>
              <Play className="w-4 h-4 text-[#56d364]" />
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">
                    FLOW_COUNT
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={sliceSize}
                    onChange={(e) => setSliceSize(Number(e.target.value))}
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-3 py-2 text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1.5">
                    PRNG_SEED
                  </label>
                  <input
                    type="number"
                    value={sliceSeed}
                    onChange={(e) => setSliceSeed(Number(e.target.value))}
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-mono text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includeHeldOut}
                  onChange={(e) => setIncludeHeldOut(e.target.checked)}
                  className="rounded-[2px] border-slate-700 bg-slate-900"
                />
                INJECT HELD-OUT FAMILIES (BOTNET, WEBATTACK)
              </label>
            </div>
          </div>

          <div className="p-6 pt-0">
            <button
              type="button"
              onClick={handleRunBenchmarkSlice}
              disabled={busy}
              className="w-full py-2.5 px-4 text-xs font-mono font-medium rounded-[6px] bg-[#21262d] text-white border border-[#30363d] hover:border-[#56d364] disabled:opacity-40 transition"
            >
              {busy
                ? 'SCORING BATCH...'
                : `EXEC // SCORE ${sliceSize} BENCHMARK FLOWS`}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Single-Flow Vector Probe */}
      {subTab === 'probe' && (
        <form
          onSubmit={handleAnalyzeSingleFlow}
          className="max-w-xl bg-[#0d1117] border border-white/10 rounded flex flex-col justify-between"
        >
          <div>
            <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between font-mono">
              <span className="text-xs font-semibold text-slate-200">
                PROBE // FLOW_VECTOR_SYNTHESIZER
              </span>
              <Sliders className="w-4 h-4 text-[#d2a8ff]" />
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-[10px] font-mono text-slate-400 block mb-1.5">
                  VECTOR_PRESET
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-3 py-2 text-xs font-mono text-slate-100"
                >
                  {Object.entries(PRESET_FLOW_PROFILES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    DST_PORT
                  </label>
                  <input
                    type="number"
                    value={customFlow.destination_port}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        destination_port: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    DUR_US
                  </label>
                  <input
                    type="number"
                    value={customFlow.flow_duration}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        flow_duration: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    BYTES_S
                  </label>
                  <input
                    type="number"
                    value={customFlow.flow_bytes_s}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        flow_bytes_s: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    FWD_PKTS
                  </label>
                  <input
                    type="number"
                    value={customFlow.total_fwd_packets}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        total_fwd_packets: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    SYN_CNT
                  </label>
                  <input
                    type="number"
                    value={customFlow.syn_flag_count}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        syn_flag_count: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">
                    INIT_WIN
                  </label>
                  <input
                    type="number"
                    value={customFlow.init_win_bytes_forward}
                    onChange={(e) =>
                      setCustomFlow({
                        ...customFlow,
                        init_win_bytes_forward: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#090c10] border border-white/10 rounded-[4px] px-2.5 py-1.5 text-slate-200"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 pt-0">
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 text-xs font-mono font-medium rounded-[6px] bg-[#21262d] text-white border border-[#30363d] hover:border-[#d2a8ff] disabled:opacity-40 transition"
            >
              {busy ? 'SCORING VECTOR...' : 'EXEC // SCORE & EXPLAIN VECTOR'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Batch Execution Output Ledger */}
      {subTab === 'results' && result && (
        <div className="bg-[#0d1117] border border-white/10 rounded">
          <div className="px-4 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-4 font-mono">
            <div>
              <div className="text-xs font-semibold text-white">
                BATCH_OUTPUT // {result.source_name} [{result.batch_id}]
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                ARTIFACT: {result.model_version} // LATENCY: {result.latency_ms}{' '}
                ms // MAX_DRIFT_PSI: {result.drift_report.psi_max.toFixed(4)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded-[2px] bg-[#090c10] border border-white/10 text-slate-300">
                RETAINED: {result.validation_report.valid_rows_retained}/
                {result.validation_report.total_rows_received}
              </span>
              <span className="px-2 py-0.5 rounded-[2px] bg-[#090c10] border border-white/10 text-slate-300">
                DEDUPED: {result.validation_report.duplicate_rows_removed}
              </span>
              <span className="px-2 py-0.5 rounded-[2px] bg-[#090c10] border border-white/10 text-slate-300">
                IMPUTED_CELLS:{' '}
                {result.validation_report.infinite_value_cells +
                  result.validation_report.missing_value_cells}
              </span>
            </div>
          </div>

          {result.validation_report.warnings.length > 0 && (
            <div className="mx-4 mt-3 bg-[#090c10] border border-white/10 border-l-2 border-l-amber-400 p-2.5 text-[11px] text-slate-300 font-mono space-y-0.5">
              {result.validation_report.warnings.map((w, idx) => (
                <div key={idx}>[SANITIZER] {w}</div>
              ))}
            </div>
          )}

          <div
            className="overflow-x-auto mt-2"
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-white/[0.07] text-[10px] text-slate-400 bg-[#090c10]/60">
                  <th className="py-2 px-4">EVENT UID</th>
                  <th className="py-2 px-3">ENDPOINTS</th>
                  <th className="py-2 px-3">TRIAGE STATE</th>
                  <th className="py-2 px-3">CLASSIFICATION</th>
                  <th className="py-2 px-3">TRUTH_LABEL</th>
                  <th className="py-2 px-3">SEV</th>
                  <th className="py-2 px-3 text-right">P(y|x)</th>
                  <th className="py-2 px-3 text-right">ENTROPY</th>
                  <th className="py-2 px-4 text-right">IF_SCORE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {result.events.slice(0, 40).map((ev) => (
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
                    <td className="py-2.5 px-4 text-[#79c0ff] font-medium">
                      {ev.event_uid}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {ev.src_ip} → {ev.dst_ip}:{ev.dst_port}
                    </td>
                    <td className="py-2.5 px-3">
                      <TriageBadge category={ev.triage_category} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-100">
                      {ev.predicted_label}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {ev.ground_truth_label || '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <SeverityBadge severity={ev.severity} />
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {(ev.supervised_confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {ev.predictive_entropy.toFixed(3)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-amber-300/90">
                      {ev.anomaly_score.toFixed(3)} (p
                      {ev.anomaly_percentile.toFixed(1)})
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
