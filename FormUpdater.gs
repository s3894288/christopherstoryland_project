/**
 * FormUpdater.gs — Đồng bộ CHECK_SLOT + Dropdown Form + Dashboard (v6.0 FINAL)
 *
 * v6.0 FIX QUAN TRỌNG: CHECK_SLOT từ v5.1 là GIÁ TRỊ (không phải công thức) vì tutor ở
 * spreadsheet khác. Nhưng processBooking_ và onEditTrigger chỉ gọi updateFormOptions(),
 * KHÔNG gọi sync → CHECK_SLOT cũ tới 10 phút sau mỗi booking/huỷ. Harness cũ che bug này
 * vì flush() của mock tự tính lại CHECK_SLOT (Google Sheets thật không làm vậy với giá trị).
 *
 * Giờ updateFormOptions() = sync CHECK_SLOT → cập nhật DASHBOARD → nạp dropdown.
 * Mọi nơi gọi updateFormOptions() (booking, huỷ, rollover, trigger 10 phút) đều được sync.
 */
function updateFormOptions(){
  try{syncCheckSlotValues();}catch(e0){Logger.log('syncCheckSlotValues: '+e0.message);}
  try{updateDashboardStats_();}catch(e1){}
  var id=(typeof getBookingFormId_==='function')?getBookingFormId_():CONFIG.BOOKING_FORM_ID;
  if(!id){Logger.log('Chưa có BOOKING_FORM_ID — menu Form → Kết nối lại tất cả Form');return;}
  try{updateFormOptionsForForm_(FormApp.openById(id));}
  catch(e){Logger.log('updateFormOptions: không mở được form '+id+' — '+e.message);}
}

function updateFormOptionsForForm_(form){
  var range=getActiveWeekRange_(),monday=toMidnight_(range.monday),sunday=toMidnight_(range.sunday);
  var tutorCount=getActiveTutors_().length;
  form.setDescription('Tuần đăng ký: '+formatDate_(monday)+' đến '+formatDate_(sunday)+'\nKhung giờ 17:00 – 23:55 · '+tutorCount+' giảng viên\n\nĐặt lịch bằng ĐÚNG email bạn đã đăng ký học.\nChọn "'+CONFIG.NO_CHOICE_LABEL+'" cho ngày không học.\nKhung giờ đã qua hoặc dưới '+CONFIG.POLICY.MIN_LEAD_MINUTES+' phút trước giờ học sẽ không hiển thị.');
  var sheet=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.CHECK_SLOT),data=sheet.getDataRange().getValues(),headers=data[0];
  var sets={};for(var d=0;d<7;d++)sets[d]={};
  for(var r=1;r<data.length;r++){var cell=data[r][0];if(!(cell instanceof Date))continue;var rowDate=toMidnight_(cell);if(rowDate<monday||rowDate>sunday)continue;var dow=rowDate.getDay(),dayIndex=(dow===0)?6:dow-1;
    for(var c=2;c<headers.length;c++){if(Number(data[r][c])<=0)continue;var slot=String(headers[c]).trim();if(!slot)continue;
      if(!isSlotBookable_(rowDate,slot))continue;
      sets[dayIndex][slot]=true;}}
  var items=form.getItems(),updated=0;
  for(var i=0;i<items.length;i++){var item=items[i],title=String(item.getTitle()).trim(),offset=CONFIG.DAY_OFFSETS[title];if(offset===undefined)continue;
    var choices=[CONFIG.NO_CHOICE_LABEL];for(var s=0;s<CONFIG.TIME_SLOTS.length;s++)if(sets[offset][CONFIG.TIME_SLOTS[s]])choices.push(CONFIG.TIME_SLOTS[s]);
    try{item.asListItem().setChoiceValues(choices);updated++;}catch(err){}}
  Logger.log('Cập nhật '+updated+'/7 dropdown');
}

/**
 * CHECK_SLOT[date][slot] = (tutor có "x") − (booking Active/Completed/NoShow). Ghi GIÁ TRỊ.
 */
