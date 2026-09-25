/**
 * ============================================================
 * Setup.gs — Cài Đặt, Trigger, Test & Bảo Trì (v6.1.0)
 * ============================================================
 *
 * v6.1.0:
 *   heartbeat()           thay updateFormOptions làm trigger 10 phút: tự chuyển tuần nếu trigger CN bị lỡ,
 *                         bổ sung công thức STUDENT_INFO thiếu, xử lý huỷ bị sót, rồi sync như cũ
 *   onEditTrigger         dán "Cancelled" cho NHIỀU dòng cùng lúc → xử lý từng dòng (trước: bỏ qua cả khối)
 *   cancelBookingRow_     idempotent (cột L đã ghi "Huỷ …" → bỏ qua, không gửi email 2 lần);
 *                         HV đang "Hết buổi" được hoàn buổi → Active
 *   processPendingCancellations  quét dòng Cancelled chưa xử lý (buổi hôm nay trở đi)
 *   testSystem            + kiểm tra công thức STUDENT_INFO, trigger heartbeat, quota email còn lại,
 *                         timezone 3 spreadsheet, đủ dòng tuần active trong CHECK_SLOT + tab tutor
 *   initializeSystem()    MỚI, menu 1: đặt timezone 3 spreadsheet, dựng lịch tháng này + 2 tuần tới,
 *                         công thức STUDENT_INFO, sync, rồi testSystem. Template không còn chứa ngày cố định
 *                         (trước: lịch 08/2026 → triển khai tháng khác thì dropdown trống, tutor không có chỗ điền)
 *
 * v6.0.1: menu Form thêm "Xử lý lại phản hồi bị sót (72 giờ)" → recoverMissedBookings (Main.gs)
 *
 * v6.0:
 *   createAllTriggers()   TRƯỚC ĐÂY KHÔNG TỒN TẠI dù tài liệu bảo chạy → không trigger nào chạy
 *   onEditTrigger         huỷ booking → xoá Calendar event + sync CHECK_SLOT + email
 *   testSystem            kiểm tra đúng 3 spreadsheet + timezone project + SIM_NOW
 *   testSeedStudents      T0 — nạp học viên test vào STUDENT_INFO (trước đây test dùng email không tồn tại)
 *   testSimulateNow       giả lập đồng hồ hệ thống cho mọi scenario
 *   Bỏ "test sandbox"     vì nó không thật sự cách ly (test vẫn ghi vào BOOKINGS thật)
 * ============================================================
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('thaiput')
    .addItem('1. Khởi tạo + kiểm tra hệ thống', 'initializeSystem')
    .addItem('2. Tạo 2 Form mới + kết nối', 'setupAllForms')
    .addItem('3. Tạo/cập nhật 8 trigger', 'createAllTriggers')
    .addItem('4. Đồng bộ slot + dropdown Form', 'heartbeat')
    .addSeparator()
    .addSubMenu(ui.createMenu('Form')
      .addItem('Kết nối lại tất cả Form', 'relinkAllForms')
      .addItem('Kết nối Form đặt lịch (nhập ID)', 'linkBookingForm')
      .addItem('Kết nối Form đăng ký (nhập ID)', 'linkRegistrationForm')
      .addSeparator()
      .addItem('Xử lý lại phản hồi bị sót (72 giờ)', 'recoverMissedBookings')
      .addItem('Kiểm tra kết nối Form', 'checkFormLinks')
      .addItem('Dọn tab response mồ côi', 'cleanupOrphanResponseTabs'))
    .addSubMenu(ui.createMenu('Học viên')
      .addItem('Kích hoạt học viên đã thanh toán', 'syncRegistrations')
      .addItem('Quét cảnh báo sắp hết buổi', 'scanAndNotifyLowBalance')
      .addItem('Sửa công thức số buổi (STUDENT_INFO)', 'repairStudentFormulas'))
    .addSubMenu(ui.createMenu('Điểm danh')
      .addItem('Chạy điểm danh (Active → Completed)', 'markCompletedSessions')
      .addItem('Đánh NoShow (chọn dòng BOOKINGS)', 'markNoShow')
      .addItem('Xử lý các dòng huỷ bị sót', 'processPendingCancellations'))
    .addSubMenu(ui.createMenu('Báo cáo')
      .addItem('Payroll tháng này', 'generatePayrollThisMonth')
      .addItem('Payroll tháng trước', 'generatePayrollLastMonth')
      .addItem('Liệt kê tháng đã archive', 'listArchivedMonths'))
    .addSubMenu(ui.createMenu('Lịch')
      .addItem('Đảm bảo đủ ngày tuần active', 'ensureActiveWeekRows_')
      .addItem('Chuyển tuần (weeklyRollover)', 'weeklyRollover')
      .addItem('Archive + rebuild tháng (monthlyRollover)', 'monthlyRollover'))
    .addSeparator()
    .addSubMenu(ui.createMenu('Test')
      .addItem('T0 · Nạp học viên test', 'testSeedStudents')
      .addItem('T1 · Kiểm tra hệ thống', 'testSystem')
      .addItem('T2 · Đánh x mẫu cho tutor', 'testSeedTutorAvailability')
      .addItem('T3 · Đặt 1 buổi', 'testSimulateSubmit')
      .addItem('T4 · 3 học viên cùng slot', 'testSimulateMultipleStudents')
      .addItem('T5 · Hết buổi', 'testSimulateQuotaExhausted')
      .addItem('T6 · Còn 1 buổi', 'testSimulateLowBalance')
      .addItem('T7 · Vượt quota', 'testSimulateOverBudget')
      .addItem('T8 · Huỷ + hoàn buổi', 'testSimulateCancel')
      .addItem('T9 · Điểm danh', 'testAttendance')
      .addItem('T10 · Archive tháng trước → dựng tháng này', 'testArchiveDemo')
      .addItem('T11 · Slot đã qua bị chặn', 'testPastSlotRejected')
      .addSeparator()
      .addItem('Chạy tất cả (T0 → T11)', 'runAllTests')
      .addItem('Dọn dữ liệu test', 'resetBookings')
      .addItem('Tắt giả lập thời gian', 'clearSimulatedNow'))
    .addToUi();
}


// ══════════════════════════════════════════════════════════
//  KHỞI TẠO — chạy lần đầu và bất cứ khi nào nghi ngờ (idempotent)
// ══════════════════════════════════════════════════════════

/**
 * 1. Timezone 3 spreadsheet = CONFIG.TIMEZONE. File XLSX upload lên Drive nhận timezone của người upload;
 *    lệch về phía đông (VD +10) thì ngày đọc ra lùi 1 ngày → đặt nhầm ngày, quota sai.
 * 2. Lịch: dựng tháng hiện tại + tuần active + tuần kế tiếp cho CHECK_SLOT và mọi tab tutor (giữ "x" đã có).
 * 3. Công thức STUDENT_INFO. 4. Sync CHECK_SLOT + dropdown. 5. testSystem.
 */
