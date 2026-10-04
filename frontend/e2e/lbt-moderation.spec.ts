import { expect, test, type Page } from "@playwright/test";
const password = process.env.PLAYWRIGHT_COMPANION_ADMIN_TOKEN;
const api = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://localhost:8789";
test.skip(!password || !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(api), "local review data only; never create production reports");
test.use({ trace:"off",video:"off",screenshot:"off" });
async function join(page:Page,name:string){
  await page.goto("/zh-TW");
  await page.getByRole("textbox",{name:/這次想叫什麼/}).fill(name);
  await page.getByRole("checkbox",{name:/我已年滿 18 歲/}).check();
  await page.getByRole("button",{name:/走進小鎮/}).click();
}
test("reviewer suspends a code, ends its new chat, records the decision, then revokes",async({browser})=>{
  const contexts=await Promise.all([0,1,2,3].map(()=>browser.newContext()));
  const [a,b,c,admin]=await Promise.all(contexts.map(ctx=>ctx.newPage()));
  const evidence="本機審查驗收 "+crypto.randomUUID().replace(/[0-9-]/g, "");
  try{
    await join(a,"審查甲");await join(b,"審查乙");
    await expect(a.locator(".partner-profile")).toContainText("審查乙");
    await b.getByLabel("輸入訊息",{exact:true}).fill(evidence);
    await b.getByRole("button",{name:"送出訊息",exact:true}).click();
    await expect(a.locator(".message.other")).toContainText(evidence);
    await a.getByRole("button",{name:"檢舉對話",exact:true}).click();
    await a.getByRole("dialog").getByRole("button",{name:"送出檢舉",exact:true}).click();
    await expect(a.getByRole("dialog")).toContainText("謝謝你留意小鎮的安全");
    await a.getByRole("dialog").getByRole("button",{name:"知道了",exact:true}).click();
    await expect(b.locator(".end-view")).toBeVisible();
    await b.getByRole("button",{name:/再遇見一個人/}).click();
    await join(c,"審查丙");await expect(b.locator(".partner-profile")).toContainText("審查丙");
    await admin.goto(`${api}/admin`);
    await admin.getByLabel("管理密碼",{exact:true}).fill(password!);
    await admin.getByRole("button",{name:"登入",exact:true}).click();
    const card=admin.locator("article.report").filter({hasText:evidence});
    await card.getByLabel("處理原因",{exact:true}).fill("已查看訊息證據，本機驗收");
    await card.getByLabel("暫停期限",{exact:true}).selectOption("7");
    await card.getByRole("button",{name:"審查後暫停配對",exact:true}).click();
    await expect(b.locator(".end-view")).toContainText("配對已被暫停");
    await expect(c.locator(".end-view")).toBeVisible();
    await expect(b.locator(".message,.partner-profile")).toHaveCount(0);
    await expect(card).toContainText("目前暫停至");
    await expect(card.getByLabel("處理歷程",{exact:true})).toContainText("已查看訊息證據，本機驗收");
    await b.getByRole("button",{name:/再遇見一個人/}).click();
    await expect(b.locator(".lbt-notice")).toContainText("已暫停配對");
    await expect(b.locator(".waiting-view,.chat-view")).toHaveCount(0);
    await card.getByLabel("處理原因",{exact:true}).fill("重新審查後解除，本機驗收");
    await card.getByRole("button",{name:"解除暫停配對",exact:true}).click();
    await expect(card).toContainText("目前沒有生效中的暫停配對");
    await expect(card.getByLabel("處理歷程",{exact:true})).toContainText("重新審查後解除");
    await b.getByRole("button",{name:/走進小鎮/}).click();
    await c.getByRole("button",{name:/再遇見一個人/}).click();
    await expect(b.locator(".partner-profile")).toContainText("審查丙");
    await b.getByRole("button",{name:/說聲晚安/}).click();
  }finally{await Promise.allSettled(contexts.map(ctx=>ctx.close()));}
});