function syncCheckSlotValues(){
  var mainSS=SpreadsheetApp.getActive(),csSheet=mainSS.getSheetByName(CONFIG.SHEETS.CHECK_SLOT);if(!csSheet)return 0;
  var csData=csSheet.getDataRange().getValues(),headers=csData[0],numCols=headers.length;

  var tutors=getActiveTutors_(),tutorData={};
  for(var t=0;t<tutors.length;t++){var map=loadTutorAvailability_(tutors[t].name);for(var key in map)tutorData[key]=(tutorData[key]||0)+1;}

  var bkSheet=mainSS.getSheetByName(CONFIG.SHEETS.BOOKINGS),bookingCount={};
  if(bkSheet){var bkData=bkSheet.getDataRange().getValues(),C=CONFIG.BOOKING_COLS;
    for(var b=1;b<bkData.length;b++){if(CONFIG.CONSUMING_STATUSES.indexOf(bkData[b][C.STATUS-1])===-1)continue;var bd=bkData[b][C.DATE-1],bs=String(bkData[b][C.TIME_SLOT-1]||'').trim();if(!(bd instanceof Date)||!bs)continue;var k=dateKey_(bd)+'|'+bs;bookingCount[k]=(bookingCount[k]||0)+1;}}

  var values=[],firstRow=-1,count=0;
  for(var r=1;r<csData.length;r++){if(!(csData[r][0] instanceof Date))continue;if(firstRow===-1)firstRow=r+1;var dk=dateKey_(csData[r][0]),row=[];
    for(var c=2;c<numCols;c++){var k2=dk+'|'+String(headers[c]).trim();row.push(Math.max(0,(tutorData[k2]||0)-(bookingCount[k2]||0)));}
    values.push(row);count++;}
  if(count>0){csSheet.getRange(firstRow,3,count,numCols-2).setValues(values);SpreadsheetApp.flush();}
  try{PropertiesService.getScriptProperties().setProperty('LAST_SLOT_SYNC',getNow_().toISOString());}catch(e){}
  Logger.log('syncCheckSlotValues: '+count+' dòng × '+(numCols-2)+' cột');return count;
}

/** Ghi vài chỉ số vận hành lên DASHBOARD để admin nhìn là biết hệ thống sống hay chết. */
function updateDashboardStats_(){
  var dash=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.DASHBOARD);if(!dash)return;
  var D=CONFIG.DASHBOARD_CELLS,range=getActiveWeekRange_(),lo=toMidnight_(range.monday),hi=toMidnight_(range.sunday);
  var bk=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.BOOKINGS),n=0;
  if(bk){var data=bk.getDataRange().getValues(),C=CONFIG.BOOKING_COLS;for(var r=1;r<data.length;r++){var d=data[r][C.DATE-1];if(!(d instanceof Date))continue;var dm=toMidnight_(d);if(dm>=lo&&dm<=hi&&CONFIG.CONSUMING_STATUSES.indexOf(data[r][C.STATUS-1])!==-1)n++;}}
  dash.getRange(D.ACTIVE_WEEK).setValue(formatDate_(range.monday)+' → '+formatDate_(range.sunday));
  dash.getRange(D.BOOKINGS_WEEK).setValue(n);
  dash.getRange(D.TUTOR_COUNT).setValue(getActiveTutors_().length);
  dash.getRange(D.LAST_SYNC).setValue(formatDateTime_(getNow_()));
  var sim=PropertiesService.getScriptProperties().getProperty('SIM_NOW');
  dash.getRange(D.SIM_NOW).setValue(sim?'⚠ ĐANG GIẢ LẬP THỜI GIAN: '+formatDateTime_(new Date(sim))+' — chạy clearSimulatedNow() trước khi go live':'');
}

/* Alias tương thích code cũ */
function regenerateCheckSlotFormulas(){return syncCheckSlotValues();}
