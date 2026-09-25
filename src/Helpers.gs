/**
 * Helpers.gs — Tiện Ích (v6.1.0)
 *
 * v6.1.0:
 *   withScriptLock_()         mọi entry point ghi dữ liệu chạy trong lock (gọi lồng không tự khoá)
 *   loadBookingState_()       đọc BOOKINGS 1 lần / lần đặt (trước: ~35 lần đọc cả tab cho 7 slot);
 *                             slot vừa đặt được ghi ngay vào state → RR tính cả slot cùng lần submit
 *   generateBookingId_()      hậu tố tăng dần trong 1 lần chạy → không trùng ID khi đặt nhiều slot/giây
 *   getAllTutors_()           mọi tutor (kể cả đã nghỉ) cho payroll và email huỷ
 *   esc_()                    escape HTML cho dữ liệu người dùng nhập vào email
 *   sendMail_()               gửi mail không ném lỗi; lỗi gom lại, flushMailErrors_() báo admin 1 lần
 *
 * v6.0.1:
 *   setActiveWeekStart_ ghi thêm ACTIVE_WEEK_SET_AT (thời điểm đổi tuần thật sự) để
 *   recoverMissedBookings() biết phản hồi nào thuộc tuần cũ, không xử lý nhầm sang tuần mới
 *
 * v6.0:
 *   getNow_()                 đồng hồ hệ thống, có thể giả lập bằng testSimulateNow()
 *   CACHE_                    cache tutor + availability trong 1 lần chạy (giảm 28 lần đọc
 *                             external spreadsheet xuống còn 4)
 *   isSlotBookable_()         chặn slot đã qua / dưới MIN_LEAD_MINUTES
 *   getActiveBookingCountByTutor_ cân bằng Round Robin theo tuần active
 */

// ── Ngày giờ ──
function formatDate_(d){return Utilities.formatDate(d,CONFIG.TIMEZONE,'dd/MM/yyyy');}
function formatDateTime_(d){return Utilities.formatDate(d,CONFIG.TIMEZONE,'dd/MM/yyyy HH:mm');}
function sameDate_(d1,d2){if(!(d1 instanceof Date)||!(d2 instanceof Date))return false;return d1.getFullYear()===d2.getFullYear()&&d1.getMonth()===d2.getMonth()&&d1.getDate()===d2.getDate();}
function toMidnight_(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function makeNoon_(y,m,d){return new Date(y,m,d,12,0,0);}
function dateKey_(d){return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate();}
function getMondayOfWeek_(ref){var dow=ref.getDay(),back=(dow+6)%7;return makeNoon_(ref.getFullYear(),ref.getMonth(),ref.getDate()-back);}

/** Đồng hồ hệ thống. Nếu Script Property SIM_NOW được set (bởi testSimulateNow) → dùng giờ giả lập. */
var NOW_CACHE_;
function getNow_(){
  if(NOW_CACHE_===undefined){
    var p=null;try{p=PropertiesService.getScriptProperties().getProperty('SIM_NOW');}catch(e){}
    var d=p?new Date(p):null;NOW_CACHE_=(d&&!isNaN(d.getTime()))?d:null;
  }
  return NOW_CACHE_?new Date(NOW_CACHE_.getTime()):new Date();
}

/** Slot còn đặt được không: bắt đầu phải cách hiện tại ít nhất MIN_LEAD_MINUTES */
function getSlotStartDateTime_(date,timeSlot){var parts=String(timeSlot).split(' - ');if(parts.length!==2)return null;var s=parts[0].trim().split(':');if(s.length!==2)return null;return new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number(s[0]),Number(s[1]),0);}
function isSlotBookable_(date,timeSlot){var start=getSlotStartDateTime_(date,timeSlot);if(!start)return false;var lead=(CONFIG.POLICY.MIN_LEAD_MINUTES||0)*60000;return start.getTime()-getNow_().getTime()>=lead;}

