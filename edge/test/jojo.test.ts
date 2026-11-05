import { beforeEach, describe, expect, test, vi } from "vitest";
import { createJojoReply, declaresMinor, JOJO_WAIT_MS, jojoId, jojoResponseText, type JojoReply } from "../src/jojo";
import { MemoryKV, TownStore } from "../src/store";
import { DEFAULT_CONFIG, Town, type Frame, type ReportRecord } from "../src/town";

let now: number, store: TownStore, town: Town, kv: MemoryKV;
let sent: { guest: string; frame: Frame }[], reports: ReportRecord[];
let starts: number;
let reply: ReturnType<typeof vi.fn<JojoReply>>;
const profile = { nickname: "訪客", energy: 2, preference: "casual" };
const frames = (type: string) => sent.filter(s => s.guest === "g_a" && s.frame.type === type).map(s => s.frame);
function build(enabled = true) {
  return new Town({ store, now: () => now, newId: () => crypto.randomUUID(), send: (guest, frame) => sent.push({ guest, frame }),
    config: DEFAULT_CONFIG, jojoReply: enabled ? reply : undefined,
    saveReport: async r => { reports.push(r); }, onConversationStarted: async () => { starts++; } });
}
beforeEach(() => {
  now = Date.UTC(2026, 10, 5, 13); kv = new MemoryKV(); store = new TownStore(kv); sent = []; reports = []; starts = 0;
  reply = vi.fn<JojoReply>().mockResolvedValue("那我有點想跟你熟了 😏"); town = build();
});
async function waitForJojo(guest = "g_a") {
  await town.join(guest, profile, true); now += JOJO_WAIT_MS;
  await town.heartbeat(guest);
}
async function chat() { await waitForJojo(); await town.startJojo("g_a", true); }

