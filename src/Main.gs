/**
 * Main.gs — Xử Lý Form Đặt Lịch (v6.1.0)
 *
 * v6.1.0:
 *   Trigger form đôi khi bắn 2 lần cho 1 phản hồi → trước đây HV bị xếp 2 tutor cùng slot, trừ 2 buổi.
 *   Giờ: HV đã giữ slot đó trong DUPLICATE_SUBMIT_WINDOW_MINUTES → bỏ qua im lặng; cũ hơn → Failed DUPLICATE.
 *   HV trạng thái Paused → Failed PAUSED (trước đây vẫn đặt được).
 *   Đọc BOOKINGS 1 lần (loadBookingState_); slot vừa đặt tính ngay vào Round Robin.
 *   Tạo Meet thử lại MEET_CREATE_ATTEMPTS lần; vẫn lỗi → booking Active + admin nhận email để tạo tay.
 *   Email lỗi không còn chặn các bước sau; admin nhận 1 email tổng hợp.
 *
 * v6.0.1 (24/09/2026):
 *   BUG NGHIÊM TRỌNG: FormLink.gs tạo trigger kiểu "From form". Trigger này chỉ gửi
 *   e.response, KHÔNG có e.values / e.namedValues → processBooking_ không đọc được email
 *   → log "Thiếu email" rồi thoát ÊM. Execution vẫn báo Completed, học viên không có lịch.
 *   Sửa: normalizeFormEvent_() đọc được cả 3 dạng event (Spreadsheet, Form, rỗng).
 *   Thiếu email giờ ném lỗi → admin nhận email, không còn nuốt phản hồi im lặng.
 *   Chạy tay onFormSubmitTrigger (e rỗng) → bỏ qua, không gửi email lỗi giả.
 *   Thêm recoverMissedBookings(): quét phản hồi form gần đây chưa có trong BOOKINGS và xử lý lại.
 *
 * v6.0:
 *   tryBookSlot_ chặn slot đã qua / quá sát giờ (PAST_SLOT) TRƯỚC khi đụng quota
 *   Lưu EventID (cột N) để onEditTrigger xoá lịch Calendar khi huỷ
 *   updateFormOptions() ở cuối đã bao gồm syncCheckSlotValues() (xem FormUpdater.gs)
 *
 * Event chuẩn hoá: { values:[0]Timestamp [1]Email [2]Họ và tên [3]Student ID [4..10]Thứ 2..CN }
 *               hoặc { namedValues:{ 'Email':[..], 'Họ và tên':[..], 'Thứ 2':[..] ... } }
 */
function onFormSubmitTrigger(e){
  var ev=normalizeFormEvent_(e);
  if(!ev){Logger.log('Bỏ qua: onFormSubmitTrigger chỉ chạy khi học viên submit form. Muốn xử lý phản hồi bị sót: menu thaiput → Form → Xử lý lại phản hồi bị sót.');return;}
  withScriptLock_('onFormSubmitTrigger',function(){
    try{clearCache_();processBooking_(ev);}
    catch(err){Logger.log('LỖI: '+err.message);notifyAdminError_('Lỗi xử lý đặt lịch',err,ev);}
  },function(){notifyAdminError_('Không lấy được lock khi đặt lịch',new Error('Lock timeout. Chạy menu thaiput → Form → Xử lý lại phản hồi bị sót.'),ev);});
}

/**
 * Chuẩn hoá event từ mọi loại trigger về dạng processBooking_ đọc được.
 *   Trigger Spreadsheet → có sẵn e.values / e.namedValues
 *   Trigger Form        → chỉ có e.response (FormResponse) → dựng namedValues theo tiêu đề câu hỏi
 *   Chạy tay / e rỗng   → null
 */
function normalizeFormEvent_(e){
  if(!e)return null;
  if(e.values||e.namedValues)return e;
  if(e.response)return formResponseToEvent_(e.response);
  return null;
}
function formResponseToEvent_(resp){
  var nv={},items=resp.getItemResponses();
  for(var i=0;i<items.length;i++){
    var r=items[i].getResponse(),title=String(items[i].getItem().getTitle()).trim();
    nv[title]=[Array.isArray(r)?r.join(', '):String(r==null?'':r)];
  }
  var em='';try{em=resp.getRespondentEmail()||'';}catch(x){}
  if(em&&!nv['Email'])nv['Email']=[em];
  var ts=resp.getTimestamp();
  return{namedValues:nv,source:'form',responseId:resp.getId(),timestamp:ts?formatDateTime_(ts):''};
}

