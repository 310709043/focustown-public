/** Inline console code; all visitor content is built with textContent via el(). */
export const COMPANION_STYLE = `
.companion{margin-top:24px;padding:20px;background:var(--night2);border:1px solid var(--line);border-radius:16px}
.companion h2{margin:0 0 8px}.companion .meta{margin-bottom:12px}
.companion button:disabled{opacity:.5;cursor:not-allowed}.companion button{min-height:44px}
.waiter{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding:12px 0}
.waiter p{overflow-wrap:anywhere}.companion-chat{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}
.companion-chat[hidden]{display:none}.companion-log{max-height:320px;min-height:80px;overflow:auto;margin:12px 0;display:grid;gap:8px}
.companion-line{padding:8px 12px;border-radius:10px;background:var(--night3);white-space:pre-wrap;overflow-wrap:anywhere}
.companion-line.partner{border-left:3px solid var(--peach)}.companion-line small{display:block;color:var(--subtle)}
.companion-composer{display:flex;flex-wrap:wrap;gap:8px}.companion-composer label{width:100%}
.companion-composer input{flex:1;min-width:160px;padding:10px;background:var(--night);border:1px solid var(--line);border-radius:10px}
.companion-composer input:disabled{opacity:.6}.companion .err{margin-top:8px}
@media(max-width:600px){.waiter{align-items:flex-start;flex-direction:column}.companion{padding:14px}}
`;

