import React, { useEffect, useState } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { aegisApi } from '../api/client';
import type { ModelRunRecord } from '../types/aegis';

interface Props {
  onModelTrained: () => void;
}

export const ModelLabScreen: React.FC<Props> = ({ onModelTrained }) => {
  const [subTab, setSubTab] = useState<
    'benchmark' | 'matrix' | 'train' | 'audit'
  >('benchmark');
  const [activeModel, setActiveModel] = useState<ModelRunRecord | null>(null);
  const [runs, setRuns] = useState<ModelRunRecord[]>([]);
  const [families, setFamilies] = useState<string[]>([]);

  const [splitStrategy, setSplitStrategy] = useState<
    'group_time_aware' | 'stratified'
  >('group_time_aware');
  const [heldOut, setHeldOut] = useState<string[]>(['Botnet', 'WebAttack']);
  const [sampleSize, setSampleSize] = useState(3200);
  const [rfTrees, setRfTrees] = useState(120);
  const [ifTrees, setIfTrees] = useState(150);
  const [seed, setSeed] = useState(42);
  const [training, setTraining] = useState(false);

  const loadModels = async () => {
    const res = await aegisApi.getModelsLab();
    setActiveModel(res.active_model);
    setRuns(res.runs);
    setFamilies(res.available_attack_families);
  };

  useEffect(() => {
    loadModels();
  }, []);

  const toggleFamily = (fam: string) => {
    setHeldOut((prev) =>
      prev.includes(fam) ? prev.filter((x) => x !== fam) : [...prev, fam]
    );
  };

  const handleTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    setTraining(true);
    try {
      const res = await aegisApi.triggerTraining({
        split_strategy: splitStrategy,
        held_out_families: heldOut.length > 0 ? heldOut : ['Botnet'],
        sample_size: sampleSize,
        n_estimators_rf: rfTrees,
        n_estimators_if: ifTrees,
        random_seed: seed,
      });
      setActiveModel(res.model_run);
      await loadModels();
      onModelTrained();
      setSubTab('benchmark');
    } finally {
      setTraining(false);
    }
  };

  if (!activeModel) {
    return (
      <div className="p-8 text-sm text-slate-400 font-mono">
        Loading Model Lab benchmark artifacts...
      </div>
    );
  }

  const closedSet = activeModel.metrics.closed_set;
  const openSet = activeModel.metrics.open_set;
  const calibration = activeModel.metrics.calibration;
  const eda = activeModel.eda_summary;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* GradeGuide Sub-Navigation Bar (.nav-tab) */}
      <div className="nav-container">
        <div
          className={`nav-tab ${subTab === 'benchmark' ? 'active' : ''}`}
          onClick={() => setSubTab('benchmark')}
        >
          1. Active Model Benchmark ({activeModel.version})
        </div>
        <div
          className={`nav-tab ${subTab === 'matrix' ? 'active' : ''}`}
          onClick={() => setSubTab('matrix')}
        >
          2. Confusion Matrix & Calibration
        </div>
        <div
          className={`nav-tab ${subTab === 'train' ? 'active' : ''}`}
          onClick={() => setSubTab('train')}
        >
          3. Run New Experiment
        </div>
        <div
          className={`nav-tab ${subTab === 'audit' ? 'active' : ''}`}
          onClick={() => setSubTab('audit')}
        >
          4. EDA Audit & Model Comparison
        </div>
      </div>

      {/* TAB 1: Active Model Headline Benchmark */}
      {subTab === 'benchmark' && (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#21262d] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-heading font-semibold text-white">
                  Active Model Benchmark — {activeModel.version}
                </h3>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Dataset: {activeModel.dataset_name} ({activeModel.dataset_source}
                ) | Split: {activeModel.split_strategy}
              </p>
            </div>
            <span className="text-xs font-mono px-3 py-1 rounded bg-[#161b22] border border-[#21262d] text-slate-300">
              Train: {activeModel.train_rows} | Test: {activeModel.test_rows} |
              Open-Set: {activeModel.open_set_rows}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-4 rounded bg-[#161b22] border border-[#21262d]">
              <div className="text-[10px] text-slate-400">
                CLOSED-SET ACCURACY
              </div>
              <div className="text-2xl font-semibold text-emerald-300 mt-1">
                {(activeModel.accuracy * 100).toFixed(2)}%
              </div>
            </div>
            <div className="p-4 rounded bg-[#161b22] border border-[#21262d]">
              <div className="text-[10px] text-slate-400">
                CLOSED-SET MACRO F1
              </div>
              <div className="text-2xl font-semibold text-sky-300 mt-1">
                {(activeModel.macro_f1 * 100).toFixed(2)}%
              </div>
            </div>
            <div className="p-4 rounded bg-[#161b22] border border-[#21262d]">
              <div className="text-[10px] text-slate-400">
                OPEN-SET AUROC / AUPRC
              </div>
              <div className="text-2xl font-semibold text-[#d2a8ff] mt-1">
                {activeModel.open_set_auroc.toFixed(3)} /{' '}
                {activeModel.open_set_auprc.toFixed(3)}
              </div>
            </div>
            <div className="p-4 rounded bg-[#161b22] border border-[#21262d]">
              <div className="text-[10px] text-slate-400">
                CALIBRATION ECE / BRIER
              </div>
              <div className="text-2xl font-semibold text-amber-300 mt-1">
                {activeModel.expected_calibration_error.toFixed(4)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="border-b border-[#21262d] text-slate-400">
                  <th className="py-2 pr-3">KNOWN TRAINING CLASS</th>
                  <th className="py-2 px-3 text-right">PRECISION</th>
                  <th className="py-2 px-3 text-right">RECALL</th>
                  <th className="py-2 px-3 text-right">F1-SCORE</th>
                  <th className="py-2 pl-3 text-right">TEST SUPPORT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {closedSet.per_class.map((c) => (
                  <tr key={c.class_name}>
                    <td className="py-2.5 pr-3 text-slate-200">
                      {c.class_name}
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-300">
                      {(c.precision * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-300">
                      {(c.recall * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-100 font-semibold">
                      {(c.f1_score * 100).toFixed(2)}%
                    </td>
                    <td className="py-2.5 pl-3 text-right text-slate-400">
                      {c.support}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Confusion Matrix & Probability Calibration Reliability Curve */}
      {subTab === 'matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Closed-Set Confusion Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Evaluated strictly on held-out test split ({activeModel.test_rows}{' '}
                flows)
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#21262d] text-slate-400">
                    <th className="p-2 text-left">TRUE \ PRED</th>
                    {closedSet.class_labels.map((lbl) => (
                      <th key={lbl} className="p-2 text-right">
                        {lbl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161b22]">
                  {closedSet.confusion_matrix.map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td className="p-2 font-semibold text-slate-300">
                        {closedSet.class_labels[rIdx]}
                      </td>
                      {row.map((val, cIdx) => {
                        const isDiag = rIdx === cIdx;
                        return (
                          <td
                            key={cIdx}
                            className={`p-2 text-right ${
                              isDiag && val > 0
                                ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                                : val > 0
                                ? 'bg-red-500/15 text-red-300'
                                : 'text-slate-600'
                            }`}
                          >
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Probability Calibration & Open-Set Metrics
              </h3>
              <p className="text-xs text-slate-400">
                {calibration.method} — ECE:{' '}
                {calibration.calibrated.expected_calibration_error.toFixed(4)}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-[10px] text-slate-400">
                  RECALL @ 5% FPR
                </div>
                <div className="text-purple-300 font-semibold mt-0.5">
                  {(openSet.recall_at_5pct_fpr * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-[10px] text-slate-400">
                  OPEN-SET PRECISION
                </div>
                <div className="text-sky-300 font-semibold mt-0.5">
                  {(openSet.precision_at_threshold * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-2.5 rounded bg-[#161b22] border border-[#21262d]">
                <div className="text-[10px] text-slate-400">EMPIRICAL FPR</div>
                <div className="text-emerald-300 font-semibold mt-0.5">
                  {(openSet.empirical_fpr * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#21262d] text-slate-400">
                    <th className="py-1.5 pr-2">CONF BIN</th>
                    <th className="py-1.5 px-2 text-right">SAMPLES</th>
                    <th className="py-1.5 px-2 text-right">MEAN CONF</th>
                    <th className="py-1.5 px-2 text-right">EMPIRICAL ACC</th>
                    <th className="py-1.5 pl-2 text-right">|GAP|</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#161b22]">
                  {calibration.calibrated.reliability_bins
                    .filter((b) => b.count > 0)
                    .map((b) => (
                      <tr key={b.bin_range}>
                        <td className="py-1.5 pr-2 text-slate-300">
                          {b.bin_range}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-400">
                          {b.count}
                        </td>
                        <td className="py-1.5 px-2 text-right text-sky-300">
                          {(b.mean_confidence * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-emerald-300">
                          {(b.empirical_accuracy * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 pl-2 text-right text-amber-300">
                          {(b.calibration_gap * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Reproducible Experiment Runner */}
      {subTab === 'train' && (
        <form
          onSubmit={handleTrain}
          className="max-w-2xl bg-[#0d1117] border border-[#21262d] rounded-lg p-6 space-y-5"
        >
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-heading font-semibold text-white">
              Run Reproducible Training & Open-Set Experiment
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <label className="text-slate-400 block mb-1">
                SPLIT STRATEGY
              </label>
              <select
                value={splitStrategy}
                onChange={(e) => setSplitStrategy(e.target.value as any)}
                className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-slate-200"
              >
                <option value="group_time_aware">
                  Group / Session-Aware (No Leakage)
                </option>
                <option value="stratified">Stratified Shuffle Split</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">SAMPLE SIZE</label>
              <input
                type="number"
                min={800}
                max={12000}
                value={sampleSize}
                onChange={(e) => setSampleSize(Number(e.target.value))}
                className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">RF ESTIMATORS</label>
              <input
                type="number"
                min={40}
                max={300}
                value={rfTrees}
                onChange={(e) => setRfTrees(Number(e.target.value))}
                className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-slate-200"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">IF ESTIMATORS</label>
              <input
                type="number"
                min={50}
                max={300}
                value={ifTrees}
                onChange={(e) => setIfTrees(Number(e.target.value))}
                className="w-full bg-[#090c10] border border-[#21262d] rounded px-3 py-2 text-slate-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-slate-400 block">
              HELD-OUT ATTACK FAMILIES (EXCLUDED FROM TRAINING FOR OPEN-SET
              EVAL)
            </label>
            <div className="flex flex-wrap gap-2">
              {families.map((fam) => {
                const selected = heldOut.includes(fam);
                return (
                  <button
                    type="button"
                    key={fam}
                    onClick={() => toggleFamily(fam)}
                    className={`px-3 py-1.5 text-xs font-mono rounded border transition ${
                      selected
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        : 'bg-[#090c10] text-slate-400 border-[#21262d]'
                    }`}
                  >
                    {fam} {selected ? '(Held Out)' : '(Known)'}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={training}
            className="w-full py-2.5 px-4 text-xs font-mono font-medium rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 disabled:opacity-40 inline-flex items-center justify-center gap-2 transition"
          >
            <Play className="w-3.5 h-3.5" />
            {training
              ? 'Training RF + Calibration + Isolation Forest...'
              : 'Execute Reproducible Experiment'}
          </button>
        </form>
      )}

      {/* TAB 4: EDA, Leakage Prevention & Limitations */}
      {subTab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                Exploratory Data Analysis (EDA) & Leakage Prevention Audit
              </h3>
            </div>
            <div className="text-xs font-mono text-slate-400">
              Total Clean Flows: {eda.total_clean_rows} | Imbalance Ratio
              (Max:Min): {eda.imbalance_ratio_max_to_min}:1
            </div>
            <div className="space-y-2 text-xs text-slate-300">
              {eda.leakage_prevention_notes.map((note, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded bg-[#161b22]/70 border border-[#21262d]"
                >
                  • {note}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-slate-200">
                Model Comparison & Documented Scientific Limitations
              </h3>
            </div>
            <div className="space-y-2.5 text-xs">
              {activeModel.metrics.model_comparison.map((mc) => (
                <div
                  key={mc.model_name}
                  className="p-3 rounded bg-[#161b22]/70 border border-[#21262d] space-y-1"
                >
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-200 font-semibold">
                      {mc.model_name}
                    </span>
                    <span className="text-sky-300">{mc.headline_metric}</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{mc.strengths}</p>
                  <p className="text-amber-300/90 text-[11px]">
                    Limitation: {mc.limitations}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
