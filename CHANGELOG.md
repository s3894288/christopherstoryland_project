# Changelog

Chi tiết từng phiên bản cũ: `docs/TAI_LIEU_TONG_HOP.md` mục 9.

## v6.1.0 (25/09/2026)

Audit độ bền và bảo mật: 15 bug, trong đó 2 nghiêm trọng. Chi tiết và **hướng dẫn cập nhật**: `docs/RELEASE_v6.1.0.md`

**Sửa bug nghiêm trọng:**

* Học viên kích hoạt sau 6 dòng mẫu không có công thức số buổi → mọi lần đặt Failed "Hết buổi học"
* Công thức COUNTIFS giới hạn 2000 dòng BOOKINGS → quá 2000 dòng thì booking mới không bị trừ buổi

**Sửa bug khác:** trigger bắn 2 lần đặt trùng slot · kích hoạt học viên cộng buổi 2 lần khi chạy song song · gói sai kích hoạt 0 buổi im lặng · chèn HTML qua tên học viên vào email · BookingID trùng · payroll bỏ sót tutor đã nghỉ · 1 email lỗi chặn các bước sau · Meet lỗi không báo admin · dán Cancelled nhiều dòng bị bỏ qua · lỡ trigger chuyển tuần · Paused vẫn đặt được · Round Robin dồn slot cùng lần submit · trạng thái "Hết buổi" không tự về Active

* Mới: `heartbeat()` thay `updateFormOptions` làm trigger 10 phút (tự sửa tuần, công thức, huỷ bị sót) → **chạy lại menu 3**
* Mới: menu Học viên → Sửa công thức số buổi · Điểm danh → Xử lý các dòng huỷ bị sót
* Mới: `withScriptLock_`, `sendMail_`, `esc_`, `loadBookingState_` (đọc BOOKINGS 1 lần / lần đặt)
* Đổi file: Attendance, Config, FormUpdater, Helpers, Main, MeetIntegration, Quota, Registration, Setup, WeeklyMaintenance. Giữ nguyên: Archive, FormLink
* Template: `templates/*_v6.1.xlsx`, công thức vùng mở `$D$2:$D`
* Repo: code vào `src/`, test vào `test/` (trước đây `npm test` lỗi); GitHub Actions, mẫu Issue / PR, `.clasp.json.example`
* Harness: STUDENT_INFO chỉ tự tính ở dòng có công thức (trước: tính mọi dòng → che bug #1, #2); MailApp / Calendar tiêm lỗi được. Test T21 → T32. **110/110 + 42/42**

## v6.0.1 (24/09/2026) HOTFIX

**Sửa bug nghiêm trọng:** trigger form đặt lịch kiểu "From form" chỉ gửi `e.response`, không có `e.values`. `processBooking_` không đọc được email, thoát êm, Executions vẫn báo Completed → phản hồi của học viên bị mất.

* `Main.gs`: `normalizeFormEvent_()` đọc được trigger Spreadsheet, trigger Form và `e` rỗng
* `Main.gs`: thiếu email → ném lỗi, admin nhận email (trước đây im lặng)
* `Main.gs`: chạy tay `onFormSubmitTrigger` → bỏ qua, không gửi email lỗi giả
* `Main.gs`: mới `recoverMissedBookings()` xử lý lại phản hồi 72 giờ gần nhất chưa có trong BOOKINGS, chạy nhiều lần không tạo trùng
* `Helpers.gs`: ghi `ACTIVE_WEEK_SET_AT` khi đổi tuần để recover không xếp nhầm phản hồi tuần cũ
* `Setup.gs`: menu Form → Xử lý lại phản hồi bị sót (72 giờ)
* `Config.gs`: `VERSION` = 6.0.1
* Test: thêm T20 (8 kiểm tra) cho trigger Form; sửa T15 lệch khi tuần active lấn sang tháng sau. 62/62 + 42/42

Chi tiết: `docs/HOTFIX_v6.0.1.md`

## v6.0 FINAL (19/09/2026)

Audit toàn diện, sửa 9 bug. BOOKINGS 14 cột (EventID). Chặn slot đã qua. Round Robin theo tuần. Rollover chống trễ. Rebuild tháng giữ đánh dấu tutor. Payroll ghi tab. `createAllTriggers`. Giả lập thời gian. 50/50 + 42/42 test.

## v5.2 (19/09/2026)

FormLink.gs: nối form bất kỳ vào hệ thống, nhận diện tab response bằng sheetId, ép thứ tự câu hỏi, form ID lưu Script Properties.

## v5.1 (18/09/2026)

Tách 3 spreadsheet (Main, Registration, Tutor). CHECK_SLOT chuyển sang giá trị đồng bộ.

## v5.0 (18/09/2026)

Registration pipeline, quota theo email, điểm danh, archive tháng, payroll.

## v1.0 đến v4.0 (08/2026 đến 09/2026)

Prototype → production: Google Meet, email, Round Robin, quota theo StudentID, sửa các bug ngày tháng.