function processBooking_(e){
  var ss=SpreadsheetApp.getActive(),bookingsSheet=ss.getSheetByName(CONFIG.SHEETS.BOOKINGS);
  var studentEmail,studentName,studentIdInput;
  if(e.values){studentEmail=String(e.values[1]||'').trim();studentName=String(e.values[2]||'').trim();studentIdInput=String(e.values[3]||'').trim();}
  else{studentEmail=getNamedValue_(e,'Email');studentName=getNamedValue_(e,'Họ và tên');studentIdInput=getNamedValue_(e,'Student ID');}
  if(!studentEmail)throw new Error('Không đọc được email từ phản hồi form. Kiểm tra Form → Cài đặt → Thu thập email đang BẬT.');

  var weekStart=getActiveWeekStart_(),selectedSlots=parseFormSlots_(e,weekStart);
  if(selectedSlots.length===0){Logger.log('Không có slot');return;}

  var quota=getStudentQuotaByEmail_(studentEmail),studentId=quota.found?quota.id:(studentIdInput||'');
  if(quota.found&&!studentName)studentName=quota.name;
  var budgetLeft=(quota.found&&CONFIG.QUOTA.ENFORCE)?quota.remaining:Number.MAX_SAFE_INTEGER;
  if(!CONFIG.QUOTA.ENFORCE)budgetLeft=Number.MAX_SAFE_INTEGER;

  var allRows=[],successBookings=[],failedSlots=[],now=getNow_(),state=loadBookingState_(bookingsSheet),emailKey=studentEmail.toLowerCase(),dupSkipped=0;
  var dupWindowMs=(CONFIG.DUPLICATE_SUBMIT_WINDOW_MINUTES||0)*60000;
  function fail_(slot,reason){allRows.push(bookingToRow_(generateBookingId_(),studentId,studentName,studentEmail,'','',slot.date,slot.timeSlot,'',CONFIG.STATUS.FAILED,now,reason,'',''));failedSlots.push({date:slot.date,timeSlot:slot.timeSlot,reason:reason});}
  for(var i=0;i<selectedSlots.length;i++){
    var slot=selectedSlots[i];
    // 1. Slot đã qua → fail ngay, không trừ budget
    if(!isSlotBookable_(slot.date,slot.timeSlot)){fail_(slot,CONFIG.FAIL_REASONS.PAST_SLOT);continue;}
    // 2. HV đã giữ slot này: vừa tạo (trigger bắn 2 lần) → bỏ qua im lặng; cũ hơn → báo trùng
    var held=state.student[emailKey+'|'+dateKey_(slot.date)+'|'+slot.timeSlot];
    if(held!==undefined){
      if(held&&now.getTime()-held<dupWindowMs){dupSkipped++;Logger.log('Bỏ qua trùng (trigger bắn lại): '+studentEmail+' '+formatDate_(slot.date)+' '+slot.timeSlot);continue;}
      fail_(slot,CONFIG.FAIL_REASONS.DUPLICATE);continue;
    }
    // 3. Quota
    var elig=checkQuotaEligibility_(quota,budgetLeft);
    if(!elig.allowed){fail_(slot,elig.reason);continue;}
    // 4. Tìm tutor + tạo Meet
    var result=tryBookSlot_(slot.date,slot.timeSlot,studentEmail,studentName,studentId,state);
    allRows.push(result.row);
    if(result.success){successBookings.push(result);budgetLeft--;recordBooking_(state,result.tutor.id,studentEmail,slot.date,slot.timeSlot,now.getTime());}
    else failedSlots.push({date:result.date,timeSlot:result.timeSlot,reason:result.reason});
  }
  if(allRows.length===0){Logger.log('Không có gì để ghi ('+dupSkipped+' slot trùng do trigger bắn lại)');return;}

  // Cột G phải là midnight để COUNTIFS khớp
  for(var j=0;j<allRows.length;j++){var dv=allRows[j][CONFIG.BOOKING_COLS.DATE-1];if(dv instanceof Date)allRows[j][CONFIG.BOOKING_COLS.DATE-1]=new Date(dv.getFullYear(),dv.getMonth(),dv.getDate());}
  if(allRows.length>0){var startRow=bookingsSheet.getLastRow()+1;bookingsSheet.getRange(startRow,1,allRows.length,CONFIG.BOOKING_NUM_COLS).setValues(allRows);bookingsSheet.getRange(startRow,CONFIG.BOOKING_COLS.DATE,allRows.length,1).setNumberFormat('dd/MM/yyyy');SpreadsheetApp.flush();}

  try{updateFormOptions();}catch(uf){Logger.log('updateFormOptions: '+uf.message);}

  // Dữ liệu đã ghi. Từ đây mỗi bước độc lập: bước nào lỗi cũng không chặn bước sau.
  var noMeet=successBookings.filter(function(b){return !b.meetLink;});
  if(noMeet.length)notifyAdminError_('Booking đã xác nhận nhưng CHƯA có Google Meet — cần tạo tay',new Error(noMeet.map(function(b){return b.bookingId+' · '+studentEmail+' · '+formatDate_(b.date)+' '+b.timeSlot+' · tutor '+b.tutor.name+(b.meetError?' · '+b.meetError:'');}).join('\n')),null);
  try{if(successBookings.length>0&&CONFIG.EMAIL.SEND_CONFIRMATION){var ra=quota.found?Math.max(0,quota.remaining-successBookings.length):null;sendBookingConfirmation(studentEmail,studentName,successBookings,quota,ra);}}catch(e1){Logger.log('sendBookingConfirmation: '+e1.message);MAIL_ERRORS_.push('Xác nhận '+studentEmail+': '+e1.message);}
  try{if(failedSlots.length>0)sendFailureNotifications(studentEmail,studentName,studentId,failedSlots,quota,successBookings.length);}catch(e2){Logger.log('sendFailureNotifications: '+e2.message);MAIL_ERRORS_.push('Thất bại '+studentEmail+': '+e2.message);}
  try{handleBalanceAlerts_(quota,successBookings.length,successBookings);}catch(e3){Logger.log('handleBalanceAlerts_: '+e3.message);}
  flushMailErrors_('đặt lịch '+studentEmail);
}

