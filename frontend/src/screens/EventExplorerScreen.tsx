import React, { useEffect, useState } from 'react';
import {
  Search,
  Download,
  Terminal,
  Copy,
  Check,
  CheckSquare,
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
  const [showRules, setShowRules] = useState(false);
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

  const handleBulkAction = async (
    status: ReviewStatus,
    customUids?: string[]
  ) => {
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
          (ev.severity === 'CRITICAL' ||
            ev.triage_category === 'ANOMALOUS_UNKNOWN') &&
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
    <div className="space-y-4">
      {/* Query & Filter Bar */}
      <div className="bg-[#0d1117] border border-white/10 rounded p-3 flex flex-wrap items-center gap-2.5 font-mono">
        <span className="text-[11px] text-slate-400 mr-1">
          QUERY [{total}]
        </span>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchEvents();
          }}
          className="flex items-center bg-[#090c10] border border-white/10 rounded-[2px] px-2.5 py-1 w-56"
        >
          <Search className="w-3 h-3 text-slate-500 mr-2" />
          <input
            type="text"
            placeholder="event_uid, ip, signature..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-slate-100 focus:outline-none w-full"
          />
        </form>

        <select
          value={triageFilter}
          onChange={(e) => setTriageFilter(e.target.value)}
          className="bg-[#090c10] border border-white/10 rounded-[2px] px-2 py-1 text-xs text-slate-200"
        >
          <option value="ALL">TRIAGE: ALL</option>
          <option value="KNOWN_ATTACK">KNOWN_ATTACK</option>
          <option value="ANOMALOUS_UNKNOWN">OPEN_SET_ANOMALY</option>
          <option value="UNCERTAIN">HIGH_ENTROPY</option>
          <option value="BENIGN">BENIGN</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-[#090c10] border border-white/10 rounded-[2px] px-2 py-1 text-xs text-slate-200"
        >
          <option value="ALL">SEV: ALL</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
          <option value="INFO">INFO</option>
        </select>

        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value)}
          className="bg-[#090c10] border border-white/10 rounded-[2px] px-2 py-1 text-xs text-slate-200"
        >
          <option value="ALL">STATUS: ALL</option>
          <option value="UNREVIEWED">UNREVIEWED</option>
          <option value="ESCALATED">ESCALATED</option>
          <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
          <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyAnomalous}
            onChange={(e) => setOnlyAnomalous(e.target.checked)}
            className="rounded-[2px] border-slate-700 bg-slate-900"
          />
          IF_OUTLIERS_ONLY
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleEscalateAllCritical}
            disabled={bulkBusy}
            className="px-2.5 py-1 text-[11px] rounded-[2px] bg-[#090c10] text-amber-200 border border-white/10 hover:border-amber-400/40 transition"
          >
            ESCALATE_UNREVIEWED_CRIT
          </button>

          <a
            href={aegisApi.getExportCsvUrl(triageFilter, severityFilter)}
            download="aegisnet_forensic_events.csv"
            className="px-2.5 py-1 text-[11px] rounded-[2px] bg-[#090c10] text-slate-200 border border-white/10 hover:border-white/30 inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3 h-3" />
            CSV
          </a>
        </div>
      </div>

      {/* Bulk Triage Bar */}
      {selectedBatchUids.length > 0 && (
        <div className="bg-[#0d1117] border border-white/15 border-l-2 border-l-slate-200 rounded p-3 flex flex-wrap items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            <CheckSquare className="w-3.5 h-3.5 text-slate-300" />
            <span>
              SELECTED: {selectedBatchUids.length} FLOW RECORD(S)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('CONFIRMED_THREAT')}
              className="px-2.5 py-1 rounded-[2px] bg-red-500/15 text-red-200 border border-red-500/30 hover:bg-red-500/25"
            >
              CONFIRM_THREAT
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('ESCALATED')}
              className="px-2.5 py-1 rounded-[2px] bg-amber-500/15 text-amber-200 border border-amber-500/30 hover:bg-amber-500/25"
            >
              ESCALATE
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => handleBulkAction('FALSE_POSITIVE')}
              className="px-2.5 py-1 rounded-[2px] bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 hover:bg-emerald-500/25"
            >
              FALSE_POSITIVE
            </button>
            <button
              type="button"
              onClick={() => setSelectedBatchUids([])}
              className="px-2 py-1 text-slate-400 hover:text-white"
            >
              CLEAR
            </button>
          </div>
        </div>
      )}

      {/* Master-Detail Console Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Table (7 cols) */}
        <div className="lg:col-span-7 bg-[#0d1117] border border-white/10 rounded overflow-hidden">
          <div className="max-h-[720px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead className="bg-[#090c10] sticky top-0 z-10">
                <tr className="border-b border-white/10 text-[10px] text-slate-400">
                  <th className="py-2 pl-3 pr-1 w-7">
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
                      className="rounded-[2px] border-slate-600 bg-slate-900"
                    />
                  </th>
                  <th className="py-2 px-2">EVENT UID</th>
                  <th className="py-2 px-2">FLOW</th>
                  <th className="py-2 px-2">TRIAGE</th>
                  <th className="py-2 px-2">CLASS</th>
                  <th className="py-2 px-2 text-right">P(y|x)</th>
                  <th className="py-2 px-2 text-right">H(p)</th>
                  <th className="py-2 px-3 text-right">IF_PCTL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {events.map((ev) => {
                  const active = ev.event_uid === selectedEventUid;
                  const checked = selectedBatchUids.includes(ev.event_uid);
                  return (
                    <tr
                      key={ev.event_uid}
                      onClick={() => onSelectEventUid(ev.event_uid)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-white/[0.09]'
                          : checked
                          ? 'bg-white/[0.05]'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td
                        className="py-2 pl-3 pr-1"
                        onClick={(e) => toggleSelectRow(ev.event_uid, e)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="rounded-[2px] border-slate-600 bg-slate-900"
                        />
                      </td>
                      <td className="py-2 px-2 text-slate-200 font-medium">
                        {ev.event_uid}
                      </td>
                      <td className="py-2 px-2 text-slate-400">
                        {ev.src_ip} → :{ev.dst_port}
                      </td>
                      <td className="py-2 px-2">
                        <TriageBadge category={ev.triage_category} />
                      </td>
                      <td className="py-2 px-2 text-slate-100 truncate max-w-[130px]">
                        {ev.predicted_label}
                      </td>
                      <td className="py-2 px-2 text-right text-slate-200">
                        {(ev.supervised_confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-2 text-right text-slate-300">
                        {ev.predictive_entropy.toFixed(3)}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-300/90">
                        p{ev.anomaly_percentile.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
                {!loading && events.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-slate-500"
                    >
                      [NO_MATCHING_FLOW_RECORDS]
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Detailed Inspector (5 cols) */}
        <div className="lg:col-span-5 bg-[#0d1117] border border-white/10 rounded p-4 space-y-4">
          {!detailEvent ? (
            <div className="py-16 text-center text-xs text-slate-500 font-mono">
              [SELECT_FLOW_RECORD_FROM_LEDGER]
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between border-b border-white/[0.08] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-white">
                      {detailEvent.event_uid}
                    </span>
                    <SeverityBadge severity={detailEvent.severity} />
                    <ReviewBadge status={detailEvent.review_status} />
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-1">
                    {detailEvent.src_ip}:{detailEvent.src_port} →{' '}
                    {detailEvent.dst_ip}:{detailEvent.dst_port} [
                    {detailEvent.protocol}]
                  </div>
                </div>
                <button
                  onClick={() => onOpenExplainability(detailEvent.event_uid)}
                  className="px-2.5 py-1 text-[11px] font-mono bg-[#090c10] text-slate-200 border border-white/15 rounded-[2px] hover:border-white/35 inline-flex items-center gap-1"
                >
                  SHAP WATERFALL <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              {/* Four Separated Scores */}
              <div className="space-y-2.5 bg-[#090c10] border border-white/[0.08] rounded-[2px] p-3.5">
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  SEPARATED PROBABILITY, ENTROPY & ANOMALY METRICS
                </div>
                <ScoreMeter
                  label="01 // CALIBRATED TOP-CLASS P(y|x)"
                  valueText={`${(detailEvent.supervised_confidence * 100).toFixed(1)}% (${detailEvent.predicted_label})`}
                  percent={detailEvent.supervised_confidence * 100}
                  colorClass="bg-slate-200"
                  subtitle={`Margin (P_1 - P_2): ${(detailEvent.prediction_margin * 100).toFixed(1)}%`}
                />
                <ScoreMeter
                  label="02 // KNOWN-ATTACK MASS (1 - P(BENIGN))"
                  valueText={`${(detailEvent.known_attack_probability * 100).toFixed(1)}%`}
                  percent={detailEvent.known_attack_probability * 100}
                  colorClass="bg-red-400"
                />
                <ScoreMeter
                  label="03 // SHANNON ENTROPY H(p)/ln(K)"
                  valueText={detailEvent.predictive_entropy.toFixed(4)}
                  percent={detailEvent.predictive_entropy * 100}
                  colorClass="bg-sky-400"
                />
                <ScoreMeter
                  label="04 // ISOLATION FOREST SCORE (NON-PROBABILITY)"
                  valueText={`${detailEvent.anomaly_score.toFixed(4)} (p${detailEvent.anomaly_percentile.toFixed(1)})`}
                  percent={detailEvent.anomaly_percentile}
                  colorClass="bg-amber-400"
                />
              </div>

              {/* Rationale */}
              <div className="p-3 rounded-[2px] bg-[#090c10] border border-white/[0.08] text-xs font-mono text-slate-300 leading-relaxed">
                <span className="text-[10px] text-slate-500 block mb-1">
                  DECISION_RATIONALE //
                </span>
                {detailEvent.rationale_text}
              </div>

              {/* Collapsible Defensive Mitigation & Hunting Rules Generator */}
              {mitigationRules && (
                <div className="rounded-[4px] bg-[#090c10] border border-white/[0.08] p-2.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowRules((prev) => !prev)}
                    className="w-full flex items-center justify-between text-xs font-mono text-slate-200 hover:text-white"
                  >
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Terminal className="w-3.5 h-3.5 text-[#79c0ff]" />
                      Defensive Rules (Suricata / nftables / Zeek)
                    </span>
                    <span className="text-[10px] text-[#79c0ff]">
                      {showRules ? 'Hide' : 'Show'}
                    </span>
                  </button>

                  {showRules && (
                    <div className="space-y-2 pt-1">
                      {[
                        {
                          key: 'suricata',
                          label: 'Suricata IDS',
                          val: mitigationRules.suricata_rule,
                        },
                        {
                          key: 'nft',
                          label: 'nftables Drop',
                          val: mitigationRules.nftables_command,
                        },
                        {
                          key: 'zeek',
                          label: 'Zeek Filter',
                          val: mitigationRules.zeek_hunt_query,
                        },
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="p-2 rounded-[2px] bg-[#0d1117] border border-white/[0.06] space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span>{item.label}</span>
                            <button
                              type="button"
                              onClick={() => copyRule(item.key, item.val)}
                              className="text-[#79c0ff] hover:text-white inline-flex items-center gap-1"
                            >
                              {copiedKey === item.key ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />{' '}
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" /> Copy
                                </>
                              )}
                            </button>
                          </div>
                          <div className="text-[11px] font-mono text-slate-300 break-all">
                            {item.val}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analyst Review Form */}
              <form
                onSubmit={handleSaveReview}
                className="space-y-2.5 border-t border-white/[0.08] pt-3 font-mono"
              >
                <div className="text-[10px] text-slate-400">
                  ANALYST_DISPOSITION //
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={reviewStatusInput}
                    onChange={(e) =>
                      setReviewStatusInput(e.target.value as ReviewStatus)
                    }
                    className="bg-[#090c10] border border-white/10 rounded-[2px] px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="UNREVIEWED">UNREVIEWED</option>
                    <option value="CONFIRMED_THREAT">CONFIRMED_THREAT</option>
                    <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
                    <option value="ESCALATED">ESCALATED</option>
                  </select>
                  <button
                    type="submit"
                    disabled={savingReview}
                    className="px-3 py-1.5 text-xs font-medium bg-white/[0.08] text-white border border-white/15 rounded-[2px] hover:bg-white/[0.14] transition"
                  >
                    {savingReview ? 'COMMITTING...' : 'COMMIT DISPOSITION'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  placeholder="Investigation notes / PCAP reference..."
                  value={analystNotesInput}
                  onChange={(e) => setAnalystNotesInput(e.target.value)}
                  className="w-full bg-[#090c10] border border-white/10 rounded-[2px] p-2 text-xs text-slate-200"
                />
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
