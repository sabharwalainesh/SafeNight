import { describe, expect, it } from 'vitest';
import { inviteCodeFromUrl } from '../lib/inviteCode';
import { displayPhone, formatPhone, normalizePhone } from '../lib/phone';

describe('inviteCodeFromUrl', () => {
  it('reads app and web invite links', () => {
    expect(inviteCodeFromUrl('safenight://join?code=abc123')).toBe('ABC123');
    expect(inviteCodeFromUrl('https://safenight.app/?join=XYZ789')).toBe('XYZ789');
    expect(inviteCodeFromUrl('safenight://join/QWE456')).toBe('QWE456');
  });
  it('rejects anything else', () => {
    expect(inviteCodeFromUrl('safenight://join?code=ABC12')).toBe('');
    expect(inviteCodeFromUrl('safenight://join?code=ABC1234')).toBe('');
    expect(inviteCodeFromUrl('https://evil.example/?other=ABC123')).toBe('');
    expect(inviteCodeFromUrl(null)).toBe('');
  });
});

describe('phone', () => {
  it('formats US numbers as you type', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
    expect(formatPhone('555')).toBe('555');
  });
  it('normalizes to E.164', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(normalizePhone('')).toBe('');
    expect(() => normalizePhone('555')).toThrow(/complete phone number/);
  });
  it('displays stored numbers nationally', () => {
    expect(displayPhone('+15551234567')).toBe('(555) 123-4567');
  });
});

describe('phone backspace', () => {
  it('lets the user delete through the area code', () => {
    let v = '(555) 1';
    for (const next of ['(555) ', '(555)', '(555', '(55']) {
      v = formatPhone(next);
      expect(v.length).toBeLessThanOrEqual(next.length);
    }
    expect(formatPhone('(555')).toBe('555');
  });
});