function parseFormSlots_(e,weekStart){
  var slots=[];
  for(var i=0;i<CONFIG.DAY_LABELS.length;i++){var label=CONFIG.DAY_LABELS[i],offset=CONFIG.DAY_OFFSETS[label],chosen='';
    if(e.values)chosen=String(e.values[4+i]||'').trim();else if(e.namedValues){var v=e.namedValues[label];if(v&&v.length)chosen=String(v[0]).trim();}
    if(chosen&&chosen!==CONFIG.NO_CHOICE_LABEL)slots.push({date:makeNoon_(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+offset),timeSlot:chosen,dayLabel:label});}
  return slots;
}

function tryBookSlot_(date,timeSlot,studentEmail,studentName,studentId,state){
  var bookingId=generateBookingId_(),now=getNow_();
  var tutor=assignTutor_(date,timeSlot,state);
  if(!tutor){
    // Phân biệt: không tutor nào rảnh (SLOT_FULL) vs có rảnh nhưng đã bị đặt hết (cũng SLOT_FULL với HV)
    var reason=checkSlotAvailability_(date,timeSlot)<=0?CONFIG.FAIL_REASONS.SLOT_FULL:CONFIG.FAIL_REASONS.NO_TUTOR;
    return{success:false,reason:reason,date:date,timeSlot:timeSlot,row:bookingToRow_(bookingId,studentId,studentName,studentEmail,'','',date,timeSlot,'',CONFIG.STATUS.FAILED,now,reason,'','')};
  }
  var meet={link:'',eventId:''},meetError='',attempts=Math.max(1,CONFIG.MEET_CREATE_ATTEMPTS||1);
  for(var a=1;a<=attempts;a++){
    try{meet=createMeetEvent_(date,timeSlot,studentEmail,tutor.email,studentName,tutor.name);meetError='';break;}
    catch(me){meetError=me.message;Logger.log('Meet lỗi lần '+a+'/'+attempts+': '+me.message);if(a<attempts)Utilities.sleep(1500*a);}
  }
  return{success:true,reason:'',tutor:tutor,meetLink:meet.link,eventId:meet.eventId,meetError:meetError,bookingId:bookingId,date:date,timeSlot:timeSlot,row:bookingToRow_(bookingId,studentId,studentName,studentEmail,tutor.id,tutor.name,date,timeSlot,meet.link,CONFIG.STATUS.ACTIVE,now,'','',meet.eventId)};
}

function bookingToRow_(bookingId,studentId,studentName,studentEmail,tutorId,tutorName,date,timeSlot,meetLink,status,createdAt,failReason,attendanceAt,eventId){
  return[bookingId,studentId,studentName,studentEmail,tutorId,tutorName,date,timeSlot,meetLink,status,createdAt,failReason||'',attendanceAt||'',eventId||''];
}

/** CHECK_SLOT là cache (giá trị đồng bộ), chỉ dùng để chọn thông điệp lỗi. Nguồn sự thật là assignTutor_. */
function checkSlotAvailability_(date,timeSlot){var sheet=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT),data=sheet.getDataRange().getValues(),headers=data[0],col=-1;for(var c=2;c<headers.length;c++)if(String(headers[c]).trim()===timeSlot){col=c;break;}if(col===-1)return 0;for(var r=1;r<data.length;r++)if(sameDate_(data[r][0],date))return Number(data[r][col])||0;return 0;}


