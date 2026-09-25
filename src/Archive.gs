/**
 * Archive.gs — Lưu Trữ Tháng Cũ (v6.0 FINAL)
 *
 * v6.0 FIX QUAN TRỌNG: rebuildCalendarBody_ trước đây XOÁ TRẮNG toàn bộ tab rồi ghi lại
 * ngày trống → tutor đã đánh "x" trước cho tuần đầu tháng mới bị mất sạch vào ngày 1.
 * Giờ: giữ nguyên mọi dòng có ngày >= đầu tháng mới (kèm dữ liệu), chỉ bỏ dòng cũ hơn,
 * bổ sung ngày còn thiếu, sắp xếp lại.
 */
var ARCH_WD={0:'Chủ nhật',1:'Thứ 2',2:'Thứ 3',3:'Thứ 4',4:'Thứ 5',5:'Thứ 6',6:'Thứ 7'};

function snapshotSheetAsValues_(ss,sourceName,archiveName){
  var src=ss.getSheetByName(sourceName);if(!src)return null;
  var existing=ss.getSheetByName(archiveName);if(existing)return existing;
  var values=src.getDataRange().getValues(),formats=src.getDataRange().getNumberFormats();
  var dest=ss.insertSheet(archiveName);
  if(values.length>0&&values[0].length>0){var range=dest.getRange(1,1,values.length,values[0].length);range.setValues(values);range.setNumberFormats(formats);}
  try{dest.setTabColor('999999');dest.hideSheet();}catch(e){}
  Logger.log('Chụp '+sourceName+' → '+archiveName);return dest;
}

function archiveMonth(year,month){
  var tag=year+'_'+('0'+month).slice(-2);Logger.log('Lưu trữ tháng '+month+'/'+year);
  var mainSS=SpreadsheetApp.getActive(),tutorSS=getTutorSpreadsheet_();
  snapshotSheetAsValues_(mainSS,CONFIG.SHEETS.CHECK_SLOT,CONFIG.ARCHIVE_PREFIX+CONFIG.SHEETS.CHECK_SLOT+'_'+tag);
  var tutors=getActiveTutors_();
  for(var i=0;i<tutors.length;i++){
    var tn=CONFIG.TUTOR_SHEET_PREFIX+tutors[i].name,an=CONFIG.ARCHIVE_PREFIX+tn+'_'+tag;
    if(an.length>100)an=an.substring(0,100);
    snapshotSheetAsValues_(tutorSS,tn,an);
  }
}

function rebuildCurrentMonth(year,month){
  var jsMonth=month-1,numDays=new Date(year,jsMonth+1,0).getDate(),monthStart=new Date(year,jsMonth,1);
  var neededDates=[];for(var d=1;d<=numDays;d++)neededDates.push(makeNoon_(year,jsMonth,d));
  var range=getActiveWeekRange_();
  for(var w=0;w<7;w++){var wd=makeNoon_(range.monday.getFullYear(),range.monday.getMonth(),range.monday.getDate()+w);if(!neededDates.some(function(x){return sameDate_(x,wd);}))neededDates.push(wd);}
  /* Ngày sớm nhất phải giữ = min(đầu tháng, thứ 2 tuần active) — tuần active có thể vắt sang tháng trước */
  var keepFrom=toMidnight_(range.monday)<monthStart?toMidnight_(range.monday):monthStart;

  var mainSS=SpreadsheetApp.getActive(),tutorSS=getTutorSpreadsheet_(),numCols=2+CONFIG.TIME_SLOTS.length,tutors=getActiveTutors_();
  for(var t=0;t<tutors.length;t++){var sheet=tutorSS.getSheetByName(CONFIG.TUTOR_SHEET_PREFIX+tutors[t].name);if(sheet)rebuildCalendarBody_(sheet,neededDates,numCols,keepFrom);}
  var cs=mainSS.getSheetByName(CONFIG.SHEETS.CHECK_SLOT);if(cs)rebuildCalendarBody_(cs,neededDates,numCols,keepFrom);
  clearCache_();
  syncCheckSlotValues();
}

/**
 * Giữ dòng có ngày >= keepFrom (kèm nội dung), bỏ dòng cũ, thêm ngày thiếu, sort tăng dần.
 */
function rebuildCalendarBody_(sheet,dates,numCols,keepFrom){
  var data=sheet.getDataRange().getValues(),kept={},rows=[];
  for(var r=1;r<data.length;r++){
    var d=data[r][0];if(!(d instanceof Date))continue;
    if(keepFrom&&toMidnight_(d)<keepFrom)continue;
    var row=data[r].slice(0,numCols);while(row.length<numCols)row.push('');
    row[0]=makeNoon_(d.getFullYear(),d.getMonth(),d.getDate());row[1]=ARCH_WD[d.getDay()];
    kept[dateKey_(d)]=true;rows.push(row);
  }
  for(var i=0;i<dates.length;i++){
    if(kept[dateKey_(dates[i])])continue;
    var nr=[dates[i],ARCH_WD[dates[i].getDay()]];for(var c=2;c<numCols;c++)nr.push('');rows.push(nr);
  }
  rows.sort(function(a,b){return a[0]-b[0];});
  var last=sheet.getLastRow();if(last>1)sheet.getRange(2,1,last-1,Math.max(numCols,sheet.getLastColumn())).clearContent();
  if(rows.length>0){sheet.getRange(2,1,rows.length,numCols).setValues(rows);sheet.getRange(2,1,rows.length,1).setNumberFormat('dd/MM/yyyy');}
  return rows.length;
}

function listArchivedMonths(){
  var months={},re=new RegExp('^'+CONFIG.ARCHIVE_PREFIX+'.*_(\\d{4}_\\d{2})$');
  var mainSheets=SpreadsheetApp.getActive().getSheets();
  for(var i=0;i<mainSheets.length;i++){var m=mainSheets[i].getName().match(re);if(m)months[m[1]]=true;}
  try{var ts=getTutorSpreadsheet_().getSheets();for(var j=0;j<ts.length;j++){var m2=ts[j].getName().match(re);if(m2)months[m2[1]]=true;}}catch(e){}
  var list=Object.keys(months).sort();Logger.log('Tháng đã lưu trữ: '+(list.length?list.join(', '):'(chưa có)'));return list;
}
