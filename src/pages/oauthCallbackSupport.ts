import type { OAuthProvider } from '@/services/api/oauth';

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli', 'kiro'];

export function shouldShowOAuthCallbackInput(provider: OAuthProvider, authUrl?: string): boolean {
  return CALLBACK_SUPPORTED.includes(provider) && Boolean(authUrl);
}

