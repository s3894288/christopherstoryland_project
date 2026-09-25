/**
 * MeetIntegration.gs — Google Meet + Bộ Email (v6.0 FINAL)
 * v6.0: createMeetEvent_ trả {link,eventId}; deleteMeetEvent_ khi huỷ; welcome đọc form ID từ Properties
 */

function createMeetEvent_(date,timeSlot,studentEmail,tutorEmail,studentName,tutorName){
  var parts=timeSlot.split(' - '),s=parts[0].trim().split(':'),eP=parts[1].trim().split(':');
  var startDt=new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number(s[0]),Number(s[1]),0);
  var endDt=new Date(date.getFullYear(),date.getMonth(),date.getDate(),Number(eP[0]),Number(eP[1]),0);
  var event=Calendar.Events.insert({
    summary:'Buổi học 1:1 — '+studentName+' & '+tutorName+' | '+CONFIG.SCHOOL_NAME,
    description:'Buổi học 1:1 tại '+CONFIG.SCHOOL_NAME+'\nHọc viên: '+studentName+'\nGiảng viên: '+tutorName+'\nNgày: '+formatDate_(date)+'\nKhung giờ: '+timeSlot,
    start:{dateTime:startDt.toISOString(),timeZone:CONFIG.TIMEZONE},end:{dateTime:endDt.toISOString(),timeZone:CONFIG.TIMEZONE},
    attendees:[{email:studentEmail},{email:tutorEmail}],
    conferenceData:{createRequest:{requestId:'thaiput-'+Date.now()+'-'+Math.random().toString(36).substr(2,8),conferenceSolutionKey:{type:'hangoutsMeet'}}},
    reminders:{useDefault:false,overrides:[{method:'email',minutes:1440},{method:'popup',minutes:30},{method:'popup',minutes:10}]}
  },'primary',{conferenceDataVersion:1});
  var link='';if(event.conferenceData&&event.conferenceData.entryPoints)for(var i=0;i<event.conferenceData.entryPoints.length;i++)if(event.conferenceData.entryPoints[i].entryPointType==='video'){link=event.conferenceData.entryPoints[i].uri;break;}
  return{link:link,eventId:String(event.id||'')};
}

/** Xoá event Calendar khi huỷ booking. Không ném lỗi — huỷ vẫn phải hoàn tất dù Calendar lỗi. */
function deleteMeetEvent_(eventId){
  if(!eventId)return false;
  try{Calendar.Events.remove('primary',eventId,{sendUpdates:'all'});return true;}
  catch(e){Logger.log('deleteMeetEvent_ '+eventId+': '+e.message);return false;}
}

