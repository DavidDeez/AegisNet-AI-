import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Download,
  Terminal,
  Copy,
  Check,
  CheckSquare,
  ArrowUpRight,
  ShieldAlert,
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

  const [selectedBatchUids, setSelectedBatchUids] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const [detailEvent, setDetailEvent] = useState<NetworkEventRecord | null>(
    null
  );
  const [mitigationRules, setMitigationRules] = useState<{
    suricata_rule: string;
    iptables_command: string;
    nftables_command: string;
    zeek_hunt_query: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
      setMitigationRules(null);
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

    aegisApi
      .getEventMitigationRules(selectedEventUid)
      .then(setMitigationRules)
      .catch(() => setMitigationRules(null));
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

  const toggleSelectRow = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBatchUids((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const handleBulkAction = async (status: ReviewStatus, customUids?: string[]) => {
    const targets = customUids || selectedBatchUids;
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      await aegisApi.bulkUpdateEventReview(
        targets,
        status,
        `Bulk disposition (${status}) applied via Event Explorer.`
      );
      setSelectedBatchUids([]);
      await fetchEvents();
      if (selectedEventUid) {
        const refreshed = await aegisApi.getEventDetail(selectedEventUid);
        setDetailEvent(refreshed);
        setReviewStatusInput(refreshed.review_status);
      }
      onEventUpdated();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleEscalateAllCritical = () => {
    const critUids = events
      .filter(
        (ev) =>
          (ev.severity === 'CRITICAL' || ev.triage_category === 'ANOMALOUS_UNKNOWN') &&
          ev.review_status === 'UNREVIEWED'
      )
      .map((ev) => ev.event_uid);
    if (critUids.length > 0) {
      handleBulkAction('ESCALATED', critUids);
    }
  };

  const copyRule = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-5">
      {/* Glossy Filter & Export Bar */}
      <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-300 font-mono mr-1">
          <Filter className="w-4 h-4 text-sky-400" />
          <span>FILTERS ({total})</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchEvents();
          }}
          className="flex items-center bg-[#090c10] border border-white/10 rounded-lg px-3 py-1.5 w-60 shadow-inner"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
          <input
            type="text"
            placeholder="UID, IP, class, rationale..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs font-mono text-slate-100 focus:outline-none w-full"
          />
        </form>

        <select
          value={triageFilter}
          onChange={(e) => setTriageFilter(e.target.value)}
          className="bg-[#090c10] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
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
          className="bg-[#090c10] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
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
          className="bg-[#090c10] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
        >
          <option value="ALL">All Review States</option>
          <option value="UNREVIEWED">UNREVIEWED</option>
          <option value="ESCALATED">ESCALATED</option>
          <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
          <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs font-mono text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyAnomalous}
            onChange={(e) => setOnlyAnomalous(e.target.checked)}
            className="rounded border-slate-700 bg-slate-900"
          />
          IF Outliers Only
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleEscalateAllCritical}
            disabled={bulkBusy}
            className="px-3 py-1.5 text-xs font-mono rounded-lg bg-purple-500/20 text-purple-200 border border-purple-400/40 hover:bg-purple-500/30 inline-flex items-center gap-1.5 transition shadow-[0_0_15px_rgba(168,85,247,0.18)]"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Auto-Escalate Critical
          </button>

          <a
            href={aegisApi.getExportCsvUrl(triageFilter, severityFilter)}
            download="aegisnet_forensic_events.csv"
            className="px-3 py-1.5 text-xs font-mono rounded-lg bg-sky-500/20 text-sky-200 border border-sky-400/40 hover:bg-sky-500/30 inline-flex items-center gap-1.5 transition shadow-[0_0_15px_rgba(56,189,248,0.18)]"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      {/* Bulk Triage Floating Bar when rows are checked */}
      {selectedBatchUids.length > 0 && (
        <div className="bg-[#0d1117] border border-sky-400/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-[0_0_24px_rgba(56,189,248,0.2)]">
          <div className="flex items-center gap-2 text-xs font-mono text-sky-200">
            <CheckSquare className="w-4 h-4 text-sky-400" />
            <span>
              {selectedBatchUids.length} flow event(s) selected for bulk disposition
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('CONFIRMED_THREAT')}
              className="px-3 py-1 text-xs font-mono rounded-md bg-red-500/25 text-red-200 border border-red-400/40 hover:bg-red-500/35"
            >
              Confirm Threat
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('ESCALATED')}
              className="px-3 py-1 text-xs font-mono rounded-md bg-purple-500/25 text-purple-200 border border-purple-400/40 hover:bg-purple-500/35"
            >
              Escalate Selected
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('FALSE_POSITIVE')}
              className="px-3 py-1 text-xs font-mono rounded-md bg-emerald-500/25 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/35"
            >
              Mark False Positive
            </button>
            <button
              type="button"
              onClick={() => setSelectedBatchUids([])}
              className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Master-Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Table (7 cols) */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-[#21262d] rounded-xl overflow-hidden">
          <div className="max-h-[720px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#161b22] sticky top-0 z-10">
                <tr className="border-b border-white/10 text-slate-300 font-mono">
                  <th className="py-2.5 pl-3 pr-1 w-7">
                    <input
                      type="checkbox"
                      checked={
                        events.length > 0 &&
                        selectedBatchUids.length === events.length
                      }
                      onChange={(e) =>
                        setSelectedBatchUids(
                          e.target.checked ? events.map((x) => x.event_uid) : []
                        )
                      }
                      className="rounded border-slate-600 bg-slate-900"
                    />
                  </th>
                  <th className="py-2.5 px-2">EVENT UID</th>
                  <th className="py-2.5 px-2">FLOW</th>
                  <th className="py-2.5 px-2">TRIAGE</th>
                  <th className="py-2.5 px-2">CLASS</th>
                  <th className="py-2.5 px-2 text-right">CONF</th>
                  <th className="py-2.5 px-2 text-right">ENTROPY</th>
                  <th className="py-2.5 px-3 text-right">IF PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((ev) => {
                  const active = ev.event_uid === selectedEventUid;
                  const checked = selectedBatchUids.includes(ev.event_uid);
                  return (
                    <tr
                      key={ev.event_uid}
                      onClick={() => onSelectEventUid(ev.event_uid)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-sky-500/20'
                          : checked
                          ? 'bg-purple-500/10'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <td
                        className="py-2.5 pl-3 pr-1"
                        onClick={(e) => toggleSelectRow(ev.event_uid, e)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="rounded border-slate-600 bg-slate-900"
                        />
                      </td>
                      <td className="py-2.5 px-2 font-mono text-sky-300 font-medium">
                        {ev.event_uid}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-300">
                        {ev.src_ip} → :{ev.dst_port}
                      </td>
                      <td className="py-2.5 px-2">
                        <TriageBadge category={ev.triage_category} />
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-100 truncate max-w-[130px]">
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
                      colSpan={8}
                      className="py-10 text-center text-slate-400 font-mono"
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
        <div className="lg:col-span-5 bg-[#0d1117] border border-[#21262d] rounded-xl p-5 space-y-5">
          {!detailEvent ? (
            <div className="py-16 text-center text-xs text-slate-400 font-mono">
              Select an event row on the left to inspect its telemetry, uncertainty decomposition, defensive rules, and analyst review controls.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b border-white/10 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-sky-300">
                      {detailEvent.event_uid}
                    </span>
                    <SeverityBadge severity={detailEvent.severity} />
                    <ReviewBadge status={detailEvent.review_status} />
                  </div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {detailEvent.src_ip}:{detailEvent.src_port} → {detailEvent.dst_ip}:
                    {detailEvent.dst_port} ({detailEvent.protocol})
                  </div>
                </div>
                <button
                  onClick={() => onOpenExplainability(detailEvent.event_uid)}
                  className="px-3 py-1.5 text-xs font-mono bg-sky-500/20 text-sky-200 border border-sky-400/40 rounded-lg hover:bg-sky-500/30 inline-flex items-center gap-1 shadow-[0_0_14px_rgba(56,189,248,0.2)]"
                >
                  Full SHAP <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Four Separated Scores */}
              <div className="space-y-3 bg-[#090c10] border border-white/10 rounded-xl p-4">
                <div className="text-[11px] font-mono text-sky-300/90 uppercase tracking-wider font-semibold">
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
              <div className="p-3.5 rounded-xl bg-[#161b22]/80 border border-white/10 text-xs text-slate-200 leading-relaxed">
                <span className="font-mono text-sky-300 font-semibold block mb-1">
                  ANALYST EXPLANATION RATIONALE:
                </span>
                {detailEvent.rationale_text}
              </div>

              {/* Automated Defensive Mitigation & Hunting Rules Generator */}
              {mitigationRules && (
                <div className="p-3.5 rounded-xl bg-[#090c10] border border-purple-400/30 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-mono text-purple-300">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <Terminal className="w-3.5 h-3.5" />
                      SYNTHESIZED DEFENSIVE & HUNTING RULES
                    </span>
                    <span className="text-[10px] text-slate-400">
                      One-Click Copy
                    </span>
                  </div>

                  {[
                    {
                      key: 'suricata',
                      label: 'Suricata IDS Signature',
                      val: mitigationRules.suricata_rule,
                    },
                    {
                      key: 'nft',
                      label: 'Linux nftables Containment',
                      val: mitigationRules.nftables_command,
                    },
                    {
                      key: 'zeek',
                      label: 'Zeek conn.log Threat Hunt',
                      val: mitigationRules.zeek_hunt_query,
                    },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="p-2 rounded-lg bg-[#161b22]/70 border border-white/10 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                        <span>{item.label}</span>
                        <button
                          type="button"
                          onClick={() => copyRule(item.key, item.val)}
                          className="text-sky-300 hover:text-white inline-flex items-center gap-1"
                        >
                          {copiedKey === item.key ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-slate-200 break-all">
                        {item.val}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Analyst Review Form */}
              <form
                onSubmit={handleSaveReview}
                className="space-y-3 border-t border-white/10 pt-3"
              >
                <div className="text-xs font-mono text-slate-300">
                  ANALYST TRIAGE & DISPOSITION
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={reviewStatusInput}
                    onChange={(e) =>
                      setReviewStatusInput(e.target.value as ReviewStatus)
                    }
                    className="bg-[#090c10] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200"
                  >
                    <option value="UNREVIEWED">UNREVIEWED</option>
                    <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
                    <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                    <option value="ESCALATED">ESCALATED</option>
                  </select>
                  <button
                    type="submit"
                    disabled={savingReview}
                    className="px-3 py-1.5 text-xs font-mono font-medium bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 rounded-lg hover:bg-emerald-500/30 transition shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  >
                    {savingReview ? 'Saving...' : 'Save Disposition'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Record investigation notes, packet capture correlation, or mitigation steps..."
                  value={analystNotesInput}
                  onChange={(e) => setAnalystNotesInput(e.target.value)}
                  className="w-full bg-[#090c10] border border-white/10 rounded-lg p-2 text-xs font-mono text-slate-200"
                />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