export const COMPANION_SCRIPT = String.raw`
let companionPanel, companionSocket, companionTimer, companionReconnect;
let onDuty = false, companionConnecting = false, companionPending = null, companionSession = null;
let companionEndsAt = 0, companionGrace = 60, companionMine = false, companionOther = false;
let companionLog, companionWaiting, companionStatus, companionError, companionDraft, companionSubmit;
let companionChat, companionTitle, companionClock, companionExtend, dutyButton, companionCancel;
const companionMessages = new Set();
const COMPANION_ERRORS = {
  companion_busy:"請先結束目前的邀請或對話。", not_waiting:"這位使用者已離開等待區。",
  pair_blocked:"這位使用者暫時無法與管理員配對。", slow_down:"請稍等，避免重複邀請或傳訊。",
  time_up:"時間到了，雙方同意延長後才能繼續傳訊。", too_late:"這段對話已結束。",
  no_conversation:"目前沒有進行中的陪聊。", closed:"小鎮目前休息中。"
};
function companionSend(frame) {
  if (!companionSocket || companionSocket.readyState !== WebSocket.OPEN) {
    companionError.textContent = "陪聊連線尚未就緒，請稍等或重新開始值班。";
    return false;
  }
  companionSocket.send(JSON.stringify(frame));
  return true;
}
function companionReset() {
  companionSession = null; companionPending = null; companionMine = false; companionOther = false;
  companionMessages.clear(); companionLog.replaceChildren(); companionChat.hidden = true;
  companionDraft.value = "";
}
function stopCompanion() {
  onDuty = false; clearTimeout(companionReconnect); clearInterval(companionTimer);
  if (companionSocket?.readyState === WebSocket.OPEN) companionSocket.send(JSON.stringify({type:"leave"}));
  companionSocket?.close(1000); companionSocket = null;
  companionConnecting = false;
  if (companionPanel) { companionReset(); companionStatus.textContent = "尚未值班。開始值班後才會加入實際在線人數。"; dutyButton.textContent = "開始陪聊值班"; }
}
async function connectCompanion() {
  if (!onDuty || companionConnecting || companionSocket) return;
  companionConnecting = true;
  companionStatus.textContent = "正在連線…";
  try {
    const ticket = await api("/api/v1/admin/lbt/companion/token", {method:"POST"});
    if (!onDuty) return;
    const url = new URL("/api/v1/admin/lbt/companion/ws", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(url.href, ["bearer." + ticket.token]);
    companionSocket = ws;
    ws.onopen = () => {
      companionError.textContent = "";
      companionStatus.textContent = "值班中。選一位等待者送出邀請，對方接受後才會開始聊天。";
      refreshCompanionWaiting();
    };
    ws.onmessage = (event) => {
      if (companionSocket !== ws) return;
      let f; try { f = JSON.parse(event.data); } catch { return; }
      if (f.type === "lbt.companion_pending") {
        companionPending = f.id;
        companionStatus.textContent = "已邀請「" + f.profile.nickname + "」，等待對方同意（一分鐘內有效）。";
      } else if (f.type === "lbt.companion_cleared") {
        if (companionPending === f.id) {
          companionPending = null;
          const reasons = {declined:"對方選擇繼續等待。", expired:"邀請已過期。", cancelled:"邀請已取消。", disconnected:"對方或管理員已離線。", matched:"對方已遇見另一位使用者。"};
          companionStatus.textContent = reasons[f.reason] || "邀請已完成。";
        }
      } else if (f.type === "lbt.matched") {
        companionReset(); companionSession = f.conversation_id;
        companionTitle.textContent = "正在和「" + f.partner.nickname + "」聊天";
        companionStatus.textContent = "對方已同意陪聊，看到的身分是「小鎮管理員」。";
        companionEndsAt = Date.now() + Date.parse(f.ends_at) - Date.parse(f.server_now);
        companionGrace = f.grace_seconds;
        companionChat.hidden = false; companionDraft.focus();
      } else if (f.type === "lbt.message" && companionSession && !companionMessages.has(f.id)) {
        companionMessages.add(f.id);
        companionLog.append(el("div", {class:"companion-line " + f.from}, el("small", {text:f.from === "me" ? "小鎮管理員（你）" : "對方"}), f.text));
        companionLog.scrollTop = companionLog.scrollHeight;
      } else if (f.type === "lbt.extend_requested") {
        if (f.by === "me") companionMine = true; else companionOther = true;
      } else if (f.type === "lbt.extended") {
        companionEndsAt = Date.now() + Date.parse(f.ends_at) - Date.parse(f.server_now);
        companionMine = false; companionOther = false;
      } else if (f.type === "lbt.ended") {
        companionReset(); companionStatus.textContent = "這段陪聊已結束，可以邀請下一位等待者。";
      } else if (f.type === "lbt.idle") {
        companionReset(); companionStatus.textContent = "值班中，等待你送出邀請。";
      } else if (f.type === "lbt.error") {
        if (companionPending === "sending") companionPending = null;
        companionError.textContent = COMPANION_ERRORS[f.code] || "操作未完成，請重新整理等待名單再試。";
      }
      updateCompanionControls();
    };
    ws.onclose = (event) => {
      if (companionSocket !== ws) return;
      companionSocket = null; companionPending = null;
      companionStatus.textContent = "陪聊連線中斷，正在重連。若另一個後台已值班，請先關閉該視窗的值班。";
      updateCompanionControls();
      if (event.code === 4401) { onDuty = false; signOut("管理密碼已失效，請重新登入。"); }
      else if (onDuty) companionReconnect = setTimeout(connectCompanion, 5000);
    };
    ws.onerror = () => { /* close handles recovery */ };
  } catch { if (onDuty) { companionError.textContent = "無法建立陪聊連線，請稍後再試。"; companionReconnect = setTimeout(connectCompanion, 5000); } }
  finally { companionConnecting = false; }
}
function updateCompanionControls() {
  if (!companionPanel) return;
  const connected = companionSocket?.readyState === WebSocket.OPEN;
  const seconds = Math.max(0, Math.ceil((companionEndsAt - Date.now()) / 1000));
  companionClock.textContent = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2,"0");
  companionDraft.disabled = !connected || !companionSession || seconds === 0;
  companionSubmit.disabled = companionDraft.disabled;
  companionExtend.disabled = !connected || !companionSession || companionMine || Date.now() >= companionEndsAt + companionGrace * 1000;
  companionExtend.textContent = companionMine ? "已提出延長，等待對方同意" : companionOther ? "對方想延長，我也想" : "再聊 7 分鐘（雙方同意）";
  companionCancel.disabled = !connected || !companionPending;
  companionPanel.querySelectorAll("[data-invite]").forEach((btn) => { btn.disabled = !connected || !!companionSession || !!companionPending; });
}
async function refreshCompanionWaiting() {
  if (!token() || !companionPanel) return;
  try {
    const list = await api("/api/v1/admin/lbt/waiting");
    const nodes = list.items.map((w) => {
      const minutes = Math.floor(Math.max(0, Date.now() - Date.parse(w.joined_at)) / 60000);
      const btn = el("button", {class:"btn", type:"button", "data-invite":"", text:"邀請「" + w.profile.nickname + "」陪聊", onclick:() => {
        companionError.textContent = "";
        if (companionSend({type:"companion_invite", guest_id:w.guest_id})) {
          companionPending = "sending";
          updateCompanionControls();
        }
      }});
      return el("div", {class:"waiter"}, el("p", {}, el("strong", {text:w.profile.nickname}), el("small", {class:"meta", text:" · " + ENERGY[w.profile.energy] + " · " + PREF[w.profile.preference] + " · 已等候 " + minutes + " 分鐘"})), btn);
    });
    const active = document.activeElement;
    const focusedName = companionWaiting.contains(active) ? active.textContent : null;
    companionWaiting.replaceChildren(...(nodes.length ? nodes : [el("p", {class:"empty", text:"目前沒有等待中的使用者。"})]));
    updateCompanionControls();
    if (focusedName) Array.from(companionWaiting.querySelectorAll("button")).find(btn => btn.textContent === focusedName)?.focus({preventScroll:true});
  } catch { if (token()) companionError.textContent = "等待名單讀取失敗，請稍後再試。"; }
}
function getCompanionPanel() {
  if (companionPanel) return companionPanel;
  companionStatus = el("p", {class:"meta", role:"status", text:"尚未值班。開始值班後才會加入實際在線人數。"});
  companionError = el("p", {class:"err", role:"alert"});
  dutyButton = el("button", {class:"btn primary", type:"button", text:"開始陪聊值班", onclick:() => {
    if (onDuty) stopCompanion();
    else { onDuty = true; dutyButton.textContent = "結束陪聊值班"; connectCompanion(); companionTimer = setInterval(() => { if (companionSocket?.readyState === WebSocket.OPEN) companionSocket.send(JSON.stringify({type:"heartbeat"})); }, 10000); }
    updateCompanionControls();
  }});
  companionWaiting = el("div", {"aria-label":"等待陪聊名單"});
  companionTitle = el("h3"); companionClock = el("span", {class:"status", "aria-label":"陪聊剩餘時間"});
  companionLog = el("div", {class:"companion-log", role:"log", "aria-label":"陪聊訊息"});
  companionDraft = el("input", {id:"companion-draft", type:"text", maxlength:"500", autocomplete:"off"});
  companionSubmit = el("button", {class:"btn primary", type:"submit", text:"送出訊息"});
  const form = el("form", {class:"companion-composer"}, el("label", {for:"companion-draft", text:"輸入陪聊訊息"}), companionDraft, companionSubmit);
  form.addEventListener("submit", (event) => { event.preventDefault(); if (companionDraft.value.trim() && companionSend({type:"message", text:companionDraft.value})) companionDraft.value = ""; });
  companionExtend = el("button", {class:"btn", type:"button", onclick:() => companionSend({type:"extend"})});
  companionChat = el("div", {class:"companion-chat"}, companionTitle, companionClock, companionLog, form,
    el("div", {class:"actions"}, companionExtend, el("button", {class:"btn", type:"button", text:"說聲晚安，結束陪聊", onclick:() => companionSend({type:"leave"})})));
  companionChat.hidden = true;
  companionCancel = el("button", {class:"btn", type:"button", text:"取消目前邀請", onclick:() => companionSend({type:"cancel"})});
  companionPanel = el("section", {class:"companion", "aria-label":"管理員陪聊"}, el("h2", {text:"管理員陪聊"}),
    el("p", {class:"meta", text:"只列出等待者。對方會看到管理員身分，接受邀請後才會開始聊天。一次陪一位，一般配對照常進行。"}),
    el("div", {class:"actions"}, dutyButton, companionCancel),
    companionStatus, companionWaiting, companionError, companionChat);
  refreshCompanionWaiting(); updateCompanionControls();
  return companionPanel;
}
setInterval(() => { if (token() && !document.hidden) refreshCompanionWaiting(); }, 5000);
setInterval(updateCompanionControls, 1000);
`;
