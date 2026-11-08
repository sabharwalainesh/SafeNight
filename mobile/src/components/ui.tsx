import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { C, RADIUS, TAP } from '../theme';

export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function H2({ children }: { children?: ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function H3({ children }: { children?: ReactNode }) {
  return <Text style={s.h3}>{children}</Text>;
}
export function P({ children, muted, small, style }: { children?: ReactNode; muted?: boolean; small?: boolean; style?: object }) {
  return <Text style={[s.p, muted && s.muted, small && s.small, style]}>{children}</Text>;
}
export function Row({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.row, style]}>{children}</View>;
}

type Tone = 'default' | 'sim' | 'ok' | 'warn' | 'danger' | 'accent' | 'policy';
const TONE: Record<Tone, { bg: string; fg: string; border: string }> = {
  default: { bg: C.surface2, fg: C.text, border: C.border },
  sim: { bg: '#3a2d12', fg: C.sim, border: C.sim },
  ok: { bg: '#143425', fg: C.ok, border: C.ok },
  warn: { bg: '#3a2d12', fg: C.warn, border: C.warn },
  danger: { bg: '#3a1818', fg: C.danger, border: C.danger },
  accent: { bg: '#15283a', fg: C.accent, border: C.accent },
  policy: { bg: '#2a2140', fg: '#d59bff', border: '#d59bff' },
};
export function Badge({ children, tone = 'default' }: { children?: ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

type BtnProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};
export function Btn({ title, onPress, variant = 'primary', disabled, busy, small, accessibilityLabel, style }: BtnProps) {
  const off = disabled || busy;
  const bg = variant === 'primary' ? C.accent : variant === 'danger' ? C.danger : variant === 'ghost' ? 'transparent' : C.surface2;
  const fg = variant === 'primary' ? '#0b0d12' : variant === 'danger' ? '#fff' : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, borderColor: variant === 'ghost' ? C.border : bg, opacity: off ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, small && s.btnTextSmall, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

/** Checkbox-like toggle with an accessible checked state. */
export function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onChange}
      style={({ pressed }) => [s.toggle, { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      <View style={[s.box, checked && s.boxOn]}>{checked && <Text style={s.boxTick}>✓</Text>}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.p}>{label}</Text>
        {hint && <Text style={[s.p, s.muted, s.small]}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange, disabled }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(o.id)}
            style={[s.segItem, on && s.segOn]}
          >
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, children, hint }: { label: string; children?: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.p, s.small, { fontWeight: '600' }]}>{label}</Text>
      {children}
      {hint && <Text style={[s.p, s.muted, s.small]}>{hint}</Text>}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.muted} {...props} style={[s.input, props.style]} />;
}

export type Msg = { ok: boolean; text: string } | null;
export function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <View style={[s.feedback, { borderColor: msg.ok ? C.ok : C.danger }]} accessibilityRole="alert">
      <Text style={{ color: msg.ok ? C.ok : C.danger }}>{msg.text}</Text>
    </View>
  );
}

/** Two-step destructive confirmation. */
export function Confirm({ show, text, label, busy, onYes, onCancel }: { show: boolean; text: string; label: string; busy?: boolean; onYes: () => void; onCancel: () => void }) {
  if (!show) return null;
  return (
    <View style={s.confirm}>
      <Text style={s.p}>{text}</Text>
      <Row>
        <Btn title={label} variant="danger" busy={busy} onPress={onYes} />
        <Btn title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} />
      </Row>
    </View>
  );
}

/** Hold-to-confirm: press and keep holding for `holdMs`; releasing early cancels. */
export function HoldButton({ label, holdMs = 1500, disabled, onConfirm }: { label: string; holdMs?: number; disabled?: boolean; onConfirm: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setHolding(false);
    setElapsed(0);
  };
  const start = () => {
    if (disabled || timer.current) return;
    started.current = Date.now();
    setHolding(true);
    timer.current = setInterval(() => {
      const e = Date.now() - started.current;
      if (e >= holdMs) {
        stop();
        onConfirm();
      } else setElapsed(e);
    }, 50);
  };
  useEffect(() => stop, []);
  const pct = Math.min(100, (elapsed / holdMs) * 100);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Press and hold for ${(holdMs / 1000).toFixed(1)} seconds. Releasing early cancels.`}
      disabled={disabled}
      onPressIn={start}
      onPressOut={stop}
      style={[s.hold, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={[s.holdBar, { width: `${pct}%` }]} />
      <Text style={s.holdText}>{holding ? `Keep holding… ${((holdMs - elapsed) / 1000).toFixed(1)}s` : label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: RADIUS, padding: 14, gap: 10 },
  h2: { color: C.text, fontSize: 17, fontWeight: '700' },
  h3: { color: C.text, fontSize: 15, fontWeight: '700', marginTop: 4 },
  p: { color: C.text, fontSize: 16, lineHeight: 22 },
  muted: { color: C.muted },
  small: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  btn: { minHeight: TAP, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: 36, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { fontSize: 16, fontWeight: '700' },
  btnTextSmall: { fontSize: 14 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TAP, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.accent, borderColor: C.accent },
  boxTick: { color: '#0b0d12', fontWeight: '800' },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segOn: { backgroundColor: C.accent },
  segText: { color: C.text, fontWeight: '600', fontSize: 14 },
  segTextOn: { color: '#0b0d12' },
  input: { minHeight: TAP, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, color: C.text, backgroundColor: C.bg, fontSize: 16 },
  feedback: { borderWidth: 1, borderRadius: 10, padding: 10, backgroundColor: C.surface2 },
  confirm: { borderWidth: 1, borderColor: C.danger, borderRadius: 10, padding: 10, gap: 8, backgroundColor: '#2a1515' },
  hold: { minHeight: 52, borderRadius: 12, backgroundColor: '#3a1818', borderWidth: 2, borderColor: C.danger, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  holdBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.danger, opacity: 0.6 },
  holdText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
