import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Config } from './config.js';
import { decide as realDecide, type DecideInput, type Proposal } from './decide.js';
import { buildDynamicVars, placeCall } from './elevenlabs.js';
import { sendText } from './photon.js';
import { isOpenish, validateAction } from './policy.js';
import type {
  Action, Decision, IncidentSnapshot, ProposedAction, Registration, Reply,
} from './types.js';
import { JOIN_RE, summaryIndicatesYes, type InboundText } from './webhooks.js';

interface IncidentRecord {
  snapshot: IncidentSnapshot;
  hash: string;
  firstSeenAt: number;
  decisions: Decision[];
}
interface State {
  registry: Record<string, Registration>;
  replies: Record<string, Reply>;
  incidents: Record<string, IncidentRecord>;
}

export interface EngineDeps {
  fetch?: typeof fetch;
  decide?: (i: DecideInput) => Promise<Proposal>;
  now?: () => number;
}

export const hashSnapshot = (s: IncidentSnapshot): string =>
  createHash('sha256').update(JSON.stringify(s)).digest('hex');

export class Engine {
  state: State = { registry: {}, replies: {}, incidents: {} };
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();
  private rerun = new Set<string>();
  private f: typeof fetch;
  private decideFn: (i: DecideInput) => Promise<Proposal>;
  private now: () => number;

  constructor(public config: Config, deps: EngineDeps = {}) {
    this.f = deps.fetch ?? fetch;
    this.decideFn = deps.decide ?? realDecide;
    this.now = deps.now ?? Date.now;
    this.load();
  }

