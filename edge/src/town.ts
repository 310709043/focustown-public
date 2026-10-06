/**
 * LowBatteryTown session logic: waiting room, pairing, chat relay, mutual
 * extension, leaving, reports and the periodic sweep. A port of
 * backend/app/domain/services/lbt_service.py; frames are identical so the
 * frontend's liveTransport works unchanged.
 */
import {
  InputError,
  MESSAGE_MAX,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  type OpenHours,
  cleanText,
  isOpen,
  maskContacts,
  parseProfile,
  pickPartner,
  type Waiting,
} from "./rules";
import type { Conversation, Line, TownStore } from "./store";
import { COMPANION_ID, COMPANION_PROFILE, companionProfile, publicProfile, INVITE_MS, type CompanionInvite } from "./companion";

export interface TownConfig {
  sessionMs: number;
  graceMs: number;
  relaxAfterMs: number;
  offlineAfterMs: number;
  blockMs: number;
  openHours: OpenHours | null;
  timeZone: string;
  hoursLabel: string;
}

export const DEFAULT_CONFIG: TownConfig = {
  sessionMs: 420_000,
  graceMs: 60_000,
  relaxAfterMs: 30_000,
  offlineAfterMs: 45_000,
  blockMs: 24 * 3600_000,
  openHours: null,
  timeZone: "Asia/Taipei",
  hoursLabel: "",
};

export type Frame = Record<string, unknown> & { type: string };

export interface ReportRecord {
  id: string;
  conversationId: string;
  reporterGuestId: string;
  reportedGuestId: string;
  reason: string;
  note: string | null;
  transcript: { from: "reporter" | "reported"; text: string; at: string }[];
  reporterProfile: Record<string, unknown>;
  reportedProfile: Record<string, unknown>;
  status: "open";
  createdAt: string;
}

export interface TownDeps {
  store: TownStore;
  send: (guestId: string, frame: Frame) => void;
  now: () => number;
  newId: () => string;
  saveReport?: (record: ReportRecord) => Promise<void>;
  config: TownConfig;
  suspendedUntil?: (guestId: string) => number | null;
  /** Bump the daily usage trend when a conversation starts (admin-only metric). */
  onConversationStarted?: (now: number) => Promise<void>;
}

const iso = (ms: number) => new Date(ms).toISOString();

export class Town {
  private readonly store: TownStore;
  private readonly cfg: TownConfig;

  constructor(private readonly deps: TownDeps) {
    this.store = deps.store;
    this.cfg = deps.config;
  }

  // ── read side ──────────────────────────────────────────────────────

  async status() {
    const now = this.deps.now();
    return {
      online: await this.store.countOnline(now - this.cfg.offlineAfterMs),
      waiting: (await this.store.listWaiting()).length,
      open: await this.openNow(now),
      hours: this.cfg.hoursLabel,
    };
  }

  /** Open to new matching: within opening hours AND not in an admin
   *  maintenance pause. Every entry point and the pairing pass gate on this. */
  private async openNow(now: number): Promise<boolean> {
    return isOpen(now, this.cfg.openHours, this.cfg.timeZone) && !(await this.store.maintenance());
  }

  // ── connection lifecycle ───────────────────────────────────────────

