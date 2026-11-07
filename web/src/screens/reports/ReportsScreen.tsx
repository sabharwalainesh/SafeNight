import { useContext, useState, type FormEvent } from 'react';
import { SafetyContext } from '../../features/safety/api';
import { useReports, type ReportCategory, type ReportConfidence, type SafetyResourceType } from '../../features/reports/api';
import './reports.css';

const MAX = 280;
const CATEGORY_LABEL: Record<ReportCategory, string> = {
  crowding: 'Overcrowding',
  blocked_exit: 'Blocked exit',
  aggressive_behavior: 'Aggressive behavior (general)',
  drink_tampering: 'Drink tampering concern',
  water_available: 'Free water available',
  medical_staff: 'Medical staff present',
  lighting: 'Poor lighting',
  unsafe_pickup: 'Unsafe pickup area',
  other: 'Other',
};
const CONFIDENCE_LABEL: Record<ReportConfidence, string> = {
  unverified: 'Unverified',
  corroborated: 'Corroborated',
  verified: 'Verified',
  disputed: 'Disputed',
};
const TYPE_LABEL: Record<SafetyResourceType, string> = {
  campus_safety: 'Campus safety',
  staffed_venue: 'Staffed venue',
  medical: 'Medical',
  transit_stop: 'Transit stop',
  pickup_point: 'Pickup point',
};

function ago(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}
function expiresIn(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 3600000))}h`;
}

const DEMO_COORD = { lat: 30.267, lng: -97.743 };
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const dateOf = (ms: number) => new Date(ms).toLocaleString();

export function ReportsScreen() {
  const { mocked, venues, reports, resources, actions } = useReports();
  const myLocation = useContext(SafetyContext)?.myLocation ?? null;
  const [newVenue, setNewVenue] = useState('');
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [voteBusy, setVoteBusy] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [venueId, setVenueId] = useState('');
  const [category, setCategory] = useState<ReportCategory>('crowding');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!venueId) return setError('Choose a venue.');
    if (text.length > MAX) return setError(`Keep it to ${MAX} characters.`);
    setBusy(true);
    try {
      await actions.submitReport(venueId, category, text);
      setText('');
      setNotice('Report submitted. It will be published after review.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  }

  async function addVenue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const name = newVenue.trim();
    if (!name) return setError('Enter a venue name.');
    const c = myLocation ?? DEMO_COORD;
    setBusy(true);
    try {
      const id = await actions.createVenue(name, round3(c.lat), round3(c.lng));
      setVenueId(id);
      setNewVenue('');
      setNotice('Venue added and selected.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add venue.');
    } finally {
      setBusy(false);
    }
  }

  async function vote(id: string, kind: 'corroborate' | 'dispute') {
    setVoteError(null);
    setVoteBusy(id);
    try {
      await actions.vote(id, kind);
      setVotedIds((p) => new Set(p).add(id));
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : 'Could not record vote.');
    } finally {
      setVoteBusy(null);
    }
  }

  return (
    <section className="reports-screen" aria-labelledby="reports-h">
      <header className="rs-head">
        <h2 id="reports-h">Reports</h2>
        {mocked && <span className="rs-chip rs-mock">MOCK</span>}
      </header>
      <p className="rs-intro">Venue-level observations. Never about a person. Reports expire.</p>

      <form className="rs-card" onSubmit={submit}>
        <h3>Report a venue</h3>
        <label>
          Venue
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Select a venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory)}>
            {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label>
          Details (optional)
          <textarea rows={3} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} aria-describedby="rs-warn rs-count" />
        </label>
        <div className="rs-row">
          <p id="rs-warn" className="rs-warn">Don't name or describe individuals.</p>
          <span id="rs-count" className="rs-count">{text.length}/{MAX}</span>
        </div>
        {error && <p role="alert" className="rs-error">{error}</p>}
        {notice && <p role="status" className="rs-ok">{notice}</p>}
        <button type="submit" className="rs-btn" disabled={busy}>{busy ? 'Submitting...' : 'Submit report'}</button>
      </form>

      <form className="rs-card" onSubmit={addVenue}>
        <h3>Add a venue</h3>
        <label>
          Venue name
          <input type="text" value={newVenue} maxLength={80} onChange={(e) => setNewVenue(e.target.value)} />
        </label>
        <p className="rs-muted">
          Placed near {myLocation ? 'your last shared location' : 'a demo location'}, rounded to about 100 m.
        </p>
        <button type="submit" className="rs-btn" disabled={busy}>Add venue</button>
      </form>

      <h3>Community reports</h3>
      {voteError && <p role="alert" className="rs-error">{voteError}</p>}
      {reports.length === 0 && <p className="rs-muted">No active reports.</p>}
      {venues.filter((v) => reports.some((r) => r.venueId === v.id)).map((v) => (
        <div className="rs-card" key={v.id}>
          <h4>{v.name} <span className="rs-chip rs-community">Community report</span></h4>
          <ul className="rs-list">
            {reports.filter((r) => r.venueId === v.id).map((r) => (
              <li key={r.id}>
                <strong>{CATEGORY_LABEL[r.category]}</strong>
                <div className="rs-chips">
                  <span className={`rs-chip rs-${r.confidence}`}>{CONFIDENCE_LABEL[r.confidence]}</span>
                  {r.moderation === 'pending' && <span className="rs-chip rs-pending">Pending review</span>}
                  {r.moderation === 'hidden' && <span className="rs-chip rs-pending">Hidden by moderators</span>}
                  <span className="rs-chip">{r.reportCount} {r.reportCount === 1 ? 'report' : 'reports'}</span>
                  <span className="rs-chip">{r.disputeCount} {r.disputeCount === 1 ? 'dispute' : 'disputes'}</span>
                </div>
                {r.textRedacted && <p>{r.textRedacted}</p>}
                <p className="rs-muted">reported {ago(now - r.createdAt)} ago · expires in {expiresIn(r.expiresAt - now)}{r.updatedAt > r.createdAt ? ` · updated ${ago(now - r.updatedAt)} ago` : ''}</p>
                {r.moderation === 'published' && (
                  <div className="rs-row">
                    <button type="button" className="rs-btn" disabled={voteBusy === r.id || votedIds.has(r.id)} onClick={() => vote(r.id, 'corroborate')}>Corroborate</button>
                    <button type="button" className="rs-btn" disabled={voteBusy === r.id || votedIds.has(r.id)} onClick={() => vote(r.id, 'dispute')}>Dispute</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3>Verified resources</h3>
      <ul className="rs-list rs-card">
        {resources.map((r) => (
          <li key={r.id}>
            <strong>{r.name}</strong>
            <div className="rs-chips"><span className="rs-chip rs-verified-res">Verified resource</span><span className="rs-chip">{TYPE_LABEL[r.type]}</span></div>
            <p>Hours: {r.hours}</p>
            {r.verifiedAt !== null && <p className="rs-muted">Verified {dateOf(r.verifiedAt)}</p>}
            <p className="rs-muted">Source: {r.source}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
