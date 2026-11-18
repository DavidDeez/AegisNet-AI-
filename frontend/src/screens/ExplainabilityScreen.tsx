import React, { useEffect, useState } from 'react';
import { Sparkles, HelpCircle } from 'lucide-react';
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
    <div className="space-y-6">
      {/* Methodology Header */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-3xl">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Explainable AI (XAI) — Global & Local TreeSHAP Feature Attributions
            </h3>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {globalData?.methodology_note ||
              'Additive decision-tree feature attribution showing how each network flow attribute shifts prediction probability from the prior baseline.'}
          </p>
        </div>
        {globalData && (
          <div className="text-xs font-mono bg-[#161b22] border border-[#21262d] rounded px-3 py-2 text-slate-300">
            <div>Backend: {globalData.explainer_backend}</div>
            <div className="text-slate-500">Model: {globalData.model_version}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Global Feature Importance (5 cols) */}
        <div className="lg:col-span-5 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Global Feature Importance Ranking
            </h3>
            <p className="text-xs text-slate-400">
              Mean |SHAP| magnitude across evaluation flows vs. Gini impurity reduction
            </p>
          </div>

          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {globalData?.global_importance.slice(0, 16).map((item) => {
              const barPct = (item.mean_abs_shap / maxGlobalShap) * 100;
              return (
                <div
                  key={item.feature}
                  className="p-2.5 rounded bg-[#161b22]/60 border border-[#21262d] space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-200 font-medium">
                      #{item.rank} {item.feature}
                    </span>
                    <span className="text-sky-300">
                      |SHAP|: {item.mean_abs_shap.toFixed(4)} | Gini:{' '}
                      {item.gini_importance.toFixed(3)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[#090c10] rounded overflow-hidden">
                    <div
                      className="h-full bg-sky-400"
                      style={{ width: `${Math.min(100, barPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>{item.description}</span>
                    <span className="font-mono text-slate-500">
                      Med: {item.train_median}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Local Single-Event Waterfall & Rationale (7 cols) */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#21262d] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Local Flow Attribution Waterfall
              </h3>
              <p className="text-xs text-slate-400">
                Exact additive decomposition: Base Value E[f(X)] + Σ SHAP_i = Predicted Class Probability
              </p>
            </div>

            <select
              value={activeUid || ''}
              onChange={(e) => onSelectEventUid(e.target.value)}
              className="bg-[#090c10] border border-[#21262d] rounded px-3 py-1.5 text-xs font-mono text-slate-200"
            >
              {recentEvents.map((ev) => (
                <option key={ev.event_uid} value={ev.event_uid}>
                  {ev.event_uid} — {ev.predicted_label} ({ev.triage_category})
                </option>
              ))}
            </select>
          </div>

          {loadingLocal ? (
            <div className="py-12 text-center text-xs font-mono text-slate-400">
              Computing local TreeSHAP attributions...
            </div>
          ) : !localEvent || !localEvent.explanation ? (
            <div className="py-12 text-center text-xs font-mono text-slate-500">
              Select an analyzed flow event to inspect its local SHAP explanation.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded bg-[#161b22] border border-[#21262d]">
                  <div className="text-[10px] text-slate-400">TARGET CLASS</div>
                  <div className="text-slate-100 font-semibold mt-0.5 truncate">
                    {localEvent.explanation.target_class}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#161b22] border border-[#21262d]">
                  <div className="text-[10px] text-slate-400">PRIOR BASE VALUE</div>
                  <div className="text-slate-300 mt-0.5">
                    {localEvent.explanation.base_value.toFixed(4)}
                  </div>
                </div>
                <div className="p-3 rounded bg-[#161b22] border border-[#21262d]">
                  <div className="text-[10px] text-slate-400">FINAL CLASS PROB</div>
                  <div className="text-sky-300 font-semibold mt-0.5">
                    {(localEvent.supervised_confidence * 100).toFixed(2)}%
                  </div>
                </div>
                <div className="p-3 rounded bg-[#161b22] border border-[#21262d]">
                  <div className="text-[10px] text-slate-400">ANOMALY / ENTROPY</div>
                  <div className="text-purple-300 mt-0.5">
                    p{localEvent.anomaly_percentile.toFixed(1)} | H=
                    {localEvent.predictive_entropy.toFixed(3)}
                  </div>
                </div>
              </div>

              {/* Analyst Narrative Rationale */}
              <div className="p-3.5 rounded bg-sky-950/20 border border-sky-500/30 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-mono font-semibold text-sky-300">
                    DECISION RATIONALE ({localEvent.event_uid})
                  </span>
                  <div className="flex items-center gap-2">
                    <TriageBadge category={localEvent.triage_category} />
                    <SeverityBadge severity={localEvent.severity} />
                    <button
                      type="button"
                      onClick={handleGenerateBrief}
                      disabled={loadingBrief}
                      className="px-2.5 py-1 text-[11px] font-mono font-medium rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-40 transition"
                    >
                      {loadingBrief
                        ? 'Synthesizing SOC Brief...'
                        : 'Generate Fireworks AI SOC Brief'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {localEvent.rationale_text}
                </p>

                {aiBrief && (
                  <div className="mt-3 p-3.5 rounded bg-[#090c10] border border-purple-500/35 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-purple-300 border-b border-[#21262d] pb-1.5">
                      <span>
                        SOC INCIDENT BRIEF ({aiBrief.provider.toUpperCase()} — {aiBrief.model})
                      </span>
                      <span>{aiBrief.latency_ms} ms</span>
                    </div>
                    <pre className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {aiBrief.brief_markdown}
                    </pre>
                  </div>
                )}
              </div>

              {/* Bidirectional SHAP Bar Chart */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-xs font-mono text-slate-400">
                  <span>ATTRIBUTE & OBSERVED VALUE (VS BASELINE MEDIAN)</span>
                  <span>SHAP CONTRIBUTION (Δ PROBABILITY)</span>
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
                      className="p-2.5 rounded bg-[#161b22]/60 border border-[#21262d] space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div>
                          <span className="text-slate-200 font-semibold">
                            {c.feature}
                          </span>{' '}
                          <span className="text-sky-300">= {c.feature_value}</span>{' '}
                          <span className="text-slate-500">
                            (median: {c.train_median}, z={c.robust_z_score >= 0 ? '+' : ''}
                            {c.robust_z_score})
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
                      <div className="h-2 w-full bg-[#090c10] rounded overflow-hidden flex">
                        <div
                          className={`h-full ${
                            isPos ? 'bg-red-500/80' : 'bg-emerald-500/80'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {c.description}
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
