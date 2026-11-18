import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  CheckCircle,
  AlertOctagon,
  Eye,
  ArrowUpRight,
} from 'lucide-react';
import { aegisApi } from '../api/client';
import type { NetworkEventRecord, ReviewStatus } from '../types/aegis';
import {
  ReviewBadge,
  ScoreMeter,
  SeverityBadge,
  TriageBadge,
} from '../components/Badge';

interface Props {
  selectedEventUid: string | null;
  onSelectEventUid: (uid: string) => void;
  onOpenExplainability: (uid: string) => void;
  onEventUpdated: () => void;
}

export const EventExplorerScreen: React.FC<Props> = ({
  selectedEventUid,
  onSelectEventUid,
  onOpenExplainability,
  onEventUpdated,
}) => {
  const [events, setEvents] = useState<NetworkEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [triageFilter, setTriageFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [reviewFilter, setReviewFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyAnomalous, setOnlyAnomalous] = useState(false);

  const [detailEvent, setDetailEvent] = useState<NetworkEventRecord | null>(
    null
  );
  const [reviewStatusInput, setReviewStatusInput] =
    useState<ReviewStatus>('UNREVIEWED');
  const [analystNotesInput, setAnalystNotesInput] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await aegisApi.listEvents({
        limit: 80,
        offset: 0,
        triage_category: triageFilter,
        severity: severityFilter,
        review_status: reviewFilter,
        search: searchQuery,
        only_anomalous: onlyAnomalous,
      });
      setEvents(res.items);
      setTotal(res.total);
      if (!selectedEventUid && res.items.length > 0) {
        onSelectEventUid(res.items[0].event_uid);
      }
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [triageFilter, severityFilter, reviewFilter, onlyAnomalous]);

  useEffect(() => {
    if (!selectedEventUid) {
      setDetailEvent(null);
      return;
    }
    aegisApi
      .getEventDetail(selectedEventUid)
      .then((ev) => {
        setDetailEvent(ev);
        setReviewStatusInput(ev.review_status);
        setAnalystNotesInput(ev.analyst_notes || '');
      })
      .catch(() => setDetailEvent(null));
  }, [selectedEventUid]);

  const handleSaveReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailEvent) return;
    setSavingReview(true);
    try {
      const updated = await aegisApi.updateEventReview(
        detailEvent.event_uid,
        reviewStatusInput,
        analystNotesInput
      );
      setDetailEvent(updated);
      fetchEvents();
      onEventUpdated();
    } finally {
      setSavingReview(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mr-1">
          <Filter className="w-4 h-4 text-sky-400" />
          <span>FILTERS ({total})</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchEvents();
          }}
          className="flex items-center bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 w-64"
        >
          <Search className="w-3.5 h-3.5 text-slate-500 mr-2" />
          <input
            type="text"
            placeholder="UID, IP, class, rationale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-200 focus:outline-none w-full"
          />
        </form>

        <select
          value={triageFilter}
          onChange={(e) => setTriageFilter(e.target.value)}
          className="bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
        >
          <option value="ALL">All Triage Categories</option>
          <option value="KNOWN_ATTACK">KNOWN_ATTACK</option>
          <option value="ANOMALOUS_UNKNOWN">ANOMALOUS_UNKNOWN</option>
          <option value="UNCERTAIN">UNCERTAIN</option>
          <option value="BENIGN">BENIGN</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
        >
          <option value="ALL">All Severities</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
          <option value="INFO">INFO</option>
        </select>

        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value)}
          className="bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
        >
          <option value="ALL">All Review States</option>
          <option value="UNREVIEWED">UNREVIEWED</option>
          <option value="ESCALATED">ESCALATED</option>
          <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
          <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs font-mono text-slate-300 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={onlyAnomalous}
            onChange={(e) => setOnlyAnomalous(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900"
          />
          Isolation Forest Outliers Only
        </label>
      </div>

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Table (7 cols) */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-[#21262d] rounded-lg overflow-hidden">
          <div className="max-h-[640px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#161b22] sticky top-0 z-10">
                <tr className="border-b border-[#21262d] text-slate-400 font-mono">
                  <th className="py-2.5 px-3">EVENT UID</th>
                  <th className="py-2.5 px-2">FLOW</th>
                  <th className="py-2.5 px-2">TRIAGE</th>
                  <th className="py-2.5 px-2">CLASS</th>
                  <th className="py-2.5 px-2 text-right">CONF</th>
                  <th className="py-2.5 px-2 text-right">ENTROPY</th>
                  <th className="py-2.5 px-3 text-right">IF PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#161b22]">
                {events.map((ev) => {
                  const active = ev.event_uid === selectedEventUid;
                  return (
                    <tr
                      key={ev.event_uid}
                      onClick={() => onSelectEventUid(ev.event_uid)}
                      className={`cursor-pointer transition-colors ${
                        active ? 'bg-sky-500/15' : 'hover:bg-[#161b22]/70'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-sky-400">
                        {ev.event_uid}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-300">
                        {ev.src_ip} → :{ev.dst_port}
                      </td>
                      <td className="py-2.5 px-2">
                        <TriageBadge category={ev.triage_category} />
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-200 truncate max-w-[130px]">
                        {ev.predicted_label}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-sky-300">
                        {(ev.supervised_confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono text-amber-300">
                        {ev.predictive_entropy.toFixed(3)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-purple-300">
                        p{ev.anomaly_percentile.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                {!loading && events.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-slate-500 font-mono"
                    >
                      No events match the active filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Detailed Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-[#0d1117] border border-[#21262d] rounded-lg p-5 space-y-5">
          {!detailEvent ? (
            <div className="py-16 text-center text-xs text-slate-500 font-mono">
              Select an event row on the left to inspect its telemetry, uncertainty decomposition, and analyst review controls.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b border-[#21262d] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-sky-400">
                      {detailEvent.event_uid}
                    </span>
                    <SeverityBadge severity={detailEvent.severity} />
                    <ReviewBadge status={detailEvent.review_status} />
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    {detailEvent.src_ip}:{detailEvent.src_port} → {detailEvent.dst_ip}:
                    {detailEvent.dst_port} ({detailEvent.protocol})
                  </div>
                </div>
                <button
                  onClick={() => onOpenExplainability(detailEvent.event_uid)}
                  className="px-2.5 py-1 text-xs font-mono bg-sky-500/15 text-sky-300 border border-sky-500/35 rounded hover:bg-sky-500/25 inline-flex items-center gap-1"
                >
                  Full SHAP <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Four Separated Scores */}
              <div className="space-y-3 bg-[#090c10] border border-[#21262d] rounded p-3.5">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                  Separated Risk & Uncertainty Telemetry
                </div>
                <ScoreMeter
                  label="1. Calibrated Top-Class Confidence"
                  valueText={`${(detailEvent.supervised_confidence * 100).toFixed(1)}% (${detailEvent.predicted_label})`}
                  percent={detailEvent.supervised_confidence * 100}
                  colorClass="bg-sky-400"
                  subtitle={`Prediction Margin (Top1 - Top2): ${(detailEvent.prediction_margin * 100).toFixed(1)}%`}
                />
                <ScoreMeter
                  label="2. Known-Attack Calibrated Probability (1 - P(BENIGN))"
                  valueText={`${(detailEvent.known_attack_probability * 100).toFixed(1)}%`}
                  percent={detailEvent.known_attack_probability * 100}
                  colorClass="bg-red-400"
                  subtitle="Probability mass assigned to known training attack classes"
                />
                <ScoreMeter
                  label="3. Predictive Uncertainty (Normalized Shannon Entropy)"
                  valueText={detailEvent.predictive_entropy.toFixed(4)}
                  percent={detailEvent.predictive_entropy * 100}
                  colorClass="bg-amber-400"
                  subtitle="0.00 = high certainty | >= 0.55 = ambiguous / uncertain class boundary"
                />
                <ScoreMeter
                  label="4. Isolation Forest Anomaly Score (Not a Probability)"
                  valueText={`${detailEvent.anomaly_score.toFixed(4)} (p${detailEvent.anomaly_percentile.toFixed(1)} vs Benign)`}
                  percent={detailEvent.anomaly_percentile}
                  colorClass="bg-purple-400"
                  subtitle="Empirical percentile against clean benign baseline; >= p95 flags structural outlier"
                />
              </div>

              {/* Rationale */}
              <div className="p-3 rounded bg-[#161b22]/80 border border-[#21262d] text-xs text-slate-300 leading-relaxed">
                <span className="font-mono text-sky-300 font-semibold block mb-1">
                  ANALYST EXPLANATION RATIONALE:
                </span>
                {detailEvent.rationale_text}
              </div>

              {/* Top SHAP Drivers */}
              {detailEvent.explanation?.top_contributors && (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-slate-400">
                    TOP LOCAL SHAP FEATURE CONTRIBUTIONS
                  </div>
                  <div className="space-y-1.5">
                    {detailEvent.explanation.top_contributors
                      .slice(0, 5)
                      .map((c) => (
                        <div
                          key={c.feature}
                          className="flex items-center justify-between text-xs font-mono bg-[#161b22]/50 px-2.5 py-1.5 rounded border border-[#21262d]"
                        >
                          <span className="text-slate-200">
                            {c.feature} ={' '}
                            <span className="text-sky-300">{c.feature_value}</span>
                          </span>
                          <span
                            className={
                              c.shap_value >= 0
                                ? 'text-red-300'
                                : 'text-emerald-300'
                            }
                          >
                            {c.shap_value >= 0 ? '+' : ''}
                            {c.shap_value.toFixed(4)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Analyst Review Form */}
              <form
                onSubmit={handleSaveReview}
                className="space-y-3 border-t border-[#21262d] pt-3"
              >
                <div className="text-xs font-mono text-slate-400">
                  ANALYST TRIAGE & DISPOSITION
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={reviewStatusInput}
                    onChange={(e) =>
                      setReviewStatusInput(e.target.value as ReviewStatus)
                    }
                    className="bg-[#090c10] border border-[#21262d] rounded px-2.5 py-1.5 text-xs font-mono text-slate-200"
                  >
                    <option value="UNREVIEWED">UNREVIEWED</option>
                    <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
                    <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                    <option value="ESCALATED">ESCALATED</option>
                  </select>
                  <button
                    type="submit"
                    disabled={savingReview}
                    className="px-3 py-1.5 text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded hover:bg-emerald-500/30 transition"
                  >
                    {savingReview ? 'Saving...' : 'Save Disposition'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Record investigation notes, packet capture correlation, or mitigation steps..."
                  value={analystNotesInput}
                  onChange={(e) => setAnalystNotesInput(e.target.value)}
                  className="w-full bg-[#090c10] border border-[#21262d] rounded p-2 text-xs font-mono text-slate-200"
                />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
