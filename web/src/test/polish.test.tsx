import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { roleForPosition } from '../features/profile/api';
import { smsHref } from '../lib/contacts';
import { inviteCodeFromUrl, inviteUrl } from '../lib/invite';
import { formatPhone, formatPhoneInput, normalizePhone } from '../lib/phone';
import { MenuSelect } from '../ui';

describe('phone formatting', () => {
  it('formats US numbers as you type', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
    expect(formatPhone('555')).toBe('(555)');
  });
  it('keeps an explicit country code', () => {
    expect(formatPhone('+442071838750')).toBe('+44 20 7183 8750');
  });
  it('normalizes to E.164 and rejects partial numbers', () => {
    expect(normalizePhone('(415) 555-2671')).toBe('+14155552671');
    expect(normalizePhone('')).toBe('');
    expect(() => normalizePhone('555')).toThrow(/complete phone number/);
  });
  it('lets backspace delete through a formatting character', () => {
    const prev = formatPhone('5551234');
    expect(prev).toBe('(555) 123-4');
    // Deleting the "-" leaves the digits unchanged; the helper removes the last digit instead.
    expect(formatPhoneInput(prev, '(555) 1234')).toBe('(555) 123');
  });
});

describe('invites', () => {
  it('builds a clean invite URL without forwarding other params', () => {
    const url = inviteUrl('https://safenight.app/?persona=alex&token=x#frag', 'ABC123');
    expect(url).toBe('https://safenight.app/?join=ABC123');
    expect(inviteCodeFromUrl(url)).toBe('ABC123');
  });
  it('ignores malformed codes', () => {
    expect(inviteCodeFromUrl('https://x.test/?join=abc')).toBe('');
    expect(inviteCodeFromUrl('https://x.test/?join=<script>')).toBe('');
  });
  it('builds an sms link with an encoded body', () => {
    expect(smsHref('+1 (555) 123-4567', 'Join me & go')).toBe('sms:+15551234567?&body=Join%20me%20%26%20go');
  });
});

describe('contact roles follow order', () => {
  it('first is buddy, second backup, rest emergency', () => {
    expect([0, 1, 2, 5].map(roleForPosition)).toEqual(['buddy', 'backup_buddy', 'emergency', 'emergency']);
  });
});

describe('MenuSelect', () => {
  function Harness() {
    const [v, setV] = useState('b');
    return (
      <MenuSelect
        label="Pick"
        value={v}
        onChange={setV}
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
          { value: 'c', label: 'Gamma' },
        ]}
      />
    );
  }
  it('opens a listbox with the current option checked and selects with the keyboard', () => {
    render(<Harness />);
    const btn = screen.getByRole('button', { name: 'Pick: Beta' });
    fireEvent.click(btn);
    const list = screen.getByRole('listbox', { name: 'Pick' });
    expect(screen.getByRole('option', { name: /Beta/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pick: Gamma' })).toBeTruthy();
  });
  it('closes on Escape without changing the value', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick: Beta' }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pick: Beta' })).toBeTruthy();
  });
});
