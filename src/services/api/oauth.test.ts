import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();

vi.mock('./client', () => ({
  apiClient: {
    get: getMock,
    post: vi.fn(),
    postForm: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn()
  }
}));

describe('oauthApi.startAuth', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('passes webui and method params for kiro', async () => {
    const { oauthApi } = await import('./oauth');

    getMock.mockResolvedValue({ status: 'ok', state: 'kiro-123' });

    await oauthApi.startAuth('kiro' as any, { method: 'aws' } as any);

    expect(getMock).toHaveBeenCalledWith('/kiro-auth-url', {
      params: { is_webui: true, method: 'aws' }
    });
  });
});

describe('oauthApi.submitCallback', () => {
  it('includes the expected state when provided', async () => {
    const { oauthApi } = await import('./oauth');
    const { apiClient } = await import('./client');

    const postMock = vi.mocked(apiClient.post);
    postMock.mockResolvedValue({ status: 'ok' } as any);

    await oauthApi.submitCallback(
      'kiro' as any,
      'http://127.0.0.1:9098/oauth/callback?code=abc&state=external',
      'kiro-expected-state'
    );

    expect(postMock).toHaveBeenCalledWith('/oauth-callback', {
      provider: 'kiro',
      redirect_url: 'http://127.0.0.1:9098/oauth/callback?code=abc&state=external',
      state: 'kiro-expected-state'
    });
  });

  it('maps gemini-cli provider to gemini', async () => {
    const { oauthApi } = await import('./oauth');
    const { apiClient } = await import('./client');

    const postMock = vi.mocked(apiClient.post);
    postMock.mockResolvedValue({ status: 'ok' } as any);

    await oauthApi.submitCallback(
      'gemini-cli' as any,
      'http://127.0.0.1:11123/oauth/callback?code=abc&state=st1',
      'st1'
    );

    expect(postMock).toHaveBeenCalledWith('/oauth-callback', {
      provider: 'gemini',
      redirect_url: 'http://127.0.0.1:11123/oauth/callback?code=abc&state=st1',
      state: 'st1'
    });
  });
});
