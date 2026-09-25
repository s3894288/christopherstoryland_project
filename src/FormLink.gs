/**
 * FormLink.gs — Kết Nối Form Với Hệ Thống (v6.0 FINAL)
 *
 * VẤN ĐỀ GIẢI QUYẾT:
 *   Form luôn được tạo SAU spreadsheet. Khi setDestination, Google tạo tab
 *   response MỚI ("Form Responses 1") chứ không ghi vào tab có sẵn.
 *   Tạo lại form nhiều lần sinh ra nhiều tab mồ côi + nhiều trigger trùng.
 *
 * CÁCH XỬ LÝ:
 *   1. So sánh danh sách sheetId trước/sau setDestination để tìm ĐÚNG tab mới
 *      (không dựa vào tên "Form Responses" vì đổi theo ngôn ngữ giao diện)
 *   2. Tab cũ cùng tên: trống thì xoá, có dữ liệu thì đổi tên _BACKUP_
 *   3. Đổi tên tab mới thành tên chuẩn (ĐĂNG KÝ MỚI / STUDENT_REGISTRATION)
 *   4. Sửa thứ tự câu hỏi trên form cho khớp chỉ số e.values mà Main.gs đọc
 *   5. Xoá hết trigger cũ cùng handler rồi tạo lại đúng 1 trigger
 *   6. Lưu formId + sheetId vào Script Properties → chạy lại bao nhiêu lần
 *      cũng an toàn (idempotent)
 */

var FORM_KIND = { BOOKING: 'booking', REGISTRATION: 'registration' };
var FORM_PROP = { booking: 'BOOKING_FORM_ID', registration: 'REGISTRATION_FORM_ID' };
var FORM_SHEET_PROP = { booking: 'BOOKING_RESP_SHEET_ID', registration: 'REGISTRATION_RESP_SHEET_ID' };


// ══════════════════════════════════════════════════════════
//  GETTERS — Script Properties ưu tiên hơn CONFIG
// ══════════════════════════════════════════════════════════

function getBookingFormId_() {
  return PropertiesService.getScriptProperties().getProperty(FORM_PROP.booking) || CONFIG.BOOKING_FORM_ID || '';
}
function getRegistrationFormId_() {
  return PropertiesService.getScriptProperties().getProperty(FORM_PROP.registration) || CONFIG.REGISTRATION_FORM_ID || '';
}
function getFormId_(kind) {
  return kind === FORM_KIND.REGISTRATION ? getRegistrationFormId_() : getBookingFormId_();
}
function setFormId_(kind, id) {
  PropertiesService.getScriptProperties().setProperty(FORM_PROP[kind], id);
}
function getFormTargetSpreadsheet_(kind) {
  return kind === FORM_KIND.REGISTRATION ? getRegistrationSpreadsheet_() : SpreadsheetApp.getActive();
}
function getFormTargetSheetName_(kind) {
  return kind === FORM_KIND.REGISTRATION ? CONFIG.SHEETS.REGISTRATION : CONFIG.SHEETS.DANG_KY;
}
function getFormHandler_(kind) {
  return kind === FORM_KIND.REGISTRATION ? 'onRegistrationSubmit' : 'onFormSubmitTrigger';
}
function getFormKindLabel_(kind) {
  return kind === FORM_KIND.REGISTRATION ? 'Đăng ký học viên' : 'Đặt lịch học';
}


// ══════════════════════════════════════════════════════════
//  SCHEMA — thứ tự câu hỏi phải khớp chỉ số e.values
// ══════════════════════════════════════════════════════════

/**
 * e.values của form đặt lịch:
 *   [0]=Timestamp [1]=Email [2]=Họ và tên [3]=Student ID [4..10]=7 ngày
 * Nếu thứ tự câu hỏi lệch, processBooking_ đọc sai cột → đây là nguồn bug
 * lớn nhất khi tạo lại form. ensureFormSchema_ ép đúng thứ tự.
 */
function getExpectedFormItems_(kind) {
  if (kind === FORM_KIND.REGISTRATION) {
    return [
      { title: 'Họ và tên', type: 'TEXT', required: true },
      { title: 'Gói đăng ký', type: 'LIST', required: true }
    ];
  }
  var items = [
    { title: 'Họ và tên', type: 'TEXT', required: true },
    { title: 'Student ID', type: 'TEXT', required: false }
  ];
  for (var i = 0; i < CONFIG.DAY_LABELS.length; i++) {
    items.push({ title: CONFIG.DAY_LABELS[i], type: 'LIST', required: false });
  }
  return items;
}

