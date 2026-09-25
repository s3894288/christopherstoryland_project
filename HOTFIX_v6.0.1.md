# thaiput v6.0.1 HOTFIX: Phản hồi form đặt lịch bị bỏ qua im lặng

Ngày: 24/09/2026 · Áp dụng cho: v6.0 FINAL

## 1. Chuyện gì đã xảy ra

| Giờ | Execution | Type | Ý nghĩa thật |
|---|---|---|---|
| 16:14:36 | onFormSubmitTrigger | Trigger | Học viên submit. Báo **Completed** nhưng **không ghi booking** |
| 16:28:28 | onFormSubmitTrigger | Trigger | Học viên submit. Báo **Completed** nhưng **không ghi booking** |
| 16:29:25 | onFormSubmitTrigger | Editor | Có người bấm Run tay → email lỗi `reading 'values'` |

Email lỗi chỉ là **triệu chứng phụ**. Lỗi thật nằm ở 2 lần chạy báo "Completed".

## 2. Nguyên nhân gốc

`FormLink.gs` tạo trigger kiểu **"From form, On form submit"**. Loại trigger này chỉ gửi `e.response`, không gửi `e.values` hay `e.namedValues`.

`processBooking_` v6.0 chỉ đọc `e.values` / `e.namedValues`, nên không thấy email, ghi log "Thiếu email" rồi **thoát êm**. Apps Script vẫn báo Completed, admin không nhận cảnh báo, học viên không có lịch.

Harness v6.0 không bắt được lỗi này vì mọi test đều giả lập event dạng `{values: [...]}` (dạng của trigger Spreadsheet).

## 3. Sửa gì

| File | Thay đổi |
|---|---|
| **Main.gs** | `normalizeFormEvent_()` đọc được cả 3 dạng event: trigger Spreadsheet (`e.values`), trigger Form (`e.response`), và `e` rỗng khi chạy tay |
| | Thiếu email giờ **ném lỗi** → admin nhận email. Không còn nuốt phản hồi im lặng |
| | Chạy tay `onFormSubmitTrigger` → bỏ qua, ghi log hướng dẫn, không gửi email lỗi giả |
| | Mới: `recoverMissedBookings()` quét phản hồi 72 giờ gần nhất, xử lý lại phản hồi chưa có trong BOOKINGS |
| **Helpers.gs** | `setActiveWeekStart_` ghi thêm `ACTIVE_WEEK_SET_AT` (lúc đổi tuần) để recover không đặt nhầm phản hồi tuần cũ sang tuần mới |
| **Setup.gs** | Menu **thaiput → Form → Xử lý lại phản hồi bị sót (72 giờ)** |
| **harness.js** | Thêm T20 (8 assertion) cho trigger Form, `e` rỗng, recover. Sửa T15 bị lệch khi tuần active lấn sang tháng sau. **62/62 PASS** |

Không đổi: FormLink.gs (giữ trigger "From form", Main.gs giờ đọc được), Registration.gs (`onRegistrationSubmit` không đọc `e`, chạy tay vẫn đúng), các file còn lại.

## 4. Cách recover phân biệt phản hồi đã xử lý

Một phản hồi được coi là **đã xử lý** khi **mọi slot** nó chọn đều đã có dòng BOOKINGS cùng email, cùng ngày, cùng khung giờ, tạo sau lúc submit (Active hay Failed đều tính).

Hệ quả:
* Chạy recover nhiều lần không tạo booking trùng
* 2 lần submit sót của cùng 1 học viên đều được cứu
* Phản hồi submit trước lúc đổi tuần active bị bỏ qua (báo trong mục "Thuộc tuần trước")

## 5. Triển khai (5 phút)

1. Apps Script: thay toàn bộ nội dung **Main.gs**, **Helpers.gs**, **Setup.gs** bằng bản v6.0.1. Lưu.
2. Reload Google Sheet MAIN để menu mới xuất hiện.
3. Menu **thaiput → Form → Xử lý lại phản hồi bị sót (72 giờ)**. Lần đầu sẽ hỏi cấp quyền Forms, bấm cho phép.
4. Đọc hộp thoại kết quả: phải thấy **"Đã xử lý lại: 2"** (hoặc số học viên đã submit từ khi deploy v6.0). Kiểm tra BOOKINGS và email học viên.
5. Test thật: submit form đặt lịch bằng email học viên test. Trong **Executions**, dòng Type **Trigger** phải kèm 1 dòng mới trong BOOKINGS.

Không cần chạy lại `createAllTriggers()` hay `relinkAllForms()`.

## 6. Quy tắc bổ sung (thêm vào 10 quy tắc kỹ thuật)

**Quy tắc 11.** Mọi handler trigger phải qua `normalizeFormEvent_()`. Không bao giờ đọc trực tiếp `e.values`. Loại trigger (Form hay Spreadsheet) có thể đổi khi kết nối lại form.

**Quy tắc 12.** Không bao giờ `return` im lặng khi thiếu dữ liệu bắt buộc. Thiếu email phải `throw` để admin được báo.

**Quy tắc 13.** "Completed" trong Executions chỉ nghĩa là không có exception, **không** nghĩa là booking đã ghi. Sau mỗi thay đổi liên quan form, kiểm chứng bằng BOOKINGS.
