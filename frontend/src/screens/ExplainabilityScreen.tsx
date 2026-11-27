import React, { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { aegisApi } from '../api/client';
import type { GlobalImportanceItem, NetworkEventRecord } from '../types/aegis';
import { SeverityBadge, TriageBadge } from '../components/Badge';

interface Props {
  selectedEventUid: string | null;
  recentEvents: NetworkEventRecord[];
  onSelectEventUid: (uid: string) => void;
}

export const ExplainabilityScreen: React.FC<Props> = ({
  selectedEventUid,
  recentEvents,
  onSelectEventUid,
}) => {
  const [globalData, setGlobalData] = useState<{
    model_version: string;
    explainer_backend: string;
    fireworks_ai_configured?: boolean;
    fireworks_model?: string;
    global_importance: GlobalImportanceItem[];
    methodology_note: string;
  } | null>(null);

  const [localEvent, setLocalEvent] = useState<NetworkEventRecord | null>(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [aiBrief, setAiBrief] = useState<{
    provider: string;
    model: string;
    latency_ms: number;
    brief_markdown: string;
  } | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(false);

  useEffect(() => {
    aegisApi.getGlobalExplainability().then(setGlobalData).catch(() => {});
  }, []);

  const activeUid =
    selectedEventUid ||
    (recentEvents.length > 0 ? recentEvents[0].event_uid : null);

  useEffect(() => {
    if (!activeUid) return;
    setLoadingLocal(true);
    setAiBrief(null);
    aegisApi
      .getEventExplanation(activeUid)
      .then(setLocalEvent)
      .catch(() => {})
      .finally(() => setLoadingLocal(false));
  }, [activeUid]);

  const handleGenerateBrief = async () => {
    if (!activeUid) return;
    setLoadingBrief(true);
    try {
      const res = await aegisApi.generateEventAiBrief(activeUid);
      setAiBrief(res);
    } finally {
      setLoadingBrief(false);
    }
  };

  const maxGlobalShap = Math.max(
    0.001,
    ...(globalData?.global_importance.map((g) => g.mean_abs_shap) || [0.05])
  );

  const contributors = localEvent?.explanation?.top_contributors || [];
  const maxLocalAbs = Math.max(
    0.001,
    ...contributors.map((c) => Math.abs(c.shap_value))
  );

  return (
    <div className="space-y-4">
      {/* Compact Console Telemetry Strip (Replaces Textbook XAI Banner & Sparkles Icon) */}
      <div className="bg-[#0d1117] border border-white/10 rounded px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-200 font-semibold">
            TREESHAP ATTRIBUTION ENGINE // E[f(X)] + Σ φ_i = P(y|x)
          </span>
        </div>
        {globalData && (
          <div className="text-[11px] text-slate-400 flex items-center gap-4">
            <span>BACKEND: {globalData.explainer_backend}</span>
            <span>ARTIFACT: {globalData.model_version}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Global Feature Importance Ledger (5 cols) */}
        <div className="lg:col-span-5 bg-[#0d1117] border border-white/10 rounded">
          <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between font-mono">
            <span className="text-xs font-semibold text-slate-200">
              GLOBAL_IMPORTANCE // MEAN(|SHAP|) & GINI
            </span>
            <span className="text-[10px] text-slate-500">[24 FEATURES]</span>
          </div>

          <div className="p-3 space-y-2 max-h-[640px] overflow-y-auto">
            {globalData?.global_importance.slice(0, 14).map((item) => {
              const barPct = (item.mean_abs_shap / maxGlobalShap) * 100;
              return (
                <div
                  key={item.feature}
                  title={`${item.description} (Train Median: ${item.train_median})`}
                  className="p-2.5 rounded-[4px] bg-[#090c10] border border-white/[0.06] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-200 font-medium">
                      {String(item.rank).padStart(2, '0')}. {item.feature}
                    </span>
                    <span className="text-[#79c0ff] text-[11px]">
                      {item.mean_abs_shap.toFixed(4)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#07080c] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#79c0ff]"
                      style={{ width: `${Math.min(100, barPct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Local Single-Event Waterfall & Playbook Synthesis (7 cols) */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-white/10 rounded">
          <div className="px-4 py-3 border-b border-white/[0.07] flex flex-wrap items-center justify-between gap-3 font-mono">
            <span className="text-xs font-semibold text-slate-200">
              LOCAL_FLOW_WATERFALL // ADDITIVE_DECOMPOSITION
            </span>

            <select
              value={activeUid || ''}
              onChange={(e) => onSelectEventUid(e.target.value)}
              className="bg-[#090c10] border border-white/10 rounded-[2px] px-2.5 py-1 text-xs font-mono text-slate-200"
            >
              {recentEvents.map((ev) => (
                <option key={ev.event_uid} value={ev.event_uid}>
                  {ev.event_uid} — {ev.predicted_label} [{ev.triage_category}]
                </option>
              ))}
            </select>
          </div>

          {loadingLocal ? (
            <div className="py-16 text-center text-xs font-mono text-slate-500">
              [COMPUTING_LOCAL_TREESHAP_PATH...]
            </div>
          ) : !localEvent || !localEvent.explanation ? (
            <div className="py-16 text-center text-xs font-mono text-slate-500">
              [SELECT_FLOW_RECORD_TO_INSPECT_SHAP]
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Unified 4-Cell Additive Decomposition Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.07] bg-[#090c10] border border-white/10 rounded-[2px] text-xs font-mono">
                <div className="p-2.5">
                  <div className="text-[10px] text-slate-500">TARGET_CLASS</div>
                  <div className="text-slate-100 font-semibold mt-0.5 truncate">
                    {localEvent.explanation.target_class}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-slate-500">PRIOR E[f(X)]</div>
                  <div className="text-slate-300 mt-0.5">
                    {localEvent.explanation.base_value.toFixed(4)}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-slate-500">POSTERIOR P(y|x)</div>
                  <div className="text-white font-semibold mt-0.5">
                    {(localEvent.supervised_confidence * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="text-[10px] text-slate-500">IF_PCTL // H(p)</div>
                  <div className="text-amber-300 mt-0.5">
                    p{localEvent.anomaly_percentile.toFixed(1)} //{' '}
                    {localEvent.predictive_entropy.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Decision Rationale & Incident Playbook Synthesis */}
              <div className="p-3 rounded-[2px] bg-[#090c10] border border-white/10 space-y-2.5 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-300">
                    RATIONALE // {localEvent.event_uid}
                  </span>
                  <div className="flex items-center gap-2">
                    <TriageBadge category={localEvent.triage_category} />
                    <SeverityBadge severity={localEvent.severity} />
                    <button
                      type="button"
                      onClick={handleGenerateBrief}
                      disabled={loadingBrief}
                      className="px-2.5 py-1 text-[10px] font-medium rounded-[2px] bg-white/[0.08] text-slate-100 border border-white/15 hover:bg-white/[0.14] disabled:opacity-40 transition"
                    >
                      {loadingBrief
                        ? 'SYNTHESIZING...'
                        : 'SYNTHESIZE // INCIDENT_PLAYBOOK'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {localEvent.rationale_text}
                </p>

                {aiBrief && (
                  <div className="mt-3 p-3 rounded-[2px] bg-[#07080c] border border-white/15 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-b border-white/10 pb-1.5">
                      <span>
                        INCIDENT_PLAYBOOK // ENGINE: {aiBrief.model}
                      </span>
                      <span>{aiBrief.latency_ms} ms</span>
                    </div>
                    <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {aiBrief.brief_markdown}
                    </pre>
                  </div>
                )}
              </div>

              {/* Bidirectional SHAP Attribution Table */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>FEATURE_VECTOR (OBSERVED VS. TRAINING_MEDIAN)</span>
                  <span>Δ_PROBABILITY (φ_i)</span>
                </div>

                {contributors.map((c) => {
                  const widthPct = Math.min(
                    100,
                    (Math.abs(c.shap_value) / maxLocalAbs) * 100
                  );
                  const isPos = c.shap_value >= 0;
                  return (
                    <div
                      key={c.feature}
                      className="p-2.5 rounded-[2px] bg-[#090c10] border border-white/[0.06] space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-slate-100 font-medium">
                            {c.feature}
                          </span>{' '}
                          <span className="text-slate-300">
                            = {c.feature_value}
                          </span>{' '}
                          <span className="text-slate-500 text-[11px]">
                            [med: {c.train_median}, IQR_z:{' '}
                            {c.robust_z_score >= 0 ? '+' : ''}
                            {c.robust_z_score}]
                          </span>
                        </div>
                        <span
                          className={`font-semibold ${
                            isPos ? 'text-red-300' : 'text-emerald-300'
                          }`}
                        >
                          {isPos ? '+' : ''}
                          {c.shap_value.toFixed(4)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-[#07080c] rounded-[1px] overflow-hidden flex">
                        <div
                          className={`h-full ${
                            isPos ? 'bg-red-500/80' : 'bg-emerald-500/80'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