function initializeSystem() {
  var steps = withScriptLock_('initializeSystem', function () {
    var out = [];
    clearCache_();
    var seen = {}, list = [['Main', function () { return SpreadsheetApp.getActive(); }], ['Tutor', getTutorSpreadsheet_], ['Registration', getRegistrationSpreadsheet_]];
    for (var i = 0; i < list.length; i++) {
      try {
        var ss = list[i][1](); if (seen[ss.getId()]) continue; seen[ss.getId()] = true;
        var tz = ss.getSpreadsheetTimeZone();
        if (tz !== CONFIG.TIMEZONE) { ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE); out.push('Timezone ' + list[i][0] + ': ' + tz + ' → ' + CONFIG.TIMEZONE); }
      } catch (e) { out.push('LỖI mở spreadsheet ' + list[i][0] + ': ' + e.message); }
    }
    var now = getNow_();
    getActiveWeekStart_();   // tạo ACTIVE_WEEK_START nếu chưa có
    ensureActiveWeekCurrent_();
    rebuildCurrentMonth(now.getFullYear(), now.getMonth() + 1);
    ensureActiveWeekRows_();
    out.push('Lịch: tháng ' + (now.getMonth() + 1) + '/' + now.getFullYear() + ' + tuần active + tuần kế tiếp');
    var f = repairStudentFormulas_();
    if (f.added || f.upgraded) out.push('Công thức STUDENT_INFO: thêm ' + f.added + ', nâng cấp ' + f.upgraded);
    updateFormOptions();
    return out;
  }, function () { return ['Hệ thống đang bận, thử lại sau 1 phút']; });
  for (var s = 0; s < steps.length; s++) Logger.log('  ' + steps[s]);
  return testSystem();
}


// ══════════════════════════════════════════════════════════
//  TẠO FORM — uỷ quyền toàn bộ việc nối cho FormLink.gs
// ══════════════════════════════════════════════════════════

function setupAllForms() {
  Logger.log('══ TẠO 2 FORM MỚI ══');
  var regForm = FormApp.create(CONFIG.SCHOOL_NAME + ' — Đăng ký học viên');
  regForm.setDescription(
    'Đăng ký gói học 1:1 tại ' + CONFIG.SCHOOL_NAME + '.\n\n' +
    'Sau khi đăng ký, bạn sẽ nhận hướng dẫn thanh toán qua email.\n' +
    'Khi thanh toán được xác nhận, hệ thống sẽ kích hoạt tài khoản và gửi email chào mừng.');
  regForm.setConfirmationMessage(
    'Đăng ký đã được ghi nhận!\n\nThông tin thanh toán:\n' +
    'Ngân hàng: ' + CONFIG.PAYMENT_INFO.BANK_NAME + '\n' +
    'Số TK: ' + CONFIG.PAYMENT_INFO.ACCOUNT_NUMBER + '\n' +
    'Chủ TK: ' + CONFIG.PAYMENT_INFO.ACCOUNT_HOLDER + '\n' +
    'Nội dung CK: ' + CONFIG.PAYMENT_INFO.TRANSFER_NOTE_HINT + '\n\n' +
    'Sau khi thanh toán được xác nhận, bạn sẽ nhận email kích hoạt tài khoản.');
  linkFormToSystem_(regForm, FORM_KIND.REGISTRATION);

  var bookForm = FormApp.create(CONFIG.SCHOOL_NAME + ' — Đăng ký lịch học 1:1');
  bookForm.setLimitOneResponsePerUser(false);
  bookForm.setConfirmationMessage('Đăng ký đã được ghi nhận. Kiểm tra email để nhận xác nhận kèm link phòng học.');
  linkFormToSystem_(bookForm, FORM_KIND.BOOKING);

  writeFormLinksToDashboard_(bookForm, regForm);
  Logger.log('Form đặt lịch: ' + bookForm.getPublishedUrl());
  Logger.log('Form đăng ký:  ' + regForm.getPublishedUrl());
  Logger.log('ID đã lưu vào Script Properties — KHÔNG cần sửa Config.gs');
  try {
    SpreadsheetApp.getUi().alert('2 Form đã tạo và kết nối',
      'Tab response đã đổi tên, trigger đã dựng, dropdown đã nạp.\nLink ghi vào DASHBOARD.\n\nTiếp theo: menu → 3. Tạo/cập nhật 8 trigger',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (uiErr) { }
}


// ══════════════════════════════════════════════════════════
//  TRIGGER — idempotent: xoá cũ cùng handler, tạo mới
// ══════════════════════════════════════════════════════════

var TIME_TRIGGERS_ = [
  { fn: 'heartbeat',             build: function (b) { return b.timeBased().everyMinutes(10); } },
  { fn: 'markCompletedSessions', build: function (b) { return b.timeBased().atHour(0).nearMinute(30).everyDays(1); } },
  { fn: 'weeklyRollover',        build: function (b) { return b.timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23); } },
  { fn: 'sundayReminderTutors',  build: function (b) { return b.timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(6); } },
  { fn: 'monthlyRollover',       build: function (b) { return b.timeBased().onMonthDay(1).atHour(1); } }
];

function createAllTriggers() {
  Logger.log('══ TẠO 8 TRIGGER ══');
  var ss = SpreadsheetApp.getActive(), created = 0;
  deleteTriggersByHandler_('updateFormOptions');   // trigger 10 phút cũ (≤ v6.0.1) → thay bằng heartbeat

  // 5 time-driven
  for (var i = 0; i < TIME_TRIGGERS_.length; i++) {
    var t = TIME_TRIGGERS_[i];
    deleteTriggersByHandler_(t.fn);
    t.build(ScriptApp.newTrigger(t.fn)).inTimezone(CONFIG.TIMEZONE).create();
    Logger.log('  OK ' + t.fn); created++;
  }
  // 1 on-edit (installable — simple onEdit không đủ quyền gửi mail)
  deleteTriggersByHandler_('onEditTrigger');
  ScriptApp.newTrigger('onEditTrigger').forSpreadsheet(ss).onEdit().create();
  Logger.log('  OK onEditTrigger'); created++;
  // 2 form-submit — qua FormLink để đồng thời kiểm tra kết nối
  var kinds = [FORM_KIND.REGISTRATION, FORM_KIND.BOOKING];
  for (var k = 0; k < kinds.length; k++) {
    var id = getFormId_(kinds[k]);
    if (!id) { Logger.log('  BỎ QUA ' + getFormHandler_(kinds[k]) + ' — chưa có form (chạy menu 2 hoặc Form → Kết nối)'); continue; }
    try { rebuildFormTrigger_(FormApp.openById(id), getFormHandler_(kinds[k])); Logger.log('  OK ' + getFormHandler_(kinds[k])); created++; }
    catch (e) { Logger.log('  LỖI ' + getFormHandler_(kinds[k]) + ': ' + e.message); }
  }
  Logger.log('══ ' + created + '/8 trigger ══');
  toast_('Đã tạo ' + created + '/8 trigger' + (created < 8 ? ' — xem log: form nào chưa kết nối' : ''));
  return created;
}

function deleteTriggersByHandler_(fn) {
  var trg = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < trg.length; i++) if (trg[i].getHandlerFunction() === fn) { ScriptApp.deleteTrigger(trg[i]); n++; }
  return n;
}