function findItemByTitle_(form, title) {
  var items = form.getItems(), t = String(title).trim();
  for (var i = 0; i < items.length; i++) {
    if (String(items[i].getTitle()).trim() === t) return items[i];
  }
  return null;
}

/**
 * Bổ sung câu hỏi thiếu, đưa về đúng thứ tự. Không xoá câu hỏi lạ (chỉ cảnh báo)
 * vì xoá sẽ mất dữ liệu response cũ.
 */
function ensureFormSchema_(form, kind) {
  var report = { added: [], moved: [], extra: [] };
  try { form.setCollectEmail(true); } catch (e) { }
  var expected = getExpectedFormItems_(kind);

  for (var i = 0; i < expected.length; i++) {
    var spec = expected[i], item = findItemByTitle_(form, spec.title);
    if (!item) {
      if (spec.type === 'LIST') {
        form.addListItem().setTitle(spec.title).setChoiceValues([CONFIG.NO_CHOICE_LABEL]).setRequired(spec.required);
      } else {
        form.addTextItem().setTitle(spec.title).setRequired(spec.required);
      }
      report.added.push(spec.title);
      item = findItemByTitle_(form, spec.title);
    }
    if (item && item.getIndex() !== i) {
      form.moveItem(item.getIndex(), i);
      report.moved.push(spec.title);
    }
  }

  if (kind === FORM_KIND.REGISTRATION) {
    try { report.packages = seedPackageChoices_(form); } catch (e2) { Logger.log('  Nạp gói học: ' + e2.message); }
  }

  var all = form.getItems();
  for (var j = expected.length; j < all.length; j++) report.extra.push(String(all[j].getTitle()));
  return report;
}

/** Nạp danh sách gói từ tab PACKAGES (Registration spreadsheet) vào dropdown form */
function seedPackageChoices_(form) {
  var item = findItemByTitle_(form, 'Gói đăng ký');
  if (!item) return 0;
  var p = getRegistrationSpreadsheet_().getSheetByName(CONFIG.SHEETS.PACKAGES);
  if (!p) return 0;
  var d = p.getDataRange().getValues(), choices = [];
  for (var r = 1; r < d.length; r++) {
    var n = String(d[r][CONFIG.PACKAGE_COLS.NAME - 1] || '').trim();
    if (n) choices.push(n);
  }
  if (choices.length > 0) item.asListItem().setChoiceValues(choices);
  return choices.length;
}


// ══════════════════════════════════════════════════════════
//  RESPONSE TAB — nhận diện và đổi tên
// ══════════════════════════════════════════════════════════

function snapshotSheetIds_(ss) {
  var map = {}, sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) map[String(sheets[i].getSheetId())] = true;
  return map;
}

function findNewSheet_(ss, beforeMap) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (!beforeMap[String(sheets[i].getSheetId())]) return sheets[i];
  }
  return null;
}

function findSheetById_(ss, sheetId) {
  if (!sheetId) return null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(sheetId)) return sheets[i];
  }
  return null;
}

/**
 * Tab mới nhận tên chuẩn. Tab cũ cùng tên: trống thì xoá, có data thì backup.
 */
function adoptResponseSheet_(ss, respSheet, canonical) {
  var result = { renamed: false, backup: '', deleted: '' };
  if (!respSheet) return result;
  if (String(respSheet.getName()) === canonical) return result;

  var existing = ss.getSheetByName(canonical);
  if (existing && String(existing.getSheetId()) !== String(respSheet.getSheetId())) {
    if (existing.getLastRow() <= 1) {
      ss.deleteSheet(existing);
      result.deleted = canonical + ' (tab template trống)';
    } else {
      var backup = canonical + '_BACKUP_' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMdd_HHmm');
      existing.setName(backup);
      result.backup = backup;
    }
  }
  respSheet.setName(canonical);
  result.renamed = true;
  return result;
}


// ══════════════════════════════════════════════════════════
//  TRIGGER — xoá sạch rồi tạo lại đúng 1 cái
// ══════════════════════════════════════════════════════════

