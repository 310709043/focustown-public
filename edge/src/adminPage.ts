/**
 * The LowBatteryTown admin console, served by this Worker at /admin.
 *
 * One self-contained page: sign in with ADMIN_TOKEN (kept in sessionStorage
 * for the tab only), see live numbers, read reports with their transcripts
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
button,input{font:inherit;color:inherit}
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
@media (max-width:600px){.people{grid-template-columns:1fr}}
${COMPANION_STYLE}
`;

const SCRIPT = `
"use strict";
const KEY = "lbt.admin.token";
const REASONS = {harassment:"騷擾",sexual:"性相關內容",minor:"疑似未成年",spam:"廣告／詐騙",self_harm:"自傷風險",other:"其他"};
const STATUSES = {open:"待處理",reviewed:"已檢視",actioned:"已處理",dismissed:"駁回"};
const ENERGY = {1:"快沒電了",2:"還有一點",3:"想說說話"};
const PREF = {casual:"隨意聊聊",listen:"有人聽我說",story:"聽聽別人的故事"};
const app = document.getElementById("app");
let filter = "open";

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
const token = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const fmt = (iso) => new Date(iso).toLocaleString("zh-TW", {timeZone:"Asia/Taipei", hour12:false});

async function api(path, opts) {
  const res = await fetch(path, {...opts, headers: {"Authorization": "Bearer " + token(), "Content-Type": "application/json"}});
  if (res.status === 401) { signOut("管理密碼不正確或已失效。"); throw new Error("unauthorized"); }
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.status === 204 ? null : res.json();
}

function signOut(message) {
  stopCompanion();
  try { sessionStorage.removeItem(KEY); } catch {}
  showLogin(message || "");
}

function showLogin(message) {
  const input = el("input", {type:"password", placeholder:"管理密碼（ADMIN_TOKEN）", autocomplete:"current-password", "aria-label":"管理密碼"});
  const err = el("p", {class:"err", role:"alert", text: message});
  const form = el("form", {class:"login"},
    el("h1", {}, "LowBattery", el("span", {text:"Town"}), " 後台"),
    input, el("button", {class:"btn primary", type:"submit", text:"登入"}), err);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    try { sessionStorage.setItem(KEY, input.value.trim()); } catch {}
    try { await render(); } catch {}
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
    chat, actions);
}

async function render() {
  if (!token()) return showLogin("");
  const [o, list] = await Promise.all([
    api("/api/v1/admin/lbt/overview"),
    api("/api/v1/admin/lbt/reports?limit=100&status=" + (filter === "all" ? "all" : filter)),
  ]);
  const tabs = el("div", {class:"tabs", role:"group", "aria-label":"依狀態篩選"});
  for (const [s, label] of [...Object.entries(STATUSES), ["all", "全部"]]) {
    tabs.append(el("button", {class:"btn", type:"button", "aria-pressed": String(s === filter),
      text: label + (s !== "all" ? "（" + o.reports.byStatus[s] + "）" : ""),
      onclick: () => { filter = s; render(); }}));
  }
  const reports = el("section", {"aria-label":"檢舉"});
  if (!list.items.length) reports.append(el("p", {class:"empty", text:"沒有符合的檢舉。"}));
  for (const r of list.items) reports.append(reportCard(r));
  const active = document.activeElement;
  app.replaceChildren(
    el("header", {},
      el("h1", {}, "LowBattery", el("span", {text:"Town"}), " 後台"),
      el("div", {class:"actions"},
        el("button", {class:"btn", type:"button", text:"重新整理", onclick: () => render()}),
        el("button", {class:"btn", type:"button", text:"登出", onclick: () => signOut()}))),
    el("div", {class:"stats"},
      stat("目前在線", o.online), stat("等待配對", o.waiting), stat("進行中的對話", o.conversations),
      stat("待處理檢舉", o.reports.byStatus.open, o.reports.byStatus.open > 0), stat("24 小時內新檢舉", o.reports.last24h)),
    el("p", {class:"meta", text: (o.open ? "小鎮開放中" : "小鎮休息中") + (o.hours ? "（" + o.hours + "）" : "（全天開放）") + " · 更新於 " + fmt(new Date().toISOString())}),
    getCompanionPanel(), el("h2", {text:"檢舉"}), tabs, reports);
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
  };
}
