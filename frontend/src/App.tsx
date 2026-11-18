import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Shield,
  LayoutDashboard,
  Crosshair,
  Radar,
  ListFilter,
  Sparkles,
  FlaskConical,
  Activity,
  Settings,
  RefreshCw,
  Search,
  Radio,
  Download,
  Zap,
  X,
} from 'lucide-react';
import { aegisApi } from './api/client';
import type { OverviewResponse, ThreatIntelResponse } from './types/aegis';
import { OverviewScreen } from './screens/OverviewScreen';
import { ThreatIntelScreen } from './screens/ThreatIntelScreen';
import { DetectionCenterScreen } from './screens/DetectionCenterScreen';
import { EventExplorerScreen } from './screens/EventExplorerScreen';
import { ExplainabilityScreen } from './screens/ExplainabilityScreen';
import { ModelLabScreen } from './screens/ModelLabScreen';
import { MonitoringScreen } from './screens/MonitoringScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TriageBadge } from './components/Badge';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'threat-intel', label: 'Threat Intelligence', icon: Crosshair },
  { id: 'detection', label: 'Detection Center', icon: Radar },
  { id: 'events', label: 'Event Explorer', icon: ListFilter },
  { id: 'explainability', label: 'Explainability (SHAP)', icon: Sparkles },
  { id: 'model-lab', label: 'Model Lab', icon: FlaskConical },
  { id: 'monitoring', label: 'System Monitoring', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [threatIntel, setThreatIntel] = useState<ThreatIntelResponse | null>(
    null
  );
  const [selectedEventUid, setSelectedEventUid] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Live Benchmark Replay Stream simulator state
  const [liveReplayActive, setLiveReplayActive] = useState<boolean>(false);
  const [replaySeed, setReplaySeed] = useState<number>(301);
  const [streamToast, setStreamToast] = useState<string | null>(null);
  const replaySeedRef = useRef<number>(301);
  replaySeedRef.current = replaySeed;

  // Command Palette (Ctrl+K) state
  const [cmdOpen, setCmdOpen] = useState<boolean>(false);
  const [cmdQuery, setCmdQuery] = useState<string>('');

  const refreshCoreData = useCallback(async () => {
    setLoading(true);
    setBackendError(null);
    try {
      const [ov, ti] = await Promise.all([
        aegisApi.getOverview(),
        aegisApi.getThreatIntel(),
      ]);
      setOverview(ov);
      setThreatIntel(ti);
      if (!selectedEventUid && ov.recent_events.length > 0) {
        setSelectedEventUid(ov.recent_events[0].event_uid);
      }
    } catch (err: any) {
      setBackendError(
        err.message ||
          'Unable to reach AegisNet FastAPI backend.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedEventUid]);

  useEffect(() => {
    refreshCoreData();
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Live Benchmark Replay Stream loop (scores 10 real benchmark flows every 7s when enabled)
  useEffect(() => {
    if (!liveReplayActive) return;
    let cancelled = false;

    const runMicroBatch = async () => {
      try {
        const nextSeed = replaySeedRef.current + 13;
        setReplaySeed(nextSeed);
        const res = await aegisApi.analyzeBenchmarkSlice(10, true, nextSeed);
        if (!cancelled) {
          const attacks = res.triage_summary['KNOWN_ATTACK'] || 0;
          const anomalies = res.triage_summary['ANOMALOUS_UNKNOWN'] || 0;
          setStreamToast(
            `Replay Batch ${res.batch_id}: +10 flows scored (${attacks} known attacks, ${anomalies} open-set anomalies)`
          );
          await refreshCoreData();
        }
      } catch {
        // ignore transient error
      }
    };

    runMicroBatch();
    const timer = setInterval(runMicroBatch, 7500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [liveReplayActive, refreshCoreData]);

  const handleInspectEvent = (eventUid: string) => {
    setSelectedEventUid(eventUid);
    setActiveTab('events');
    setCmdOpen(false);
  };

  const handleOpenExplainability = (eventUid: string) => {
    setSelectedEventUid(eventUid);
    setActiveTab('explainability');
    setCmdOpen(false);
  };

  const handleQuickBenchmark = async () => {
    setCmdOpen(false);
    setLoading(true);
    try {
      const nextSeed = replaySeed + 17;
      setReplaySeed(nextSeed);
      const res = await aegisApi.analyzeBenchmarkSlice(40, true, nextSeed);
      setStreamToast(
        `Scored 40 CIC-IDS2017 benchmark flows in ${res.latency_ms} ms (${res.batch_id})`
      );
      await refreshCoreData();
    } finally {
      setLoading(false);
    }
  };

  const recentMatches = (overview?.recent_events || []).filter((ev) => {
    if (!cmdQuery.trim()) return true;
    const q = cmdQuery.toLowerCase();
    return (
      ev.event_uid.toLowerCase().includes(q) ||
      ev.src_ip.toLowerCase().includes(q) ||
      ev.dst_ip.toLowerCase().includes(q) ||
      ev.predicted_label.toLowerCase().includes(q) ||
      ev.triage_category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen text-[#ecf2f8] flex relative">
      {/* Left Glossy Glass Operations Sidebar */}
      <aside className="w-64 bg-[#0d1117] border-r border-white/10 flex flex-col justify-between shrink-0 z-20">
        <div>
          <div className="p-5 border-b border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400/30 to-purple-500/20 border border-sky-400/50 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.3)]">
              <Shield className="w-4 h-4 text-sky-300" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wider text-white">
                AEGISNET
              </div>
              <div className="text-[10px] font-mono text-sky-300/80">
                NIDS & OPEN-SET XAI
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-sky-500/25 to-purple-500/15 text-white border border-sky-400/40 shadow-[0_0_20px_rgba(56,189,248,0.2)]'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-sky-300' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'events' && overview && overview.pending_triage > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-red-500/25 text-red-200 border border-red-400/40">
                      {overview.pending_triage}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Status Glass Card */}
        <div className="p-4 m-3 rounded-xl bg-[#161b22] border border-white/10 space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">ENGINE STATUS</span>
            <span
              className={`inline-flex items-center gap-1.5 font-semibold ${
                overview?.system_health?.ml_engine_ready
                  ? 'text-emerald-300'
                  : 'text-amber-300'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
              {overview?.system_health?.ml_engine_ready ? 'ONLINE' : 'SYNCING'}
            </span>
          </div>
          <div className="text-slate-300 truncate">
            Model: {overview?.system_health?.active_model_version || '—'}
          </div>
          <div className="text-slate-400 flex items-center justify-between">
            <span>Mode:</span>
            <span className="text-sky-300">
              {liveReplayActive ? 'Live Replay Stream' : 'Batch / API Verified'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Glossy Glass Top Header */}
        <header className="h-16 bg-[#0d1117] border-b border-white/10 px-6 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-white tracking-tight">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </h1>
            <span className="text-xs font-mono text-slate-400 hidden xl:inline">
              | Calibrated RF + Isolation Forest Open-Set Triage + TreeSHAP
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Command Palette Trigger */}
            <button
              onClick={() => setCmdOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[#161b22] border border-white/10 text-xs font-mono text-slate-300 hover:text-white hover:border-sky-400/40 inline-flex items-center gap-2 transition"
              title="Open Quick Command Palette (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Quick Search & Actions</span>
              <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-black/40 border border-white/10 text-slate-400">
                Ctrl+K
              </kbd>
            </button>

            {/* Live Benchmark Replay Stream Toggle */}
            <button
              onClick={() => setLiveReplayActive((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium border inline-flex items-center gap-2 transition ${
                liveReplayActive
                  ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50 shadow-[0_0_18px_rgba(16,185,129,0.3)]'
                  : 'bg-[#161b22] text-slate-300 border-white/10 hover:text-white'
              }`}
              title="Continuously stream & score 10 reproducible CIC-IDS2017 benchmark flows every 7.5 seconds"
            >
              <Radio
                className={`w-3.5 h-3.5 ${
                  liveReplayActive
                    ? 'text-emerald-300 animate-pulse'
                    : 'text-slate-400'
                }`}
              />
              <span>
                {liveReplayActive ? 'Live Replay: ON' : 'Live Replay Stream'}
              </span>
            </button>

            {/* Export CSV Report Shortcut */}
            <a
              href={aegisApi.getExportCsvUrl()}
              download="aegisnet_forensic_events.csv"
              className="px-3 py-1.5 rounded-xl bg-[#161b22] border border-white/10 text-xs font-mono text-sky-300 hover:text-white hover:border-sky-400/40 hidden md:inline-flex items-center gap-1.5 transition"
              title="Download forensic CSV report of analyzed events"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </a>

            {/* Refresh */}
            <button
              onClick={refreshCoreData}
              className="px-3 py-1.5 rounded-xl bg-[#161b22] border border-white/10 text-xs font-mono text-slate-200 hover:text-white inline-flex items-center gap-1.5 transition"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </header>

        {/* Live Replay Stream Banner Toast */}
        {streamToast && (
          <div className="mx-6 mt-4 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500/20 via-purple-500/15 to-emerald-500/20 border border-sky-400/35 backdrop-blur-xl flex items-center justify-between text-xs font-mono text-sky-100 shadow-[0_0_24px_rgba(56,189,248,0.18)]">
            <span className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-300" />
              {streamToast}
            </span>
            <button
              onClick={() => setStreamToast(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Body */}
        <main className="p-6 flex-1 overflow-y-auto">
          {backendError && (
            <div className="mb-6 bg-red-950/60 border border-red-400/40 backdrop-blur-xl rounded-xl p-4 text-xs font-mono text-red-200">
              Backend Connection Alert: {backendError}
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewScreen
              data={overview}
              loading={loading}
              onInspectEvent={handleInspectEvent}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'threat-intel' && (
            <ThreatIntelScreen
              data={threatIntel}
              loading={loading}
              onInspectEvent={handleInspectEvent}
            />
          )}

          {activeTab === 'detection' && (
            <DetectionCenterScreen
              onBatchAnalyzed={refreshCoreData}
              onInspectEvent={handleInspectEvent}
            />
          )}

          {activeTab === 'events' && (
            <EventExplorerScreen
              selectedEventUid={selectedEventUid}
              onSelectEventUid={setSelectedEventUid}
              onOpenExplainability={handleOpenExplainability}
              onEventUpdated={refreshCoreData}
            />
          )}

          {activeTab === 'explainability' && (
            <ExplainabilityScreen
              selectedEventUid={selectedEventUid}
              recentEvents={overview?.recent_events || []}
              onSelectEventUid={setSelectedEventUid}
            />
          )}

          {activeTab === 'model-lab' && (
            <ModelLabScreen onModelTrained={refreshCoreData} />
          )}

          {activeTab === 'monitoring' && <MonitoringScreen />}

          {activeTab === 'settings' && (
            <SettingsScreen onSettingsChanged={refreshCoreData} />
          )}
        </main>
      </div>

      {/* Glossy Glassmorphic Command Palette Modal (Ctrl+K) */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-start justify-center pt-20 p-4"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="glass-modal w-full max-w-2xl rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/15 flex items-center gap-3">
              <Search className="w-4 h-4 text-sky-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search Event UID, Source/Dest IP, Attack Class, or execute action..."
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                className="w-full bg-transparent text-sm font-mono text-white focus:outline-none"
              />
              <button
                onClick={() => setCmdOpen(false)}
                className="text-xs font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded border border-white/10"
              >
                ESC
              </button>
            </div>

            <div className="p-4 max-h-96 overflow-y-auto space-y-4">
              {/* Quick Operations */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-sky-300/80 uppercase tracking-wider">
                  Quick SOC Actions
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleQuickBenchmark}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 border border-white/10 hover:border-sky-400/40 text-left text-xs font-mono flex items-center justify-between transition"
                  >
                    <span className="text-slate-100">
                      ⚡ Score 40 CIC-IDS2017 Flows Now
                    </span>
                    <span className="text-sky-300 text-[10px]">RUN</span>
                  </button>
                  <button
                    onClick={() => {
                      setLiveReplayActive((prev) => !prev);
                      setCmdOpen(false);
                    }}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-400/40 text-left text-xs font-mono flex items-center justify-between transition"
                  >
                    <span className="text-slate-100">
                      📡 {liveReplayActive ? 'Stop' : 'Start'} Live Replay Stream
                    </span>
                    <span className="text-emerald-300 text-[10px]">TOGGLE</span>
                  </button>
                </div>
              </div>

              {/* Matching Events */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  Matching Analyzed Network Flows ({recentMatches.length})
                </div>
                <div className="space-y-1">
                  {recentMatches.slice(0, 8).map((ev) => (
                    <div
                      key={ev.event_uid}
                      onClick={() => handleInspectEvent(ev.event_uid)}
                      className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer flex items-center justify-between text-xs font-mono transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sky-300 font-semibold">
                          {ev.event_uid}
                        </span>
                        <span className="text-slate-300">
                          {ev.src_ip} → {ev.dst_ip}:{ev.dst_port}
                        </span>
                        <TriageBadge category={ev.triage_category} />
                      </div>
                      <span className="text-slate-400">
                        Conf {(ev.supervised_confidence * 100).toFixed(0)}% | p
                        {ev.anomaly_percentile.toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;
