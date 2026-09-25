# Triển khai thaiput v6.1.0 từ đầu

Khoảng 30 phút. Cần: 1 tài khoản Google (nên là tài khoản riêng cho hệ thống, VD `booking@thaiput.com`, vì lịch Calendar và email gửi từ tài khoản này).

Bộ cài gồm:

```
1_SPREADSHEETS/   THAIPUT_MAIN_v6.1.xlsx · THAIPUT_REGISTRATION_v6.1.xlsx · THAIPUT_TUTOR_v6.1.xlsx
2_APPS_SCRIPT/    12 file .gs + appsscript.json
```

## A. Dựng 3 spreadsheet (10 phút)

1. Google Drive → **New → File upload** → chọn 3 file XLSX.
2. Mở từng file → **File → Save as Google Sheets**. Từ đây chỉ dùng 3 bản Google Sheets (bản .xlsx xoá được).
3. **REGISTRATION** → tab `PACKAGES`: sửa tên gói, số buổi, học phí theo bảng giá thật.
4. **TUTOR** → tab `TUTOR_INFO`: thay 4 tutor mẫu bằng tutor thật (TutorID không trùng, Email thật, Status = Active, Đơn giá).
   Đổi tên các tab `Tutor-Vân`, `Tutor-Ánh`… thành `Tutor-<Tên>` **đúng y** cột B. Thiếu tab: chuột phải 1 tab → Duplicate → đổi tên. Thừa tab: xoá.
5. Copy **Spreadsheet ID** của REGISTRATION và TUTOR: đoạn giữa `/d/` và `/edit` trên thanh địa chỉ.

## B. Cài Apps Script vào MAIN (10 phút)

6. Mở **MAIN** → **Extensions → Apps Script**. Xoá `Code.gs`.
7. Với mỗi file trong `2_APPS_SCRIPT/`: bấm **+ → Script**, đặt tên **không có đuôi** (`Config`, `Helpers`, …), dán nội dung. Đủ 12 file.
8. **Project Settings** (bánh răng):
   * Time zone → **(GMT+07:00) Ho Chi Minh**
   * Bật **Show "appsscript.json" manifest file in editor** → quay lại editor → mở `appsscript.json` → dán nội dung file cùng tên.
9. Mở `Config.gs`, điền:
   ```js
   ADMIN_EMAIL: 'email admin nhận báo lỗi',
   TUTOR_SS_ID: 'ID bước 5',
   REGISTRATION_SS_ID: 'ID bước 5',
   SCHOOL_EMAIL: 'email học viên trả lời vào',     // tuỳ chọn
   PAYMENT_INFO: { BANK_NAME: …, ACCOUNT_NUMBER: …, ACCOUNT_HOLDER: …, TRANSFER_NOTE_HINT: … },
   ```
   **Ctrl+S** để lưu.

## C. Khởi tạo (5 phút)

10. Quay lại tab Google Sheets của MAIN → **reload** (F5). Đợi menu **thaiput** hiện ở thanh menu.
11. **thaiput → 1. Khởi tạo + kiểm tra hệ thống**. Lần đầu Google hỏi quyền → chọn tài khoản → *Advanced → Go to … (unsafe)* → Allow. Chạy lại menu 1.
    Việc nó làm: đặt múi giờ 3 file về Việt Nam, dựng lịch tháng này + 2 tuần tới cho CHECK_SLOT và mọi tab tutor, kiểm tra toàn bộ.
    Góc phải hiện **"0 lỗi"**. Có lỗi: Extensions → Apps Script → **Executions** → mở dòng mới nhất, đọc dòng `LỖI`.
12. **thaiput → 2. Tạo 2 Form mới + kết nối**. Link 2 form ghi vào DASHBOARD B11 (đặt lịch), B12 (đăng ký).
13. **thaiput → 3. Tạo/cập nhật 8 trigger** → góc phải **"Đã tạo 8/8 trigger"**.
14. **thaiput → Form → Kiểm tra kết nối Form** → Executions ghi **0 vấn đề**.

## D. Chạy thử trước khi mở cho học viên (5 phút)

15. Mở form đăng ký (B12), đăng ký bằng 1 email test của bạn.
16. REGISTRATION → tab `STUDENT_REGISTRATION` → cột E dòng đó chọn **Đã thanh toán** → MAIN menu **Học viên → Kích hoạt học viên đã thanh toán**. Email test nhận thư chào mừng.
17. TUTOR → tab 1 tutor → gõ `x` vào 1 ô ngày mai. MAIN menu **4. Đồng bộ slot + dropdown Form**.
18. Mở form đặt lịch (B11) bằng email test → chọn slot vừa đánh x → gửi. Trong 1 phút: 1 dòng **Active** trong BOOKINGS, email xác nhận có nút "Vào lớp", sự kiện trên Google Calendar.
19. BOOKINGS → cột J dòng đó chọn **Cancelled** → email huỷ, sự kiện Calendar biến mất, STUDENT_INFO hoàn 1 buổi.

Tất cả đúng → hệ thống sẵn sàng. Gửi link B12 cho học viên mới, link TUTOR spreadsheet cho tutor (quyền Editor), link B11 kèm trong email chào mừng tự động.

## Sau khi go live

* DASHBOARD **B20** (Lần đồng bộ cuối) nhảy mỗi 10 phút = hệ thống đang sống.
* Tháng đầu, mỗi tuần mở **Executions** 1 lần xem có dòng **Failed** không.
* Vận hành hằng ngày và xử lý sự cố: `docs/TAI_LIEU_TONG_HOP.md` mục 6 và 12.
