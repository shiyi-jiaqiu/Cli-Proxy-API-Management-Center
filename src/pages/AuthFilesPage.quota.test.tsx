import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores';
import { AuthFilesPage } from './AuthFilesPage';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<any>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: any) => opts?.defaultValue ?? key
    })
  };
});

vi.mock('@/services/api', () => {
  return {
    authFilesApi: {
      list: vi.fn().mockResolvedValue({
        files: [
          {
            id: 'codex-1',
            name: 'codex-1.json',
            type: 'codex',
            codex_quota: {
              primary_used_percent: 27,
              primary_reset_after_seconds: 3600,
              secondary_used_percent: 50,
              secondary_reset_after_seconds: 7200
            }
          },
          {
            id: 'codex-2',
            name: 'codex-2.json',
            type: 'codex'
          },
          {
            id: 'ag-1',
            name: 'antigravity-1.json',
            type: 'antigravity',
            antigravity_quota: {
              models: [{ name: 'gemini-3-pro-high', remaining_percent: 73, reset_time: '2099-01-01T00:00:00Z' }]
            }
          }
        ]
      }),
      getModelsForAuthFile: vi.fn().mockResolvedValue([]),
      getOauthExcludedModels: vi.fn().mockResolvedValue({}),
      listSessionBindings: vi.fn().mockResolvedValue({ bindings: [] }),
      deleteAll: vi.fn(),
      deleteFile: vi.fn(),
      upload: vi.fn(),
      deleteOauthExcludedEntry: vi.fn(),
      saveOauthExcludedModels: vi.fn(),
      refreshAntigravityQuota: vi.fn(),
      refreshCodexQuota: vi.fn()
    },
    usageApi: {
      getUsage: vi.fn().mockResolvedValue({ usage: {} }),
      getKeyStats: vi.fn().mockResolvedValue({ bySource: {}, byAuthIndex: {} })
    }
  };
});

describe('AuthFilesPage quota rendering', () => {
  beforeEach(() => {
    useAuthStore.setState({ connectionStatus: 'connected' } as any);
  });

  it('renders codex and antigravity quota sections when present', async () => {
    render(<AuthFilesPage />);

    expect(await screen.findByText('codex-1.json')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();

    expect(screen.getByText('antigravity-1.json')).toBeInTheDocument();
    expect(screen.getByText('gemini-3-pro-high')).toBeInTheDocument();
  });

  it('renders codex quota hint when absent', async () => {
    render(<AuthFilesPage />);

    expect(await screen.findByText('codex-2.json')).toBeInTheDocument();
    expect(screen.getAllByText('No quota data. Click refresh (uses a tiny probe request).').length).toBeGreaterThan(0);
  });
});
