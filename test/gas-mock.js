/**
 * Mock Google Apps Script độ trung thực cao cho test/e2e.test.js.
 *
 * Khác harness.js (DB viết tay, mỗi test gọi thẳng hàm nội bộ):
 *   · Nạp 3 spreadsheet từ ĐÚNG file XLSX sẽ upload (test/fixtures/templates.json)
 *   · Đồng hồ giả (Date / Date.now) múi giờ Asia/Ho_Chi_Minh → cả hệ thống thấy cùng 1 "bây giờ"
 *   · Công thức chỉ tính ở ô có công thức, tính lại mỗi lần đọc (như Sheets thật)
 *   · FormApp: dropdown chỉ nhận lựa chọn đang có (HV không chọn được slot đã ẩn); submit ghi dòng
 *     vào tab response và bắn đúng trigger đã cài
 *   · ScriptApp: trigger chỉ chạy nếu thật sự được tạo bằng newTrigger(...).create()
 */
process.env.TZ = 'Asia/Ho_Chi_Minh';
const fs = require('fs');

// ── Đồng hồ ──
const RealDate = Date;
let NOW_MS = RealDate.now();
class MockDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW_MS); else super(...a); }
  static now() { return NOW_MS; }
}
global.Date = MockDate;
function setClock(str) {   // 'YYYY-MM-DD HH:mm' giờ Việt Nam
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  NOW_MS = new RealDate(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0).getTime();
}

// ── Spreadsheet ──
let SHEET_SEQ = 1000;
const SPREADSHEETS = {};
const colLetter = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
function reviveCell(v) { if (v && typeof v === 'object' && v.$date) return new Date(v.$date); return v; }

function makeSpreadsheet(id, tabs, tz) {
  const ss = { id, tz, sheets: [] };
  for (const [name, rows] of Object.entries(tabs)) addSheetRecord(ss, name, rows);
  SPREADSHEETS[id] = ss;
  return ss;
}
function addSheetRecord(ss, name, rows) {
  const rec = { ss, name, id: ++SHEET_SEQ, rows: [], formulas: {}, hidden: false };
  (rows || []).forEach((r, i) => r.forEach((v, j) => {
    if (v && typeof v === 'object' && v.$f) rec.formulas[(i + 1) + ',' + (j + 1)] = v.$f;
    setRaw(rec, i + 1, j + 1, v && v.$f ? '' : reviveCell(v));
  }));
  ss.sheets.push(rec);
  return rec;
}
function setRaw(rec, r, c, v) { while (rec.rows.length < r) rec.rows.push([]); const row = rec.rows[r - 1]; while (row.length < c) row.push(''); row[c - 1] = v; }
function getRaw(rec, r, c) { const row = rec.rows[r - 1]; return row && c - 1 < row.length ? row[c - 1] : ''; }
function lastRow(rec) { for (let r = rec.rows.length; r >= 1; r--) { if (rec.rows[r - 1].some(v => v !== '' && v !== null && v !== undefined)) return r; if (Object.keys(rec.formulas).some(k => +k.split(',')[0] === r)) return r; } return 0; }
function lastCol(rec) { let m = 0; for (const row of rec.rows) for (let c = row.length; c >= 1; c--) if (row[c - 1] !== '' && row[c - 1] !== undefined) { m = Math.max(m, c); break; } for (const k of Object.keys(rec.formulas)) m = Math.max(m, +k.split(',')[1]); return m; }

