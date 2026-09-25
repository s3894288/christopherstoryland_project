# thaiput v6.1.0: Audit độ bền, bảo mật và triển khai

Ngày: 25/09/2026 · Áp dụng cho: v6.0.1 · Test: 110/110 nghiệp vụ, 42/42 FormLink, 70/70 đầu-cuối trên template thật

Bản này không thêm tính năng lớn. Nó sửa những chỗ **chạy đúng trong harness nhưng sẽ hỏng khi hệ thống lớn dần hoặc gặp sự cố thật**: học viên mới không đặt được, trừ buổi sai, email lỗi làm mất bước sau, trigger bị lỡ.

Bug #1–15 có test riêng trong `test/harness.js` (T21 → T32); bug #16–20 (đường triển khai) có trong `test/e2e.test.js`, chạy trên đúng 3 file XLSX mẫu. Đã kiểm chứng: chạy harness mới trên code v6.0.1 → 38 kiểm tra FAIL; trên v6.1.0 → 0 FAIL.

## 1. Bug đã sửa

| # | Mức | Bug | Hậu quả thực tế | Test |
|---|---|---|---|---|
| 1 | **NGHIÊM TRỌNG** | Template chỉ có công thức SessionsUsed / SessionsRemaining ở 6 dòng mẫu. `syncRegistrations` ghi học viên mới vào dòng 8 trở đi **không kèm công thức** | Mọi học viên kích hoạt sau 6 dòng mẫu: SessionsRemaining trống = 0 → **mọi lần đặt đều Failed "Hết buổi học"** | T21 |
| 2 | **NGHIÊM TRỌNG** | Công thức COUNTIFS chỉ quét `BOOKINGS!D2:D2000`. Mỗi lần submit đều ghi dòng, kể cả Failed | Qua 2000 dòng BOOKINGS (vài tuần đến vài tháng), booking mới **không bị trừ buổi**: học viên học miễn phí, không ai biết | T32 |
| 3 | CAO | Trigger form của Google thỉnh thoảng bắn 2 lần cho 1 phản hồi | Học viên bị xếp **2 tutor cùng 1 khung giờ**, trừ 2 buổi, nhận 2 link Meet | T22 |
| 4 | CAO | Bấm menu "Kích hoạt học viên" đúng lúc trigger form đăng ký đang chạy (không có lock) | 2 lần chạy cùng thấy dòng chưa Synced → học viên được **cộng buổi 2 lần** | (lock) |
| 5 | CAO | Tên gói trong form đăng ký không khớp PACKAGES | Học viên được kích hoạt với **0 buổi**, đánh Synced = Yes, không ai được báo | T21 |
| 6 | CAO | Tên học viên tự gõ được ghép thẳng vào HTML email gửi tutor / admin | Học viên đặt tên chứa HTML là **chèn được link, ảnh giả** vào email của trung tâm | T24 |
| 7 | CAO | BookingID = giây + 3 số ngẫu nhiên. Đặt 7 slot trong cùng 1 giây | ~2% lần đặt nhiều slot có **2 booking trùng ID** → đánh NoShow nhầm dòng | T23 |
| 8 | TRUNG BÌNH | Payroll chỉ liệt kê tutor đang Active | Tutor nghỉ giữa tháng **mất lương** các buổi đã dạy; dòng TỔNG CỘNG lệch với tổng các dòng | T28 |
| 9 | TRUNG BÌNH | 1 email gửi lỗi (hết quota ngày, địa chỉ sai) ném exception | Các bước sau bị bỏ: tutor không nhận lịch dạy, không có cảnh báo số buổi | T26 |
| 10 | TRUNG BÌNH | Tạo Google Meet lỗi → booking vẫn Active, email ghi "gửi sau" | Không ai gửi link sau cả; admin không được báo | T27 |
| 11 | TRUNG BÌNH | Dán "Cancelled" cho nhiều dòng cùng lúc | onEdit bỏ qua cả khối: **không xoá lịch Calendar, không email** học viên / tutor | T29 |
| 12 | TRUNG BÌNH | Trigger chuyển tuần CN 23:00 bị lỡ (lỗi, bận) | Form hiện **tuần cũ suốt 7 ngày** | T31 |
| 13 | THẤP | Học viên trạng thái Paused vẫn đặt được | Trạng thái Paused vô tác dụng | T25 |
| 14 | THẤP | Round Robin không tính các slot vừa đặt trong cùng 1 lần submit | Học viên chọn 7 ngày → cả 7 buổi dồn cho 1 tutor | T23 |
| 15 | THẤP | Huỷ buổi của học viên đang "Hết buổi" | Buổi được hoàn nhưng trạng thái vẫn "Hết buổi" | T30 |
| 16 | CAO | Template chứa lịch cố định 01/08–07/09/2026; không bước triển khai nào dựng lịch tuần hiện tại | Triển khai tháng khác: **dropdown trống, tutor không có dòng để đánh x** | e2e 1–2 |
| 17 | CAO | Dòng ngày chỉ dựng cho tháng hiện tại + tuần active | Email CN nhắc tutor điền tuần sau, nhưng tuần sau vắt sang tháng mới thì **chưa có dòng** tới 01:00 ngày 1 | e2e 9 |
| 18 | TRUNG BÌNH | Không kiểm tra timezone của từng spreadsheet (chỉ timezone project) | XLSX upload nhận timezone người upload; lệch về phía đông → **ngày đọc ra lùi 1 ngày** | e2e 1–2 |
| 19 | THẤP | Template có 6 học viên, 8 đăng ký, lịch tutor giả | Dữ liệu giả lẫn vào hệ thống thật | e2e 1 |
| 20 | THẤP | Test T10 trên sheet cố định "tháng 8 → 9/2026" | Chạy tháng khác báo sai | — |