  /** Mark online and replay current state to a (re)connecting socket. */
  async connect(guestId: string) {
    const now = this.deps.now();
    await this.store.touchOnline(guestId, now);
    if (this.suspended(guestId)) {
      await this.restrict(guestId);
      this.deps.send(guestId, { type: "lbt.error", code: "guest_suspended" });
      return;
    }
    const c = await this.current(guestId);
    if (c) {
      this.deps.send(guestId, this.matchedFrame(c, guestId, now));
      for (const line of await this.store.transcript(c.id)) {
        this.deps.send(guestId, messageFrame(line, guestId));
      }
      for (const voter of (await this.store.extendVotes(c.id)).sort()) {
        this.deps.send(guestId, { type: "lbt.extend_requested", by: voter === guestId ? "me" : "partner" });
      }
      return;
    }
    const waiting = (await this.store.listWaiting()).find((w) => w.guestId === guestId);
    if (waiting) {
      this.deps.send(guestId, { type: "lbt.waiting", since: iso(waiting.joinedAt) });
      const invite = await this.store.companionInvite();
      if (invite?.guestId === guestId && invite.expiresAt > now) this.sendCompanionInvite(invite);
      return;
    }
    if (guestId === COMPANION_ID) {
      const invite = await this.store.companionInvite();
      if (invite && invite.expiresAt > now) {
        const target = (await this.store.listWaiting()).find((w) => w.guestId === invite.guestId);
        if (target) {
          this.deps.send(guestId, { type: "lbt.companion_pending", id: invite.id, profile: target.profile, nickname: publicProfile(invite.profile ?? COMPANION_PROFILE).nickname });
          return;
        }
      }
    }
    // Neither chatting nor waiting: a client that missed lbt.ended reconciles.
    this.deps.send(guestId, { type: "lbt.idle" });
  }

  async heartbeat(guestId: string) {
    await this.store.touchOnline(guestId, this.deps.now());
  }

  /** The guest's last socket closed. Leave the queue now; an open chat ends
   *  in the sweep only if they don't come back within offlineAfter. */
  async disconnect(guestId: string) {
    await this.cancelCompanionFor(guestId, "disconnected");
    await this.store.dequeue(guestId);
    await this.store.touchOnline(guestId, this.deps.now());
  }

  // ── waiting room & pairing ─────────────────────────────────────────

  async join(guestId: string, rawProfile: unknown, adult: boolean) {
    if (guestId === COMPANION_ID) throw new InputError("admin_cannot_queue");
    this.requireAllowed(guestId);
    if (adult !== true) throw new InputError("age_required");
    const now = this.deps.now();
    if (!(await this.openNow(now))) throw new InputError("closed");
    const profile = parseProfile(rawProfile);
    if (await this.current(guestId)) throw new InputError("already_in_conversation");
    await this.store.touchOnline(guestId, now);
    await this.store.enqueue({ guestId, profile, joinedAt: now });
    this.deps.send(guestId, { type: "lbt.waiting", since: iso(now) });
    await this.pairWaiting();
  }

  async cancel(guestId: string) {
    await this.cancelCompanionFor(guestId, "cancelled");
    await this.store.dequeue(guestId);
  }

  /** Offer without removing the visitor from normal matching. Acceptance is explicit. */
  async inviteCompanion(target: unknown, identity: unknown = "male") {
    const profile = companionProfile(identity);
    if (!profile) throw new InputError("invalid_companion_identity");
    if (typeof target !== "string") throw new InputError("not_waiting");
    this.requireAllowed(COMPANION_ID);
    this.requireAllowed(target);
    const now = this.deps.now();
    if (!(await this.openNow(now))) throw new InputError("closed");
    if (await this.current(COMPANION_ID)) throw new InputError("companion_busy");
    const pending = await this.store.companionInvite();
    if (pending && pending.expiresAt > now) throw new InputError("companion_busy");
    if (pending) await this.clearCompanion("expired");
    const visitor = (await this.store.listWaiting()).find((w) => w.guestId === target);
    const seen = await this.store.lastSeen(target);
    if (!visitor || seen === null || seen < now - this.cfg.offlineAfterMs) throw new InputError("not_waiting");
    if ((await this.store.blockedFor(target, now)).has(COMPANION_ID)) throw new InputError("pair_blocked");
    if (!(await this.store.hit(`companion:invite:${target}`, 1, INVITE_MS, now))) throw new InputError("slow_down");
    const invite: CompanionInvite = { id: this.deps.newId(), guestId: target, expiresAt: now + INVITE_MS, profile };
    await this.store.saveCompanionInvite(invite);
    this.sendCompanionInvite(invite);
    this.deps.send(COMPANION_ID, { type: "lbt.companion_pending", id: invite.id, profile: visitor.profile, nickname: publicProfile(invite.profile ?? COMPANION_PROFILE).nickname });
  }

