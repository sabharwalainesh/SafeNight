import { useState } from 'react';
import { useSafety, type VisibleLocation } from '../../features/safety/api';
import { PERSONAS } from '../../personas';
import './map.css';

const CENTER = { lat: 30.2672, lng: -97.7431 };
const SIZE = 300;
const PAD = 40;

function colorOf(userId: string): string {
  return PERSONAS.find((p) => p.id === userId)?.accent ?? '#a3abbd';
}

function ago(ms: number): string {
  const m = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return m < 1 ? 'just now' : `${m}m ago`;
}

export function MapScreen() {
  const safety = useSafety();
  const [error, setError] = useState<string | null>(null);

  const post = async () => {
    setError(null);
    const j = () => (Math.random() * 2 - 1) * 0.004;
    try {
      await safety.actions.postLocation(CENTER.lat + j(), CENTER.lng + j(), 25, 'simulated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not post location');
    }
  };

  const points: VisibleLocation[] = [...(safety.myLocation ? [safety.myLocation] : []), ...safety.locations];
  const cLat = points.reduce((a, p) => a + p.lat, 0) / (points.length || 1);
  const cLng = points.reduce((a, p) => a + p.lng, 0) / (points.length || 1);
  const span = Math.max(0.0005, ...points.flatMap((p) => [Math.abs(p.lat - cLat), Math.abs(p.lng - cLng)]));
  const scale = (SIZE / 2 - PAD) / span;
  const pos = (p: VisibleLocation) => ({
    x: SIZE / 2 + (p.lng - cLng) * scale,
    y: SIZE / 2 - (p.lat - cLat) * scale,
  });
  const nameOf = (p: VisibleLocation) => (p.userId === safety.me ? `${p.displayName} (you)` : p.displayName);

  return (
    <section className="map-screen" aria-labelledby="map-title">
      <h1 id="map-title">Map</h1>
      <div className="map-badges">
        {safety.mocked && <span className="map-badge map-badge--mock">MOCK DATA</span>}
        <span className="map-badge map-badge--sim">SIMULATED LOCATIONS</span>
      </div>

      {!safety.sessionId ? (
        <p className="map-empty">You are not in a Night Out yet. Start or join one in the Night Out tab to see your group here.</p>
      ) : (
        <>
          <button type="button" className="map-post" onClick={post}>
            Post simulated location
          </button>
          {error && (
            <p className="map-error" role="alert">
              {error}
            </p>
          )}

          {points.length > 0 && (
            <svg className="map-plot" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Simulated plot of group locations">
              <rect x="0" y="0" width={SIZE} height={SIZE} rx="14" className="map-plot-bg" />
              {points.map((p) => {
                const { x, y } = pos(p);
                const isMe = p.userId === safety.me;
                return (
                  <g key={p.userId} opacity={p.isStale ? 0.4 : 1}>
                    <circle cx={x} cy={y} r={isMe ? 10 : 8} fill={colorOf(p.userId)} stroke="#fff" strokeWidth={isMe ? 3 : 0} />
                    <text x={x} y={y - 15} textAnchor="middle" className="map-label">
                      {nameOf(p)}
                    </text>
                    {p.isStale && (
                      <text x={x} y={y + 24} textAnchor="middle" className="map-label map-label--stale">
                        stale
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {safety.locations.length === 0 && (
            <p className="map-empty">
              Nobody is sharing their location with you yet. People appear here only after they turn on sharing and give you
              consent in the Night Out tab.
            </p>
          )}

          {points.length > 0 && (
            <ul className="map-list" aria-label="Locations">
              {points.map((p) => (
                <li key={p.userId} className="map-item">
                  <span className="map-dot" style={{ background: colorOf(p.userId) }} aria-hidden="true" />
                  <div className="map-item-body">
                    <strong>{nameOf(p)}</strong>
                    <span>
                      {p.approximate ? 'Approximate' : 'Precise'} · accuracy {Math.round(p.accuracyM)} m · updated {ago(p.recordedAt)}
                    </span>
                  </div>
                  {p.isStale && <span className="map-badge map-badge--stale">Stale</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
