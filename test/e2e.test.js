/**
 * Test đầu-cuối: triển khai từ ĐÚNG 3 file XLSX mẫu (qua test/fixtures/templates.json) theo đúng các bước
 * trong tài liệu, rồi chạy 1 tháng vận hành với đồng hồ giả:
 *   triển khai → tạo form → trigger → đăng ký + kích hoạt → tutor đánh x → đặt lịch qua form → huỷ bằng onEdit
 *   → điểm danh → nhắc tutor CN → chuyển tuần → sang tháng (archive) → payroll
 * Mọi hành động đi qua trigger / menu như người thật; không gọi hàm nội bộ để "đi tắt".
 *
 * Chạy: node test/e2e.test.js   (Node ≥ 18, không cần cài gì)
 */
const M = require('./gas-mock');
const fx = require('./fixtures/templates.json');

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}
const section = t => console.log('\n=== ' + t + ' ===');

// ── Dựng 3 spreadsheet từ template. Timezone lệch cố ý: XLSX upload nhận timezone người upload ──
M.setClock('2026-10-19 09:00');   // thứ 2
M.makeSpreadsheet('MAIN_ID', fx.MAIN, 'Australia/Sydney');
M.makeSpreadsheet('TUTOR_ID', fx.TUTOR, 'Asia/Ho_Chi_Minh');
M.makeSpreadsheet('REG_ID', fx.REGISTRATION, 'Europe/London');
M.installGlobals('MAIN_ID');
const API = M.loadProject(__dirname + '/../src');
// Bước 6 tài liệu: điền Config.gs
Object.assign(API.CONFIG, { ADMIN_EMAIL: 'admin@thaiput.test', TUTOR_SS_ID: 'TUTOR_ID', REGISTRATION_SS_ID: 'REG_ID', SCHOOL_EMAIL: 'hello@thaiput.test' });

const menu = fn => { API.__newExecution(); return API[fn](); };
const sheet = (ss, n) => M.sheetByName(M.SPREADSHEETS[ss], n);
const rowsOf = (ss, n) => { const r = sheet(ss, n); const out = []; for (let i = 1; i <= M.lastRow(r); i++) { const a = []; for (let j = 1; j <= 16; j++) a.push(M.value(r, i, j)); out.push(a); } return out; };
const p2 = n => ('0' + n).slice(-2);
const dk = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const datesIn = (ss, n) => rowsOf(ss, n).slice(1).filter(r => r[0] instanceof M.RealDate).map(r => dk(r[0]));
const SLOTS = API.CONFIG.TIME_SLOTS;
const mark = (tutor, day, slot) => { const rec = sheet('TUTOR_ID', 'Tutor-' + tutor), rows = rowsOf('TUTOR_ID', 'Tutor-' + tutor), r = rows.findIndex(x => x[0] instanceof M.RealDate && dk(x[0]) === day); if (r < 0) throw new Error('Tab Tutor-' + tutor + ' không có dòng ' + day); rec.rows[r][2 + SLOTS.indexOf(slot)] = 'x'; };
const bookings = () => rowsOf('MAIN_ID', 'BOOKINGS').slice(1).map(r => ({ id: r[0], email: r[3], tutor: r[5], date: r[6] instanceof M.RealDate ? dk(r[6]) : r[6], slot: r[7], meet: r[8], status: r[9], reason: r[11], eventId: r[13] }));
const student = email => { const rows = rowsOf('MAIN_ID', 'STUDENT_INFO'); const r = rows.find(x => x[1] === email); return r ? { id: r[0], total: r[4], used: r[5], remaining: r[6], status: r[8] } : null; };
const choices = day => { const f = M.FORMS[API.getBookingFormId_()]._rec.items.find(i => i.title === day); return f ? f.choices : null; };
const mails = pred => M.SENT.filter(pred);
const adminMails = () => mails(m => m.to === 'admin@thaiput.test');