  async answerCompanion(guestId: string, id: unknown, accept: boolean) {
    this.requireAllowed(guestId);
    this.requireAllowed(COMPANION_ID);
    const invite = await this.store.companionInvite();
    if (!invite || invite.id !== id || invite.guestId !== guestId) throw new InputError("invite_unavailable");
    const now = this.deps.now();
    const adminSeen = await this.store.lastSeen(COMPANION_ID);
    const target = (await this.store.listWaiting()).find((w) => w.guestId === guestId);
    if (invite.expiresAt <= now || adminSeen === null || adminSeen < now - this.cfg.offlineAfterMs || !target) {
      await this.clearCompanion("expired");
      throw new InputError("invite_unavailable");
    }
    if (!accept) return this.clearCompanion("declined");
    if (!(await this.openNow(now))) {
      await this.clearCompanion("cancelled");
      throw new InputError("closed");
    }
    if (await this.current(COMPANION_ID)) throw new InputError("companion_busy");
    if ((await this.store.blockedFor(guestId, now)).has(COMPANION_ID)) throw new InputError("pair_blocked");
    await this.clearCompanion("accepted");
    await this.startConversation(target, { guestId: COMPANION_ID, profile: invite.profile ?? COMPANION_PROFILE, joinedAt: now }, now);
  }

  private sendCompanionInvite(invite: CompanionInvite) {
    this.deps.send(invite.guestId, {
      type: "lbt.companion_invite", id: invite.id, nickname: publicProfile(invite.profile ?? COMPANION_PROFILE).nickname,
      expires_at: iso(invite.expiresAt), server_now: iso(this.deps.now()),
    });
  }

  private async cancelCompanionFor(guestId: string, reason: string) {
    const invite = await this.store.companionInvite();
    if (invite && (guestId === COMPANION_ID || invite.guestId === guestId)) await this.clearCompanion(reason);
  }

  private async clearCompanion(reason: string) {
    const invite = await this.store.companionInvite();
    if (!invite) return;
    await this.store.clearCompanionInvite();
    for (const g of [invite.guestId, COMPANION_ID]) {
      this.deps.send(g, { type: "lbt.companion_cleared", id: invite.id, reason });
    }
  }

  /** Pair everyone who can be paired right now; returns pairs made. */
  async pairWaiting(): Promise<number> {
    const now = this.deps.now();
    if (await this.store.maintenance()) return 0;
    const queued = await this.store.listWaiting();
    for (const w of queued) if (this.suspended(w.guestId)) await this.restrict(w.guestId);
    const pool = (await this.store.listWaiting()).sort((a, b) => a.joinedAt - b.joinedAt);
    const taken = new Set<string>();
    let made = 0;
    for (const me of pool) {
      if (taken.has(me.guestId)) continue;
      const others = pool.filter((w) => !taken.has(w.guestId) && w.guestId !== me.guestId);
      const partner = pickPartner(
        me,
        others,
        now,
        this.cfg.relaxAfterMs,
        await this.store.blockedFor(me.guestId, now),
      );
      if (!partner) continue;
      taken.add(me.guestId).add(partner.guestId);
      await this.startConversation(me, partner, now);
      made += 1;
    }
    return made;
  }

  private async startConversation(a: Waiting, b: Waiting, now: number) {
    await this.cancelCompanionFor(a.guestId, "matched");
    await this.cancelCompanionFor(b.guestId, "matched");
    await this.store.dequeue(a.guestId);
    await this.store.dequeue(b.guestId);
    const c: Conversation = {
      id: this.deps.newId(),
      guestA: a.guestId,
      guestB: b.guestId,
      profileA: a.profile,
      profileB: b.profile,
      startedAt: now,
      endsAt: now + this.cfg.sessionMs,
      extensions: 0,
    };
    await this.store.saveConversation(c);
    await this.deps.onConversationStarted?.(now);
    for (const g of [a.guestId, b.guestId]) this.deps.send(g, this.matchedFrame(c, g, now));
  }