function listTriggers() {
  var trg = ScriptApp.getProjectTriggers();
  Logger.log('Có ' + trg.length + ' trigger:');
  for (var i = 0; i < trg.length; i++) Logger.log('  ' + trg[i].getHandlerFunction() + ' · ' + trg[i].getEventType());
  return trg.length;
}


// ══════════════════════════════════════════════════════════
//  HEARTBEAT — trigger 10 phút
// ══════════════════════════════════════════════════════════

/**
 * Nhịp tim hệ thống. Mỗi bước độc lập: bước nào lỗi vẫn chạy các bước sau, cuối cùng ném lỗi
 * để Executions hiện Failed (và Google gửi email báo lỗi trigger cho chủ script).
 */
function heartbeat() {
  var errors = [];
  withScriptLock_('heartbeat', function () {
    clearCache_();
    try { ensureActiveWeekCurrent_(); } catch (e1) { errors.push('ensureActiveWeekCurrent_: ' + e1.message); }
    try { ensureActiveWeekRows_(); } catch (e5) { errors.push('ensureActiveWeekRows_: ' + e5.message); }
    try { repairStudentFormulas_(); } catch (e2) { errors.push('repairStudentFormulas_: ' + e2.message); }
    try { processPendingCancellations_(); } catch (e3) { errors.push('processPendingCancellations_: ' + e3.message); }
    try { updateFormOptions(); } catch (e4) { errors.push('updateFormOptions: ' + e4.message); }
  });
  if (errors.length) throw new Error('heartbeat: ' + errors.join(' | '));
}


// ══════════════════════════════════════════════════════════
//  ON EDIT — HUỶ BOOKING
// ══════════════════════════════════════════════════════════

function onEditTrigger(e) {
  if (!e || !e.range) return;
  var rg = e.range, sheet = rg.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.BOOKINGS) return;
  var col = CONFIG.BOOKING_COLS.STATUS, c0 = rg.getColumn(), c1 = c0 + rg.getNumColumns() - 1;
  if (col < c0 || col > c1) return;
  var r0 = Math.max(2, rg.getRow()), r1 = rg.getRow() + rg.getNumRows() - 1;
  if (r1 < r0) return;
  var single = rg.getNumRows() === 1 && rg.getNumColumns() === 1;
  withScriptLock_('onEditTrigger', function () {
    if (single) {
      // 1 ô: có oldValue → chỉ huỷ khi chuyển từ Active / Completed
      var newVal = String(e.value || '').trim(), oldVal = String(e.oldValue || '').trim();
      if (newVal !== CONFIG.STATUS.CANCELLED) return;
      if (oldVal !== CONFIG.STATUS.ACTIVE && oldVal !== CONFIG.STATUS.COMPLETED) return;
      cancelBookingRow_(sheet, r0);
    } else {
      // Dán / kéo nhiều ô: không có oldValue → dựa vào dấu hiệu dòng chưa xử lý huỷ, chỉ buổi từ hôm nay
      processCancellationsInRows_(sheet, r0, r1, getNow_());
    }
  }, function () {
    notifyAdminError_('Huỷ booking chưa xử lý (hệ thống bận)', new Error('Dòng ' + r0 + (r1 > r0 ? '–' + r1 : '') + ' BOOKINGS. Heartbeat 10 phút sẽ tự xử lý, hoặc menu Điểm danh → Xử lý các dòng huỷ bị sót.'), null);
  });
}

/** Dòng Cancelled có tutor (từng là booking thật) và cột L chưa ghi "Huỷ …" → chưa gửi email / xoá lịch. */
function isPendingCancellation_(r) {
  var C = CONFIG.BOOKING_COLS;
  return String(r[C.STATUS - 1] || '').trim() === CONFIG.STATUS.CANCELLED && !!String(r[C.TUTOR_ID - 1] || '').trim() &&
    String(r[C.FAIL_REASON - 1] || '').indexOf(CONFIG.CANCEL_NOTE_PREFIX) !== 0;
}

/** Huỷ các dòng đang chờ trong [r0, r1]. fromDate: chỉ xử lý buổi từ ngày này (null = mọi ngày). Sync 1 lần ở cuối. */
function processCancellationsInRows_(sheet, r0, r1, fromDate) {
  var C = CONFIG.BOOKING_COLS, data = sheet.getRange(r0, 1, r1 - r0 + 1, CONFIG.BOOKING_NUM_COLS).getValues(), n = 0;
  for (var i = 0; i < data.length; i++) {
    if (!isPendingCancellation_(data[i])) continue;
    if (fromDate) { var d = data[i][C.DATE - 1]; if (!(d instanceof Date) || toMidnight_(d) < toMidnight_(fromDate)) continue; }
    cancelBookingRow_(sheet, r0 + i, { skipSync: true }); n++;
  }
  if (n) { try { updateFormOptions(); } catch (e) { Logger.log('updateFormOptions: ' + e.message); } }
  return n;
}

/** Lưới an toàn: trigger onEdit lỗi / bận → heartbeat bắt lại. Chỉ buổi từ hôm nay (không gửi email huỷ cho buổi đã qua). */
function processPendingCancellations_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var n = processCancellationsInRows_(sheet, 2, sheet.getLastRow(), getNow_());
  if (n) Logger.log('processPendingCancellations_: ' + n + ' dòng');
  return n;
}
function processPendingCancellations() {
  var n = withScriptLock_('processPendingCancellations', processPendingCancellations_);
  toast_('Đã xử lý ' + (n || 0) + ' dòng huỷ bị sót');
  return n;
}

/**
 * Tách riêng để test được: xoá Calendar event, ghi lý do, email, sync slot.
 * Idempotent: cột L đã bắt đầu bằng CANCEL_NOTE_PREFIX → đã xử lý, bỏ qua.
 */
