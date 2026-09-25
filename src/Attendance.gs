/**
 * Attendance.gs — Điểm Danh & Báo Cáo (v6.1.0)
 * v6.1.0: PAYROLL tính theo TutorID và gồm MỌI tutor có buổi trong kỳ, kể cả đã nghỉ (trước: chỉ tutor
 *         Active → tutor nghỉ giữa tháng mất lương, dòng TỔNG CỘNG lệch với tổng các dòng);
 *         điểm danh chạy trong lock; NoShow chọn được nhiều dòng
 * v6.0: generatePayrollReport GHI bảng vào tab PAYROLL_REPORT (trước chỉ log); dùng getNow_()
 * Active →(qua giờ, 00:30)→ Completed →(admin)→ NoShow
 * Lương = (Completed + NoShow) x đơn giá
 */
function markCompletedSessions(){return withScriptLock_('markCompletedSessions',markCompletedSessionsLocked_);}
function markCompletedSessionsLocked_(){
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS,data=bk.getDataRange().getValues(),now=getNow_(),changed=0;
  for(var r=1;r<data.length;r++){
    if(data[r][C.STATUS-1]!==CONFIG.STATUS.ACTIVE)continue;
    var date=data[r][C.DATE-1],slot=String(data[r][C.TIME_SLOT-1]||'').trim();
    if(!(date instanceof Date)||!slot)continue;
    var endTime=getSlotEndDateTime_(date,slot);
    if(endTime&&endTime<now){bk.getRange(r+1,C.STATUS).setValue(CONFIG.STATUS.COMPLETED);bk.getRange(r+1,C.ATTENDANCE_AT).setValue(now).setNumberFormat('dd/MM/yyyy HH:mm');changed++;}
  }
  SpreadsheetApp.flush();toast_('Điểm danh: '+changed+' buổi → Completed');return changed;
}
function getSlotEndDateTime_(date,timeSlot){var parts=String(timeSlot).split(' - ');if(parts.length!==2)return null;var end=parts[1].trim().split(':');if(end.length!==2)return null;return new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number(end[0]),Number(end[1]),0);}

/** markNoShow(bookingId) từ code, hoặc từ menu: đánh mọi dòng đang chọn trong BOOKINGS. */
function markNoShow(bookingId){
  return withScriptLock_('markNoShow',function(){
    var ss=SpreadsheetApp.getActive(),bk=ss.getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS,ids=[];
    if(bookingId)ids=[String(bookingId)];
    else{
      var sel=null;try{sel=ss.getActiveRange();}catch(e){}
      if(!sel||sel.getSheet().getName()!==CONFIG.SHEETS.BOOKINGS){toast_('Chọn dòng cần đánh NoShow trong tab BOOKINGS trước');return 0;}
      var r0=Math.max(2,sel.getRow()),r1=sel.getRow()+sel.getNumRows()-1;
      if(r1<r0){toast_('Chọn dòng dữ liệu (không phải dòng tiêu đề)');return 0;}
      ids=bk.getRange(r0,C.BOOKING_ID,r1-r0+1,1).getValues().map(function(v){return String(v[0]);}).filter(String);
    }
    var data=bk.getDataRange().getValues(),want={},marked=0,skipped=0;ids.forEach(function(id){want[id]=true;});
    for(var r=1;r<data.length;r++){
      if(!want[String(data[r][C.BOOKING_ID-1])])continue;
      var cur=data[r][C.STATUS-1];
      if(cur!==CONFIG.STATUS.COMPLETED&&cur!==CONFIG.STATUS.ACTIVE){skipped++;continue;}
      bk.getRange(r+1,C.STATUS).setValue(CONFIG.STATUS.NOSHOW);bk.getRange(r+1,C.ATTENDANCE_AT).setValue(getNow_()).setNumberFormat('dd/MM/yyyy HH:mm');marked++;
    }
    SpreadsheetApp.flush();
    toast_('NoShow: '+marked+' buổi'+(skipped?' · bỏ qua '+skipped+' dòng không phải Active/Completed':''));
    return marked;
  });
}