// ── Cross spreadsheet (fallback getActive nếu ID trống) ──
function getTutorSpreadsheet_(){return CONFIG.TUTOR_SS_ID?SpreadsheetApp.openById(CONFIG.TUTOR_SS_ID):SpreadsheetApp.getActive();}
function getRegistrationSpreadsheet_(){return CONFIG.REGISTRATION_SS_ID?SpreadsheetApp.openById(CONFIG.REGISTRATION_SS_ID):SpreadsheetApp.getActive();}

// ── Tuần active ──
function getActiveWeekStart_(){
  var props=PropertiesService.getScriptProperties(),stored=props.getProperty('ACTIVE_WEEK_START');
  if(stored){var p=new Date(stored);if(!isNaN(p.getTime()))return p;}
  var monday=getMondayOfWeek_(getNow_());setActiveWeekStart_(monday);return monday;
}
function setActiveWeekStart_(m){
  var props=PropertiesService.getScriptProperties(),iso=m.toISOString();
  if(props.getProperty('ACTIVE_WEEK_START')!==iso)props.setProperty('ACTIVE_WEEK_SET_AT',String(Date.now()));
  props.setProperty('ACTIVE_WEEK_START',iso);Logger.log('ACTIVE_WEEK_START = '+formatDate_(m));
}
/** Mốc thời gian: phản hồi form submit TRƯỚC mốc này thuộc tuần active cũ. 0 = không chặn. */
function getActiveWeekCutoffMs_(){
  var setAt=Number(PropertiesService.getScriptProperties().getProperty('ACTIVE_WEEK_SET_AT'))||0;
  if(setAt)return setAt;
  var monday=toMidnight_(getActiveWeekStart_()).getTime();   // chưa có mốc (triển khai trước v6.0.1)
  return monday<=Date.now()?monday-3600*1000:0;               // tuần active = tuần hiện tại → chặn phản hồi trước T2
}
function getActiveWeekRange_(){var m=getActiveWeekStart_();return{monday:m,sunday:makeNoon_(m.getFullYear(),m.getMonth(),m.getDate()+6)};}

/** BK + yyMMddHHmmss + 3 số. 3 số = gốc ngẫu nhiên + bộ đếm → không trùng trong cùng 1 lần chạy. */
var BOOKING_SEQ_=null;
function generateBookingId_(){if(BOOKING_SEQ_===null)BOOKING_SEQ_=Math.floor(Math.random()*1000);var ts=Utilities.formatDate(getNow_(),CONFIG.TIMEZONE,'yyMMddHHmmss');var n=('00'+(BOOKING_SEQ_++%1000)).slice(-3);return CONFIG.ID_PREFIX.BOOKING+ts+n;}
function getNamedValue_(e,key){if(!e||!e.namedValues)return'';var v=e.namedValues[key];return(v&&v.length)?String(v[0]).trim():'';}

// ── Cache trong 1 lần chạy ──
var CACHE_={tutors:null,avail:{},packages:null};
function clearCache_(){CACHE_={tutors:null,avail:{},packages:null};}

/** Mọi tutor trong TUTOR_INFO, kể cả đã nghỉ (payroll tháng cũ, email huỷ vẫn cần). */
function getAllTutors_(){
  if(CACHE_.tutors)return CACHE_.tutors.slice();
  var sheet=getTutorSpreadsheet_().getSheetByName(CONFIG.SHEETS.TUTOR_INFO),tutors=[];
  if(sheet){var T=CONFIG.TUTOR_COLS,data=sheet.getDataRange().getValues();
    for(var r=1;r<data.length;r++){var id=String(data[r][T.ID-1]||'').trim(),name=String(data[r][T.NAME-1]||'').trim(),email=String(data[r][T.EMAIL-1]||'').trim(),status=String(data[r][T.STATUS-1]||'').trim(),rate=Number(data[r][T.RATE-1])||0;
      if(id&&name)tutors.push({id:id,name:name,email:email,rate:rate,status:status});}}
  CACHE_.tutors=tutors;return tutors.slice();
}
function getActiveTutors_(){return getAllTutors_().filter(function(t){return t.status==='Active';});}
function findTutor_(tutorId,tutorName){var all=getAllTutors_();for(var i=0;i<all.length;i++)if(tutorId&&all[i].id===String(tutorId))return all[i];for(var j=0;j<all.length;j++)if(tutorName&&all[j].name===String(tutorName))return all[j];return null;}

