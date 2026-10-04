import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { activeSuspensions, moderateReport, purgeExpiredSuspensions } from "../src/moderation";
import { listReports, purgeReports, setReportStatus } from "../src/reports";
beforeEach(async () => { await env.DB.exec("DELETE FROM lbt_reports WHERE id IN ('review','first','second');"); });
const NOW = Date.UTC(2026,9,4);
const AUTH = {Authorization:"Bearer admin-test-token","Content-Type":"application/json"};
async function report(id="review") {
  await env.DB.prepare(`INSERT INTO lbt_reports (id,conversation_id,reporter_guest_id,reported_guest_id,reason,
    transcript,reporter_profile,reported_profile,status,created_at) VALUES (?,'chat','g_reporter','g_reported','spam','[]','{}','{}','open',?)`)
    .bind(id,new Date(NOW).toISOString()).run();
}
const suspend = {action:"suspend",days:1,reason:"reviewed evidence"};
test("review endpoint requires admin and validates missing reports and reasons", async()=>{
  await report();
  for(const [id,auth,body,status] of [["review",false,suspend,401],["missing",true,suspend,404],["review",true,{...suspend,reason:""},422]] as const){
    const res=await SELF.fetch(`https://api.lowbatterytown.com/api/v1/admin/lbt/reports/${id}/moderation`,{method:"POST",headers:auth?AUTH:{},body:JSON.stringify(body)});
    expect(res.status).toBe(status);
  }
});
test.each([{...suspend,reason:""},{...suspend,reason:" "},{...suspend,reason:"x".repeat(501)}, {...suspend,days:2},{...suspend,days:"7"},{...suspend,action:"permanent"}])("invalid review makes no change: %j",async body=>{
  await report();await expect(moderateReport(env.DB,"review",body,NOW)).rejects.toThrow();
  expect(await activeSuspensions(env.DB,NOW)).toEqual([]);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM lbt_moderation_actions").first<{n:number}>())?.n).toBe(0);
});
test("save and revoke record history and act only on the server's reported guest",async()=>{
  await report();const result=await moderateReport(env.DB,"review",{...suspend,days:7,guest_id:"forged",actor:"forged"},NOW);
  expect(result).toMatchObject({guestId:"g_reported",expiresAt:new Date(NOW+7*86400000).toISOString()});
  await moderateReport(env.DB,"review",{action:"revoke",reason:"review corrected"},NOW+1000);
  expect(await activeSuspensions(env.DB,NOW+1000)).toEqual([]);
  const rows=await env.DB.prepare("SELECT action,reason,actor FROM lbt_moderation_actions ORDER BY rowid").all();
  expect(rows.results).toEqual([{action:"suspend",reason:"reviewed evidence",actor:"admin"},{action:"revoke",reason:"review corrected",actor:"admin"}]);
});
test("later reviews cannot shorten a restriction or revoke a newer review through an old report",async()=>{
  await report("first");await report("second");
  await moderateReport(env.DB,"first",{...suspend,days:7},NOW);
  await moderateReport(env.DB,"second",suspend,NOW+1000);
  expect((await activeSuspensions(env.DB,NOW))[0]?.expires_at).toBe(new Date(NOW+7*86400000).toISOString());
  await expect(moderateReport(env.DB,"first",{action:"revoke",reason:"old review"},NOW+2000)).rejects.toThrow("no_active_suspension");
});
test("expiry removes the restriction; report purge removes its history",async()=>{
  await report();await moderateReport(env.DB,"review",suspend,NOW);
  expect(await activeSuspensions(env.DB,NOW+86400000)).toEqual([]);
  await purgeExpiredSuspensions(env.DB,NOW+86400000);
  expect((await env.DB.prepare("SELECT count(*) AS n FROM lbt_moderation_actions").first<{n:number}>())?.n).toBe(1);
  await purgeReports(env.DB,new Date(NOW+181*86400000).toISOString());
  expect((await env.DB.prepare("SELECT count(*) AS n FROM lbt_moderation_actions").first<{n:number}>())?.n).toBe(0);
});
test("audit failure rolls back the restriction and report status",async()=>{
  await report();await env.DB.exec("CREATE TRIGGER fail_review BEFORE INSERT ON lbt_moderation_actions BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
  try{await expect(moderateReport(env.DB,"review",suspend,NOW)).rejects.toThrow();
    expect(await activeSuspensions(env.DB,NOW)).toEqual([]);
    expect((await env.DB.prepare("SELECT status FROM lbt_reports WHERE id='review'").first<{status:string}>())?.status).toBe("open");
  }finally{await env.DB.exec("DROP TRIGGER fail_review;");}
});
test("status changes are audited without suspending anyone",async()=>{
  await report();await setReportStatus(env.DB,"review","reviewed");
  expect(await activeSuspensions(env.DB,NOW)).toEqual([]);
  expect((await listReports(env.DB,null,10))[0]?.actions).toEqual([expect.objectContaining({action:"status",status:"reviewed",actor:"admin"})]);
});


test("a fresh Durable Object loads restrictions from D1 before accepting sockets",async()=>{
  await report();const now=Date.now();await moderateReport(env.DB,"review",suspend,now);
  const stub=env.TOWN.get(env.TOWN.idFromName("moderation-activation-test"));
  const res=await stub.fetch(new Request("https://api.lowbatterytown.com/socket",{headers:{Upgrade:"websocket","x-lbt-guest":"g_reported","x-lbt-ip":"test"}}));
  const ws=res.webSocket!;ws.accept();
  try {
    const frame=await new Promise<Record<string,unknown>>(resolve=>ws.addEventListener("message",event=>resolve(JSON.parse(String(event.data))),{once:true}));
    expect(frame).toMatchObject({type:"lbt.error",code:"guest_suspended"});
  }finally{ws.close(1000);}
});


test("a restriction cannot outlive its report evidence retention",async()=>{
  await report();await expect(moderateReport(env.DB,"review",{...suspend,days:7},NOW+174*86400000)).rejects.toThrow("report_expires_too_soon");
  expect(await activeSuspensions(env.DB,NOW+174*86400000)).toEqual([]);
});
