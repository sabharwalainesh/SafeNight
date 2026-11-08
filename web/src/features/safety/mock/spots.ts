// MOCK until C2-A bindings: simulated Times Square (New Year's Eve) positions.
export const TIMES_SQUARE = { lat: 40.758, lng: -73.9855 };
export const BALL_DROP = { lat: 40.7564, lng: -73.9863, label: 'Ball drop · One Times Square' };

export const SPOTS: Record<string, { lat: number; lng: number; where: string }> = {
  alex: { lat: 40.7577, lng: -73.9856, where: 'Broadway & W 45th' },
  sam: { lat: 40.75905, lng: -73.98455, where: '7th Ave & W 47th, near the car' },
  maya: { lat: 40.7569, lng: -73.98665, where: 'W 44th & 7th' },
  jordan: { lat: 40.756, lng: -73.98735, where: 'W 42nd & 7th' },
};

export function jitter(v: number): number {
  return v + (Math.random() * 2 - 1) * 0.0003;
}
