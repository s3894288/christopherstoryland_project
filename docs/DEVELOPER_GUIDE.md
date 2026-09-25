# Hướng dẫn cho lập trình viên

Dành cho coder nhận bảo trì hoặc phát triển tiếp. Đọc hết trang này trước khi sửa code.

## 1. Kiến trúc trong 1 phút

```
Form Đặt lịch ──(trigger From form)──► onFormSubmitTrigger ─► processBooking_
                                                                 │
Form Đăng ký ──► Registration SS ──► onRegistrationSubmit ─► STUDENT_INFO (Main)
                                                                 │
Tutor SS (Tutor-*: đánh "x" giờ rảnh) ──► assignTutor_ (Round Robin theo tuần)
                                                                 │
                                      BOOKINGS (Main) + Google Meet + Gmail
```

| Spreadsheet | Tab chính | Ghi chú |
|---|---|---|
| MAIN (chứa script) | BOOKINGS, STUDENT_INFO, CHECK_SLOT, ĐĂNG KÝ MỚI, DASHBOARD, PAYROLL_REPORT | Script bound vào file này |
| REGISTRATION | STUDENT_REGISTRATION, PACKAGES | Mở bằng `CONFIG.REGISTRATION_SS_ID` |
| TUTOR | TUTOR_INFO, Tutor-<tên> | Mở bằng `CONFIG.TUTOR_SS_ID` |

Chi tiết cột từng tab: `docs/TAI_LIEU_TONG_HOP.md` mục 4.

## 2. Bản đồ file

| File | Trách nhiệm |
|---|---|
| Config.gs | Hằng số, tên tab, chỉ số cột. Mọi "magic number" nằm ở đây |
| Helpers.gs | Ngày giờ (`getNow_`, `makeNoon_`), tuần active, cache, đọc tutor, `loadBookingState_`, `withScriptLock_`, `sendMail_`, `esc_` |
| Main.gs | Nhận form đặt lịch, chuẩn hoá event, đặt slot, cứu phản hồi sót |
| Quota.gs | Tra số buổi còn lại theo email, công thức STUDENT_INFO (`studentUsedFormula_`, `repairStudentFormulas_`) |
| MeetIntegration.gs | Tạo/xoá sự kiện Calendar + Meet, mọi email |
| FormUpdater.gs | Đồng bộ CHECK_SLOT, dropdown form, số liệu DASHBOARD |
| FormLink.gs | Nối form vào hệ thống, ép thứ tự câu hỏi, dựng trigger form |
| Registration.gs | Kích hoạt học viên đã thanh toán |
| Attendance.gs | Active → Completed / NoShow, payroll |
| WeeklyMaintenance.gs | Chuyển tuần (+ tự sửa khi lỡ: `ensureActiveWeekCurrent_`), nhắc tutor |
| Archive.gs | Archive + dựng lại lịch tháng |
| Setup.gs | Menu, `createAllTriggers`, `heartbeat` (trigger 10 phút), huỷ booking (onEdit, nhiều dòng), bộ test trên Sheets |

## 3. 17 nguyên tắc không được phá

1. **Cột G BOOKINGS luôn là midnight** `new Date(y,m,d)`. COUNTIFS so sánh tuyệt đối.
2. **Ngày hiển thị/sort dùng `makeNoon_`** để không lùi 1 ngày khi lệch timezone.
3. **JS month bắt đầu từ 0.** `new Date(2026, 8, 1)` là 1/9.
4. **Timezone project = Asia/Ho_Chi_Minh** (appsscript.json).
5. **Thứ tự câu hỏi form đặt lịch** = Họ và tên, Student ID, Thứ 2…Chủ nhật. FormLink ép, đừng sửa tay.
6. **`ACTIVE_WEEK_START` trong Script Properties** là tuần active duy nhất. Đổi tuần chỉ qua `setActiveWeekStart_`.
7. **Cần "bây giờ" thì dùng `getNow_()`**, không `new Date()` (để giả lập được).
8. **CHECK_SLOT là cache.** Quyết định đặt slot nằm ở `assignTutor_`.
9. **Gọi `clearCache_()`** đầu mỗi lần chạy.
10. **Không xoá tab tutor / dòng BOOKINGS cũ.** Payroll và archive cần lịch sử.
11. **Mọi handler trigger form phải qua `normalizeFormEvent_()`.** Không đọc thẳng `e.values`; loại trigger có thể đổi.
12. **Không `return` im lặng khi thiếu dữ liệu bắt buộc.** Phải `throw` để admin được báo.
13. **"Completed" trong Executions không có nghĩa booking đã ghi.** Luôn kiểm chứng bằng BOOKINGS.
14. **Entry point ghi dữ liệu chạy trong `withScriptLock_`.** Trigger và lệnh menu. Hàm gọi lồng không cần tự khoá.
15. **Dữ liệu người dùng nhập vào HTML email phải qua `esc_()`.** Tên, email, tên gói.
16. **Gửi mail bằng `sendMail_()`**, không `MailApp.sendEmail` trực tiếp (trừ `notifyAdminError_`). Cuối entry point gọi `flushMailErrors_()`.
17. **Công thức STUDENT_INFO chỉ tạo qua `ensureStudentFormulas_`.** Vùng mở `$D$2:$D`, không `$D$2000`.

