/**
 * Test harness for FormLink.gs (v5.2)
 * Mocks FormApp / ScriptApp / SpreadsheetApp to verify the linking mechanism.
 */
const fs = require('fs');

const PROPS = {}, LOGS = [];
global.Logger = { log: m => LOGS.push(String(m)) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = v; }, deleteProperty: k => { delete PROPS[k]; }, getProperties: () => ({ ...PROPS }) }) };
global.Utilities = { formatDate: (d, tz, f) => '260919_1200', sleep: () => { } };
global.MailApp = { sendEmail: () => { } };

/* ── Mock Sheet / Spreadsheet ── */
let SHEET_ID_SEQ = 100;
function mkSheet(name, rows) {
  return { _name: name, _id: ++SHEET_ID_SEQ, _rows: rows === undefined ? 1 : rows,
    getName() { return this._name; }, setName(n) { this._name = n; return this; },
    getSheetId() { return this._id; }, getLastRow() { return this._rows; }, getLastColumn() { return this._cols || 4; },
    _hdr: {}, getRange(r, c, nr, nc) { const self = this; const R = { getValues: () => [Array.from({length: nc || 1}, (_, i) => self._hdr[c + i] || '')], setValue(v) { self._hdr[c] = v; return R; }, setFontWeight() { return R; }, setDataValidation() { return R; } }; return R; },
    getDataRange: () => ({ getValues: () => [[]] }), setTabColor() { return this; } };
}
function mkSS(id, sheets) {
  return { _id: id, _sheets: sheets,
    getId() { return this._id; },
    getSheets() { return this._sheets.slice(); },
    getSheetByName(n) { return this._sheets.filter(s => s.getName() === n)[0] || null; },
    deleteSheet(sh) { this._sheets = this._sheets.filter(s => s !== sh); },
    insertSheet(n) { const s = mkSheet(n, 1); this._sheets.push(s); return s; },
    getUrl: () => 'https://mock' };
}

const MAIN_SS = mkSS('MAIN_ID', [mkSheet('DASHBOARD'), mkSheet('STUDENT_INFO', 7), mkSheet('CHECK_SLOT', 38), mkSheet('BOOKINGS', 1), mkSheet('ĐĂNG KÝ MỚI', 1), mkSheet('PAYROLL_REPORT')]);
const REG_SS = mkSS('REG_ID', [mkSheet('PACKAGES', 4), mkSheet('STUDENT_REGISTRATION', 9)]);
const TUTOR_SS = mkSS('TUTOR_ID', [mkSheet('TUTOR_INFO', 5)]);

global.SpreadsheetApp = {
  getActive: () => MAIN_SS,
  openById: id => (id === 'TUTOR_ID' ? TUTOR_SS : id === 'REG_ID' ? REG_SS : MAIN_SS),
  flush: () => { },
  newDataValidation: () => ({ requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) }) }),
  getUi: () => { throw new Error('no ui'); },
  DestinationType: { SPREADSHEET: 'SPREADSHEET' }
};

/* ── Mock Form ── */
function mkItem(title, type) {
  return { _t: title, _type: type, _form: null, _req: false,
    getTitle() { return this._t; }, setTitle(t) { this._t = t; return this; },
    setRequired(r) { this._req = r; return this; },
    setChoiceValues() { return this; }, setHelpText() { return this; },
    getIndex() { return this._form._items.indexOf(this); },
    asListItem() { return this; } };
}
function mkForm(id, items, destId) {
  const f = { _id: id, _items: [], _dest: destId || '', _collect: false,
    getId() { return this._id; },
    getItems() { return this._items.slice(); },
    getPublishedUrl() { return 'https://forms.gle/' + this._id; },
    setCollectEmail(v) { this._collect = v; return this; },
    setDescription() { return this; },
    getDestinationId() { if (!this._dest) throw new Error('no destination'); return this._dest; },
    removeDestination() { if (!this._dest) throw new Error('no destination'); this._dest = ''; return this; },
    setDestination(type, id) { this._dest = id; const s = mkSheet('Form Responses 1', 1); (id === 'REG_ID' ? REG_SS : MAIN_SS)._sheets.push(s); return this; },
    addTextItem() { const it = mkItem('', 'TEXT'); it._form = this; this._items.push(it); return it; },
    addListItem() { const it = mkItem('', 'LIST'); it._form = this; this._items.push(it); return it; },
    moveItem(from, to) { const it = this._items.splice(from, 1)[0]; this._items.splice(to, 0, it); return it; } };
  (items || []).forEach(([t, ty]) => { const it = mkItem(t, ty); it._form = f; f._items.push(it); });
  return f;
}

const FORMS = {};
global.FormApp = { openById: id => { if (!FORMS[id]) throw new Error('not found'); return FORMS[id]; }, DestinationType: { SPREADSHEET: 'SPREADSHEET' } };

