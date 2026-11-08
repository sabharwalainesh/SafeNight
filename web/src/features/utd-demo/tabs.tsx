// The four demo tabs: Group (people, timeline, controls, showcase), Map (live map, route, compass,
// simulated walk), Messages (iMessage-style threads) and Help (the scripted Nemotron panel).
import { useEffect, useMemo, useRef, useState } from 'react';
import { bearingDeg, formatDistance, relativeBearing } from '../meetup/geo';
import { useHeading } from '../meetup/useDeviceSensors';
import { DemoMap, type MapPerson } from './DemoMap';
import { freshness } from './live';
import type { ThreadId } from './machine';
import { compassWord, formatEta } from './routing';
import { GROUP_NAME, MODEL, OPTIONS, PEOPLE, REASONING, RIDE_LINKS, personById, type OptionId } from './scenario';
import type { DemoCtx } from './UtdDemo';

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/* ------------------------------------------------------------- Live card */

/**
 * The in-app twin of the iOS Live Activity: always visible, one glance at tonight's status and
 * two taps that matter. (The real lock-screen widget lives in the native `mobile/` dev build.)
 */
export function LiveCard({ ctx }: { ctx: DemoCtx }) {
  const { s, now } = ctx;
  const mayaOpen = s.done.includes('alert') && s.phase !== 'resolved';
  const title = s.myHelpAt !== null ? 'Help is on the way to you' : s.phase === 'resolved' ? 'Everyone is home' : mayaOpen ? 'Maya needs help' : GROUP_NAME;
  const sub = s.myHelpAt !== null
    ? 'Jordan is coming · group alerted'
    : s.phase === 'resolved'
      ? 'Incident resolved by Maya'
      : mayaOpen
        ? s.phase === 'arrived' ? 'You are with Maya' : s.phase === 'responding' ? 'You are on the way' : 'Open Help for the plan'
        : s.myLastCheckin
          ? `Checked in ${freshness(s.myLastCheckin, now)}`
          : 'Next check-in due · tap I\'m okay';
  const tone = s.myHelpAt !== null || mayaOpen ? 'danger' : 'ok';
  return (
    <section className={`utd-live utd-live--${tone}`} aria-label="Tonight status">
      <span className={`utd-live-dot utd-live-dot--${tone}`} aria-hidden="true" />
      <div className="utd-live-body">
        <strong>{title}</strong>
        <span className="footnote">{sub}</span>
      </div>
      <div className="utd-live-actions">
        <button type="button" className="btn secondary small-btn" onClick={() => ctx.dispatch({ type: 'me_ok', now: Date.now() })}>I&apos;m okay</button>
        <button type="button" className="btn danger small-btn" disabled={s.myHelpAt !== null} onClick={() => ctx.dispatch({ type: 'me_help', now: Date.now() })}>
          {s.myHelpAt !== null ? 'Help sent' : 'Need help'}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Group */

export function GroupTab({ ctx }: { ctx: DemoCtx }) {
  const { s, people, now, me } = ctx;
  const status = (id: string): { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } => {
    if (id === 'maya') {
      if (s.phase === 'resolved') return { text: 'Home safe', tone: 'ok' };
      if (s.phase === 'arrived') return { text: 'With you', tone: 'ok' };
      if (s.done.includes('alert')) return { text: 'Needs help', tone: 'danger' };
      if (s.done.includes('maya_missed')) return { text: 'Missed check-in', tone: 'warn' };
      return { text: 'Sharing approx', tone: 'muted' };
    }
    if (id === 'jordan' && s.done.includes('jordan_ok')) return { text: s.done.includes('jordan_reply') ? 'Heading to Maya' : 'Okay ✓', tone: 'ok' };
    if (id === 'sam' && s.done.includes('sam_ok')) return { text: 'Okay ✓ · driver', tone: 'ok' };
    return { text: 'Sharing approx', tone: 'muted' };
  };

  return (
    <div className="utd-stack">
      <section className="card utd-card">
        <div className="utd-card-head">
          <div>
            <p className="headline">{GROUP_NAME}</p>
            <p className="footnote muted">UT Dallas · {PEOPLE.length + 1} people · {me.note}</p>
          </div>
          <span className={`sn-pill utd-tone-${s.phase === 'resolved' ? 'ok' : s.done.includes('alert') ? 'danger' : 'ok'}`}>
            {s.phase === 'resolved' ? 'Resolved' : s.done.includes('alert') ? 'Incident open' : 'All good'}
          </span>
        </div>
        <ul className="utd-people" aria-label="People in the group">
          <li className="utd-person">
            <span className="utd-avatar utd-avatar--me" aria-hidden="true">●</span>
            <span className="utd-person-body">
              <strong>You (Alex)</strong>
              <span className="footnote muted">Organizer · {me.source === 'gps' ? 'real GPS' : 'at the Plinth'}</span>
            </span>
            <span className="footnote muted">live</span>
          </li>
          {PEOPLE.map((p) => {
            const st = status(p.id);
            return (
              <li key={p.id} className="utd-person">
                <span className="utd-avatar" style={{ background: p.color }} aria-hidden="true">{p.emoji}</span>
                <span className="utd-person-body">
                  <strong>{p.name}</strong>
                  <span className="footnote muted">{p.role} · {p.spot}</span>
                </span>
                <span className={`footnote utd-tone-${st.tone}`}>{st.text} · {freshness(people[p.id].at, now)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card utd-card">
        <div className="utd-card-head">
          <p className="headline">Tonight&apos;s timeline</p>
          <div className="utd-controls">
            <button type="button" className="btn plain small-btn" onClick={() => ctx.setAutoplay(!ctx.autoplay)} aria-pressed={ctx.autoplay}>
              {ctx.autoplay ? 'Pause' : 'Auto-play'}
            </button>
            <button type="button" className="btn secondary small-btn" onClick={ctx.triggerNext}>Next event</button>
            <button type="button" className="btn plain small-btn" onClick={ctx.restart}>Restart</button>
          </div>
        </div>
        {s.feed.length === 0 ? (
          <p className="muted">Waiting for the first check-ins…</p>
        ) : (
          <ol className="utd-feed">
            {s.feed.map((f) => (
              <li key={f.id} className={`utd-feed-item utd-feed-${f.kind}`}>
                <time className="footnote muted">{clock(f.at)}</time>
                <span>
                  {f.text}
                  {f.simulated && <span className="sn-pill utd-tone-warn utd-inline-pill">SIMULATED</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {s.phase === 'resolved' && <SummaryCard ctx={ctx} />}

      <section className="utd-showcase" aria-label="Other SafeNight features">
        <ShowcaseCard emoji="🔗" title="Invite share" text="One link or code adds a friend to tonight's group. They pick what to share and for how long." />
        <ShowcaseCard emoji="🧭" title="Come to me" text="A friend taps once and gets a live map plus walking directions to you. Precise sharing ends on arrival." />
        <ShowcaseCard emoji="🚗" title="Driver concern" text="“May have been drinking” about the driver shows a do-not-drive banner on their phone instantly." />
        <ShowcaseCard emoji="📍" title="Venue reports" text="Anonymous, time-limited notes about venues and routes, shown to the group on the map." />
      </section>
    </div>
  );
}

function ShowcaseCard({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="card utd-show">
      <span className="utd-show-emoji" aria-hidden="true">{emoji}</span>
      <strong>{title}</strong>
      <p className="footnote muted">{text}</p>
    </div>
  );
}

function SummaryCard({ ctx }: { ctx: DemoCtx }) {
  const { s } = ctx;
  const helpers = ['You (Alex)', ...(s.accepted.includes('call_jordan') || s.done.includes('jordan_reply') ? ['Jordan'] : []), ...(s.accepted.includes('ride') ? ['Sam (ride offered)'] : [])];
  const mins = s.openedAt && s.resolvedAt ? Math.max(1, Math.round((s.resolvedAt - s.openedAt) / 60000)) : null;
  return (
    <section className="card utd-card utd-summary">
      <p className="headline">✓ Maya is home</p>
      <ul className="utd-summary-list">
        <li><strong>Who helped:</strong> {helpers.join(', ')}</li>
        <li><strong>What happened:</strong> missed check-in → Need help → Nemotron plan → a friend walked over → Maya closed it herself.</li>
        {mins !== null && <li><strong>Open for:</strong> {mins} min</li>}
        <li><strong>Privacy:</strong> precise location was shared only between Maya and the helper, and only until arrival.</li>
      </ul>
      <button type="button" className="btn block" onClick={ctx.restart}>Run it again</button>
    </section>
  );
}

/* ------------------------------------------------------------------- Map */

export function MapTab({ ctx }: { ctx: DemoCtx }) {
  const { s, people, me, distToMaya, route, routeState } = ctx;
  const alertOn = s.done.includes('alert') && s.phase !== 'resolved';
  const mapPeople: MapPerson[] = useMemo(
    () => [
      { id: 'me', name: 'You', emoji: '●', color: '#8cbfff', pos: me.pos, isMe: true, accuracyM: me.source === 'gps' ? me.accuracyM : 6 },
      ...PEOPLE.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, color: p.color, pos: people[p.id].pos, alert: p.id === 'maya' && alertOn })),
    ],
    [me.pos, me.source, me.accuracyM, people, alertOn],
  );
  const going = s.accepted.includes('go') && (s.phase === 'responding' || s.phase === 'options');
  const fitKey = `${routeState}-${s.phase}`;

  return (
    <div className="utd-stack">
      <div className="utd-seg" role="tablist" aria-label="Map or compass">
        <button type="button" role="tab" aria-selected={ctx.mapMode === 'map'} className={ctx.mapMode === 'map' ? 'active' : ''} onClick={() => ctx.setMapMode('map')}>Map</button>
        <button type="button" role="tab" aria-selected={ctx.mapMode === 'compass'} className={ctx.mapMode === 'compass' ? 'active' : ''} onClick={() => ctx.setMapMode('compass')}>Compass</button>
      </div>

      {ctx.mapMode === 'map' ? (
        <DemoMap people={mapPeople} route={route?.coords ?? null} fitKey={fitKey} />
      ) : (
        <CompassCard ctx={ctx} />
      )}

      <p className="footnote muted">{me.note}. Friends are simulated and drift live.</p>

      {alertOn && !s.accepted.includes('go') && (
        <section className="card utd-card utd-alertcard">
          <p className="headline">Maya needs help · {formatDistance(distToMaya)} from you</p>
          <p className="muted">Open Help to see what Nemotron suggests, or go straight to her.</p>
          <div className="utd-controls">
            <button type="button" className="btn block" onClick={() => ctx.dispatch({ type: 'accept', option: 'go', now: Date.now() })}>I&apos;ll go to Maya</button>
            <button type="button" className="btn plain small-btn" onClick={() => ctx.go('help')}>See options</button>
          </div>
        </section>
      )}

      {(going || s.phase === 'arrived') && (
        <section className="card utd-card">
          {s.phase === 'arrived' ? (
            <p className="headline">✓ You reached Maya</p>
          ) : (
            <>
              <div className="utd-card-head">
                <p className="headline">Walk to Maya</p>
                {route && <span className="sn-pill">{formatDistance(route.distanceM)} · {formatEta(route.durationS)}</span>}
              </div>
              {routeState !== 'ready' && <p className="muted">Finding a walking route…</p>}
              {route && (
                <>
                  <p className="footnote muted">
                    {route.source === 'osrm' ? 'Route from OpenStreetMap foot routing' : 'No route service reachable: straight-line estimate'} · {formatDistance(distToMaya)} left
                  </p>
                  <ol className="utd-steps">
                    {route.steps.map((st, i) => (
                      <li key={i}>
                        <span>{st.text}</span>
                        {st.distanceM > 0 && <span className="footnote muted">{formatDistance(st.distanceM)}</span>}
                      </li>
                    ))}
                  </ol>
                  <div className="utd-controls">
                    <button type="button" className="btn block" onClick={() => ctx.setWalking(!ctx.walk.active)} aria-pressed={ctx.walk.active}>
                      {ctx.walk.active ? 'Pause walking' : ctx.walk.meters > 0 ? 'Keep walking' : 'Simulate walking'}
                    </button>
                    <button type="button" className="btn plain small-btn" onClick={ctx.requestRoute}>Re-route from here</button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CompassCard({ ctx }: { ctx: DemoCtx }) {
  const { me, mayaPos, distToMaya, s } = ctx;
  const heading = useHeading(true);
  const bearing = bearingDeg(me.pos, mayaPos);
  const rel = relativeBearing(bearing, heading.heading);
  // Unwrap so the needle never spins the long way round.
  const rotRef = useRef(0);
  const prev = rotRef.current;
  const delta = ((rel - (((prev % 360) + 360) % 360) + 540) % 360) - 180;
  const rot = prev + (Number.isNaN(delta) ? 0 : delta);
  rotRef.current = rot;
  const near = distToMaya <= 15;
  return (
    <section className="card utd-card utd-compass">
      <p className="headline">{s.phase === 'arrived' || s.phase === 'resolved' ? 'You are with Maya' : `Maya is ${compassWord(bearing)} of you`}</p>
      <div className="utd-dial" aria-label={`Maya is ${formatDistance(distToMaya)} away, bearing ${Math.round(bearing)} degrees`}>
        <svg viewBox="0 0 100 100" className="utd-arrow" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
          <circle cx="50" cy="50" r="46" className="utd-ring" />
          {near ? <circle cx="50" cy="50" r="14" className="utd-here" /> : <path d="M50 10 L68 62 L50 52 L32 62 Z" className="utd-needle" />}
        </svg>
        <div className="utd-dist">{formatDistance(distToMaya)}</div>
      </div>
      <p className="footnote muted">
        {heading.heading !== null ? `Compass on · facing ${Math.round(heading.heading)}°` : 'Compass off: arrow points with north up.'}
      </p>
      {heading.heading === null && heading.supported && (
        <button type="button" className="btn secondary block" onClick={() => void heading.requestPermission()}>Enable compass</button>
      )}
      {ctx.route && s.phase === 'responding' && (
        <button type="button" className="btn block" onClick={() => ctx.setWalking(!ctx.walk.active)} aria-pressed={ctx.walk.active}>
          {ctx.walk.active ? 'Pause walking' : 'Simulate walking'}
        </button>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- Messages */

export function MessagesTab({ ctx }: { ctx: DemoCtx }) {
  const { s, dispatch } = ctx;
  const [thread, setThread] = useState<ThreadId>('group');
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = s.messages.filter((m) => m.thread === thread);
  useEffect(() => {
    dispatch({ type: 'read', thread });
  }, [thread, msgs.length, dispatch]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [msgs.length, thread]);
  const nameOf = (from: string) => (from === 'me' ? 'You' : from === 'agent' ? 'SafeNight' : (personById(from)?.name ?? from));
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    dispatch({ type: 'send', thread, text: draft, now: Date.now() });
    setDraft('');
  };
  return (
    <div className="utd-stack utd-messages">
      <div className="utd-seg" role="tablist" aria-label="Conversations">
        {(['group', 'maya'] as ThreadId[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={thread === t} className={thread === t ? 'active' : ''} onClick={() => setThread(t)}>
            {t === 'group' ? GROUP_NAME : 'Maya'}
            {s.unread[t] > 0 && thread !== t && <span className="utd-badge">{s.unread[t]}</span>}
          </button>
        ))}
      </div>
      <div className="utd-thread" role="log" aria-live="polite">
        {msgs.length === 0 && <p className="muted utd-empty">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`utd-bubble-row ${m.from === 'me' ? 'is-me' : ''}`}>
            {m.from !== 'me' && (
              <span className="utd-bubble-meta footnote muted">
                {nameOf(m.from)}
                {m.via && m.via !== nameOf(m.from) ? ` · ${m.via}` : ''} · {clock(m.at)}
              </span>
            )}
            <div className={`utd-bubble ${m.from === 'me' ? 'utd-bubble--me' : m.from === 'agent' ? 'utd-bubble--agent' : ''}`}>{m.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="utd-compose" onSubmit={send}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${thread === 'group' ? 'the group' : 'Maya'}`} aria-label="Message" maxLength={500} />
        <button type="submit" className="btn" disabled={!draft.trim()}>Send</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ Help */

export function HelpTab({ ctx }: { ctx: DemoCtx }) {
  const { s, typed, distToMaya, route } = ctx;
  if (s.phase === 'intro') {
    return (
      <div className="utd-stack">
        <section className="card utd-card">
          <p className="headline">No alerts right now</p>
          <p className="muted">Friends are checking in. When someone taps Need help, Nemotron proposes a plan here and the policy layer checks every option before you see it.</p>
          <button type="button" className="btn secondary block" onClick={ctx.triggerNext}>Skip ahead</button>
        </section>
      </div>
    );
  }
  const showReasoning = s.thinkAt !== null;
  const showOptions = ['options', 'responding', 'arrived', 'resolved'].includes(s.phase);
  const accept = (o: OptionId) => ctx.dispatch({ type: 'accept', option: o, now: Date.now() });
  const canAccept = ['options', 'responding', 'arrived'].includes(s.phase);
  return (
    <div className="utd-stack">
      <section className="card utd-card utd-alertcard">
        <div className="utd-card-head">
          <p className="headline">🚨 Maya needs help</p>
          <span className={`sn-pill utd-tone-${s.phase === 'resolved' ? 'ok' : 'danger'}`}>
            {s.phase === 'resolved' ? 'Resolved' : s.phase === 'arrived' ? 'Helper arrived' : s.phase === 'responding' ? 'Help on the way' : 'Open'}
          </span>
        </div>
        <p className="muted">Near the Residence Hall West lot · not answering · {formatDistance(distToMaya)} from you{s.openedAt ? ` · opened ${clock(s.openedAt)}` : ''}</p>
      </section>

      <section className="card utd-card utd-nemotron">
        <div className="utd-card-head">
          <p className="headline">SafeNight agent</p>
          <span className="sn-pill">Nemotron</span>
        </div>
        {!showReasoning && <p className="muted">Planning starts in a moment…</p>}
        {showReasoning && (
          <p className="utd-reasoning">
            {REASONING.slice(0, typed)}
            {typed < REASONING.length && <span className="utd-cursor" aria-hidden="true">▍</span>}
          </p>
        )}
        {showOptions && (
          <ol className="utd-options">
            {OPTIONS.map((o) => {
              const accepted = s.accepted.includes(o.id);
              return (
                <li key={o.id} className={`utd-option ${o.recommended ? 'is-rec' : ''} ${o.caution ? 'is-caution' : ''}`}>
                  <div className="utd-option-head">
                    <span className="utd-rank">{o.rank}</span>
                    <div className="utd-option-body">
                      <strong>
                        {o.title}
                        {o.id === 'go' && route && <span className="footnote muted"> · {formatDistance(route.distanceM)} walk</span>}
                      </strong>
                      <span className="footnote muted">{o.detail}</span>
                    </div>
                  </div>
                  <ul className="utd-checks" aria-label="Policy checks">
                    {o.checks.map((c) => (
                      <li key={c.label} className={c.ok ? 'ok' : 'no'}>{c.ok ? '✓' : '✕'} {c.label}</li>
                    ))}
                    <li className="muted">tool: {o.tool}</li>
                  </ul>
                  {o.caution && <p className="footnote utd-tone-warn">{o.caution}</p>}
                  {o.id === 'ride' && accepted && (
                    <div className="utd-controls">
                      {RIDE_LINKS.map((l) => (
                        <a key={l.label} className="btn secondary small-btn" href={l.url} target="_blank" rel="noopener noreferrer">Open {l.label}</a>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`btn ${o.recommended && !accepted ? '' : 'secondary'} block`}
                    disabled={accepted || !canAccept}
                    onClick={() => {
                      accept(o.id);
                      if (o.id === 'go') ctx.go('map', 'map');
                    }}
                  >
                    {accepted ? 'Accepted ✓' : o.id === 'dispatch' ? 'Accept (simulated)' : 'Accept'}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="footnote muted utd-foot">Scripted output for {MODEL}. In the live app the same plan comes from the model inside a SpacetimeDB scheduled procedure, and the policy layer runs server-side.</p>
      </section>

      {s.phase === 'resolved' && <SummaryCard ctx={ctx} />}
    </div>
  );
}