## 4. Chạy test

Cần Node.js 18 trở lên. Không cần cài package nào.

```bash
npm test                 # cả 3 bộ
npm run test:booking     # test/harness.js: 110 kiểm tra nghiệp vụ (DB viết tay, từng kịch bản)
npm run test:formlink    # test/formlink.test.js: 42 kiểm tra FormLink
npm run test:e2e         # test/e2e.test.js: 70 kiểm tra đầu-cuối trên ĐÚNG 3 file XLSX mẫu
```

GitHub Actions tự chạy `npm test` mỗi lần push / mở pull request (`.github/workflows/test.yml`).

**Harness làm gì:** dựng bản giả của SpreadsheetApp, FormApp, CalendarApp, MailApp, PropertiesService, LockService rồi nạp các file trong `src/` để chạy thật. Không đụng dữ liệu thật, không tốn quota Google.

**Giới hạn:** harness chỉ đúng khi bản giả giống thật. Bug v6.0.1 lọt qua vì harness cũ chỉ giả lập trigger Spreadsheet. Bug #1, #2 của v6.1.0 lọt qua vì harness cũ tự tính SessionsUsed cho **mọi** dòng STUDENT_INFO, kể cả dòng không có công thức. Giờ chỉ ô có công thức (map `FORMULAS`) mới được tính. Sau mỗi lần deploy vẫn phải submit form thật một lần.

**Test đầu-cuối (`e2e.test.js` + `gas-mock.js`):** nạp 3 spreadsheet từ `test/fixtures/templates.json` (xuất từ `templates/*.xlsx`), đồng hồ giả múi giờ Việt Nam, rồi đi hết vòng đời như người thật: menu Khởi tạo → tạo form → trigger → đăng ký → kích hoạt → tutor đánh x → HV submit form (dropdown từ chối slot không còn, như Google Forms) → huỷ bằng onEdit → điểm danh → nhắc tutor → chuyển tuần → sang tháng → payroll. Trigger chỉ chạy nếu đã được cài. Mock gặp công thức lạ thì ném lỗi thay vì đoán.

**Sửa template:** sửa `tools/create_xlsx.py` (không sửa tay file XLSX) → `npm run templates` → commit cả `templates/` và `test/fixtures/templates.json`. CI so fixture với cả file XLSX lẫn generator; lệch là đỏ.

**Tiêm lỗi:** `MAIL_FAIL_TO.add(email)` làm MailApp ném lỗi khi gửi tới email đó; `CAL_FAIL = n` làm Calendar lỗi n lần tiếp theo.

**Thêm test:** mỗi bug sửa phải kèm ít nhất 1 `check(...)` trong `test/harness.js` tái hiện đúng bug đó (test phải FAIL trên code cũ, PASS trên code mới).

## 5. Deploy bằng clasp (tuỳ chọn)

```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.example .clasp.json   # điền scriptId: Apps Script → Project Settings → Script ID
npm run push                          # đẩy src/ lên Apps Script
```

`.clasp.json` đã nằm trong `.gitignore`. Không deploy bằng clasp thì copy tay từng file trong `src/` vào trình soạn Apps Script.

## 6. Bảo mật khi dùng GitHub

* `src/Config.gs` trên GitHub **chỉ chứa giá trị mẫu**. Giá trị thật (email admin, ID spreadsheet, số tài khoản) chỉ điền trong Apps Script, **không commit**.
* Không đưa file xlsx có dữ liệu học viên thật lên repo. `templates/` chỉ chứa dữ liệu mẫu.
* Repo nên để **Private**. Mời coder bằng Settings → Collaborators, gỡ quyền khi xong việc.
