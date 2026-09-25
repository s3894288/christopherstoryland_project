# thaiput Booking System v6.0 FINAL — Tài Liệu Tổng Hợp

*Build 19/09/2026 · 50/50 test hệ thống PASS · 42/42 test FormLink PASS · 12 file .gs, 140 hàm, 0 trùng tên*

---

## Mục lục

1. Kết quả audit — 9 bug tìm thấy và cách sửa
2. Kiến trúc 3 spreadsheet
3. Bộ file giao (12 .gs + manifest + 3 XLSX + 2 harness)
4. Cấu trúc tab
5. Triển khai từ đầu (10 bước)
6. Vận hành hàng ngày
7. 8 trigger
8. Test (T0 → T11) và harness
9. Lịch sử phiên bản v1.0 → v6.0
10. Nguyên tắc kỹ thuật không được phá
11. Hạn chế còn lại và tư vấn thẳng
12. Troubleshooting

---

## 1. Kết quả audit

Tôi rà toàn bộ code v5.1 + v5.2 với câu hỏi: *"Cái gì chạy được trong harness nhưng sẽ chết trên Google Sheets thật?"* Kết quả: 9 bug, trong đó 3 nghiêm trọng, 2 bị chính harness cũ che giấu.

| # | Mức | Bug | Hậu quả thực tế | Vì sao lọt | Sửa ở |
|---|---|---|---|---|---|
| 1 | **NGHIÊM TRỌNG** | `createAllTriggers()` được tài liệu bảo chạy nhưng **không tồn tại** trong code | Không trigger nào chạy: không sync 10 phút, không điểm danh, không rollover tuần, không archive tháng. Hệ thống chỉ hoạt động khi admin bấm tay | Chưa bao giờ deploy thật | Setup.gs |
| 2 | **NGHIÊM TRỌNG** | Sau booking/huỷ chỉ gọi `updateFormOptions()`, không gọi `syncCheckSlotValues()` | CHECK_SLOT (giá trị từ v5.1) cũ tới 10 phút. Dropdown form hiện slot đã đầy, HV thứ 4 đặt vào slot 3 chỗ → bị từ chối với lý do sai | Harness cũ: `flush()` tự tính lại CHECK_SLOT như công thức. Google Sheets thật không làm vậy với giá trị | FormUpdater.gs |
| 3 | **NGHIÊM TRỌNG** | `rebuildCalendarBody_` xoá trắng tab rồi ghi lại ngày trống | Ngày 1 hàng tháng, mọi "x" tutor đã đánh cho tuần đầu tháng mới **mất sạch**. Tutor phải điền lại, không ai báo | Test archive chỉ kiểm tra archive tab tồn tại, không kiểm tra dữ liệu sau rebuild | Archive.gs |
| 4 | CAO | Huỷ booking không xoá event Calendar (không lưu EventID) | HV và tutor vẫn thấy buổi học trên lịch Google sau khi huỷ | Tài liệu v5.0 ghi "Xoá Calendar event" nhưng code không làm | Config, Main, MeetIntegration, Setup |
| 5 | CAO | Không chặn đặt slot đã qua | Thứ 4 vẫn đặt được thứ 2 tuần này → trừ quota, tạo Meet cho buổi đã qua, điểm danh 00:30 đánh Completed | Chưa ai nghĩ tới | Helpers, Main, FormUpdater |
| 6 | TRUNG BÌNH | `weeklyRollover` tính "thứ 2 kế tiếp" từ ngày chạy | Trigger Google lệch ±15 phút. Chạy 00:05 thứ 2 thay vì 23:00 CN → nhảy **2 tuần** | Trigger chưa từng chạy thật (bug #1) | WeeklyMaintenance.gs |
| 7 | TRUNG BÌNH | Test T3–T7 dùng email không có trong STUDENT_INFO demo | Chạy test trên sheet thật → toàn bộ Failed UNKNOWN_STUDENT | Harness có DB riêng nên không thấy | Setup.gs (T0) |
| 8 | TRUNG BÌNH | `testSystem` kiểm tra PACKAGES, TUTOR_INFO trong Main | Setup 3 file luôn báo lỗi thiếu tab dù đúng | Viết trước khi tách file | Setup.gs |
| 9 | THẤP | Round Robin đếm booking trọn đời | Tutor mới nhận 100% booking cho tới khi bắt kịp tutor cũ. Tutor nghỉ 1 tháng về bị "ưu tiên" ngược | Ghi nhận từ v4 nhưng chưa sửa | Helpers.gs |

Ngoài ra, sửa 4 điểm không phải bug nhưng kém:
- `generatePayrollReport` chỉ log, không ghi vào tab PAYROLL_REPORT dù tab có sẵn header → giờ ghi bảng thật.
- "Test sandbox" (`createTestSandbox`) tạo tab `_TEST_` nhưng test vẫn ghi vào BOOKINGS thật → bỏ hẳn, thay bằng T0 seed + `resetBookings` dọn. Trung thực hơn.
- Mỗi booking đọc 4 tab tutor × số slot lần (28 lần đọc external spreadsheet cho 7 slot) → cache trong 1 lần chạy, còn 4 lần.
- Form đăng ký chỉ tạo cột A–D, admin không biết gõ "Đã thanh toán" vào đâu → FormLink tự thêm header E–I + dropdown cột E.

### Bài học cho harness

Harness v6.0 **không** tự tính lại CHECK_SLOT trong `flush()`. Chỉ mô phỏng công thức COUNTIFS của STUDENT_INFO (thứ thật sự là công thức). Bug #2 và #3 giờ có test riêng (T3, T8, T15) và sẽ FAIL nếu ai đó phá lại.

---

## 2. Kiến trúc 3 spreadsheet

```
┌──────────────────────────────────────┐
│  THAIPUT_REGISTRATION                │
│  PACKAGES · STUDENT_REGISTRATION     │◄── Form Đăng ký HV (A–D form ghi, E–I script/admin)
└─────────────────┬────────────────────┘
                  │ syncRegistrations()  [menu Học viên → Kích hoạt]
                  ▼
┌──────────────────────────────────────┐
│  THAIPUT_MAIN  (chứa Apps Script)    │
│  DASHBOARD · STUDENT_INFO            │
│  CHECK_SLOT (giá trị) · BOOKINGS 14  │◄── Form Đặt lịch
│  ĐĂNG KÝ MỚI · PAYROLL · HUONG_DAN   │
└─────────────────▲────────────────────┘
                  │ syncCheckSlotValues()  [mỗi 10 phút + sau booking/huỷ/rollover]
                  │ archiveMonth()         [ngày 1 hàng tháng]
┌─────────────────┴────────────────────┐
│  THAIPUT_TUTOR                       │
│  TUTOR_INFO · Tutor-Vân/Ánh/Lan/Minh │◄── Tutor tự đánh "x"
│  _ARCHIVE_Tutor-*_YYYY_MM (ẩn)       │
└──────────────────────────────────────┘
```

**Nguyên tắc:** Main là nơi duy nhất có script và LockService. Registration và Tutor chỉ bị script **đọc** (trừ archive/rebuild ghi vào Tutor). Tutor sửa lịch trực tiếp không đụng script → không xung đột.

**Fallback:** `TUTOR_SS_ID` / `REGISTRATION_SS_ID` trống → script dùng tab trong Main. Muốn gom 1 file vẫn chạy.

---

## 3. Bộ file giao

### 12 file Apps Script (dán vào project của MAIN)

| File | So với v5.2 | Thay đổi chính |
|---|---|---|
| Config.gs | SỬA | `EVENT_ID:14`, `BOOKING_NUM_COLS:14`, `PAST_SLOT`, `MIN_LEAD_MINUTES:60`, `ROUND_ROBIN_SCOPE:'week'`, `DASHBOARD_CELLS`, bỏ TEST_PREFIX |
| Helpers.gs | SỬA | `getNow_()` (giả lập được), cache tutor/availability, `isSlotBookable_`, RR theo tuần, `getMondayOfWeek_` |
| Main.gs | SỬA | Chặn PAST_SLOT trước quota; lưu EventID cột N; `assignTutor_` trước, CHECK_SLOT chỉ để chọn thông điệp lỗi |
| MeetIntegration.gs | SỬA | `createMeetEvent_` trả `{link,eventId}`; `deleteMeetEvent_`; welcome đọc form ID từ Properties |
| Attendance.gs | SỬA | Payroll ghi bảng thật vào tab; `generatePayrollLastMonth`; `getNow_` |
| Archive.gs | SỬA | Rebuild **giữ** dòng ≥ đầu tháng kèm "x"; archive tab tự ẩn; xoá cache sau rebuild |
| WeeklyMaintenance.gs | SỬA | Rollover tính thứ 2 của tuần chứa (now+12h); không lùi tuần; báo admin khi archive lỗi |
| FormUpdater.gs | SỬA | `updateFormOptions` = sync → dashboard → form; ẩn slot đã qua/quá sát; `updateDashboardStats_` |
| FormLink.gs | SỬA | Thêm `ensureResponseSheetHeaders_` (header E–I + dropdown), `writeFormLinksToDashboard_` |
| Setup.gs | VIẾT LẠI | `createAllTriggers` (mới), `cancelBookingRow_` xoá Calendar, `testSystem` 3 file + timezone, T0 seed, T11 past slot, `testSimulateNow`, bỏ sandbox |
| Quota.gs | GIỮ | — |
| Registration.gs | GIỮ | — |

### Manifest
`appsscript.json` — timezone HCM, Calendar advanced service, scopes. Dán qua Project Settings → "Show appsscript.json".

### 3 XLSX
`THAIPUT_MAIN_v6.0.xlsx` (7 tab, BOOKINGS 14 cột) · `THAIPUT_REGISTRATION_v6.0.xlsx` (2 tab) · `THAIPUT_TUTOR_v6.0.xlsx` (5 tab, dữ liệu tháng 8/2026 + tuần đầu tháng 9 để test archive)

### Harness
`harness.js` (50 assertions, mock 3 spreadsheet, Calendar lifecycle) · `formlink_test.js` (42 assertions) · `create_xlsx.py`

---

## 4. Cấu trúc tab

### BOOKINGS (Main) — 14 cột

| Cột | Tên | Ghi chú |
|---|---|---|
| A | BookingID | `BK` + yyMMddHHmmss + 3 số ngẫu nhiên |
| B | StudentID | tra ngược từ email |
| C | StudentName | |
| D | StudentEmail | **khoá chính** cho quota (COUNTIFS trong STUDENT_INFO) |
| E | TutorID | Round Robin theo tuần |
| F | TutorName | |
| G | Date | **midnight** `new Date(y,m,d)` — bắt buộc cho COUNTIFS |
| H | TimeSlot | `"HH:mm - HH:mm"` |
| I | MeetLink | |
| J | Status | Active / Completed / NoShow / Cancelled / Failed — admin đổi thành Cancelled để huỷ |
| K | CreatedAt | |
| L | FailReason | 6 lý do trong `CONFIG.FAIL_REASONS`, hoặc ghi chú huỷ |
| M | AttendanceMarkedAt | |
| N | **EventID** | id event Calendar, dùng để xoá khi huỷ |

### STUDENT_INFO (Main)
`StudentID · Email · Họ và tên · Gói · TotalSessions · SessionsUsed (công thức) · SessionsRemaining (công thức) · Ngày kích hoạt · Trạng thái · Ghi chú`
SessionsUsed = COUNTIFS(BOOKINGS D=email, J ∈ {Active, Completed, NoShow}). Cancelled/Failed không tính → huỷ tự hoàn.

### CHECK_SLOT (Main)
`Ngày · Thứ · 14 khung giờ`. **Giá trị**, không phải công thức. `= tutor có "x" − booking đang chiếm`. Đồng bộ bởi script. Đây là cache; nguồn sự thật là `assignTutor_` đọc trực tiếp tutor + BOOKINGS.

### STUDENT_REGISTRATION (Registration)
A–D do form ghi (`Timestamp · Email · Họ và tên · Gói`). E–I do FormLink tạo header, admin/script điền (`Trạng thái TT · StudentID · Số buổi · Học phí · Synced`). Cột E có dropdown.

### Tutor-* (Tutor)
`Ngày · Thứ · 14 khung giờ`. Tutor gõ `x` vào ô rảnh. Không gõ gì khác. Không xoá cột. Không đổi tên tab.

### DASHBOARD (Main)
B11–B14: link + ID 2 form (script ghi). B17–B21: tuần active, bookings tuần này, tutor active, lần sync cuối, cảnh báo giả lập thời gian (script ghi mỗi 10 phút).

---

## 5. Triển khai từ đầu

1. Upload 3 XLSX lên Google Drive → mở từng file → File → Save as Google Sheets. Có thể xoá bản .xlsx sau.
2. Copy Spreadsheet ID của **REGISTRATION** và **TUTOR**: đoạn giữa `/d/` và `/edit` trên URL.
3. Mở **MAIN** → Extensions → Apps Script. Xoá `Code.gs`. Tạo 12 file, dán từng file `.gs` (tên file không cần đuôi).
4. Project Settings (bánh răng) → Time zone → **(GMT+07:00) Ho Chi Minh**. Bật "Show appsscript.json manifest" → quay lại editor → dán nội dung `appsscript.json`.
5. Nếu manifest không tự bật Calendar: Services (+) → Google Calendar API → Add.
6. `Config.gs`: điền `ADMIN_EMAIL`, `TUTOR_SS_ID`, `REGISTRATION_SS_ID`. Lưu (Ctrl+S).
7. Reload tab Google Sheets của MAIN → menu **thaiput** xuất hiện → **1. Kiểm tra hệ thống** → lần đầu sẽ hỏi quyền, chấp nhận hết → chạy lại → xem log (Extensions → Apps Script → Executions) phải **0 lỗi**.
8. Menu → **2. Tạo 2 Form mới + kết nối**. Xong: tab `ĐĂNG KÝ MỚI` và `STUDENT_REGISTRATION` đã nối form, dropdown đã nạp, link ghi DASHBOARD B11–B12.
9. Menu → **3. Tạo/cập nhật 8 trigger**. Log phải ghi `8/8 trigger`.
10. Menu → **Form → Kiểm tra kết nối Form** → `0 vấn đề`. Chạy **Test → Chạy tất cả**, xem log, rồi **Test → Dọn dữ liệu test**.

Go live: chia link form đăng ký (DASHBOARD B12) cho HV mới, link form đặt lịch (B11) cho HV đã kích hoạt. Tutor nhận link Tutor spreadsheet, chỉ cần quyền Editor trên file đó.

---

## 6. Vận hành hàng ngày

### Admin

| Việc | Làm gì |
|---|---|
| HV mới chuyển khoản | Mở REGISTRATION → cột E dòng đó chọn "Đã thanh toán" → Main menu **Học viên → Kích hoạt**. HV nhận email welcome kèm link đặt lịch |
| HV nạp thêm gói | HV điền lại form đăng ký. Đánh "Đã thanh toán" → Kích hoạt. Script cộng dồn TotalSessions, reset cờ cảnh báo |
| Huỷ buổi | BOOKINGS cột J → chọn **Cancelled**. Tự động: hoàn buổi, xoá lịch Calendar, email HV + tutor, cập nhật dropdown |
| HV vắng không báo | Menu **Điểm danh → Đánh NoShow** khi đang chọn dòng đó. Vẫn trừ buổi, vẫn tính lương tutor |
| Lương tháng | Menu **Báo cáo → Payroll tháng trước** → xem tab PAYROLL_REPORT |
| Thêm tutor | TUTOR spreadsheet: thêm dòng TUTOR_INFO (Status = Active) + tạo tab `Tutor-<Tên>` (copy tab có sẵn, xoá "x"). Menu **Lịch → Đảm bảo đủ ngày tuần active** |
| Tạm dừng tutor | TUTOR_INFO Status ≠ Active. Không xoá tab (lịch sử payroll cần) |
| Form hỏng | Menu **Form → Kết nối lại tất cả Form** (an toàn chạy nhiều lần) hoặc **2. Tạo 2 Form mới** |

### Tutor
Chủ nhật 06:00 nhận email nhắc. Mở tab của mình trong TUTOR spreadsheet, gõ `x` vào ô rảnh tuần tới, hạn 12:00 trưa CN. Không cần làm gì khác. Booking mới đến qua email kèm link Meet.

### Học viên
Điền form đăng ký → chuyển khoản → nhận email kích hoạt → mở link đặt lịch (dropdown chỉ hiện slot còn chỗ và chưa qua giờ) → nhận email xác nhận + Meet.

---

## 7. 8 trigger (tạo bởi menu 3, chạy lại bao nhiêu lần cũng an toàn)

| # | Handler | Loại | Lịch | Việc |
|---|---|---|---|---|
| 1 | `onRegistrationSubmit` | Form submit | khi HV đăng ký | Quét STUDENT_REGISTRATION, kích hoạt dòng "Đã thanh toán" chưa Synced |
| 2 | `onFormSubmitTrigger` | Form submit | khi HV đặt lịch | `processBooking_` |
| 3 | `updateFormOptions` | Time | mỗi 10 phút | sync CHECK_SLOT → dashboard → dropdown form |
| 4 | `markCompletedSessions` | Time | 00:30 hàng ngày | Active đã qua giờ → Completed |
| 5 | `weeklyRollover` | Time | CN 23:00 | tuần active → thứ 2 tới, thêm dòng, sync |
| 6 | `sundayReminderTutors` | Time | CN 06:00 | email nhắc tutor điền lịch |
| 7 | `monthlyRollover` | Time | ngày 1, 01:00 | archive tháng trước → rebuild tháng này (giữ "x") |
| 8 | `onEditTrigger` | On edit (installable) | khi sửa ô | cột J → Cancelled ⇒ `cancelBookingRow_` |

Trigger 3 là "nhịp tim" của hệ thống: DASHBOARD B20 (lần sync cuối) không nhảy quá 10 phút là hệ thống đang sống.

---

## 8. Test

### Trên Google Sheets (menu Test)

| Test | Kịch bản | Kỳ vọng |
|---|---|---|
| T0 | Nạp 7 HV test vào STUDENT_INFO (ghi chú TEST_SEED) | 7 dòng, công thức F/G đúng |
| T1 | Kiểm tra hệ thống | 0 lỗi |
| T2 | Đánh x tuần active cho mọi tutor (19:00, 20:00, 21:00) | CHECK_SLOT có số > 0 |
| T3 | sim@test.com đặt 1 buổi | Active, quota −1, EventID có |
| T4 | 3 HV cùng slot | 3 tutor khác nhau |
| T5 | nocredit@test.com | Failed NO_CREDITS |
| T6 | low@test.com (2 buổi) | Active + email "còn 1 buổi" |
| T7 | bao@test.com (1 buổi) đặt 2 ngày | 1 Active + 1 Failed OVER_BUDGET |
| T8 | Huỷ booking Active | quota +1, Calendar event xoá, email |
| T9 | Điểm danh | Completed → NoShow |
| T10 | Archive 8/2026 → rebuild 9/2026 | `_ARCHIVE_*_2026_08` xuất hiện, "x" tháng 9 không mất |
| T11 | Đặt slot đã qua | Failed PAST_SLOT, quota không đổi |

Giả lập thời gian: Script editor → chạy `testSimulateNow('2026-09-22 18:30')`. Mọi hàm dùng `getNow_()` thấy giờ này. DASHBOARD B21 hiện cảnh báo đỏ. Xong chạy `clearSimulatedNow()` (hoặc Dọn dữ liệu test). `testSystem` cũng cảnh báo nếu còn bật.

### Harness (máy local, `node harness.js`)
50 assertions, không cần Google. Bao gồm regression cho bug #2 (T3, T8), #3 (T15), #5 (T13), #6 (T17), #9 (T14). `node formlink_test.js` 42 assertions cho cơ chế form.

---

## 9. Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| v1.0 | 08/2026 | Prototype: form → sheet → tutor thủ công |
| v2.0 | 08/2026 | Production: Google Meet, email xác nhận, Round Robin |
| v2.1 | 08/2026 | `PropertiesService.ACTIVE_WEEK_START` làm nguồn sự thật tuần; `setupMonthCalendar`; scanner 7 ngày |
| v2.1 hotfix | 08/2026 | 3 bug ngày tháng: JS month zero indexed, midnight shift theo timezone, COUNTIFS lệch vì cột G có giờ |
| v3.0 | 08/2026 | Gộp toàn bộ fix, ổn định |
| v4.0 | 09/2026 | Quota theo StudentID, BOOKINGS 12 cột, 7 bug fix (tuần vắt tháng, dòng ghi chú phá sort…) |
| v5.0 | 18/09/2026 | Registration pipeline, quota theo **email**, điểm danh Active→Completed→NoShow, archive tháng, payroll, BOOKINGS 13 cột. 25/25 test |
| v5.1 | 18/09/2026 | **Tách 3 spreadsheet** (Main / Registration / Tutor). CHECK_SLOT chuyển từ công thức sang giá trị đồng bộ. Dữ liệu tháng 8 để test archive. 27/27 test |
| v5.2 | 19/09/2026 | **FormLink.gs**: nối form bất kỳ vào hệ thống, nhận diện tab response bằng sheetId, ép thứ tự câu hỏi, dựng lại trigger, form ID vào Script Properties. 39/39 test |
| **v6.0 FINAL** | 19/09/2026 | **Audit + sửa 9 bug** (mục 1). BOOKINGS 14 cột (EventID). Chặn slot đã qua. RR theo tuần. Rollover chống trễ. Rebuild giữ "x". Payroll ghi tab. `createAllTriggers` ra đời. Giả lập thời gian. Harness trung thực. 50/50 + 42/42 test |

---

## 10. Nguyên tắc kỹ thuật không được phá

1. **Cột G BOOKINGS luôn là `new Date(y,m,d)` midnight.** COUNTIFS so sánh serial number tuyệt đối; 12:00 vs 00:00 là 2 giá trị khác nhau → quota về 0.
2. **Ngày hiển thị/sort dùng `makeNoon_`** (12:00) để không lùi 1 ngày khi timezone lệch.
3. **JS month zero indexed.** `new Date(2026, 8, 1)` là 1 tháng **9**.
4. **Timezone project = Asia/Ho_Chi_Minh.** `testSystem` kiểm tra. Sai cái này thì mọi thứ lệch 7 giờ mà không báo lỗi.
5. **Thứ tự câu hỏi form đặt lịch** = Họ và tên, Student ID, Thứ 2…Chủ nhật. `processBooking_` đọc `e.values[2..10]`. FormLink ép; đừng sửa tay thứ tự trên form.
6. **`PropertiesService.ACTIVE_WEEK_START`** là tuần active duy nhất. Không tính lại từ `new Date()` ở chỗ khác.
7. **Mọi hàm cần "bây giờ" dùng `getNow_()`**, không `new Date()`, để giả lập thời gian và test được.
8. **CHECK_SLOT là cache.** Quyết định đặt/không đặt nằm ở `assignTutor_` đọc trực tiếp tutor + BOOKINGS.
9. **Gọi `clearCache_()`** đầu mỗi lần chạy có thay đổi tutor/availability (trigger đã làm; test thủ công cũng phải làm).
10. **Không xoá tab tutor / dòng BOOKINGS cũ.** Payroll và archive cần lịch sử. Tutor nghỉ → Status ≠ Active.

---

## 11. Hạn chế còn lại và tư vấn thẳng

**Những gì tôi không sửa vì vượt quá Google Sheets, anh cần biết:**

1. **Race condition 10 phút trên dropdown form.** Dropdown chỉ cập nhật khi script chạy. Hai HV cùng thấy slot cuối, cùng bấm → HV sau nhận email "hết chỗ". Không có cách nào khác với Google Forms; muốn hết hẳn phải chuyển sang web app (Apps Script HTML Service hoặc app riêng) đọc slot real time. Với quy mô 4 tutor thì chấp nhận được.
2. **`setCollectEmail(true)` yêu cầu HV đăng nhập Google.** HV không có tài khoản Google không dùng được form. Nếu gặp, đổi sang câu hỏi text "Email" ở vị trí đầu — nhưng khi đó `e.values[1]` vẫn là email nên code không đổi, chỉ mất xác thực (HV có thể gõ email người khác).
3. **Calendar event tạo trên lịch của tài khoản chạy script.** Admin đổi tài khoản → event cũ không xoá được từ tài khoản mới. Dùng 1 tài khoản Workspace riêng cho hệ thống (ví dụ `booking@thaiput.com`), không dùng tài khoản cá nhân.
4. **Quota email MailApp**: Workspace 1.500/ngày. Mỗi booking gửi 2–3 email. 100 booking/ngày mới chạm. OK.
5. **Tutor có thể gõ nhầm.** "X" hoa được chấp nhận (lowercase), "×" hay "x " có khoảng trắng: trim + lowercase xử lý. Gõ vào cột A/B thì phá dòng. Nên khoá cột A–B của tab tutor bằng Protect range.
6. **STUDENT_INFO công thức COUNTIFS quét 2000 dòng BOOKINGS.** Sau ~1 năm với 4 tutor (~5.000 booking) sẽ chậm. Khi BOOKINGS quá 1.500 dòng: archive dòng cũ hơn 6 tháng sang tab `_ARCHIVE_BOOKINGS` và nới `$2000` lên. Chưa cần ngay.
7. **Không có backup tự động.** Google Sheets có version history 30 ngày. Đủ cho tai nạn thường; nếu muốn hơn, tạo trigger tuần copy 3 file sang folder Backup (`DriveApp.getFileById(id).makeCopy()`), 10 dòng code, tôi có thể thêm.
8. **Round Robin "tuần" reset mỗi thứ 2.** Tutor bận thứ 2–3 sẽ hơi thiệt về lượng booking tuần đó so với tutor rảnh cả tuần. Đây là tính năng, không phải bug: HV đặt theo slot tutor mở, không thể ép cân bằng tuyệt đối.

**Tư vấn:** Hệ thống này đủ tốt cho 4–10 tutor, vài trăm HV. Vượt quá đó, điểm nghẽn là Google Forms (không real time) và Google Sheets (không có transaction thật). Lúc đó không vá nữa mà chuyển sang web app + database; logic nghiệp vụ trong 12 file này (quota, RR, điểm danh, archive) port sang được nguyên vẹn vì đã tách khỏi UI.

---

## 12. Troubleshooting

| Hiện tượng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| Menu thaiput không hiện | Chưa reload sheet sau khi dán code, hoặc lỗi cú pháp ở 1 file | Reload. Apps Script → chạy `testSystem` tay xem báo lỗi file nào |
| `testSystem` báo timezone sai | Project Settings chưa đặt | Project Settings → Time zone → Ho Chi Minh |
| Booking không tự xử lý | Trigger chưa tạo hoặc form đổi | Menu 3. Tạo/cập nhật 8 trigger → Form → Kiểm tra kết nối |
| Dropdown trống | Tutor chưa đánh "x" tuần active, hoặc tuần active lệch | TUTOR sheet kiểm tra; DASHBOARD B17 xem tuần active; menu Lịch → Chuyển tuần nếu cần |
| Booking xử lý 2 lần | Trigger trùng | Menu Form → Kiểm tra (báo số trigger) → Kết nối lại |
| Quota sai / không hoàn khi huỷ | Cột G có giờ (gõ tay) hoặc là text | Xoá dòng gõ tay. Chỉ script được ghi BOOKINGS; admin chỉ sửa cột J |
| "x" tutor biến mất ngày 1 | Đang chạy Archive.gs cũ (< v6.0) | Dán lại Archive.gs v6.0; lấy lại từ `_ARCHIVE_Tutor-*` |
| Email đặt lịch có link Meet nhưng lịch Calendar không có | Calendar API chưa bật hoặc chưa cấp quyền | Services → Calendar; chạy `testSystem` để cấp quyền lại |
| Huỷ nhưng lịch Calendar còn | Booking tạo trước v6.0 (không có EventID) | Xoá tay trên Calendar 1 lần; booking mới tự xoá |
| DASHBOARD B21 cảnh báo đỏ | Giả lập thời gian đang bật | Menu Test → Tắt giả lập thời gian |
| Response form vào tab "Form Responses 1" | Form nối trước khi có FormLink | Menu Form → Kết nối lại tất cả Form |

---

*Hết. Hệ thống ở trạng thái sẵn sàng go live sau khi qua 10 bước mục 5 với `testSystem` 0 lỗi.*
