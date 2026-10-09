/**
 * The LowBatteryTown admin console, served by this Worker at /admin.
 *
 * One self-contained page: exchange ADMIN_TOKEN for an HttpOnly session cookie,
 * see live numbers and reports with their transcripts
 * and set their status. Report content is user-written, so the script
 * builds every node with textContent and never uses innerHTML; the CSP
 * allows only this page's own nonce'd script and style.
 */

import { COMPANION_SCRIPT, COMPANION_STYLE } from "./adminCompanion";

const STYLE = `
:root{--night:#141c31;--night2:#1c2944;--night3:#253554;--line:rgba(211,222,242,.15);--paper:#f9f4eb;
--mist:#bdc8dc;--subtle:#8291ae;--lamp:#f8d779;--peach:#f4b49d;--mint:#b6d6c4;--red:#f08c8c}
*{box-sizing:border-box;margin:0}
body{background:var(--night);color:var(--paper);font:15px/1.6 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif}
button,input,select,textarea{font:inherit;color:inherit}
.review{display:grid;gap:8px;margin-top:16px;border-top:1px solid var(--line);padding-top:12px}
.review select,.review textarea{background:var(--night);border:1px solid var(--line);border-radius:8px;padding:8px}
.review textarea{width:100%;resize:vertical}
.review-history{margin-top:12px;display:grid;gap:6px}
.wrap{max-width:980px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line)}
h1{font-size:20px;letter-spacing:-.01em}h1 span{color:var(--peach)}
h2{font-size:16px;margin:28px 0 12px;color:var(--lamp)}
.btn{background:var(--night3);border:1px solid var(--line);border-radius:10px;padding:7px 14px;cursor:pointer}
.btn:hover{border-color:var(--mist)}.btn.primary{background:var(--lamp);color:var(--night);border-color:var(--lamp);font-weight:700}
.btn[aria-pressed=true]{background:var(--paper);color:var(--night);font-weight:700}
.login{max-width:380px;margin:12vh auto;display:grid;gap:12px;text-align:center}
.login input{background:var(--night2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.err{color:var(--red);min-height:1.4em}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:20px}
.stat{background:var(--night2);border:1px solid var(--line);border-radius:14px;padding:14px}
.stat b{display:block;font-size:28px;line-height:1.1}.stat small{color:var(--subtle)}
.stat.alert b{color:var(--peach)}
.tabs{display:flex;flex-wrap:wrap;gap:8px}
.report{background:var(--night2);border:1px solid var(--line);border-radius:16px;padding:16px;margin-top:14px}
.topics{display:grid;gap:8px;margin:12px 0 28px}.topic{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px}.topic.hidden{opacity:.5}.topic strong{flex:1 1 auto}section[aria-label="天空話題"] input{background:var(--night2);border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-width:min(420px,100%)}
.report-head{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between}
.reason{font-weight:700;color:var(--peach)}.meta{color:var(--subtle);font-size:13px}
.people{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}
.person{border:1px solid var(--line);border-radius:12px;padding:8px 10px;font-size:14px}
.person small{display:block;color:var(--subtle)}
.note{background:var(--night3);border-radius:10px;padding:8px 10px;margin:8px 0;white-space:pre-wrap}
.chat{display:grid;gap:6px;margin:12px 0;max-height:360px;overflow:auto;padding-right:4px}
.line{max-width:80%;padding:6px 10px;border-radius:12px;white-space:pre-wrap;word-break:break-word;font-size:14px}
.line small{display:block;font-size:11px;color:var(--subtle)}
.line.reporter{justify-self:end;background:var(--night3)}
.line.reported{justify-self:start;background:#3a2f3f;border:1px solid rgba(244,180,157,.35)}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.status{font-size:12px;border:1px solid var(--line);border-radius:999px;padding:2px 10px}
.empty{color:var(--subtle);padding:24px 0}
.stats+.meta{margin-top:10px}
.trend-chart{margin-top:12px;background:var(--night2);border:1px solid var(--line);border-radius:14px;padding:16px}
.trend-bars{display:flex;align-items:flex-end;gap:3px;height:84px}
.trend-bar{flex:1;min-width:4px;background:var(--lamp);border-radius:3px 3px 0 0;opacity:.85}
@media (max-width:600px){.people{grid-template-columns:1fr}}
${COMPANION_STYLE}
`;

