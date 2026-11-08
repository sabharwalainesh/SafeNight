import { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar, Badge, Btn, Card, Confirm, Feedback, H2, H3, ListRow, P, Row, Rows, Section, Segmented, Toggle, type Msg } from '../components/ui';
import { errText, relFuture } from '../lib/format';
import { inviteFromContacts, shareInvite } from '../lib/invite';
import { C } from '../theme';
import { useNightOut, useProfile, type ConsentGrant, type ConsentScope, type DriverEndReason, type Invite, type SharingScope } from '../web';

const SCOPES: { id: ConsentScope; label: string }[] = [
  { id: 'location_precise', label: 'Precise location' },
  { id: 'location_approximate', label: 'Approximate location' },
  { id: 'checkins', label: 'Check-ins' },
  { id: 'concern_reports', label: 'Concern reports' },
  { id: 'messaging', label: 'Messaging' },
];
const scopeLabel = (s: ConsentScope) => SCOPES.find((x) => x.id === s)?.label ?? s;
const SHARING: { id: SharingScope; label: string }[] = [
  { id: 'none', label: 'Not sharing' },
  { id: 'approximate', label: 'Approximate' },
  { id: 'precise', label: 'Precise' },
];
const sharingLabel = (s: SharingScope) => SHARING.find((x) => x.id === s)?.label ?? s;