  // ── inside a conversation ──────────────────────────────────────────

  async sendMessage(guestId: string, rawText: unknown) {
    const text = maskContacts(cleanText(rawText, MESSAGE_MAX));
    if (!text) throw new InputError("empty_message");
    const c = await this.require(guestId);
    const now = this.deps.now();
    if (c.endsAt <= now) throw new InputError("time_up");
    const line: Line = { id: this.deps.newId(), from: guestId, text, at: now };
    await this.store.appendLine(c.id, line);
    for (const g of [guestId, partnerOf(c, guestId)]) this.deps.send(g, messageFrame(line, g));
  }

  async typing(guestId: string) {
    this.requireAllowed(guestId);
    const c = await this.current(guestId);
    if (c) this.deps.send(partnerOf(c, guestId), { type: "lbt.typing" });
  }

  async extend(guestId: string) {
    const c = await this.require(guestId);
    const now = this.deps.now();
    if (now >= c.endsAt + this.cfg.graceMs) throw new InputError("too_late");
    const partner = partnerOf(c, guestId);
    if (await this.store.addExtendVote(c, guestId)) {
      // Agreeing during the grace period still yields a full window.
      const updated: Conversation = {
        ...c,
        endsAt: Math.max(now, c.endsAt) + this.cfg.sessionMs,
        extensions: c.extensions + 1,
      };
      await this.store.saveConversation(updated);
      for (const g of [guestId, partner]) this.deps.send(g, { type: "lbt.extended", ...this.timing(updated, now) });
      return;
    }
    this.deps.send(guestId, { type: "lbt.extend_requested", by: "me" });
    this.deps.send(partner, { type: "lbt.extend_requested", by: "partner" });
  }

  async leave(guestId: string) {
    await this.cancelCompanionFor(guestId, "cancelled");
    await this.store.dequeue(guestId);
    const c = await this.current(guestId);
    if (!c) return;
    await this.close(c, { [guestId]: "left", [partnerOf(c, guestId)]: "partner_left" });
  }

  async report(guestId: string, reason: string, note: unknown): Promise<string> {
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new InputError("invalid_reason");
    if (!this.deps.saveReport) throw new Error("report storage not wired");
    const now = this.deps.now();
    const id = await this.store.conversationIdOf(guestId);
    const c = id ? await this.store.getConversation(id) : null;
    if (!c || (c.guestA !== guestId && c.guestB !== guestId)) throw new InputError("no_conversation");
    const partner = partnerOf(c, guestId);
    const record: ReportRecord = {
      id: this.deps.newId(),
      conversationId: c.id,
      reporterGuestId: guestId,
      reportedGuestId: partner,
      reason,
      note: cleanText(note, REPORT_NOTE_MAX) || null,
      transcript: (await this.store.transcript(c.id)).map((l) => ({
        from: l.from === guestId ? "reporter" : "reported",
        text: l.text,
        at: iso(l.at),
      })),
      reporterProfile: { ...profileOf(c, guestId) },
      reportedProfile: { ...profileOf(c, partner) },
      status: "open",
      createdAt: iso(now),
    };
    await this.deps.saveReport(record);
    await this.store.blockPair(guestId, partner, now + this.cfg.blockMs);
    if ((await this.store.conversationIdOf(guestId)) === c.id) {
      await this.close(c, { [guestId]: "reported", [partner]: "partner_left" });
    }
    return record.id;
  }

  // ── periodic work ──────────────────────────────────────────────────

