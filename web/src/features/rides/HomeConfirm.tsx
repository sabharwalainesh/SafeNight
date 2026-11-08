import { useState } from 'react';
import { useAgent } from '../agent/api';
import { useSafety } from '../safety/api';
import './rides.css';

export default function HomeConfirm({ incidentId }: { incidentId: string }) {
  const { me, incidents } = useSafety();
  const { actions } = useAgent();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inc = incidents.find(i => i.id === incidentId);
  if (!inc) return null;
  const isSubject = inc.subject === me;

  if (inc.status === 'resolved') {
    return inc.resolvedBy === inc.subject ? <p className="home-confirm home-done">Confirmed home by {inc.subjectName}</p> : null;
  }
  if (!isSubject) {
    return inc.status === 'awaiting_home_confirmation' ? (
      <p className="home-confirm muted">
        Waiting for {inc.subjectName} to confirm they're home. Location or a ride ending is not confirmation.
      </p>
    ) : null;
  }
  if (!['transport_arranged', 'awaiting_home_confirmation', 'assistance_underway'].includes(inc.status)) return null;

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.confirmHome(incidentId);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="home-confirm">
      {!confirming ? (
        <button type="button" className="btn block big" onClick={() => setConfirming(true)}>
          I'm home safe
        </button>
      ) : (
        <>
          <p>Confirm you are home and safe? This closes the incident for everyone.</p>
          <div className="home-row">
            <button type="button" className="btn big" disabled={busy} onClick={go}>
              Yes, I'm home
            </button>
            <button type="button" className="btn plain" disabled={busy} onClick={() => setConfirming(false)}>
              Not yet
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="home-err">
          {error}
        </p>
      )}
    </div>
  );
}