// ═══════════════════════════════════════════════════════════════
section('1 · Template sạch, trước khởi tạo: testSystem phải báo lỗi');
check('Template không có học viên / booking giả', [rowsOf('MAIN_ID', 'STUDENT_INFO').length, rowsOf('MAIN_ID', 'BOOKINGS').length], [1, 1]);
check('Template không có ngày cố định', [datesIn('MAIN_ID', 'CHECK_SLOT').length, datesIn('TUTOR_ID', 'Tutor-Vân').length], [0, 0]);
check('BOOKINGS đủ 14 cột tiêu đề', rowsOf('MAIN_ID', 'BOOKINGS')[0].filter(String).length, 14);
check('testSystem trước khởi tạo > 0 lỗi (timezone + thiếu ngày)', menu('testSystem') > 0, true);

section('2 · Menu 1. Khởi tạo + kiểm tra hệ thống');
const initErrors = menu('initializeSystem');
check('0 lỗi sau khởi tạo', initErrors, 0);
check('Timezone 3 spreadsheet = Asia/Ho_Chi_Minh', ['MAIN_ID', 'TUTOR_ID', 'REG_ID'].map(i => M.SPREADSHEETS[i].tz), ['Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh']);
const cs = datesIn('MAIN_ID', 'CHECK_SLOT');
check('CHECK_SLOT: đủ 31 ngày tháng 10', cs.filter(d => d.startsWith('2026-10')).length, 31);
check('CHECK_SLOT: có tuần kế tiếp vắt sang tháng 11 (01/11)', cs.includes('2026-11-01'), true);
check('Tab tutor cùng lịch với CHECK_SLOT', datesIn('TUTOR_ID', 'Tutor-Minh'), cs);
check('Ngày sắp tăng dần, không trùng', cs.every((d, i) => i === 0 || d > cs[i - 1]), true);
check('Chạy lại khởi tạo an toàn (idempotent)', [menu('initializeSystem'), datesIn('MAIN_ID', 'CHECK_SLOT')], [0, cs]);

section('3 · Menu 2. Tạo 2 Form + 3. Tạo 8 trigger');
menu('setupAllForms');
const bookFormId = API.getBookingFormId_(), regFormId = API.getRegistrationFormId_();
check('2 form đã tạo, ID lưu Script Properties', [!!bookFormId, !!regFormId], [true, true]);
check('Tab response đặt lịch = ĐĂNG KÝ MỚI (thay template trống)', rowsOf('MAIN_ID', 'ĐĂNG KÝ MỚI')[0].slice(0, 5), ['Timestamp', 'Email Address', 'Họ và tên', 'Student ID', 'Thứ 2']);
check('Tab response đăng ký có đủ tiêu đề A–I', rowsOf('REG_ID', 'STUDENT_REGISTRATION')[0].slice(0, 9), ['Timestamp', 'Email Address', 'Họ và tên', 'Gói đăng ký', 'Trạng thái TT', 'StudentID', 'Số buổi', 'Học phí', 'Synced']);
check('Không còn tab "Form Responses" mồ côi', [...M.SPREADSHEETS.MAIN_ID.sheets, ...M.SPREADSHEETS.REG_ID.sheets].filter(s => /^Form Responses/.test(s.name)).length, 0);
check('Dropdown gói đăng ký nạp từ PACKAGES', M.FORMS[regFormId]._rec.items.find(i => i.title === 'Gói đăng ký').choices, ['Gói 12 buổi', 'Gói 24 buổi', 'Gói 48 buổi']);
check('Link form ghi DASHBOARD B11/B12', [/forms/.test(M.value(sheet('MAIN_ID', 'DASHBOARD'), 11, 2)), /forms/.test(M.value(sheet('MAIN_ID', 'DASHBOARD'), 12, 2))], [true, true]);
check('Chưa tutor nào đánh x → dropdown chỉ "Không chọn"', choices('Thứ 4'), ['Không chọn']);
check('8 trigger', menu('createAllTriggers'), 8);
check('Chạy lại menu 3 vẫn đúng 8 trigger (không trùng)', [menu('createAllTriggers'), M.TRIGGERS.length], [8, 8]);
check('Kiểm tra kết nối Form: 0 vấn đề', menu('checkFormLinks'), 0);
check('testSystem: 0 lỗi', menu('testSystem'), 0);

