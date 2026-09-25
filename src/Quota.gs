/**
 * Quota.gs — Quản Lý Số Buổi (v6.1.0 — khoá theo EMAIL)
 * SessionsUsed đếm Active + Completed + NoShow
 *
 * v6.1.0:
 *   BUG NGHIÊM TRỌNG 1: template chỉ có công thức F/G ở 6 dòng mẫu. Học viên kích hoạt từ dòng 8 trở đi
 *   không có công thức → SessionsRemaining trống = 0 → mọi lần đặt đều Failed "Hết buổi học".
 *   BUG NGHIÊM TRỌNG 2: COUNTIFS chỉ quét BOOKINGS!D2:D2000. Mọi lần submit đều ghi dòng (kể cả Failed)
 *   → qua 2000 dòng, booking mới không bị trừ buổi nữa (học miễn phí).
 *   Sửa: studentUsedFormula_ dùng vùng mở ($D$2:$D). repairStudentFormulas_ bổ sung công thức thiếu và
 *   nâng cấp công thức cũ; chạy trong heartbeat 10 phút, sau kích hoạt HV, và từ menu.
 *   HV trạng thái Paused không đặt được. Hoàn buổi / nạp thêm → trạng thái "Hết buổi" tự về Active.
 */
function getStudentQuotaByEmail_(email){
  var r={found:false,row:-1,id:'',name:'',email:String(email||'').trim(),package:'',total:0,used:0,remaining:0,status:''};
  if(!email)return r;
  var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO);if(!info)return r;
  var S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),target=String(email).trim().toLowerCase();
  for(var i=1;i<data.length;i++){
    var re=String(data[i][S.EMAIL-1]||'').trim().toLowerCase();
    if(re&&re===target){r.found=true;r.row=i+1;r.id=String(data[i][S.STUDENT_ID-1]||'').trim();r.name=String(data[i][S.NAME-1]||'').trim();r.email=String(data[i][S.EMAIL-1]||'').trim();r.package=String(data[i][S.PACKAGE-1]||'').trim();r.total=Number(data[i][S.TOTAL-1])||0;r.used=Number(data[i][S.USED-1])||0;r.remaining=Math.max(0,Number(data[i][S.REMAINING-1])||0);r.status=String(data[i][S.STATUS-1]||'').trim();break;}
  }
  Logger.log('Quota '+target+': found='+r.found+' remaining='+r.remaining+'/'+r.total);return r;
}
function checkQuotaEligibility_(quota,budgetLeft){
  if(!CONFIG.QUOTA.ENFORCE)return{allowed:true,reason:''};
  if(!quota.found)return CONFIG.QUOTA.ALLOW_UNKNOWN_STUDENT?{allowed:true,reason:''}:{allowed:false,reason:CONFIG.FAIL_REASONS.UNKNOWN_STUDENT};
  if(quota.status===CONFIG.STUDENT_STATUS.PAUSED)return{allowed:false,reason:CONFIG.FAIL_REASONS.PAUSED};
  if(quota.remaining<=0)return{allowed:false,reason:CONFIG.FAIL_REASONS.NO_CREDITS};
  if(budgetLeft<=0)return{allowed:false,reason:CONFIG.FAIL_REASONS.OVER_BUDGET};
  return{allowed:true,reason:''};
}
function handleBalanceAlerts_(quota,consumed,bookings){
  if(!quota.found||consumed<=0)return;
  var after=Math.max(0,quota.remaining-consumed),props=PropertiesService.getScriptProperties();
  var keyBase='BAL_'+quota.email.toLowerCase()+'_T'+quota.total+'_';
  if(after===0&&CONFIG.QUOTA.NOTIFY_EXHAUSTED){var kEx=keyBase+'EXHAUSTED';if(!props.getProperty(kEx)&&sendQuotaExhaustedEmail_(quota,consumed,bookings))props.setProperty(kEx,getNow_().toISOString());}
  if(after===0){markStudentStatus_(quota.email,CONFIG.STUDENT_STATUS.EXHAUSTED);return;}
  if(quota.status===CONFIG.STUDENT_STATUS.EXHAUSTED)markStudentStatus_(quota.email,CONFIG.STUDENT_STATUS.ACTIVE);
  if(after===CONFIG.QUOTA.LOW_BALANCE_THRESHOLD&&CONFIG.QUOTA.NOTIFY_LOW_BALANCE){var kLow=keyBase+'LOW';if(!props.getProperty(kLow)&&sendLowBalanceEmail_(quota,after,bookings))props.setProperty(kLow,getNow_().toISOString());}
}
/** Sau khi hoàn buổi (huỷ): HV đang "Hết buổi" mà còn buổi → Active, xoá cờ EXHAUSTED để lần hết sau vẫn được báo. */
function restoreStudentAfterRefund_(email){
  var q=getStudentQuotaByEmail_(email);
  if(!q.found||q.remaining<=0||q.status!==CONFIG.STUDENT_STATUS.EXHAUSTED)return false;
  markStudentStatus_(q.email,CONFIG.STUDENT_STATUS.ACTIVE);
  PropertiesService.getScriptProperties().deleteProperty('BAL_'+q.email.toLowerCase()+'_T'+q.total+'_EXHAUSTED');
  return true;
}
function markStudentStatus_(email,status){var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),t=String(email).trim().toLowerCase();for(var r=1;r<data.length;r++){if(String(data[r][S.EMAIL-1]||'').trim().toLowerCase()===t){info.getRange(r+1,S.STATUS).setValue(status);return;}}}
function resetBalanceAlertFlagsByEmail_(email){var props=PropertiesService.getScriptProperties(),all=props.getProperties(),prefix='BAL_'+String(email).trim().toLowerCase()+'_',n=0;for(var k in all)if(k.indexOf(prefix)===0){props.deleteProperty(k);n++;}Logger.log('Xoá '+n+' cờ cho '+email);}
function scanAndNotifyLowBalance(){
  var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),props=PropertiesService.getScriptProperties(),low=0,ex=0;
  for(var r=1;r<data.length;r++){var email=String(data[r][S.EMAIL-1]||'').trim();if(!email)continue;
    var quota={found:true,row:r+1,id:String(data[r][S.STUDENT_ID-1]||'').trim(),name:String(data[r][S.NAME-1]||'').trim(),email:email,package:String(data[r][S.PACKAGE-1]||'').trim(),total:Number(data[r][S.TOTAL-1])||0,used:Number(data[r][S.USED-1])||0,remaining:Math.max(0,Number(data[r][S.REMAINING-1])||0),status:String(data[r][S.STATUS-1]||'').trim()};
    var keyBase='BAL_'+email.toLowerCase()+'_T'+quota.total+'_';
    if(quota.remaining===0&&quota.total>0&&CONFIG.QUOTA.NOTIFY_EXHAUSTED){if(!props.getProperty(keyBase+'EXHAUSTED')&&sendQuotaExhaustedEmail_(quota,0,[])){props.setProperty(keyBase+'EXHAUSTED',getNow_().toISOString());ex++;}}
    else if(quota.remaining===CONFIG.QUOTA.LOW_BALANCE_THRESHOLD&&CONFIG.QUOTA.NOTIFY_LOW_BALANCE){if(!props.getProperty(keyBase+'LOW')&&sendLowBalanceEmail_(quota,quota.remaining,[])){props.setProperty(keyBase+'LOW',getNow_().toISOString());low++;}}
  }
  flushMailErrors_('quét cảnh báo số buổi');
  toast_('Cảnh báo số buổi: '+low+' sắp hết, '+ex+' hết buổi');
}


