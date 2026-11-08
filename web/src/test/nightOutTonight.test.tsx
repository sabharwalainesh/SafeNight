import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NightOutMockProvider } from '../features/night-out/mock';
import { NightOutTab } from '../screens/night-out';

function setup() {
  return render(
    <NightOutMockProvider me="alex" displayName="Alex">
      <NightOutTab />
    </NightOutMockProvider>,
  );
}

describe('Tonight tab', () => {
  it('starts a New Year\'s Eve hangout in one tap', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a hangout' }));
    expect(await screen.findByRole('heading', { name: /New Year's Eve/ })).toBeTruthy();
    expect(screen.getByText(/Times Square, New York/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invite friends' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "I'll drive" })).toBeTruthy();
  });

  it('keeps privacy collapsed until opened and confirms leaving inline', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Start a hangout' }));
    const disc = await screen.findByRole('button', { name: /What I share/ });
    expect(disc.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(disc);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Approx' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'End hangout for everyone' }));
    expect(screen.getByRole('group', { name: /Confirm/ })).toBeTruthy();
  });
});