// ══════════════════════════════════════════════════════════
//  CỨU PHẢN HỒI BỊ SÓT (v6.0.1)
// ══════════════════════════════════════════════════════════

/**
 * Quét phản hồi form đặt lịch trong RECOVER_HOURS giờ gần nhất.
 * Phản hồi submit trước lúc đổi tuần active (ACTIVE_WEEK_SET_AT) bị bỏ qua, tránh đặt nhầm sang tuần mới.
 * Phản hồi được coi là ĐÃ XỬ LÝ khi mọi slot nó chọn đều đã có dòng BOOKINGS
 * (cùng email + ngày + khung giờ, tạo sau lúc submit; Active hay Failed đều tính).
 * Chưa đủ → xử lý lại. Chạy nhiều lần vẫn an toàn, không tạo booking trùng.
 */
var RECOVER_HOURS=72;
function recoverMissedBookings(){
  return withScriptLock_('recoverMissedBookings',recoverMissedBookingsLocked_,function(){toast_('Hệ thống đang bận, thử lại sau 1 phút');return{done:0,skipped:0,old:0,errors:1};});
}
function recoverMissedBookingsLocked_(){
  var report=[],done=0,skipped=0,old=0,errors=0;
  try{
    clearCache_();
    var formId=getBookingFormId_();
    if(!formId)throw new Error('Chưa có BOOKING_FORM_ID. Chạy menu thaiput → Form → Kết nối lại tất cả Form.');
    var weekStart=getActiveWeekStart_(),cutoff=getActiveWeekCutoffMs_();
    var responses=FormApp.openById(formId).getResponses(new Date(Date.now()-RECOVER_HOURS*3600*1000));
    var idx=buildBookingSlotIndex_();
    for(var i=0;i<responses.length;i++){
      var ev=formResponseToEvent_(responses[i]),email=getNamedValue_(ev,'Email').toLowerCase(),ts=responses[i].getTimestamp().getTime();
      if(!email){skipped++;continue;}
      if(ts<cutoff){old++;report.push('⏭ '+email+' ('+ev.timestamp+'): thuộc tuần trước, không xử lý lại');continue;}
      var slots=parseFormSlots_(ev,weekStart);
      if(!slots.length){skipped++;continue;}
      var handled=true;
      for(var s=0;s<slots.length&&handled;s++){
        var list=idx[slotKey_(email,slots[s].date,slots[s].timeSlot)]||[],hit=false;
        for(var k=0;k<list.length;k++)if(list[k]>=ts-60*1000){hit=true;break;}
        if(!hit)handled=false;
      }
      if(handled){skipped++;continue;}
      try{clearCache_();processBooking_(ev);done++;report.push('✔ '+email+' (submit '+ev.timestamp+')');idx=buildBookingSlotIndex_();}
      catch(pe){errors++;report.push('✘ '+email+': '+pe.message);Logger.log('recover lỗi '+email+': '+pe.message);}
    }
  }catch(err){Logger.log('recoverMissedBookings: '+err.message);report.push('LỖI: '+err.message);errors++;}
  var msg='Đã xử lý lại: '+done+'\nĐã có sẵn / bỏ qua: '+skipped+'\nThuộc tuần trước: '+old+'\nLỗi: '+errors+(report.length?'\n\n'+report.join('\n'):'');
  Logger.log(msg);
  try{SpreadsheetApp.getUi().alert('Xử lý lại phản hồi bị sót ('+RECOVER_HOURS+' giờ)',msg,SpreadsheetApp.getUi().ButtonSet.OK);}catch(u){}
  return{done:done,skipped:skipped,old:old,errors:errors};
}

/** "email|yyyy-m-d|khung giờ" → danh sách thời điểm tạo dòng BOOKINGS (ms) */
function buildBookingSlotIndex_(){
  var sh=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),d=sh.getDataRange().getValues(),B=CONFIG.BOOKING_COLS,idx={};
  for(var r=1;r<d.length;r++){
    var em=String(d[r][B.STUDENT_EMAIL-1]||'').trim().toLowerCase(),dt=d[r][B.DATE-1],c=d[r][B.CREATED_AT-1];
    if(!em||!(dt instanceof Date))continue;
    var t=(c instanceof Date)?c.getTime():new Date(c).getTime();if(isNaN(t))continue;
    var key=slotKey_(em,dt,String(d[r][B.TIME_SLOT-1]||'').trim());
    (idx[key]=idx[key]||[]).push(t);
  }
  return idx;
}
function slotKey_(email,date,timeSlot){return email+'|'+date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate()+'|'+timeSlot;}
