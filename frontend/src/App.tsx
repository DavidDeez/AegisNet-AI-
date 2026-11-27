import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Crosshair,
  Radar,
  ListFilter,
  GitBranch,
  FlaskConical,
  Activity,
  Settings,
  RefreshCw,
  Search,
  Radio,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
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
import {
  AegisLogo,
  ElectronCanvasBackground,
  MagneticButton,
  TerminalBackground,
  TypewriterText,
  useGlobalGlassCursorEngine,
} from './components/InteractiveEffects';

const NAV_ITEMS = [
  { id: 'overview', key: '1', label: 'Overview', icon: LayoutDashboard },
  { id: 'threat-intel', key: '2', label: 'Threat Intelligence', icon: Crosshair },
  { id: 'detection', key: '3', label: 'Detection Center', icon: Radar },
  { id: 'events', key: '4', label: 'Event Explorer', icon: ListFilter },
  { id: 'explainability', key: '5', label: 'SHAP Attribution', icon: GitBranch },
  { id: 'model-lab', key: '6', label: 'Model Lab', icon: FlaskConical },
  { id: 'monitoring', key: '7', label: 'System Monitoring', icon: Activity },
  { id: 'settings', key: '8', label: 'Settings', icon: Settings },
];

export const App: React.FC = () => {
  useGlobalGlassCursorEngine();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [threatIntel, setThreatIntel] = useState<ThreatIntelResponse | null>(
    null
  );
  const [selectedEventUid, setSelectedEventUid] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Live Benchmark Replay Stream state
  const [liveReplayActive, setLiveReplayActive] = useState<boolean>(false);
  const [replaySeed, setReplaySeed] = useState<number>(301);
  const [streamToast, setStreamToast] = useState<string | null>(null);
  const replaySeedRef = useRef<number>(301);
  replaySeedRef.current = replaySeed;

  // Command Palette (Ctrl+K) state
  const [cmdOpen, setCmdOpen] = useState<boolean>(false);
  const [cmdQuery, setCmdQuery] = useState<string>('');

  // Live UTC Clock for bottom console status bar
  const [utcClock, setUtcClock] = useState<string>(() =>
    new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  );

  useEffect(() => {
    const t = setInterval(() => {
      setUtcClock(
        new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

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
        err.message || 'Unable to reach AegisNet FastAPI backend.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedEventUid]);

  useEffect(() => {
    refreshCoreData();
  }, []);

  // Keyboard shortcuts: Ctrl+K for Command Palette, Ctrl+B or [ to toggle sidebar, 1-8 for screens
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || cmdOpen) {
        return;
      }
      if (e.key === '[') {
        setSidebarCollapsed((prev) => !prev);
        return;
      }
      const found = NAV_ITEMS.find((n) => n.key === e.key);
      if (found && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setActiveTab(found.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cmdOpen]);

  // Live Benchmark Replay Stream loop
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
            `[REPLAY // ${res.batch_id}] +10 flows scored (${attacks} known signatures, ${anomalies} open-set anomalies)`
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
        `[BATCH // ${res.batch_id}] Scored 40 CIC-IDS2017 flows in ${res.latency_ms} ms`
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
    <div className="h-screen w-screen overflow-hidden text-[#c9d1d9] flex flex-col relative">
      {/* GradeGuide Multiplied Excited Star/Electron Canvas + Blueprint Grid */}
      <ElectronCanvasBackground />
      <div className="blueprint-grid" />

      {/* Main Locked Console Area (Sidebar + Right Viewport; neither sidebar nor top bar scrolls away) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative z-10">
        {/* Collapsible & Locked Left SOC Sidebar */}
        <aside
          className={`${
            sidebarCollapsed ? 'w-[68px]' : 'w-60'
          } h-full bg-[#0d1117] border-r border-white/[0.08] flex flex-col justify-between shrink-0 z-20 transition-all duration-300 ease-out select-none overflow-hidden`}
        >
          <div className="flex flex-col min-h-0">
            {/* Custom Vector AegisNet Crest & Collapse Button */}
            <div
              className={`h-14 px-3.5 border-b border-white/[0.08] flex items-center ${
                sidebarCollapsed ? 'justify-center' : 'justify-between'
              } shrink-0`}
            >
              <div
                onClick={() => setActiveTab('overview')}
                className="cursor-pointer"
                title="AegisNet — Open-Set XAI NIDS"
              >
                <AegisLogo collapsed={sidebarCollapsed} size={34} />
              </div>

              {!sidebarCollapsed && (
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-1.5 rounded-[3px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
                  title="Collapse Sidebar ([ or Ctrl+B)"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              )}
            </div>

            {!sidebarCollapsed && (
              <div className="px-4 pt-3 pb-1 text-[10px] font-mono text-slate-500 tracking-wider flex items-center justify-between">
                <span>OPERATIONS CONSOLE</span>
                <span>[1-8]</span>
              </div>
            )}

            <nav
              className={`px-2 py-2 space-y-1 overflow-y-auto ${
                sidebarCollapsed ? 'mt-1' : ''
              }`}
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const hasBadge =
                  item.id === 'events' &&
                  overview &&
                  overview.pending_triage > 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    title={`${item.label} [${item.key}]`}
                    className={`w-full relative flex items-center ${
                      sidebarCollapsed
                        ? 'justify-center py-2.5 px-0'
                        : 'justify-between px-3 py-2'
                    } rounded-[3px] text-xs font-mono transition-all ${
                      isActive
                        ? 'bg-white/[0.1] text-white border-l-2 border-l-sky-400 font-medium shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-sky-300' : 'text-slate-400'
                        }`}
                      />
                      {!sidebarCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </span>

                    {!sidebarCollapsed ? (
                      <span className="flex items-center gap-1.5">
                        {hasBadge && (
                          <span className="px-1.5 py-0.2 text-[10px] font-mono rounded-[2px] bg-red-500/20 text-red-300 border border-red-500/35">
                            {overview?.pending_triage}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-600">
                          [{item.key}]
                        </span>
                      </span>
                    ) : (
                      hasBadge && (
                        <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-red-500" />
                      )
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Bottom Sidebar Status / Expand Toggle */}
          {sidebarCollapsed ? (
            <div className="p-2.5 border-t border-white/[0.08] flex flex-col items-center gap-3">
              <span
                title={
                  overview?.system_health?.ml_engine_ready
                    ? 'Engine Ready'
                    : 'Syncing'
                }
                className={`w-2.5 h-2.5 rounded-full ${
                  overview?.system_health?.ml_engine_ready
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                    : 'bg-amber-400'
                }`}
              />
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-1.5 rounded-[3px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition"
                title="Expand Sidebar ([ or Ctrl+B)"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-3 m-2.5 rounded-[3px] bg-[#090c10] border border-white/[0.07] space-y-1.5 text-[10px] font-mono shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">PIPELINE</span>
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    overview?.system_health?.ml_engine_ready
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {overview?.system_health?.ml_engine_ready ? 'READY' : 'SYNC'}
                </span>
              </div>
              <div className="text-slate-400 truncate">
                ID: {overview?.system_health?.active_model_version || '—'}
              </div>
              <div className="text-slate-500 flex items-center justify-between">
                <span>INGEST:</span>
                <span className="text-slate-300">
                  {liveReplayActive ? 'REPLAY_STREAM' : 'BATCH_VERIFIED'}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Right Column: Fixed Top Bar + Independently Scrollable Main Viewport */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Locked Top Console Bar (Never Scrolls Out of View) */}
          <header className="h-14 bg-[#0d1117] border-b border-white/[0.08] px-5 flex items-center justify-between shrink-0 z-20">
            <div className="flex items-center gap-3 font-mono">
              <button
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="p-1.5 rounded-[3px] bg-[#090c10] border border-white/10 text-slate-300 hover:text-white hover:border-white/25 transition"
                title={
                  sidebarCollapsed
                    ? 'Open Sidebar ([ or Ctrl+B)'
                    : 'Close Sidebar ([ or Ctrl+B)'
                }
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="w-3.5 h-3.5 text-sky-400" />
                ) : (
                  <PanelLeftClose className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              <div className="flex items-center gap-2.5">
                <h1 className="text-base font-heading font-bold holographic-text tracking-wide">
                  {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Command Palette Trigger */}
              <MagneticButton
                onClick={() => setCmdOpen(true)}
                className="px-2.5 py-1.5 rounded-[6px] bg-[#21262d] border border-[#30363d] text-[11px] font-mono text-[#c9d1d9] hover:text-white hover:border-[#79c0ff] inline-flex items-center gap-2 transition"
                title="Open Command Palette (Ctrl+K)"
              >
                <Search className="w-3 h-3 text-[#79c0ff]" />
                <span className="hidden sm:inline">Search / Command</span>
                <kbd className="px-1 py-0.2 text-[9px] rounded-[3px] bg-[#0d1117] text-[#8b949e] border border-[#30363d]">
                  Ctrl+K
                </kbd>
              </MagneticButton>

              {/* Live Benchmark Replay Stream Toggle */}
              <MagneticButton
                onClick={() => setLiveReplayActive((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-[6px] text-[11px] font-mono border inline-flex items-center gap-1.5 transition ${
                  liveReplayActive
                    ? 'bg-[#2ea043]/20 text-[#56d364] border-[#2ea043]'
                    : 'bg-[#21262d] text-[#c9d1d9] border-[#30363d] hover:border-[#8b949e]'
                }`}
              >
                <Radio
                  className={`w-3 h-3 ${
                    liveReplayActive
                      ? 'text-[#56d364] animate-pulse'
                      : 'text-[#8b949e]'
                  }`}
                />
                <span>
                  {liveReplayActive ? 'STREAM: ACTIVE' : 'REPLAY STREAM'}
                </span>
              </MagneticButton>

              {/* Export CSV */}
              <a
                href={aegisApi.getExportCsvUrl()}
                download="aegisnet_forensic_events.csv"
                className="px-2.5 py-1.5 rounded-[6px] bg-[#21262d] border border-[#30363d] text-[11px] font-mono text-[#c9d1d9] hover:text-white hover:border-[#79c0ff] hidden md:inline-flex items-center gap-1.5 transition"
              >
                <Download className="w-3 h-3 text-[#79c0ff]" />
                <span>EXPORT CSV</span>
              </a>

              {/* Refresh */}
              <MagneticButton
                onClick={refreshCoreData}
                className="px-2.5 py-1.5 rounded-[6px] bg-[#21262d] border border-[#30363d] text-[11px] font-mono text-[#c9d1d9] hover:text-white hover:border-[#79c0ff] inline-flex items-center gap-1.5 transition"
              >
                <RefreshCw
                  className={`w-3 h-3 ${loading ? 'animate-spin text-[#79c0ff]' : ''}`}
                />
                <span className="hidden sm:inline">SYNC</span>
              </MagneticButton>
            </div>
          </header>

          {/* Stream Activity Banner */}
          {streamToast && (
            <div className="mx-5 mt-3 px-3.5 py-2 rounded-[3px] bg-[#0d1117] border border-white/15 border-l-2 border-l-emerald-400 flex items-center justify-between text-xs font-mono text-slate-200 shrink-0">
              <span>{streamToast}</span>
              <button
                onClick={() => setStreamToast(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Independently Scrollable Workspace Content */}
          <main className="p-5 flex-1 overflow-y-auto min-h-0">
            {backendError && (
              <div className="mb-4 bg-red-950/50 border border-red-500/40 rounded-[3px] p-3 text-xs font-mono text-red-200">
                [ERR_BACKEND_UNREACHABLE] {backendError}
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
      </div>

      {/* Locked Bottom Terminal Status Bar */}
      <footer className="h-7 bg-[#090c10] border-t border-white/[0.08] px-5 flex items-center justify-between text-[11px] font-mono text-slate-400 select-none shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Online
          </span>
          <span className="text-slate-500">
            {overview?.system_health?.active_model_version || 'v1.0'}
          </span>
        </div>
        <span className="text-slate-400">{utcClock}</span>
      </footer>

      {/* Command Palette Modal (Ctrl+K) */}
      {cmdOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="glass-modal w-full max-w-2xl rounded-[4px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-white/10 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Query event_uid, src_ip, dst_ip, signature, or execute command..."
                value={cmdQuery}
                onChange={(e) => setCmdQuery(e.target.value)}
                className="w-full bg-transparent text-xs font-mono text-white focus:outline-none"
              />
              <button
                onClick={() => setCmdOpen(false)}
                className="text-[10px] font-mono text-slate-400 hover:text-white px-1.5 py-0.5 rounded-[2px] border border-white/10"
              >
                ESC
              </button>
            </div>

            <div className="p-3.5 max-h-96 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  COMMANDS
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={handleQuickBenchmark}
                    className="p-2.5 rounded-[3px] bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-left text-xs font-mono flex items-center justify-between transition"
                  >
                    <span className="text-slate-200">
                      EXEC // BENCHMARK_SLICE_40
                    </span>
                    <span className="text-slate-400 text-[10px]">[ENTER]</span>
                  </button>
                  <button
                    onClick={() => {
                      setLiveReplayActive((prev) => !prev);
                      setCmdOpen(false);
                    }}
                    className="p-2.5 rounded-[3px] bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-left text-xs font-mono flex items-center justify-between transition"
                  >
                    <span className="text-slate-200">
                      STREAM // {liveReplayActive ? 'STOP_REPLAY' : 'START_REPLAY'}
                    </span>
                    <span className="text-slate-400 text-[10px]">[TOGGLE]</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  MATCHING FLOW RECORDS ({recentMatches.length})
                </div>
                <div className="space-y-1">
                  {recentMatches.slice(0, 8).map((ev) => (
                    <div
                      key={ev.event_uid}
                      onClick={() => handleInspectEvent(ev.event_uid)}
                      className="p-2 rounded-[3px] bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.07] cursor-pointer flex items-center justify-between text-xs font-mono transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-200 font-semibold">
                          {ev.event_uid}
                        </span>
                        <span className="text-slate-400">
                          {ev.src_ip} → {ev.dst_ip}:{ev.dst_port}
                        </span>
                        <TriageBadge category={ev.triage_category} />
                      </div>
                      <span className="text-slate-400">
                        P={(ev.supervised_confidence * 100).toFixed(0)}% | p
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