function cancelBookingRow_(sheet, row, opts) {
  opts = opts || {};
  clearCache_();
  SpreadsheetApp.flush();
  var C = CONFIG.BOOKING_COLS, bookingRow = sheet.getRange(row, 1, 1, CONFIG.BOOKING_NUM_COLS).getValues()[0];
  var note = String(bookingRow[C.FAIL_REASON - 1] || '');
  if (note.indexOf(CONFIG.CANCEL_NOTE_PREFIX) === 0) { Logger.log('Dòng ' + row + ' đã xử lý huỷ trước đó → bỏ qua'); return { eventId: '', calendarDeleted: false, skipped: true }; }
  var eventId = String(bookingRow[C.EVENT_ID - 1] || '');
  var calendarDeleted = eventId ? deleteMeetEvent_(eventId) : false;
  sheet.getRange(row, C.FAIL_REASON).setValue(CONFIG.CANCEL_NOTE_PREFIX + formatDateTime_(getNow_()) + ' — đã hoàn buổi' + (calendarDeleted ? ', đã xoá lịch' : '') + (note ? ' · ' + note : ''));
  SpreadsheetApp.flush();
  try { restoreStudentAfterRefund_(bookingRow[C.STUDENT_EMAIL - 1]); } catch (e0) { Logger.log('restoreStudentAfterRefund_: ' + e0.message); }
  try { sendCancelNotification(bookingRow); } catch (err) { Logger.log('Email huỷ: ' + err.message); }
  if (!opts.skipSync) { try { updateFormOptions(); } catch (err2) { Logger.log('updateFormOptions: ' + err2.message); } }
  flushMailErrors_('huỷ booking dòng ' + row);
  Logger.log('Huỷ booking dòng ' + row + ' · event ' + (eventId || '—') + (calendarDeleted ? ' đã xoá' : ''));
  return { eventId: eventId, calendarDeleted: calendarDeleted, skipped: false };
}


// ══════════════════════════════════════════════════════════
//  T1 — KIỂM TRA HỆ THỐNG (3 spreadsheet)
// ══════════════════════════════════════════════════════════

function testSystem() {
  var errors = 0, warnings = 0;
  Logger.log('══ T1 · KIỂM TRA HỆ THỐNG v' + CONFIG.VERSION + ' ══');

  // Config
  if (CONFIG.ADMIN_EMAIL.indexOf('PASTE_') === 0) { Logger.log('  LỖI  ADMIN_EMAIL chưa điền'); errors++; }
  if (!CONFIG.TUTOR_SS_ID) { Logger.log('  CHÚ Ý TUTOR_SS_ID trống → dùng tab trong file này'); warnings++; }
  if (!CONFIG.REGISTRATION_SS_ID) { Logger.log('  CHÚ Ý REGISTRATION_SS_ID trống → dùng tab trong file này'); warnings++; }

  // Timezone project — sai cái này thì mọi phép tính ngày lệch
  try {
    var tz = Session.getScriptTimeZone();
    if (tz === CONFIG.TIMEZONE) Logger.log('  OK   timezone project = ' + tz);
    else { Logger.log('  LỖI  timezone project = ' + tz + ' (cần ' + CONFIG.TIMEZONE + ') → Project Settings → Time zone'); errors++; }
  } catch (tzErr) { }

  // Giả lập thời gian còn bật?
  var sim = PropertiesService.getScriptProperties().getProperty('SIM_NOW');
  if (sim) { Logger.log('  CẢNH BÁO SIM_NOW đang bật = ' + sim + ' → chạy clearSimulatedNow() trước khi go live'); warnings++; }

  // Timezone từng spreadsheet (khác timezone project) → ngày đọc ra có thể lệch 1 ngày
  var tzSeen = {}, tzList = [['Main', function () { return SpreadsheetApp.getActive(); }], ['Tutor', getTutorSpreadsheet_], ['Registration', getRegistrationSpreadsheet_]];
  for (var z = 0; z < tzList.length; z++) {
    try {
      var zs = tzList[z][1](); if (tzSeen[zs.getId()]) continue; tzSeen[zs.getId()] = true;
      var stz = zs.getSpreadsheetTimeZone();
      if (stz === CONFIG.TIMEZONE) Logger.log('  OK   timezone spreadsheet ' + tzList[z][0]);
      else { Logger.log('  LỖI  timezone spreadsheet ' + tzList[z][0] + ' = ' + stz + ' (cần ' + CONFIG.TIMEZONE + ') → menu 1. Khởi tạo'); errors++; }
    } catch (ze) { }
  }

  // Main
  var main = SpreadsheetApp.getActive();
  var mainTabs = [CONFIG.SHEETS.DASHBOARD, CONFIG.SHEETS.STUDENT_INFO, CONFIG.SHEETS.CHECK_SLOT, CONFIG.SHEETS.BOOKINGS, CONFIG.SHEETS.PAYROLL];
  for (var i = 0; i < mainTabs.length; i++) { if (main.getSheetByName(mainTabs[i])) Logger.log('  OK   [Main] ' + mainTabs[i]); else { Logger.log('  LỖI  [Main] thiếu ' + mainTabs[i]); errors++; } }
  var bk = main.getSheetByName(CONFIG.SHEETS.BOOKINGS);
  if (bk && bk.getLastColumn() < CONFIG.BOOKING_NUM_COLS) { Logger.log('  LỖI  BOOKINGS có ' + bk.getLastColumn() + ' cột, cần ' + CONFIG.BOOKING_NUM_COLS + ' (thêm header N: EventID)'); errors++; }

  // Registration
  try {
    var reg = getRegistrationSpreadsheet_();
    var regTabs = [CONFIG.SHEETS.PACKAGES, CONFIG.SHEETS.REGISTRATION];
    for (var j = 0; j < regTabs.length; j++) { if (reg.getSheetByName(regTabs[j])) Logger.log('  OK   [Registration] ' + regTabs[j]); else { Logger.log('  LỖI  [Registration] thiếu ' + regTabs[j]); errors++; } }
  } catch (rErr) { Logger.log('  LỖI  không mở được Registration spreadsheet: ' + rErr.message); errors++; }

  // Tutor
  try {
    var tut = getTutorSpreadsheet_();
    if (!tut.getSheetByName(CONFIG.SHEETS.TUTOR_INFO)) { Logger.log('  LỖI  [Tutor] thiếu TUTOR_INFO'); errors++; }
    clearCache_();
    var tutors = getActiveTutors_();
    Logger.log('  Tutor Active: ' + tutors.length);
    if (tutors.length === 0) { Logger.log('  LỖI  không có tutor Active'); errors++; }
    var wr = getActiveWeekRange_(), weekKeys = [];
    for (var wd = 0; wd < 7; wd++) weekKeys.push(dateKey_(makeNoon_(wr.monday.getFullYear(), wr.monday.getMonth(), wr.monday.getDate() + wd)));
    var missingDays = function (sh) { var have = {}, d = sh.getDataRange().getValues(); for (var r = 1; r < d.length; r++) if (d[r][0] instanceof Date) have[dateKey_(d[r][0])] = true; return weekKeys.filter(function (k) { return !have[k]; }).length; };
    for (var t = 0; t < tutors.length; t++) {
      var tsh = tut.getSheetByName(CONFIG.TUTOR_SHEET_PREFIX + tutors[t].name);
      if (!tsh) { Logger.log('  LỖI  [Tutor] thiếu tab ' + CONFIG.TUTOR_SHEET_PREFIX + tutors[t].name); errors++; continue; }
      var md = missingDays(tsh); if (md) { Logger.log('  LỖI  [Tutor] tab ' + tsh.getName() + ' thiếu ' + md + ' ngày tuần active → menu 1. Khởi tạo'); errors++; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(tutors[t].email)) { Logger.log('  CHÚ Ý tutor ' + tutors[t].name + ' email không hợp lệ ("' + tutors[t].email + '") → không nhận được lịch dạy'); warnings++; }
    }
    var cs = main.getSheetByName(CONFIG.SHEETS.CHECK_SLOT);
    if (cs) { var mc = missingDays(cs); if (mc) { Logger.log('  LỖI  CHECK_SLOT thiếu ' + mc + ' ngày tuần active → menu 1. Khởi tạo'); errors++; } else Logger.log('  OK   CHECK_SLOT đủ 7 ngày tuần active'); }
  } catch (tErr) { Logger.log('  LỖI  không mở được Tutor spreadsheet: ' + tErr.message); errors++; }

  // Công thức STUDENT_INFO (v6.1.0): thiếu → HV không đặt được; giới hạn $2000 → quá 2000 dòng BOOKINGS thì không trừ buổi
  try {
    var info = main.getSheetByName(CONFIG.SHEETS.STUDENT_INFO), S = CONFIG.STUDENT_COLS;
    if (info && info.getLastRow() >= 2) {
      var rg = info.getRange(2, 1, info.getLastRow() - 1, S.REMAINING), iv = rg.getValues(), ifx = rg.getFormulas(), missing = 0, legacy = 0;
      for (var q = 0; q < iv.length; q++) {
        if (!String(iv[q][S.EMAIL - 1] || '').trim()) continue;
        var fU = ifx[q][S.USED - 1];
        if (!fU || !ifx[q][S.REMAINING - 1]) missing++;
        else if (fU.replace(LEGACY_RANGE_RE_, '$1') !== fU) legacy++;
      }
      if (missing) { Logger.log('  LỖI  ' + missing + ' học viên thiếu công thức số buổi → menu Học viên → Sửa công thức số buổi'); errors++; }
      if (legacy) { Logger.log('  LỖI  ' + legacy + ' học viên dùng công thức cũ giới hạn 2000 dòng → menu Học viên → Sửa công thức số buổi'); errors++; }
      if (!missing && !legacy) Logger.log('  OK   công thức số buổi STUDENT_INFO');
    }
  } catch (fe) { Logger.log('  CHÚ Ý không đọc được công thức STUDENT_INFO: ' + fe.message); warnings++; }

  // Form + trigger
  if (!getBookingFormId_()) { Logger.log('  CHÚ Ý chưa có form đặt lịch (menu 2)'); warnings++; }
  if (!getRegistrationFormId_()) { Logger.log('  CHÚ Ý chưa có form đăng ký (menu 2)'); warnings++; }
  try {
    var trg = ScriptApp.getProjectTriggers(), n = trg.length, handlers = {};
    for (var h = 0; h < trg.length; h++) handlers[trg[h].getHandlerFunction()] = true;
    if (n < 8) { Logger.log('  CHÚ Ý mới có ' + n + '/8 trigger (menu 3)'); warnings++; } else Logger.log('  OK   ' + n + ' trigger');
    if (!handlers.heartbeat) { Logger.log('  CHÚ Ý chưa có trigger heartbeat (v6.1.0) → menu 3. Tạo/cập nhật 8 trigger'); warnings++; }
  } catch (e3) { }

  // Quota email ngày
  try { var mq = MailApp.getRemainingDailyQuota(); if (mq < 50) { Logger.log('  CHÚ Ý chỉ còn ' + mq + ' email hôm nay'); warnings++; } else Logger.log('  OK   còn ' + mq + ' email hôm nay'); } catch (me) { }

  // Calendar
  try { Calendar.Events.list('primary', { maxResults: 1 }); Logger.log('  OK   Calendar API'); } catch (ce) { Logger.log('  LỖI  Calendar API chưa bật (Services → + → Google Calendar API)'); errors++; }

  var range = getActiveWeekRange_();
  Logger.log('  Tuần active: ' + formatDate_(range.monday) + ' → ' + formatDate_(range.sunday));
  Logger.log('  KẾT QUẢ: ' + errors + ' lỗi, ' + warnings + ' cảnh báo');
  toast_('Kiểm tra hệ thống: ' + errors + ' lỗi, ' + warnings + ' cảnh báo. Chi tiết: Extensions → Apps Script → Executions');
  return errors;
}