function rebuildFormTrigger_(form, handler) {
  var removed = 0;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === handler) { ScriptApp.deleteTrigger(triggers[i]); removed++; }
    }
    ScriptApp.newTrigger(handler).forForm(form).onFormSubmit().create();
  } catch (e) {
    Logger.log('  Trigger lỗi (' + handler + '): ' + e.message);
    return { removed: removed, created: false, error: e.message };
  }
  return { removed: removed, created: true, error: '' };
}


// ══════════════════════════════════════════════════════════
//  HÀM CHÍNH — LINK FORM
// ══════════════════════════════════════════════════════════

/**
 * Nối 1 form (mới tạo hoặc đã có) vào hệ thống. Chạy lại bao nhiêu lần cũng an toàn.
 */
function linkFormToSystem_(form, kind) {
  var ss = getFormTargetSpreadsheet_(kind);
  var canonical = getFormTargetSheetName_(kind);
  var report = { kind: kind, formId: form.getId(), schema: null, sheet: null, trigger: null, steps: [] };

  Logger.log('── Kết nối form ' + getFormKindLabel_(kind) + ' ──');
  Logger.log('  Form ID: ' + form.getId());
  Logger.log('  Đích:    ' + canonical + ' (spreadsheet ' + ss.getId() + ')');

  // 1. Sửa schema trước khi link (tránh tab response sai cột)
  report.schema = ensureFormSchema_(form, kind);
  if (report.schema.added.length) Logger.log('  Thêm câu hỏi: ' + report.schema.added.join(', '));
  if (report.schema.moved.length) Logger.log('  Sắp lại thứ tự: ' + report.schema.moved.join(', '));
  if (report.schema.extra.length) Logger.log('  CHÚ Ý câu hỏi lạ (không xoá tự động): ' + report.schema.extra.join(', '));

  // 2. Kiểm tra destination hiện tại
  var destId = '';
  try { destId = String(form.getDestinationId() || ''); } catch (e) { destId = ''; }
  var storedSheetId = PropertiesService.getScriptProperties().getProperty(FORM_SHEET_PROP[kind]);
  var linkedSheet = (destId === String(ss.getId())) ? findSheetById_(ss, storedSheetId) : null;

  if (linkedSheet) {
    Logger.log('  Đã nối sẵn → giữ nguyên tab ' + linkedSheet.getName());
    report.steps.push('already_linked');
  } else {
    var before = snapshotSheetIds_(ss);
    try { form.removeDestination(); } catch (e2) { }
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    SpreadsheetApp.flush();
    Utilities.sleep(3000);
    linkedSheet = findNewSheet_(ss, before);
    report.steps.push('relinked');
    if (!linkedSheet) Logger.log('  CẢNH BÁO: không tìm thấy tab response mới');
  }

  // 3. Đổi tên tab về tên chuẩn
  report.sheet = adoptResponseSheet_(ss, linkedSheet, canonical);
  if (report.sheet.deleted) Logger.log('  Xoá: ' + report.sheet.deleted);
  if (report.sheet.backup) Logger.log('  Backup tab cũ → ' + report.sheet.backup);
  if (report.sheet.renamed) Logger.log('  Đổi tên tab response → ' + canonical);
  if (linkedSheet) PropertiesService.getScriptProperties().setProperty(FORM_SHEET_PROP[kind], String(linkedSheet.getSheetId()));
  if (linkedSheet) { try { report.headers = ensureResponseSheetHeaders_(kind, linkedSheet); } catch (eh) { Logger.log('  Headers: ' + eh.message); } }

  // 4. Lưu form ID
  setFormId_(kind, form.getId());
  Logger.log('  Lưu ' + FORM_PROP[kind] + ' vào Script Properties');

  // 5. Dựng lại trigger
  report.trigger = rebuildFormTrigger_(form, getFormHandler_(kind));
  Logger.log('  Trigger: xoá ' + report.trigger.removed + ' cũ, tạo mới ' + (report.trigger.created ? 'OK' : 'LỖI'));

  // 6. Nạp dropdown cho form đặt lịch
  if (kind === FORM_KIND.BOOKING) {
    try { syncCheckSlotValues(); } catch (e3) { Logger.log('  syncCheckSlotValues: ' + e3.message); }
    try { updateFormOptionsForForm_(form); Logger.log('  Đã nạp dropdown khung giờ'); } catch (e4) { Logger.log('  Dropdown: ' + e4.message); }
  }

  Logger.log('  XONG: ' + form.getPublishedUrl());
  return report;
}


