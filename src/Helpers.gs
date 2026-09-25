/**
 * Helpers.gs — Tiện Ích (v6.0.1)
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

function generateBookingId_(){var ts=Utilities.formatDate(getNow_(),CONFIG.TIMEZONE,'yyMMddHHmmss');var r=('00'+Math.floor(Math.random()*1000)).slice(-3);return CONFIG.ID_PREFIX.BOOKING+ts+r;}
function getNamedValue_(e,key){if(!e||!e.namedValues)return'';var v=e.namedValues[key];return(v&&v.length)?String(v[0]).trim():'';}

// ── Cache trong 1 lần chạy ──
var CACHE_={tutors:null,avail:{}};
function clearCache_(){CACHE_={tutors:null,avail:{}};}

function getActiveTutors_(){
  if(CACHE_.tutors)return CACHE_.tutors.slice();
  var sheet=getTutorSpreadsheet_().getSheetByName(CONFIG.SHEETS.TUTOR_INFO),tutors=[];
  if(sheet){var T=CONFIG.TUTOR_COLS,data=sheet.getDataRange().getValues();
    for(var r=1;r<data.length;r++){var id=String(data[r][T.ID-1]||'').trim(),name=String(data[r][T.NAME-1]||'').trim(),email=String(data[r][T.EMAIL-1]||'').trim(),status=String(data[r][T.STATUS-1]||'').trim(),rate=Number(data[r][T.RATE-1])||0;
      if(id&&name&&status==='Active')tutors.push({id:id,name:name,email:email,rate:rate});}}
  CACHE_.tutors=tutors;return tutors.slice();
}

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

function isTutorBooked_(tutorId,date,timeSlot,bookingsSheet){
  var data=bookingsSheet.getDataRange().getValues(),C=CONFIG.BOOKING_COLS;
  for(var r=1;r<data.length;r++){if(String(data[r][C.TUTOR_ID-1])===String(tutorId)&&sameDate_(data[r][C.DATE-1],date)&&String(data[r][C.TIME_SLOT-1]).trim()===timeSlot&&CONFIG.CONSUMING_STATUSES.indexOf(data[r][C.STATUS-1])!==-1)return true;}
  return false;
}

/** Đếm booking đang chiếm của mỗi tutor. Scope 'week' = chỉ tuần active → RR cân bằng theo tuần. */
function getActiveBookingCountByTutor_(bookingsSheet){
  var data=bookingsSheet.getDataRange().getValues(),C=CONFIG.BOOKING_COLS,count={};
  var weekScope=CONFIG.ROUND_ROBIN_SCOPE==='week',lo=null,hi=null;
  if(weekScope){var range=getActiveWeekRange_();lo=toMidnight_(range.monday);hi=toMidnight_(range.sunday);}
  for(var r=1;r<data.length;r++){
    if(CONFIG.CONSUMING_STATUSES.indexOf(data[r][C.STATUS-1])===-1)continue;
    if(weekScope){var d=data[r][C.DATE-1];if(!(d instanceof Date))continue;var dm=toMidnight_(d);if(dm<lo||dm>hi)continue;}
    var tid=String(data[r][C.TUTOR_ID-1]);if(tid)count[tid]=(count[tid]||0)+1;
  }
  return count;
}
function assignTutor_(date,timeSlot,bookingsSheet){
  var tutors=getActiveTutors_(),candidates=tutors.filter(function(t){return isTutorAvailable_(t,date,timeSlot)&&!isTutorBooked_(t.id,date,timeSlot,bookingsSheet);});
  if(candidates.length===0)return null;
  if(CONFIG.ASSIGNMENT_STRATEGY==='round_robin')return pickByRoundRobin_(candidates,bookingsSheet);
  return candidates[Math.floor(Math.random()*candidates.length)];
}
function pickByRoundRobin_(candidates,bookingsSheet){var counts=getActiveBookingCountByTutor_(bookingsSheet),best=candidates[0],bestCount=counts[best.id]||0;for(var i=1;i<candidates.length;i++){var cnt=counts[candidates[i].id]||0;if(cnt<bestCount){best=candidates[i];bestCount=cnt;}}return best;}
function getDayName_(date){var m={0:'Chủ nhật',1:'Thứ 2',2:'Thứ 3',3:'Thứ 4',4:'Thứ 5',5:'Thứ 6',6:'Thứ 7'};return m[date.getDay()]||'';}
function notifyAdminError_(subject,err,e){try{var payload='';try{payload=JSON.stringify(e,null,2);}catch(x){payload='(N/A)';}MailApp.sendEmail({to:CONFIG.ADMIN_EMAIL,subject:'['+CONFIG.SCHOOL_NAME+'] '+subject,htmlBody:'<div style="font-family:Arial"><h2 style="color:#C62828">'+subject+'</h2><p>'+formatDateTime_(getNow_())+'</p><pre>'+err.message+'\n'+(err.stack||'')+'</pre><pre>'+payload+'</pre></div>'});}catch(me){}}
