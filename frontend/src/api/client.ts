import type {
  DetectionBatchResult,
  GlobalImportanceItem,
  ModelRunRecord,
  MonitoringResponse,
  NetworkEventRecord,
  OverviewResponse,
  ReviewStatus,
  ThreatIntelResponse,
} from '../types/aegis';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.detail) {
        errDetail =
          typeof data.detail === 'string'
            ? data.detail
            : JSON.stringify(data.detail);
      }
    } catch {
      // fallback
    }
    throw new Error(errDetail);
  }
  return res.json() as Promise<T>;
}

export const aegisApi = {
  getHealth: () => request<Record<string, any>>('/health'),
  getOverview: () => request<OverviewResponse>('/overview'),
  getThreatIntel: () => request<ThreatIntelResponse>('/threat-intel'),

  uploadCsv: (file: File, deduplicate = true) => {
    const form = new FormData();
    form.append('file', file);
    return request<DetectionBatchResult>(
      `/detection/upload-csv?deduplicate=${deduplicate}`,
      {
        method: 'POST',
        body: form,
      }
    );
  },

  analyzeFlows: (sourceName: string, flows: Record<string, any>[]) =>
    request<DetectionBatchResult>('/detection/analyze-flows', {
      method: 'POST',
      body: JSON.stringify({ source_name: sourceName, flows }),
    }),

  analyzeBenchmarkSlice: (
    sampleSize = 60,
    includeHeldOutAttacks = true,
    randomSeed = 101
  ) =>
    request<DetectionBatchResult>('/detection/analyze-benchmark-slice', {
      method: 'POST',
      body: JSON.stringify({
        sample_size: sampleSize,
        include_held_out_attacks: includeHeldOutAttacks,
        random_seed: randomSeed,
      }),
    }),

  listEvents: (params: {
    limit?: number;
    offset?: number;
    triage_category?: string;
    severity?: string;
    predicted_label?: string;
    review_status?: string;
    search?: string;
    min_entropy?: number;
    only_anomalous?: boolean;
  }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
        qs.set(k, String(v));
      }
    });
    return request<{
      total: number;
      limit: number;
      offset: number;
      items: NetworkEventRecord[];
    }>(`/events?${qs.toString()}`);
  },

  getEventDetail: (eventUid: string) =>
    request<NetworkEventRecord>(`/events/${encodeURIComponent(eventUid)}`),

  updateEventReview: (
    eventUid: string,
    reviewStatus: ReviewStatus,
    analystNotes: string
  ) =>
    request<NetworkEventRecord>(
      `/events/${encodeURIComponent(eventUid)}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          review_status: reviewStatus,
          analyst_notes: analystNotes,
        }),
      }
    ),

  clearEvents: () =>
    request<{ deleted_count: number; status: string }>('/events', {
      method: 'DELETE',
    }),

  getGlobalExplainability: () =>
    request<{
      model_version: string;
      explainer_backend: string;
      fireworks_ai_configured?: boolean;
      fireworks_model?: string;
      feature_count: number;
      global_importance: GlobalImportanceItem[];
      feature_descriptions: Record<string, string>;
      methodology_note: string;
    }>('/explainability/global'),

  getEventExplanation: (eventUid: string) =>
    request<NetworkEventRecord>(
      `/explainability/event/${encodeURIComponent(eventUid)}`
    ),

  generateEventAiBrief: (eventUid: string) =>
    request<{
      event_uid: string;
      provider: string;
      model: string;
      latency_ms: number;
      brief_markdown: string;
    }>(`/explainability/event/${encodeURIComponent(eventUid)}/ai-brief`, {
      method: 'POST',
    }),

  getModelsLab: () =>
    request<{
      active_model: ModelRunRecord | null;
      runs: ModelRunRecord[];
      available_attack_families: string[];
    }>('/models'),

  triggerTraining: (payload: {
    split_strategy: 'group_time_aware' | 'stratified';
    held_out_families: string[];
    sample_size: number;
    n_estimators_rf: number;
    n_estimators_if: number;
    random_seed: number;
  }) =>
    request<{ training_duration_ms: number; model_run: ModelRunRecord }>(
      '/models/train',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getMonitoring: () => request<MonitoringResponse>('/monitoring'),

  getSettings: () =>
    request<{
      settings: Record<string, any>;
      ai_copilot?: {
        fireworks_configured: boolean;
        masked_api_key: string;
        model: string;
        base_url: string;
      };
      threshold_documentation: Record<string, string>;
    }>('/settings'),

  updateSettings: (updates: Record<string, any>) =>
    request<{ settings: Record<string, any>; status: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
};
