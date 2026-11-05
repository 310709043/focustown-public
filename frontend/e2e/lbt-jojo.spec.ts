import { expect, test } from "@playwright/test";

// Browser contract fixture only. Production never receives these scripted replies.
// Server consent, timing, isolation and deletion are exercised in edge/test/jojo.test.ts.
for (const [name, width, height] of [["desktop", 1440, 900], ["phone", 390, 844]] as const) {
  test(name + ": AI invitation requires a choice and remains disclosed in chat", async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const now = Date.now();
    await page.clock.install({ time: new Date(now) });
    const frames: Record<string, unknown>[] = [];
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    await page.route("**/api/v1/lbt/guest", route => route.fulfill({ json: { guest_id: "contract-visitor", token: "contract-fixture-not-a-secret", expires_at: new Date(now + 86400000).toISOString() }, headers }));
    await page.route("**/api/v1/lbt/status", route => route.fulfill({ json: { online: 1, waiting: 0, open: true, hours: "" }, headers }));
    await page.routeWebSocket("**/api/v1/lbt/ws", ws => {
      const send = (frame: Record<string, unknown>) => ws.send(JSON.stringify(frame));
      ws.onMessage(message => {
        const frame = JSON.parse(String(message)) as Record<string, unknown>;
        frames.push(frame);
        if (frame.type === "join") send({ type: "lbt.waiting", since: new Date(now).toISOString(), server_now: new Date(now).toISOString(), jojo_available_at: new Date(now + 180000).toISOString() });
        if (frame.type === "jojo_start") {
          send({ type: "lbt.matched", conversation_id: "contract-only", me: { nickname: "範例訪客", energy: 1, preference: "casual" }, partner: { nickname: "小jojo（AI）", energy: 3, preference: "casual", role: "ai" }, server_now: new Date(now + 180000).toISOString(), ends_at: new Date(now + 600000).toISOString(), grace_seconds: 60 });
          send({ type: "lbt.message", id: "opening", from: "partner", text: "我是小jojo，小鎮的 AI 居民。想隨便聊，還是讓我逗你一下？" });
        }
        if (frame.type === "message") {
          send({ type: "lbt.message", id: "sent", from: "me", text: frame.text });
          send({ type: "lbt.message", id: "reply", from: "partner", text: "好，那我有點想跟你熟了 😏" });
        }
        if (frame.type === "leave") send({ type: "lbt.ended", reason: "left" });
      });
    });
    await page.goto("/zh-TW?time=night&week=weekday");
    await page.getByRole("textbox", { name: /這次想叫什麼/ }).fill("範例訪客");
    await page.getByRole("checkbox", { name: /我已年滿 18 歲/ }).check();
    await page.getByRole("button", { name: /走進小鎮/ }).click();
    await expect(page.locator(".waiting-view")).toBeVisible();
    await expect(page.getByRole("button", { name: /我知道是 AI/ })).toHaveCount(0);
    await page.clock.fastForward(180001);
    await expect(page.getByRole("button", { name: /我知道是 AI/ })).toBeVisible();
    expect(frames.some(f => f.type === "jojo_start")).toBe(false);
    await page.screenshot({ path: info.outputPath("jojo-offer-" + name + ".png"), animations: "disabled" });
    await page.getByRole("button", { name: /我知道是 AI/ }).click();
    await expect(page.locator(".partner-profile")).toContainText("小jojo（AI）");
    await expect(page.locator(".companion-disclosure")).toContainText("AI 虛構角色");
    expect(frames.find(f => f.type === "jojo_start")?.consent).toBe(true);
    await page.getByLabel("輸入訊息", { exact: true }).fill("熟了就不乖了");
    await page.getByRole("button", { name: "送出訊息", exact: true }).click();
    await expect(page.locator(".message.other .bubble").last()).toHaveText("好，那我有點想跟你熟了 😏");
    expect(await page.locator(".lbt").evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    await page.screenshot({ path: info.outputPath("jojo-chat-" + name + ".png"), animations: "disabled" });
    await page.getByRole("button", { name: /說聲晚安/ }).click();
    await expect(page.locator(".message, .partner-profile")).toHaveCount(0);
  });
}