## 2. Cải thiện khác

* **Hiệu năng:** mỗi lần đặt đọc BOOKINGS **1 lần** thay vì ~35 lần (7 slot × 4 tutor + đếm Round Robin). Với BOOKINGS vài nghìn dòng, thời gian xử lý 1 phản hồi giảm từ hàng chục giây xuống vài giây. PACKAGES đọc 1 lần mỗi lần kích hoạt.
* **Lock ở mọi entry point ghi dữ liệu:** đặt lịch, huỷ, kích hoạt, điểm danh, NoShow, chuyển tuần, archive, heartbeat. Gọi lồng nhau không tự khoá chính mình.
* **Heartbeat** (`heartbeat()`) thay `updateFormOptions` làm trigger 10 phút. Mỗi lần chạy: tự chuyển tuần nếu bị lỡ → bổ sung công thức STUDENT_INFO thiếu → xử lý dòng huỷ bị sót → sync CHECK_SLOT + dropdown như cũ. Bước nào lỗi vẫn chạy bước sau, cuối cùng Executions báo Failed.
* **Phản hồi trên màn hình:** các lệnh menu hiện thông báo góc phải (toast) thay vì chỉ ghi log.
* **testSystem** kiểm tra thêm: công thức STUDENT_INFO (thiếu / cũ giới hạn 2000 dòng), trigger heartbeat, quota email còn lại trong ngày.
* **Menu mới:** Học viên → Sửa công thức số buổi · Điểm danh → Xử lý các dòng huỷ bị sót. NoShow chọn được nhiều dòng.
* **Registration:** ghi lại Số buổi (cột G) + Học phí (cột H) để đối soát; tên gói không phân biệt hoa thường / khoảng trắng thừa.
* **Repo:** code chuyển vào `src/`, test vào `test/` như README mô tả (trước đây `npm test` không chạy được). Thêm GitHub Actions, mẫu báo lỗi, mẫu pull request, `.clasp.json.example`.

## 3. Cập nhật hệ thống đang chạy (10 phút)

> Làm ngoài giờ cao điểm. Không cần tạo lại form hay spreadsheet.