  /** End timed-out or abandoned chats, drop absent waiters, pair the rest. */
  async sweep() {
    const now = this.deps.now();
    const cutoff = now - this.cfg.offlineAfterMs;
    const invite = await this.store.companionInvite();
    if (invite) {
      const seen = await this.store.lastSeen(COMPANION_ID);
      const targetSeen = await this.store.lastSeen(invite.guestId);
      if (invite.expiresAt <= now || seen === null || seen < cutoff || targetSeen === null || targetSeen < cutoff) {
        await this.clearCompanion("expired");
      }
    }
    for (const id of await this.store.activeConversationIds()) {
      const c = await this.store.getConversation(id);
      if (!c) continue;
      const restricted = [c.guestA, c.guestB].find((g) => this.suspended(g));
      if (restricted) { await this.restrict(restricted); continue; }
      if (now >= c.endsAt + this.cfg.graceMs) {
        await this.close(c, { [c.guestA]: "timeout", [c.guestB]: "timeout" });
        continue;
      }
      const gone: string[] = [];
      for (const g of [c.guestA, c.guestB]) {
        const seen = await this.store.lastSeen(g);
        if (seen === null || seen < cutoff) gone.push(g);
      }
      if (gone.length > 0) {
        const reasons: Record<string, string> = {};
        for (const g of [c.guestA, c.guestB]) reasons[g] = gone.includes(g) ? "left" : "partner_disconnected";
        await this.close(c, reasons);
      }
    }
    for (const w of await this.store.listWaiting()) {
      const seen = await this.store.lastSeen(w.guestId);
      if (seen === null || seen < cutoff) await this.store.dequeue(w.guestId);
    }
    await this.store.pruneOnline(now - this.cfg.offlineAfterMs * 2);
    await this.store.pruneExpired(now);
    await this.pairWaiting();
  }

  /** Remove a reviewed guest from queue/invitations and end any active chat. */
  async restrict(guestId: string) {
    await this.cancelCompanionFor(guestId, "cancelled");
    await this.store.dequeue(guestId);
    const c = await this.current(guestId);
    if (c) await this.close(c, { [guestId]: "suspended", [partnerOf(c, guestId)]: "partner_left" });
  }

  private suspended(guestId: string) {
    return (this.deps.suspendedUntil?.(guestId) ?? 0) > this.deps.now();
  }
  private requireAllowed(guestId: string) {
    if (this.suspended(guestId)) throw new InputError("guest_suspended");
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async current(guestId: string): Promise<Conversation | null> {
    const id = await this.store.conversationIdOf(guestId);
    return id ? this.store.getConversation(id) : null;
  }

  private async require(guestId: string): Promise<Conversation> {
    this.requireAllowed(guestId);
    const c = await this.current(guestId);
    if (!c) throw new InputError("no_conversation");
    const partner = partnerOf(c, guestId);
    if (this.suspended(partner)) { await this.restrict(partner); throw new InputError("no_conversation"); }
    return c;
  }

  private async close(c: Conversation, reasons: Record<string, string>) {
    await this.store.closeConversation(c);
    for (const [g, reason] of Object.entries(reasons)) this.deps.send(g, { type: "lbt.ended", reason });
  }

  private timing(c: Conversation, now: number) {
    return { ends_at: iso(c.endsAt), grace_seconds: Math.round(this.cfg.graceMs / 1000), server_now: iso(now) };
  }

  private matchedFrame(c: Conversation, guestId: string, now: number): Frame {
    return {
      type: "lbt.matched",
      conversation_id: c.id,
      me: publicProfile(profileOf(c, guestId)),
      partner: publicProfile(profileOf(c, partnerOf(c, guestId))),
      ...this.timing(c, now),
    };
  }
}

export function partnerOf(c: Conversation, guestId: string): string {
  if (guestId === c.guestA) return c.guestB;
  if (guestId === c.guestB) return c.guestA;
  throw new Error("guest is not part of this conversation");
}

function profileOf(c: Conversation, guestId: string) {
  return guestId === c.guestA ? c.profileA : c.profileB;
}

function messageFrame(line: Line, recipient: string): Frame {
  return {
    type: "lbt.message",
    id: line.id,
    from: line.from === recipient ? "me" : "partner",
    text: line.text,
    at: iso(line.at),
  };
}