// ══════════════════════════════════════════════════════════
//  TEST HELPERS
// ══════════════════════════════════════════════════════════

var TEST_NOTE_ = 'TEST_SEED';
var TEST_STUDENTS_ = [
  ['sim@test.com', 'Sim Student', 20], ['nocredit@test.com', 'NoCredit Test', 0], ['low@test.com', 'LowBalance Test', 2],
  ['bao@test.com', 'Bao OverBudget', 1], ['alice@test.com', 'Alice', 5], ['bob@test.com', 'Bob', 5], ['carol@test.com', 'Carol', 5]
];

function buildFakeSubmit_(email, name, studentId, daySlotMap) {
  var values = [getNow_().toISOString(), email, name, studentId];
  for (var i = 0; i < CONFIG.DAY_LABELS.length; i++) values.push(daySlotMap[CONFIG.DAY_LABELS[i]] || '');
  return { values: values };
}

/** Tìm slot tuần active có >= minAvail chỗ VÀ còn đặt được (không phải quá khứ). */
function findAvailableSlot_(minAvail) {
  var range = getActiveWeekRange_(), sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT);
  var data = sheet.getDataRange().getValues(), headers = data[0];
  for (var d = 0; d < 7; d++) {
    var target = makeNoon_(range.monday.getFullYear(), range.monday.getMonth(), range.monday.getDate() + d);
    for (var r = 1; r < data.length; r++) {
      if (!sameDate_(data[r][0], target)) continue;
      for (var c = 2; c < headers.length; c++) {
        var slot = String(headers[c]).trim();
        if (Number(data[r][c]) >= minAvail && isSlotBookable_(data[r][0], slot))
          return { date: data[r][0], timeSlot: slot, dayLabel: getDayName_(data[r][0]), available: Number(data[r][c]) };
      }
    }
  }
  return null;
}

function logLastBookings_(n) {
  var bk = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS), last = bk.getLastRow();
  if (last <= 1) { Logger.log('  BOOKINGS trống'); return; }
  var start = Math.max(2, last - n + 1), rows = bk.getRange(start, 1, last - start + 1, CONFIG.BOOKING_NUM_COLS).getValues(), C = CONFIG.BOOKING_COLS;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], dstr = (r[C.DATE - 1] instanceof Date) ? formatDate_(r[C.DATE - 1]) : r[C.DATE - 1];
    Logger.log('    ' + r[C.STUDENT_EMAIL - 1] + ' · ' + dstr + ' ' + r[C.TIME_SLOT - 1] + ' · tutor=' + (r[C.TUTOR_NAME - 1] || '—') + ' · ' + r[C.STATUS - 1] + (r[C.FAIL_REASON - 1] ? ' · ' + r[C.FAIL_REASON - 1] : ''));
  }
}

