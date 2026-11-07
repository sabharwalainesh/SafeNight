import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../personas';

type RGB = [number, number, number];

// Vitest stubs CSS imports, so read the file with node's fs (node types are not in the web tsconfig).
// @ts-expect-error no node typings in the browser tsconfig
const { readFileSync } = (await import('node:fs')) as { readFileSync(p: string, enc: string): string };
const css = readFileSync('src/index.css' /* vitest runs with cwd = web/ */, 'utf8');

const root = /:root\s*{([^}]*)}/.exec(css)![1];
const vars: Record<string, string> = {};
for (const m of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2];

const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** color-mix(in srgb, fg p%, bg) */
const mix = (fg: RGB, bg: RGB, p: number): RGB => fg.map((c, i) => c * p + bg[i] * (1 - p)) as RGB;
const v = (name: string) => rgb(vars[name]);

describe('index.css variables are parsed', () => {
  it('has the expected tokens', () => {
    for (const k of ['bg', 'surface', 'surface-2', 'text', 'muted', 'accent', 'ok', 'warn', 'danger']) {
      expect(vars[k], k).toBeDefined();
    }
  });
});

type Pair = { name: string; fg: RGB; bg: RGB };
const pairs: Pair[] = [];

// Theme text colors on page surfaces.
for (const fgName of ['text', 'muted', 'accent', 'ok', 'warn', 'danger']) {
  for (const bgName of ['bg', 'surface', 'surface-2']) {
    pairs.push({ name: `--${fgName} on --${bgName}`, fg: v(fgName), bg: v(bgName) });
  }
}

// Persona accents override --accent in App.tsx; used as text and as button/chip fills.
for (const p of PERSONAS) {
  for (const bgName of ['bg', 'surface', 'surface-2']) {
    pairs.push({ name: `persona ${p.id} accent on --${bgName}`, fg: rgb(p.accent), bg: v(bgName) });
    pairs.push({ name: `dark label #0b0d12 on persona ${p.id} accent`, fg: rgb('#0b0d12'), bg: rgb(p.accent) });
  }
}

// Hard-coded dark label colors on saturated fills (buttons, chips, badges) in feature/screen CSS.
const darkOnFill: [string, string, string][] = [
  ['index.css .btn / demo-panel primary', '#0b0d12', 'accent'],
  ['agent-panel failed', '#000000', 'danger'],
  ['agent-panel acknowledged', '#000000', 'ok'],
  ['agent-panel primary', '#000000', 'accent'],
  ['session/profile .btn.danger', '#0b0d12', 'danger'],
  ['map SIM badge', '#111111', 'warn'],
  ['map post button', '#07121d', 'accent'],
  ['reports button', '#04121f', 'accent'],
];
for (const [name, fg, bgName] of darkOnFill) {
  pairs.push({ name: `${name}: ${fg} on --${bgName}`, fg: rgb(fg), bg: v(bgName) });
}

// Tinted backgrounds from color-mix().
const emergencyFill = mix(v('danger'), v('surface-2'), 0.18);
pairs.push(
  { name: 'text on status-nodrive (danger 22% over bg)', fg: v('text'), bg: mix(v('danger'), v('bg'), 0.22) },
  { name: 'text on status-emergency (danger 18% over surface-2)', fg: v('text'), bg: emergencyFill },
  { name: 'text on .result.ok (ok 18% over surface)', fg: v('text'), bg: mix(v('ok'), v('surface'), 0.18) },
  { name: 'text on .result.err (danger 18% over surface)', fg: v('text'), bg: mix(v('danger'), v('surface'), 0.18) },
  { name: 'text on selected emoji (accent 22% over surface)', fg: v('text'), bg: mix(v('accent'), v('surface'), 0.22) },
  { name: 'text on emergency hold bar (danger 55% over emergency fill)', fg: v('text'), bg: mix(v('danger'), emergencyFill, 0.55) },
);

// No large-text (3:1) exception is used: every pair is held to the normal-text 4.5:1 bar.
// Disabled controls (opacity 0.5-0.6) are exempt from WCAG 1.4.3 and not checked.
describe('WCAG contrast (normal text >= 4.5:1)', () => {
  it.each(pairs.map((p) => [p.name, p] as const))('%s', (_n, p) => {
    expect(ratio(p.fg, p.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
