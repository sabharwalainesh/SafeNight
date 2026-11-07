import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { DriverEndReason } from '../tables/nightout';
import { audit, deny, getSession, openDriverAssignment, requireActiveMember, sessionIsOpen } from '../lib/auth';

export const volunteerDriver = spacetimedb.reducer({ sessionId: t.u64() }, (ctx, { sessionId }) => {
  const session = getSession(ctx, sessionId);
  if (!sessionIsOpen(session)) throw new SenderError('Session is not active');
  requireActiveMember(ctx, sessionId);
  if (openDriverAssignment(ctx, sessionId)) {
    throw new SenderError('A driver is already assigned for this session');
  }
  ctx.db.driverAssignment.insert({
    id: 0n,
    sessionId,
    driverId: ctx.sender,
    volunteeredAt: ctx.timestamp,
    acceptedAt: undefined,
    endedAt: undefined,
    endReason: { tag: 'none' },
  });
  audit(ctx, 'volunteer_driver', `night_session:${sessionId}`);
});

export const acceptDriverRole = spacetimedb.reducer({ assignmentId: t.u64() }, (ctx, { assignmentId }) => {
  const a = ctx.db.driverAssignment.id.find(assignmentId);
  if (!a) throw new SenderError('Driver assignment not found');
  if (a.endedAt !== undefined) throw new SenderError('Driver assignment has ended');
  if (!a.driverId.isEqual(ctx.sender)) {
    deny(ctx, 'accept_driver_role', `driver_assignment:${assignmentId}`, 'Only the volunteer can accept the driver role');
  }
  if (a.acceptedAt !== undefined) return; // idempotent
  ctx.db.driverAssignment.id.update({ ...a, acceptedAt: ctx.timestamp });
  audit(ctx, 'accept_driver_role', `driver_assignment:${assignmentId}`);
});

export const endDriverRole = spacetimedb.reducer(
  { assignmentId: t.u64(), reason: DriverEndReason },
  (ctx, { assignmentId, reason }) => {
    const a = ctx.db.driverAssignment.id.find(assignmentId);
    if (!a) throw new SenderError('Driver assignment not found');
    if (a.endedAt !== undefined) throw new SenderError('Driver assignment has ended');
    if (reason.tag === 'none') throw new SenderError('Provide a reason for ending the driver role');
    const session = getSession(ctx, a.sessionId);
    const isDriver = a.driverId.isEqual(ctx.sender);
    const isOrganizer = session.organizer.isEqual(ctx.sender);
    if (!isDriver && !isOrganizer) {
      deny(ctx, 'end_driver_role', `driver_assignment:${assignmentId}`, 'Only the driver or organizer can end the driver role');
    }
    ctx.db.driverAssignment.id.update({ ...a, endedAt: ctx.timestamp, endReason: reason });
    audit(ctx, 'end_driver_role', `driver_assignment:${assignmentId}:${reason.tag}`);
  }
);
