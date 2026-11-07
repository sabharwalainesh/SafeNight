import { useState } from 'react';
import { RIDE_STATUS_LABELS, useAgent, type RideStatus } from '../agent/api';
import './rides.css';

// Ride options can come from model output, so only render links to known
// ride providers over https (or their app schemes). Anything else is dropped.
const SAFE_LINK_HOSTS = ['m.uber.com', 'uber.com', 'www.uber.com', 'lyft.com', 'www.lyft.com', 'ride.lyft.com'];
// Transit directions from the backend are Google Maps links; allow that path only.
const SAFE_MAPS_HOST = 'www.google.com';
const SAFE_APP_SCHEMES = ['uber:', 'lyft:'];

function safeRideLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (SAFE_APP_SCHEMES.includes(u.protocol)) return u.href;
    if (u.protocol === 'https:' && SAFE_LINK_HOSTS.includes(u.hostname)) return u.href;
    if (u.protocol === 'https:' && u.hostname === SAFE_MAPS_HOST && u.pathname.startsWith('/maps/')) return u.href;
  } catch {
    // Not a parseable URL.
  }
  return null;
}

const STEPS: RideStatus[] = ['proposed', 'accepted', 'booked_by_user', 'pickup_confirmed', 'completed'];

function agoText(at: number): string {
  const m = Math.max(0, Math.round((Date.now() - at) / 60000));
  return m < 1 ? 'just now' : `${m}m ago`;
}

export default function RidePanel({ incidentId }: { incidentId: string }) {
  const { ridePlan, actions } = useAgent();
  const plan = ridePlan(incidentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!plan) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const idx = STEPS.indexOf(plan.status);
  const cancelled = plan.status === 'cancelled';

  return (
    <section className="rides-panel" aria-label="Ride options">
      <h3>Ride for {plan.riderName}</h3>
      {cancelled ? (
        <p>{RIDE_STATUS_LABELS.cancelled}</p>
      ) : (
        <ol className="rides-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < idx ? 'done' : undefined} aria-current={i === idx ? 'step' : undefined}>
              {RIDE_STATUS_LABELS[s]}
            </li>
          ))}
        </ol>
      )}

      {plan.status === 'proposed' || plan.status === 'accepted' ? (
        <ul className="rides-options">
          {plan.options.map(o => {
            const chosen = plan.chosenOption === o.id;
            return (
              <li key={o.id} className={chosen ? 'chosen' : undefined}>
                <div className="rides-row">
                  <strong>{o.label}</strong>
                  <span className="rides-meta">{o.kind.replace(/_/g, ' ')}</span>
                  {o.simulated && <span className="badge sim">SIMULATED</span>}
                  {chosen && <span className="rides-meta">Chosen</span>}
                </div>
                <div className="rides-meta">
                  {o.etaMinutes !== null ? `ETA ${o.etaMinutes} min · ` : ''}
                  {o.source}, fetched {agoText(o.fetchedAt)}
                </div>
                <div className="rides-row">
                  {safeRideLink(o.url) && (
                    <a className="btn" href={safeRideLink(o.url)!} target="_blank" rel="noopener noreferrer">Open in app</a>
                  )}
                  {plan.status === 'proposed' && (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => run(() => actions.acceptRideOption(plan.id, o.id))}
                    >
                      Choose this
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {plan.status === 'accepted' && (
        <div>
          <p>SafeNight never books or pays. Book it yourself, then confirm.</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => run(() => actions.confirmRideBooked(plan.id))}
          >
            I booked this
          </button>
        </div>
      )}
      {plan.status === 'booked_by_user' && (
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => actions.confirmPickup(plan.id))}>
          Confirm pickup
        </button>
      )}
      {error && (
        <p role="alert" className="rides-err">
          {error}
        </p>
      )}
    </section>
  );
}
