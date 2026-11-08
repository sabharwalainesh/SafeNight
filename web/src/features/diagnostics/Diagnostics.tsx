import { useEffect, useState } from 'react';
import { SenderError } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import type { Persona } from '../../personas';
import { relativeTime, shortIdentity } from '../../lib/format';
import { Row, Section } from '../../ui';

/** "About & diagnostics": backend status, who is online, ping, server and database. */
export function Diagnostics({ persona, host, dbName }: { persona: Persona; host: string; dbName: string }) {
  const { isActive } = useSpacetimeDB();
  return (
    <div className="diagnostics" style={{ display: 'grid', gap: '1.25rem' }}>
      <RuntimeStrip />
      <OnlineCard />
      <PingCard persona={persona} connected={isActive} />
      <Section title="Connection">
        <Row label="Server" value={host} />
        <Row label="Database" value={dbName} />
      </Section>
    </div>
  );
}

function RuntimeStrip() {
  const [rows, ready] = useTable(tables.runtimeStatus);
  const status = rows[0];
  if (!ready || !status) {
    return (
      <div className="strip" aria-busy="true">
        <span className="badge">Loading backend status…</span>
      </div>
    );
  }
  const nemotronLive = status.nemotronMode === 'live';
  const messagingLive = status.messagingMode === 'live';
  return (
    <div className="strip" role="group" aria-label="Backend status">
      <span className={nemotronLive ? 'badge live' : 'badge sim'}>
        Nemotron: {status.nemotronMode} <span className="muted">({status.nemotronModel})</span>
      </span>
      <span className={messagingLive ? 'badge live' : 'badge sim'}>Messaging: {status.messagingMode}</span>
      <span className="badge">env: {status.appEnv}</span>
      <span className="badge muted">module {status.moduleVersion}</span>
    </div>
  );
}

function OnlineCard() {
  const [members, ready] = useTable(tables.onlineMembers);
  const now = useNow(15_000);
  return (
    <section className="card" aria-labelledby="online-heading">
      <h2 id="online-heading">
        Online now <span className="count">{ready ? members.length : '…'}</span>
      </h2>
      {!ready ? (
        <p className="muted">Subscribing…</p>
      ) : members.length === 0 ? (
        <p className="muted">Nobody connected.</p>
      ) : (
        <ul className="list">
          {members.map(m => (
            <li key={m.identity.toHexString()}>
              <code>{shortIdentity(m.identity)}</code>
              <span className="muted small">
                {m.connectionCount} conn · seen {relativeTime(m.lastSeenAt, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PingCard({ persona, connected }: { persona: Persona; connected: boolean }) {
  const ping = useReducer(reducers.ping);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const onPing = async () => {
    setBusy(true);
    setResult(null);
    try {
      await ping({ note: `ping from ${persona.id}` });
      setResult({ kind: 'ok', text: `Backend acknowledged ping from ${persona.name}.` });
    } catch (err) {
      const text =
        err instanceof SenderError
          ? `Rejected: ${err.message}`
          : `Failed: ${err instanceof Error ? err.message : String(err)}`;
      setResult({ kind: 'err', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="ping-heading">
      <h2 id="ping-heading">Backend check</h2>
      <p className="muted small">
        Calls the <code>ping</code> reducer, which writes an audit row.
      </p>
      <button type="button" className="btn secondary" onClick={onPing} disabled={!connected || busy}>
        {busy ? 'Pinging…' : 'Ping backend'}
      </button>
      {result && (
        <p className={result.kind === 'ok' ? 'result ok' : 'result err'} role="status">
          {result.kind === 'ok' ? '✓ ' : '✕ '}
          {result.text}
        </p>
      )}
    </section>
  );
}

/** Re-render on an interval so relative times stay fresh. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