section('4 · Học viên đăng ký → admin xác nhận thanh toán → kích hoạt');
M.setClock('2026-10-19 10:00');
M.submitForm(regFormId, 'hoa@student.test', { 'Họ và tên': 'Lê Thị Hoa', 'Gói đăng ký': 'Gói 12 buổi' });
M.submitForm(regFormId, 'nam@student.test', { 'Họ và tên': 'Đặng Nam', 'Gói đăng ký': 'Gói 24 buổi' });
check('Chưa thanh toán → chưa kích hoạt', student('hoa@student.test'), null);
M.editCell('REG_ID', 'STUDENT_REGISTRATION', 2, 5, 'Đã thanh toán');
M.editCell('REG_ID', 'STUDENT_REGISTRATION', 3, 5, 'Đã thanh toán');
M.SENT.length = 0;
const act = menu('syncRegistrations');
check('Kích hoạt 2 học viên', [act.activated, act.updated, act.problems.length], [2, 0, 0]);
check('Hoa: S001, 12 buổi, còn 12, Active', student('hoa@student.test'), { id: 'S001', total: 12, used: 0, remaining: 12, status: 'Active' });
check('Nam: S002, 24 buổi', [student('nam@student.test').id, student('nam@student.test').remaining], ['S002', 24]);
check('Email chào mừng có link form đặt lịch', mails(m => m.to === 'hoa@student.test' && m.html.indexOf(bookFormId) >= 0).length, 1);
check('STUDENT_REGISTRATION ghi StudentID / Số buổi / Học phí / Synced', rowsOf('REG_ID', 'STUDENT_REGISTRATION')[1].slice(5, 9), ['S001', 12, 1560000, 'Yes']);
check('Kích hoạt lại không cộng thêm buổi', [menu('syncRegistrations').activated, student('hoa@student.test').total], [0, 12]);

section('5 · Tutor đánh x → heartbeat → dropdown form');
mark('Vân', '2026-10-21', '19:00 - 19:25'); mark('Ánh', '2026-10-21', '19:00 - 19:25');
mark('Vân', '2026-10-22', '20:00 - 20:25');
mark('Lan', '2026-10-19', '17:30 - 17:55');   // hôm nay: 17:30 cách 10:00 > 60 phút → còn đặt được
mark('Lan', '2026-10-19', '17:00 - 17:25');
M.fireTime('heartbeat');
check('Dropdown Thứ 4 có 19:00', choices('Thứ 4'), ['Không chọn', '19:00 - 19:25']);
check('Dropdown Thứ 5 có 20:00', choices('Thứ 5'), ['Không chọn', '20:00 - 20:25']);
check('Dropdown Thứ 2 (hôm nay) có 17:00, 17:30', choices('Thứ 2'), ['Không chọn', '17:00 - 17:25', '17:30 - 17:55']);
check('Mô tả form ghi đúng tuần', /19\/10\/2026 đến 25\/10\/2026/.test(M.FORMS[bookFormId]._rec.description), true);
M.setClock('2026-10-19 16:30');
M.fireTime('heartbeat');
check('16:30: slot 17:00 (< 60 phút) bị ẩn, 17:30 còn', choices('Thứ 2'), ['Không chọn', '17:30 - 17:55']);