1. **Apps Script → thay nội dung 10 file:** Attendance, FormUpdater, Helpers, Main, MeetIntegration, Quota, Registration, Setup, WeeklyMaintenance, và Config (xem bước 2). **Không đổi:** Archive.gs, FormLink.gs, appsscript.json.
2. **Config.gs: KHÔNG dán đè** (sẽ mất email / ID thật). Chỉ sửa / thêm các dòng:
   ```js
   VERSION: '6.1.0',
   // trong FAIL_REASONS, thêm:
   PAUSED:'Tài khoản đang tạm dừng — liên hệ trung tâm',
   DUPLICATE:'Bạn đã có lịch ở khung giờ này'
   // thay LOCK_TIMEOUT_MS và thêm 3 dòng:
   LOCK_TIMEOUT_MS: 60000,
   DUPLICATE_SUBMIT_WINDOW_MINUTES: 5,
   MEET_CREATE_ATTEMPTS: 2,
   CANCEL_NOTE_PREFIX: 'Huỷ ',
   ```
3. Reload Google Sheet MAIN để menu mới xuất hiện.
4. Menu **thaiput → Học viên → Sửa công thức số buổi**. Thông báo góc phải cho biết số dòng được thêm / nâng cấp. Nếu có "dòng gõ tay": đó là ô SessionsUsed admin nhập số bằng tay, script không đụng; tự kiểm tra.
5. Menu **thaiput → 3. Tạo/cập nhật 8 trigger**. Trigger `updateFormOptions` cũ được thay bằng `heartbeat`.
6. Menu **thaiput → 1. Khởi tạo + kiểm tra hệ thống** (menu 1 đổi tên; chạy lại an toàn trên hệ thống đang chạy, giữ nguyên x và booking) → phải **0 lỗi**.
7. **Rà hậu quả bug cũ:**
   * BOOKINGS lọc Status = Failed, FailReason = "Hết buổi học — cần nạp thêm" từ khi go live: học viên nào **thực ra còn buổi** (bug #1) → liên hệ mời đặt lại.
   * Nếu BOOKINGS đã quá 2000 dòng (bug #2): sau bước 4, cột SessionsRemaining giờ đã đúng và có thể **thấp hơn** trước. Học viên nào về 0 hoặc âm thì đã học lố; trung tâm tự quyết cách xử lý.
   * PAYROLL tháng trước nếu có tutor nghỉ giữa tháng (bug #8): chạy lại **Báo cáo → Payroll tháng trước**.
8. Test thật (hoặc làm theo `docs/DEPLOY.md` mục D): submit form đặt lịch bằng email học viên test → 1 dòng Active trong BOOKINGS, email xác nhận có link Meet. Đổi dòng đó thành Cancelled → email huỷ, lịch Calendar biến mất.

**Lưu ý lần chạy heartbeat đầu:** dòng BOOKINGS đã Cancelled, có tutor, ngày từ hôm nay trở đi, mà cột FailReason **không** bắt đầu bằng "Huỷ " (chỉ có ở booking huỷ trước v6.0) sẽ được coi là huỷ bị sót: gửi email huỷ + xoá lịch. Thường là 0 dòng. Muốn chắc: lọc BOOKINGS trước bước 5.

## 4. Nguyên tắc bổ sung

**Quy tắc 14.** Mọi entry point ghi dữ liệu (trigger, menu) chạy trong `withScriptLock_`. Hàm gọi lồng không cần tự khoá.

**Quy tắc 15.** Mọi dữ liệu người dùng nhập vào (tên, email, tên gói) phải qua `esc_()` trước khi ghép vào HTML email.

**Quy tắc 16.** Gửi email bằng `sendMail_()`, không gọi thẳng `MailApp.sendEmail` (trừ `notifyAdminError_`). Kết thúc entry point bằng `flushMailErrors_()`.

**Quy tắc 17.** Công thức STUDENT_INFO chỉ tạo bằng `studentUsedFormula_` / `ensureStudentFormulas_`. Không dùng vùng có giới hạn dòng (`$D$2:$D$2000`).