// Bộ tính công thức: đúng các mẫu hệ thống dùng. Gặp mẫu lạ → ném lỗi (test phải biết).
function sheetByName(ss, n) { return ss.sheets.find(s => s.name === n); }
function evalFormula(rec, f) {
  if (/^=MAX\(0,E(\d+)-F(\d+)\)$/.test(f)) { const [, a, b] = f.match(/^=MAX\(0,E(\d+)-F(\d+)\)$/); return Math.max(0, (Number(value(rec, +a, 5)) || 0) - (Number(value(rec, +b, 6)) || 0)); }
  if (/^=COUNTIF\(/.test(f)) {
    const m = f.match(/^=COUNTIF\(([^!]+)!([A-Z]):[A-Z],"([^"]+)"\)$/); const sh = sheetByName(rec.ss, m[1]); if (!sh) return 0;
    let n = 0; for (let r = 2; r <= lastRow(sh); r++) if (String(value(sh, r, colLetter(m[2]))) === m[3]) n++; return n;
  }
  if (/^=COUNTIFS\(/.test(f)) {
    const re = /COUNTIFS\(([^!]+)!\$([A-Z])\$(\d+):\$([A-Z])(?:\$(\d+))?,\$([A-Z])(\d+),[^!]+!\$([A-Z])\$\d+:\$[A-Z](?:\$\d+)?,"([^"]+)"\)/g;
    let total = 0, m, terms = 0;
    while ((m = re.exec(f))) {
      terms++;
      const sh = sheetByName(rec.ss, m[1]), from = +m[3], to = m[5] ? +m[5] : Infinity;
      const key = String(value(rec, +m[7], colLetter(m[6]))).toLowerCase(), c1 = colLetter(m[2]), c2 = colLetter(m[8]);
      if (!sh || !key) continue;
      for (let r = from; r <= Math.min(to, lastRow(sh)); r++) if (String(value(sh, r, c1)).toLowerCase() === key && String(value(sh, r, c2)) === m[9]) total++;
    }
    if (!terms) throw new Error('Mock: không hiểu công thức ' + f);
    return total;
  }
  throw new Error('Mock: không hiểu công thức ' + f);
}
function value(rec, r, c) { const f = rec.formulas[r + ',' + c]; return f ? evalFormula(rec, f) : getRaw(rec, r, c); }

function Range(rec, row, col, nr, nc) {
  const R = {
    getSheet: () => Sheet(rec), getRow: () => row, getColumn: () => col, getNumRows: () => nr, getNumColumns: () => nc, getLastRow: () => row + nr - 1,
    getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const a = []; for (let j = 0; j < nc; j++) a.push(value(rec, row + i, col + j)); o.push(a); } return o; },
    getValue: () => value(rec, row, col),
    getFormula: () => rec.formulas[row + ',' + col] || '',
    getFormulas: () => { const o = []; for (let i = 0; i < nr; i++) { const a = []; for (let j = 0; j < nc; j++) a.push(rec.formulas[(row + i) + ',' + (col + j)] || ''); o.push(a); } return o; },
    setValues: vals => { if (vals.length !== nr || vals.some(r => r.length !== nc)) throw new Error('Mock: setValues sai kích thước ' + vals.length + 'x' + (vals[0] || []).length + ' vs ' + nr + 'x' + nc); vals.forEach((r, i) => r.forEach((v, j) => { delete rec.formulas[(row + i) + ',' + (col + j)]; setRaw(rec, row + i, col + j, v); })); return R; },
    setValue: v => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { delete rec.formulas[(row + i) + ',' + (col + j)]; setRaw(rec, row + i, col + j, v); } return R; },
    setFormula: f => { setRaw(rec, row, col, ''); rec.formulas[row + ',' + col] = f; return R; },
    clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { delete rec.formulas[(row + i) + ',' + (col + j)]; if (getRaw(rec, row + i, col + j) !== '') setRaw(rec, row + i, col + j, ''); } return R; },
    sort: opt => { const c = (opt.column || 1) - col; const seg = []; for (let i = 0; i < nr; i++) seg.push((rec.rows[row - 1 + i] || []).slice()); seg.sort((a, b) => (a[c] instanceof RealDate && b[c] instanceof RealDate) ? a[c] - b[c] : 0); seg.forEach((r, i) => { rec.rows[row - 1 + i] = r; }); return R; },
    getNumberFormats: () => Array.from({ length: nr }, () => Array.from({ length: nc }, () => 'General')),
    setNumberFormat: () => R, setNumberFormats: f => { if (f.length !== nr) throw new Error('Mock: setNumberFormats sai kích thước'); return R; }, setFontWeight: () => R, setFontColor: () => R, setDataValidation: () => R, setBackground: () => R,
  };
  return R;
}
function Sheet(rec) {
  return {
    getName: () => rec.name, setName: n => { if (rec.ss.sheets.some(s => s !== rec && s.name === n)) throw new Error('Mock: tên tab trùng ' + n); rec.name = n; return Sheet(rec); },
    getSheetId: () => rec.id, getLastRow: () => lastRow(rec), getLastColumn: () => lastCol(rec),
    getDataRange: () => Range(rec, 1, 1, Math.max(1, lastRow(rec)), Math.max(1, lastCol(rec))),
    getRange: (a, c, nr, nc) => { if (typeof a === 'string') { const m = a.match(/^([A-Z]+)(\d+)$/); return Range(rec, +m[2], colLetter(m[1]), 1, 1); } return Range(rec, a, c, nr || 1, nc || 1); },
    deleteRows: (r, n) => { rec.rows.splice(r - 1, n); const f = {}; for (const [k, v] of Object.entries(rec.formulas)) { const [rr, cc] = k.split(',').map(Number); if (rr < r) f[k] = v; else if (rr >= r + n) f[(rr - n) + ',' + cc] = v; } rec.formulas = f; },
    deleteRow: r => Sheet(rec).deleteRows(r, 1),
    setTabColor: () => Sheet(rec), hideSheet: () => { rec.hidden = true; return Sheet(rec); }, isSheetHidden: () => rec.hidden,
    getActiveCell: () => null,
  };
}
function Spreadsheet(ss) {
  return {
    getId: () => ss.id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + ss.id + '/edit',
    getSheetByName: n => { const r = sheetByName(ss, n); return r ? Sheet(r) : null; },
    getSheets: () => ss.sheets.map(Sheet),
    insertSheet: n => Sheet(addSheetRecord(ss, n, [])),
    deleteSheet: sh => { ss.sheets = ss.sheets.filter(r => r.id !== sh.getSheetId()); },
    getSpreadsheetTimeZone: () => ss.tz, setSpreadsheetTimeZone: tz => { ss.tz = tz; },
    toast: () => {}, getActiveRange: () => null,
  };
}

