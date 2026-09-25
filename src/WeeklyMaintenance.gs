/**
 * WeeklyMaintenance.gs — Bảo Trì Tuần & Tháng (v6.0 FINAL)
 *
 * v6.0 FIX: weeklyRollover cũ tính "thứ 2 kế tiếp" từ ngày hiện tại. Trigger Google
 * chạy lệch ±15 phút → nếu chạy lúc 00:05 thứ 2 thay vì 23:00 CN, nó nhảy sang tuần SAU NỮA.
 * Giờ: lấy thứ 2 của tuần chứa (now + 12h) → CN 23:00 hay T2 00:10 đều ra cùng 1 thứ 2.
 */
function weeklyRollover(){
  var ref=new Date(getNow_().getTime()+12*3600000),monday=getMondayOfWeek_(ref);
  var cur=getActiveWeekStart_();
  if(toMidnight_(monday)<=toMidnight_(cur)){Logger.log('Weekly rollover: tuần '+formatDate_(monday)+' không mới hơn tuần hiện tại '+formatDate_(cur)+' → bỏ qua');return;}
  setActiveWeekStart_(monday);
  clearCache_();
  try{ensureActiveWeekRows_();}catch(e){Logger.log('ensureActiveWeekRows_: '+e.message);}
  try{updateFormOptions();}catch(e2){Logger.log('updateFormOptions: '+e2.message);}
  Logger.log('Weekly rollover → '+formatDate_(monday));
}

function ensureActiveWeekRows_(){
  var range=getActiveWeekRange_(),needed=[];
  for(var i=0;i<7;i++)needed.push(makeNoon_(range.monday.getFullYear(),range.monday.getMonth(),range.monday.getDate()+i));
  var addedAny=false;
  var csSheet=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT);
  if(csSheet)addedAny=ensureRowsInSheet_(csSheet,needed)||addedAny;
  var tutorSS=getTutorSpreadsheet_(),tutors=getActiveTutors_();
  for(var t=0;t<tutors.length;t++){var sheet=tutorSS.getSheetByName(CONFIG.TUTOR_SHEET_PREFIX+tutors[t].name);if(sheet)addedAny=ensureRowsInSheet_(sheet,needed)||addedAny;}
  if(addedAny){clearCache_();syncCheckSlotValues();}
  return addedAny;
}

function ensureRowsInSheet_(sheet,needed){
  var data=sheet.getDataRange().getValues(),numCols=data[0].length,have={};
  for(var r=1;r<data.length;r++)if(data[r][0] instanceof Date)have[dateKey_(data[r][0])]=true;
  var toAdd=[];
  for(var n=0;n<needed.length;n++){if(!have[dateKey_(needed[n])]){var row=[needed[n],ARCH_WD[needed[n].getDay()]];for(var c=2;c<numCols;c++)row.push('');toAdd.push(row);}}
  if(toAdd.length===0)return false;
  var start=sheet.getLastRow()+1;
  sheet.getRange(start,1,toAdd.length,numCols).setValues(toAdd);
  sheet.getRange(start,1,toAdd.length,1).setNumberFormat('dd/MM/yyyy');
  if(sheet.getLastRow()>2)sheet.getRange(2,1,sheet.getLastRow()-1,numCols).sort({column:1,ascending:true});
  return true;
}

function monthlyRollover(){
  var today=getNow_(),curYear=today.getFullYear(),curMonth=today.getMonth()+1;
  var prevMonth=curMonth-1,prevYear=curYear;if(prevMonth===0){prevMonth=12;prevYear=curYear-1;}
  Logger.log('Monthly: archive '+prevMonth+'/'+prevYear+', build '+curMonth+'/'+curYear);
  try{archiveMonth(prevYear,prevMonth);}catch(e){Logger.log('archiveMonth: '+e.message);notifyAdminError_('Lỗi archive tháng',e,null);}
  try{rebuildCurrentMonth(curYear,curMonth);}catch(e2){Logger.log('rebuildCurrentMonth: '+e2.message);notifyAdminError_('Lỗi rebuild tháng',e2,null);}
  try{updateFormOptions();}catch(e3){}
}
function setupMonthCalendar(year,month){rebuildCurrentMonth(year,month);}

function sundayReminderTutors(){
  var today=getNow_(),nextMonday=getMondayOfWeek_(new Date(today.getTime()+24*3600000));
  if(toMidnight_(nextMonday)<=toMidnight_(today))nextMonday=makeNoon_(nextMonday.getFullYear(),nextMonday.getMonth(),nextMonday.getDate()+7);
  var nextSunday=makeNoon_(nextMonday.getFullYear(),nextMonday.getMonth(),nextMonday.getDate()+6);
  var monStr=formatDate_(nextMonday),sunStr=formatDate_(nextSunday);
  var sheetUrl='';try{sheetUrl=getTutorSpreadsheet_().getUrl();}catch(e){sheetUrl=SpreadsheetApp.getActive().getUrl();}
  var tutors=getActiveTutors_(),sent=0;
  for(var i=0;i<tutors.length;i++){var t=tutors[i];if(!t.email)continue;
    var body=emailBanner_('Đến hạn cập nhật lịch dạy','Tuần '+monStr+' đến '+sunStr,'#E8F0FE','#174EA6')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+t.name+'</b>,</p><p style="font-size:14px;color:#4a5568;line-height:1.7">Form đăng ký sẽ mở cho tuần tới. Lịch rảnh bạn điền quyết định khung giờ học viên thấy được.</p><div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Tuần cần điền',monStr+' đến '+sunStr)+infoRow_('Tab của bạn',CONFIG.TUTOR_SHEET_PREFIX+t.name)+infoRow_('Hạn chốt','<span style="color:#C62828">12:00 trưa Chủ nhật</span>')+'</table></div>'+ctaButton_('Mở bảng lịch',sheetUrl,'#2F5496');
    MailApp.sendEmail({to:t.email,subject:'Cập nhật lịch dạy tuần '+monStr+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#1A73E8','Hạn điền lịch: trưa Chủ nhật.'),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});sent++;}
  Logger.log('Đã nhắc '+sent+'/'+tutors.length+' tutor');
}