describe("explicit AI resident", () => {
  test("disabled by default and never creates an automatic match", async () => {
    town = build(false); await waitForJojo(); await town.sweep();
    expect(frames("lbt.waiting")[0]).not.toHaveProperty("jojo_available_at");
    expect(frames("lbt.matched")).toHaveLength(0);
    await expect(town.startJojo("g_a", true)).rejects.toThrow("jojo_unavailable");
  });
  test("requires a full one-minute server-side wait, adult join and explicit consent", async () => {
    await expect(town.join("g_a", profile, false)).rejects.toThrow("age_required");
    await town.join("g_a", { ...profile, role: "ai" }, true);
    expect((await store.listWaiting())[0]?.profile).not.toHaveProperty("role");
    now += 59_999; await town.heartbeat("g_a");
    await expect(town.startJojo("g_a", true)).rejects.toThrow("jojo_too_early");
    now += 1; await town.heartbeat("g_a");
    await expect(town.startJojo("g_a", false)).rejects.toThrow("jojo_consent_required");
    expect(await store.listWaiting()).toHaveLength(1);
    await town.startJojo("g_a", true);
    expect(frames("lbt.matched")[0]?.partner).toMatchObject({ nickname: "你家貓咪會後空翻嗎（AI）", role: "ai" });
    expect(reply).not.toHaveBeenCalled();
    expect(frames("lbt.message").at(-1)?.text).toContain("AI");
  });
  test("no anonymous person count or real conversation metric is fabricated", async () => {
    await chat();
    expect((await town.status()).online).toBe(1); expect(starts).toBe(0);
    expect(await store.lastSeen(jojoId("g_a"))).toBeNull();
    expect(await store.listWaiting()).toHaveLength(0);
  });
  test("normal matching wins and a late AI click cannot replace the person", async () => {
    await waitForJojo(); await town.join("g_b", { ...profile, nickname: "真人乙" }, true);
    await town.startJojo("g_a", true);
    expect(frames("lbt.matched")[0]?.partner).toMatchObject({ nickname: "真人乙" });
    expect(reply).not.toHaveBeenCalled();
  });
  test("cancelled queue, closed town and blocked AI cannot be entered", async () => {
    await waitForJojo(); await store.setMaintenance(true);
    await expect(town.startJojo("g_a", true)).rejects.toThrow("closed");
    await store.setMaintenance(false); await store.blockPair("g_a", jojoId("g_a"), now + 10000);
    await expect(town.startJojo("g_a", true)).rejects.toThrow("jojo_unavailable");
    await town.cancel("g_a"); await expect(town.startJojo("g_a", true)).rejects.toThrow("not_waiting");
  });
  test("sweep keeps an AI session alive without fabricating a heartbeat", async () => {
    await chat(); now += 20000; await town.heartbeat("g_a"); await town.sweep();
    expect(frames("lbt.ended")).toHaveLength(0);
    await town.extend("g_a"); expect(frames("lbt.extended")).toHaveLength(1);
  });
  test("reconnect preserves the AI label and only its own transcript", async () => {
    await chat(); await town.sendMessage("g_a", "妳很直接欸"); await town.connect("g_a");
    expect(frames("lbt.matched").at(-1)?.partner).toMatchObject({ nickname: "你家貓咪會後空翻嗎（AI）", role: "ai" });
    expect(reply.mock.calls[0]?.[0].map(l => l.text)).toContain("妳很直接欸");
  });
  test("a late model result cannot recreate a chat after leave", async () => {
    await chat(); let resolve!: (value: string) => void;
    reply.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = town.sendMessage("g_a", "私密內容");
    await vi.waitFor(() => expect(reply).toHaveBeenCalled());
    const signal = reply.mock.calls[0]![2];
    const id = (await store.conversationIdOf("g_a"))!;
    await expect(town.sendMessage("g_a", "連續送出")).rejects.toThrow("jojo_busy");
    await town.leave("g_a"); resolve("這句不該出現"); await pending;
    expect(signal.aborted).toBe(true); expect(await store.transcript(id)).toEqual([]);
    expect(await store.getConversation(id)).toBeNull();
    expect(frames("lbt.message").some(f => f.text === "這句不該出現")).toBe(false);
    expect([...kv.data.keys()].some(k => k.startsWith("lines:"))).toBe(false);
  });
  test("provider failure is a notice, not a fabricated reply or a leaked error", async () => {
    await chat(); reply.mockRejectedValue(new Error("PRIVATE_PROVIDER_BODY"));
    await town.sendMessage("g_a", "你好");
    expect(frames("lbt.error").at(-1)?.code).toBe("jojo_unavailable");
    expect(JSON.stringify(sent)).not.toContain("PRIVATE_PROVIDER_BODY");
  });
  test.each(["minute", "hour", "day"])("%s usage cap is enforced before inference", async scope => {
    await chat();
    const key = scope === "day" ? "jojo:day:" + Math.floor(now / 86400000) : "jojo:" + scope + ":g_a";
    await kv.put("limits", { [key]: { count: scope === "minute" ? 12 : scope === "hour" ? 60 : 1000, resetAt: now + 60000 } });
    await expect(town.sendMessage("g_a", "超過上限")).rejects.toThrow("jojo_unavailable");
    expect(reply).not.toHaveBeenCalled();
  });
  test("simultaneous clicks only create one AI conversation", async () => {
    await waitForJojo();
    const results = await Promise.allSettled([town.startJojo("g_a", true), town.startJojo("g_a", true)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await store.activeConversationIds()).toHaveLength(1);
  });
  test("parallel AI conversations never share their transcripts", async () => {
    await chat(); await waitForJojo("g_b"); await town.startJojo("g_b", true);
    await town.heartbeat("g_a");
    await town.sendMessage("g_a", "甲的私密測試");
    await town.sendMessage("g_b", "乙的私密測試");
    expect(reply.mock.calls[0]![0].some(l => l.text === "乙的私密測試")).toBe(false);
    expect(reply.mock.calls[1]![0].some(l => l.text === "甲的私密測試")).toBe(false);
  });
  test("a hung provider times out even if it ignores abort", async () => {
    vi.useFakeTimers();
    try {
      await chat(); reply.mockImplementation(() => new Promise(() => {}));
      const pending = town.sendMessage("g_a", "逾時測試");
      await vi.waitFor(() => expect(reply).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(15000); await pending;
      expect(reply.mock.calls[0]![2].aborted).toBe(true);
      expect(frames("lbt.error").at(-1)?.code).toBe("jojo_unavailable");
    } finally { vi.useRealTimers(); }
  });
  test("report retains AI-labelled evidence and immediately clears the active chat", async () => {
    await chat(); const id = (await store.conversationIdOf("g_a"))!;
    await town.report("g_a", "other", "測試");
    expect(reports[0]?.reportedProfile.role).toBe("ai");
    expect(await store.transcript(id)).toEqual([]);
    await waitForJojo(); await expect(town.startJojo("g_a", true)).rejects.toThrow("jojo_unavailable");
  });
  test("disclosed underage status stops the adult character before inference", async () => {
    await chat(); await town.sendMessage("g_a", "其實我17歲");
    expect(reply).not.toHaveBeenCalled(); expect(await store.conversationIdOf("g_a")).toBeNull();
    expect(frames("lbt.error").at(-1)?.code).toBe("age_required");
  });
  test("disabling the feature ends existing AI sessions on sweep", async () => {
    await chat(); town = build(false); await town.sweep();
    expect(frames("lbt.ended").at(-1)?.reason).toBe("partner_disconnected");
  });
});

test("response adapter handles both Cloudflare output forms without exposing reasoning", () => {
  expect(jojoResponseText({ choices: [{ message: { content: "<think>private</think>你家貓咪會後空翻嗎：你也太會 😏" } }] })).toBe("你也太會 😏");
  expect(jojoResponseText({ response: "好" })).toBe("好");
  expect(() => jojoResponseText({ response: "<think>unfinished" })).toThrow("jojo_invalid_response");
  expect(Array.from(jojoResponseText({ response: "嘿".repeat(100) })).length).toBe(80);
});

test.each(["我17歲", "我才十六歲", "我未滿十八", "I'm 16 years old", "I am under 18"])("age disclosure: %s", text => {
  expect(declaresMinor(text)).toBe(true);
});

test("provider adapter receives only the recent 16 lines without internal guest identifiers", async () => {
  const run = vi.fn().mockResolvedValue({ response: "你好 😏" });
  const generate = createJojoReply({ run });
  const history = Array.from({ length: 40 }, (_, i) => ({ id: "secret-id-" + i, from: i % 2 ? "internal-guest" : "internal-ai", text: "line-" + i, at: i }));
  await generate(history, "internal-guest", new AbortController().signal);
  const input = run.mock.calls[0]![1] as { messages: { role: string; content: string }[]; max_tokens: number };
  expect(input.messages).toHaveLength(17);
  expect(input.messages[1]?.content).toBe("line-24");
  expect(JSON.stringify(input)).not.toMatch(/internal-guest|secret-id|line-23/);
  expect(input.max_tokens).toBe(256);
});

test("identity disclosure and opting out of flirting are deterministic, not model guesses", async () => {
  const run = vi.fn().mockResolvedValue({ response: "普通回覆" });
  const generate = createJojoReply({ run });
  const lines = (text: string) => [{ id: "1", from: "guest", text, at: 0 }];
  expect(await generate(lines("妳是AI嗎"), "guest", new AbortController().signal)).toContain("我是小鎮的 AI");
  expect(await generate(lines("今天只想正常聊天"), "guest", new AbortController().signal)).toContain("正常聊");
  expect(run).not.toHaveBeenCalled();
  await generate([...lines("不要調情"), ...Array.from({ length: 20 }, (_, i) => ({ id: String(i), from: "guest", text: "普通話題" + i, at: i }))], "guest", new AbortController().signal);
  const input = run.mock.calls[0]![1] as { messages: { content: string }[] };
  expect(input.messages[0]?.content).toContain("使用者已選擇本次只正常聊天");
});
