import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.fn();

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: postMock,
    postForm: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    patch: vi.fn()
  }
}));

describe('authFilesApi.refreshKiroQuota', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('posts to /auth-files/kiro-quota', async () => {
    const { authFilesApi } = await import('./authFiles');

    const fn = (authFilesApi as any).refreshKiroQuota;
    expect(typeof fn).toBe('function');

    postMock.mockResolvedValue({ auth: { kiro_usage: {} } });
    await fn('kiro-1');

    expect(postMock).toHaveBeenCalledWith('/auth-files/kiro-quota', { id: 'kiro-1' });
  });
});

