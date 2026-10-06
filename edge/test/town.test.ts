/**
 * Town — the live LowBatteryTown flow over an in-memory store. Ported from
 * backend/tests/unit/test_lbt_service.py; frames sent per guest are the
 * observable contract the frontend relies on.
 */
import { beforeEach, describe, expect, test } from "vitest";

import { InputError, type Profile } from "../src/rules";
import { MemoryKV, TownStore } from "../src/store";
import { DEFAULT_CONFIG, type Frame, type ReportRecord, Town, type TownConfig } from "../src/town";

const T0 = Date.UTC(2026, 9, 3, 13, 0); // 21:00 Asia/Taipei
const CFG = DEFAULT_CONFIG;
const LISTEN = { nickname: "小橘", energy: 1, preference: "listen" };
const STORY = { nickname: "阿樹", energy: 2, preference: "story" };

let now: number;
let sent: { guest: string; frame: Frame }[];
let reports: ReportRecord[];
let store: TownStore;
let town: Town;
let suspensions: Map<string, number>;
let conversationStarts: number;

function build(config: TownConfig = CFG) {
  let seq = 0;
  return new Town({
    store,
    send: (guest, frame) => sent.push({ guest, frame }),
    now: () => now,
    newId: () => `id-${++seq}`,
    saveReport: async (r) => void reports.push(r),
    config,
    suspendedUntil: (id) => suspensions.get(id) ?? null,
    onConversationStarted: async () => { conversationStarts += 1; },
  });
}

beforeEach(() => {
  now = T0;
  sent = [];
  reports = [];
  conversationStarts = 0;
  suspensions = new Map();
  store = new TownStore(new MemoryKV());
  town = build();
});

const frames = (guest: string, type?: string) =>
  sent.filter((s) => s.guest === guest && (!type || s.frame.type === type)).map((s) => s.frame);

async function pair(): Promise<string> {
  await town.join("g_a", LISTEN, true);
  await town.join("g_b", STORY, true);
  return (await store.conversationIdOf("g_a")) ?? "";
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toThrow(InputError);
  await p.catch((e: InputError) => expect(e.code).toBe(code));
}

describe("joining", () => {
  test("without age confirmation is rejected", () => expectCode(town.join("g_a", LISTEN, false), "age_required"));

  test("outside opening hours is rejected", async () => {
    town = build({ ...CFG, openHours: { start: 9 * 60, end: 10 * 60 } });
    await expectCode(town.join("g_a", LISTEN, true), "closed");
  });

  test("with a bad profile is rejected", () =>
    expectCode(town.join("g_a", { nickname: "x", energy: 9, preference: "casual" }, true), "invalid_energy"));

  test("a lone joiner waits", async () => {
    await town.join("g_a", LISTEN, true);
    expect([(await store.listWaiting()).map((w) => w.guestId), frames("g_a", "lbt.waiting").length]).toEqual([
      ["g_a"],
      1,
    ]);
  });

  test("two compatible joiners are paired and leave the queue", async () => {
    await pair();
    expect([(await store.listWaiting()).length, (await store.activeConversationIds()).length]).toEqual([0, 1]);
  });

  test("each side learns the other's profile but not their id", async () => {
    await pair();
    const matched = frames("g_a", "lbt.matched")[0];
    expect([matched?.partner, JSON.stringify(matched).includes("g_b")]).toEqual([STORY, false]);
  });

  test("the matched frame carries the server clock and end", async () => {
    await pair();
    const m = frames("g_b", "lbt.matched")[0];
    expect([m?.ends_at, m?.server_now, m?.grace_seconds]).toEqual([
      new Date(T0 + CFG.sessionMs).toISOString(),
      new Date(T0).toISOString(),
      60,
    ]);
  });

  test("joining while in a conversation is rejected", async () => {
    await pair();
    await expectCode(town.join("g_a", LISTEN, true), "already_in_conversation");
  });

  test("poor matches pair once someone waited the relax time", async () => {
    await town.join("g_a", LISTEN, true);
    await town.join("g_b", { ...LISTEN, nickname: "b", energy: 3 }, true);
    expect((await store.activeConversationIds()).length).toBe(0);
    now += CFG.relaxAfterMs;
    for (const g of ["g_a", "g_b"]) await store.touchOnline(g, now);
    await town.sweep();
    expect((await store.activeConversationIds()).length).toBe(1);
  });

  test("cancel leaves the queue", async () => {
    await town.join("g_a", LISTEN, true);
    await town.cancel("g_a");
    expect(await store.listWaiting()).toEqual([]);
  });

  test("four joiners make two conversations", async () => {
    for (const [g, p] of [["g_1", LISTEN], ["g_2", STORY], ["g_3", LISTEN], ["g_4", STORY]] as const) {
      await town.join(g, p, true);
    }
    expect((await store.activeConversationIds()).length).toBe(2);
  });

  test("each started conversation fires the usage-trend hook once", async () => {
    await pair();
    expect(conversationStarts).toBe(1);
  });
});