const SCRIPT = `
"use strict";
try { sessionStorage.removeItem("lbt.admin.token"); } catch {}
let signedIn = true;
let sessionVersion = 0;
const REASONS = {harassment:"騷擾",sexual:"性相關內容",minor:"疑似未成年",spam:"廣告／詐騙",self_harm:"自傷風險",other:"其他"};
const STATUSES = {open:"待處理",reviewed:"已檢視",actioned:"已處理",dismissed:"駁回"};
const ENERGY = {1:"快沒電了",2:"還有一點",3:"想說說話"};
const PREF = {casual:"隨意聊聊",listen:"有人聽我說",story:"聽聽別人的故事"};
const app = document.getElementById("app");
let filter = "open";
let feedbackFilter = "new";
const FEEDBACK_STATUSES = {new:"未讀",read:"已讀",done:"已處理"};
const FEEDBACK_CATEGORIES = {idea:"建議",bug:"問題回報",other:"其他"};

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "onclick") n.addEventListener("click", v);
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) n.append(k);
  return n;
}
const token = () => signedIn;
const fmt = (iso) => new Date(iso).toLocaleString("zh-TW", {timeZone:"Asia/Taipei", hour12:false});

async function api(path, opts) {
  const version = sessionVersion;
  const res = await fetch(path, {...opts, credentials: "same-origin", headers: {"Content-Type": "application/json"}});
  // Dashboard requests run in parallel. Responses from an earlier session
  // must not clear the current login form or sign out a newly logged-in owner.
  if (version !== sessionVersion) throw new Error("stale_session");
  if (res.status === 401) { signOut("管理密碼不正確或已失效。"); throw new Error("unauthorized"); }
  if (!res.ok) { const body = await res.json().catch(() => null); throw new Error(body?.error?.code || "HTTP " + res.status); }
  return res.status === 204 ? null : res.json();
}

async function signOut(message) {
  if (!signedIn) return;
  signedIn = false;
  sessionVersion++;
  stopCompanion();
  app.replaceChildren(el("p", {class:"empty", text:"載入中…"}));
  // Finish clearing the old cookie before allowing a new login to set one.
  await fetch("/api/v1/admin/lbt/logout", {method:"POST", credentials:"same-origin",
    signal:AbortSignal.timeout(10000)}).catch(() => {});
  showLogin(message || "");
}

function showLogin(message) {
  const input = el("input", {type:"password", placeholder:"管理密碼（ADMIN_TOKEN）", autocomplete:"current-password", "aria-label":"管理密碼"});
  const err = el("p", {class:"err", role:"alert", text: message});
  const submit = el("button", {class:"btn primary", type:"submit", text:"登入"});
  const form = el("form", {class:"login"},
    el("h1", {}, "LowBattery", el("span", {text:"Town"}), " 後台"),
    input, submit, err);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submit.disabled || !input.value.trim()) return;
    submit.disabled = true;
    const version = ++sessionVersion;
    const password = input.value;
    input.value = "";
    try {
      const res = await fetch("/api/v1/admin/lbt/login", {method:"POST", credentials:"same-origin",
        headers:{"Content-Type":"application/json"}, body:JSON.stringify({password})});
      if (version !== sessionVersion) return;
      if (!res.ok) { err.textContent = res.status === 429 ? "登入嘗試太多，請十五分鐘後再試。" : "管理密碼不正確或暫時無法登入。"; return; }
      signedIn = true;
      await render();
    } catch { err.textContent = "無法連線，請稍後再試。"; }
    finally { submit.disabled = false; }
  });
  app.replaceChildren(form);
  input.focus();
}

function stat(label, value, alert) {
  return el("div", {class: "stat" + (alert ? " alert" : "")}, el("b", {text: String(value)}), el("small", {text: label}));
}

function person(label, p) {
  return el("div", {class:"person"}, el("small", {text: label}),
    el("strong", {text: p.nickname || "?"}), " · " + (ENERGY[p.energy] || p.energy) + " · " + (PREF[p.preference] || p.preference));
}

function reviewForm(r) {
  const prefix = "review-" + r.id;
  const reason = el("textarea", {id:prefix+"-reason", rows:"2", maxlength:"500", required:"", "aria-label":"處理原因", autocomplete:"off"});
  const days = el("select", {id:prefix+"-days", "aria-label":"暫停期限"},
    el("option", {value:"1", text:"24 小時"}), el("option", {value:"7", text:"7 天"}));
  const submit = el("button", {class:"btn primary", type:"submit", "data-action":"suspend", text:"審查後暫停配對"});
  const revoke = el("button", {class:"btn", type:"submit", "data-action":"revoke", text:"解除暫停配對"});
  const error = el("p", {class:"err", role:"alert"});
  const current = r.suspension_expires_at
    ? "目前暫停至 " + fmt(r.suspension_expires_at) + "；原因：" + r.suspension_reason
    : "目前沒有生效中的暫停配對。";
  const form = el("form", {class:"review"},
    el("strong", {text:"審查處置"}), el("p", {class:"meta", text:current}),
    el("p", {class:"meta", text:"請先查看訊息證據。只限制此匿名訪客代碼；換瀏覽器或重新取得代碼可能繞過。標記狀態不等於停權。"}),
    el("label", {for:prefix+"-days", text:"暫停期限"}), days,
    el("label", {for:prefix+"-reason", text:"處理原因（暫停或解除均必填）"}), reason,
    el("div", {class:"actions"}, submit, ...(r.suspension_report_id === r.id ? [revoke] : [])), error);
  let busy = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!reason.value.trim()) { error.textContent = "請填寫處理原因。"; reason.focus(); return; }
    busy = true; submit.disabled = true; revoke.disabled = true; error.textContent = "";
    const action = event.submitter?.dataset.action || "suspend";
    try {
      await api("/api/v1/admin/lbt/reports/" + encodeURIComponent(r.id) + "/moderation", {
        method:"POST", body:JSON.stringify({action, days:Number(days.value), reason:reason.value.trim()})});
      if (filter !== "all") filter = "actioned";
      await render();
    } catch (err) { error.textContent = err.message === "report_expires_too_soon" ? "檢舉即將到資料保留期限，請選較短限制；限制不能超過證據保留期限。" : "處置未完成，請重新整理確認目前限制及紀錄後再試。"; }
    finally { busy = false; submit.disabled = false; revoke.disabled = false; }
  });
  const labels = {suspend:"暫停配對",revoke:"解除限制",status:"狀態更新"};
  const history = el("div", {class:"review-history", "aria-label":"處理歷程"}, el("strong", {text:"最近的處理歷程（最多 50 筆）"}));
  for (const a of r.actions || []) history.append(el("p", {class:"meta", text:
    fmt(a.created_at) + " · " + (labels[a.action] || a.action) + " · " + (STATUSES[a.status] || a.status) +
    (a.expires_at ? " · 到期 " + fmt(a.expires_at) : "") + (a.reason ? " · " + a.reason : "") }));
  if (!r.actions?.length) history.append(el("p", {class:"meta", text:"尚無處理紀錄。"}));
  return el("div", {}, form, history);
}

function reportCard(r) {
  const chat = el("div", {class:"chat", "aria-label":"對話紀錄"});
  if (!r.transcript.length) chat.append(el("p", {class:"meta", text:"（這段對話沒有訊息）"}));
  for (const line of r.transcript) {
    chat.append(el("div", {class: "line " + line.from},
      el("small", {text: (line.from === "reporter" ? "檢舉人" : "被檢舉人") + " · " + fmt(line.at)}), line.text));
  }
  const actions = el("div", {class:"actions"}, el("span", {class:"status", text: STATUSES[r.status] || r.status}));
  for (const [s, label] of Object.entries(STATUSES)) {
    if (s === r.status) continue;
    actions.append(el("button", {class:"btn", type:"button", text: "標為「" + label + "」", onclick: async () => {
      await api("/api/v1/admin/lbt/reports/" + encodeURIComponent(r.id) + "/status", {method:"POST", body: JSON.stringify({status: s})});
      await render();
    }}));
  }
  return el("article", {class:"report"},
    el("div", {class:"report-head"},
      el("span", {class:"reason", text: REASONS[r.reason] || r.reason}),
      el("span", {class:"meta", text: fmt(r.created_at) + " · 檢舉 " + r.id.slice(0, 8)})),
    el("div", {class:"people"}, person("檢舉人", r.reporter_profile), person("被檢舉人", r.reported_profile)),
    r.note ? el("p", {class:"note", text: "補充說明：" + r.note}) : "",
    chat, actions, reviewForm(r));
}

function feedbackCard(f) {
  const actions = el("div", {class:"actions"}, el("span", {class:"status", text: FEEDBACK_STATUSES[f.status] || f.status}));
  for (const [s, label] of Object.entries(FEEDBACK_STATUSES)) {
    if (s === f.status) continue;
    actions.append(el("button", {class:"btn", type:"button", text: "標為「" + label + "」", onclick: async () => {
      await api("/api/v1/admin/lbt/feedback/" + encodeURIComponent(f.id) + "/status", {method:"POST", body: JSON.stringify({status: s})});
      await render();
    }}));
  }
  const meta = fmt(f.created_at) + (f.page ? " · " + f.page : "") + (f.sheet_sent ? " · 已寫入試算表" : "");
  return el("article", {class:"report"},
    el("div", {class:"report-head"},
      el("span", {class:"reason", text: FEEDBACK_CATEGORIES[f.category] || f.category}),
      el("span", {class:"meta", text: meta})),
    el("p", {class:"note", text: f.message}),
    f.email ? el("p", {class:"meta", text: "回覆信箱：" + f.email}) : "",
    actions);
}

function trendsSection(items) {
  const max = Math.max(1, ...items.map((d) => d.conversations));
  const total = items.reduce((t, d) => ({ c: t.c + d.conversations, r: t.r + d.reports, f: t.f + d.feedback }), { c: 0, r: 0, f: 0 });
  const bars = el("div", {class:"trend-bars", "aria-hidden":"true"});
  for (const d of items) {
    bars.append(el("div", {class:"trend-bar", style:"height:" + Math.max(3, Math.round((d.conversations / max) * 100)) + "%",
      title: d.date.slice(5) + "：對話 " + d.conversations + "　檢舉 " + d.reports + "　意見 " + d.feedback}));
  }
  return el("section", {"aria-label":"使用趨勢"},
    el("h2", {text:"使用趨勢（近 30 天 · UTC）"}),
    el("div", {class:"stats"},
      stat("30 天對話", total.c), stat("30 天檢舉", total.r, total.r > 0), stat("30 天意見", total.f)),
    el("div", {class:"trend-chart"}, bars),
    el("p", {class:"meta", text:"每一長條是一天的對話數（滑過看當日檢舉／意見）。"}));
}

let topicDraft = "";
function topicsSection(items) {
  const list = el("div", {class:"topics"});
  if (!items.length) list.append(el("p", {class:"empty", text:"還沒有話題：首頁會顯示小鎮內建的日常話題。"}));
  for (const t of items) {
    const row = el("div", {class:"topic" + (t.hidden ? " hidden" : "")},
      el("span", {class:"reason", text: t.source === "manual" ? "手動" : "熱搜 " + t.day.slice(5) + (t.prompt ? "「" + t.word + "」" : "")}),
      el("strong", {text: t.prompt || t.word}),
      el("button", {class:"btn", type:"button", text: t.hidden ? "重新顯示" : "隱藏", onclick: async () => {
        await api("/api/v1/admin/lbt/topics/" + encodeURIComponent(t.id) + "/hidden", {method:"POST", body: JSON.stringify({hidden: !t.hidden})});
        await render();
      }}));
    if (t.source === "manual") row.append(el("button", {class:"btn", type:"button", text:"刪除", onclick: async () => {
      await api("/api/v1/admin/lbt/topics/" + encodeURIComponent(t.id), {method:"DELETE"});
      await render();
    }}));
    list.append(row);
  }
  const input = el("input", {type:"text", maxlength:"28", placeholder:"例如 Threads 上大家在聊的議題，寫成一句問句（28 字內）", "aria-label":"新增話題", value: topicDraft});
  input.addEventListener("input", () => { topicDraft = input.value; });
  const note = el("p", {class:"meta", role:"status"});
  const add = el("button", {class:"btn primary", type:"button", text:"新增", onclick: async () => {
    try {
      await api("/api/v1/admin/lbt/topics", {method:"POST", body: JSON.stringify({word: topicDraft})});
      topicDraft = "";
      await render();
    } catch { note.textContent = "沒辦法新增：請確認是 1–28 字、不含連結或帳號。"; }
  }});
  const refresh = el("button", {class:"btn", type:"button", text:"立即抓取熱搜", onclick: async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { const r = await api("/api/v1/admin/lbt/topics/refresh", {method:"POST"}); note.textContent = "抓到 " + r.stored + " 個熱搜。"; await render(); }
    catch { note.textContent = "現在抓不到熱搜，稍後再試；首頁會先用手動與內建話題。"; btn.disabled = false; }
  }});
  return el("section", {"aria-label":"天空話題"},
    el("h2", {text:"天空話題"}),
    el("p", {class:"meta", text:"首頁天空會輪流帶著這些話題飛過（清晨熱氣球、白天飛機、傍晚風箏、夜晚霓虹招牌）。熱搜每天 03:17 自動更新：先過濾沉重字詞，再由 Workers AI 改寫成好開口的問句（沉重或政治的會跳過）。任何一則都可以隱藏。"}),
    el("div", {class:"actions"}, input, add, refresh), note, list);
}

async function render() {
  if (!token()) return showLogin("");
  const version = sessionVersion;
  const [o, list, fb, trends, topics] = await Promise.all([
    api("/api/v1/admin/lbt/overview"),
    api("/api/v1/admin/lbt/reports?limit=100&status=" + (filter === "all" ? "all" : filter)),
    api("/api/v1/admin/lbt/feedback?limit=100&status=" + feedbackFilter),
    api("/api/v1/admin/lbt/trends?days=30"),
    api("/api/v1/admin/lbt/topics"),
  ]);
  if (!signedIn || version !== sessionVersion) return;
  const tabs = el("div", {class:"tabs", role:"group", "aria-label":"依狀態篩選"});
  for (const [s, label] of [...Object.entries(STATUSES), ["all", "全部"]]) {
    tabs.append(el("button", {class:"btn", type:"button", "aria-pressed": String(s === filter),
      text: label + (s !== "all" ? "（" + o.reports.byStatus[s] + "）" : ""),
      onclick: () => { filter = s; render(); }}));
  }
  const reports = el("section", {"aria-label":"檢舉"});
  if (!list.items.length) reports.append(el("p", {class:"empty", text:"沒有符合的檢舉。"}));
  for (const r of list.items) reports.append(reportCard(r));
  const fbTabs = el("div", {class:"tabs", role:"group", "aria-label":"依意見狀態篩選"});
  for (const [s, label] of [...Object.entries(FEEDBACK_STATUSES), ["all", "全部"]]) {
    fbTabs.append(el("button", {class:"btn", type:"button", "aria-pressed": String(s === feedbackFilter),
      text: label + (s !== "all" ? "（" + o.feedback.byStatus[s] + "）" : ""),
      onclick: () => { feedbackFilter = s; render(); }}));
  }
  const feedback = el("section", {"aria-label":"意見箱"});
  if (!fb.items.length) feedback.append(el("p", {class:"empty", text:"沒有符合的意見。"}));
  for (const f of fb.items) feedback.append(feedbackCard(f));
  const active = document.activeElement;
  app.replaceChildren(
    el("header", {},
      el("h1", {}, "LowBattery", el("span", {text:"Town"}), " 後台"),
      el("div", {class:"actions"},
        el("button", {class: "btn" + (o.maintenance ? " primary" : ""), type:"button",
          text: o.maintenance ? "▶ 恢復配對" : "⏸ 暫停配對",
          onclick: async (event) => {
            const btn = event.currentTarget; btn.disabled = true;
            try {
              await api("/api/v1/admin/lbt/maintenance", {method:"POST", body: JSON.stringify({paused: !o.maintenance})});
              await render();
            } catch { btn.disabled = false; }
          }}),
        el("button", {class:"btn", type:"button", text:"重新整理", onclick: () => render()}),
        el("button", {class:"btn", type:"button", text:"登出", onclick: () => signOut()}))),
    el("div", {class:"stats"},
      stat("目前在線", o.online), stat("等待配對", o.waiting), stat("進行中的對話", o.conversations),
      stat("待處理檢舉", o.reports.byStatus.open, o.reports.byStatus.open > 0), stat("24 小時內新檢舉", o.reports.last24h),
      stat("未讀意見", o.feedback.byStatus.new, o.feedback.byStatus.new > 0)),
    el("p", {class:"meta", text: (o.maintenance ? "⏸ 維護模式：已暫停配對" : (o.open ? "小鎮開放中" : "小鎮休息中")) + (o.hours ? "（" + o.hours + "）" : "（全天開放）") + " · 更新於 " + fmt(new Date().toISOString())}),
    trendsSection(trends.items),
    topicsSection(topics.items),
    getCompanionPanel(), el("h2", {text:"檢舉"}), tabs, reports,
    el("h2", {text:"意見箱"}), fbTabs, feedback);
  if (active && getCompanionPanel().contains(active)) active.focus({preventScroll:true});
}

${COMPANION_SCRIPT}

render().catch(() => {});
setInterval(() => { if (token() && !document.hidden) render().catch(() => {}); }, 30000);
`;

export function adminPage(nonce: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="data:,">
<title>LowBatteryTown 後台</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main class="wrap" id="app"><p class="empty">載入中…</p></main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function adminPageHeaders(nonce: string, origin = "https://api.lowbatterytown.com"): Record<string, string> {
  const socketOrigin = origin.replace(/^http/, "ws");
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      `connect-src 'self' ${socketOrigin}`,
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