export function SessionDetail({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const api = useNightOut();
  const { actions, me, myConsents } = api;
  const roster = api.roster(sessionId);
  const { photos } = useProfile();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState<Invite | null>(null);

  if (!roster) {
    return (
      <Card>
        <P>You are not in this session.</P>
        <Btn title="Back" variant="secondary" onPress={onBack} />
      </Card>
    );
  }
  const now = Date.now();
  const { session, members, drivers, invites } = roster;
  const active = members.filter((m) => m.leftAt === null);
  const departed = members.filter((m) => m.leftAt !== null);
  const meMember = active.find((m) => m.userId === me);
  const isOrganizer = meMember?.role === 'organizer';
  const openDriver = drivers.find((d) => d.endedAt === null) ?? null;
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.displayName ?? id.slice(0, 8);
  const others = active.filter((m) => m.userId !== me);
  const activeGrant = (g: ConsentGrant) => g.revokedAt === null && g.expiresAt > now;
  const myGrant = (recipient: string, scope: ConsentScope) => myConsents.find((g) => g.subject === me && g.recipient === recipient && g.sessionId === sessionId && g.scope === scope && activeGrant(g));
  const sharedWithMe = myConsents.filter((g) => g.recipient === me && g.sessionId === sessionId && activeGrant(g));
  const activeInvites = invites.filter((i) => i.revokedAt === null && i.expiresAt > now && i.uses < i.maxUses);
  const driverState = (userId: string) => (!openDriver || openDriver.driverId !== userId ? null : openDriver.acceptedAt === null ? 'Volunteered — awaiting acceptance' : 'Driver');

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setConfirm(null);
      after?.();
    } catch (e) {
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(false);
    }
  }
  const endDriver = (reason: DriverEndReason) => openDriver && void run(() => actions.endDriverRole(openDriver.id, reason));

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 6 }}>
        <Btn title="‹ Tonight" variant="ghost" small onPress={onBack} style={{ alignSelf: 'flex-start', paddingHorizontal: 4 }} />
        <Text accessibilityRole="header" style={{ color: C.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>{session.name}</Text>
        <P muted>{session.venueHint ? `${session.venueHint} · ` : ''}Ends {relFuture(session.expiresAt, now)}</P>
      </View>
      <Feedback msg={msg} />

      <Section header={`Group · ${active.length}`} flush footer={departed.length > 0 ? `Left: ${departed.map((m) => m.displayName).join(', ')}` : undefined}>
        <Rows inset={68}>
          {active.map((m) => {
            const ds = driverState(m.userId);
            return (
              <ListRow
                key={m.id}
                left={<Avatar uri={photos[m.userId]} name={m.displayName} size={40} />}
                title={`${m.displayName}${m.userId === me ? ' (you)' : ''}`}
                subtitle={[m.role === 'organizer' ? 'Organizer' : null, ds, `Location: ${sharingLabel(m.sharingScope)}`].filter(Boolean).join(' · ')}
              />
            );
          })}
        </Rows>
      </Section>

      {isOrganizer && (
        <Section header="Invite friends" footer="Invites expire after an hour and work up to 6 times. Joining shares nothing until each person chooses to.">
          <Row style={{ flexWrap: 'nowrap' }}>
            <Btn title="Share invite" style={{ flex: 1 }} disabled={busy} onPress={() => void run(async () => {
              const inv = newInvite && newInvite.revokedAt === null && newInvite.expiresAt > Date.now() ? newInvite : await actions.createInvite(sessionId, 60, 6);
              setNewInvite(inv);
              await shareInvite(session.name, inv.code);
            })} />
            <Btn title="From Contacts" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => void run(async () => {
              const inv = newInvite && newInvite.revokedAt === null && newInvite.expiresAt > Date.now() ? newInvite : await actions.createInvite(sessionId, 60, 6);
              setNewInvite(inv);
              const r = await inviteFromContacts(session.name, inv.code);
              if (r === 'sent') setMsg({ ok: true, text: 'Invite sent.' });
            })} />
          </Row>
          {newInvite && (
            <View style={{ alignItems: 'center', gap: 2 }}>
              <Text accessibilityLabel={`Invite code ${newInvite.code.split('').join(' ')}`} style={{ color: C.text, fontSize: 34, fontWeight: '700', letterSpacing: 8, fontFamily: 'Menlo' }}>{newInvite.code}</Text>
              <P muted small>Or read the code out · expires {relFuture(newInvite.expiresAt, now)}</P>
            </View>
          )}
          {activeInvites.length > 0 && (<>
            <H3>Active invites</H3>
            {activeInvites.map((i) => (
              <Row key={i.id} style={{ justifyContent: 'space-between' }}>
                <P style={{ fontFamily: 'Menlo' }}>{i.code} <Text style={{ color: C.muted, fontSize: 13 }}>{i.uses}/{i.maxUses} · {relFuture(i.expiresAt, now)}</Text></P>
                <Btn title="Revoke" small variant="danger" disabled={busy} onPress={() => void run(() => actions.revokeInvite(i.id))} />
              </Row>
            ))}
          </>)}
        </Section>
      )}

      <Section header="Driver">
        {!openDriver && (<>
          <P muted>No driver yet.</P>
          <Btn title="I can drive tonight" disabled={busy || !meMember} onPress={() => void run(() => actions.volunteerDriver(sessionId))} />
        </>)}
        {openDriver && <P>{nameOf(openDriver.driverId)}: {driverState(openDriver.driverId)}</P>}
        {openDriver && openDriver.driverId === me && openDriver.acceptedAt === null && (<>
          <P muted small>Volunteering does not make you the driver. Nobody is relying on you until you explicitly accept the role.</P>
          <Btn title="Accept driver role" disabled={busy} onPress={() => void run(() => actions.acceptDriverRole(openDriver.id))} />
        </>)}
        {openDriver && openDriver.driverId === me && openDriver.acceptedAt !== null && (<>
          <Btn title="I can no longer drive" variant="secondary" disabled={busy} onPress={() => setConfirm('driver-quit')} />
          <Confirm show={confirm === 'driver-quit'} busy={busy} text="Tell the group you can no longer drive?" label="Yes, I can't drive" onYes={() => endDriver('cannot_drive')} onCancel={() => setConfirm(null)} />
        </>)}
        {openDriver && isOrganizer && openDriver.driverId !== me && (<>
          <Btn title="Remove driver" variant="secondary" disabled={busy} onPress={() => setConfirm('driver-remove')} />
          <Confirm show={confirm === 'driver-remove'} busy={busy} text={`Remove ${nameOf(openDriver.driverId)} as driver?`} label="Remove driver" onYes={() => endDriver('replaced')} onCancel={() => setConfirm(null)} />
        </>)}
      </Section>

      <Section header="My location" footer="This is your ceiling. Each friend still needs your OK below. Nobody, including the organizer, can turn this on for you.">
        <Segmented options={SHARING} value={meMember?.sharingScope ?? 'none'} disabled={busy || !meMember} onChange={(v) => void run(() => actions.setSharingScope(sessionId, v))} />
      </Section>

      <Section header="Who can see what" footer="Each switch gives that person access for 5 hours. Turn it off to stop sharing.">
        {others.length === 0 && <P muted>No other members yet.</P>}
        {others.map((m) => (
          <View key={m.id} style={{ gap: 2 }}>
            <H3>Share with {m.displayName}</H3>
            {SCOPES.map((sc) => {
              const grant = myGrant(m.userId, sc.id);
              return <Toggle key={sc.id} label={sc.label} checked={!!grant} disabled={busy} onChange={() => void run(() => (grant ? actions.revokeConsent(grant.id) : actions.grantConsent(m.userId, sessionId, sc.id, 300)))} />;
            })}
          </View>
        ))}
        <H3>Shared with you</H3>
        {sharedWithMe.length === 0 ? <P muted small>Nobody is sharing with you yet.</P> : sharedWithMe.map((g) => (
          <P key={g.id} small>{nameOf(g.subject)}: {scopeLabel(g.scope)} <Text style={{ color: C.muted }}>· expires {relFuture(g.expiresAt, now)}</Text></P>
        ))}
      </Section>

      <Section header={isOrganizer ? 'End group' : 'Leave group'}>
        {isOrganizer ? (<>
          <Btn title="End session for everyone" variant="danger" disabled={busy} onPress={() => setConfirm('end')} />
          <Confirm show={confirm === 'end'} busy={busy} text="This ends the session for all members and stops all sharing." label="Yes, end it" onYes={() => void run(() => actions.endSession(sessionId), onBack)} onCancel={() => setConfirm(null)} />
        </>) : (<>
          <Btn title="Leave session" variant="danger" disabled={busy || !meMember} onPress={() => setConfirm('leave')} />
          <Confirm show={confirm === 'leave'} busy={busy} text="You will leave this session and stop sharing with it." label="Yes, leave" onYes={() => void run(() => actions.leaveSession(sessionId), onBack)} onCancel={() => setConfirm(null)} />
        </>)}
      </Section>
    </View>
  );
}
