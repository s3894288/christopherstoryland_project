/**
 * Mock harness v6.1.0
 *
 * v6.1.0: STUDENT_INFO F/G chỉ tự tính ở dòng CÓ công thức (FORMULAS), và tôn trọng giới hạn vùng
 * ($D$2:$D$2000). Harness cũ tính cho mọi dòng → che bug "HV mới không có công thức không đặt được"
 * và bug "quá 2000 dòng BOOKINGS thì không trừ buổi". MailApp / Calendar mock tiêm lỗi được.
 *
 * KHÁC v5.1: flush() KHÔNG tự tính lại CHECK_SLOT nữa. Google Sheets thật không tính lại
 * giá trị; chỉ syncCheckSlotValues() làm việc đó. Harness cũ che bug "CHECK_SLOT cũ 10 phút".
 * Chỉ STUDENT_INFO F/G (công thức COUNTIFS thật) được mô phỏng tự tính.
 */
const fs = require('fs');
const TIME_SLOTS = ['17:00 - 17:25','17:30 - 17:55','18:00 - 18:25','18:30 - 18:55','19:00 - 19:25','19:30 - 19:55','20:00 - 20:25','20:30 - 20:55','21:00 - 21:25','21:30 - 21:55','22:00 - 22:25','22:30 - 22:55','23:00 - 23:25','23:30 - 23:55'];
const WD = {0:'Chủ nhật',1:'Thứ 2',2:'Thứ 3',3:'Thứ 4',4:'Thứ 5',5:'Thứ 6',6:'Thứ 7'};

// Tuần active = tuần SAU tuần hiện tại → mọi slot đều ở tương lai (PAST_SLOT không chặn nhầm)
const REAL_NOW = new Date();
const thisMonday = new Date(REAL_NOW.getFullYear(), REAL_NOW.getMonth(), REAL_NOW.getDate() - ((REAL_NOW.getDay()+6)%7), 12, 0, 0);
const MONDAY = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + 7, 12, 0, 0);
const wk = i => new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + i, 12, 0, 0);
const weekDates = []; for (let i = 0; i < 7; i++) weekDates.push(wk(i));
const lastWeekDates = []; for (let i = -7; i < 0; i++) lastWeekDates.push(wk(i));
function blankGrid(dates) { const rows = [['Ngày','Thứ', ...TIME_SLOTS]]; for (const d of dates) rows.push([new Date(d.getFullYear(),d.getMonth(),d.getDate()), WD[d.getDay()], ...TIME_SLOTS.map(()=> '')]); return rows; }

const BK_HEADER = ['BookingID','StudentID','StudentName','StudentEmail','TutorID','TutorName','Date','TimeSlot','MeetLink','Status','CreatedAt','FailReason','AttendanceMarkedAt','EventID'];
const MAIN_DB = {
  'DASHBOARD': Array.from({length:25},()=>['','']),
  'STUDENT_INFO': [['StudentID','Email','Họ và tên','Gói đăng ký','TotalSessions','SessionsUsed','SessionsRemaining','Ngày kích hoạt','Trạng thái','Ghi chú'],
    ['S001','sim@test.com','Sim','-',20,0,20,new Date(),'Active',''],['S002','nocredit@test.com','NoCredit','-',0,0,0,new Date(),'Active',''],
    ['S003','low@test.com','Low','-',2,0,2,new Date(),'Active',''],['S004','bao@test.com','Bao','-',1,0,1,new Date(),'Active',''],
    ['S005','alice@test.com','Alice','-',5,0,5,new Date(),'Active',''],['S006','bob@test.com','Bob','-',5,0,5,new Date(),'Active',''],
    ['S007','carol@test.com','Carol','-',5,0,5,new Date(),'Active','']],
  'CHECK_SLOT': blankGrid(lastWeekDates.concat(weekDates)),
  'BOOKINGS': [BK_HEADER.slice()],
  'ĐĂNG KÝ MỚI': [['Timestamp','Email','Họ và tên','Student ID','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']],
  'PAYROLL_REPORT': [['BÁO CÁO'],['Từ ngày','','Đến ngày',''],[''],['Tutor','Completed','NoShow','Active','Tổng billable','Đơn giá','Thành tiền']]
};
const TUTOR_DB = {
  'TUTOR_INFO': [['TutorID','Tên tutor','Email','Status','Đơn giá/buổi (VND)','Ghi chú'],['T001','Vân','van@t.com','Active',120000,''],['T002','Ánh','anh@t.com','Active',120000,''],['T003','Lan','lan@t.com','Active',100000,''],['T004','Minh','minh@t.com','Active',100000,'']],
  'Tutor-Vân': blankGrid(lastWeekDates.concat(weekDates)), 'Tutor-Ánh': blankGrid(lastWeekDates.concat(weekDates)), 'Tutor-Lan': blankGrid(lastWeekDates.concat(weekDates)), 'Tutor-Minh': blankGrid(lastWeekDates.concat(weekDates))
};
const REG_DB = { 'PACKAGES': [['Tên gói','Số buổi','Học phí','Ghi chú'],['Gói 12 buổi',12,1560000,'']], 'STUDENT_REGISTRATION': [['Timestamp','Email','Họ và tên','Gói','Trạng thái TT','StudentID','Số buổi','Học phí','Synced']] };