section('6 · Học viên đặt lịch qua form');
M.SENT.length = 0;
M.submitForm(bookFormId, 'hoa@student.test', { 'Họ và tên': 'Lê Thị Hoa', 'Thứ 4': '19:00 - 19:25', 'Thứ 5': '20:00 - 20:25' });
let bk = bookings();
check('2 booking Active, có Meet + EventID', bk.map(b => [b.date, b.slot, b.status, !!b.meet, !!b.eventId]), [['2026-10-21', '19:00 - 19:25', 'Active', true, true], ['2026-10-22', '20:00 - 20:25', 'Active', true, true]]);
check('Hoa còn 10 buổi', student('hoa@student.test').remaining, 10);
check('2 sự kiện Calendar mời HV + tutor', Object.values(M.CAL).map(e => e.attendees.map(a => a.email).sort()), [['hoa@student.test', 'van@thaiput.com'], ['hoa@student.test', 'van@thaiput.com']]);
check('Email: 1 xác nhận HV + 1 lịch dạy tutor', [mails(m => m.to === 'hoa@student.test').length, mails(m => m.to === 'van@thaiput.com').length], [1, 1]);
check('Dropdown cập nhật NGAY: Thứ 5 20:00 hết chỗ', choices('Thứ 5'), ['Không chọn']);
check('Thứ 4 19:00 còn 1 chỗ (Ánh)', choices('Thứ 4'), ['Không chọn', '19:00 - 19:25']);
M.submitForm(bookFormId, 'nam@student.test', { 'Họ và tên': 'Đặng Nam', 'Thứ 4': '19:00 - 19:25' });
check('Nam vào Thứ 4 19:00 với tutor thứ 2 (Ánh)', bookings().slice(-1).map(b => [b.tutor, b.status]), [['Ánh', 'Active']]);
let blocked = ''; try { M.submitForm(bookFormId, 'nam@student.test', { 'Họ và tên': 'Đặng Nam', 'Thứ 4': '19:00 - 19:25' }); } catch (e) { blocked = e.message; }
check('Slot đầy biến khỏi form → HV khác không chọn được', /không có trong lựa chọn/.test(blocked), true);
M.submitForm(bookFormId, 'ghost@student.test', { 'Họ và tên': 'Ghost', 'Thứ 2': '17:30 - 17:55' });
check('Email chưa kích hoạt → Failed', bookings().slice(-1).map(b => [b.status, b.reason]), [['Failed', API.CONFIG.FAIL_REASONS.UNKNOWN_STUDENT]]);
check('Không lỗi hệ thống nào gửi admin', adminMails().filter(m => /Lỗi|LỖI|lock/.test(m.subject)).length, 0);

section('7 · Admin huỷ buổi (BOOKINGS cột J → Cancelled)');
M.SENT.length = 0;
const thuRow = bookings().findIndex(b => b.date === '2026-10-22') + 2, thuEvent = bookings()[thuRow - 2].eventId;
M.editCell('MAIN_ID', 'BOOKINGS', thuRow, 10, 'Cancelled');
check('Hoàn buổi: Hoa còn 11', student('hoa@student.test').remaining, 11);
check('Xoá sự kiện Calendar', M.CAL[thuEvent], undefined);
check('Email huỷ cho HV + tutor', [mails(m => m.to === 'hoa@student.test').length, mails(m => m.to === 'van@thaiput.com').length], [1, 1]);
check('Slot mở lại trên form', choices('Thứ 5'), ['Không chọn', '20:00 - 20:25']);
M.fireTime('heartbeat');
check('Heartbeat sau đó không xử lý huỷ lần 2', mails(m => m.to === 'hoa@student.test').length, 1);

section('8 · Điểm danh 00:30 + NoShow');
M.setClock('2026-10-22 00:30');
check('2 buổi Thứ 4 → Completed', M.fireTime('markCompletedSessions'), 2);
const namBooking = bookings().find(b => b.email === 'nam@student.test' && b.status === 'Completed');
API.__newExecution(); API.markNoShow(namBooking.id);
check('Nam NoShow, vẫn bị trừ buổi', [bookings().find(b => b.id === namBooking.id).status, student('nam@student.test').remaining], ['NoShow', 23]);

section('9 · Chủ nhật 06:00: nhắc tutor — tab phải có đủ tuần sau (vắt sang tháng 11)');
M.setClock('2026-10-25 06:00');
M.SENT.length = 0;
M.fireTime('sundayReminderTutors');
check('4 tutor nhận email nhắc tuần 26/10 → 01/11', mails(m => /Cập nhật lịch dạy tuần 26\/10\/2026/.test(m.subject)).length, 4);
const nextWeek = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
check('Tab tutor có đủ 7 ngày tuần sau', nextWeek.every(d => datesIn('TUTOR_ID', 'Tutor-Lan').includes(d)), true);
mark('Lan', '2026-10-26', '18:00 - 18:25'); mark('Lan', '2026-11-01', '18:00 - 18:25'); mark('Minh', '2026-11-01', '18:00 - 18:25');

