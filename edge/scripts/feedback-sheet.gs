/**
 * LowBatteryTown feedback box → this Google Sheet.
 *
 * Setup (once):
 * 1. In the sheet: Extensions → Apps Script, replace everything with this file.
 * 2. Project Settings → Script properties → add FEEDBACK_SHEET_TOKEN with a long
 *    random value (the same value goes into the Worker secret of that name).
 * 3. Select the `setup` function and click Run once (Google asks you to allow
 *    access). It creates the sheet and a daily trigger that deletes rows older
 *    than RETENTION_DAYS, matching the privacy policy.
 * 4. Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 *    Copy the /exec URL into the Worker secret FEEDBACK_SHEET_URL.
 *
 * The Worker already escapes leading = + - @ so text can't become a formula;
 * this script escapes again in case it is ever called another way.
 */
var SHEET_NAME = "意見箱";
var HEADER = ["時間", "類型", "內容", "回覆信箱", "頁面", "語言", "編號"];
var CATEGORY = { idea: "建議", bug: "問題回報", other: "其他" };
/** Keep in step with LBT_FEEDBACK_RETENTION_DAYS and feedbackDays in frontend/lib/lbt/legal.ts. */
var RETENTION_DAYS = 365;

function doPost(e) {
  var expected = PropertiesService.getScriptProperties().getProperty("FEEDBACK_SHEET_TOKEN");
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply(false);
  }
  if (!expected || !body || body.token !== expected) return reply(false);

  var created = new Date(body.created_at);
  if (isNaN(created.getTime())) created = new Date();

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    sheet.appendRow([
      created,
      safe(CATEGORY[body.category] || body.category),
      safe(body.message),
      safe(body.email),
      safe(body.page),
      safe(body.locale),
      safe(body.id),
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply(true);
}

/** Run once from the editor: creates the sheet and the daily cleanup trigger. */
function setup() {
  getSheet();
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === "purgeOld";
  });
  if (!exists) ScriptApp.newTrigger("purgeOld").timeBased().everyDays(1).atHour(3).create();
  purgeOld();
}

/** Delete rows whose time is older than RETENTION_DAYS (daily trigger). */
function purgeOld() {
  var sheet = getSheet();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);
  var times = sheet.getRange(2, 1, last - 1, 1).getValues();
  // Bottom-up so row numbers stay valid while deleting.
  for (var i = times.length - 1; i >= 0; i--) {
    var t = times[i][0] instanceof Date ? times[i][0] : new Date(times[i][0]);
    if (!isNaN(t.getTime()) && t < cutoff) sheet.deleteRow(i + 2);
  }
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm");
    sheet.setColumnWidth(3, 480);
  }
  return sheet;
}

function safe(value) {
  var text = value === undefined || value === null ? "" : String(value).slice(0, 2000);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function reply(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok })).setMimeType(ContentService.MimeType.JSON);
}