function logQuotaByEmail_(email, label) {
  var q = getStudentQuotaByEmail_(email);
  Logger.log('  ' + (label || 'Quota') + ' ' + email + ': total=' + q.total + ' used=' + q.used + ' remaining=' + q.remaining + (q.found ? '' : ' (NOT FOUND)'));
  return q;
}


// ══════════════════════════════════════════════════════════
//  T0 — NẠP HỌC VIÊN TEST
// ══════════════════════════════════════════════════════════

function testSeedStudents() {
  Logger.log('══ T0 · NẠP HỌC VIÊN TEST ══');
  var info = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO), S = CONFIG.STUDENT_COLS;
  var idx = buildStudentEmailIndex_(), nextId = getNextStudentIdNumber_(info, { getDataRange: function () { return { getValues: function () { return [[]]; } }; } }), added = 0;
  for (var i = 0; i < TEST_STUDENTS_.length; i++) {
    var email = TEST_STUDENTS_[i][0];
    if (idx[email]) { Logger.log('  Có sẵn: ' + email); continue; }
    var row = getFirstEmptyStudentRow_(info), sid = CONFIG.ID_PREFIX.STUDENT + ('00' + nextId).slice(-3); nextId++;
    info.getRange(row, S.STUDENT_ID).setValue(sid);
    info.getRange(row, S.EMAIL).setValue(email);
    info.getRange(row, S.NAME).setValue(TEST_STUDENTS_[i][1]);
    info.getRange(row, S.PACKAGE).setValue('TEST');
    info.getRange(row, S.TOTAL).setValue(TEST_STUDENTS_[i][2]);
    info.getRange(row, S.ACTIVATED_AT).setValue(getNow_()).setNumberFormat('dd/MM/yyyy');
    info.getRange(row, S.STATUS).setValue(CONFIG.STUDENT_STATUS.ACTIVE);
    info.getRange(row, S.NOTE).setValue(TEST_NOTE_);
    ensureStudentFormulas_(info, row);   // cột F, G phải có công thức như các dòng thật
    idx[email] = { id: sid, row: row }; added++;
  }
  SpreadsheetApp.flush();
  Logger.log('  Nạp ' + added + ' học viên test (ghi chú ' + TEST_NOTE_ + '). resetBookings() sẽ xoá.');
}


// ══════════════════════════════════════════════════════════
//  T2 — ĐÁNH x MẪU (vào Tutor spreadsheet)
// ══════════════════════════════════════════════════════════

function testSeedTutorAvailability() {
  Logger.log('══ T2 · ĐÁNH x MẪU ══');
  ensureActiveWeekRows_();
  var range = getActiveWeekRange_(), seedSlots = ['19:00 - 19:25', '20:00 - 20:25', '21:00 - 21:25'];
  var tutors = getActiveTutors_(), tutorSS = getTutorSpreadsheet_(), marked = 0;
  for (var t = 0; t < tutors.length; t++) {
    var sheet = tutorSS.getSheetByName(CONFIG.TUTOR_SHEET_PREFIX + tutors[t].name);
    if (!sheet) continue;
    var data = sheet.getDataRange().getValues(), headers = data[0];
    for (var d = 0; d < 7; d++) {
      var target = makeNoon_(range.monday.getFullYear(), range.monday.getMonth(), range.monday.getDate() + d);
      for (var r = 1; r < data.length; r++) {
        if (!sameDate_(data[r][0], target)) continue;
        for (var s = 0; s < seedSlots.length; s++)
          for (var c = 2; c < headers.length; c++)
            if (String(headers[c]).trim() === seedSlots[s]) { sheet.getRange(r + 1, c + 1).setValue('x'); marked++; }
        break;
      }
    }
  }
  SpreadsheetApp.flush();
  clearCache_();
  Logger.log('  Tổng: ' + marked + ' ô đánh x');
  try { updateFormOptions(); } catch (e) { }
}


// ══════════════════════════════════════════════════════════
//  T3 → T9
// ══════════════════════════════════════════════════════════

function testSimulateSubmit() {
  Logger.log('══ T3 · ĐẶT 1 BUỔI ══');
  var slot = findAvailableSlot_(1);
  if (!slot) { Logger.log('  Không có slot đặt được. Chạy T2 (và kiểm tra tuần active không phải quá khứ).'); return; }
  var before = logQuotaByEmail_('sim@test.com', 'Trước');
  if (!before.found) { Logger.log('  Chạy T0 trước'); return; }
  var map = {}; map[slot.dayLabel] = slot.timeSlot;
  clearCache_(); processBooking_(buildFakeSubmit_('sim@test.com', 'Sim Student', '', map));
  var after = logQuotaByEmail_('sim@test.com', 'Sau  ');
  logLastBookings_(1);
  Logger.log('  KỲ VỌNG: remaining giảm 1 → ' + (after.remaining === before.remaining - 1 ? 'ĐẠT' : 'KHÔNG ĐẠT'));
}

function testSimulateMultipleStudents() {
  Logger.log('══ T4 · 3 HỌC VIÊN CÙNG SLOT ══');
  var slot = findAvailableSlot_(3);
  if (!slot) { Logger.log('  Cần ≥3 tutor rảnh cùng slot. Chạy T2 trước.'); return; }
  var students = [['alice@test.com', 'Alice'], ['bob@test.com', 'Bob'], ['carol@test.com', 'Carol']];
  for (var i = 0; i < students.length; i++) {
    var map = {}; map[slot.dayLabel] = slot.timeSlot;
    clearCache_(); processBooking_(buildFakeSubmit_(students[i][0], students[i][1], '', map));
    Utilities.sleep(300);
  }
  logLastBookings_(3);
  Logger.log('  KỲ VỌNG: 3 Active, 3 tutor KHÁC NHAU (Round Robin)');
}

function testSimulateQuotaExhausted() {
  Logger.log('══ T5 · HẾT BUỔI ══');
  var q = logQuotaByEmail_('nocredit@test.com', 'Trước');
  if (!q.found) { Logger.log('  Chạy T0 trước'); return; }
  var slot = findAvailableSlot_(1); if (!slot) { Logger.log('  Chạy T2 trước'); return; }
  var map = {}; map[slot.dayLabel] = slot.timeSlot;
  clearCache_(); processBooking_(buildFakeSubmit_('nocredit@test.com', 'NoCredit Test', '', map));
  logLastBookings_(1);
  Logger.log('  KỲ VỌNG: Failed · ' + CONFIG.FAIL_REASONS.NO_CREDITS);
}

