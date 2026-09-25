/**
 * Registration.gs — Luồng Đăng Ký Học Viên (v6.1.0)
 * Đọc STUDENT_REGISTRATION + PACKAGES từ Registration spreadsheet
 * Ghi STUDENT_INFO vào Main spreadsheet
 *
 * v6.1.0:
 *   syncRegistrations chạy trong lock. Trước đây bấm menu "Kích hoạt" đúng lúc trigger form đăng ký chạy
 *   → 2 lần chạy cùng thấy dòng chưa Synced → HV được cộng buổi 2 lần.
 *   Dòng HV mới luôn có công thức F/G (trước: dòng thứ 7 trở đi không có → HV không đặt được buổi nào).
 *   Tên gói không có trong PACKAGES → KHÔNG kích hoạt với 0 buổi nữa; ghi lỗi vào cột Synced, báo admin 1 lần.
 *   Ghi lại Số buổi (G) + Học phí (H) để đối soát. PACKAGES đọc 1 lần / lần chạy.
 */
function onRegistrationSubmit(e) {
  try { syncRegistrations(); }
  catch (err) { Logger.log('LỖI onRegistrationSubmit: '+err.message); notifyAdminError_('Lỗi xử lý đăng ký học viên',err,e); }
}

function syncRegistrations() {
  var res=withScriptLock_('syncRegistrations',syncRegistrationsLocked_,function(){toast_('Hệ thống đang bận, thử lại sau 1 phút');return null;});
  if(res)toast_('Kích hoạt: '+res.activated+' học viên mới, '+res.updated+' nạp thêm'+(res.problems.length?' · '+res.problems.length+' dòng lỗi (xem cột Synced)':''));
  return res;
}

var REG_ERROR_PREFIX_='LỖI: ';
function syncRegistrationsLocked_() {
  clearCache_();
  var mainSS=SpreadsheetApp.getActive(), regSS=getRegistrationSpreadsheet_();
  var reg=regSS.getSheetByName(CONFIG.SHEETS.REGISTRATION), info=mainSS.getSheetByName(CONFIG.SHEETS.STUDENT_INFO);
  if(!reg||!info) throw new Error('Thiếu sheet '+(!reg?CONFIG.SHEETS.REGISTRATION+' (Registration)':CONFIG.SHEETS.STUDENT_INFO+' (Main)'));
  var R=CONFIG.REG_COLS, S=CONFIG.STUDENT_COLS, regData=reg.getDataRange().getValues(), infoIndex=buildStudentEmailIndex_(), nextIdNum=getNextStudentIdNumber_(info,reg);
  var activated=0, updated=0, problems=[], now=getNow_();
  for(var r=1;r<regData.length;r++){
    var email=String(regData[r][R.EMAIL-1]||'').trim().toLowerCase();
    if(!email)continue;
    var payment=String(regData[r][R.PAYMENT-1]||'').trim(), synced=String(regData[r][R.SYNCED-1]||'').trim();
    if(payment!==CONFIG.PAYMENT_STATUS.PAID||synced==='Yes')continue;
    var sheetRow=r+1, name=String(regData[r][R.NAME-1]||'').trim(), pkgName=String(regData[r][R.PACKAGE-1]||'').trim(), pkg=getPackage_(pkgName);
    var sessions=Number(regData[r][R.SESSIONS-1])||pkg.sessions;
    if(sessions<=0){
      // Không kích hoạt với 0 buổi. Chỉ báo admin khi lỗi mới (cột Synced chưa ghi đúng lỗi này) → không spam mỗi lần chạy
      var msg=REG_ERROR_PREFIX_+'gói "'+pkgName+'" không có trong PACKAGES (hoặc 0 buổi). Sửa tên gói / cột Số buổi rồi chạy lại Kích hoạt';
      if(synced!==msg){reg.getRange(sheetRow,R.SYNCED).setValue(msg);problems.push('Dòng '+sheetRow+' · '+email+' · '+msg);}
      continue;
    }
    var studentId;
    if(email in infoIndex){
      studentId=infoIndex[email].id; var infoRow=infoIndex[email].row;
      var curTotal=Number(info.getRange(infoRow,S.TOTAL).getValue())||0;
      info.getRange(infoRow,S.TOTAL).setValue(curTotal+sessions);
      info.getRange(infoRow,S.STATUS).setValue(CONFIG.STUDENT_STATUS.ACTIVE);
      ensureStudentFormulas_(info,infoRow);
      resetBalanceAlertFlagsByEmail_(email); updated++;
    } else {
      studentId=CONFIG.ID_PREFIX.STUDENT+('00'+nextIdNum).slice(-3); nextIdNum++;
      var targetRow=getFirstEmptyStudentRow_(info);
      info.getRange(targetRow,S.STUDENT_ID,1,S.PACKAGE).setValues([[studentId,email,name,pkgName]]);
      info.getRange(targetRow,S.TOTAL).setValue(sessions);
      ensureStudentFormulas_(info,targetRow);
      info.getRange(targetRow,S.ACTIVATED_AT).setValue(now).setNumberFormat('dd/MM/yyyy');
      info.getRange(targetRow,S.STATUS).setValue(CONFIG.STUDENT_STATUS.ACTIVE);
      info.getRange(targetRow,S.NOTE).setValue('Kích hoạt '+formatDate_(now));
      infoIndex[email]={id:studentId,row:targetRow}; activated++;
    }
    reg.getRange(sheetRow,R.STUDENT_ID).setValue(studentId);
    if(!regData[r][R.SESSIONS-1])reg.getRange(sheetRow,R.SESSIONS).setValue(sessions);
    if(!regData[r][R.FEE-1]&&pkg.price)reg.getRange(sheetRow,R.FEE).setValue(pkg.price).setNumberFormat('#,##0');
    reg.getRange(sheetRow,R.SYNCED).setValue('Yes');
    if(CONFIG.EMAIL.SEND_WELCOME_ON_ACTIVATE)sendWelcomeEmail_(email,name,studentId,pkgName,sessions);
  }
  SpreadsheetApp.flush();
  if(problems.length)notifyAdminError_('Có '+problems.length+' đăng ký đã thanh toán nhưng CHƯA kích hoạt được',new Error(problems.join('\n')),null);
  flushMailErrors_('kích hoạt học viên');
  Logger.log('syncRegistrations: '+activated+' mới, '+updated+' nạp thêm, '+problems.length+' lỗi');
  return{activated:activated,updated:updated,problems:problems};
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

/** Bảng gói (PACKAGES) đọc 1 lần mỗi lần chạy. Không phân biệt hoa thường, bỏ khoảng trắng thừa. */
function getPackages_(){
  if(CACHE_.packages)return CACHE_.packages;
  var map={},p=getRegistrationSpreadsheet_().getSheetByName(CONFIG.SHEETS.PACKAGES);
  if(p){var P=CONFIG.PACKAGE_COLS,d=p.getDataRange().getValues();
    for(var r=1;r<d.length;r++){var n=String(d[r][P.NAME-1]||'').trim();if(n)map[n.toLowerCase().replace(/\s+/g,' ')]={name:n,sessions:Number(d[r][P.SESSIONS-1])||0,price:Number(d[r][P.PRICE-1])||0};}}
  CACHE_.packages=map;return map;
}
function getPackage_(packageName){return getPackages_()[String(packageName||'').trim().toLowerCase().replace(/\s+/g,' ')]||{name:'',sessions:0,price:0};}
function getPackageSessions_(packageName){return getPackage_(packageName).sessions;}