/** Đọc 1 tab tutor thành map "dateKey|slot" → true. Chỉ đọc 1 lần mỗi lần chạy. */
function loadTutorAvailability_(tutorName){
  if(CACHE_.avail[tutorName])return CACHE_.avail[tutorName];
  var map={},sheet=getTutorSpreadsheet_().getSheetByName(CONFIG.TUTOR_SHEET_PREFIX+tutorName);
  if(sheet){var data=sheet.getDataRange().getValues(),headers=data[0];
    for(var r=1;r<data.length;r++){if(!(data[r][0] instanceof Date))continue;var dk=dateKey_(data[r][0]);
      for(var c=2;c<headers.length;c++){if(String(data[r][c]||'').trim().toLowerCase()==='x'){var slot=String(headers[c]).trim();if(slot)map[dk+'|'+slot]=true;}}}}
  CACHE_.avail[tutorName]=map;return map;
}
function isTutorAvailable_(tutor,date,timeSlot){return !!loadTutorAvailability_(tutor.name)[dateKey_(date)+'|'+timeSlot];}

/**
 * Ảnh chụp BOOKINGS cho 1 lần đặt lịch, đọc tab đúng 1 lần.
 *   taken["tutorId|dateKey|slot"]   tutor đã bị chiếm slot
 *   student["email|dateKey|slot"]   HV đang giữ slot → CreatedAt (ms, 0 nếu không đọc được)
 *   counts[tutorId]                 số booking đang chiếm, scope 'week' = chỉ tuần active (RR theo tuần)
 * Chỉ tính CONSUMING_STATUSES. Booking mới trong cùng lần chạy phải recordBooking_() để state đúng.
 */
function loadBookingState_(bookingsSheet){
  var data=bookingsSheet.getDataRange().getValues(),C=CONFIG.BOOKING_COLS,st={taken:{},student:{},counts:{},lo:null,hi:null};
  if(CONFIG.ROUND_ROBIN_SCOPE==='week'){var range=getActiveWeekRange_();st.lo=toMidnight_(range.monday);st.hi=toMidnight_(range.sunday);}
  for(var r=1;r<data.length;r++){
    if(CONFIG.CONSUMING_STATUSES.indexOf(data[r][C.STATUS-1])===-1)continue;
    var d=data[r][C.DATE-1],slot=String(data[r][C.TIME_SLOT-1]||'').trim(),tid=String(data[r][C.TUTOR_ID-1]||''),c=data[r][C.CREATED_AT-1];
    recordBooking_(st,tid,data[r][C.STUDENT_EMAIL-1],d,slot,(c instanceof Date)?c.getTime():0);
  }
  return st;
}
function recordBooking_(st,tutorId,email,date,timeSlot,createdAtMs){
  var inScope=true;
  if(date instanceof Date){
    var dk=dateKey_(date);
    if(tutorId)st.taken[tutorId+'|'+dk+'|'+timeSlot]=true;
    var em=String(email||'').trim().toLowerCase();if(em)st.student[em+'|'+dk+'|'+timeSlot]=createdAtMs||0;
    if(st.lo){var dm=toMidnight_(date);inScope=dm>=st.lo&&dm<=st.hi;}
  }else if(st.lo)inScope=false;
  if(tutorId&&inScope)st.counts[tutorId]=(st.counts[tutorId]||0)+1;
}
function isTutorBooked_(tutorId,date,timeSlot,st){return !!st.taken[tutorId+'|'+dateKey_(date)+'|'+timeSlot];}
function assignTutor_(date,timeSlot,st){
  var tutors=getActiveTutors_(),candidates=tutors.filter(function(t){return isTutorAvailable_(t,date,timeSlot)&&!isTutorBooked_(t.id,date,timeSlot,st);});
  if(candidates.length===0)return null;
  if(CONFIG.ASSIGNMENT_STRATEGY==='round_robin')return pickByRoundRobin_(candidates,st);
  return candidates[Math.floor(Math.random()*candidates.length)];
}
function pickByRoundRobin_(candidates,st){var counts=st.counts,best=candidates[0],bestCount=counts[best.id]||0;for(var i=1;i<candidates.length;i++){var cnt=counts[candidates[i].id]||0;if(cnt<bestCount){best=candidates[i];bestCount=cnt;}}return best;}
function getDayName_(date){var m={0:'Chủ nhật',1:'Thứ 2',2:'Thứ 3',3:'Thứ 4',4:'Thứ 5',5:'Thứ 6',6:'Thứ 7'};return m[date.getDay()]||'';}
function notifyAdminError_(subject,err,e){try{var payload='';try{payload=JSON.stringify(e,null,2);}catch(x){payload='(N/A)';}MailApp.sendEmail({to:CONFIG.ADMIN_EMAIL,subject:'['+CONFIG.SCHOOL_NAME+'] '+subject,htmlBody:'<div style="font-family:Arial"><h2 style="color:#C62828">'+esc_(subject)+'</h2><p>'+formatDateTime_(getNow_())+'</p><pre>'+esc_(err.message+'\n'+(err.stack||''))+'</pre><pre>'+esc_(payload)+'</pre></div>'});}catch(me){Logger.log('notifyAdminError_ không gửi được: '+me.message);}}