// ══════════════════════════════════════════════════════════
//  RESPONSE TAB HEADERS — cột admin dùng nhưng form không tạo
// ══════════════════════════════════════════════════════════

/**
 * Form đăng ký chỉ tạo 4 cột A..D (Timestamp, Email, Họ tên, Gói).
 * Admin cần E (Trạng thái TT) để đánh "Đã thanh toán", script cần F..I.
 * Không có header → admin không biết gõ vào đâu. Hàm này bổ sung header + dropdown cột E.
 */
function ensureResponseSheetHeaders_(kind, sheet) {
  if (kind !== FORM_KIND.REGISTRATION) return 0;
  var R = CONFIG.REG_COLS, want = {};
  want[R.PAYMENT] = 'Trạng thái TT'; want[R.STUDENT_ID] = 'StudentID'; want[R.SESSIONS] = 'Số buổi'; want[R.FEE] = 'Học phí'; want[R.SYNCED] = 'Synced';
  var lastCol = Math.max(sheet.getLastColumn(), R.SYNCED), headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0], added = 0;
  for (var col in want) {
    var c = Number(col);
    if (!String(headers[c - 1] || '').trim()) { sheet.getRange(1, c).setValue(want[col]).setFontWeight('bold'); added++; }
  }
  try {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList([CONFIG.PAYMENT_STATUS.UNPAID, CONFIG.PAYMENT_STATUS.PAID], true).setAllowInvalid(false).build();
    sheet.getRange(2, R.PAYMENT, 1000, 1).setDataValidation(rule);
  } catch (e) { }
  if (added) Logger.log('  Bổ sung ' + added + ' header cột E..I cho ' + sheet.getName());
  return added;
}

function writeFormLinksToDashboard_(bookForm, regForm) {
  var dash = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.DASHBOARD);
  if (!dash) return;
  var D = CONFIG.DASHBOARD_CELLS;
  if (bookForm) { dash.getRange(D.BOOKING_URL).setValue(bookForm.getPublishedUrl()); dash.getRange(D.BOOKING_ID).setValue(bookForm.getId()); }
  if (regForm) { dash.getRange(D.REG_URL).setValue(regForm.getPublishedUrl()); dash.getRange(D.REG_ID).setValue(regForm.getId()); }
}


// ══════════════════════════════════════════════════════════
//  ENTRY POINTS — gọi từ menu
// ══════════════════════════════════════════════════════════

function extractFormId_(input) {
  var s = String(input || '').trim();
  if (!s) return '';
  if (s.indexOf('/forms/d/e/') >= 0) return '__PUBLISHED__';
  var m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return s;
}