describe("maintenance pause", () => {
  test("blocks new joins while paused", async () => {
    await store.setMaintenance(true);
    await expectCode(town.join("g_a", LISTEN, true), "closed");
  });

  test("status reports closed while paused, open again after resume", async () => {
    expect((await town.status()).open).toBe(true);
    await store.setMaintenance(true);
    expect((await town.status()).open).toBe(false);
    await store.setMaintenance(false);
    expect((await town.status()).open).toBe(true);
  });

  test("does not pair queued waiters while paused, pairs them after resume", async () => {
    for (const [g, p] of [["g_a", LISTEN], ["g_b", STORY]] as const) {
      await store.enqueue({ guestId: g, profile: p as Profile, joinedAt: now });
      await store.touchOnline(g, now);
    }
    await store.setMaintenance(true);
    expect(await town.pairWaiting()).toBe(0);
    expect((await store.activeConversationIds()).length).toBe(0);

    await store.setMaintenance(false);
    expect(await town.pairWaiting()).toBe(1);
    expect((await store.activeConversationIds()).length).toBe(1);
  });
});

describe("talking", () => {
  test("a message reaches both sides with their own perspective", async () => {
    await pair();
    await town.sendMessage("g_a", "  今天有點累  ");
    const seen = [frames("g_a", "lbt.message")[0], frames("g_b", "lbt.message")[0]];
    expect(seen.map((f) => [f?.from, f?.text])).toEqual([
      ["me", "今天有點累"],
      ["partner", "今天有點累"],
    ]);
  });

  test("messages are kept in the transcript", async () => {
    const cid = await pair();
    await town.sendMessage("g_b", "hi");
    expect((await store.transcript(cid)).map((l) => l.text)).toEqual(["hi"]);
  });

  test("contact details are hidden from both sides and the transcript", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "加我 line.me/abc 或 0912-345-678");
    const texts = new Set(["g_a", "g_b"].flatMap((g) => frames(g, "lbt.message").map((f) => f.text)));
    expect([[...texts], (await store.transcript(cid)).map((l) => l.text)]).toEqual([
      ["加我 ••• 或 •••"],
      ["加我 ••• 或 •••"],
    ]);
  });

  test.each(["", "   ", null, 123])("empty or non-text message %j is rejected", async (text) => {
    await pair();
    await expectCode(town.sendMessage("g_a", text), "empty_message");
  });

  test("a message without a conversation is rejected", () =>
    expectCode(town.sendMessage("g_a", "hi"), "no_conversation"));

  test("messages after time is up are rejected", async () => {
    await pair();
    now += CFG.sessionMs;
    await expectCode(town.sendMessage("g_a", "one more"), "time_up");
  });

  test("long messages are capped at 500 characters", async () => {
    await pair();
    await town.sendMessage("g_a", "字".repeat(600));
    expect(Array.from(String(frames("g_b", "lbt.message")[0]?.text)).length).toBe(500);
  });

  test("typing goes to the partner only", async () => {
    await pair();
    await town.typing("g_a");
    expect([frames("g_b", "lbt.typing").length, frames("g_a", "lbt.typing").length]).toEqual([1, 0]);
  });
});

