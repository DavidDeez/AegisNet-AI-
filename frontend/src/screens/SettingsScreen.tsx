import React, { useEffect, useState } from 'react';
import { Settings, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { aegisApi } from '../api/client';

interface Props {
  onSettingsChanged: () => void;
}

export const SettingsScreen: React.FC<Props> = ({ onSettingsChanged }) => {
  const [cfg, setCfg] = useState<Record<string, any> | null>(null);
  const [aiCopilot, setAiCopilot] = useState<Record<string, any> | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    aegisApi.getSettings().then((res) => {
      setCfg(res.settings);
      setAiCopilot(res.ai_copilot || null);
      setDocs(res.threshold_documentation);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfg) return;
    setSaving(true);
    setSavedBanner(false);
    try {
      const res = await aegisApi.updateSettings(cfg);
      setCfg(res.settings);
      setSavedBanner(true);
      onSettingsChanged();
    } finally {
      setSaving(false);
    }
  };

  const handleClearEvents = async () => {
    await aegisApi.clearEvents();
    onSettingsChanged();
  };

  if (!cfg) {
    return (
      <div className="p-8 text-sm text-slate-400 font-mono">
        Loading detection thresholds and runtime settings...
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {savedBanner && (
        <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-lg p-3.5 flex items-center gap-2.5 text-xs text-emerald-200 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>
            Runtime detection, uncertainty, and drift thresholds persisted to database.
          </span>
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="bg-[#0d1117] border border-[#21262d] rounded-lg p-6 space-y-6"
      >
        <div className="flex items-center gap-2 border-b border-[#21262d] pb-3">
          <Settings className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            Decision Engine, Uncertainty & Anomaly Thresholds
          </h3>
        </div>

        {aiCopilot && (
          <div className="p-3.5 rounded bg-[#161b22]/80 border border-[#21262d] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div>
              <div className="text-slate-200 font-semibold">
                FIREWORKS AI SOC BRIEFING INTEGRATION (.env)
              </div>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Model: {aiCopilot.model} | Key: {aiCopilot.masked_api_key}
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded border ${
                aiCopilot.fireworks_configured
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {aiCopilot.fireworks_configured
                ? 'CONNECTED (ENV SECRET)'
                : 'LOCAL DETERMINISTIC MODE'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200 flex justify-between">
              <span>SUPERVISED CONFIDENCE THRESHOLD (τ_c)</span>
              <span className="text-sky-300">{cfg.confidence_threshold}</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.30"
              max="0.99"
              value={cfg.confidence_threshold}
              onChange={(e) =>
                setCfg({ ...cfg, confidence_threshold: Number(e.target.value) })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {docs.confidence_threshold}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200 flex justify-between">
              <span>SHANNON ENTROPY UNCERTAINTY CEILING (τ_H)</span>
              <span className="text-amber-300">{cfg.entropy_threshold}</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.10"
              max="0.95"
              value={cfg.entropy_threshold}
              onChange={(e) =>
                setCfg({ ...cfg, entropy_threshold: Number(e.target.value) })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {docs.entropy_threshold}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200 flex justify-between">
              <span>ISOLATION FOREST ANOMALY PERCENTILE (τ_IF)</span>
              <span className="text-purple-300">
                p{cfg.anomaly_percentile_threshold}
              </span>
            </label>
            <input
              type="number"
              step="0.5"
              min="75.0"
              max="99.9"
              value={cfg.anomaly_percentile_threshold}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  anomaly_percentile_threshold: Number(e.target.value),
                })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {docs.anomaly_percentile_threshold}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200 flex justify-between">
              <span>MAX EAGER SHAP EXPLANATIONS PER BATCH</span>
              <span className="text-slate-300">
                {cfg.max_shap_rows_per_batch}
              </span>
            </label>
            <input
              type="number"
              min="10"
              max="500"
              value={cfg.max_shap_rows_per_batch}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  max_shap_rows_per_batch: Number(e.target.value),
                })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              All non-benign detections always receive immediate TreeSHAP explanations; benign events beyond this batch cap are explained on demand when inspected.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200">
              PSI WARNING DRIFT THRESHOLD
            </label>
            <input
              type="number"
              step="0.01"
              min="0.05"
              max="0.50"
              value={cfg.drift_psi_warning_threshold}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  drift_psi_warning_threshold: Number(e.target.value),
                })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400">
              {docs.drift_psi_warning_threshold}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-200">
              PSI CRITICAL DRIFT THRESHOLD
            </label>
            <input
              type="number"
              step="0.01"
              min="0.10"
              max="1.00"
              value={cfg.drift_psi_critical_threshold}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  drift_psi_critical_threshold: Number(e.target.value),
                })
              }
              className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-xs font-mono text-slate-200"
            />
            <p className="text-[11px] text-slate-400">
              {docs.drift_psi_critical_threshold}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-2">
          <input
            type="checkbox"
            checked={Boolean(cfg.auto_escalate_critical_anomalies)}
            onChange={(e) =>
              setCfg({
                ...cfg,
                auto_escalate_critical_anomalies: e.target.checked,
              })
            }
            className="rounded border-slate-700 bg-slate-900"
          />
          Automatically mark CRITICAL severity `ANOMALOUS_UNKNOWN` events as `ESCALATED`
        </label>

        <div className="flex items-center justify-between border-t border-[#21262d] pt-4">
          <button
            type="button"
            onClick={handleClearEvents}
            className="px-3.5 py-2 text-xs font-mono text-red-300 bg-red-500/10 border border-red-500/30 rounded hover:bg-red-500/20 inline-flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge Analyzed Event Log (Test Empty State)
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs font-mono font-medium bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded hover:bg-sky-500/30 inline-flex items-center gap-1.5 transition"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};