function promptFormId_(kind) {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { return ''; }
  var res = ui.prompt('Kết nối Form ' + getFormKindLabel_(kind),
    'Dán Form ID hoặc link EDIT của form.\n(Link edit dạng .../forms/d/<ID>/edit — KHÔNG dùng link /d/e/... đã publish)',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return '';
  var id = extractFormId_(res.getResponseText());
  if (id === '__PUBLISHED__') {
    ui.alert('Sai loại link', 'Đó là link publish (/d/e/...). Mở form ở chế độ chỉnh sửa và copy link trên thanh địa chỉ.', ui.ButtonSet.OK);
    return '';
  }
  return id;
}

function linkFormById(kind, formId) {
  if (!formId) formId = getFormId_(kind) || promptFormId_(kind);
  if (!formId) { Logger.log('Không có Form ID'); return null; }
  var form;
  try { form = FormApp.openById(formId); }
  catch (e) { Logger.log('Không mở được form ' + formId + ': ' + e.message); return null; }
  var rep = linkFormToSystem_(form, kind);
  try { if (kind === FORM_KIND.BOOKING) writeFormLinksToDashboard_(form, null); else writeFormLinksToDashboard_(null, form); } catch (e2) { }
  return rep;
}

function linkBookingForm() { return linkFormById(FORM_KIND.BOOKING, ''); }
function linkRegistrationForm() { return linkFormById(FORM_KIND.REGISTRATION, ''); }

function relinkAllForms() {
  Logger.log('══ KẾT NỐI LẠI TẤT CẢ FORM ══');
  var a = linkFormById(FORM_KIND.REGISTRATION, '');
  Logger.log('');
  var b = linkFormById(FORM_KIND.BOOKING, '');
  Logger.log('══ XONG ══');
  return { registration: a, booking: b };
}


// ══════════════════════════════════════════════════════════
//  HEALTH CHECK
// ══════════════════════════════════════════════════════════

function checkFormLinks() {
  Logger.log('══ KIỂM TRA KẾT NỐI FORM ══');
  var kinds = [FORM_KIND.REGISTRATION, FORM_KIND.BOOKING], issues = 0;

  for (var k = 0; k < kinds.length; k++) {
    var kind = kinds[k], id = getFormId_(kind), ss = getFormTargetSpreadsheet_(kind), canonical = getFormTargetSheetName_(kind);
    Logger.log('── ' + getFormKindLabel_(kind) + ' ──');

    if (!id) { Logger.log('  LỖI  chưa có Form ID'); issues++; continue; }
    Logger.log('  Form ID: ' + id);

    var form = null;
    try { form = FormApp.openById(id); } catch (e) { Logger.log('  LỖI  không mở được form: ' + e.message); issues++; continue; }

    var destId = '';
    try { destId = String(form.getDestinationId() || ''); } catch (e2) { }
    if (destId === String(ss.getId())) Logger.log('  OK   destination đúng spreadsheet');
    else { Logger.log('  LỖI  destination sai (' + (destId || 'chưa nối') + ')'); issues++; }

    var sheet = ss.getSheetByName(canonical);
    if (sheet) Logger.log('  OK   tab ' + canonical + ' tồn tại (' + sheet.getLastRow() + ' dòng)');
    else { Logger.log('  LỖI  thiếu tab ' + canonical); issues++; }

    var expected = getExpectedFormItems_(kind), items = form.getItems(), orderOk = true;
    for (var i = 0; i < expected.length; i++) {
      if (!items[i] || String(items[i].getTitle()).trim() !== expected[i].title) { orderOk = false; break; }
    }
    if (orderOk) Logger.log('  OK   thứ tự ' + expected.length + ' câu hỏi đúng');
    else { Logger.log('  LỖI  thứ tự câu hỏi sai → chạy Kết nối lại Form'); issues++; }

    var handler = getFormHandler_(kind), count = 0;
    try {
      var trg = ScriptApp.getProjectTriggers();
      for (var t = 0; t < trg.length; t++) if (trg[t].getHandlerFunction() === handler) count++;
    } catch (e3) { }
    if (count === 1) Logger.log('  OK   1 trigger ' + handler);
    else { Logger.log('  LỖI  có ' + count + ' trigger ' + handler + ' (cần đúng 1)'); issues++; }
  }

  Logger.log('══ KẾT QUẢ: ' + issues + ' vấn đề ══');
  if (issues > 0) Logger.log('  Khắc phục: menu thaiput → Form → Kết nối lại tất cả Form');
  return issues;
}


// ══════════════════════════════════════════════════════════
//  DỌN TAB RESPONSE MỒ CÔI
// ══════════════════════════════════════════════════════════

/**
 * Tạo form nhiều lần sinh ra "Form Responses 2, 3..." mồ côi.
 * Tab trống → xoá. Tab có dữ liệu → đổi tên _ORPHAN_ để admin tự xem.
 */
function cleanupOrphanResponseTabs() {
  var targets = [SpreadsheetApp.getActive(), getRegistrationSpreadsheet_()];
  var patterns = ['Form Responses', 'Phản hồi', 'Câu trả lời', 'Form responses'];
  var deleted = 0, flagged = 0, seen = {};

  for (var s = 0; s < targets.length; s++) {
    var ss = targets[s];
    if (seen[ss.getId()]) continue;
    seen[ss.getId()] = true;
    var sheets = ss.getSheets();
    for (var i = sheets.length - 1; i >= 0; i--) {
      var name = String(sheets[i].getName()), match = false;
      for (var p = 0; p < patterns.length; p++) if (name.indexOf(patterns[p]) === 0) match = true;
      if (!match) continue;
      if (sheets[i].getLastRow() <= 1) { ss.deleteSheet(sheets[i]); deleted++; Logger.log('  Xoá tab trống: ' + name); }
      else { sheets[i].setName('_ORPHAN_' + name); flagged++; Logger.log('  Đánh dấu: _ORPHAN_' + name); }
    }
  }
  Logger.log('Dọn tab mồ côi: xoá ' + deleted + ', đánh dấu ' + flagged);
  return { deleted: deleted, flagged: flagged };
}
