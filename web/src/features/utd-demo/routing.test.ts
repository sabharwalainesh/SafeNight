import { describe, expect, it } from 'vitest';
import { fetchWalkingRoute, pointAlong, routeLength, stepText, straightRoute } from './routing';

const A = { lat: 32.9857, lng: -96.7497 };
const B = { lat: 32.9909, lng: -96.754 };

describe('UTD demo routing', () => {
  it('falls back to a labeled straight line when the routing service fails', async () => {
    const failing = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const r = await fetchWalkingRoute(A, B, failing);
    expect(r.source).toBe('straight');
    expect(r.coords).toEqual([A, B]);
    expect(r.distanceM).toBeGreaterThan(600);
    expect(r.distanceM).toBeLessThan(800);
    expect(r.steps[0]!.text).toMatch(/^Head northwest toward Maya/);
    expect(r.steps[r.steps.length - 1]!.text).toBe('Arrive at Maya');
  });

  it('parses an OSRM response into coordinates and steps, with a normal walking ETA', async () => {
    const body = {
      code: 'Ok',
      routes: [
        {
          distance: 700,
          duration: 9999,
          geometry: { coordinates: [[A.lng, A.lat], [-96.752, 32.988], [B.lng, B.lat]] },
          legs: [{ steps: [
            { distance: 300, name: 'Rutford Ave', maneuver: { type: 'depart' } },
            { distance: 400, name: 'Loop Rd', maneuver: { type: 'turn', modifier: 'left' } },
            { distance: 0, maneuver: { type: 'arrive' } },
          ] }],
        },
      ],
    };
    const ok = (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
    const r = await fetchWalkingRoute(A, B, ok);
    expect(r.source).toBe('osrm');
    expect(r.coords).toHaveLength(3);
    expect(r.coords[1]).toEqual({ lat: 32.988, lng: -96.752 });
    expect(r.distanceM).toBe(700);
    expect(Math.round(r.durationS)).toBe(Math.round(700 / 1.35));
    expect(r.steps.map((s) => s.text)).toEqual(['Start on Rutford Ave', 'Turn left onto Loop Rd', 'Arrive at Maya']);
  });

  it('pointAlong walks the polyline and clamps at the end', () => {
    const r = straightRoute(A, B);
    const total = routeLength(r.coords);
    expect(pointAlong(r.coords, 0)).toEqual(A);
    expect(pointAlong(r.coords, total * 2)).toEqual(B);
    const mid = pointAlong(r.coords, total / 2);
    expect(mid.lat).toBeCloseTo((A.lat + B.lat) / 2, 5);
    expect(mid.lng).toBeCloseTo((A.lng + B.lng) / 2, 5);
  });

  it('stepText covers the common maneuvers', () => {
    expect(stepText({ distance: 1, maneuver: { type: 'continue', modifier: 'straight' }, name: 'Drive A' })).toBe('Continue on Drive A');
    expect(stepText({ distance: 1, maneuver: { type: 'fork', modifier: 'slight right' } })).toBe('Turn slight right');
    expect(stepText({ distance: 1, maneuver: { type: 'roundabout' }, name: 'Circle' })).toBe('Take the roundabout onto Circle');
  });
});