// ══════════════════════════════════════════════════════════
//  CÔNG THỨC STUDENT_INFO F (SessionsUsed) · G (SessionsRemaining)
// ══════════════════════════════════════════════════════════

/** Vùng mở $D$2:$D (không giới hạn 2000 dòng). COUNTIFS không phân biệt hoa thường → email viết hoa vẫn khớp. */
function studentUsedFormula_(row){
  var parts=CONFIG.CONSUMING_STATUSES.map(function(st){return 'COUNTIFS('+CONFIG.SHEETS.BOOKINGS+'!$D$2:$D,$B'+row+','+CONFIG.SHEETS.BOOKINGS+'!$J$2:$J,"'+st+'")';});
  return '='+parts.join('+');
}
function studentRemainingFormula_(row){return '=MAX(0,E'+row+'-F'+row+')';}
/** Ghi công thức F/G cho 1 dòng nếu ô đang trống. Ô có công thức hoặc số gõ tay → giữ nguyên. */
function ensureStudentFormulas_(info,row){
  var S=CONFIG.STUDENT_COLS,u=info.getRange(row,S.USED),g=info.getRange(row,S.REMAINING);
  if(!u.getFormula()&&(u.getValue()===''||u.getValue()===null))u.setFormula(studentUsedFormula_(row));
  if(!g.getFormula()&&(g.getValue()===''||g.getValue()===null))g.setFormula(studentRemainingFormula_(row));
}

