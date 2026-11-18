import React, { useCallback, useEffect, useState } from 'react';
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
          'Unable to reach AegisNet FastAPI backend on port 8000.'
      );
    } finally {
      setLoading(false);
    }
  }, [selectedEventUid]);

  useEffect(() => {
    refreshCoreData();
  }, []);

  const handleInspectEvent = (eventUid: string) => {
    setSelectedEventUid(eventUid);
    setActiveTab('events');
  };

  const handleOpenExplainability = (eventUid: string) => {
    setSelectedEventUid(eventUid);
    setActiveTab('explainability');
  };

  return (
    <div className="min-h-screen bg-[#090c10] text-[#e6edf3] flex">
      {/* Left Operations Sidebar */}
      <aside className="w-64 bg-[#0d1117] border-r border-[#21262d] flex flex-col justify-between shrink-0">
        <div>
          <div className="p-5 border-b border-[#21262d] flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-sky-500/15 border border-sky-500/40 flex items-center justify-center">
              <Shield className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight text-slate-100">
                AEGISNET
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                NIDS & OPEN-SET XAI PLATFORM
              </div>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition ${
                    isActive
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#161b22] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Status */}
        <div className="p-4 border-t border-[#21262d] space-y-2 text-[11px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">ENGINE STATUS</span>
            <span
              className={`inline-flex items-center gap-1.5 ${
                overview?.system_health?.ml_engine_ready
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current" />
              {overview?.system_health?.ml_engine_ready ? 'ONLINE' : 'CONNECTING'}
            </span>
          </div>
          <div className="text-slate-500 truncate">
            Model: {overview?.system_health?.active_model_version || '—'}
          </div>
          <div className="text-slate-500">
            Sensor Mode: Batch / API Verified
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 bg-[#0d1117] border-b border-[#21262d] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-slate-100">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </h1>
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              | Calibrated Random Forest + Isolation Forest Open-Set Triage + TreeSHAP
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshCoreData}
              className="px-2.5 py-1.5 rounded bg-[#161b22] border border-[#21262d] text-xs font-mono text-slate-300 hover:text-white inline-flex items-center gap-1.5"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </button>
          </div>
        </header>

        {/* Body */}
        <main className="p-6 flex-1 overflow-y-auto">
          {backendError && (
            <div className="mb-6 bg-red-950/50 border border-red-500/40 rounded-lg p-4 text-xs font-mono text-red-200">
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
    </div>
  );
};
export default App;