/* ── Mock ScriptApp ── */
let TRIGGERS = [];
global.ScriptApp = {
  getProjectTriggers: () => TRIGGERS.slice(),
  deleteTrigger: t => { TRIGGERS = TRIGGERS.filter(x => x !== t); },
  newTrigger: h => ({ forForm: () => ({ onFormSubmit: () => ({ create: () => { const t = { getHandlerFunction: () => h }; TRIGGERS.push(t); return t; } }) }) })
};

/* ── Load code ── */
const files = ['Config.gs', 'Helpers.gs', 'FormUpdater.gs', 'FormLink.gs'];
global.Session = { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' };
let src = files.map(f => fs.readFileSync(__dirname + '/../src/' + f, 'utf8')).join('\n');
src += '\nmodule.exports={CONFIG,linkFormToSystem_,ensureFormSchema_,adoptResponseSheet_,checkFormLinks,extractFormId_,cleanupOrphanResponseTabs,getBookingFormId_,FORM_KIND,rebuildFormTrigger_};\n';
const mod = { exports: {} }; new Function('module', 'exports', src)(mod, mod.exports);
const API = mod.exports;
API.CONFIG.TUTOR_SS_ID = 'TUTOR_ID';
API.CONFIG.REGISTRATION_SS_ID = 'REG_ID';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  ok ? pass++ : fail++;
}
const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

// ═══ F1: form mới tinh, chưa có câu hỏi ═══
console.log('\n=== F1 · Form trống → tự dựng 9 câu hỏi đúng thứ tự ===');
FORMS['BK1'] = mkForm('BK1', [], '');
const r1 = API.linkFormToSystem_(FORMS['BK1'], 'booking');
check('9 câu hỏi', FORMS['BK1'].getItems().length, 9);
check('thứ tự đúng', FORMS['BK1'].getItems().map(i => i.getTitle()), ['Họ và tên', 'Student ID'].concat(DAYS));
check('collectEmail bật', FORMS['BK1']._collect, true);
check('destination = MAIN_ID', FORMS['BK1']._dest, 'MAIN_ID');

// ═══ F2: tab response đổi tên, template trống bị xoá ═══
console.log('\n=== F2 · Tab response nhận tên chuẩn, template trống bị xoá ===');
check('tab ĐĂNG KÝ MỚI tồn tại', !!MAIN_SS.getSheetByName('ĐĂNG KÝ MỚI'), true);
check('không còn Form Responses 1', !!MAIN_SS.getSheetByName('Form Responses 1'), false);
check('template trống bị xoá', r1.sheet.deleted.indexOf('trống') >= 0, true);
check('chỉ 1 tab tên ĐĂNG KÝ MỚI', MAIN_SS.getSheets().filter(s => s.getName() === 'ĐĂNG KÝ MỚI').length, 1);

// ═══ F3: trigger đúng 1 cái ═══
console.log('\n=== F3 · Trigger ===');
check('1 trigger onFormSubmitTrigger', TRIGGERS.filter(t => t.getHandlerFunction() === 'onFormSubmitTrigger').length, 1);
check('formId lưu vào Properties', PROPS['BOOKING_FORM_ID'], 'BK1');

// ═══ F4: chạy lại lần 2 (idempotent) ═══
console.log('\n=== F4 · Chạy lại lần 2 → không sinh tab/trigger thừa ===');
const sheetsBefore = MAIN_SS.getSheets().length;
const r2 = API.linkFormToSystem_(FORMS['BK1'], 'booking');
check('số tab không đổi', MAIN_SS.getSheets().length, sheetsBefore);
check('vẫn 1 trigger', TRIGGERS.filter(t => t.getHandlerFunction() === 'onFormSubmitTrigger').length, 1);
check('nhận diện already_linked', r2.steps, ['already_linked']);
check('không thêm câu hỏi', r2.schema.added, []);

// ═══ F5: form tạo lại (form thứ 2) → tab cũ có data thì backup ═══
console.log('\n=== F5 · Tạo lại form → tab cũ có dữ liệu được backup ===');
MAIN_SS.getSheetByName('ĐĂNG KÝ MỚI')._rows = 25;  // giả lập đã có 24 response
FORMS['BK2'] = mkForm('BK2', [], '');
const r3 = API.linkFormToSystem_(FORMS['BK2'], 'booking');
check('tab cũ đổi tên backup', r3.sheet.backup, 'ĐĂNG KÝ MỚI_BACKUP_260919_1200');
check('backup còn nguyên 25 dòng', MAIN_SS.getSheetByName('ĐĂNG KÝ MỚI_BACKUP_260919_1200').getLastRow(), 25);
check('tab mới tên ĐĂNG KÝ MỚI', !!MAIN_SS.getSheetByName('ĐĂNG KÝ MỚI'), true);
check('formId cập nhật sang BK2', PROPS['BOOKING_FORM_ID'], 'BK2');
check('vẫn chỉ 1 trigger', TRIGGERS.filter(t => t.getHandlerFunction() === 'onFormSubmitTrigger').length, 1);