var LEGACY_RANGE_RE_=/(![$]?[A-Z]+[$]?2:[$]?[A-Z]+)[$]?\d+/g;   // BOOKINGS!$D$2:$D$2000 → BOOKINGS!$D$2:$D
/**
 * Rà mọi dòng STUDENT_INFO có email:
 *   F/G trống (không công thức, không giá trị) → ghi công thức
 *   F có công thức cũ giới hạn dòng (…$D$2000)  → bỏ giới hạn, giữ nguyên phần còn lại
 *   F/G có SỐ gõ tay → KHÔNG đụng (có thể admin cố ý nhập khi chuyển hệ thống), chỉ báo trong manual
 * Đọc 1 lần, chỉ ghi ô cần sửa. Chạy nhiều lần an toàn.
 */
function repairStudentFormulas_(){
  var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),res={added:0,upgraded:0,manual:[]};
  if(!info||info.getLastRow()<2)return res;
  var S=CONFIG.STUDENT_COLS,n=info.getLastRow()-1,rng=info.getRange(2,1,n,S.REMAINING),vals=rng.getValues(),fx=rng.getFormulas();
  for(var i=0;i<n;i++){
    if(!String(vals[i][S.EMAIL-1]||'').trim())continue;
    var row=i+2,fU=fx[i][S.USED-1],fR=fx[i][S.REMAINING-1],vU=vals[i][S.USED-1],vR=vals[i][S.REMAINING-1];
    if(fU){var up=fU.replace(LEGACY_RANGE_RE_,'$1');if(up!==fU){info.getRange(row,S.USED).setFormula(up);res.upgraded++;}}
    else if(vU===''||vU===null){info.getRange(row,S.USED).setFormula(studentUsedFormula_(row));res.added++;}
    else res.manual.push(row);
    if(!fR&&(vR===''||vR===null)){info.getRange(row,S.REMAINING).setFormula(studentRemainingFormula_(row));res.added++;}
  }
  if(res.added||res.upgraded){SpreadsheetApp.flush();Logger.log('repairStudentFormulas_: thêm '+res.added+', nâng cấp '+res.upgraded);}
  if(res.manual.length)Logger.log('repairStudentFormulas_: SessionsUsed gõ tay ở dòng '+res.manual.join(', ')+' (không tự sửa)');
  return res;
}
function repairStudentFormulas(){
  var res=withScriptLock_('repairStudentFormulas',repairStudentFormulas_);
  if(res)toast_('Công thức STUDENT_INFO: thêm '+res.added+', nâng cấp '+res.upgraded+(res.manual.length?' · dòng gõ tay (không đụng): '+res.manual.join(', '):''));
  return res;
}
