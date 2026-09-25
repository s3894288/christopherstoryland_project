/**
 * Attendance.gs — Điểm Danh & Báo Cáo (v6.0 FINAL)
 * v6.0: generatePayrollReport GHI bảng vào tab PAYROLL_REPORT (trước chỉ log); dùng getNow_()
 * Active →(qua giờ, 00:30)→ Completed →(admin)→ NoShow
 * Lương = (Completed + NoShow) x đơn giá
 */
function markCompletedSessions(){
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS,data=bk.getDataRange().getValues(),now=getNow_(),changed=0;
  for(var r=1;r<data.length;r++){
    if(data[r][C.STATUS-1]!==CONFIG.STATUS.ACTIVE)continue;
    var date=data[r][C.DATE-1],slot=String(data[r][C.TIME_SLOT-1]||'').trim();
    if(!(date instanceof Date)||!slot)continue;
    var endTime=getSlotEndDateTime_(date,slot);
    if(endTime&&endTime<now){bk.getRange(r+1,C.STATUS).setValue(CONFIG.STATUS.COMPLETED);bk.getRange(r+1,C.ATTENDANCE_AT).setValue(now).setNumberFormat('dd/MM/yyyy HH:mm');changed++;}
  }
  SpreadsheetApp.flush();Logger.log('markCompletedSessions: '+changed+' → Completed');return changed;
}
function getSlotEndDateTime_(date,timeSlot){var parts=String(timeSlot).split(' - ');if(parts.length!==2)return null;var end=parts[1].trim().split(':');if(end.length!==2)return null;return new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number(end[0]),Number(end[1]),0);}

function markNoShow(bookingId){
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS;
  if(!bookingId){var cell=bk.getActiveCell();if(!cell||cell.getSheet().getName()!==CONFIG.SHEETS.BOOKINGS)return;var row=cell.getRow();if(row<=1)return;bookingId=bk.getRange(row,C.BOOKING_ID).getValue();}
  var data=bk.getDataRange().getValues();
  for(var r=1;r<data.length;r++){if(String(data[r][C.BOOKING_ID-1])===String(bookingId)){var cur=data[r][C.STATUS-1];if(cur!==CONFIG.STATUS.COMPLETED&&cur!==CONFIG.STATUS.ACTIVE){Logger.log('Chỉ đánh NoShow cho Active/Completed');return;}bk.getRange(r+1,C.STATUS).setValue(CONFIG.STATUS.NOSHOW);bk.getRange(r+1,C.ATTENDANCE_AT).setValue(getNow_()).setNumberFormat('dd/MM/yyyy HH:mm');SpreadsheetApp.flush();Logger.log('NoShow: '+bookingId);return;}}
}

function buildAttendanceReport(fromDate,toDate){
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),C=CONFIG.BOOKING_COLS,data=bk.getDataRange().getValues();
  var byTutor={},byStudent={},totals={completed:0,noshow:0,active:0,cancelled:0,failed:0};
  for(var r=1;r<data.length;r++){var date=data[r][C.DATE-1];if(!(date instanceof Date))continue;if(fromDate&&toMidnight_(date)<toMidnight_(fromDate))continue;if(toDate&&toMidnight_(date)>toMidnight_(toDate))continue;
    var status=data[r][C.STATUS-1],tutor=String(data[r][C.TUTOR_NAME-1]||'').trim(),email=String(data[r][C.STUDENT_EMAIL-1]||'').trim();
    if(status===CONFIG.STATUS.COMPLETED)totals.completed++;else if(status===CONFIG.STATUS.NOSHOW)totals.noshow++;else if(status===CONFIG.STATUS.ACTIVE)totals.active++;else if(status===CONFIG.STATUS.CANCELLED){totals.cancelled++;continue;}else if(status===CONFIG.STATUS.FAILED){totals.failed++;continue;}
    if(tutor){if(!byTutor[tutor])byTutor[tutor]={completed:0,noshow:0,active:0};if(status===CONFIG.STATUS.COMPLETED)byTutor[tutor].completed++;else if(status===CONFIG.STATUS.NOSHOW)byTutor[tutor].noshow++;else if(status===CONFIG.STATUS.ACTIVE)byTutor[tutor].active++;}
    if(email){if(!byStudent[email])byStudent[email]={completed:0,noshow:0,active:0};if(status===CONFIG.STATUS.COMPLETED)byStudent[email].completed++;else if(status===CONFIG.STATUS.NOSHOW)byStudent[email].noshow++;else if(status===CONFIG.STATUS.ACTIVE)byStudent[email].active++;}}
  var attended=totals.completed+totals.noshow,rate=attended>0?(totals.completed/attended):0;
  Logger.log('BÁO CÁO: Completed='+totals.completed+' NoShow='+totals.noshow+' Active='+totals.active+' Rate='+(rate*100).toFixed(1)+'%');
  return{totals:totals,byTutor:byTutor,byStudent:byStudent,participationRate:rate};
}

function generatePayrollReport(fromDate,toDate){
  var payroll=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.PAYROLL);if(!payroll){Logger.log('Thiếu tab PAYROLL_REPORT');return 0;}
  if(fromDate)payroll.getRange('B2').setValue(fromDate).setNumberFormat('dd/MM/yyyy');
  if(toDate)payroll.getRange('D2').setValue(toDate).setNumberFormat('dd/MM/yyyy');
  var report=buildAttendanceReport(fromDate,toDate),tutors=getActiveTutors_(),rows=[],grandTotal=0;
  for(var i=0;i<tutors.length;i++){var t=tutors[i],st=report.byTutor[t.name]||{completed:0,noshow:0,active:0};var billable=st.completed+st.noshow,amount=billable*t.rate;grandTotal+=amount;
    rows.push([t.name,st.completed,st.noshow,st.active,billable,t.rate,amount]);}
  rows.push(['TỔNG CỘNG',report.totals.completed,report.totals.noshow,report.totals.active,report.totals.completed+report.totals.noshow,'',grandTotal]);
  /* Xoá bảng cũ từ dòng 5, ghi bảng mới */
  var last=payroll.getLastRow();if(last>=5)payroll.getRange(5,1,last-4,7).clearContent();
  payroll.getRange(5,1,rows.length,7).setValues(rows);
  payroll.getRange(5,6,rows.length,2).setNumberFormat('#,##0');
  payroll.getRange(4+rows.length,1,1,7).setFontWeight('bold');
  payroll.getRange('F2').setValue('Tạo lúc: '+formatDateTime_(getNow_()));
  SpreadsheetApp.flush();
  Logger.log('PAYROLL '+(fromDate?formatDate_(fromDate):'')+' → '+(toDate?formatDate_(toDate):'')+' · TỔNG: '+grandTotal);return grandTotal;
}
function generatePayrollThisMonth(){var t=getNow_();generatePayrollReport(new Date(t.getFullYear(),t.getMonth(),1),new Date(t.getFullYear(),t.getMonth()+1,0));}
function generatePayrollLastMonth(){var t=getNow_();generatePayrollReport(new Date(t.getFullYear(),t.getMonth()-1,1),new Date(t.getFullYear(),t.getMonth(),0));}