// ── Email framework ──
function emailWrapper_(content,accent,preheader){
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#eef1f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">'+
  (preheader||'')+'</div><div style="max-width:620px;margin:0 auto;padding:20px 12px"><div style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(16,32,64,0.10)"><div style="height:5px;background:'+(accent||'#2F5496')+'"></div><div style="padding:26px 32px 18px;border-bottom:1px solid #eef1f5"><div style="font-size:22px;font-weight:700;color:#1b2a4a;letter-spacing:0.3px">'+CONFIG.SCHOOL_NAME+'</div><div style="font-size:12px;color:#7b8798;margin-top:3px">'+CONFIG.SCHOOL_TAGLINE+'</div></div><div style="padding:28px 32px">'+content+'</div><div style="background:#f7f9fc;padding:20px 32px;border-top:1px solid #eef1f5"><div style="font-size:12px;color:#7b8798;line-height:1.7"><b style="color:#5a6678">Cần hỗ trợ?</b><br>Email: <a href="mailto:'+getReplyToEmail_()+'" style="color:#2F5496">'+getReplyToEmail_()+'</a>'+(CONFIG.SCHOOL_PHONE?'<br>Hotline: '+CONFIG.SCHOOL_PHONE:'')+'<br>Giờ hỗ trợ: '+CONFIG.SUPPORT_HOURS+'</div><div style="font-size:11px;color:#a3adbb;margin-top:14px;padding-top:12px;border-top:1px solid #e4e9f0">Email tự động từ '+CONFIG.SCHOOL_NAME+'. © '+getNow_().getFullYear()+' '+CONFIG.SCHOOL_NAME+'.</div></div></div></div></body></html>';
}
function emailBanner_(title,subtitle,bg,fg){return '<div style="background:'+bg+';border-radius:10px;padding:16px 20px;margin:0 0 22px"><div style="font-size:17px;font-weight:700;color:'+fg+'">'+title+'</div>'+(subtitle?'<div style="font-size:13px;color:'+fg+';opacity:0.85;margin-top:4px">'+subtitle+'</div>':'')+'</div>';}
function balanceBox_(total,used,remaining){var color=remaining<=0?'#C62828':(remaining<=CONFIG.QUOTA.LOW_BALANCE_THRESHOLD?'#E65100':'#1B5E20'),bg=remaining<=0?'#FDECEA':(remaining<=CONFIG.QUOTA.LOW_BALANCE_THRESHOLD?'#FFF4E5':'#EDF7ED');return '<div style="background:'+bg+';border-radius:10px;padding:16px 20px;margin:22px 0"><div style="font-size:12px;color:#5a6678;text-transform:uppercase;letter-spacing:0.6px;font-weight:600">Số buổi học của bạn</div><table style="width:100%;margin-top:10px;border-collapse:collapse"><tr><td style="font-size:13px;color:#5a6678;padding:3px 0">Tổng</td><td style="font-size:13px;color:#1b2a4a;text-align:right;font-weight:600">'+total+'</td></tr><tr><td style="font-size:13px;color:#5a6678;padding:3px 0">Đã sử dụng</td><td style="font-size:13px;color:#1b2a4a;text-align:right;font-weight:600">'+used+'</td></tr><tr><td style="font-size:14px;color:'+color+';padding:8px 0 0;font-weight:700;border-top:1px solid rgba(0,0,0,0.08)">Còn lại</td><td style="font-size:20px;color:'+color+';text-align:right;font-weight:700;padding:8px 0 0;border-top:1px solid rgba(0,0,0,0.08)">'+remaining+' buổi</td></tr></table></div>';}
function prepBox_(){return '<div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px;margin:22px 0"><div style="font-size:13px;font-weight:700;color:#1b2a4a;margin-bottom:8px">Chuẩn bị trước buổi học</div><ul style="margin:0;padding-left:18px;color:#4a5568;font-size:13px;line-height:1.9"><li>Vào phòng Meet trước <b>'+CONFIG.POLICY.JOIN_EARLY_MINUTES+' phút</b></li><li>Dùng tai nghe có micro</li><li>Chuẩn bị sổ ghi chép</li></ul></div>';}
function policyBox_(){return '<div style="background:#f7f9fc;border-radius:10px;padding:14px 18px;margin:22px 0"><div style="font-size:12px;font-weight:700;color:#5a6678;margin-bottom:6px">Chính sách đổi và huỷ</div><div style="font-size:12.5px;color:#6b7688;line-height:1.8">Báo trước <b>'+CONFIG.POLICY.CANCEL_NOTICE_HOURS+' giờ</b> để được hoàn buổi. Vắng mặt không báo trước sẽ bị tính là đã sử dụng.</div></div>';}
function ctaButton_(label,url,color){return '<div style="text-align:center;margin:24px 0"><a href="'+url+'" style="display:inline-block;background:'+(color||'#2F5496')+';color:#fff;padding:13px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600">'+label+'</a></div>';}
function infoRow_(label,value){return '<tr><td style="padding:7px 0;font-size:13px;color:#7b8798;width:38%;vertical-align:top">'+label+'</td><td style="padding:7px 0;font-size:13.5px;color:#1b2a4a;font-weight:600">'+value+'</td></tr>';}