describe("extending", () => {
  const endsAt = async (cid: string) => (await store.getConversation(cid))?.endsAt;

  test("one side asking tells both who asked", async () => {
    await pair();
    await town.extend("g_a");
    expect([frames("g_a", "lbt.extend_requested")[0]?.by, frames("g_b", "lbt.extend_requested")[0]?.by]).toEqual([
      "me",
      "partner",
    ]);
  });

  test("both asking extends by one window and tells both", async () => {
    const cid = await pair();
    await town.extend("g_a");
    await town.extend("g_b");
    expect([await endsAt(cid), frames("g_a", "lbt.extended").length, frames("g_b", "lbt.extended").length]).toEqual([
      T0 + CFG.sessionMs * 2,
      1,
      1,
    ]);
  });

  test("agreeing during grace still gives a full window from now", async () => {
    const cid = await pair();
    now += CFG.sessionMs + 30_000;
    await town.extend("g_a");
    await town.extend("g_b");
    expect(await endsAt(cid)).toBe(now + CFG.sessionMs);
  });

  test("extending after grace is rejected", async () => {
    await pair();
    now += CFG.sessionMs + CFG.graceMs;
    await expectCode(town.extend("g_a"), "too_late");
  });

  test("voting twice from one side does not extend", async () => {
    const cid = await pair();
    await town.extend("g_a");
    await town.extend("g_a");
    expect(await endsAt(cid)).toBe(T0 + CFG.sessionMs);
  });

  test("votes reset after an extension", async () => {
    const cid = await pair();
    await town.extend("g_a");
    await town.extend("g_b");
    await town.extend("g_a");
    expect([await endsAt(cid), await store.extendVotes(cid)]).toEqual([T0 + CFG.sessionMs * 2, ["g_a"]]);
  });
});

describe("leaving", () => {
  test("tells each side why", async () => {
    await pair();
    await town.leave("g_a");
    expect([frames("g_a", "lbt.ended")[0]?.reason, frames("g_b", "lbt.ended")[0]?.reason]).toEqual([
      "left",
      "partner_left",
    ]);
  });

  test("leaving immediately deletes messages, profiles, votes and both mappings", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "private message");
    await town.extend("g_a");
    await town.leave("g_b");
    expect([
      await store.activeConversationIds(), await store.conversationIdOf("g_a"),
      await store.conversationIdOf("g_b"), await store.getConversation(cid),
      await store.transcript(cid), await store.extendVotes(cid),
    ]).toEqual([[], null, null, null, [], []]);
  });

  test("leaving from the waiting room dequeues", async () => {
    await town.join("g_a", LISTEN, true);
    await town.leave("g_a");
    expect(await store.listWaiting()).toEqual([]);
  });

  test("disconnecting while waiting dequeues", async () => {
    await town.join("g_a", LISTEN, true);
    await town.disconnect("g_a");
    expect(await store.listWaiting()).toEqual([]);
  });

  test("disconnecting does not end a conversation immediately", async () => {
    await pair();
    await town.disconnect("g_a");
    expect((await store.activeConversationIds()).length).toBe(1);
  });
});