// ── Forms ──
let FORM_SEQ = 0, RESP_SEQ = 0;
const FORMS = {};
function makeForm(title) {
  const id = 'FORM' + (++FORM_SEQ) + '_' + 'x'.repeat(30);
  const form = { id, title, items: [], dest: '', destSheetId: null, collectEmail: false, responses: [] };
  const Item = it => ({
    getTitle: () => it.title, setTitle: t => { it.title = t; return Item(it); }, setRequired: r => { it.required = r; return Item(it); },
    setChoiceValues: v => { it.choices = v.slice(); return Item(it); }, getIndex: () => form.items.indexOf(it), asListItem: () => { if (it.type !== 'LIST') throw new Error('Mock: không phải list'); return Item(it); },
    setHelpText: () => Item(it), getType: () => it.type,
  });
  const F = {
    _rec: form, getId: () => id, getTitle: () => title, getItems: () => form.items.map(Item), getPublishedUrl: () => 'https://docs.google.com/forms/d/e/pub_' + id + '/viewform',
    setDescription: d => { form.description = d; return F; }, setConfirmationMessage: () => F, setLimitOneResponsePerUser: () => F, setCollectEmail: v => { form.collectEmail = v; return F; },
    addTextItem: () => { const it = { title: '', type: 'TEXT' }; form.items.push(it); return Item(it); },
    addListItem: () => { const it = { title: '', type: 'LIST', choices: [] }; form.items.push(it); return Item(it); },
    moveItem: (from, to) => { const it = form.items.splice(from, 1)[0]; form.items.splice(to, 0, it); return Item(it); },
    getDestinationId: () => { if (!form.dest) throw new Error('No destination'); return form.dest; },
    removeDestination: () => { if (!form.dest) throw new Error('No destination'); form.dest = ''; form.destSheetId = null; return F; },
    setDestination: (type, ssId) => {
      const ss = SPREADSHEETS[ssId]; let n = 1; while (ss.sheets.some(s => s.name === 'Form Responses ' + n)) n++;
      const rec = addSheetRecord(ss, 'Form Responses ' + n, [['Timestamp'].concat(form.collectEmail ? ['Email Address'] : [], form.items.map(i => i.title))]);
      form.dest = ssId; form.destSheetId = rec.id; return F;
    },
    getResponses: since => form.responses.filter(r => !since || r.getTimestamp() >= since),
  };
  FORMS[id] = F;
  return F;
}
/** HV submit form: kiểm tra lựa chọn hợp lệ như Google Forms, ghi tab response, bắn trigger form đã cài. */
function submitForm(formId, email, answers) {
  const F = FORMS[formId], form = F._rec, ts = new Date();
  for (const it of form.items) {
    const a = answers[it.title];
    if (it.required && (a === undefined || a === '')) throw new Error('Form: thiếu câu bắt buộc "' + it.title + '"');
    if (it.type === 'LIST' && a !== undefined && a !== '' && it.choices.indexOf(a) === -1) throw new Error('Form: "' + a + '" không có trong lựa chọn của "' + it.title + '"');
  }
  if (form.dest) {
    const ss = SPREADSHEETS[form.dest], rec = ss.sheets.find(s => s.id === form.destSheetId);
    if (rec) { const r = lastRow(rec) + 1; [ts].concat(form.collectEmail ? [email] : [], form.items.map(i => answers[i.title] || '')).forEach((v, j) => setRaw(rec, r, j + 1, v)); }
  }
  const rid = 'RESP' + (++RESP_SEQ), items = form.items.filter(i => answers[i.title] !== undefined);
  const resp = { getId: () => rid, getTimestamp: () => ts, getRespondentEmail: () => email,
    getItemResponses: () => items.map(i => ({ getItem: () => ({ getTitle: () => i.title }), getResponse: () => answers[i.title] })) };
  form.responses.push(resp);
  const fired = TRIGGERS.filter(t => t.kind === 'form' && t.sourceId === formId);
  for (const t of fired) runTrigger(t.handler, { response: resp, source: F, triggerUid: t.uid });
  return fired.length;
}

