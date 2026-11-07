import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SenderError } from 'spacetimedb';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../../module_bindings';
import { snakeEnum } from '../../night-out/live/convert';
import { ReportsContext, type ReportsApi } from '../api';
import { mergeReports, toResource, toVenue } from './convert';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

function toError(e: unknown): Error {
  if (e instanceof SenderError) return new Error(e.message);
  if (e instanceof Error) return e;
  return new Error(String(e));
}
async function wrap<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw toError(e);
  }
}

export function ReportsLiveProvider(props: { children?: ReactNode }) {
  const [venueRows, venueReady] = useTable(tables.venue);
  const [pubRows, pubReady] = useTable(tables.publishedVenueReports);
  const [myRows, myReady] = useTable(tables.myVenueReports);
  const [resRows, resReady] = useTable(tables.safetyResource);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const rCreate = useReducer(reducers.createVenue);
  const rSubmit = useReducer(reducers.submitVenueReport);
  const rVote = useReducer(reducers.voteVenueReport);

  const venuesRef = useRef<Row[]>([]);
  venuesRef.current = venueRows as Row[];

  const actions = useMemo<ReportsApi['actions']>(
    () => ({
      submitReport: (venueId, category, text) =>
        wrap(() => rSubmit({ venueId: BigInt(venueId), category: snakeEnum(category) as any, text })),
      vote: (reportId, kind) => wrap(() => rVote({ reportId: BigInt(reportId), kind: snakeEnum(kind) as any })),
      createVenue: (name, approxLat, approxLng) =>
        wrap(async () => {
          const before = new Set(venuesRef.current.map((v) => String(v.id)));
          await rCreate({ name, approxLat, approxLng });
          const deadline = Date.now() + 3000;
          for (;;) {
            const found = venuesRef.current.find((v) => !before.has(String(v.id)) && v.name === name);
            if (found) return String(found.id);
            if (Date.now() > deadline) throw new Error('Venue was created but has not appeared yet. Try again in a moment.');
            await new Promise((r) => setTimeout(r, 100));
          }
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const api: ReportsApi = {
    ready: venueReady && pubReady && myReady && resReady,
    mocked: false,
    venues: (venueRows as Row[]).map(toVenue),
    reports: mergeReports(pubRows as Row[], myRows as Row[], now),
    resources: (resRows as Row[]).map(toResource),
    actions,
  };
  return createElement(ReportsContext.Provider, { value: api }, props.children);
}