section('10 · CN 23:00: chuyển tuần');
M.setClock('2026-10-25 23:00');
M.fireTime('weeklyRollover');
check('Tuần active = 26/10', API.formatDate_(API.getActiveWeekStart_()), '26/10/2026');
check('Dropdown tuần mới: Thứ 2 + Chủ nhật (01/11)', [choices('Thứ 2'), choices('Chủ nhật')], [['Không chọn', '18:00 - 18:25'], ['Không chọn', '18:00 - 18:25']]);
check('Dropdown tuần cũ đã xoá', choices('Thứ 4'), ['Không chọn']);
M.setClock('2026-10-26 08:00');
M.submitForm(bookFormId, 'hoa@student.test', { 'Họ và tên': 'Lê Thị Hoa', 'Chủ nhật': '18:00 - 18:25' });
check('Đặt Chủ nhật 01/11 thành công', bookings().slice(-1).map(b => [b.date, b.status]), [['2026-11-01', 'Active']]);

section('11 · 01/11 01:00: archive tháng 10, dựng tháng 11 — không mất x, không mất booking');
M.setClock('2026-11-01 01:00');
M.fireTime('monthlyRollover');
check('Archive tháng 10 ở Main + Tutor (ẩn)', [!!sheet('MAIN_ID', '_ARCHIVE_CHECK_SLOT_2026_10'), !!sheet('TUTOR_ID', '_ARCHIVE_Tutor-Lan_2026_10'), sheet('TUTOR_ID', '_ARCHIVE_Tutor-Lan_2026_10').hidden], [true, true, true]);
const lanRows = rowsOf('TUTOR_ID', 'Tutor-Lan'), nov1 = lanRows.find(r => r[0] instanceof M.RealDate && dk(r[0]) === '2026-11-01');
check('x của Lan ngày 01/11 còn nguyên', nov1[2 + SLOTS.indexOf('18:00 - 18:25')], 'x');
const cs2 = datesIn('MAIN_ID', 'CHECK_SLOT');
check('CHECK_SLOT: đủ 30 ngày tháng 11 + giữ tuần active (26/10)', [cs2.filter(d => d.startsWith('2026-11')).length, cs2[0]], [30, '2026-10-26']);
check('Booking 01/11 vẫn Active, slot tính là đã chiếm', [bookings().slice(-1)[0].status, choices('Chủ nhật')], ['Active', ['Không chọn', '18:00 - 18:25']]);

section('12 · Payroll tháng trước + trạng thái cuối');
M.setClock('2026-11-02 09:00');
menu('generatePayrollLastMonth');
const pr = rowsOf('MAIN_ID', 'PAYROLL_REPORT').slice(4).filter(r => r[0]);
check('Vân: 1 Completed × 120.000', pr.find(r => r[0] === 'Vân').slice(1, 7), [1, 0, 0, 1, 120000, 120000]);
check('Ánh: 1 NoShow (tính lương) × 120.000', pr.find(r => r[0] === 'Ánh').slice(1, 7), [0, 1, 0, 1, 120000, 120000]);
check('TỔNG CỘNG = 240.000', pr.find(r => r[0] === 'TỔNG CỘNG')[6], 240000);
check('Hoa: 12 − (1 Completed + 1 Active) = 10', student('hoa@student.test').remaining, 10);
M.fireTime('heartbeat');
check('DASHBOARD: tuần active + lần sync', [M.value(sheet('MAIN_ID', 'DASHBOARD'), 17, 2), /02\/11\/2026/.test(M.value(sheet('MAIN_ID', 'DASHBOARD'), 20, 2))], ['02/11/2026 → 08/11/2026', true]);
check('Heartbeat tự chuyển sang tuần 02/11 (trigger CN không bắn trong test)', API.formatDate_(API.getActiveWeekStart_()), '02/11/2026');
check('testSystem cuối: 0 lỗi', menu('testSystem'), 0);
check('BookingID không trùng', new Set(bookings().map(b => b.id)).size, bookings().length);
const unexpected = adminMails().filter(m => !/Booking thất bại|Tự chuyển tuần/.test(m.subject)).map(m => m.subject);
check('Admin không nhận email lỗi ngoài dự kiến', unexpected, []);

console.log('\n────────────────────────────────────');
console.log(`  KẾT QUẢ E2E: ${pass} PASS · ${fail} FAIL`);
console.log('────────────────────────────────────');
process.exit(fail > 0 ? 1 : 0);
