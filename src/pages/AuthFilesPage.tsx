import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '@/hooks/useInterval';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuotaBar } from '@/components/ui/QuotaBar';
import { IconBot, IconDownload, IconEye, IconEyeOff, IconInfo, IconTrash2 } from '@/components/ui/icons';
import { useAuthStore, useNotificationStore, useThemeStore } from '@/stores';
import { authFilesApi, usageApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import type { AuthFileItem } from '@/types';
import type { KeyStats, KeyStatBucket } from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import styles from './AuthFilesPage.module.scss';

type ThemeColors = { bg: string; text: string; border?: string };
type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
type ResolvedTheme = 'light' | 'dark';

// 标签类型颜色配置（对齐重构前 styles.css 的 file-type-badge 颜色）
const TYPE_COLORS: Record<string, TypeColorSet> = {
  qwen: {
    light: { bg: '#e8f5e9', text: '#2e7d32' },
    dark: { bg: '#1b5e20', text: '#81c784' }
  },
  gemini: {
    light: { bg: '#e3f2fd', text: '#1565c0' },
    dark: { bg: '#0d47a1', text: '#64b5f6' }
  },
  'gemini-cli': {
    light: { bg: '#e7efff', text: '#1e4fa3' },
    dark: { bg: '#1c3f73', text: '#a8c7ff' }
  },
  aistudio: {
    light: { bg: '#f0f2f5', text: '#2f343c' },
    dark: { bg: '#373c42', text: '#cfd3db' }
  },
  claude: {
    light: { bg: '#fce4ec', text: '#c2185b' },
    dark: { bg: '#880e4f', text: '#f48fb1' }
  },
  codex: {
    light: { bg: '#fff3e0', text: '#ef6c00' },
    dark: { bg: '#e65100', text: '#ffb74d' }
  },
  antigravity: {
    light: { bg: '#e0f7fa', text: '#006064' },
    dark: { bg: '#004d40', text: '#80deea' }
  },
  iflow: {
    light: { bg: '#f3e5f5', text: '#7b1fa2' },
    dark: { bg: '#4a148c', text: '#ce93d8' }
  },
  empty: {
    light: { bg: '#f5f5f5', text: '#616161' },
    dark: { bg: '#424242', text: '#bdbdbd' }
  },
  unknown: {
    light: { bg: '#f0f0f0', text: '#666666', border: '1px dashed #999999' },
    dark: { bg: '#3a3a3a', text: '#aaaaaa', border: '1px dashed #666666' }
  }
};

interface ExcludedFormState {
  provider: string;
  modelsText: string;
}

// 标准化 auth_index 值（与 usage.ts 中的 normalizeAuthIndex 保持一致）
function normalizeAuthIndexValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean {
  const raw = file['runtime_only'] ?? file.runtimeOnly;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}

function toLowerString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function remainingPercentFromUsedPercent(usedPercent: unknown): number | null {
  if (typeof usedPercent !== 'number' || !Number.isFinite(usedPercent)) return null;
  const remaining = Math.round(100 - usedPercent);
  if (remaining < 0) return 0;
  if (remaining > 100) return 100;
  return remaining;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCooldownRemainingSeconds(secondsRemaining: number): string {
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return '0m';
  const minutes = Math.ceil(secondsRemaining / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins}m`;
}

function formatRelativeTime(secondsAgo: number, isZh: boolean): string {
  if (!Number.isFinite(secondsAgo) || secondsAgo < 0) secondsAgo = 0;
  if (secondsAgo < 60) return isZh ? '刚刚' : 'just now';
  const minutes = Math.floor(secondsAgo / 60);
  if (minutes < 60) return isZh ? `${minutes}分钟前` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isZh ? `${hours}小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isZh ? `${days}天前` : `${days}d ago`;
}

// 解析认证文件的统计数据
function resolveAuthFileStats(
  file: AuthFileItem,
  stats: KeyStats
): KeyStatBucket {
  const defaultStats: KeyStatBucket = { success: 0, failure: 0 };
  const rawFileName = file?.name || '';

  // 兼容 auth_index 和 authIndex 两种字段名（API 返回的是 auth_index）
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndexValue(rawAuthIndex);

  // 尝试根据 authIndex 匹配
  if (authIndexKey && stats.byAuthIndex?.[authIndexKey]) {
    return stats.byAuthIndex[authIndexKey];
  }

  // 尝试根据 source (文件名) 匹配
  if (rawFileName && stats.bySource?.[rawFileName]) {
    const fromName = stats.bySource[rawFileName];
    if (fromName.success > 0 || fromName.failure > 0) {
      return fromName;
    }
  }

  // 尝试去掉扩展名后匹配
  if (rawFileName) {
    const nameWithoutExt = rawFileName.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt && nameWithoutExt !== rawFileName) {
      const fromNameWithoutExt = stats.bySource?.[nameWithoutExt];
      if (fromNameWithoutExt && (fromNameWithoutExt.success > 0 || fromNameWithoutExt.failure > 0)) {
        return fromNameWithoutExt;
      }
    }
  }

  return defaultStats;
}

export function AuthFilesPage() {
  const { t, i18n } = useTranslation();
  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [keyStats, setKeyStats] = useState<KeyStats>({ bySource: {}, byAuthIndex: {} });

  // 详情弹窗相关
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<AuthFileItem | null>(null);

  // 模型列表弹窗相关
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<{ id: string; display_name?: string; type?: string }[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<'unsupported' | null>(null);
  const [refreshingQuota, setRefreshingQuota] = useState<Record<string, boolean>>({});
  const [sessionBindings, setSessionBindings] = useState<Record<string, { sessionCount: number; lastUsedAt: string }>>({});
  const [sessionBindingsLoaded, setSessionBindingsLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [togglingDisabled, setTogglingDisabled] = useState<Record<string, boolean>>({});

  // OAuth 排除模型相关
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<'unsupported' | null>(null);
  const [excludedModalOpen, setExcludedModalOpen] = useState(false);
  const [excludedForm, setExcludedForm] = useState<ExcludedFormState>({ provider: '', modelsText: '' });
  const [savingExcluded, setSavingExcluded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadingKeyStatsRef = useRef(false);
  const excludedUnsupportedRef = useRef(false);

  const disableControls = connectionStatus !== 'connected';

  // 格式化修改时间
  const formatModified = (item: AuthFileItem): string => {
    const raw = item['modtime'] ?? item.modified;
    if (!raw) return '-';
    const asNumber = Number(raw);
    const date =
      Number.isFinite(asNumber) && !Number.isNaN(asNumber)
        ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
        : new Date(String(raw));
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
  };

  // 加载文件列表
  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authFilesApi.list();
      setFiles(data?.files || []);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const refreshAntigravityQuota = useCallback(
    async (item: AuthFileItem) => {
      // Prefer id (auth.ID) over name (filename) when available
      // Backend supports both, but id is the canonical identifier
      const authID = item.id ? String(item.id).trim() : String(item.name || '').trim();
      if (!authID) return;

      setRefreshingQuota((prev) => ({ ...prev, [authID]: true }));
      try {
        const data = await authFilesApi.refreshAntigravityQuota(authID);
        const updated = data && (data as any).auth ? ((data as any).auth as AuthFileItem) : null;

        if (updated) {
          setFiles((prev) =>
            prev.map((f) => {
              // Match using same logic as authID extraction
              const fid = f.id ? String(f.id).trim() : String(f.name || '').trim();
              return fid === authID ? updated : f;
            })
          );
        } else {
          await loadFiles();
        }

        showNotification(t('auth_files.refresh_quota_success', { defaultValue: 'Quota refreshed' }), 'success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('notification.refresh_failed');
        showNotification(msg, 'error');
      } finally {
        setRefreshingQuota((prev) => {
          const next = { ...prev };
          delete next[authID];
          return next;
        });
      }
    },
    [loadFiles, showNotification, t]
  );

  const refreshCodexQuota = useCallback(
    async (item: AuthFileItem) => {
      const authID = item.id ? String(item.id).trim() : String(item.name || '').trim();
      if (!authID) return;

      setRefreshingQuota((prev) => ({ ...prev, [authID]: true }));
      try {
        const data = await authFilesApi.refreshCodexQuota(authID, 'gpt-5.2');
        const updated = data && (data as any).auth ? ((data as any).auth as AuthFileItem) : null;

        if (updated) {
          setFiles((prev) =>
            prev.map((f) => {
              const fid = f.id ? String(f.id).trim() : String(f.name || '').trim();
              return fid === authID ? updated : f;
            })
          );
        } else {
          await loadFiles();
        }

        showNotification(t('auth_files.refresh_quota_success', { defaultValue: 'Quota refreshed' }), 'success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('notification.refresh_failed');
        showNotification(msg, 'error');
      } finally {
        setRefreshingQuota((prev) => {
          const next = { ...prev };
          delete next[authID];
          return next;
        });
      }
    },
    [loadFiles, showNotification, t]
  );

  // 加载 key 统计和 usage 明细（API 层已有60秒超时）
  const loadKeyStats = useCallback(async () => {
    // 防止重复请求
    if (loadingKeyStatsRef.current) return;
    loadingKeyStatsRef.current = true;
    try {
      const usageResponse = await usageApi.getUsage();
      const usageData = usageResponse?.usage ?? usageResponse;
      const stats = await usageApi.getKeyStats(usageData);
      setKeyStats(stats);
    } catch {
      // 静默失败
    } finally {
      loadingKeyStatsRef.current = false;
    }
  }, []);

  const loadSessionBindings = useCallback(async () => {
    try {
      const res = await authFilesApi.listSessionBindings();
      const bindings = res?.bindings ?? [];
      const next: Record<string, { sessionCount: number; lastUsedAt: string }> = {};
      for (const b of bindings) {
        if (!b?.auth_id) continue;
        next[b.auth_id] = {
          sessionCount: Number(b.session_count) || 0,
          lastUsedAt: String(b.last_used_at || '')
        };
      }
      setSessionBindings(next);
      setSessionBindingsLoaded(true);
    } catch {
      // Silently ignore
    }
  }, []);

  // 加载 OAuth 排除列表
  const loadExcluded = useCallback(async () => {
    try {
      const res = await authFilesApi.getOauthExcludedModels();
      excludedUnsupportedRef.current = false;
      setExcluded(res || {});
      setExcludedError(null);
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setExcluded({});
        setExcludedError('unsupported');
        if (!excludedUnsupportedRef.current) {
          excludedUnsupportedRef.current = true;
          showNotification(t('oauth_excluded.upgrade_required'), 'warning');
        }
        return;
      }
      // 静默失败
    }
  }, [showNotification, t]);

  // Auto-refresh Antigravity quotas when files are loaded
  const autoRefreshAntigravityQuotas = useCallback(
    async (authFiles: AuthFileItem[]) => {
      const antigravityFiles = authFiles.filter(
        (f) => toLowerString(f.provider || f.type) === 'antigravity' && !isRuntimeOnlyAuthFile(f)
      );
      if (antigravityFiles.length === 0) return;

      // Refresh quotas in parallel (limit concurrency to 3)
      const batchSize = 3;
      for (let i = 0; i < antigravityFiles.length; i += batchSize) {
        const batch = antigravityFiles.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (item) => {
            const authID = item.id ? String(item.id).trim() : String(item.name || '').trim();
            if (!authID) return;

            // Skip if already has quota data
            if (item.antigravity_quota?.models && item.antigravity_quota.models.length > 0) {
              return;
            }

            try {
              const data = await authFilesApi.refreshAntigravityQuota(authID);
              const updated = data && (data as any).auth ? ((data as any).auth as AuthFileItem) : null;
              if (updated) {
                setFiles((prev) =>
                  prev.map((f) => {
                    const fid = f.id ? String(f.id).trim() : String(f.name || '').trim();
                    return fid === authID ? updated : f;
                  })
                );
              }
            } catch {
              // Silently ignore errors during auto-refresh
            }
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    const initPage = async () => {
      await loadFiles();
      loadKeyStats();
      loadExcluded();
      loadSessionBindings();
    };
    initPage();
  }, [loadFiles, loadKeyStats, loadExcluded, loadSessionBindings]);

  // Auto-refresh Antigravity quotas after files are loaded
  useEffect(() => {
    if (files.length > 0 && !loading) {
      autoRefreshAntigravityQuotas(files);
    }
    // Only run when files change (after initial load or refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length, loading]);

  // 定时刷新状态数据（每240秒）
  useInterval(loadKeyStats, 240_000);
  // 定时刷新绑定状态（每10秒）
  useInterval(loadSessionBindings, 10_000);
  // Cooldown countdown ticker
  useInterval(() => setNowMs(Date.now()), 5_000);

  // 提取所有存在的类型
  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files]);

  // 过滤和搜索
  const filtered = useMemo(() => {
    return files.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.type || '').toString().toLowerCase().includes(term) ||
        (item.provider || '').toString().toLowerCase().includes(term);
      return matchType && matchSearch;
    });
  }, [files, filter, search]);

  // 分页计算
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  // 统计信息
  const totalSize = useMemo(() => files.reduce((sum, item) => sum + (item.size || 0), 0), [files]);

  // 点击上传
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 处理文件上传（支持多选）
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesToUpload = Array.from(fileList);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    filesToUpload.forEach((file) => {
      if (file.name.endsWith('.json')) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      showNotification(t('auth_files.upload_error_json'), 'error');
    }

    if (validFiles.length === 0) {
      event.target.value = '';
      return;
    }

    setUploading(true);
    let successCount = 0;
    const failed: { name: string; message: string }[] = [];

    for (const file of validFiles) {
      try {
        await authFilesApi.upload(file);
        successCount++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        failed.push({ name: file.name, message: errorMessage });
      }
    }

    if (successCount > 0) {
      const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
      showNotification(`${t('auth_files.upload_success')}${suffix}`, failed.length ? 'warning' : 'success');
      await loadFiles();
      await loadKeyStats();
    }

    if (failed.length > 0) {
      const details = failed.map((item) => `${item.name}: ${item.message}`).join('; ');
      showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
    }

    setUploading(false);
    event.target.value = '';
  };

  // 删除单个文件
  const handleDelete = async (name: string) => {
    if (!window.confirm(`${t('auth_files.delete_confirm')} "${name}" ?`)) return;
    setDeleting(name);
    try {
      await authFilesApi.deleteFile(name);
      showNotification(t('auth_files.delete_success'), 'success');
      setFiles((prev) => prev.filter((item) => item.name !== name));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
    } finally {
      setDeleting(null);
    }
  };

  // 删除全部（根据筛选类型）
  const handleDeleteAll = async () => {
    const isFiltered = filter !== 'all';
    const typeLabel = isFiltered ? getTypeLabel(filter) : t('auth_files.filter_all');
    const confirmMessage = isFiltered
      ? t('auth_files.delete_filtered_confirm', { type: typeLabel })
      : t('auth_files.delete_all_confirm');

    if (!window.confirm(confirmMessage)) return;

    setDeletingAll(true);
    try {
      if (!isFiltered) {
        // 删除全部
        await authFilesApi.deleteAll();
        showNotification(t('auth_files.delete_all_success'), 'success');
        setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
      } else {
        // 删除筛选类型的文件
        const filesToDelete = files.filter(
          (f) => f.type === filter && !isRuntimeOnlyAuthFile(f)
        );

        if (filesToDelete.length === 0) {
          showNotification(t('auth_files.delete_filtered_none', { type: typeLabel }), 'info');
          setDeletingAll(false);
          return;
        }

        let success = 0;
        let failed = 0;
        const deletedNames: string[] = [];

        for (const file of filesToDelete) {
          try {
            await authFilesApi.deleteFile(file.name);
            success++;
            deletedNames.push(file.name);
          } catch {
            failed++;
          }
        }

        setFiles((prev) => prev.filter((f) => !deletedNames.includes(f.name)));

        if (failed === 0) {
          showNotification(
            t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
            'warning'
          );
        }
        setFilter('all');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
    } finally {
      setDeletingAll(false);
    }
  };

  // 下载文件
  const handleDownload = async (name: string) => {
    try {
      const response = await apiClient.getRaw(`/auth-files/download?name=${encodeURIComponent(name)}`, {
        responseType: 'blob'
      });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.URL.revokeObjectURL(url);
      showNotification(t('auth_files.download_success'), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    }
  };

  // 显示详情弹窗
  const showDetails = (file: AuthFileItem) => {
    setSelectedFile(file);
    setDetailModalOpen(true);
  };

  // 显示模型列表
  const showModels = async (item: AuthFileItem) => {
    setModelsFileName(item.name);
    setModelsFileType(item.type || '');
    setModelsList([]);
    setModelsError(null);
    setModelsModalOpen(true);
    setModelsLoading(true);
    try {
      const models = await authFilesApi.getModelsForAuthFile(item.name);
      setModelsList(models);
    } catch (err) {
      // 检测是否是 API 不支持的错误 (404 或特定错误消息)
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Not Found')) {
        setModelsError('unsupported');
      } else {
        showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
      }
    } finally {
      setModelsLoading(false);
    }
  };

  // 检查模型是否被 OAuth 排除
  const isModelExcluded = (modelId: string, providerType: string): boolean => {
    const excludedModels = excluded[providerType] || [];
    return excludedModels.some(pattern => {
      if (pattern.includes('*')) {
        // 支持通配符匹配
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
        return regex.test(modelId);
      }
      return pattern.toLowerCase() === modelId.toLowerCase();
    });
  };

  // 获取类型标签显示文本
  const getTypeLabel = (type: string): string => {
    const key = `auth_files.filter_${type}`;
    const translated = t(key);
    if (translated !== key) return translated;
    if (type.toLowerCase() === 'iflow') return 'iFlow';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // 获取类型颜色
  const getTypeColor = (type: string): ThemeColors => {
    const set = TYPE_COLORS[type] || TYPE_COLORS.unknown;
    return resolvedTheme === 'dark' && set.dark ? set.dark : set.light;
  };

  // OAuth 排除相关方法
  const openExcludedModal = (provider?: string) => {
    const models = provider ? excluded[provider] : [];
    setExcludedForm({
      provider: provider || '',
      modelsText: Array.isArray(models) ? models.join('\n') : ''
    });
    setExcludedModalOpen(true);
  };

  const saveExcludedModels = async () => {
    const provider = excludedForm.provider.trim();
    if (!provider) {
      showNotification(t('oauth_excluded.provider_required'), 'error');
      return;
    }
    const models = excludedForm.modelsText
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    setSavingExcluded(true);
    try {
      if (models.length) {
        await authFilesApi.saveOauthExcludedModels(provider, models);
      } else {
        await authFilesApi.deleteOauthExcludedEntry(provider);
      }
      await loadExcluded();
      showNotification(t('oauth_excluded.save_success'), 'success');
      setExcludedModalOpen(false);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.save_failed')}: ${errorMessage}`, 'error');
    } finally {
      setSavingExcluded(false);
    }
  };

  const deleteExcluded = async (provider: string) => {
    if (!window.confirm(t('oauth_excluded.delete_confirm', { provider }))) return;
    try {
      await authFilesApi.deleteOauthExcludedEntry(provider);
      await loadExcluded();
      showNotification(t('oauth_excluded.delete_success'), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('oauth_excluded.delete_failed')}: ${errorMessage}`, 'error');
    }
  };

  // 渲染标签筛选器
  const renderFilterTags = () => (
    <div className={styles.filterTags}>
      {existingTypes.map((type) => {
        const isActive = filter === type;
        const color = type === 'all' ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' } : getTypeColor(type);
        const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#fff';
        return (
          <button
            key={type}
            className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ''}`}
            style={{
              backgroundColor: isActive ? color.text : color.bg,
              color: isActive ? activeTextColor : color.text,
              borderColor: color.text
            }}
            onClick={() => {
              setFilter(type);
              setPage(1);
            }}
          >
            {getTypeLabel(type)}
          </button>
        );
      })}
    </div>
  );

  // 渲染单个认证文件卡片
  const renderFileCard = (item: AuthFileItem) => {
    const fileStats = resolveAuthFileStats(item, keyStats);
    const isRuntimeOnly = isRuntimeOnlyAuthFile(item);
    const typeColor = getTypeColor(item.type || 'unknown');
    const provider = toLowerString(item.provider || item.type);
    const authID = String(item.id || item.name || '').trim();
    const authIDOnly = item.id ? String(item.id).trim() : '';
    const bindingInfo = authIDOnly ? sessionBindings[authIDOnly] : undefined;

    // Priority and status helpers
    const priority = (item as any).priority as number | undefined;
    const effectivePriority = typeof priority === 'number' && Number.isFinite(priority) ? priority : 50;
    const cooldownUntil = parseDate(item.quota?.next_recover_at);
    const cooldownSecondsRemaining =
      cooldownUntil && cooldownUntil.getTime() > nowMs ? Math.ceil((cooldownUntil.getTime() - nowMs) / 1000) : 0;
    const isCoolingDown = cooldownSecondsRemaining > 0 && (item.quota?.exceeded === true || (item as any).unavailable === true);
    const isUnavailable = (item as any).unavailable === true || isCoolingDown;
    const isDisabled = (item as any).disabled === true;
    const isZh = (i18n?.language || '').toLowerCase().startsWith('zh');

    const bindingCount = bindingInfo?.sessionCount ?? 0;
    const lastUsed = bindingInfo?.lastUsedAt ? parseDate(bindingInfo.lastUsedAt) : null;
    const lastUsedAgeSec = lastUsed ? Math.max(0, Math.floor((nowMs - lastUsed.getTime()) / 1000)) : null;
    const lastUsedText = lastUsedAgeSec === null ? '' : formatRelativeTime(lastUsedAgeSec, isZh);
    const cooldownReason = item.quota?.reason ? ` (${item.quota.reason})` : '';

    const getPriorityBadge = () => {
      const isHighPriority = effectivePriority < 20;
      const isMediumPriority = effectivePriority >= 20 && effectivePriority < 50;
      return (
        <span
          className={`${styles.priorityBadge} ${isHighPriority ? styles.priorityHigh : isMediumPriority ? styles.priorityMedium : styles.priorityLow}`}
          title={t('auth_files.priority_tooltip', { defaultValue: `Priority: ${effectivePriority} (lower = higher priority)` })}
        >
          P:{effectivePriority}
        </span>
      );
    };

    const getStatusIndicator = () => {
      if (isDisabled) {
        return <span className={`${styles.statusIndicator} ${styles.statusDisabled}`} title={t('auth_files.status_disabled', { defaultValue: 'Disabled' })}>⚫</span>;
      }
      if (isUnavailable) {
        const remaining = isCoolingDown ? formatCooldownRemainingSeconds(cooldownSecondsRemaining) : '';
        const reason = item.quota?.reason ? ` (${item.quota.reason})` : '';
        const title = remaining
          ? t('auth_files.status_unavailable_remaining', { defaultValue: `Cooling down: ${remaining}${reason}`, remaining })
          : t('auth_files.status_unavailable', { defaultValue: 'Unavailable (cooling down)' });
        return <span className={`${styles.statusIndicator} ${styles.statusUnavailable}`} title={title}>🔴</span>;
      }
      return <span className={`${styles.statusIndicator} ${styles.statusActive}`} title={t('auth_files.status_active', { defaultValue: 'Active' })}>🟢</span>;
    };

    const toggleDisabled = async () => {
      const id = authIDOnly;
      if (!id) return;

      setTogglingDisabled((prev) => ({ ...prev, [id]: true }));
      try {
        const data = await authFilesApi.setDisabled(id, !isDisabled);
        const updated = data && (data as any).auth ? ((data as any).auth as AuthFileItem) : null;

        if (updated) {
          setFiles((prev) => prev.map((f) => (String(f.id || '').trim() === id ? updated : f)));
        } else {
          await loadFiles();
        }

        showNotification(
          !isDisabled
            ? t('auth_files.disabled_success', { defaultValue: 'Disabled' })
            : t('auth_files.enabled_success', { defaultValue: 'Enabled' }),
          'success'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t('notification.refresh_failed');
        showNotification(msg, 'error');
      } finally {
        setTogglingDisabled((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    };

    return (
      <div key={item.name} className={`${styles.fileCard} ${isUnavailable ? styles.cardUnavailable : ''} ${isDisabled ? styles.cardDisabled : ''}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <span
              className={styles.typeBadge}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {})
              }}
            >
              {getTypeLabel(item.type || 'unknown')}
            </span>
            <span className={styles.fileName}>{item.name}</span>
          </div>
          <div className={styles.cardHeaderRight}>
            {getStatusIndicator()}
            {getPriorityBadge()}
          </div>
        </div>

        <div className={styles.cardMeta}>
          <span>{t('auth_files.file_size')}: {item.size ? formatFileSize(item.size) : '-'}</span>
          <span>{t('auth_files.file_modified')}: {formatModified(item)}</span>
          {sessionBindingsLoaded && authIDOnly ? (
            <span title={lastUsedText ? t('auth_files.sessions_last_used_relative', { defaultValue: `Last used: ${lastUsedText}` }) : undefined}>
              {t('auth_files.sessions', { defaultValue: 'Sessions' })}: {bindingCount}{lastUsedText ? ` · ${lastUsedText}` : ''}
            </span>
          ) : null}
          {isCoolingDown ? (
            <span className={styles.cooldownText}>
              {t('auth_files.cooldown_remaining', { defaultValue: 'Cooldown' })}: {formatCooldownRemainingSeconds(cooldownSecondsRemaining)}{cooldownReason}
            </span>
          ) : null}
        </div>

        <div className={styles.cardStats}>
          <span className={`${styles.statPill} ${styles.statSuccess}`}>
            {t('stats.success')}: {fileStats.success}
          </span>
          <span className={`${styles.statPill} ${styles.statFailure}`}>
            {t('stats.failure')}: {fileStats.failure}
          </span>
        </div>

        {/* Quota */}
        {provider === 'codex' ? (
          <div className={styles.quotaSection}>
            {item.codex_quota ? (
              <>
                {item.codex_quota.plan_type ? (
                  <div className={styles.quotaHint}>
                    {t('auth_files.codex_plan_type', { defaultValue: 'Plan' })}: {String(item.codex_quota.plan_type)}
                  </div>
                ) : null}
                <QuotaBar
                  label={t('auth_files.quota_primary', { defaultValue: 'Primary' })}
                  percent={remainingPercentFromUsedPercent(item.codex_quota.primary_used_percent)}
                  resetSeconds={item.codex_quota.primary_reset_after_seconds ?? null}
                />
                <QuotaBar
                  label={t('auth_files.quota_secondary', { defaultValue: 'Secondary' })}
                  percent={remainingPercentFromUsedPercent(item.codex_quota.secondary_used_percent)}
                  resetSeconds={item.codex_quota.secondary_reset_after_seconds ?? null}
                />
                {item.codex_quota.credits_balance ? (
                  <div className={styles.quotaHint}>
                    {t('auth_files.codex_credits_balance', { defaultValue: 'Credits balance' })}: {String(item.codex_quota.credits_balance)}
                  </div>
                ) : null}
              </>
            ) : (
              <div className={styles.quotaHint}>
                {t('auth_files.codex_quota_empty', { defaultValue: 'No quota data. Click refresh (uses a tiny probe request).' })}
              </div>
            )}

            <div className={styles.quotaActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refreshCodexQuota(item)}
                disabled={disableControls || !authID || isRuntimeOnly}
                loading={!!refreshingQuota[authID]}
              >
                {t('auth_files.refresh_quota', { defaultValue: 'Refresh quota' })}
              </Button>
            </div>
          </div>
        ) : null}

        {provider === 'antigravity' ? (
          <div className={styles.quotaSection}>
            {item.antigravity_quota?.forbidden ? (
              <div className={styles.quotaHint}>
                {t('auth_files.quota_forbidden', { defaultValue: 'Quota unavailable (403)' })}
              </div>
            ) : null}

            {(() => {
              const models = item.antigravity_quota?.models ?? [];
              return models.length > 0 ? (
                <div className={styles.quotaList}>
                  {models.map((m) => (
                    <QuotaBar
                      key={m.name}
                      label={m.name}
                      percent={m.remaining_percent ?? null}
                      resetTime={m.reset_time ?? null}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.quotaHint}>
                  {t('auth_files.quota_empty', { defaultValue: 'No quota data. Click refresh.' })}
                </div>
              );
            })()}

            <div className={styles.quotaActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refreshAntigravityQuota(item)}
                disabled={disableControls || !authID || isRuntimeOnly}
                loading={!!refreshingQuota[authID]}
              >
                {t('auth_files.refresh_quota', { defaultValue: 'Refresh quota' })}
              </Button>
            </div>
          </div>
        ) : null}

        <div className={styles.cardActions}>
          {isRuntimeOnly ? (
            <>
              <div className={styles.virtualBadge}>{t('auth_files.type_virtual') || '虚拟认证文件'}</div>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleDisabled}
                className={styles.iconButton}
                title={isDisabled ? t('auth_files.enable_button', { defaultValue: 'Enable' }) : t('auth_files.disable_button', { defaultValue: 'Disable' })}
                disabled={disableControls || !authIDOnly || !!togglingDisabled[authIDOnly]}
                loading={!!togglingDisabled[authIDOnly]}
              >
                {isDisabled ? <IconEye className={styles.actionIcon} size={16} /> : <IconEyeOff className={styles.actionIcon} size={16} />}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => showModels(item)}
                className={styles.iconButton}
                title={t('auth_files.models_button', { defaultValue: '模型' })}
                disabled={disableControls}
              >
                <IconBot className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => showDetails(item)}
                className={styles.iconButton}
                title={t('common.info', { defaultValue: '关于' })}
                disabled={disableControls}
              >
                <IconInfo className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleDisabled}
                className={styles.iconButton}
                title={isDisabled ? t('auth_files.enable_button', { defaultValue: 'Enable' }) : t('auth_files.disable_button', { defaultValue: 'Disable' })}
                disabled={disableControls || !authIDOnly || !!togglingDisabled[authIDOnly]}
                loading={!!togglingDisabled[authIDOnly]}
              >
                {isDisabled ? <IconEye className={styles.actionIcon} size={16} /> : <IconEyeOff className={styles.actionIcon} size={16} />}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDownload(item.name)}
                className={styles.iconButton}
                title={t('auth_files.download_button')}
                disabled={disableControls}
              >
                <IconDownload className={styles.actionIcon} size={16} />
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.name)}
                className={styles.iconButton}
                title={t('auth_files.delete_button')}
                disabled={disableControls || deleting === item.name}
              >
                {deleting === item.name ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <IconTrash2 className={styles.actionIcon} size={16} />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={t('auth_files.title_section')}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={() => { loadFiles(); loadKeyStats(); }} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDeleteAll}
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {filter === 'all' ? t('auth_files.delete_all_button') : `${t('common.delete')} ${getTypeLabel(filter)}`}
            </Button>
            <Button size="sm" onClick={handleUploadClick} disabled={disableControls || uploading} loading={uploading}>
              {t('auth_files.upload_button')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        {/* 筛选区域 */}
        <div className={styles.filterSection}>
          {renderFilterTags()}

          <div className={styles.filterControls}>
            <div className={styles.filterItem}>
              <label>{t('auth_files.search_label')}</label>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={t('auth_files.search_placeholder')}
              />
            </div>
            <div className={styles.filterItem}>
              <label>{t('auth_files.page_size_label')}</label>
              <select
                className={styles.pageSizeSelect}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) || 9);
                  setPage(1);
                }}
              >
                <option value={6}>6</option>
                <option value={9}>9</option>
                <option value={12}>12</option>
                <option value={18}>18</option>
                <option value={24}>24</option>
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>{t('common.info')}</label>
              <div className={styles.statsInfo}>
                {files.length} {t('auth_files.files_count')} · {formatFileSize(totalSize)}
              </div>
            </div>
          </div>
        </div>

        {/* 卡片网格 */}
        {loading ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : pageItems.length === 0 ? (
          <EmptyState title={t('auth_files.search_empty_title')} description={t('auth_files.search_empty_desc')} />
        ) : (
          <div className={styles.fileGrid}>
            {pageItems.map(renderFileCard)}
          </div>
        )}

        {/* 分页 */}
        {!loading && filtered.length > pageSize && (
          <div className={styles.pagination}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
            >
              {t('auth_files.pagination_prev')}
            </Button>
            <div className={styles.pageInfo}>
              {t('auth_files.pagination_info', {
                current: currentPage,
                total: totalPages,
                count: filtered.length
              })}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('auth_files.pagination_next')}
            </Button>
          </div>
        )}
      </Card>

      {/* OAuth 排除列表卡片 */}
      <Card
        title={t('oauth_excluded.title')}
        extra={
          <Button
            size="sm"
            onClick={() => openExcludedModal()}
            disabled={disableControls || excludedError === 'unsupported'}
          >
            {t('oauth_excluded.add')}
          </Button>
        }
      >
        {excludedError === 'unsupported' ? (
          <EmptyState
            title={t('oauth_excluded.upgrade_required_title')}
            description={t('oauth_excluded.upgrade_required_desc')}
          />
        ) : Object.keys(excluded).length === 0 ? (
          <EmptyState title={t('oauth_excluded.list_empty_all')} />
        ) : (
          <div className={styles.excludedList}>
            {Object.entries(excluded).map(([provider, models]) => (
              <div key={provider} className={styles.excludedItem}>
                <div className={styles.excludedInfo}>
                  <div className={styles.excludedProvider}>{provider}</div>
                  <div className={styles.excludedModels}>
                    {models?.length
                      ? t('oauth_excluded.model_count', { count: models.length })
                      : t('oauth_excluded.no_models')}
                  </div>
                </div>
                <div className={styles.excludedActions}>
                  <Button variant="secondary" size="sm" onClick={() => openExcludedModal(provider)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteExcluded(provider)}>
                    {t('oauth_excluded.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 详情弹窗 */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={selectedFile?.name || t('auth_files.title_section')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
              {t('common.close')}
            </Button>
            <Button
              onClick={() => {
                if (selectedFile) {
                  const text = JSON.stringify(selectedFile, null, 2);
                  navigator.clipboard.writeText(text).then(() => {
                    showNotification(t('notification.link_copied'), 'success');
                  });
                }
              }}
            >
              {t('common.copy')}
            </Button>
          </>
        }
      >
        {selectedFile && (
          <div className={styles.detailContent}>
            <pre className={styles.jsonContent}>{JSON.stringify(selectedFile, null, 2)}</pre>
          </div>
        )}
      </Modal>

      {/* 模型列表弹窗 */}
      <Modal
        open={modelsModalOpen}
        onClose={() => setModelsModalOpen(false)}
        title={t('auth_files.models_title', { defaultValue: '支持的模型' }) + ` - ${modelsFileName}`}
        footer={
          <Button variant="secondary" onClick={() => setModelsModalOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        {modelsLoading ? (
          <div className={styles.hint}>{t('auth_files.models_loading', { defaultValue: '正在加载模型列表...' })}</div>
        ) : modelsError === 'unsupported' ? (
          <EmptyState
            title={t('auth_files.models_unsupported', { defaultValue: '当前版本不支持此功能' })}
            description={t('auth_files.models_unsupported_desc', { defaultValue: '请更新 CLI Proxy API 到最新版本后重试' })}
          />
        ) : modelsList.length === 0 ? (
          <EmptyState
            title={t('auth_files.models_empty', { defaultValue: '该凭证暂无可用模型' })}
            description={t('auth_files.models_empty_desc', { defaultValue: '该认证凭证可能尚未被服务器加载或没有绑定任何模型' })}
          />
        ) : (
          <div className={styles.modelsList}>
            {modelsList.map((model) => {
              const isExcluded = isModelExcluded(model.id, modelsFileType);
              return (
                <div
                  key={model.id}
                  className={`${styles.modelItem} ${isExcluded ? styles.modelItemExcluded : ''}`}
                  onClick={() => {
                    navigator.clipboard.writeText(model.id);
                    showNotification(t('notification.link_copied', { defaultValue: '已复制到剪贴板' }), 'success');
                  }}
                  title={isExcluded ? t('auth_files.models_excluded_hint', { defaultValue: '此模型已被 OAuth 排除' }) : t('common.copy', { defaultValue: '点击复制' })}
                >
                  <span className={styles.modelId}>{model.id}</span>
                  {model.display_name && model.display_name !== model.id && (
                    <span className={styles.modelDisplayName}>{model.display_name}</span>
                  )}
                  {model.type && (
                    <span className={styles.modelType}>{model.type}</span>
                  )}
                  {isExcluded && (
                    <span className={styles.modelExcludedBadge}>{t('auth_files.models_excluded_badge', { defaultValue: '已排除' })}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* OAuth 排除弹窗 */}
      <Modal
        open={excludedModalOpen}
        onClose={() => setExcludedModalOpen(false)}
        title={t('oauth_excluded.add_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExcludedModalOpen(false)} disabled={savingExcluded}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveExcludedModels} loading={savingExcluded}>
              {t('oauth_excluded.save')}
            </Button>
          </>
        }
      >
        <Input
          label={t('oauth_excluded.provider_label')}
          placeholder={t('oauth_excluded.provider_placeholder')}
          value={excludedForm.provider}
          onChange={(e) => setExcludedForm((prev) => ({ ...prev, provider: e.target.value }))}
        />
        <div className={styles.formGroup}>
          <label>{t('oauth_excluded.models_label')}</label>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder={t('oauth_excluded.models_placeholder')}
            value={excludedForm.modelsText}
            onChange={(e) => setExcludedForm((prev) => ({ ...prev, modelsText: e.target.value }))}
          />
          <div className={styles.hint}>{t('oauth_excluded.models_hint')}</div>
        </div>
      </Modal>
    </div>
  );
}
