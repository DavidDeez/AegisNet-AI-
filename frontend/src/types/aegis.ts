export type TriageCategory =
  | 'KNOWN_ATTACK'
  | 'BENIGN'
  | 'ANOMALOUS_UNKNOWN'
  | 'UNCERTAIN';

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type ReviewStatus =
  | 'UNREVIEWED'
  | 'CONFIRMED_THREAT'
  | 'FALSE_POSITIVE'
  | 'ESCALATED';

export interface ShapContributor {
  feature: string;
  description: string;
  feature_value: number;
  train_median: number;
  robust_z_score: number;
  shap_value: number;
  abs_shap: number;
  direction: 'INCREASES_PROBABILITY' | 'DECREASES_PROBABILITY';
}

export interface LocalExplanation {
  method: string;
  target_class: string;
  base_value: number;
  predicted_class_probability: number;
  top_contributors: ShapContributor[];
  rationale: string;
}

export interface NetworkEventRecord {
  id: number;
  event_uid: string;
  created_at: string;
  batch_id: string;
  source_name: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  protocol: string;
  flow_timestamp: string;
  triage_category: TriageCategory;
  predicted_label: string;
  ground_truth_label: string | null;
  severity: SeverityLevel;
  supervised_confidence: number;
  known_attack_probability: number;
  prediction_margin: number;
  predictive_entropy: number;
  anomaly_score: number;
  anomaly_percentile: number;
  is_anomalous: boolean;
  is_uncertain: boolean;
  class_probabilities: Record<string, number>;
  features?: Record<string, number>;
  explanation?: LocalExplanation;
  top_contributors?: ShapContributor[];
  rationale_text: string;
  review_status: ReviewStatus;
  analyst_notes: string;
  model_version: string;
}

export interface AttackClassBreakdown {
  predicted_label: string;
  triage_category: TriageCategory;
  count: number;
  mean_confidence: number;
  mean_entropy: number;
  mean_anomaly_pct: number;
}

export interface OverviewResponse {
  total_events: number;
  known_attacks: number;
  benign_events: number;
  anomalous_unknown: number;
  uncertain_events: number;
  pending_triage: number;
  avg_confidence: number;
  avg_entropy: number;
  avg_anomaly_score: number;
  avg_anomaly_percentile: number;
  severity_distribution: Record<string, number>;
  triage_distribution: Record<string, number>;
  attack_class_breakdown: AttackClassBreakdown[];
  timeline_series: Array<{
    bucket: string;
    total: number;
    known_attacks: number;
    anomalies: number;
    uncertain: number;
    benign: number;
  }>;
  recent_events: NetworkEventRecord[];
  system_health: {
    ml_engine_ready: boolean;
    active_model_version: string;
    avg_latency_ms: number;
    p95_latency_ms: number;
    max_drift_psi: number;
    error_count: number;
  };
  active_model: ModelRunRecord | null;
}

export interface ThreatIntelResponse {
  total_analyzed: number;
  attack_class_breakdown: AttackClassBreakdown[];
  triage_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
  targeted_ports: Array<{
    dst_port: number;
    protocol: string;
    triage_category: TriageCategory;
    count: number;
    avg_anomaly_pct: number;
  }>;
  suspicious_sources: Array<{
    src_ip: string;
    event_count: number;
    known_attack_count: number;
    anomaly_count: number;
    max_anomaly_pct: number;
    avg_entropy: number;
  }>;
  uncertainty_vs_anomaly_points: Array<{
    event_uid: string;
    triage_category: TriageCategory;
    predicted_label: string;
    severity: SeverityLevel;
    supervised_confidence: number;
    predictive_entropy: number;
    anomaly_score: number;
    anomaly_percentile: number;
    known_attack_probability: number;
    dst_port: number;
  }>;
  known_classes: string[];
  held_out_families: string[];
  open_set_evaluation: Record<string, any>;
  taxonomy_definitions: Record<string, string>;
}

export interface FeatureDriftDetail {
  feature: string;
  psi: number;
  status: 'STABLE' | 'MODERATE_DRIFT' | 'CRITICAL_DRIFT';
  train_median: number;
  batch_median: number;
}