describe("reports", () => {
  test("snapshot the transcript with roles", async () => {
    await pair();
    await town.sendMessage("g_a", "hello");
    await town.sendMessage("g_b", "rude");
    await town.report("g_a", "harassment", "  please check  ");
    const r = reports[0];
    expect([r?.transcript.map((l) => [l.from, l.text]), r?.reportedGuestId, r?.note]).toEqual([
      [
        ["reporter", "hello"],
        ["reported", "rude"],
      ],
      "g_b",
      "please check",
    ]);
  });

  test("end an open conversation", async () => {
    await pair();
    await town.report("g_a", "spam", null);
    expect([frames("g_a", "lbt.ended")[0]?.reason, frames("g_b", "lbt.ended")[0]?.reason]).toEqual([
      "reported",
      "partner_left",
    ]);
  });

  test("reject reports after the conversation ended", async () => {
    await pair();
    await town.leave("g_b");
    await expectCode(town.report("g_a", "sexual", null), "no_conversation");
    expect(reports).toEqual([]);
  });

  test("saves evidence before deleting the live copy", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "evidence");
    await town.report("g_a", "spam", "check");
    expect(reports[0]?.transcript[0]?.text).toBe("evidence");
    expect(reports[0]?.reporterProfile).toEqual(LISTEN);
    expect([await store.getConversation(cid), await store.transcript(cid)]).toEqual([null, []]);
  });

  test("a failed evidence save leaves the chat available for retry", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "evidence");
    town = new Town({ store, send: (guest, frame) => sent.push({ guest, frame }),
      now: () => now, newId: () => "failed-report", config: CFG,
      saveReport: async () => { throw new Error("database unavailable"); },
    });
    await expect(town.report("g_a", "spam", "")).rejects.toThrow("database unavailable");
    expect(await store.conversationIdOf("g_a")).toBe(cid);
    expect((await store.transcript(cid))[0]?.text).toBe("evidence");
    expect(frames("g_a", "lbt.ended")).toEqual([]);
  });

  test("reported pairs are not paired again", async () => {
    await pair();
    await town.report("g_a", "harassment", null);
    await town.join("g_a", LISTEN, true);
    await town.join("g_b", STORY, true);
    now += CFG.relaxAfterMs;
    for (const g of ["g_a", "g_b"]) await store.touchOnline(g, now);
    await town.sweep();
    expect((await store.activeConversationIds()).length).toBe(0);
  });

  test("an unknown reason is rejected", async () => {
    await pair();
    await expectCode(town.report("g_a", "boring", null), "invalid_reason");
  });

  test("without any conversation is rejected", () => expectCode(town.report("g_a", "spam", null), "no_conversation"));
});

describe("sweep", () => {
  test("ends a conversation past grace as timeout", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "private timeout");
    now += CFG.sessionMs + CFG.graceMs;
    for (const g of ["g_a", "g_b"]) await store.touchOnline(g, now);
    await town.sweep();
    expect(frames("g_a", "lbt.ended").map((f) => f.reason)).toEqual(["timeout"]);
    expect([await store.getConversation(cid), await store.transcript(cid)]).toEqual([null, []]);
  });

  test("keeps a conversation inside grace", async () => {
    await pair();
    now += CFG.sessionMs + CFG.graceMs - 1000;
    for (const g of ["g_a", "g_b"]) await store.touchOnline(g, now);
    await town.sweep();
    expect((await store.activeConversationIds()).length).toBe(1);
  });

  test("ends a conversation when one side vanished", async () => {
    const cid = await pair();
    await town.sendMessage("g_a", "private disconnect");
    now += CFG.offlineAfterMs + 1000;
    await store.touchOnline("g_b", now);
    await town.sweep();
    expect([frames("g_b", "lbt.ended")[0]?.reason, frames("g_a", "lbt.ended")[0]?.reason]).toEqual([
      "partner_disconnected",
      "left",
    ]);
    expect([await store.getConversation(cid), await store.transcript(cid)]).toEqual([null, []]);
  });

  test("drops absent waiters", async () => {
    await town.join("g_a", LISTEN, true);
    now += CFG.offlineAfterMs + 1000;
    await town.sweep();
    expect(await store.listWaiting()).toEqual([]);
  });

  test("a restart finishes an interrupted deletion without restoring chat data", async () => {
    const kv = new MemoryKV();
    store = new TownStore(kv);
    town = build();
    const cid = await pair();
    await town.sendMessage("g_a", "private interrupted deletion");
    const remove = kv.delete.bind(kv);
    kv.delete = async (key) => {
      if (key === `lines:${cid}`) throw new Error("storage interrupted");
      return remove(key);
    };
    await expect(town.leave("g_a")).rejects.toThrow("storage interrupted");
    kv.delete = remove;
    store = new TownStore(kv);
    await store.purgeClosed();
    expect([await store.getConversation(cid), await store.transcript(cid),
      await store.conversationIdOf("g_a"), await store.conversationIdOf("g_b"),
      await store.activeConversationIds()]).toEqual([null, [], null, null, []]);
  });

  test("purges old retention data without waiting for its old deadline", async () => {
    const kv = new MemoryKV();
    store = new TownStore(kv);
    town = build();
    const active = await pair();
    const c = await store.getConversation(active);
    await kv.put("conv:old", { ...c, id: "old" });
    await kv.put("lines:old", [{ text: "old private data" }]);
    await kv.put("votes:old", ["g_old"]);
    await kv.put("closed", { old: now + 24 * 3600_000 });
    await kv.put("last", { g_old: { value: "old", until: now + 24 * 3600_000 } });
    await town.sweep();
    expect([await store.getConversation("old"), await store.transcript("old"), await store.extendVotes("old")]).toEqual([null, [], []]);
    expect(kv.data.has("last")).toBe(false);
    expect(await store.getConversation(active)).toEqual(c);
  });
});

