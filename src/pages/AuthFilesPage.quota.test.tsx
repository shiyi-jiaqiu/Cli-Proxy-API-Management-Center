import { render, screen, within } from '@testing-library/react';
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
    apiCallApi: {
      request: vi.fn()
    },
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
            type: 'antigravity'
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
    getApiCallErrorMessage: vi.fn().mockReturnValue(''),
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

  it('renders codex quota section when present', async () => {
    render(<AuthFilesPage />);

    expect(await screen.findByText('codex-1.json')).toBeInTheDocument();

    const card = await screen.findByTestId('auth-card-codex-1');
    expect(within(card).getByText('Codex Quota')).toBeInTheDocument();
    expect(within(card).getByText('73%')).toBeInTheDocument();
    expect(within(card).getByText('50%')).toBeInTheDocument();

    const agCard = await screen.findByTestId('auth-card-ag-1');
    expect(within(agCard).getByText('antigravity-1.json')).toBeInTheDocument();
  });

  it('renders codex quota controls when absent', async () => {
    render(<AuthFilesPage />);

    expect(await screen.findByText('codex-2.json')).toBeInTheDocument();

    const card = await screen.findByTestId('auth-card-codex-2');
    expect(within(card).getAllByText('--').length).toBeGreaterThan(0);
  });
});