  private load() {
    if (!this.config.stateFile) return;
    try {
      const s = JSON.parse(readFileSync(this.config.stateFile, 'utf8')) as State;
      this.state = { registry: s.registry ?? {}, replies: s.replies ?? {}, incidents: s.incidents ?? {} };
    } catch { /* fresh state */ }
  }
  private save() {
    if (!this.config.stateFile) return;
    try {
      mkdirSync(dirname(this.config.stateFile), { recursive: true });
      writeFileSync(this.config.stateFile, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.warn(`[state] save failed: ${(e as Error).message}`);
    }
  }

  phoneFor = (personaId: string): string | undefined =>
    this.state.registry[personaId]?.phone || this.config.personaPhones[personaId];
  optedIn = (personaId: string): boolean => !!this.state.registry[personaId];

  /** Returns 'unchanged' when the snapshot hash matches the last one seen. */
  sync(snap: IncidentSnapshot): 'queued' | 'unchanged' {
    const hash = hashSnapshot(snap);
    const rec = this.state.incidents[snap.id];
    if (rec && rec.hash === hash) return 'unchanged';
    this.state.incidents[snap.id] = {
      snapshot: snap,
      hash,
      firstSeenAt: rec?.firstSeenAt ?? this.now(),
      decisions: rec?.decisions ?? [],
    };
    this.save();
    clearTimeout(this.timers.get(snap.id));
    const t = setTimeout(() => {
      this.timers.delete(snap.id);
      void this.process(snap.id);
    }, this.config.debounceMs);
    t.unref?.();
    this.timers.set(snap.id, t);
    return 'queued';
  }

  /** Re-evaluate open incidents (time-based escalation). */
  tick() {
    for (const [id, r] of Object.entries(this.state.incidents)) {
      if (isOpenish(r.snapshot.status) && !this.timers.has(id)) void this.process(id);
    }
  }

  history(id: string): Action[] {
    return (this.state.incidents[id]?.decisions ?? []).flatMap((d) => d.actions);
  }

  async process(id: string): Promise<Decision | null> {
    if (this.running.has(id)) { this.rerun.add(id); return null; }
    this.running.add(id);
    try {
      const rec = this.state.incidents[id];
      if (!rec) return null;
      const inc = rec.snapshot;
      const now = this.now();
      const proposal = await this.decideFn({
        incident: inc, history: this.history(id), now, openedAt: this.openedAt(rec), config: this.config, fetch: this.f,
      });
      const decision: Decision = {
        id: randomUUID(), at: new Date(now).toISOString(), model: proposal.model,
        simulated: proposal.simulated, reasoning: proposal.reasoning, actions: [],
      };
      rec.decisions.push(decision);
      for (const p of proposal.proposed) {
        const action = await this.run(p, rec, decision.actions);
        decision.actions.push(action);
        this.save();
      }
      if (rec.decisions.length > 50) rec.decisions.splice(0, rec.decisions.length - 50);
      this.save();
      return decision;
    } finally {
      this.running.delete(id);
      if (this.rerun.delete(id)) void this.process(id);
    }
  }

  private openedAt(rec: IncidentRecord): number {
    const ts = rec.snapshot.events.map((e) => Date.parse(e.at)).filter(Number.isFinite);
    return Math.min(rec.firstSeenAt, ...(ts.length ? ts : [rec.firstSeenAt]));
  }

  private async run(p: ProposedAction, rec: IncidentRecord, pending: Action[]): Promise<Action> {
    const inc = rec.snapshot;
    const c = this.config;
    const now = this.now();
    const base: Action = {
      id: randomUUID(), type: p.type, target: p.personaId ?? (p.type === 'text_group' ? 'group' : 'demo-dispatch-line'),
      status: 'planned', detail: p.reason ?? '', simulated: p.type === 'dispatch_call', createdAt: now,
    };
    const verdict = validateAction(p, {
      incident: inc, now, demoDispatchNumber: c.demoDispatchNumber, blockedNumbers: c.blockedNumbers,
      phoneFor: this.phoneFor, optedIn: this.optedIn, history: [...this.history(inc.id), ...pending],
    });
    if (!verdict.ok) {
      console.warn(`[policy] blocked ${p.type}: ${verdict.reason}`);
      return { ...base, status: 'blocked', detail: verdict.reason };
    }
    base.target = verdict.target;

    if (p.type === 'text_group') {
      let sim = false; let fails = 0; let sent = 0;
      for (const part of inc.participants.filter((x) => this.optedIn(x.personaId))) {
        const reg = this.state.registry[part.personaId]!;
        const r = await sendText(c, this.f, { spaceId: reg.spaceId, senderId: reg.senderId, text: p.message!, idempotencyKey: `${base.id}:${part.personaId}` });
        sim ||= r.simulated; if (r.ok) sent++; else fails++;
      }
      return { ...base, simulated: sim, status: sent > 0 ? 'sent' : 'failed',
        detail: `${sim ? 'SIMULATED: ' : ''}Text to ${sent} friend(s)${fails ? `, ${fails} failed` : ''}: ${p.message}` };
    }

    const isDispatch = p.type === 'dispatch_call';
    const subjectOnly = inc.participants.find((x) => x.personaId === verdict.target);
    const vars = buildDynamicVars(
      inc, isDispatch ? 'dispatch_simulated' : 'buddy',
      isDispatch ? inc.subjectName : subjectOnly?.displayName ?? verdict.target,
      this.openedAt(rec), now, p.summary,
    );
    const r = await placeCall(c, this.f, { callType: isDispatch ? 'dispatch_simulated' : 'buddy', to: verdict.number!, vars });
    const action: Action = {
      ...base, simulated: isDispatch || r.simulated, conversationId: r.conversationId,
      status: r.ok ? 'in_progress' : 'failed',
      detail: `${isDispatch ? 'SIMULATED dispatch demo call. ' : ''}${r.detail}${p.reason ? ` (${p.reason})` : ''}`,
    };
    if (r.ok && r.simulated) this.finishSimulatedCall(action, isDispatch);
    return action;
  }

  private finishSimulatedCall(a: Action, dispatch: boolean) {
    const t = setTimeout(() => {
      a.status = 'completed';
      a.transcriptSummary = dispatch
        ? 'SIMULATED: demo dispatch agent delivered the situation summary; no real emergency service contacted.'
        : 'SIMULATED: call completed.';
      this.save();
    }, this.config.simDelayMs);
    t.unref?.();
  }

  private findByConversation(cid: string): Action | undefined {
    for (const r of Object.values(this.state.incidents)) {
      for (const d of r.decisions) for (const a of d.actions) if (a.conversationId === cid) return a;
    }
    return undefined;
  }

  handleElevenLabs(payload: any): { matched: boolean } {
    const data = payload?.data ?? {};
    const a = data.conversation_id ? this.findByConversation(String(data.conversation_id)) : undefined;
    if (!a) return { matched: false };
    if (payload.type === 'call_initiation_failure') {
      const reason = String(data.failure_reason ?? data.metadata?.body?.reason ?? 'unknown');
      a.status = /busy|no[-_ ]?answer|no_answer/i.test(reason) ? 'no_answer' : 'failed';
      a.detail = `Call did not connect: ${reason}`;
    } else if (payload.type === 'post_call_transcription') {
      const summary = String(data.analysis?.transcript_summary ?? '').slice(0, 600);
      const ok = data.analysis?.call_successful === 'success' || data.analysis?.call_successful === true;
      a.transcriptSummary = summary;
      if (a.type === 'dispatch_call') {
        a.status = ok || summary ? 'completed' : 'failed';
        a.detail = 'SIMULATED dispatch demo call finished';
      } else if (ok && summaryIndicatesYes(summary)) {
        a.status = 'completed';
        a.detail = `Buddy confirmed on call: ${summary}`;
      } else {
        a.status = ok ? 'completed' : 'no_answer';
        a.detail = summary ? `Call ended without confirmation: ${summary}` : 'Call ended without confirmation';
      }
    } else return { matched: true };
    this.save();
    return { matched: true };
  }

  async handleInbound(m: InboundText): Promise<string> {
    const join = JOIN_RE.exec(m.text.trim());
    if (join) {
      const personaId = join[1]!.toLowerCase();
      this.state.registry[personaId] = {
        personaId, spaceId: m.spaceId, senderId: m.senderId,
        phone: m.phone ?? this.config.personaPhones[personaId], registeredAt: new Date(this.now()).toISOString(),
      };
      this.save();
      await sendText(this.config, this.f, {
        spaceId: m.spaceId, senderId: m.senderId,
        text: `SafeNight: you're opted in as ${personaId}. You'll get alerts for your friend group. (Demo)`,
      });
      return `registered:${personaId}`;
    }
    const reg = Object.values(this.state.registry).find((r) => r.spaceId === m.spaceId && r.senderId === m.senderId)
      ?? Object.values(this.state.registry).find((r) => r.senderId === m.senderId);
    if (!reg) return 'ignored';
    this.state.replies[reg.personaId] = { personaId: reg.personaId, text: m.text.slice(0, 500), at: new Date(this.now()).toISOString() };
    this.save();
    return `reply:${reg.personaId}`;
  }

  view(id: string) {
    const rec = this.state.incidents[id];
    if (!rec) return null;
    const personas = rec.snapshot.participants.map((p) => p.personaId);
    const decisions = rec.decisions.map((d) => ({
      ...d,
      actions: d.actions.map((a) => {
        const who = a.type === 'call_person' ? [a.target] : a.type === 'text_group' ? personas : [];
        const rs = who.map((w) => this.state.replies[w]).filter((r): r is Reply => !!r && Date.parse(r.at) >= a.createdAt);
        rs.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
        return { ...a, latestReply: rs[0] ?? null };
      }),
    }));
    const dispatch = decisions.flatMap((d) => d.actions).find((a) => a.type === 'dispatch_call');
    return {
      decisions,
      dispatch: dispatch
        ? { status: dispatch.status, summary: dispatch.detail, transcriptSummary: dispatch.transcriptSummary ?? '', simulated: true as const }
        : null,
    };
  }
}