describe("reconnect and status", () => {
  test("reconnect replays the conversation, transcript and pending vote", async () => {
    await pair();
    await town.sendMessage("g_b", "still there?");
    await town.extend("g_b");
    sent = [];
    await town.connect("g_a");
    expect(frames("g_a").map((f) => f.type)).toEqual(["lbt.matched", "lbt.message", "lbt.extend_requested"]);
  });

  test("reconnect while waiting replays waiting", async () => {
    await town.join("g_a", LISTEN, true);
    sent = [];
    await town.connect("g_a");
    expect(frames("g_a").map((f) => f.type)).toEqual(["lbt.waiting"]);
  });

  test("reconnect after the conversation ended reports idle", async () => {
    await pair();
    await town.leave("g_b");
    sent = [];
    await town.connect("g_a");
    expect(frames("g_a").map((f) => f.type)).toEqual(["lbt.idle"]);
  });

  test("status counts recently seen guests and waiters", async () => {
    await store.touchOnline("g_old", now - CFG.offlineAfterMs - 1000);
    await town.join("g_a", LISTEN, true);
    expect(await town.status()).toEqual({ online: 1, waiting: 1, open: true, hours: "" });
  });
});


describe("reviewed restrictions", () => {
  test("restricted codes cannot join, while other visitors remain unaffected", async () => {
    suspensions.set("g_a", now + 86400000);
    await expectCode(town.join("g_a", LISTEN, true), "guest_suspended");
    await town.join("g_b", STORY, true);
    expect((await store.listWaiting()).map(w => w.guestId)).toEqual(["g_b"]);
    now += 86400000;
    await town.join("g_a", LISTEN, true);
    expect(await store.conversationIdOf("g_a")).not.toBeNull();
  });
  test("review removes pending offers and prevents new companion invitations", async () => {
    await town.connect("admin:companion");
    await town.join("g_a", LISTEN, true);
    await town.inviteCompanion("g_a");
    suspensions.set("g_a", now + 86400000);
    await expectCode(town.answerCompanion("g_a", (await store.companionInvite())!.id, true), "guest_suspended");
    await town.restrict("g_a");
    expect([await store.companionInvite(), await store.listWaiting()]).toEqual([null, []]);
    await expectCode(town.inviteCompanion("g_a"), "guest_suspended");
  });
  test("review ends an active conversation, deletes its content and blocks reconnect replay", async () => {
    const cid = await pair(); await town.sendMessage("g_b", "private");
    suspensions.set("g_b", now + 86400000);
    await town.restrict("g_b");
    expect(frames("g_b", "lbt.ended")[0]?.reason).toBe("suspended");
    expect([await store.getConversation(cid),await store.transcript(cid)]).toEqual([null,[]]);
    sent=[]; await town.connect("g_b");
    expect(frames("g_b").map(f=>[f.type,f.code])).toEqual([["lbt.error","guest_suspended"]]);
  });
  test("pairing and the sweep enforce a restriction even before cleanup completes", async () => {
    const cid = await pair(); suspensions.set("g_b",now+86400000);
    await town.sweep(); expect(await store.getConversation(cid)).toBeNull();
    await town.join("g_a",LISTEN,true);
    await store.enqueue({guestId:"g_b",profile:{...STORY,preference:"story"},joinedAt:now});
    await town.pairWaiting();
    expect(await store.conversationIdOf("g_b")).toBeNull();
    expect((await store.listWaiting()).map(w=>w.guestId)).toEqual(["g_a"]);
  });
});