// ── 1. XÁC NHẬN ĐẶT LỊCH ──
function sendBookingConfirmation(studentEmail,studentName,successBookings,quota,remainingAfter){
  var rows='';for(var i=0;i<successBookings.length;i++){var b=successBookings[i];rows+='<tr><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;font-size:13.5px;color:#1b2a4a"><b>'+formatDate_(b.date)+'</b><br><span style="color:#7b8798;font-size:12px">'+getDayName_(b.date)+'</span></td><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;font-size:13.5px;color:#1b2a4a;text-align:center">'+b.timeSlot+'</td><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;font-size:13.5px;color:#1b2a4a">'+b.tutor.name+'</td><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;text-align:center">'+(b.meetLink?'<a href="'+b.meetLink+'" style="display:inline-block;background:#1a73e8;color:#fff;padding:7px 16px;border-radius:16px;text-decoration:none;font-size:12.5px;font-weight:600">Vào lớp</a>':'<span style="color:#a3adbb;font-size:12px">gửi sau</span>')+'</td></tr>';}
  var body=emailBanner_('Đã xác nhận '+successBookings.length+' buổi học','Lịch đã được ghi nhận.','#EDF7ED','#1B5E20')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+studentName+'</b>,</p><p style="font-size:14px;color:#4a5568;line-height:1.7">Dưới đây là chi tiết lịch học kèm link phòng.</p><table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5"><tr style="background:#f7f9fc"><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:left">Ngày</th><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:center">Giờ</th><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:left">GV</th><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:center">Phòng</th></tr>'+rows+'</table>'+(quota&&quota.found?balanceBox_(quota.total,quota.used+successBookings.length,remainingAfter!==null?remainingAfter:quota.remaining):'')+prepBox_()+policyBox_();
  MailApp.sendEmail({to:studentEmail,subject:'Xác nhận lịch học '+formatDate_(successBookings[0].date)+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#2E7D32','Đã xác nhận '+successBookings.length+' buổi học.'),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});
  if(!CONFIG.EMAIL.SEND_TUTOR_NOTIFICATION)return;
  var byTutor={};for(var j=0;j<successBookings.length;j++){var bk=successBookings[j];if(!bk.tutor||!bk.tutor.email)continue;if(!byTutor[bk.tutor.email])byTutor[bk.tutor.email]={tutor:bk.tutor,list:[]};byTutor[bk.tutor.email].list.push(bk);}
  for(var email in byTutor){var t=byTutor[email];var tRows='';for(var k=0;k<t.list.length;k++){var tb=t.list[k];tRows+='<tr><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;font-size:13.5px;color:#1b2a4a"><b>'+formatDate_(tb.date)+'</b> · '+getDayName_(tb.date)+'</td><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;font-size:13.5px;text-align:center">'+tb.timeSlot+'</td><td style="padding:13px 14px;border-bottom:1px solid #eef1f5;text-align:center">'+(tb.meetLink?'<a href="'+tb.meetLink+'" style="color:#1a73e8;font-weight:600;text-decoration:none;font-size:13px">Mở phòng</a>':'—')+'</td></tr>';}
    var tBody=emailBanner_('Bạn có lịch dạy mới',t.list.length+' buổi được xếp.','#E8F0FE','#174EA6')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+t.tutor.name+'</b>,</p><div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px;margin:0 0 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Học viên',studentName)+infoRow_('Email','<a href="mailto:'+studentEmail+'" style="color:#2F5496">'+studentEmail+'</a>')+'</table></div><table style="width:100%;border-collapse:collapse;border:1px solid #eef1f5"><tr style="background:#f7f9fc"><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:left">Ngày</th><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:center">Giờ</th><th style="padding:11px 14px;font-size:11.5px;color:#5a6678;text-align:center">Phòng</th></tr>'+tRows+'</table>';
    MailApp.sendEmail({to:t.tutor.email,subject:'Lịch dạy mới: '+studentName+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(tBody,'#1A73E8',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});}
}

// ── 2. THẤT BẠI ──
function sendFailureNotifications(studentEmail,studentName,studentId,failedSlots,quota,successCount){
  var byReason={};for(var i=0;i<failedSlots.length;i++){var f=failedSlots[i],key=f.reason||'Không xác định';if(!byReason[key])byReason[key]=[];byReason[key].push(f);}
  if(CONFIG.EMAIL.SEND_FAILURE_STUDENT&&studentEmail){
    var blocks='';for(var reason in byReason){var items=byReason[reason],li='';for(var k=0;k<items.length;k++)li+='<li>'+formatDate_(items[k].date)+' · '+items[k].timeSlot+'</li>';blocks+='<div style="border:1px solid #f3d6d3;background:#FDECEA;border-radius:10px;padding:14px 18px;margin:0 0 12px"><div style="font-size:13px;font-weight:700;color:#8a1f1a;margin-bottom:6px">'+reason+'</div><ul style="margin:0;padding-left:18px;color:#6b3330;font-size:13px;line-height:1.8">'+li+'</ul></div>';}
    var body=emailBanner_(successCount>0?'Một phần đăng ký chưa thành công':'Đăng ký chưa thành công','','#FDECEA','#8a1f1a')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+(studentName||'bạn')+'</b>,</p>'+blocks+(quota&&quota.found?balanceBox_(quota.total,quota.used,quota.remaining):'');
    MailApp.sendEmail({to:studentEmail,subject:(successCount>0?'Một phần lịch chưa xác nhận':'Đăng ký chưa thành công')+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#E53935',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});}
  if(CONFIG.EMAIL.NOTIFY_ADMIN_ON_FAILURE){var adminList='';for(var r2 in byReason){var arr=byReason[r2],lis='';for(var m=0;m<arr.length;m++)lis+='<li>'+formatDate_(arr[m].date)+' · '+arr[m].timeSlot+'</li>';adminList+='<div style="margin:0 0 10px"><b style="color:#8a1f1a">'+r2+'</b><ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#4a5568">'+lis+'</ul></div>';}
    var adminBody=emailBanner_('Booking thất bại',failedSlots.length+' slot.','#FFF4E5','#8a4a00')+'<div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Học viên',(studentName||''))+infoRow_('Email',studentEmail||'')+infoRow_('Thành công',successCount+' buổi')+infoRow_('Thất bại',failedSlots.length+' buổi')+'</table></div>'+adminList;
    MailApp.sendEmail({to:CONFIG.ADMIN_EMAIL,subject:'[Admin] Booking thất bại — '+(studentName||studentEmail),htmlBody:emailWrapper_(adminBody,'#FB8C00',''),name:CONFIG.SCHOOL_NAME});}
}

// ── 3. SẮP HẾT BUỔI ──
function sendLowBalanceEmail_(quota,remaining,bookings){
  if(!quota.email)return;
  var body=emailBanner_('Bạn còn '+remaining+' buổi học','Gia hạn sớm để không gián đoạn.','#FFF4E5','#8a4a00')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+quota.name+'</b>,</p><p style="font-size:14px;color:#4a5568;line-height:1.7">Gói học của bạn sắp dùng hết.</p>'+balanceBox_(quota.total,quota.total-remaining,remaining)+ctaButton_('Liên hệ gia hạn','mailto:'+getReplyToEmail_()+'?subject='+encodeURIComponent('Gia hạn — '+quota.email),'#FB8C00');
  MailApp.sendEmail({to:quota.email,subject:'Bạn còn '+remaining+' buổi học | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#FB8C00',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});
}

// ── 4. HẾT BUỔI ──
function sendQuotaExhaustedEmail_(quota,consumed,bookings){
  if(!quota.email)return;
  var body=emailBanner_('Gói học đã dùng hết','Gia hạn để tiếp tục.','#FDECEA','#8a1f1a')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+quota.name+'</b>,</p><p style="font-size:14px;color:#4a5568;line-height:1.7">Gói học của bạn đã hết. Form đăng ký sẽ tạm từ chối buổi mới.</p>'+balanceBox_(quota.total,quota.total,0)+ctaButton_('Gia hạn gói học','mailto:'+getReplyToEmail_()+'?subject='+encodeURIComponent('Gia hạn — '+quota.email),'#2F5496');
  MailApp.sendEmail({to:quota.email,cc:CONFIG.QUOTA.ADMIN_CC_ON_EXHAUSTED?CONFIG.ADMIN_EMAIL:'',subject:'Gói học đã dùng hết | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#E53935',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});
}

// ── 5. HUỶ BUỔI ──
function sendCancelNotification(bookingRow){
  if(!CONFIG.EMAIL.SEND_CANCEL_NOTIFICATION)return;
  var C=CONFIG.BOOKING_COLS,bookingId=bookingRow[C.BOOKING_ID-1],studentName=bookingRow[C.STUDENT_NAME-1],studentEmail=bookingRow[C.STUDENT_EMAIL-1],tutorName=bookingRow[C.TUTOR_NAME-1],date=bookingRow[C.DATE-1],timeSlot=bookingRow[C.TIME_SLOT-1];
  var dateStr=(date instanceof Date)?formatDate_(date):String(date),dayStr=(date instanceof Date)?getDayName_(date):'';
  var quota=getStudentQuotaByEmail_(studentEmail);
  if(studentEmail){var body=emailBanner_('Buổi học đã được huỷ','Buổi đã hoàn lại.','#FFF8E1','#7a5c00')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+studentName+'</b>,</p><div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Ngày',dateStr+' · '+dayStr)+infoRow_('Khung giờ',timeSlot)+infoRow_('Giảng viên',tutorName||'—')+infoRow_('Mã',bookingId)+'</table></div>'+(quota.found?balanceBox_(quota.total,quota.used,quota.remaining):'');MailApp.sendEmail({to:studentEmail,subject:'Đã huỷ buổi học '+dateStr+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(body,'#FBC02D',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});}
  var tutors=getActiveTutors_(),tutorEmail='';for(var i=0;i<tutors.length;i++)if(tutors[i].name===tutorName){tutorEmail=tutors[i].email;break;}
  if(tutorEmail){var tBody=emailBanner_('Buổi dạy đã huỷ','Khung giờ đã giải phóng.','#FFF8E1','#7a5c00')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+tutorName+'</b>,</p><div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Học viên',studentName)+infoRow_('Ngày',dateStr)+infoRow_('Khung giờ',timeSlot)+'</table></div>';MailApp.sendEmail({to:tutorEmail,subject:'Huỷ buổi dạy '+dateStr+' | '+CONFIG.SCHOOL_NAME,htmlBody:emailWrapper_(tBody,'#FBC02D',''),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});}
}

// ── 6. CHÀO MỪNG HỌC VIÊN ──
function sendWelcomeEmail_(email,name,studentId,packageName,sessions){
  if(!email)return;
  var bkId=(typeof getBookingFormId_==='function')?getBookingFormId_():CONFIG.BOOKING_FORM_ID;
  var bookingUrl=bkId?'https://docs.google.com/forms/d/'+bkId+'/viewform':'';
  var body=emailBanner_('Chào mừng bạn đến với '+CONFIG.SCHOOL_NAME,'Tài khoản đã kích hoạt.','#EDF7ED','#1B5E20')+'<p style="font-size:15px;color:#1b2a4a">Chào <b>'+name+'</b>,</p><p style="font-size:14px;color:#4a5568;line-height:1.7">Thanh toán đã được xác nhận.</p><div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px;margin:0 0 20px"><table style="width:100%;border-collapse:collapse">'+infoRow_('Mã học viên',studentId)+infoRow_('Email',email)+infoRow_('Gói học',packageName)+infoRow_('Số buổi',sessions+' buổi')+'</table></div>'+balanceBox_(sessions,0,sessions)+'<div style="border:1px solid #e4e9f0;border-radius:10px;padding:16px 20px;margin:0 0 20px"><div style="font-size:13px;font-weight:700;color:#1b2a4a;margin-bottom:10px">Cách đặt lịch</div><ol style="margin:0;padding-left:18px;color:#4a5568;font-size:13.5px;line-height:1.9"><li>Mở form đặt lịch</li><li>Đặt bằng <b>đúng email này</b> ('+email+')</li><li>Chọn khung giờ phù hợp</li><li>Nhận email xác nhận kèm link Meet</li></ol></div>'+(bookingUrl?ctaButton_('Đặt lịch học ngay',bookingUrl,'#2F5496'):'')+'<div style="background:#FFF4E5;border-radius:10px;padding:14px 18px"><div style="font-size:12.5px;color:#8a4a00;line-height:1.8"><b>Quan trọng:</b> luôn đặt lịch bằng đúng email đã đăng ký.</div></div>';
  MailApp.sendEmail({to:email,subject:'Chào mừng đến với '+CONFIG.SCHOOL_NAME+' — Tài khoản đã kích hoạt',htmlBody:emailWrapper_(body,'#2E7D32','Tài khoản kích hoạt với '+sessions+' buổi.'),replyTo:getReplyToEmail_(),name:CONFIG.SCHOOL_NAME});
}
