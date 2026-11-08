// iOS dark appearance (system grouped backgrounds, separators, tints).
// Mirrors web/src/index.css tokens where they overlap.
export const C = {
  bg: '#000000',
  surface: '#1c1c1e', // secondarySystemGroupedBackground
  surface2: '#2c2c2e', // tertiary / filled controls
  fill: 'rgba(118,118,128,0.24)', // tertiarySystemFill: inputs, chips
  text: '#ffffff',
  muted: 'rgba(235,235,245,0.6)', // secondaryLabel
  faint: 'rgba(235,235,245,0.3)', // tertiaryLabel
  separator: 'rgba(84,84,88,0.65)',
  border: '#38383a',
  accent: '#0a84ff', // systemBlue
  onAccent: '#ffffff',
  ok: '#30d158',
  warn: '#ffd60a',
  danger: '#ff453a',
  sim: '#ff9f0a',
};
/** Grouped inset section radius. */
export const RADIUS = 14;
export const TAP = 44;
/** Continuous (squircle) corners, like UIKit. */
export const SMOOTH = { borderCurve: 'continuous' } as const;
