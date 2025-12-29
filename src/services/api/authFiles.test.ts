import { describe, expect, it, vi } from 'vitest';

import { apiClient } from './client';
import { authFilesApi } from './authFiles';

describe('authFilesApi', () => {
  it('refreshAntigravityQuota posts to management endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true } as any);

    await authFilesApi.refreshAntigravityQuota('ag-1');

    expect(post).toHaveBeenCalledWith('/auth-files/antigravity-quota', { id: 'ag-1' });
  });

  it('refreshCodexQuota posts to management endpoint', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true } as any);

    await authFilesApi.refreshCodexQuota('codex-1', 'gpt-5.2');

    expect(post).toHaveBeenCalledWith('/auth-files/codex-quota', { id: 'codex-1', model: 'gpt-5.2' });
  });

  it('listSessionBindings gets sticky session bindings', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ bindings: [] } as any);

    await authFilesApi.listSessionBindings();

    expect(get).toHaveBeenCalledWith('/auth-files/session-bindings');
  });

  it('setDisabled puts to management endpoint', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({ ok: true } as any);

    await authFilesApi.setDisabled('auth-1', true);

    expect(put).toHaveBeenCalledWith('/auth-files/disabled', { id: 'auth-1', disabled: true });
  });
});
