import { useContext, useEffect, useState } from 'react';
import { NightOutContext } from '../night-out/api';
import { SafetyContext } from '../safety/api';
import { bridgeUrl, fetchPlan, syncIncident } from './client';
import { PersonaMapContext } from './PersonaMap';
import { buildSnapshot } from './snapshot';
import type { Decision, Dispatch } from './types';

export type Coordination = {
  enabled: boolean;
  decisions: Decision[];
  dispatch: Dispatch | null;
  error: string | null;
  lastSyncAt: number | null;
};

export const SYNC_DEBOUNCE_MS = 1000;
export const POLL_MS = 3000;

export function useCoordination(incidentId: string): Coordination {
  const base = bridgeUrl();
  const safety = useContext(SafetyContext);
  const nightOut = useContext(NightOutContext);
  const personaOf = useContext(PersonaMapContext);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);

  const incident = safety?.incidents.find(i => i.id === incidentId) ?? null;
  const events = safety && incident ? safety.timeline(incidentId) : null;
  const roster = incident && nightOut ? nightOut.roster(incident.sessionId) : null;
  const json = (() => {
    if (!base || !safety || !incident || !events) return null;
    return JSON.stringify(
      buildSnapshot({
        incident,
        timeline: events,
        roster,
        locations: safety.locations,
        myLocation: safety.myLocation,
        myCheckins: safety.myCheckins,
        me: safety.me,
        personaOf,
      }),
    );
  })();

  useEffect(() => {
    if (!base || !json) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      syncIncident(base, JSON.parse(json), ac.signal)
        .then(() => {
          setLastSyncAt(Date.now());
          setError(null);
        })
        .catch(e => {
          if (!ac.signal.aborted) setError(e instanceof Error ? e.message : 'Bridge sync failed');
        });
    }, SYNC_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [base, json]);

  useEffect(() => {
    if (!base) return;
    const ac = new AbortController();
    const poll = () =>
      fetchPlan(base, incidentId, ac.signal)
        .then(p => {
          setDecisions(p.decisions);
          setDispatch(p.dispatch);
          setError(null);
        })
        .catch(e => {
          if (!ac.signal.aborted) setError(e instanceof Error ? e.message : 'Bridge unavailable');
        });
    void poll();
    const iv = setInterval(() => void poll(), POLL_MS);
    return () => {
      clearInterval(iv);
      ac.abort();
    };
  }, [base, incidentId]);

  if (!base) return { enabled: false, decisions: [], dispatch: null, error: null, lastSyncAt: null };
  return { enabled: true, decisions, dispatch, error, lastSyncAt };
}
