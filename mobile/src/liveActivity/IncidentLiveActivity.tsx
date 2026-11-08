import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAgent, useSafety, type Incident } from '../web';
import * as Live from '../../modules/safenight-live-activity';
import type { LiveState } from '../../modules/safenight-live-activity';

const KIND_LABELS: Record<Incident['kind'], string> = {
  possible_impaired_driving: 'Possible impaired driving',
  help_requested: 'Help requested',
  missed_checkin: 'Missed check-in',
  feeling_unsafe: 'Feeling unsafe',
};

const CLOSED = new Set<Incident['status']>(['resolved', 'cancelled', 'handed_off']);
const DEBOUNCE_MS = 1000;
const END_DELAY_S = 8;

/** Maps the real incident status to a card step. "Home" only for status === 'resolved'. */
export function stepFor(status: Incident['status']): number {
  switch (status) {
    case 'open':
      return 0;
    case 'acknowledged':
    case 'assistance_underway':
      return 2;
    case 'transport_arranged':
      return 3;
    case 'awaiting_home_confirmation':
      return 4;
    case 'resolved':
      return 5;
    default:
      return 0;
  }
}

/**
 * Mirrors the caller's most recent open incident into an iOS Live Activity.
 * Renders nothing; a no-op wherever the native module is missing (Expo Go, web, tests).
 */
export function IncidentLiveActivity() {
  const safety = useSafety();
  const agent = useAgent();
  const activity = useRef<{ id: string; incidentId: string; last: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef(safety.actions);
  actionsRef.current = safety.actions;

  // Button taps on the card.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = Live.addIntentListener((action) => {
      const a = actionsRef.current;
      // 'check_in' has no navigation hook in this app, so it sends the same "okay" check-in.
      const run = action === 'need_help' ? a.checkIn('need_friend', '') : a.checkIn('okay', '');
      run.catch((e: unknown) => console.warn('[live-activity] action failed', e));
    });
    return () => sub.remove();
  }, []);

  // Compute the desired card for the current data.
  const tracked = activity.current?.incidentId;
  const open = safety.incidents.find((i) => !CLOSED.has(i.status) && (i.subject === safety.me || i.participants.some((p) => p.userId === safety.me)));
  const incident = open ?? (tracked ? safety.incidents.find((i) => i.id === tracked) : undefined);

  let state: LiveState | null = null;
  if (incident) {
    const step = stepFor(incident.status);
    const helper =
      incident.participants
        .filter((p) => p.userId !== incident.subject && p.acknowledgedAt != null)
        .sort((a, b) => (b.acknowledgedAt ?? 0) - (a.acknowledgedAt ?? 0))[0]?.displayName ??
      agent.notifications(incident.id).find((n) => n.acknowledgedAt != null)?.recipientName ??
      null;
    const plan = agent.ridePlan(incident.id);
    const option = plan?.options.find((o) => o.id === plan.chosenOption) ?? plan?.options.find((o) => o.etaMinutes != null);
    const eta = step >= 2 && step < 5 ? (option?.etaMinutes ?? null) : null;
    const simulated = agent.mocked || safety.mocked || agent.notifications(incident.id).some((n) => n.simulated) || (plan?.options.some((o) => o.simulated) ?? false);
    const statusLabel =
      step === 5
        ? `${incident.subjectName} is home ✓`
        : step === 4
          ? 'Picked up'
          : step === 3
            ? 'Ride booked'
            : step === 2
              ? helper
                ? `${helper} is on the way`
                : 'Help is on the way'
              : 'Concern reported';
    state = {
      kindLabel: KIND_LABELS[incident.kind] ?? 'Incident',
      statusLabel,
      subjectName: incident.subjectName,
      helperName: step === 2 ? helper : null,
      etaMinutes: eta,
      step,
      isSimulated: simulated,
      updatedAt: Date.now(),
    };
  }
  const closedStatus = incident && CLOSED.has(incident.status) ? incident.status : null;
  const stateKey = incident && state ? `${incident.id}|${incident.status}|${state.statusLabel}|${state.helperName}|${state.etaMinutes}|${state.isSimulated}` : '';
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (Platform.OS !== 'ios' || !Live.isAvailable || !safety.ready) return;
    if (timer.current) clearTimeout(timer.current);
    const incidentId = incident?.id;
    timer.current = setTimeout(() => {
      const s = stateRef.current;
      const cur = activity.current;
      if (!incidentId || !s) {
        if (cur) {
          void Live.end(cur.id, null, null);
          activity.current = null;
        }
        return;
      }
      if (cur && cur.incidentId !== incidentId) {
        void Live.end(cur.id, null, null);
        activity.current = null;
      }
      const now = activity.current;
      if (closedStatus === 'cancelled' || closedStatus === 'handed_off') {
        if (now) void Live.end(now.id, null, null);
        activity.current = null;
        return;
      }
      if (!now) {
        if (closedStatus || !Live.areActivitiesEnabled()) return;
        try {
          const id = Live.start({ incidentId }, s);
          if (id) activity.current = { id, incidentId, last: stateKey };
        } catch (e) {
          console.warn('[live-activity] start failed', e);
        }
        return;
      }
      if (now.last === stateKey) return;
      now.last = stateKey;
      if (closedStatus === 'resolved') {
        // Show "<subject> is home" for a few seconds, then dismiss.
        void Live.end(now.id, s, END_DELAY_S);
        activity.current = null;
        return;
      }
      void Live.update(now.id, s);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // stateKey captures every field that changes the card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, safety.ready]);

  // End on unmount (persona switch remounts the providers).
  useEffect(
    () => () => {
      const cur = activity.current;
      if (cur) void Live.end(cur.id, null, null);
    },
    [],
  );

  return null;
}