function testSimulateLowBalance() {
  Logger.log('══ T6 · CÒN 1 BUỔI ══');
  var q = logQuotaByEmail_('low@test.com', 'Trước');
  if (!q.found) { Logger.log('  Chạy T0 trước'); return; }
  resetBalanceAlertFlagsByEmail_('low@test.com');
  var slot = findAvailableSlot_(1); if (!slot) { Logger.log('  Chạy T2 trước'); return; }
  var map = {}; map[slot.dayLabel] = slot.timeSlot;
  clearCache_(); processBooking_(buildFakeSubmit_('low@test.com', 'LowBalance Test', '', map));
  logQuotaByEmail_('low@test.com', 'Sau  ');
  logLastBookings_(1);
  Logger.log('  KỲ VỌNG: Active + email "Bạn còn 1 buổi"');
}

function testSimulateOverBudget() {
  Logger.log('══ T7 · VƯỢT QUOTA (bao@test.com có 1 buổi, đặt 2 ngày) ══');
  var q = logQuotaByEmail_('bao@test.com', 'Trước');
  if (!q.found) { Logger.log('  Chạy T0 trước'); return; }
  var range = getActiveWeekRange_(), sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT);
  var data = sheet.getDataRange().getValues(), headers = data[0], map = {}, picked = 0;
  for (var d = 0; d < 7 && picked < 2; d++) {
    var target = makeNoon_(range.monday.getFullYear(), range.monday.getMonth(), range.monday.getDate() + d);
    for (var r = 1; r < data.length; r++) {
      if (!sameDate_(data[r][0], target)) continue;
      for (var c = 2; c < headers.length; c++) {
        var slot = String(headers[c]).trim();
        if (Number(data[r][c]) >= 1 && isSlotBookable_(data[r][0], slot)) { map[getDayName_(data[r][0])] = slot; picked++; break; }
      }
      break;
    }
  }
  if (picked < 2) { Logger.log('  Cần ≥2 ngày có slot. Chạy T2 trước.'); return; }
  clearCache_(); processBooking_(buildFakeSubmit_('bao@test.com', 'Bao OverBudget', '', map));
  logLastBookings_(2);
  Logger.log('  KỲ VỌNG: 1 Active + 1 Failed · ' + CONFIG.FAIL_REASONS.OVER_BUDGET);
}

function testSimulateCancel() {
  Logger.log('══ T8 · HUỶ + HOÀN BUỔI ══');
  var bk = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS), data = bk.getDataRange().getValues(), C = CONFIG.BOOKING_COLS, targetRow = -1;
  for (var r = data.length - 1; r >= 1; r--) if (data[r][C.STATUS - 1] === CONFIG.STATUS.ACTIVE) { targetRow = r + 1; break; }
  if (targetRow === -1) { Logger.log('  Không có booking Active'); return; }
  var email = data[targetRow - 1][C.STUDENT_EMAIL - 1], before = logQuotaByEmail_(email, 'Trước');
  bk.getRange(targetRow, C.STATUS).setValue(CONFIG.STATUS.CANCELLED);
  var res = cancelBookingRow_(bk, targetRow);
  var after = logQuotaByEmail_(email, 'Sau  ');
  Logger.log('  Calendar event ' + (res.eventId || '—') + (res.calendarDeleted ? ' đã xoá' : ' (không có/không xoá được)'));
  Logger.log('  KỲ VỌNG: remaining +1 → ' + (after.remaining === before.remaining + 1 ? 'ĐẠT' : 'KHÔNG ĐẠT'));
}

function testAttendance() {
  Logger.log('══ T9 · ĐIỂM DANH ══');
  var bk = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS), C = CONFIG.BOOKING_COLS, data = bk.getDataRange().getValues(), targetRow = -1;
  for (var r = data.length - 1; r >= 1; r--) if (data[r][C.STATUS - 1] === CONFIG.STATUS.ACTIVE) { targetRow = r + 1; break; }
  if (targetRow === -1) { Logger.log('  Chạy T3 trước'); return; }
  var y = getNow_(); y.setDate(y.getDate() - 2);
  bk.getRange(targetRow, C.DATE).setValue(new Date(y.getFullYear(), y.getMonth(), y.getDate())).setNumberFormat('dd/MM/yyyy');
  SpreadsheetApp.flush();
  var changed = markCompletedSessions();
  Logger.log('  markCompletedSessions → ' + changed + ' Completed. KỲ VỌNG ≥1');
  var d2 = bk.getDataRange().getValues();
  for (var r2 = d2.length - 1; r2 >= 1; r2--) if (d2[r2][C.STATUS - 1] === CONFIG.STATUS.COMPLETED) { markNoShow(d2[r2][C.BOOKING_ID - 1]); Logger.log('  NoShow: ' + d2[r2][C.BOOKING_ID - 1]); break; }
}


// ══════════════════════════════════════════════════════════
//  T10 — ARCHIVE THÁNG 8 → 9  ·  T11 — SLOT ĐÃ QUA
// ══════════════════════════════════════════════════════════

function testArchiveDemo() {
  var now = getNow_(), cy = now.getFullYear(), cm = now.getMonth() + 1, py = cm === 1 ? cy - 1 : cy, pm = cm === 1 ? 12 : cm - 1;
  var tag = py + '_' + ('0' + pm).slice(-2), days = new Date(cy, cm, 0).getDate();
  Logger.log('══ T10 · ARCHIVE THÁNG ' + pm + '/' + py + ' → REBUILD THÁNG ' + cm + '/' + cy + ' ══');
  var tutorSS = getTutorSpreadsheet_(), tutors = getActiveTutors_();
  var inMonth = function (v) { return v instanceof Date && v.getFullYear() === cy && v.getMonth() === cm - 1; };
  var countMarks = function () { var n = 0; for (var t = 0; t < tutors.length; t++) { var sh = tutorSS.getSheetByName(CONFIG.TUTOR_SHEET_PREFIX + tutors[t].name); if (!sh) continue; var d = sh.getDataRange().getValues(); for (var r = 1; r < d.length; r++) { if (!inMonth(d[r][0])) continue; for (var c = 2; c < d[r].length; c++) if (String(d[r][c]).trim().toLowerCase() === 'x') n++; } } return n; };
  var marksBefore = countMarks();   // đếm "x" tháng này TRƯỚC rebuild để chứng minh không bị mất
  try { archiveMonth(py, pm); } catch (e) { Logger.log('  LỖI archive: ' + e.message); return; }
  try { rebuildCurrentMonth(cy, cm); } catch (e2) { Logger.log('  LỖI rebuild: ' + e2.message); return; }
  Logger.log('  Archive ' + tag + ': ' + (listArchivedMonths().indexOf(tag) >= 0 ? 'ĐẠT' : 'KHÔNG ĐẠT'));
  var marksAfter = countMarks(), rows = 0;
  var cs = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT).getDataRange().getValues();
  for (var r3 = 1; r3 < cs.length; r3++) if (inMonth(cs[r3][0])) rows++;
  Logger.log('  "x" tháng này trước/sau rebuild: ' + marksBefore + '/' + marksAfter + ' → ' + (marksAfter >= marksBefore ? 'ĐẠT (không mất lịch tutor)' : 'KHÔNG ĐẠT'));
  Logger.log('  CHECK_SLOT dòng tháng này: ' + rows + '/' + days + ' → ' + (rows === days ? 'ĐẠT' : 'KHÔNG ĐẠT'));
}

