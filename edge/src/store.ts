/**
 * Live session state for the town. The Durable Object runs every event one
 * at a time, so unlike the Redis store there are no locks or atomic
 * scripts: a read-modify-write here can't interleave with another one.
 *
 * Everything is kept as a handful of JSON values under fixed keys plus
 * per-conversation keys. Ended chat content is deleted immediately; only
 * short-lived presence and abuse-prevention counters remain.
 */
import type { Profile, Waiting } from "./rules";
import type { CompanionInvite } from "./companion";

export interface Conversation {
  id: string;
  guestA: string;
  guestB: string;
  profileA: Profile;
  profileB: Profile;
  startedAt: number;
  endsAt: number;
  extensions: number;
}

export interface Line {
  id: string;
  from: string;
  text: string;
  at: number;
}

/** Minimal key-value surface shared by DurableObjectStorage and the test fake. */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export class MemoryKV implements KV {
  readonly data = new Map<string, unknown>();
  async get<T>(key: string) {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string) {
    return this.data.delete(key);
  }
}

export const TRANSCRIPT_MAX_LINES = 400;

const K = {
  companionInvite: "companion:invite",
  adminRevoked: "admin:revoked",
  maintenance: "maintenance", // boolean: admin paused all matching

  online: "online", // Record<guestId, lastSeenMs>
  queue: "queue", // Waiting[]
  active: "active", // conversationId[]
  closed: "closed", // Legacy retention entries / interrupted deletion markers
  current: "current", // Record<guestId, conversationId>
  last: "last", // Legacy post-chat report lookup, removed during upgrade
  blocks: "blocks", // Record<"a|b" sorted, untilMs>
  limits: "limits", // Record<key, { count, resetAt }>
  conv: (id: string) => `conv:${id}`,
  lines: (id: string) => `lines:${id}`,
  votes: (id: string) => `votes:${id}`,
};

export class TownStore {
  constructor(private readonly kv: KV) {}

  async companionInvite(): Promise<CompanionInvite | null> {
    return (await this.kv.get<CompanionInvite>(K.companionInvite)) ?? null;
  }
  async saveCompanionInvite(invite: CompanionInvite) {
    await this.kv.put(K.companionInvite, invite);
  }
  async clearCompanionInvite() {
    await this.kv.delete(K.companionInvite);
  }

  /** Admin maintenance pause: when true, no new matching happens. Durable. */
  async maintenance(): Promise<boolean> {
    return (await this.kv.get<boolean>(K.maintenance)) === true;
  }
  async setMaintenance(on: boolean) {
    if (on) await this.kv.put(K.maintenance, true);
    else await this.kv.delete(K.maintenance);
  }

  async revokeAdminSession(fingerprint: string, until: number) {
    const revoked = await this.map<number>(K.adminRevoked);
    revoked[fingerprint] = until;
    await this.kv.put(K.adminRevoked, revoked);
  }
  async adminSessionRevoked(fingerprint: string, now: number) {
    return ((await this.map<number>(K.adminRevoked))[fingerprint] ?? 0) > now;
  }

  private async map<T>(key: string): Promise<Record<string, T>> {
    return (await this.kv.get<Record<string, T>>(key)) ?? {};
  }

  // presence
  async touchOnline(guestId: string, now: number) {
    const online = await this.map<number>(K.online);
    online[guestId] = now;
    await this.kv.put(K.online, online);
  }
  async lastSeen(guestId: string): Promise<number | null> {
    return (await this.map<number>(K.online))[guestId] ?? null;
  }
  async countOnline(since: number): Promise<number> {
    return Object.values(await this.map<number>(K.online)).filter((t) => t >= since).length;
  }
  async pruneOnline(before: number) {
    const online = await this.map<number>(K.online);
    const kept = Object.fromEntries(Object.entries(online).filter(([, t]) => t >= before));
    await this.kv.put(K.online, kept);
  }

  // waiting room
  async listWaiting(): Promise<Waiting[]> {
    return (await this.kv.get<Waiting[]>(K.queue)) ?? [];
  }
  async enqueue(w: Waiting) {
    const queue = (await this.listWaiting()).filter((x) => x.guestId !== w.guestId);
    queue.push(w);
    await this.kv.put(K.queue, queue);
  }
  async dequeue(guestId: string): Promise<boolean> {
    const queue = await this.listWaiting();
    const kept = queue.filter((x) => x.guestId !== guestId);
    if (kept.length === queue.length) return false;
    await this.kv.put(K.queue, kept);
    return true;
  }