/** Escape HTML. Mọi dữ liệu người dùng nhập (tên, email, tên gói) phải qua đây trước khi ghép vào email. */
function esc_(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// ── Lock ──
var LOCK_DEPTH_=0;
/**
 * Chạy fn trong script lock. Đang giữ lock (gọi lồng, ví dụ processBooking_ → updateFormOptions) → chạy thẳng.
 * Không lấy được lock trong LOCK_TIMEOUT_MS → gọi onBusy() (nếu có) và trả về kết quả của nó.
 */
function withScriptLock_(label,fn,onBusy){
  if(LOCK_DEPTH_>0)return fn();
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)){Logger.log(label+': không lấy được lock sau '+(CONFIG.LOCK_TIMEOUT_MS/1000)+' giây');return onBusy?onBusy():undefined;}
  LOCK_DEPTH_++;
  try{return fn();}finally{LOCK_DEPTH_--;lock.releaseLock();}
}

// ── Email + thông báo ──
/** Gửi mail, KHÔNG ném lỗi: 1 email lỗi (hết quota, địa chỉ sai) không được chặn các bước sau. Trả true/false. */
var MAIL_ERRORS_=[];
function sendMail_(opts){
  try{MailApp.sendEmail(opts);return true;}
  catch(e){MAIL_ERRORS_.push((opts&&opts.to)+' · '+(opts&&opts.subject)+' · '+e.message);Logger.log('Gửi mail lỗi '+(opts&&opts.to)+': '+e.message);return false;}
}
/** Có email gửi lỗi từ đầu lần chạy → báo admin 1 email tổng hợp. */
function flushMailErrors_(context){
  if(!MAIL_ERRORS_.length)return 0;
  var n=MAIL_ERRORS_.length,list=MAIL_ERRORS_.join('\n');MAIL_ERRORS_=[];
  notifyAdminError_('Có '+n+' email gửi không thành công ('+context+')',new Error(list),null);
  return n;
}
/** Thông báo nhỏ góc màn hình khi chạy từ menu. Trigger / editor → chỉ ghi log. */
function toast_(msg){Logger.log(msg);try{SpreadsheetApp.getActive().toast(msg,CONFIG.SCHOOL_NAME,10);}catch(e){}}
