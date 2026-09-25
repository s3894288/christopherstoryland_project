/**
 * Registration.gs — Luồng Đăng Ký Học Viên (v5.1)
 * Đọc STUDENT_REGISTRATION + PACKAGES từ Registration spreadsheet
 * Ghi STUDENT_INFO vào Main spreadsheet
 */
function onRegistrationSubmit(e) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(CONFIG.LOCK_TIMEOUT_MS)) return; syncRegistrations(); }
  catch (err) { Logger.log('LỖI onRegistrationSubmit: '+err.message); notifyAdminError_('Lỗi xử lý đăng ký học viên',err,e); }
  finally { lock.releaseLock(); }
}

function syncRegistrations() {
  var mainSS=SpreadsheetApp.getActive(), regSS=getRegistrationSpreadsheet_();
  var reg=regSS.getSheetByName(CONFIG.SHEETS.REGISTRATION), info=mainSS.getSheetByName(CONFIG.SHEETS.STUDENT_INFO);
  if(!reg||!info){Logger.log('Thiếu sheet (STUDENT_REGISTRATION hoặc STUDENT_INFO)');return;}
  var R=CONFIG.REG_COLS, regData=reg.getDataRange().getValues(), infoIndex=buildStudentEmailIndex_(), nextIdNum=getNextStudentIdNumber_(info,reg);
  var activated=0,updated=0;
  for(var r=1;r<regData.length;r++){
    var email=String(regData[r][R.EMAIL-1]||'').trim().toLowerCase();
    if(!email)continue;
    var payment=String(regData[r][R.PAYMENT-1]||'').trim(), synced=String(regData[r][R.SYNCED-1]||'').trim();
    var name=String(regData[r][R.NAME-1]||'').trim(), pkg=String(regData[r][R.PACKAGE-1]||'').trim();
    var sessions=Number(regData[r][R.SESSIONS-1])||getPackageSessions_(pkg);
    if(payment!==CONFIG.PAYMENT_STATUS.PAID||synced==='Yes')continue;
    var sheetRow=r+1, studentId;
    if(email in infoIndex){
      studentId=infoIndex[email].id; var infoRow=infoIndex[email].row;
      var curTotal=Number(info.getRange(infoRow,CONFIG.STUDENT_COLS.TOTAL).getValue())||0;
      info.getRange(infoRow,CONFIG.STUDENT_COLS.TOTAL).setValue(curTotal+sessions);
      info.getRange(infoRow,CONFIG.STUDENT_COLS.STATUS).setValue(CONFIG.STUDENT_STATUS.ACTIVE);
      resetBalanceAlertFlagsByEmail_(email); updated++;
    } else {
      studentId=CONFIG.ID_PREFIX.STUDENT+('00'+nextIdNum).slice(-3); nextIdNum++;
      var S=CONFIG.STUDENT_COLS, targetRow=getFirstEmptyStudentRow_(info);
      info.getRange(targetRow,S.STUDENT_ID).setValue(studentId);
      info.getRange(targetRow,S.EMAIL).setValue(email);
      info.getRange(targetRow,S.NAME).setValue(name);
      info.getRange(targetRow,S.PACKAGE).setValue(pkg);
      info.getRange(targetRow,S.TOTAL).setValue(sessions);
      info.getRange(targetRow,S.ACTIVATED_AT).setValue(new Date()).setNumberFormat('dd/MM/yyyy');
      info.getRange(targetRow,S.STATUS).setValue(CONFIG.STUDENT_STATUS.ACTIVE);
      info.getRange(targetRow,S.NOTE).setValue('Kích hoạt '+formatDate_(new Date()));
      infoIndex[email]={id:studentId,row:targetRow}; activated++;
    }
    reg.getRange(sheetRow,R.STUDENT_ID).setValue(studentId);
    reg.getRange(sheetRow,R.SYNCED).setValue('Yes');
    if(CONFIG.EMAIL.SEND_WELCOME_ON_ACTIVATE){try{sendWelcomeEmail_(email,name,studentId,pkg,sessions);}catch(we){Logger.log('Lỗi email: '+we.message);}}
  }
  SpreadsheetApp.flush();
  Logger.log('syncRegistrations: '+activated+' mới, '+updated+' nạp thêm');
  return{activated:activated,updated:updated};
}

function buildStudentEmailIndex_(){
  var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),idx={};
  for(var r=1;r<data.length;r++){var e=String(data[r][S.EMAIL-1]||'').trim().toLowerCase();if(e)idx[e]={id:String(data[r][S.STUDENT_ID-1]).trim(),row:r+1};}
  return idx;
}
function getNextStudentIdNumber_(info,reg){
  var mx=0,S=CONFIG.STUDENT_COLS,R=CONFIG.REG_COLS;
  var d1=info.getDataRange().getValues();for(var r=1;r<d1.length;r++){var m=String(d1[r][S.STUDENT_ID-1]||'').match(/^S(\d+)$/);if(m)mx=Math.max(mx,Number(m[1]));}
  var d2=reg.getDataRange().getValues();for(var r2=1;r2<d2.length;r2++){if(String(d2[r2][R.SYNCED-1]||'').trim()==='Yes'){var m2=String(d2[r2][R.STUDENT_ID-1]||'').match(/^S(\d+)$/);if(m2)mx=Math.max(mx,Number(m2[1]));}}
  return mx+1;
}
function getFirstEmptyStudentRow_(info){var S=CONFIG.STUDENT_COLS,d=info.getDataRange().getValues();for(var r=1;r<d.length;r++){if(!String(d[r][S.EMAIL-1]||'').trim())return r+1;}return d.length+1;}
function getPackageSessions_(packageName){
  var regSS=getRegistrationSpreadsheet_(),p=regSS.getSheetByName(CONFIG.SHEETS.PACKAGES);
  if(!p)return 0;var P=CONFIG.PACKAGE_COLS,d=p.getDataRange().getValues(),t=String(packageName).trim();
  for(var r=1;r<d.length;r++){if(String(d[r][P.NAME-1]).trim()===t)return Number(d[r][P.SESSIONS-1])||0;}return 0;
}
