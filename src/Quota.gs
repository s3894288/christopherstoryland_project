/**
 * Quota.gs — Quản Lý Số Buổi (v5.0 — khoá theo EMAIL)
 * SessionsUsed đếm Active + Completed + NoShow
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
  if(quota.remaining<=0)return{allowed:false,reason:CONFIG.FAIL_REASONS.NO_CREDITS};
  if(budgetLeft<=0)return{allowed:false,reason:CONFIG.FAIL_REASONS.OVER_BUDGET};
  return{allowed:true,reason:''};
}
function handleBalanceAlerts_(quota,consumed,bookings){
  if(!quota.found||consumed<=0)return;
  var after=Math.max(0,quota.remaining-consumed),props=PropertiesService.getScriptProperties();
  var keyBase='BAL_'+quota.email.toLowerCase()+'_T'+quota.total+'_';
  if(after===0&&CONFIG.QUOTA.NOTIFY_EXHAUSTED){var kEx=keyBase+'EXHAUSTED';if(!props.getProperty(kEx)){try{sendQuotaExhaustedEmail_(quota,consumed,bookings);props.setProperty(kEx,new Date().toISOString());}catch(e){}}markStudentStatus_(quota.email,CONFIG.STUDENT_STATUS.EXHAUSTED);return;}
  if(after===CONFIG.QUOTA.LOW_BALANCE_THRESHOLD&&CONFIG.QUOTA.NOTIFY_LOW_BALANCE){var kLow=keyBase+'LOW';if(!props.getProperty(kLow)){try{sendLowBalanceEmail_(quota,after,bookings);props.setProperty(kLow,new Date().toISOString());}catch(e2){}}}
}
function markStudentStatus_(email,status){var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),t=String(email).trim().toLowerCase();for(var r=1;r<data.length;r++){if(String(data[r][S.EMAIL-1]||'').trim().toLowerCase()===t){info.getRange(r+1,S.STATUS).setValue(status);return;}}}
function resetBalanceAlertFlagsByEmail_(email){var props=PropertiesService.getScriptProperties(),all=props.getProperties(),prefix='BAL_'+String(email).trim().toLowerCase()+'_',n=0;for(var k in all)if(k.indexOf(prefix)===0){props.deleteProperty(k);n++;}Logger.log('Xoá '+n+' cờ cho '+email);}
function scanAndNotifyLowBalance(){
  var info=SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEETS.STUDENT_INFO),S=CONFIG.STUDENT_COLS,data=info.getDataRange().getValues(),props=PropertiesService.getScriptProperties(),low=0,ex=0;
  for(var r=1;r<data.length;r++){var email=String(data[r][S.EMAIL-1]||'').trim();if(!email)continue;
    var quota={found:true,row:r+1,id:String(data[r][S.STUDENT_ID-1]||'').trim(),name:String(data[r][S.NAME-1]||'').trim(),email:email,package:String(data[r][S.PACKAGE-1]||'').trim(),total:Number(data[r][S.TOTAL-1])||0,used:Number(data[r][S.USED-1])||0,remaining:Math.max(0,Number(data[r][S.REMAINING-1])||0),status:String(data[r][S.STATUS-1]||'').trim()};
    var keyBase='BAL_'+email.toLowerCase()+'_T'+quota.total+'_';
    if(quota.remaining===0&&quota.total>0&&CONFIG.QUOTA.NOTIFY_EXHAUSTED){if(!props.getProperty(keyBase+'EXHAUSTED')){try{sendQuotaExhaustedEmail_(quota,0,[]);props.setProperty(keyBase+'EXHAUSTED',new Date().toISOString());ex++;}catch(e){}}}
    else if(quota.remaining===CONFIG.QUOTA.LOW_BALANCE_THRESHOLD&&CONFIG.QUOTA.NOTIFY_LOW_BALANCE){if(!props.getProperty(keyBase+'LOW')){try{sendLowBalanceEmail_(quota,quota.remaining,[]);props.setProperty(keyBase+'LOW',new Date().toISOString());low++;}catch(e2){}}}
  }
  Logger.log('scanAndNotifyLowBalance: '+low+' sắp hết, '+ex+' hết buổi');
}