// ═══ F6: form sai thứ tự câu hỏi → tự sắp lại ═══
console.log('\n=== F6 · Câu hỏi sai thứ tự → tự sắp lại ===');
FORMS['BK3'] = mkForm('BK3', [['Thứ 4', 'LIST'], ['Họ và tên', 'TEXT'], ['Chủ nhật', 'LIST'], ['Student ID', 'TEXT']], '');
const rep = API.ensureFormSchema_(FORMS['BK3'], 'booking');
check('thứ tự sau khi sửa', FORMS['BK3'].getItems().map(i => i.getTitle()), ['Họ và tên', 'Student ID'].concat(DAYS));
check('thêm 5 câu thiếu', rep.added.length, 5);
check('không có câu lạ', rep.extra, []);

// ═══ F7: form có câu hỏi lạ → cảnh báo, không xoá ═══
console.log('\n=== F7 · Câu hỏi lạ được cảnh báo, không bị xoá ===');
FORMS['BK4'] = mkForm('BK4', [['Ghi chú thêm', 'TEXT']], '');
const rep4 = API.ensureFormSchema_(FORMS['BK4'], 'booking');
check('câu lạ được liệt kê', rep4.extra, ['Ghi chú thêm']);
check('câu lạ vẫn còn', FORMS['BK4'].getItems().length, 10);
check('9 câu đầu đúng thứ tự', FORMS['BK4'].getItems().slice(0, 9).map(i => i.getTitle()), ['Họ và tên', 'Student ID'].concat(DAYS));

// ═══ F8: form đăng ký → đi vào REG spreadsheet ═══
console.log('\n=== F8 · Form đăng ký nối vào Registration spreadsheet ===');
FORMS['RG1'] = mkForm('RG1', [], '');
const r5 = API.linkFormToSystem_(FORMS['RG1'], 'registration');
check('destination = REG_ID', FORMS['RG1']._dest, 'REG_ID');
check('2 câu hỏi', FORMS['RG1'].getItems().map(i => i.getTitle()), ['Họ và tên', 'Gói đăng ký']);
check('tab cũ 9 dòng được backup', r5.sheet.backup, 'STUDENT_REGISTRATION_BACKUP_260919_1200');
check('MAIN không bị đụng', !!MAIN_SS.getSheetByName('STUDENT_REGISTRATION'), false);
check('1 trigger onRegistrationSubmit', TRIGGERS.filter(t => t.getHandlerFunction() === 'onRegistrationSubmit').length, 1);

// ═══ F9: extractFormId_ ═══
console.log('\n=== F8b · Tab đăng ký được bổ sung header E..I ===');
const regSheet = REG_SS.getSheetByName('STUDENT_REGISTRATION');
check('header E = Trạng thái TT', regSheet._hdr[5], 'Trạng thái TT');
check('header I = Synced', regSheet._hdr[9], 'Synced');
check('report.headers = 5', r5.headers, 5);

console.log('\n=== F9 · Nhận diện Form ID từ link ===');
check('link edit', API.extractFormId_('https://docs.google.com/forms/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz012345/edit'), '1AbC_dEfGhIjKlMnOpQrStUvWxYz012345');
check('ID trần', API.extractFormId_('1AbC_dEfGhIjKlMnOpQrStUvWxYz012345'), '1AbC_dEfGhIjKlMnOpQrStUvWxYz012345');
check('link publish bị chặn', API.extractFormId_('https://docs.google.com/forms/d/e/1FAIpQLSf_xxx/viewform'), '__PUBLISHED__');

// ═══ F10: dọn tab mồ côi ═══
console.log('\n=== F10 · Dọn tab response mồ côi ===');
MAIN_SS._sheets.push(mkSheet('Form Responses 2', 1));
MAIN_SS._sheets.push(mkSheet('Phản hồi biểu mẫu 3', 12));
const cl = API.cleanupOrphanResponseTabs();
check('xoá 1 tab trống', cl.deleted, 1);
check('đánh dấu 1 tab có data', cl.flagged, 1);
check('_ORPHAN_ tồn tại', !!MAIN_SS.getSheetByName('_ORPHAN_Phản hồi biểu mẫu 3'), true);
check('tab ĐĂNG KÝ MỚI không bị đụng', !!MAIN_SS.getSheetByName('ĐĂNG KÝ MỚI'), true);

// ═══ F11: health check ═══
console.log('\n=== F11 · checkFormLinks phát hiện sự cố ===');
const issuesOk = API.checkFormLinks();
check('0 vấn đề khi mọi thứ đúng', issuesOk, 0);
TRIGGERS.push({ getHandlerFunction: () => 'onFormSubmitTrigger' });  // giả lập trigger trùng
const issuesBad = API.checkFormLinks();
check('phát hiện trigger trùng', issuesBad, 1);

console.log('\n────────────────────────────────────');
console.log(`  KẾT QUẢ: ${pass} PASS · ${fail} FAIL`);
console.log('────────────────────────────────────');
process.exit(fail > 0 ? 1 : 0);
