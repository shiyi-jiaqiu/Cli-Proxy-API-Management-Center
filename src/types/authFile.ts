/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'kiro'
  | 'iflow'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface KiroUsageBreakdown {
  resource_type?: string;
  unit?: string;
  usage_limit?: number;
  current_usage?: number;
}

export interface KiroUsageSnapshot {
  days_until_reset?: number;
  next_date_reset?: number;
  subscription?: { title?: string; type?: string };
  user_info?: { email?: string; user_id?: string };
  breakdowns?: KiroUsageBreakdown[];
}

export interface CodexQuota {
  plan_type?: string;
  primary_used_percent?: number;
  primary_reset_after_seconds?: number;
  primary_window_minutes?: number;
  secondary_used_percent?: number;
  secondary_reset_after_seconds?: number;
  secondary_window_minutes?: number;
  primary_over_secondary_percent?: number;
  primary_reset_at_seconds?: number;
  secondary_reset_at_seconds?: number;
  credits_has_credits?: boolean;
  credits_balance?: string;
  credits_unlimited?: boolean;
  updated_at?: string;
}

export interface AntigravityModelQuota {
  name: string;
  remaining_percent?: number;
  reset_time?: string;
}

export interface AntigravityQuota {
  models?: AntigravityModelQuota[];
  forbidden?: boolean;
  updated_at?: string;
}

export interface QuotaState {
  exceeded?: boolean;
  reason?: string;
  next_recover_at?: string;
  backoff_level?: number;
}

export interface AuthFileItem {
  id?: string;
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  modified?: number;
  priority?: number;
  quota?: QuotaState;
  codex_quota?: CodexQuota;
  antigravity_quota?: AntigravityQuota;
  kiro_usage?: KiroUsageSnapshot;
  [key: string]: any;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