function testPastSlotRejected() {
  Logger.log('══ T11 · SLOT ĐÃ QUA BỊ CHẶN ══');
  var q = logQuotaByEmail_('sim@test.com', 'Trước');
  if (!q.found) { Logger.log('  Chạy T0 trước'); return; }
  var range = getActiveWeekRange_(), now = getNow_(), pastDay = null;
  for (var d = 0; d < 7; d++) { var dt = makeNoon_(range.monday.getFullYear(), range.monday.getMonth(), range.monday.getDate() + d); if (toMidnight_(dt) < toMidnight_(now)) pastDay = dt; }
  if (!pastDay) { Logger.log('  Tuần active chưa có ngày nào qua. Dùng testSimulateNow("2026-09-25 20:00") rồi chạy lại.'); return; }
  var map = {}; map[getDayName_(pastDay)] = CONFIG.TIME_SLOTS[4];
  clearCache_(); processBooking_(buildFakeSubmit_('sim@test.com', 'Sim Student', '', map));
  var last = logQuotaByEmail_('sim@test.com', 'Sau  ');
  logLastBookings_(1);
  Logger.log('  KỲ VỌNG: Failed · ' + CONFIG.FAIL_REASONS.PAST_SLOT + ', quota không đổi → ' + (last.remaining === q.remaining ? 'ĐẠT' : 'KHÔNG ĐẠT'));
}


// ══════════════════════════════════════════════════════════
//  GIẢ LẬP THỜI GIAN
// ══════════════════════════════════════════════════════════

/** testSimulateNow('2026-09-22 18:30') → mọi hàm dùng getNow_() sẽ thấy giờ này. */
function testSimulateNow(dateTimeStr) {
  if (!dateTimeStr) { Logger.log('Cần truyền chuỗi, ví dụ testSimulateNow("2026-09-22 18:30")'); return; }
  var m = String(dateTimeStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) { Logger.log('Sai định dạng. Dùng YYYY-MM-DD hoặc YYYY-MM-DD HH:mm'); return; }
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 12), Number(m[5] || 0), 0);
  PropertiesService.getScriptProperties().setProperty('SIM_NOW', d.toISOString());
  NOW_CACHE_ = undefined;
  Logger.log('SIM_NOW = ' + formatDateTime_(getNow_()) + '  ⚠ nhớ clearSimulatedNow() trước khi go live');
  try { updateDashboardStats_(); } catch (e) { }
}
function clearSimulatedNow() {
  PropertiesService.getScriptProperties().deleteProperty('SIM_NOW');
  NOW_CACHE_ = undefined;
  Logger.log('Đã tắt giả lập thời gian. now = ' + formatDateTime_(getNow_()));
  try { updateDashboardStats_(); } catch (e) { }
}
/** testSetActiveWeek('2026-09-21') → đặt tuần active thủ công (thứ 2). */
function testSetActiveWeek(dateStr) {
  if (!dateStr) { Logger.log('Ví dụ: testSetActiveWeek("2026-09-21")'); return; }
  var p = String(dateStr).split('-'), monday = getMondayOfWeek_(makeNoon_(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  setActiveWeekStart_(monday);
  clearCache_();
  try { ensureActiveWeekRows_(); } catch (e) { Logger.log('ensureActiveWeekRows_: ' + e.message); }
  try { updateFormOptions(); } catch (e2) { Logger.log('updateFormOptions: ' + e2.message); }
}


// ══════════════════════════════════════════════════════════
//  CHẠY TẤT CẢ / DỌN
// ══════════════════════════════════════════════════════════

function runAllTests() {
  Logger.log('############################################');
  Logger.log('  TOÀN BỘ KỊCH BẢN TEST v' + CONFIG.VERSION + ' · ' + formatDateTime_(getNow_()));
  Logger.log('############################################\n');
  if (testSystem() > 0) { Logger.log('Sửa lỗi T1 trước.'); return; }
  var steps = [testSeedStudents, testSeedTutorAvailability, testSimulateSubmit, testSimulateMultipleStudents, testSimulateQuotaExhausted, testSimulateLowBalance, testSimulateOverBudget, testSimulateCancel, testAttendance, testArchiveDemo, testPastSlotRejected];
  for (var i = 0; i < steps.length; i++) { Logger.log(''); try { steps[i](); } catch (e) { Logger.log('  LỖI: ' + e.message); } }
  Logger.log('\n############################################');
  Logger.log('  XONG. Kiểm tra BOOKINGS, STUDENT_INFO, CHECK_SLOT, email. Rồi chạy resetBookings().');
  Logger.log('############################################');
}

/** Xoá BOOKINGS, ĐĂNG KÝ MỚI, học viên test, cờ cảnh báo, giả lập thời gian. Quota tự hồi vì là công thức. */
function resetBookings() {
  var ss = SpreadsheetApp.getActive();
  var bk = ss.getSheetByName(CONFIG.SHEETS.BOOKINGS);
  if (bk && bk.getLastRow() > 1) { bk.deleteRows(2, bk.getLastRow() - 1); Logger.log('  Xoá BOOKINGS'); }
  var dk = ss.getSheetByName(CONFIG.SHEETS.DANG_KY);
  if (dk && dk.getLastRow() > 1) { dk.deleteRows(2, dk.getLastRow() - 1); Logger.log('  Xoá ĐĂNG KÝ MỚI'); }
  var info = ss.getSheetByName(CONFIG.SHEETS.STUDENT_INFO), S = CONFIG.STUDENT_COLS, removed = 0;
  if (info) { var d = info.getDataRange().getValues(); for (var r = d.length - 1; r >= 1; r--) if (String(d[r][S.NOTE - 1]) === TEST_NOTE_) { info.deleteRow(r + 1); removed++; } }
  Logger.log('  Xoá ' + removed + ' học viên test');
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), n = 0;
  for (var k in all) if (k.indexOf('BAL_') === 0) { props.deleteProperty(k); n++; }
  props.deleteProperty('SIM_NOW'); NOW_CACHE_ = undefined;
  Logger.log('  Xoá ' + n + ' cờ cảnh báo, tắt giả lập thời gian');
  SpreadsheetApp.flush();
  clearCache_();
  try { updateFormOptions(); } catch (e) { }
  Logger.log('  Reset xong.');
}
