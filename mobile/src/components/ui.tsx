import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { C, RADIUS, SMOOTH, TAP } from '../theme';

// ---------- haptics (no-op where the native module is missing) ----------
type HapticsMod = typeof import('expo-haptics');
let haptics: HapticsMod | null = null;
try {
  haptics = requireOptionalNativeModule('ExpoHaptics') ? (require('expo-haptics') as HapticsMod) : null;
} catch {
  haptics = null;
}
export function tap(kind: 'light' | 'medium' | 'select' | 'success' | 'warning' = 'light') {
  if (!haptics) return;
  try {
    if (kind === 'select') void haptics.selectionAsync();
    else if (kind === 'success') void haptics.notificationAsync(haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') void haptics.notificationAsync(haptics.NotificationFeedbackType.Warning);
    else void haptics.impactAsync(kind === 'medium' ? haptics.ImpactFeedbackStyle.Medium : haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* ignore */
  }
}

// ---------- native SwiftUI controls (only after the dev build includes @expo/ui) ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
let swift: { Host: any; Picker: any; Text: any; pickerStyle: (s: string) => unknown; tag: (t: string) => unknown } | null = null;
if (Platform.OS === 'ios') {
  try {
    if (requireOptionalNativeModule('ExpoUI')) {
      const ui = require('@expo/ui/swift-ui');
      const mods = require('@expo/ui/swift-ui/modifiers');
      swift = { Host: ui.Host, Picker: ui.Picker, Text: ui.Text, pickerStyle: mods.pickerStyle, tag: mods.tag };
    }
  } catch {
    swift = null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- press feedback ----------
/** Pressable that springs down slightly while pressed. */
export function Bouncy({ style, children, scaleTo = 0.97, onPressIn, onPressOut, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; children?: ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v === 1 ? 6 : 0 }).start();
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => <Animated.View style={[style, { transform: [{ scale }], opacity: pressed ? 0.85 : 1 }]}>{children}</Animated.View>}
    </Pressable>
  );
}

// ---------- layout ----------
/** Grouped inset section (iOS Settings style): rounded, filled, no border. */
export function Card({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

/** Section with an iOS-style small header above and optional footer below the grouped card. */
export function Section({ header, footer, children, flush }: { header?: string; footer?: ReactNode; children?: ReactNode; flush?: boolean }) {
  return (
    <View style={{ gap: 7 }}>
      {header ? <Text style={s.sectionHeader}>{header.toUpperCase()}</Text> : null}
      <View style={[s.card, flush && s.flush]}>{children}</View>
      {footer ? <Text style={s.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** Children of a flush Section separated by inset hairlines. */
export function Rows({ children, inset = 16 }: { children?: ReactNode; inset?: number }) {
  const items = Children.toArray(children).filter((c) => isValidElement(c));
  return (
    <>
      {items.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={[s.sep, { marginLeft: inset }]} />}
          {c}
        </Fragment>
      ))}
    </>
  );
}

/** One row of a flush Section. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  value,
  onPress,
  chevron,
  destructive,
  accent,
  accessibilityLabel,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accent?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <View style={s.listRow}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.p, destructive && { color: C.danger }, accent && { color: C.accent }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[s.p, s.muted, s.small]}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[s.p, s.muted]}>{value}</Text> : null}
      {right}
      {chevron ? <Text style={s.chevron}>›</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof title === 'string' ? title : undefined)}
      onPress={() => {
        tap('select');
        onPress();
      }}
      style={({ pressed }) => ({ backgroundColor: pressed ? C.surface2 : 'transparent' })}
    >
      {body}
    </Pressable>
  );
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
const TONE: Record<Tone, { bg: string; fg: string }> = {
  default: { bg: C.fill, fg: C.muted },
  sim: { bg: 'rgba(255,159,10,0.16)', fg: C.sim },
  ok: { bg: 'rgba(48,209,88,0.16)', fg: C.ok },
  warn: { bg: 'rgba(255,214,10,0.16)', fg: C.warn },
  danger: { bg: 'rgba(255,69,58,0.16)', fg: C.danger },
  accent: { bg: 'rgba(10,132,255,0.18)', fg: '#64aaff' },
  policy: { bg: 'rgba(191,90,242,0.18)', fg: '#da8fff' },
};
export function Badge({ children, tone = 'default' }: { children?: ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

// ---------- buttons ----------
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
  const bg =
    variant === 'primary' ? C.accent : variant === 'danger' ? 'rgba(255,69,58,0.16)' : variant === 'ghost' ? 'transparent' : 'rgba(10,132,255,0.16)';
  const fg = variant === 'primary' ? C.onAccent : variant === 'danger' ? C.danger : variant === 'ghost' ? C.accent : '#64aaff';
  return (
    <Bouncy
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        tap(variant === 'primary' || variant === 'danger' ? 'medium' : 'light');
        onPress?.();
      }}
      style={[s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: off ? 0.4 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, small && s.btnTextSmall, { color: fg }]}>{title}</Text>}
    </Bouncy>
  );
}

// ---------- controls ----------
/** iOS switch row. */
export function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean; hint?: string }) {
  return (
    <View style={[s.toggle, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.p}>{label}</Text>
        {hint ? <Text style={[s.p, s.muted, s.small]}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={checked}
        disabled={disabled}
        onValueChange={() => {
          tap('select');
          onChange();
        }}
        trackColor={{ true: C.ok, false: C.fill }}
        ios_backgroundColor={C.fill}
      />
    </View>
  );
}

/** Segmented control: native SwiftUI on iOS dev builds, styled fallback elsewhere. */
export function Segmented<T extends string>({ options, value, onChange, disabled }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; disabled?: boolean }) {
  if (swift && !disabled) {
    const { Host, Picker, Text: SText, pickerStyle, tag: tagOf } = swift;
    return (
      <Host matchContents={{ vertical: true }} colorScheme="dark" style={{ minHeight: 32 }}>
        <Picker selection={value} onSelectionChange={(v: T) => { tap('select'); onChange(v); }} modifiers={[pickerStyle('segmented')]}>
          {options.map((o) => (
            <SText key={o.id} modifiers={[tagOf(o.id)]}>{o.label}</SText>
          ))}
        </Picker>
      </Host>
    );
  }
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
            onPress={() => {
              tap('select');
              onChange(o.id);
            }}
            style={[s.segItem, on && s.segOn]}
          >
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * iOS pull-down menu for picking one value. Uses the native SwiftUI menu picker when the dev build
 * includes it, otherwise an action sheet. Renders as a settings row: label on the left, value + chevrons on the right.
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const current = options.find((o) => o.id === value)?.label ?? value;
  if (swift && !disabled) {
    const { Host, Picker, Text: SText, pickerStyle, tag: tagOf } = swift;
    return (
      <View style={s.selectRow}>
        <Text style={[s.p, { flex: 1 }]}>{label}</Text>
        <Host matchContents colorScheme="dark" alignment="trailing" seedColor={C.muted}>
          <Picker selection={value} onSelectionChange={(v: T) => { tap('select'); onChange(v); }} modifiers={[pickerStyle('menu')]}>
            {options.map((o) => (
              <SText key={o.id} modifiers={[tagOf(o.id)]}>{o.label}</SText>
            ))}
          </Picker>
        </Host>
      </View>
    );
  }
  const open = () => {
    tap('select');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: label, options: [...options.map((o) => (o.id === value ? `✓ ${o.label}` : o.label)), 'Cancel'], cancelButtonIndex: options.length, userInterfaceStyle: 'dark' },
        (i) => {
          if (i < options.length) onChange(options[i]!.id);
        },
      );
    } else {
      const i = options.findIndex((o) => o.id === value);
      onChange(options[(i + 1) % options.length]!.id);
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${current}`}
      accessibilityHint="Opens a menu"
      disabled={disabled}
      onPress={open}
      style={({ pressed }) => [s.selectRow, { opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      <Text style={[s.p, { flex: 1 }]}>{label}</Text>
      <Text style={[s.p, s.muted]}>{current}</Text>
      <Text style={s.updown}>⌃⌄</Text>
    </Pressable>
  );
}

export function Field({ label, children, hint }: { label: string; children?: ReactNode; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.p, s.small, s.muted, { fontWeight: '500' }]}>{label}</Text>
      {children}
      {hint ? <Text style={[s.p, s.muted, s.small]}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.faint} keyboardAppearance="dark" selectionColor={C.accent} {...props} style={[s.input, props.style]} />;
}

// ---------- people ----------
/** Circular avatar: photo if allowed, else emoji, else initial on a tinted circle. */
export function Avatar({ uri, emoji, name, size = 40, color }: { uri?: string | null; emoji?: string | null; name?: string; size?: number; color?: string }) {
  const r = size / 2;
  if (uri) {
    return <Image source={{ uri }} accessibilityLabel={name ? `${name}'s photo` : 'Profile photo'} style={{ width: size, height: size, borderRadius: r, backgroundColor: C.surface2 }} />;
  }
  return (
    <View
      accessibilityLabel={name}
      style={{ width: size, height: size, borderRadius: r, backgroundColor: color ?? C.surface2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: emoji ? size * 0.5 : size * 0.42, color: color ? '#000' : C.text, fontWeight: '600' }}>
        {emoji || (name ?? '?').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

// ---------- feedback ----------
export type Msg = { ok: boolean; text: string } | null;
export function Feedback({ msg }: { msg: Msg }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!msg) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    tap(msg.ok ? 'success' : 'warning');
  }, [msg, fade]);
  if (!msg) return null;
  return (
    <Animated.View
      style={[s.feedback, { opacity: fade, backgroundColor: msg.ok ? 'rgba(48,209,88,0.14)' : 'rgba(255,69,58,0.14)' }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={{ color: msg.ok ? C.ok : C.danger, fontSize: 15 }}>{msg.text}</Text>
    </Animated.View>
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
        <Btn title="Cancel" variant="ghost" disabled={busy} onPress={onCancel} />
      </Row>
    </View>
  );
}

/** Hold-to-confirm: press and keep holding for `holdMs`; releasing early cancels. */
export function HoldButton({ label, holdMs = 1500, disabled, onConfirm }: { label: string; holdMs?: number; disabled?: boolean; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const [left, setLeft] = useState(holdMs);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setHolding(false);
    setLeft(holdMs);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };
  const start = () => {
    if (disabled || timer.current) return;
    tap('medium');
    started.current = Date.now();
    setHolding(true);
    Animated.timing(progress, { toValue: 1, duration: holdMs, useNativeDriver: false }).start();
    timer.current = setInterval(() => {
      const e = Date.now() - started.current;
      if (e >= holdMs) {
        stop();
        tap('warning');
        onConfirm();
      } else setLeft(holdMs - e);
    }, 100);
  };
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
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
      <Animated.View style={[s.holdBar, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      <Text style={s.holdText}>{holding ? `Keep holding… ${(left / 1000).toFixed(1)}s` : label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: RADIUS, ...SMOOTH, padding: 16, gap: 12, overflow: 'hidden' },
  flush: { padding: 0, gap: 0 },
  sectionHeader: { color: C.muted, fontSize: 13, letterSpacing: 0.2, marginLeft: 16 },
  sectionFooter: { color: C.muted, fontSize: 13, lineHeight: 18, marginHorizontal: 16 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.separator },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP + 4, paddingHorizontal: 16, paddingVertical: 10 },
  chevron: { color: C.faint, fontSize: 24, fontWeight: '300', marginTop: -2 },
  h2: { color: C.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  h3: { color: C.text, fontSize: 15, fontWeight: '600', marginTop: 4 },
  p: { color: C.text, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  muted: { color: C.muted },
  small: { fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  btn: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, ...SMOOTH, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { minHeight: TAP, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  btnText: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  btnTextSmall: { fontSize: 15 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP, paddingVertical: 2 },
  seg: { flexDirection: 'row', backgroundColor: C.fill, borderRadius: 9, ...SMOOTH, padding: 2, gap: 2 },
  segItem: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...SMOOTH },
  segOn: { backgroundColor: '#636366' },
  segText: { color: C.text, fontWeight: '500', fontSize: 13 },
  segTextOn: { color: C.text, fontWeight: '600' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: TAP },
  updown: { color: C.muted, fontSize: 11, transform: [{ rotate: '0deg' }], width: 14, textAlign: 'center' },
  input: { minHeight: TAP + 2, borderRadius: 10, ...SMOOTH, paddingHorizontal: 14, color: C.text, backgroundColor: C.fill, fontSize: 17 },
  feedback: { borderRadius: 12, ...SMOOTH, paddingHorizontal: 14, paddingVertical: 10 },
  confirm: { borderRadius: 12, ...SMOOTH, padding: 14, gap: 10, backgroundColor: 'rgba(255,69,58,0.1)' },
  hold: { minHeight: 54, borderRadius: 14, ...SMOOTH, backgroundColor: 'rgba(255,69,58,0.16)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  holdBar: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: C.danger, opacity: 0.55 },
  holdText: { color: '#fff', fontWeight: '700', fontSize: 17 },
});