function buildAttendanceReport(fromDate,toDate){
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS,data=bk.getDataRange().getValues();
  var byTutor={},byTutorId={},byStudent={},totals={completed:0,noshow:0,active:0,cancelled:0,failed:0};
  for(var r=1;r<data.length;r++){var date=data[r][C.DATE-1];if(!(date instanceof Date))continue;if(fromDate&&toMidnight_(date)<toMidnight_(fromDate))continue;if(toDate&&toMidnight_(date)>toMidnight_(toDate))continue;
    var status=data[r][C.STATUS-1],tutor=String(data[r][C.TUTOR_NAME-1]||'').trim(),tid=String(data[r][C.TUTOR_ID-1]||'').trim(),email=String(data[r][C.STUDENT_EMAIL-1]||'').trim();
    if(status===CONFIG.STATUS.COMPLETED)totals.completed++;else if(status===CONFIG.STATUS.NOSHOW)totals.noshow++;else if(status===CONFIG.STATUS.ACTIVE)totals.active++;else if(status===CONFIG.STATUS.CANCELLED){totals.cancelled++;continue;}else if(status===CONFIG.STATUS.FAILED){totals.failed++;continue;}
    if(tid){if(!byTutorId[tid])byTutorId[tid]={name:tutor,completed:0,noshow:0,active:0};if(status===CONFIG.STATUS.COMPLETED)byTutorId[tid].completed++;else if(status===CONFIG.STATUS.NOSHOW)byTutorId[tid].noshow++;else if(status===CONFIG.STATUS.ACTIVE)byTutorId[tid].active++;}
    if(tutor){if(!byTutor[tutor])byTutor[tutor]={completed:0,noshow:0,active:0};if(status===CONFIG.STATUS.COMPLETED)byTutor[tutor].completed++;else if(status===CONFIG.STATUS.NOSHOW)byTutor[tutor].noshow++;else if(status===CONFIG.STATUS.ACTIVE)byTutor[tutor].active++;}
    if(email){if(!byStudent[email])byStudent[email]={completed:0,noshow:0,active:0};if(status===CONFIG.STATUS.COMPLETED)byStudent[email].completed++;else if(status===CONFIG.STATUS.NOSHOW)byStudent[email].noshow++;else if(status===CONFIG.STATUS.ACTIVE)byStudent[email].active++;}}
  var attended=totals.completed+totals.noshow,rate=attended>0?(totals.completed/attended):0;
  Logger.log('BÁO CÁO: Completed='+totals.completed+' NoShow='+totals.noshow+' Active='+totals.active+' Rate='+(rate*100).toFixed(1)+'%');
  return{totals:totals,byTutor:byTutor,byTutorId:byTutorId,byStudent:byStudent,participationRate:rate};
}

function generatePayrollReport(fromDate,toDate){
  var payroll=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.PAYROLL);if(!payroll){Logger.log('Thiếu tab PAYROLL_REPORT');return 0;}
  if(fromDate)payroll.getRange('B2').setValue(fromDate).setNumberFormat('dd/MM/yyyy');
  if(toDate)payroll.getRange('D2').setValue(toDate).setNumberFormat('dd/MM/yyyy');
  clearCache_();
  var report=buildAttendanceReport(fromDate,toDate),tutors=getAllTutors_(),rows=[],grandTotal=0,listed={};
  /* Tutor Active (kể cả 0 buổi) + tutor đã nghỉ nhưng có buổi trong kỳ */
  for(var i=0;i<tutors.length;i++){var t=tutors[i],st=report.byTutorId[t.id];if(!st&&t.status!=='Active')continue;st=st||{completed:0,noshow:0,active:0};listed[t.id]=true;
    var billable=st.completed+st.noshow,amount=billable*t.rate;grandTotal+=amount;
    rows.push([t.name+(t.status!=='Active'?' (đã nghỉ)':''),st.completed,st.noshow,st.active,billable,t.rate,amount]);}
  /* TutorID trong BOOKINGS không còn trong TUTOR_INFO → vẫn liệt kê, đơn giá 0 để admin tự xử lý */
  for(var tid in report.byTutorId){if(listed[tid])continue;var o=report.byTutorId[tid];rows.push([o.name+' ('+tid+' — không có trong TUTOR_INFO)',o.completed,o.noshow,o.active,o.completed+o.noshow,0,0]);}
  rows.push(['TỔNG CỘNG',report.totals.completed,report.totals.noshow,report.totals.active,report.totals.completed+report.totals.noshow,'',grandTotal]);
  /* Xoá bảng cũ từ dòng 5, ghi bảng mới */
  var last=payroll.getLastRow();if(last>=5)payroll.getRange(5,1,last-4,7).clearContent().setFontWeight('normal');
  payroll.getRange(5,1,rows.length,7).setValues(rows);
  payroll.getRange(5,6,rows.length,2).setNumberFormat('#,##0');
  payroll.getRange(4+rows.length,1,1,7).setFontWeight('bold');
  payroll.getRange('F2').setValue('Tạo lúc: '+formatDateTime_(getNow_()));
  SpreadsheetApp.flush();
  toast_('PAYROLL '+(fromDate?formatDate_(fromDate):'')+' → '+(toDate?formatDate_(toDate):'')+' · TỔNG: '+String(grandTotal).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' đ');return grandTotal;
}
function generatePayrollThisMonth(){var t=getNow_();generatePayrollReport(new Date(t.getFullYear(),t.getMonth(),1),new Date(t.getFullYear(),t.getMonth()+1,0));}
function generatePayrollLastMonth(){var t=getNow_();generatePayrollReport(new Date(t.getFullYear(),t.getMonth()-1,1),new Date(t.getFullYear(),t.getMonth(),0));}
