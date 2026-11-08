import sw from '../../public/sw.js?raw';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallHint, PersonaPicker } from '../features/install';
import { readChosenPersona } from '../personas';

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}
function setStandalone(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: on && q.includes('standalone'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  setUA('Mozilla/5.0 (Macintosh)');
  window.history.replaceState({}, '', '/');
});

describe('persona picker', () => {
  it('is needed when nothing is chosen, and picking stores and navigates', () => {
    expect(readChosenPersona()).toBeNull();
    const navigate = vi.fn();
    render(<PersonaPicker navigate={navigate} />);
    for (const n of ['Alex', 'Sam', 'Maya', 'Jordan']) expect(screen.getByText(n)).toBeTruthy();
    fireEvent.click(screen.getByText('Maya'));
    expect(localStorage.getItem('safenight.persona')).toBe('maya');
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('as=maya'));
    expect(readChosenPersona()?.id).toBe('maya');
  });

  it('keeps ?as= behaviour', () => {
    window.history.replaceState({}, '', '/?as=jordan');
    expect(readChosenPersona()?.id).toBe('jordan');
  });
});

describe('install hint', () => {
  it('shows on a mobile browser and remembers dismissal', () => {
    setUA(MOBILE_UA);
    setStandalone(false);
    const { unmount } = render(<InstallHint />);
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Install SafeNight')).toBeNull();
    unmount();
    render(<InstallHint />);
    expect(screen.queryByText('Install SafeNight')).toBeNull();
  });

  it('is hidden in standalone mode', () => {
    setUA(MOBILE_UA);
    setStandalone(true);
    render(<InstallHint />);
    expect(screen.queryByText('Install SafeNight')).toBeNull();
  });
});

describe('service worker', () => {
  it('skips cross-origin and non-GET and never handles websockets', () => {
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(sw).toContain("req.method !== 'GET'");
    expect(sw).not.toMatch(/WebSocket|wss?:/i);
  });
});