// ── Triggers ──
let TRIGGERS = [], TRIG_SEQ = 0, API = null;
function runTrigger(handler, e) { API.__newExecution(); return API[handler](e); }
function triggerBuilder(handler) {
  const t = { handler, uid: 'T' + (++TRIG_SEQ) };
  const create = () => { TRIGGERS.push(t); return { getHandlerFunction: () => handler, getEventType: () => t.kind, getUniqueId: () => t.uid, _t: t }; };
  const time = { everyMinutes: n => { t.spec = 'every' + n + 'm'; return time; }, atHour: h => { t.hour = h; return time; }, nearMinute: () => time, everyDays: () => time,
    onWeekDay: d => { t.weekday = d; return time; }, onMonthDay: d => { t.monthDay = d; return time; }, inTimezone: tz => { t.tz = tz; return time; }, create };
  return {
    timeBased: () => { t.kind = 'time'; return time; },
    forSpreadsheet: ss => ({ onEdit: () => { t.kind = 'edit'; t.sourceId = ss.getId(); return { create }; } }),
    forForm: f => ({ onFormSubmit: () => { t.kind = 'form'; t.sourceId = f.getId(); return { create }; } }),
  };
}
function wrapTrigger(t) { return { getHandlerFunction: () => t.handler, getEventType: () => t.kind, getUniqueId: () => t.uid, _t: t }; }
/** Admin sửa 1 ô trên sheet → bắn trigger onEdit đã cài (nếu có) với e.value / e.oldValue như thật. */
function editCell(ssId, sheetName, row, col, v) {
  const ss = SPREADSHEETS[ssId], rec = sheetByName(ss, sheetName), old = value(rec, row, col);
  delete rec.formulas[row + ',' + col]; setRaw(rec, row, col, v);
  for (const t of TRIGGERS.filter(t => t.kind === 'edit' && t.sourceId === ssId))
    runTrigger(t.handler, { range: Range(rec, row, col, 1, 1), value: v, oldValue: old === '' ? undefined : old, source: Spreadsheet(ss) });
}
/** Chạy trigger thời gian — chỉ khi nó đã được cài. */
function fireTime(handler) {
  if (!TRIGGERS.some(t => t.kind === 'time' && t.handler === handler)) throw new Error('Trigger thời gian ' + handler + ' chưa được cài');
  return runTrigger(handler);
}

