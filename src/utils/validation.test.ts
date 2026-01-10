import { describe, expect, it } from 'vitest';

import {
  isValidApiBase,
  isValidApiKey,
  isValidApiKeyCharset,
  isValidEmail,
  isValidJson,
  isValidUrl,
} from './validation';

describe('validation utils', () => {
  it('validates urls', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('validates api base', () => {
    expect(isValidApiBase('https://example.com')).toBe(true);
    expect(isValidApiBase('http://localhost:8317')).toBe(true);
    expect(isValidApiBase('')).toBe(false);
    expect(isValidApiBase('ftp://example.com')).toBe(false);
  });

  it('validates api key', () => {
    expect(isValidApiKey('sk-12345678')).toBe(true);
    expect(isValidApiKey('short')).toBe(false);
    expect(isValidApiKey('sk-123 456')).toBe(false);
  });

  it('validates api key charset', () => {
    expect(isValidApiKeyCharset('sk-12345678')).toBe(true);
    expect(isValidApiKeyCharset('含中文')).toBe(false);
  });

  it('validates json', () => {
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('{')).toBe(false);
  });

  it('validates email', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

