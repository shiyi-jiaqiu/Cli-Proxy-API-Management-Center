import { describe, expect, test } from 'vitest';
import { shouldShowOAuthCallbackInput } from './oauthCallbackSupport';

describe('shouldShowOAuthCallbackInput', () => {
  test('enables callback input for kiro when auth url exists', () => {
    expect(shouldShowOAuthCallbackInput('kiro', 'https://example.com')).toBe(true);
  });

  test('keeps callback input disabled when no auth url exists', () => {
    expect(shouldShowOAuthCallbackInput('kiro', undefined)).toBe(false);
  });
});