// ── Services ──
const SENT = [], CAL = {}, PROPS = {}, LOGS = [];
let CAL_SEQ = 0;
function installGlobals(mainId) {
  global.Logger = { log: m => LOGS.push(String(m)) };
  global.MailApp = { sendEmail: o => { if (!o.to || !/@/.test(o.to)) throw new Error('Invalid email: ' + o.to); SENT.push({ to: o.to, cc: o.cc || '', subject: o.subject, html: o.htmlBody || '' }); }, getRemainingDailyQuota: () => 1500 - SENT.length };
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = String(v); }, deleteProperty: k => { delete PROPS[k]; }, getProperties: () => ({ ...PROPS }) }) };
  global.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) };
  const p = n => ('0' + n).slice(-2);
  global.Utilities = { sleep: () => {}, getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
    formatDate: (d, tz, fmt) => fmt.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, t => ({ yyyy: d.getFullYear(), yy: String(d.getFullYear()).slice(-2), MM: p(d.getMonth() + 1), dd: p(d.getDate()), HH: p(d.getHours()), mm: p(d.getMinutes()), ss: p(d.getSeconds()) })[t]) };
  global.Session = { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' };
  global.Calendar = { Events: {
    insert: (ev, cal, opt) => { if (!opt || opt.conferenceDataVersion !== 1) throw new Error('Mock: thiếu conferenceDataVersion'); const id = 'ev' + (++CAL_SEQ); CAL[id] = ev; return { id, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-' + CAL_SEQ }] } }; },
    remove: (cal, id) => { if (!CAL[id]) throw new Error('Not Found'); delete CAL[id]; },
    list: () => ({ items: [] }) } };
  global.SpreadsheetApp = {
    getActive: () => Spreadsheet(SPREADSHEETS[mainId]), getActiveSpreadsheet: () => Spreadsheet(SPREADSHEETS[mainId]),
    openById: id => { if (!SPREADSHEETS[id]) throw new Error('Mock: không có spreadsheet ' + id); return Spreadsheet(SPREADSHEETS[id]); },
    flush: () => {}, getUi: () => { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); },
    newDataValidation: () => ({ requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) }) }),
  };
  global.FormApp = { create: makeForm, openById: id => { if (!FORMS[id]) throw new Error('Mock: không có form ' + id); return FORMS[id]; }, DestinationType: { SPREADSHEET: 'SPREADSHEET' } };
  global.ScriptApp = { getProjectTriggers: () => TRIGGERS.map(wrapTrigger), deleteTrigger: tr => { TRIGGERS = TRIGGERS.filter(t => t.uid !== tr.getUniqueId()); }, newTrigger: triggerBuilder,
    WeekDay: { SUNDAY: 'SUNDAY', MONDAY: 'MONDAY' } };
}

/** Nạp 12 file .gs giống Apps Script (chung 1 global scope) và trả về mọi hàm top-level. */
function loadProject(srcDir) {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.gs')).sort();
  let src = files.map(f => fs.readFileSync(srcDir + '/' + f, 'utf8')).join('\n');
  const names = [...new Set((src.match(/^function ([A-Za-z0-9_$]+)/gm) || []).map(s => s.slice(9)))];
  src += '\nfunction __newExecution(){NOW_CACHE_=undefined;clearCache_();MAIL_ERRORS_=[];LOCK_DEPTH_=0;BOOKING_SEQ_=null;}\n';
  src += 'module.exports={CONFIG:CONFIG,__newExecution:__newExecution,' + names.map(n => n + ':' + n).join(',') + '};\n';
  const mod = { exports: {} };
  new Function('module', 'exports', src)(mod, mod.exports);
  API = mod.exports;
  return API;
}

module.exports = { setClock, makeSpreadsheet, installGlobals, loadProject, submitForm, editCell, fireTime, runTrigger,
  SPREADSHEETS, FORMS, SENT, CAL, PROPS, LOGS, get TRIGGERS() { return TRIGGERS; }, sheetByName, value, lastRow, RealDate };
