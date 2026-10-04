/**
 * LowBatteryTown feedback box → this Google Sheet.
 *
 * Setup (once):
 * 1. In the sheet: Extensions → Apps Script, replace everything with this file.
 * 2. Project Settings → Script properties → add FEEDBACK_SHEET_TOKEN with a long
 *    random value (the same value goes into the Worker secret of that name).
 * 3. Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 *    Copy the /exec URL into the Worker secret FEEDBACK_SHEET_URL.
 *
 * The Worker already escapes leading = + - @ so text can't become a formula;
 * this script escapes again in case it is ever called another way.
 */
var SHEET_NAME = "意見箱";
var HEADER = ["時間", "類型", "內容", "回覆信箱", "頁面", "語言", "編號"];
var CATEGORY = { idea: "建議", bug: "問題回報", other: "其他" };

function doPost(e) {
  var expected = PropertiesService.getScriptProperties().getProperty("FEEDBACK_SHEET_TOKEN");
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply(false);
  }
  if (!expected || !body || body.token !== expected) return reply(false);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    sheet.appendRow([
      safe(toTaipei(body.created_at)),
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

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight("bold");
    sheet.setColumnWidth(3, 480);
  }
  return sheet;
}

function safe(value) {
  var text = value === undefined || value === null ? "" : String(value).slice(0, 2000);
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}

function toTaipei(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, "Asia/Taipei", "yyyy-MM-dd HH:mm");
}

function reply(ok) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok })).setMimeType(ContentService.MimeType.JSON);
}