export interface DetectionBatchResult {
  batch_id: string;
  source_name: string;
  model_version: string;
  latency_ms: number;
  validation_report: {
    total_rows_received: number;
    valid_rows_retained: number;
    duplicate_rows_removed: number;
    missing_value_cells: number;
    infinite_value_cells: number;
    negative_duration_rows_fixed: number;
    recognized_features: string[];
    missing_features_imputed: string[];
    has_ground_truth_labels: boolean;
    class_distribution: Record<string, number>;
    warnings: string[];
  };
  triage_summary: Record<string, number>;
  mean_confidence: number;
  mean_entropy: number;
  mean_anomaly_score: number;
  drift_report: {
    psi_max: number;
    psi_mean: number;
    drifted_features_count: number;
    details: FeatureDriftDetail[];
  };
  events: NetworkEventRecord[];
}

export interface GlobalImportanceItem {
  rank: number;
  feature: string;
  description: string;
  mean_abs_shap: number;
  gini_importance: number;
  train_median: number;
}

export interface ModelRunRecord {
  id: number;
  version: string;
  created_at: string;
  dataset_name: string;
  dataset_source: string;
  split_strategy: string;
  held_out_families: string[];
  train_rows: number;
  test_rows: number;
  open_set_rows: number;
  feature_count: number;
  accuracy: number;
  macro_precision: number;
  macro_recall: number;
  macro_f1: number;
  weighted_f1: number;
  brier_score: number;
  expected_calibration_error: number;
  open_set_auroc: number;
  open_set_auprc: number;
  open_set_recall_at_5pct_fpr: number;
  open_set_precision: number;
  open_set_fpr: number;
  metrics: {
    closed_set: {
      accuracy: number;
      macro_precision: number;
      macro_recall: number;
      macro_f1: number;
      weighted_f1: number;
      class_labels: string[];
      per_class: Array<{
        class_name: string;
        precision: number;
        recall: number;
        f1_score: number;
        support: number;
      }>;
      confusion_matrix: number[][];
    };
    calibration: {
      calibrated: {
        brier_score: number;
        expected_calibration_error: number;
        reliability_bins: Array<{
          bin_range: string;
          bin_midpoint: number;
          count: number;
          mean_confidence: number;
          empirical_accuracy: number;
          calibration_gap: number;
        }>;
      };
      uncalibrated_brier_score: number;
      uncalibrated_ece: number;
      method: string;
    };
    open_set: {
      held_out_families: string[];
      benign_eval_count: number;
      unknown_attack_eval_count: number;
      auroc: number;
      isolation_forest_auroc: number;
      hybrid_novelty_auroc: number;
      auprc: number;
      isolation_forest_auprc: number;
      hybrid_novelty_auprc: number;
      recall_at_5pct_fpr: number;
      precision_at_threshold: number;
      empirical_fpr: number;
      threshold_95pct_benign: number;
      per_family_detection: Array<{
        attack_family: string;
        support: number;
        detected_count: number;
        detection_recall: number;
        mean_anomaly_score: number;
        mean_predictive_entropy: number;
      }>;
    };
    model_comparison: Array<{
      model_name: string;
      role: string;
      strengths: string;
      limitations: string;
      headline_metric: string;
    }>;
    scientific_limitations: string[];
  };
  eda_summary: {
    total_clean_rows: number;
    feature_count: number;
    class_distribution: Record<string, number>;
    class_proportions_pct: Record<string, number>;
    imbalance_ratio_max_to_min: number;
    held_out_attack_families: string[];
    validation_report: Record<string, any>;
    feature_statistics: Array<{
      feature: string;
      description: string;
      missing_or_inf: number;
      mean: number;
      std: number;
      median: number;
      q95: number;
    }>;
    leakage_prevention_notes: string[];
  };
  global_importance: GlobalImportanceItem[];
  artifact_path: string;
  is_active: boolean;
}

export interface MonitoringResponse {
  total_requests: number;
  total_flows_scored: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  error_count: number;
  avg_drift_psi: number;
  max_drift_psi: number;
  latest_feature_drift: FeatureDriftDetail[];
  recent_telemetry: Array<{
    id: number;
    created_at: string;
    batch_id: string;
    endpoint: string;
    record_count: number;
    latency_ms: number;
    status_code: number;
    drift_psi_max: number;
    drift_psi_mean: number;
    drifted_features_count: number;
    mean_entropy: number;
    mean_anomaly_score: number;
  }>;
  operational_errors: Array<{
    id: number;
    created_at: string;
    endpoint: string;
    status_code: number;
    error_message: string;
  }>;
  uptime_seconds: number;
  active_model_version: string;
  prediction_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
  avg_confidence: number;
  avg_entropy: number;
  avg_anomaly_score: number;
  drift_thresholds: {
    psi_warning: number;
    psi_critical: number;
  };
}
