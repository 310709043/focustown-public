import { beforeEach, describe, expect, test } from "vitest";
import { COMPANION_ID, INVITE_MS } from "../src/companion";
import { MemoryKV, TownStore } from "../src/store";
import { DEFAULT_CONFIG, type Frame, type ReportRecord, Town } from "../src/town";
import { createCompanionToken, createGuestToken, verifyCompanionToken, verifyGuestToken } from "../src/token";
let now: number, town: Town, store: TownStore, sent: { guest: string; frame: Frame }[], reports: ReportRecord[];
const guest = "g_visitor", profile = { nickname: "等待者", energy: 1, preference: "listen" };
const frames = (id: string, type: string) => sent.filter(s => s.guest === id && s.frame.type === type).map(s => s.frame);
beforeEach(async () => {
  now = Date.UTC(2026,9,4); sent=[]; reports=[]; store=new TownStore(new MemoryKV()); let seq=0;
  town=new Town({store,now:()=>now,newId:()=>`id-${++seq}`,send:(guest,frame)=>sent.push({guest,frame}),config:DEFAULT_CONFIG,saveReport:async r=>void reports.push(r)});
  await town.connect(COMPANION_ID); await town.join(guest,profile,true);
});
async function offer() { await town.inviteCompanion(guest); return (await store.companionInvite())!; }
describe("human companion invitations", () => {
  test("only matches after explicit acceptance with server-labelled identity", async () => {
    const inv=await offer(); expect(await store.conversationIdOf(guest)).toBeNull(); expect(await store.listWaiting()).toHaveLength(1);
    await town.answerCompanion(guest,inv.id,true);
    expect(frames(guest,"lbt.matched")[0]?.partner).toMatchObject({nickname:"小辟穀",energy:2,preference:"story",role:"companion"});
    expect(await store.conversationIdOf(guest)).toBe(await store.conversationIdOf(COMPANION_ID));
  });
  test("female identity stays fixed across invite, acceptance and reconnect", async () => {
    await town.inviteCompanion(guest, "female");
    const inv = (await store.companionInvite())!;
    expect(frames(guest, "lbt.companion_invite")[0]?.nickname).toBe("打辟穀");
    await town.answerCompanion(guest, inv.id, true);
    await town.connect(guest);
    expect(frames(guest, "lbt.matched").at(-1)?.partner).toMatchObject({nickname:"打辟穀",energy:2,preference:"story",role:"companion"});
    expect(JSON.stringify(frames(guest, "lbt.matched").at(-1))).not.toContain('"admin"');
    await town.report(guest, "spam", "check");
    expect(reports[0]?.reportedProfile).toMatchObject({nickname:"打辟穀",role:"admin"});
  });
  test("rejects arbitrary identity values before creating an invitation", async () => {
    await expect(town.inviteCompanion(guest, "arbitrary nickname")).rejects.toThrow("invalid_companion_identity");
    expect(await store.companionInvite()).toBeNull();
  });
  test("another visitor cannot accept someone else's offer", async () => {
    const inv=await offer(); await expect(town.answerCompanion("g_other",inv.id,true)).rejects.toThrow("invite_unavailable");
    expect(await store.companionInvite()).toEqual(inv);
  });
  test("declining leaves the visitor in the ordinary queue and prevents immediate reinvitation", async () => {
    const inv=await offer(); await town.answerCompanion(guest,inv.id,false);
    expect(await store.companionInvite()).toBeNull(); expect(await store.conversationIdOf(guest)).toBeNull();
    expect((await store.listWaiting()).map(w=>w.guestId)).toEqual([guest]);
    await expect(town.inviteCompanion(guest)).rejects.toThrow("slow_down");
  });
  test("normal matching wins while an offer is pending", async () => {
    const inv=await offer(); await town.join("g_partner",{nickname:"訪客乙",energy:2,preference:"story"},true);
    expect(frames(guest,"lbt.matched")[0]?.partner).toMatchObject({nickname:"訪客乙"});
    expect(await store.companionInvite()).toBeNull(); expect(await store.conversationIdOf(COMPANION_ID)).toBeNull();
    await expect(town.answerCompanion(guest,inv.id,true)).rejects.toThrow("invite_unavailable");
  });
  test.each(["cancel","disconnect","leave"] as const)("visitor %s withdraws the offer", async op => {
    await offer(); await town[op](guest); expect(await store.companionInvite()).toBeNull();
  });
  test("admin disconnection withdraws the offer", async () => {
    const inv=await offer(); await town.disconnect(COMPANION_ID);
    await expect(town.answerCompanion(guest,inv.id,true)).rejects.toThrow("invite_unavailable");
  });
  test("expired offers cannot be accepted even before sweep", async () => {
    const inv=await offer(); now+=INVITE_MS;
    await expect(town.answerCompanion(guest,inv.id,true)).rejects.toThrow("invite_unavailable");
    expect(await store.conversationIdOf(guest)).toBeNull();
  });
  test("sweep expires offers", async () => { await offer(); now+=INVITE_MS; await town.sweep(); expect(await store.companionInvite()).toBeNull(); });
  test("only one pending offer or active conversation", async () => {
    const inv=await offer(); await expect(town.inviteCompanion(guest)).rejects.toThrow("companion_busy");
    await town.answerCompanion(guest,inv.id,true); await expect(town.inviteCompanion("g_other")).rejects.toThrow("companion_busy");
  });
  test("admin cannot auto-queue or intrude on a normal conversation", async () => {
    await expect(town.join(COMPANION_ID,profile,true)).rejects.toThrow("admin_cannot_queue");
    await town.join("g_partner",{nickname:"乙",energy:2,preference:"story"},true);
    await expect(town.inviteCompanion(guest)).rejects.toThrow("not_waiting");
  });
  test("guest-supplied admin role is discarded", async () => {
    await town.cancel(guest); await town.join(guest,{...profile,role:"admin"},true);
    expect((await store.listWaiting())[0]?.profile).not.toHaveProperty("role");
  });
  test("messages, mutual extension and leaving use ordinary session rules", async () => {
    const inv=await offer(); await town.answerCompanion(guest,inv.id,true);
    await town.sendMessage(COMPANION_ID,"管理員訊息"); await town.sendMessage(guest,"訪客回覆");
    expect(frames(guest,"lbt.message").at(-2)?.text).toBe("管理員訊息");
    expect(frames(COMPANION_ID,"lbt.message").at(-1)?.text).toBe("訪客回覆");
    await town.extend(COMPANION_ID); expect(frames(guest,"lbt.extended")).toHaveLength(0);
    await town.extend(guest); expect(frames(guest,"lbt.extended")).toHaveLength(1);
    await town.leave(COMPANION_ID); expect(frames(guest,"lbt.ended").at(-1)?.reason).toBe("partner_left");
  });
  test("reporting ends the chat and blocks further invites from that admin", async () => {
    const inv=await offer(); await town.answerCompanion(guest,inv.id,true); await town.report(guest,"other","測試");
    expect(reports[0]?.reportedProfile.role).toBe("admin"); await town.join(guest,profile,true);
    await expect(town.inviteCompanion(guest)).rejects.toThrow("pair_blocked");
  });
  test("reconnect replays pending invitation and administrator identity", async () => {
    const inv=await offer(); await town.connect(guest); expect(frames(guest,"lbt.companion_invite")).toHaveLength(2);
    await town.answerCompanion(guest,inv.id,true); await town.connect(guest);
    expect(frames(guest,"lbt.matched").at(-1)?.partner).toHaveProperty("role","companion");
  });
});
test("socket tickets are short lived, rotation-sensitive and separate from guest credentials", async () => {
  const secret="companion-test-key"; const ticket=await createCompanionToken(secret,now); const visitor=await createGuestToken(secret,guest,now,1);
  expect(await verifyCompanionToken(secret,ticket.token,now)).toBe(true);
  expect(await verifyCompanionToken(secret,visitor.token,now)).toBe(false);
  expect(await verifyGuestToken(secret,ticket.token,now)).toBeNull();
  expect(await verifyCompanionToken(secret,ticket.token,now+300000)).toBe(false);
  expect(await verifyCompanionToken("rotated",ticket.token,now)).toBe(false);
});
