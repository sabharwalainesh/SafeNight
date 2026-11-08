import { requireOptionalNativeModule } from 'expo-modules-core';

export type IntentAction = 'check_in' | 'im_good' | 'need_help';
export type LiveAttrs = { incidentId: string };
export type LiveState = {
  kindLabel: string;
  statusLabel: string;
  subjectName: string;
  helperName?: string | null;
  etaMinutes?: number | null;
  /** 0..5 */
  step: number;
  isSimulated: boolean;
  /** epoch ms */
  updatedAt: number;
};

type Native = {
  areActivitiesEnabled(): boolean;
  start(attrs: LiveAttrs, state: LiveState): string;
  update(id: string, state: LiveState): Promise<void>;
  end(id: string, finalState?: LiveState | null, dismissAfterSeconds?: number | null): Promise<void>;
  endAll(): Promise<void>;
  addListener(event: 'onIntent', cb: (e: { action: IntentAction }) => void): { remove(): void };
};

// null in Expo Go / web / tests: every call below becomes a no-op.
const native = requireOptionalNativeModule<Native>('SafeNightLiveActivity');

export const isAvailable = native != null;
export const areActivitiesEnabled = (): boolean => (native ? native.areActivitiesEnabled() : false);
export const start = (attrs: LiveAttrs, state: LiveState): string | null => (native ? native.start(attrs, state) : null);
export const update = async (id: string, state: LiveState): Promise<void> => void (await native?.update(id, state));
export const end = async (id: string, finalState?: LiveState | null, dismissAfterSeconds?: number | null): Promise<void> =>
  void (await native?.end(id, finalState ?? null, dismissAfterSeconds ?? null));
export const endAll = async (): Promise<void> => void (await native?.endAll());
export function addIntentListener(cb: (action: IntentAction) => void): { remove(): void } {
  if (!native) return { remove() {} };
  return native.addListener('onIntent', (e) => cb(e.action));
}
