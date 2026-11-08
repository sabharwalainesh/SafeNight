import { describe, expect, it } from 'vitest';
import { bearingDeg, distanceM, formatDistance, fusePoint, headingFromEvent, pairUncertaintyM, relativeBearing, smoothHeading, stepToward } from './geo';

const TS = { lat: 40.758, lng: -73.9855 }; // Times Square
const GC = { lat: 40.7527, lng: -73.9772 }; // Grand Central

describe('meetup geo', () => {
  it('measures Times Square → Grand Central at roughly 900 m', () => {
    const d = distanceM(TS, GC);
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(1000);
  });
  it('bearing north is 0, east is 90', () => {
    expect(Math.round(bearingDeg(TS, { lat: TS.lat + 0.001, lng: TS.lng }))).toBe(0);
    expect(Math.round(bearingDeg(TS, { lat: TS.lat, lng: TS.lng + 0.001 }))).toBe(90);
  });
  it('relative bearing subtracts heading and wraps', () => {
    expect(relativeBearing(90, 90)).toBe(0);
    expect(relativeBearing(10, 350)).toBe(20);
    expect(relativeBearing(350, 10)).toBe(340);
    expect(relativeBearing(45, null)).toBe(45);
  });
  it('formats distances for a dark party', () => {
    expect(formatDistance(4.4)).toBe('4 m');
    expect(formatDistance(47)).toBe('45 m');
    expect(formatDistance(1234)).toBe('1.2 km');
  });
  it('steps toward the target without overshooting', () => {
    const p = stepToward(TS, GC, 15);
    expect(distanceM(TS, p)).toBeCloseTo(15, 0);
    expect(stepToward(TS, GC, 5000)).toEqual(GC);
  });
  it('prefers webkitCompassHeading, falls back to alpha', () => {
    expect(headingFromEvent({ webkitCompassHeading: 30, alpha: 100 })).toBe(30);
    expect(headingFromEvent({ alpha: 90 })).toBe(270);
    expect(headingFromEvent({ alpha: null })).toBeNull();
  });
});

describe('fusion', () => {
  it('fusePoint damps a noisy fix but follows a real move', () => {
    const base = { lat: 32.991, lng: -96.7543, accuracyM: 4, at: 1 };
    const noisy = { lat: 32.99105, lng: -96.75435, accuracyM: 25, at: 2 }; // ~7 m away, poor accuracy
    const fused = fusePoint(base, noisy);
    expect(distanceM(base, fused)).toBeLessThan(1.5);
    const moved = { lat: 32.9915, lng: -96.7543, accuracyM: 5, at: 3 }; // ~55 m away, good accuracy
    expect(distanceM(fusePoint(fused, moved), moved)).toBeLessThan(0.01);
  });
  it('smoothHeading wraps around north', () => {
    expect(smoothHeading(350, 10, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(10, 350, 0.5)).toBeCloseTo(0, 5);
    expect(smoothHeading(null, 725)).toBe(5);
  });
  it('pairUncertaintyM combines in quadrature', () => {
    expect(pairUncertaintyM({ accuracyM: 3 }, { accuracyM: 4 })).toBe(5);
  });
});