  // conversations
  async saveConversation(c: Conversation) {
    await this.kv.put(K.conv(c.id), c);
    const active = (await this.kv.get<string[]>(K.active)) ?? [];
    if (!active.includes(c.id)) await this.kv.put(K.active, [...active, c.id]);
    const current = await this.map<string>(K.current);
    current[c.guestA] = c.id;
    current[c.guestB] = c.id;
    await this.kv.put(K.current, current);
  }
  async getConversation(id: string): Promise<Conversation | null> {
    return (await this.kv.get<Conversation>(K.conv(id))) ?? null;
  }
  async conversationIdOf(guestId: string): Promise<string | null> {
    return (await this.map<string>(K.current))[guestId] ?? null;
  }
  async activeConversationIds(): Promise<string[]> {
    return (await this.kv.get<string[]>(K.active)) ?? [];
  }
  /** Delete live chat data before notifying either browser that it ended. */
  async closeConversation(c: Conversation) {
    // Keep a cleanup marker until deletion completes, so a restart can retry.
    const closed = await this.map<number>(K.closed);
    closed[c.id] = 0;
    await this.kv.put(K.closed, closed);
    await this.kv.delete(K.conv(c.id));
    await this.kv.delete(K.lines(c.id));
    await this.kv.delete(K.votes(c.id));
    const current = await this.map<string>(K.current);
    for (const g of [c.guestA, c.guestB]) {
      if (current[g] === c.id) delete current[g];
    }
    await this.kv.put(K.current, current);
    await this.kv.put(K.active, (await this.activeConversationIds()).filter((id) => id !== c.id));
    delete closed[c.id];
    await this.kv.put(K.closed, closed);
  }

  /** Upgrade cleanup: purge old 24-hour transcripts and interrupted deletions. */
  async purgeClosed() {
    const closed = await this.map<number>(K.closed);
    const ids = new Set(Object.keys(closed));
    for (const id of ids) {
      await this.kv.delete(K.conv(id));
      await this.kv.delete(K.lines(id));
      await this.kv.delete(K.votes(id));
    }
    if (ids.size) {
      const current = await this.map<string>(K.current);
      await this.kv.put(K.current, Object.fromEntries(Object.entries(current).filter(([, id]) => !ids.has(id))));
      await this.kv.put(K.active, (await this.activeConversationIds()).filter((id) => !ids.has(id)));
    }
    await this.kv.delete(K.last);
    await this.kv.delete(K.closed);
  }

  /** Purge ended chats immediately and expire abuse-prevention counters. */
  async pruneExpired(now: number) {
    await this.purgeClosed();
    const blocks = await this.map<number>(K.blocks);
    await this.kv.put(K.blocks, Object.fromEntries(Object.entries(blocks).filter(([, u]) => u > now)));
    const revoked = await this.map<number>(K.adminRevoked);
    await this.kv.put(K.adminRevoked, Object.fromEntries(Object.entries(revoked).filter(([, until]) => until > now)));
    const limits = await this.map<{ count: number; resetAt: number }>(K.limits);
    await this.kv.put(K.limits, Object.fromEntries(Object.entries(limits).filter(([, l]) => l.resetAt > now)));
  }
  async hasPendingWork(): Promise<{ live: boolean; expiring: boolean }> {
    const live = (await this.listWaiting()).length > 0 || (await this.activeConversationIds()).length > 0;
    const expiring =
      Object.keys(await this.map(K.closed)).length > 0 || Object.keys(await this.map(K.online)).length > 0 ||
      Object.keys(await this.map(K.limits)).length > 0 || Object.keys(await this.map(K.adminRevoked)).length > 0;
    return { live, expiring };
  }

  /** Record a wish to extend. True only for the vote that completes the pair; votes then reset. */
  async addExtendVote(c: Conversation, guestId: string): Promise<boolean> {
    const votes = new Set((await this.kv.get<string[]>(K.votes(c.id))) ?? []);
    votes.add(guestId);
    if (votes.has(c.guestA) && votes.has(c.guestB)) {
      await this.kv.delete(K.votes(c.id));
      return true;
    }
    await this.kv.put(K.votes(c.id), [...votes]);
    return false;
  }
  async extendVotes(id: string): Promise<string[]> {
    return (await this.kv.get<string[]>(K.votes(id))) ?? [];
  }

  async appendLine(conversationId: string, line: Line) {
    const lines = (await this.kv.get<Line[]>(K.lines(conversationId))) ?? [];
    lines.push(line);
    await this.kv.put(K.lines(conversationId), lines.slice(-TRANSCRIPT_MAX_LINES));
  }
  async transcript(conversationId: string): Promise<Line[]> {
    return (await this.kv.get<Line[]>(K.lines(conversationId))) ?? [];
  }

  // safety
  async blockPair(a: string, b: string, until: number) {
    const blocks = await this.map<number>(K.blocks);
    blocks[[a, b].sort().join("|")] = until;
    await this.kv.put(K.blocks, blocks);
  }
  async blockedFor(guestId: string, now: number): Promise<Set<string>> {
    const out = new Set<string>();
    for (const [pair, until] of Object.entries(await this.map<number>(K.blocks))) {
      if (until <= now) continue;
      const [a, b] = pair.split("|") as [string, string];
      if (a === guestId) out.add(b);
      else if (b === guestId) out.add(a);
    }
    return out;
  }

  async limited(key: string, limit: number, now: number): Promise<boolean> {
    const entry = (await this.map<{ count: number; resetAt: number }>(K.limits))[key];
    return !!entry && entry.resetAt > now && entry.count >= limit;
  }

  /** Fixed-window counter. True when this hit is within `limit`. */
  async hit(key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
    const limits = await this.map<{ count: number; resetAt: number }>(K.limits);
    const entry = limits[key];
    const current = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + windowMs };
    current.count += 1;
    limits[key] = current;
    await this.kv.put(K.limits, limits);
    return current.count <= limit;
  }
}