const TUTOR_NAMES = ['Vân','Ánh','Lan','Minh'];
function sameDay(a,b){return a instanceof Date&&b instanceof Date&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
// Công thức theo ô: "TAB!row!col" → chuỗi. Chỉ ô có công thức mới được tính lại khi flush (giống Sheets thật)
const FORMULAS={};
const fkey=(name,row,col)=>name+'!'+row+'!'+col;
const LEGACY_USED=r=>`=COUNTIFS(BOOKINGS!$D$2:$D$2000,$B${r},BOOKINGS!$J$2:$J$2000,"Active")+COUNTIFS(BOOKINGS!$D$2:$D$2000,$B${r},BOOKINGS!$J$2:$J$2000,"Completed")+COUNTIFS(BOOKINGS!$D$2:$D$2000,$B${r},BOOKINGS!$J$2:$J$2000,"NoShow")`;
for(let r=2;r<=8;r++){FORMULAS[fkey('STUDENT_INFO',r,6)]=LEGACY_USED(r);FORMULAS[fkey('STUDENT_INFO',r,7)]=`=MAX(0,E${r}-F${r})`;}   // như sheet đang chạy v6.0.1
function recalcStudentQuota(){const si=MAIN_DB['STUDENT_INFO'],bk=MAIN_DB['BOOKINGS'];for(let r=1;r<si.length;r++){const fU=FORMULAS[fkey('STUDENT_INFO',r+1,6)],fR=FORMULAS[fkey('STUDENT_INFO',r+1,7)];
  if(fU){const m=fU.match(/\$D\$2:\$D\$(\d+)/),bound=m?Number(m[1]):Infinity,email=String(si[r][1]||'').toLowerCase();let used=0;for(let br=1;br<bk.length&&br+1<=bound;br++)if(String(bk[br][3]||'').toLowerCase()===email&&['Active','Completed','NoShow'].indexOf(bk[br][9])!==-1)used++;si[r][5]=used;}
  if(fR)si[r][6]=Math.max(0,Number(si[r][4])-(Number(si[r][5])||0));}}

const LOGS=[],SENT=[],PROPS={},MAIL_FAIL_TO=new Set();
global.Logger={log:m=>LOGS.push(String(m))};
global.MailApp={sendEmail:o=>{if(MAIL_FAIL_TO.has(o.to))throw new Error('Service invoked too many times for one day: email.');SENT.push({to:o.to,subject:o.subject,cc:o.cc||'',html:o.htmlBody||''});},getRemainingDailyQuota:()=>1500};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>(k in PROPS?PROPS[k]:null),setProperty:(k,v)=>{PROPS[k]=v;},deleteProperty:k=>{delete PROPS[k];},getProperties:()=>({...PROPS})})};
global.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
global.Utilities={formatDate:(d,tz,fmt)=>{const p=n=>('0'+n).slice(-2);if(fmt==='dd/MM/yyyy')return`${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;if(fmt==='dd/MM/yyyy HH:mm')return`${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;return`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;},sleep:()=>{}};
global.Session={getScriptTimeZone:()=>'Asia/Ho_Chi_Minh'};
let MEET_COUNTER=0,CAL_FAIL=0;const CAL_EVENTS={};
global.Calendar={Events:{insert:()=>{if(CAL_FAIL>0){CAL_FAIL--;throw new Error('Calendar API: backend error');}MEET_COUNTER++;const id='evt'+MEET_COUNTER;CAL_EVENTS[id]=true;return{id:id,conferenceData:{entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/mock-'+MEET_COUNTER}]}};},list:()=>({items:[]}),remove:(cal,id)=>{if(!CAL_EVENTS[id])throw new Error('not found');delete CAL_EVENTS[id];}}};
global.FORM_RESPONSES=[];
global.FormApp={openById:()=>({getResponses:since=>FORM_RESPONSES.filter(r=>!since||r.getTimestamp()>=since)}),DestinationType:{SPREADSHEET:'S'}};

global.ScriptApp={getProjectTriggers:()=>[],deleteTrigger:()=>{},newTrigger:()=>({}),WeekDay:{SUNDAY:0}};

function makeSheet(db,name){
  if(!db[name])return null;
  const S={getName:()=>name,getDataRange:()=>({getValues:()=>db[name].map(r=>r.slice()),getNumberFormats:()=>db[name].map(r=>r.map(()=>'General'))}),getLastRow:()=>db[name].length,getLastColumn:()=>Math.max(...db[name].map(r=>r.length)),
    getRange:(a,col,numRows=1,numCols=1)=>{let row=a;if(typeof a==='string'){const m=a.match(/^([A-Z]+)(\d+)$/);col=m[1].charCodeAt(0)-64;row=Number(m[2]);}
      const R={setValues:vals=>{for(let i=0;i<vals.length;i++){const t=row-1+i;while(db[name].length<=t)db[name].push(new Array(db[name][0].length).fill(''));for(let j=0;j<vals[i].length;j++){db[name][t][col-1+j]=vals[i][j];delete FORMULAS[fkey(name,t+1,col+j)];}}return R;},
        setValue:v=>{const t=row-1;while(db[name].length<=t)db[name].push(new Array(db[name][0].length).fill(''));db[name][t][col-1]=v;delete FORMULAS[fkey(name,row,col)];return R;},
        getValues:()=>{const out=[];for(let i=0;i<numRows;i++){const r=db[name][row-1+i]||[];const o=r.slice(col-1,col-1+numCols);while(o.length<numCols)o.push('');out.push(o);}return out;},
        getFormula:()=>FORMULAS[fkey(name,row,col)]||'',
        getFormulas:()=>{const out=[];for(let i=0;i<numRows;i++){const o=[];for(let j=0;j<numCols;j++)o.push(FORMULAS[fkey(name,row+i,col+j)]||'');out.push(o);}return out;},
        getValue:()=>(db[name][row-1]||[])[col-1],
        clearContent:()=>{for(let i=0;i<numRows;i++){const r=db[name][row-1+i];if(!r)continue;for(let j=0;j<numCols;j++)if(col-1+j<r.length)r[col-1+j]='';}return R;},
        sort:opt=>{const c=(opt.column||1)-1;const seg=db[name].slice(row-1,row-1+numRows);seg.sort((x,y)=>(x[c]instanceof Date&&y[c]instanceof Date)?x[c]-y[c]:0);for(let i=0;i<seg.length;i++)db[name][row-1+i]=seg[i];return R;},
        setNumberFormat:()=>R,setNumberFormats:()=>R,setFormula:f=>{const t=row-1;while(db[name].length<=t)db[name].push(new Array(db[name][0].length).fill(''));db[name][t][col-1]='';FORMULAS[fkey(name,row,col)]=f;return R;},setFormulas:()=>R,setFontColor:()=>R,setFontWeight:()=>R,setFontStyle:()=>R,setDataValidation:()=>R};return R;},
    getActiveCell:()=>null,deleteRows:(r,n)=>{db[name].splice(r-1,n);},deleteRow:r=>{db[name].splice(r-1,1);},setName:()=>{},getSheetId:()=>name,setTabColor:()=>{},hideSheet:()=>{},clearContent:()=>{}};
  return S;
}
function makeSS(db,id){return{toast:()=>{},getId:()=>id,getSheetByName:n=>makeSheet(db,n),getSheets:()=>Object.keys(db).map(k=>makeSheet(db,k)),insertSheet:n=>{db[n]=[['']];return makeSheet(db,n);},getUrl:()=>'https://mock/'+id};}
global.SpreadsheetApp={getActive:()=>makeSS(MAIN_DB,'MAIN'),openById:id=>id==='TUTOR_MOCK_ID'?makeSS(TUTOR_DB,id):id==='REG_MOCK_ID'?makeSS(REG_DB,id):makeSS(MAIN_DB,'MAIN'),
  flush:()=>recalcStudentQuota(),getUi:()=>{throw new Error('no ui');},newDataValidation:()=>({requireValueInList:()=>({setAllowInvalid:()=>({build:()=>({})})})})};

const files=['Config.gs','Quota.gs','Helpers.gs','MeetIntegration.gs','Main.gs','Registration.gs','Attendance.gs','FormUpdater.gs','FormLink.gs','Archive.gs','WeeklyMaintenance.gs','Setup.gs'];
let src=files.map(f=>fs.readFileSync(__dirname+'/../src/'+f,'utf8')).join('\n');
// Trong GAS thật, updateFormOptions() = sync + dashboard + form. Ở đây không có form → giữ sync + dashboard.
src+='\nfunction updateFormOptions(){syncCheckSlotValues();try{updateDashboardStats_();}catch(e){}}\n';
src+='\nmodule.exports={processBooking_,getStudentQuotaByEmail_,CONFIG,formatDate_,getActiveWeekRange_,sendCancelNotification,markCompletedSessions,markNoShow,syncCheckSlotValues,cancelBookingRow_,clearCache_,testSimulateNow,clearSimulatedNow,rebuildCurrentMonth,archiveMonth,weeklyRollover,getActiveWeekStart_,generatePayrollReport,ensureFormSchema_,onFormSubmitTrigger,recoverMissedBookings,syncRegistrations,repairStudentFormulas_,onEditTrigger,processPendingCancellations_,ensureActiveWeekCurrent_,heartbeat,esc_};\n';
const mod={exports:{}};new Function('module','exports',src)(mod,mod.exports);
const API=mod.exports;
API.CONFIG.ADMIN_EMAIL='admin@test.com';API.CONFIG.TUTOR_SS_ID='TUTOR_MOCK_ID';API.CONFIG.REGISTRATION_SS_ID='REG_MOCK_ID';
PROPS['ACTIVE_WEEK_START']=MONDAY.toISOString();

function markTutor(tn,dayOffset,slot,val='x'){const ts=TUTOR_DB['Tutor-'+tn];const target=wk(dayOffset);const col=ts[0].indexOf(slot);for(let r=1;r<ts.length;r++)if(sameDay(ts[r][0],target))ts[r][col]=val;API.clearCache_();}
function submit(email,name,dayLabel,slot,extra){const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];const vals=[new Date().toISOString(),email,name,''];const map={};map[dayLabel]=slot;if(extra)Object.assign(map,extra);for(const d of days)vals.push(map[d]||'');API.clearCache_();API.processBooking_({values:vals});}
function quota(email){return API.getStudentQuotaByEmail_(email);}
function lastBookings(n){const bk=MAIN_DB['BOOKINGS'];return bk.slice(Math.max(1,bk.length-n)).map(r=>({email:r[3],slot:r[7],tutor:r[5]||'—',status:r[9],reason:r[11]||'',eventId:r[13]||''}));}
function slotCount(dayOffset,slot){const cs=MAIN_DB['CHECK_SLOT'];const target=wk(dayOffset);const col=cs[0].indexOf(slot);for(let r=1;r<cs.length;r++)if(sameDay(cs[r][0],target))return cs[r][col];return null;}
const dayLabel=off=>WD[wk(off).getDay()];

let pass=0,fail=0;
function check(label,actual,expected){const ok=JSON.stringify(actual)===JSON.stringify(expected);console.log(`  ${ok?'PASS':'FAIL'}  ${label}`);if(!ok)console.log(`        got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);ok?pass++:fail++;}

console.log(`\n=== SETUP · tuần active ${API.formatDate_(MONDAY)} (tương lai) ===`);
for(const t of TUTOR_NAMES)markTutor(t,0,'19:00 - 19:25');
for(const t of ['Vân','Ánh','Lan'])markTutor(t,1,'20:00 - 20:25');
markTutor('Vân',2,'21:00 - 21:25');markTutor('Vân',3,'21:00 - 21:25');
markTutor('Ánh',4,'19:00 - 19:25');markTutor('Lan',5,'19:00 - 19:25');
markTutor('Vân',5,'20:00 - 20:25');markTutor('Ánh',5,'20:00 - 20:25');
API.syncCheckSlotValues();
check('CHECK_SLOT D0 19:00 = 4',slotCount(0,'19:00 - 19:25'),4);
check('CHECK_SLOT D1 20:00 = 3',slotCount(1,'20:00 - 20:25'),3);

console.log('\n=== T3 · 1 buổi + CHECK_SLOT tự sync sau booking (bug v5.1) ===');
const q3b=quota('sim@test.com').remaining;
submit('sim@test.com','Sim',dayLabel(0),'19:00 - 19:25');
check('Active',lastBookings(1)[0].status,'Active');
check('Quota giảm 1',quota('sim@test.com').remaining,q3b-1);
check('CHECK_SLOT giảm NGAY (không chờ trigger 10 phút)',slotCount(0,'19:00 - 19:25'),3);
check('EventID đã lưu cột N',/^evt\d+$/.test(lastBookings(1)[0].eventId),true);
check('2 email (HV+tutor)',SENT.length,2);

console.log('\n=== T4 · 3 HV cùng slot → Round Robin ===');
SENT.length=0;
submit('alice@test.com','Alice',dayLabel(1),'20:00 - 20:25');
submit('bob@test.com','Bob',dayLabel(1),'20:00 - 20:25');
submit('carol@test.com','Carol',dayLabel(1),'20:00 - 20:25');
const three=lastBookings(3);
check('3 Active',three.map(b=>b.status),['Active','Active','Active']);
check('3 tutor khác nhau',new Set(three.map(b=>b.tutor)).size,3);
check('CHECK_SLOT D1 20:00 = 0',slotCount(1,'20:00 - 20:25'),0);

console.log('\n=== T4b · HV thứ 4 vào slot đầy ===');
submit('sim@test.com','Sim',dayLabel(1),'20:00 - 20:25');
check('Failed',lastBookings(1)[0].status,'Failed');
check('SLOT_FULL',lastBookings(1)[0].reason,API.CONFIG.FAIL_REASONS.SLOT_FULL);

console.log('\n=== T5 · Hết buổi ===');
submit('nocredit@test.com','NoCredit',dayLabel(2),'21:00 - 21:25');
check('NO_CREDITS',lastBookings(1)[0].reason,API.CONFIG.FAIL_REASONS.NO_CREDITS);
check('Slot không bị trừ',slotCount(2,'21:00 - 21:25'),1);

console.log('\n=== T6 · Còn 1 buổi → email cảnh báo ===');
SENT.length=0;
submit('low@test.com','Low',dayLabel(2),'21:00 - 21:25');
check('Còn 1',quota('low@test.com').remaining,1);
check('Email cảnh báo',!!SENT.find(m=>m.subject.indexOf('còn 1')>=0),true);

console.log('\n=== T7 · Vượt quota ===');
submit('bao@test.com','Bao',dayLabel(4),'19:00 - 19:25',{[dayLabel(5)]:'19:00 - 19:25'});
const two=lastBookings(2);
check('1 Active + 1 Failed',two.map(b=>b.status).sort(),['Active','Failed']);
check('OVER_BUDGET',two.find(b=>b.status==='Failed').reason,API.CONFIG.FAIL_REASONS.OVER_BUDGET);

console.log('\n=== T8 · Huỷ → hoàn buổi + xoá Calendar + sync slot (bug v5.1) ===');
SENT.length=0;
const bk=MAIN_DB['BOOKINGS'];let cancelRow=-1;
for(let r=bk.length-1;r>=1;r--)if(bk[r][3]==='sim@test.com'&&bk[r][9]==='Active'){cancelRow=r;break;}
const bc=quota('sim@test.com').remaining,evId=bk[cancelRow][13],slotBefore=slotCount(0,'19:00 - 19:25');
bk[cancelRow][9]='Cancelled';
const cres=API.cancelBookingRow_(makeSheet(MAIN_DB,'BOOKINGS'),cancelRow+1);
check('Quota hoàn +1',quota('sim@test.com').remaining,bc+1);
check('Calendar event bị xoá',CAL_EVENTS[evId],undefined);
check('cancelBookingRow_ báo đã xoá',cres.calendarDeleted,true);
check('CHECK_SLOT tăng lại NGAY',slotCount(0,'19:00 - 19:25'),slotBefore+1);
check('FailReason ghi lý do huỷ',bk[cancelRow][11].indexOf('Huỷ')===0,true);
check('2 email huỷ (HV+tutor)',SENT.length,2);

console.log('\n=== T9 · Email không tồn tại ===');
submit('ghost@test.com','Ghost',dayLabel(3),'21:00 - 21:25');
check('UNKNOWN_STUDENT',lastBookings(1)[0].reason,API.CONFIG.FAIL_REASONS.UNKNOWN_STUDENT);

console.log('\n=== T10 · Điểm danh ===');
for(let r=1;r<bk.length;r++){if(bk[r][9]==='Active'){bk[r][6]=new Date(REAL_NOW.getFullYear(),REAL_NOW.getMonth(),REAL_NOW.getDate()-2);break;}}
check('≥1 Completed',API.markCompletedSessions()>=1,true);
let cid=null;for(let r=1;r<bk.length;r++){if(bk[r][9]==='Completed'){cid=bk[r][0];API.markNoShow(cid);break;}}
check('NoShow written',bk.find(r=>r[0]===cid)[9],'NoShow');

console.log('\n=== T11 · Ngày cột G midnight · 14 cột ===');
check('All dates midnight',bk.slice(1).every(r=>r[6]instanceof Date&&r[6].getHours()===0),true);
check('Mọi dòng đủ 14 cột',bk.slice(1).every(r=>r.length===14),true);

console.log('\n=== T12 · Completed/NoShow vẫn trừ quota ===');
const simQ=quota('sim@test.com');
check('used = consuming bookings',simQ.used,bk.filter(r=>String(r[3]).toLowerCase()==='sim@test.com'&&['Active','Completed','NoShow'].indexOf(r[9])!==-1).length);

console.log('\n=== T13 · Slot đã qua bị chặn (PAST_SLOT) ===');
const q13=quota('sim@test.com').remaining;
API.testSimulateNow(`${MONDAY.getFullYear()}-${('0'+(MONDAY.getMonth()+1)).slice(-2)}-${('0'+MONDAY.getDate()).slice(-2)} 23:00`);
submit('sim@test.com','Sim',dayLabel(0),'19:00 - 19:25');
check('PAST_SLOT',lastBookings(1)[0].reason,API.CONFIG.FAIL_REASONS.PAST_SLOT);
check('Quota không đổi',quota('sim@test.com').remaining,q13);
// quá sát giờ: 20:30 booking lúc 19:45 (lead 60 phút)
API.testSimulateNow(`${wk(5).getFullYear()}-${('0'+(wk(5).getMonth()+1)).slice(-2)}-${('0'+wk(5).getDate()).slice(-2)} 19:45`);
submit('sim@test.com','Sim',dayLabel(5),'20:00 - 20:25');
check('Dưới MIN_LEAD_MINUTES → PAST_SLOT',lastBookings(1)[0].reason,API.CONFIG.FAIL_REASONS.PAST_SLOT);
API.clearSimulatedNow();

console.log('\n=== T14 · Round Robin theo TUẦN, không theo lịch sử trọn đời ===');
// Chọn tutor đang có ÍT booking tuần này hơn (hoà → Vân), nhồi 5 booking Completed tuần TRƯỚC cho tutor đó.
// Scope week → vẫn được xếp. Scope all → thua.
function weekCount(tid){const lo=new Date(MONDAY.getFullYear(),MONDAY.getMonth(),MONDAY.getDate()),hi=new Date(lo.getFullYear(),lo.getMonth(),lo.getDate()+6);return bk.slice(1).filter(r=>r[4]===tid&&['Active','Completed','NoShow'].indexOf(r[9])!==-1&&r[6]>=lo&&r[6]<=hi).length;}
const low=weekCount('T001')<=weekCount('T002')?{id:'T001',name:'Vân',other:'Ánh'}:{id:'T002',name:'Ánh',other:'Vân'};
for(let i=0;i<5;i++)bk.push(['BKOLD'+i,'S001','Sim','sim@test.com',low.id,low.name,new Date(wk(-7+i).getFullYear(),wk(-7+i).getMonth(),wk(-7+i).getDate()),'17:00 - 17:25','','Completed',new Date(),'','','']);
API.clearCache_();
markTutor('Vân',5,'21:00 - 21:25');markTutor('Ánh',5,'21:00 - 21:25');
submit('alice@test.com','Alice',dayLabel(5),'21:00 - 21:25');
check(low.name+' vẫn được xếp dù có 5 buổi tuần trước (đếm tuần)',lastBookings(1)[0].tutor,low.name);
API.CONFIG.ROUND_ROBIN_SCOPE='all';API.clearCache_();
markTutor('Vân',6,'21:00 - 21:25');markTutor('Ánh',6,'21:00 - 21:25');
submit('bob@test.com','Bob',dayLabel(6),'21:00 - 21:25');
check('Scope all → '+low.other+' (ít hơn trọn đời)',lastBookings(1)[0].tutor,low.other);
API.CONFIG.ROUND_ROBIN_SCOPE='week';

console.log('\n=== T15 · Rebuild tháng KHÔNG xoá "x" tutor đã đánh trước (bug v5.1) ===');
const Y=MONDAY.getFullYear(),M=MONDAY.getMonth();
const nextM=new Date(Y,M+1,1,12,0,0);
const tv=TUTOR_DB['Tutor-Vân'];
{const d3=new Date(nextM.getFullYear(),nextM.getMonth(),3),ex=tv.find(r=>r[0]instanceof Date&&sameDay(r[0],d3));if(ex)ex[6]='x';else tv.push([d3,WD[d3.getDay()],...TIME_SLOTS.map((s,i)=>i===4?'x':'')]);}  // tuần active có thể lấn sang tháng sau → đánh vào dòng có sẵn, không tạo dòng trùng
tv.push([new Date(Y,M-2,10),WD[new Date(Y,M-2,10).getDay()],...TIME_SLOTS.map(()=>'x')]);  // tháng cũ → phải bị bỏ
API.clearCache_();
API.rebuildCurrentMonth(nextM.getFullYear(),nextM.getMonth()+1);
const tvAfter=TUTOR_DB['Tutor-Vân'];
const kept=tvAfter.find(r=>r[0]instanceof Date&&sameDay(r[0],new Date(nextM.getFullYear(),nextM.getMonth(),3)));
check('Dòng tháng mới còn "x"',kept&&kept[6],'x');
check('Dòng 2 tháng trước bị bỏ',!!tvAfter.find(r=>r[0]instanceof Date&&sameDay(r[0],new Date(Y,M-2,10))),false);
const daysInNext=new Date(nextM.getFullYear(),nextM.getMonth()+1,0).getDate();
check('Đủ ngày tháng mới',tvAfter.filter(r=>r[0]instanceof Date&&r[0].getMonth()===nextM.getMonth()).length,daysInNext);
check('Tuần active (tháng cũ) vẫn giữ',tvAfter.filter(r=>r[0]instanceof Date&&sameDay(r[0],wk(0))).length,1);
check('Ngày sort tăng dần',tvAfter.slice(1).every((r,i,a)=>i===0||r[0]>=a[i-1][0]),true);

console.log('\n=== T16 · Archive tạo snapshot ở đúng spreadsheet ===');
API.archiveMonth(Y,M+1);
const tag=Y+'_'+('0'+(M+1)).slice(-2);
check('_ARCHIVE_CHECK_SLOT trong Main',!!MAIN_DB['_ARCHIVE_CHECK_SLOT_'+tag],true);
check('_ARCHIVE_Tutor-Vân trong Tutor SS',!!TUTOR_DB['_ARCHIVE_Tutor-Vân_'+tag],true);
check('Không nhầm sang Main',!!MAIN_DB['_ARCHIVE_Tutor-Vân_'+tag],false);

console.log('\n=== T17 · weeklyRollover miễn nhiễm trigger chạy trễ ===');
PROPS['ACTIVE_WEEK_START']=MONDAY.toISOString();
const nextMon=wk(7);
API.testSimulateNow(`${nextMon.getFullYear()}-${('0'+(nextMon.getMonth()+1)).slice(-2)}-${('0'+nextMon.getDate()).slice(-2)} 00:10`);  // thứ 2 00:10 (trễ 70 phút)
API.weeklyRollover();
check('Chạy trễ lúc T2 00:10 → tuần = T2 hôm đó, không nhảy tuần sau',API.formatDate_(API.getActiveWeekStart_()),API.formatDate_(nextMon));
API.weeklyRollover();
check('Chạy 2 lần không nhảy thêm',API.formatDate_(API.getActiveWeekStart_()),API.formatDate_(nextMon));
API.clearSimulatedNow();PROPS['ACTIVE_WEEK_START']=MONDAY.toISOString();

console.log('\n=== T18 · Payroll ghi bảng vào tab ===');
API.generatePayrollReport(new Date(Y,M-1,1),new Date(Y,M+2,0));
const pr=MAIN_DB['PAYROLL_REPORT'];
check('Có dòng Vân',!!pr.find(r=>r[0]==='Vân'),true);
check('Có dòng TỔNG CỘNG',!!pr.find(r=>r[0]==='TỔNG CỘNG'),true);
const vanRow=pr.find(r=>r[0]==='Vân');
check('Lương Vân = billable × 120000',vanRow[6],vanRow[4]*120000);

console.log('\n=== T19 · Cross spreadsheet ===');
check('TUTOR_INFO không ở Main',MAIN_DB['TUTOR_INFO'],undefined);
check('PACKAGES không ở Main',MAIN_DB['PACKAGES'],undefined);


console.log('\n=== T20 · v6.0.1 · Trigger "From form" (e.response) + e rỗng + cứu phản hồi sót ===');
function mockResp(email,day,slot,minsAgo,id){const items=[['Họ và tên','HV '+email],['Student ID','']];for(const d of ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'])items.push([d,d===day?slot:API.CONFIG.NO_CHOICE_LABEL]);
  return{getItemResponses:()=>items.map(([t,v])=>({getItem:()=>({getTitle:()=>t}),getResponse:()=>v})),getRespondentEmail:()=>email,getTimestamp:()=>new Date(Date.now()-minsAgo*60000),getId:()=>id};}
PROPS['BOOKING_FORM_ID']='FORM_MOCK';PROPS['ACTIVE_WEEK_START']=MONDAY.toISOString();delete PROPS['ACTIVE_WEEK_SET_AT'];API.clearSimulatedNow();
for(const t of ['Vân','Ánh','Lan','Minh']){markTutor(t,6,'22:00 - 22:25');markTutor(t,6,'22:30 - 22:55');}
API.syncCheckSlotValues();
const bk0=MAIN_DB['BOOKINGS'].length,sent0=SENT.length;
API.onFormSubmitTrigger(undefined);
check('e rỗng (chạy tay): không ghi BOOKINGS',MAIN_DB['BOOKINGS'].length,bk0);
check('e rỗng (chạy tay): không gửi email lỗi giả',SENT.filter(m=>m.to==='admin@test.com').length,SENT.slice(0,sent0).filter(m=>m.to==='admin@test.com').length);
const rA=mockResp('sim@test.com',dayLabel(6),'22:00 - 22:25',5,'R1');
const nl=API.CONFIG.NO_CHOICE_LABEL;
API.onFormSubmitTrigger({response:rA,source:{},triggerUid:'x'});
check('Trigger From form: booking Active (trước đây bị nuốt im lặng)',lastBookings(1)[0].status+'|'+lastBookings(1)[0].email,'Active|sim@test.com');
check('Trigger From form: đúng slot',lastBookings(1)[0].slot,'22:00 - 22:25');
const adm0=SENT.filter(m=>m.to==='admin@test.com').length;
const rNoMail=mockResp('',dayLabel(6),'22:30 - 22:55',1,'R0');
API.onFormSubmitTrigger({response:rNoMail});
check('Thiếu email: admin được báo lỗi (không còn im lặng)',SENT.filter(m=>m.to==='admin@test.com').length,adm0+1);
// Carol submit 10 phút trước nhưng bị sót
const rB=mockResp('carol@test.com',dayLabel(6),'22:30 - 22:55',10,'R2');
FORM_RESPONSES.push(rA,rB);
const bk1=MAIN_DB['BOOKINGS'].length;
const rec1=API.recoverMissedBookings();
check('Recover lần 1: xử lý 1 phản hồi sót, bỏ qua 1 đã có',[rec1.done,rec1.skipped,rec1.errors],[1,1,0]);
check('Recover: booking Carol Active',lastBookings(1)[0].email+'|'+lastBookings(1)[0].status,'carol@test.com|Active');
const rec2=API.recoverMissedBookings();
check('Recover lần 2: không tạo trùng',[rec2.done,MAIN_DB['BOOKINGS'].length],[0,bk1+1]);
// 2 lần submit cùng 1 HV đều bị sót → phải cứu cả 2
for(const t of ['Vân','Ánh']){markTutor(t,6,'23:00 - 23:25');markTutor(t,6,'23:30 - 23:55');}API.syncCheckSlotValues();
FORM_RESPONSES.push(mockResp('alice@test.com',dayLabel(6),'23:00 - 23:25',30,'R3'),mockResp('alice@test.com',dayLabel(6),'23:30 - 23:55',20,'R4'));
const rec3=API.recoverMissedBookings();
check('Recover: 2 phản hồi sót của cùng 1 HV đều được cứu',rec3.done,2);
check('Recover: 2 dòng Alice đúng 2 slot',lastBookings(2).map(b=>b.email+'|'+b.slot+'|'+b.status),['alice@test.com|23:00 - 23:25|Active','alice@test.com|23:30 - 23:55|Active']);
FORM_RESPONSES.push(mockResp('bob@test.com',dayLabel(6),'23:00 - 23:25',60*24*9,'R5'));
const rec4=API.recoverMissedBookings();
check('Recover: phản hồi ngoài 72 giờ không bị quét',[rec4.done,rec4.old],[0,0]);
PROPS['ACTIVE_WEEK_SET_AT']=String(Date.now()-5*60000);
FORM_RESPONSES.push(mockResp('bob@test.com',dayLabel(6),'23:30 - 23:55',15,'R6'));
const rec5=API.recoverMissedBookings();
check('Recover: phản hồi submit trước lúc đổi tuần → bỏ qua, không đặt nhầm tuần mới',[rec5.done,rec5.old>=1,MAIN_DB['BOOKINGS'].some(r=>r[3]==='bob@test.com'&&r[7]==='23:30 - 23:55')],[0,true,false]);
delete PROPS['ACTIVE_WEEK_SET_AT'];


// ═════════════════════════════ v6.1.0 ═════════════════════════════
// Mỗi test dưới đây FAIL trên code v6.0.1 và PASS trên v6.1.0.
const adminMails=()=>SENT.filter(m=>m.to==='admin@test.com');
const bkRows=()=>MAIN_DB['BOOKINGS'].slice(1);
const siRow=email=>MAIN_DB['STUDENT_INFO'].find(r=>String(r[1]).toLowerCase()===email);
for(const e of ['alice@test.com','bob@test.com','carol@test.com'])siRow(e)[4]=30;SpreadsheetApp.flush();   // nạp thêm buổi cho các kịch bản sau
function submitMap(email,name,map){const days=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];const vals=[new Date().toISOString(),email,name,''];for(const d of days)vals.push(map[d]||'');API.clearCache_();API.processBooking_({values:vals});}

console.log('\n=== T21 · HV kích hoạt mới (ngoài 6 dòng mẫu) có công thức và đặt được + gói sai không kích hoạt 0 buổi ===');
REG_DB['STUDENT_REGISTRATION'].push([new Date(),'newbie@test.com','Newbie','Gói 12 buổi','Đã thanh toán','','','','']);
REG_DB['STUDENT_REGISTRATION'].push([new Date(),'badpkg@test.com','Bad Pkg','Gói không tồn tại','Đã thanh toán','','','','']);
const adm21=adminMails().length;
API.syncRegistrations();
const newbieIdx=MAIN_DB['STUDENT_INFO'].findIndex(r=>r[1]==='newbie@test.com');
check('Newbie có trong STUDENT_INFO',newbieIdx>0,true);
check('Newbie có công thức F không giới hạn dòng',/\$D\$2:\$D,/.test(FORMULAS[fkey('STUDENT_INFO',newbieIdx+1,6)]||''),true);
check('Newbie còn 12 buổi',quota('newbie@test.com').remaining,12);
markTutor('Minh',3,'22:00 - 22:25');
submit('newbie@test.com','Newbie',dayLabel(3),'22:00 - 22:25');
check('Newbie đặt được buổi đầu tiên (trước: Failed "Hết buổi")',lastBookings(1)[0].status+'|'+lastBookings(1)[0].email,'Active|newbie@test.com');
check('Newbie trừ 1 buổi',quota('newbie@test.com').remaining,11);
const badReg=REG_DB['STUDENT_REGISTRATION'].find(r=>r[1]==='badpkg@test.com');
check('Gói sai: KHÔNG kích hoạt',!!siRow('badpkg@test.com'),false);
check('Gói sai: cột Synced ghi LỖI',String(badReg[8]).indexOf('LỖI')===0,true);
check('Gói sai: admin nhận 1 email',adminMails().length,adm21+1);
check('Ghi lại Số buổi + Học phí',REG_DB['STUDENT_REGISTRATION'].find(r=>r[1]==='newbie@test.com').slice(6,9),[12,1560000,'Yes']);
API.syncRegistrations();
check('Chạy lại: không báo admin lần 2, không cộng buổi lần 2',[adminMails().length,siRow('newbie@test.com')[4]],[adm21+1,12]);

console.log('\n=== T22 · Trigger bắn 2 lần → không đặt trùng; đặt lại slot đang giữ → DUPLICATE ===');
markTutor('Vân',4,'17:00 - 17:25');markTutor('Ánh',4,'17:00 - 17:25');
const q22=quota('alice@test.com').remaining,n22=bkRows().length;
submit('alice@test.com','Alice',dayLabel(4),'17:00 - 17:25');
const sent22=SENT.length;
submit('alice@test.com','Alice',dayLabel(4),'17:00 - 17:25');
check('Lần bắn thứ 2: không thêm dòng, không trừ thêm buổi',[bkRows().length,quota('alice@test.com').remaining],[n22+1,q22-1]);
check('Lần bắn thứ 2: không gửi email',SENT.length,sent22);
bkRows()[bkRows().length-1][10]=new Date(Date.now()-3600*1000);   // booking đó tạo 1 giờ trước → HV cố ý đặt lại
submit('alice@test.com','Alice',dayLabel(4),'17:00 - 17:25');
check('Đặt lại slot đang giữ (sau 1 giờ) → Failed DUPLICATE',lastBookings(1)[0].status+'|'+lastBookings(1)[0].reason,'Failed|'+API.CONFIG.FAIL_REASONS.DUPLICATE);
check('Quota vẫn chỉ trừ 1',quota('alice@test.com').remaining,q22-1);

console.log('\n=== T23 · Round Robin tính cả slot trong CÙNG lần submit + BookingID không trùng ===');
const wc=tid=>{const lo=new Date(MONDAY.getFullYear(),MONDAY.getMonth(),MONDAY.getDate()),hi=new Date(lo.getFullYear(),lo.getMonth(),lo.getDate()+6);return bkRows().filter(r=>r[4]===tid&&['Active','Completed','NoShow'].indexOf(r[9])!==-1&&r[6]>=lo&&r[6]<=hi).length;};
const nRR=Math.min(7,Math.abs(wc('T003')-wc('T004'))+2),mapRR={};
for(let d=0;d<nRR;d++){markTutor('Lan',d,'18:30 - 18:55');markTutor('Minh',d,'18:30 - 18:55');mapRR[dayLabel(d)]='18:30 - 18:55';}
submitMap('sim@test.com','Sim',mapRR);
check('RR: '+nRR+' slot 1 lần submit chia cho CẢ 2 tutor (trước: dồn hết 1 người)',new Set(lastBookings(nRR).map(b=>b.tutor)).size,2);
const origRandom=Math.random;Math.random=()=>0.5;   // cố định phần ngẫu nhiên → chỉ bộ đếm giữ ID khác nhau
const map7={};for(let d=0;d<7;d++){markTutor('Vân',d,'17:30 - 17:55');map7[dayLabel(d)]='17:30 - 17:55';}
submitMap('sim@test.com','Sim',map7);
Math.random=origRandom;
const ids7=bkRows().slice(-7).map(r=>r[0]);
check('7 slot cùng giây: 7 BookingID khác nhau',new Set(ids7).size,7);

console.log('\n=== T24 · Tên HV chứa HTML bị escape trong email ===');
markTutor('Ánh',2,'22:00 - 22:25');
SENT.length=0;
submit('alice@test.com','<img src=x onerror=alert(1)>',dayLabel(2),'22:00 - 22:25');
const tutorMail24=SENT.find(m=>m.to==='anh@t.com');
check('Email tutor có gửi',!!tutorMail24,true);
check('Email tutor không chứa HTML thô',tutorMail24.html.indexOf('<img src=x')===-1&&tutorMail24.html.indexOf('&lt;img src=x')>=0,true);
check('esc_',API.esc_('<a href="x">&\''),'&lt;a href=&quot;x&quot;&gt;&amp;&#39;');

console.log('\n=== T25 · HV Paused không đặt được ===');
siRow('carol@test.com')[8]='Paused';
markTutor('Lan',3,'17:00 - 17:25');
submit('carol@test.com','Carol',dayLabel(3),'17:00 - 17:25');
check('Paused → Failed PAUSED',lastBookings(1)[0].status+'|'+lastBookings(1)[0].reason,'Failed|'+API.CONFIG.FAIL_REASONS.PAUSED);
siRow('carol@test.com')[8]='Active';

console.log('\n=== T26 · 1 email lỗi không chặn các bước sau ===');
markTutor('Minh',5,'22:30 - 22:55');
SENT.length=0;MAIL_FAIL_TO.add('bob@test.com');
let threw26=false;try{submit('bob@test.com','Bob',dayLabel(5),'22:30 - 22:55');}catch(e){threw26=true;}
MAIL_FAIL_TO.delete('bob@test.com');
check('Không ném lỗi, booking vẫn Active',[threw26,lastBookings(1)[0].status],[false,'Active']);
check('Tutor vẫn nhận email',!!SENT.find(m=>m.to==='minh@t.com'),true);
check('Admin nhận email tổng hợp lỗi gửi',!!SENT.find(m=>m.to==='admin@test.com'&&m.subject.indexOf('email gửi không thành công')>=0),true);

console.log('\n=== T27 · Tạo Meet: lỗi 1 lần → thử lại được; lỗi hết lượt → admin được báo ===');
markTutor('Lan',4,'22:30 - 22:55');markTutor('Lan',6,'17:00 - 17:25');
CAL_FAIL=1;submit('sim@test.com','Sim',dayLabel(4),'22:30 - 22:55');
check('Lỗi 1 lần: thử lại → có EventID',/^evt\d+$/.test(lastBookings(1)[0].eventId),true);
SENT.length=0;CAL_FAIL=API.CONFIG.MEET_CREATE_ATTEMPTS;submit('sim@test.com','Sim',dayLabel(6),'17:00 - 17:25');CAL_FAIL=0;
check('Lỗi mọi lần: booking vẫn Active, chưa có EventID',[lastBookings(1)[0].status,lastBookings(1)[0].eventId],['Active','']);
check('Admin nhận email "CHƯA có Google Meet"',!!SENT.find(m=>m.to==='admin@test.com'&&m.subject.indexOf('CHƯA có Google Meet')>=0),true);

console.log('\n=== T28 · Payroll gồm tutor đã nghỉ, tổng khớp ===');
const lanInfo=TUTOR_DB['TUTOR_INFO'].find(r=>r[0]==='T003');
bk.push(['BKPAY1','S001','Sim','sim@test.com','T003','Lan',new Date(Y,M,1),'17:00 - 17:25','','Completed',new Date(),'','','']);
lanInfo[3]='Inactive';API.clearCache_();
API.generatePayrollReport(new Date(Y,M-1,1),new Date(Y,M+2,0));
const pr28=MAIN_DB['PAYROLL_REPORT'].slice(4).filter(r=>r[0]),body28=pr28.filter(r=>r[0]!=='TỔNG CỘNG'),tot28=pr28.find(r=>r[0]==='TỔNG CỘNG');
check('Có dòng Lan (đã nghỉ)',!!body28.find(r=>String(r[0]).indexOf('Lan')===0&&r[4]>=1),true);
check('Tổng tiền = tổng các dòng',tot28[6],body28.reduce((a,r)=>a+Number(r[6]||0),0));
check('Tổng billable = tổng các dòng',tot28[4],body28.reduce((a,r)=>a+Number(r[4]||0),0));
lanInfo[3]='Active';API.clearCache_();

console.log('\n=== T29 · Dán "Cancelled" nhiều dòng cùng lúc + heartbeat bắt dòng huỷ bị sót ===');
markTutor('Vân',6,'18:00 - 18:25');markTutor('Ánh',6,'18:30 - 18:55');markTutor('Minh',6,'19:30 - 19:55');
submitMap('bob@test.com','Bob',{[dayLabel(6)]:'18:00 - 18:25'});submitMap('alice@test.com','Alice',{[dayLabel(6)]:'18:30 - 18:55'});
const r1=bk.length-2,r2=bk.length-1,ev1=bk[r1][13],ev2=bk[r2][13];
bk[r1][9]='Cancelled';bk[r2][9]='Cancelled';SENT.length=0;
const bkSheet=makeSheet(MAIN_DB,'BOOKINGS');
const fakeRange={getSheet:()=>bkSheet,getColumn:()=>1,getNumColumns:()=>14,getRow:()=>r1+1,getNumRows:()=>2};
API.onEditTrigger({range:fakeRange});
check('2 dòng: đã xoá 2 event Calendar',[CAL_EVENTS[ev1],CAL_EVENTS[ev2]],[undefined,undefined]);
check('2 dòng: cột L đánh dấu đã huỷ',[bk[r1][11].indexOf('Huỷ')===0,bk[r2][11].indexOf('Huỷ')===0],[true,true]);
check('2 dòng: gửi email HV + tutor (4 email)',SENT.length,4);
API.onEditTrigger({range:fakeRange});
check('Chạy lại: idempotent, không gửi thêm',SENT.length,4);
submitMap('carol@test.com','Carol',{[dayLabel(6)]:'19:30 - 19:55'});
const r3=bk.length-1;bk[r3][9]='Cancelled';SENT.length=0;
check('Heartbeat bắt 1 dòng huỷ bị sót',API.processPendingCancellations_(),1);
check('Dòng huỷ sót: đã gửi email + xoá lịch',[SENT.length,CAL_EVENTS[bk[r3][13]]],[2,undefined]);

console.log('\n=== T30 · Hết buổi → huỷ → trạng thái về Active ===');
markTutor('Lan',6,'20:00 - 20:25');
submit('low@test.com','Low',dayLabel(6),'20:00 - 20:25');
check('low@ còn 0, trạng thái "Hết buổi"',[quota('low@test.com').remaining,siRow('low@test.com')[8]],[0,API.CONFIG.STUDENT_STATUS.EXHAUSTED]);
const r30=bk.length-1;bk[r30][9]='Cancelled';API.cancelBookingRow_(bkSheet,r30+1);
check('Sau huỷ: còn 1, trạng thái Active',[quota('low@test.com').remaining,siRow('low@test.com')[8]],[1,'Active']);

console.log('\n=== T31 · Lỡ trigger chuyển tuần → heartbeat tự sửa ===');
PROPS['ACTIVE_WEEK_START']=new Date(thisMonday.getFullYear(),thisMonday.getMonth(),thisMonday.getDate()-14,12).toISOString();
const adm31=adminMails().length;
check('Phát hiện tuần cũ → chuyển',API.ensureActiveWeekCurrent_(),true);
check('Tuần active = tuần hiện tại',API.formatDate_(API.getActiveWeekStart_()),API.formatDate_(thisMonday));
check('Admin được báo',adminMails().length,adm31+1);
check('Tuần đã đúng → không làm gì',API.ensureActiveWeekCurrent_(),false);
PROPS['ACTIVE_WEEK_START']=MONDAY.toISOString();
let hbErr='';try{API.heartbeat();}catch(e){hbErr=e.message;}
check('heartbeat() chạy trọn không lỗi',hbErr,'');

console.log('\n=== T32 · Quá 2000 dòng BOOKINGS: công thức cũ không trừ buổi → sửa công thức ===');
for(let r=2;r<=8;r++)FORMULAS[fkey('STUDENT_INFO',r,6)]=LEGACY_USED(r);   // T31 heartbeat đã tự sửa → đặt lại công thức cũ để tái hiện
while(bk.length<2001)bk.push(['FILL'+bk.length,'','Filler','filler@test.com','','',new Date(wk(-7).getFullYear(),wk(-7).getMonth(),wk(-7).getDate()),'17:00 - 17:25','','Failed',new Date(),'filler','','']);
markTutor('Ánh',5,'23:30 - 23:55');
const q32=quota('bob@test.com').remaining;
submit('bob@test.com','Bob',dayLabel(5),'23:30 - 23:55');
check('Booking dòng > 2000 Active',lastBookings(1)[0].status,'Active');
check('Tái hiện bug: công thức $2000 không trừ buổi',quota('bob@test.com').remaining,q32);
siRow('sim@test.com')[5]=3;delete FORMULAS[fkey('STUDENT_INFO',2,6)];   // dòng sim: số gõ tay → không được đụng
const rep32=API.repairStudentFormulas_();
API.clearCache_();SpreadsheetApp.flush();
check('Sửa công thức: nâng cấp 6 dòng cũ, bỏ qua 1 dòng gõ tay',[rep32.upgraded,rep32.manual],[6,[2]]);
check('Sau sửa: trừ đúng 1 buổi',quota('bob@test.com').remaining,q32-1);
check('Dòng gõ tay giữ nguyên',siRow('sim@test.com')[5],3);
check('HV kích hoạt mới (T21) đếm đúng dù > 2000 dòng',quota('newbie@test.com').remaining,11);

console.log(`\n────────────────────────────────────`);
console.log(`  KẾT QUẢ: ${pass} PASS · ${fail} FAIL`);
console.log(`────────────────────────────────────`);
process.exit(fail>0?1:0);
