# thaiput Booking System

![Test](../../actions/workflows/test.yml/badge.svg)

Hệ thống đặt lịch học 1:1 tự động cho **thaiput** chạy trên Google Sheets, Google Forms và Apps Script. Học viên chọn giờ qua form, hệ thống tự kiểm tra số buổi còn lại, xếp tutor theo Round Robin, tạo link Google Meet và gửi email xác nhận.

**Phiên bản:** 6.0.1 (24/09/2026) · **Test:** 62/62 nghiệp vụ, 42/42 FormLink

## Tính năng

* Đăng ký học viên qua form, kích hoạt khi đã thanh toán
* Đặt lịch theo tuần, quota theo email, chặn slot đã qua
* Xếp tutor tự động, cân bằng số buổi trong tuần
* Tự tạo Google Meet, email xác nhận / thất bại / sắp hết buổi
* Huỷ booking → xoá lịch Calendar, hoàn buổi, báo học viên
* Điểm danh Completed / NoShow, bảng lương tutor theo tháng
* Tự chuyển tuần, archive tháng, nhắc lịch tutor Chủ nhật
* Cứu phản hồi form bị sót (v6.0.1)

## Cấu trúc repo

```
src/          12 file .gs + appsscript.json → code chạy trong Apps Script
test/         harness.js, formlink.test.js → kiểm tra code trên máy, không deploy
templates/    3 file xlsx mẫu: MAIN, REGISTRATION, TUTOR
tools/        create_xlsx.py → tạo lại 3 file mẫu
docs/         Tài liệu tổng hợp, hướng dẫn lập trình viên, ghi chú hotfix
.github/      Tự chạy test mỗi lần push, mẫu báo lỗi, mẫu pull request
```

## Bạn dùng repo này để làm gì?

| Mục đích | Bắt đầu từ |
|---|---|
| **Triển khai hệ thống mới** | `docs/TAI_LIEU_TONG_HOP.md` mục 5 (10 bước). Copy file trong `src/`, dựng Sheet từ `templates/` |
| **Cập nhật hệ thống đang chạy** | `CHANGELOG.md` → xem file .gs nào đổi, chỉ thay các file đó |
| **Vận hành hằng ngày (admin)** | `docs/TAI_LIEU_TONG_HOP.md` mục 6 và 12 (troubleshooting) |
| **Thuê coder bảo trì / phát triển** | Mời vào repo, yêu cầu đọc `docs/DEVELOPER_GUIDE.md`. Mọi thay đổi qua pull request, GitHub Actions phải xanh |
| **Báo lỗi / theo dõi việc cần làm** | Tab **Issues** → New issue → mẫu "Báo lỗi" |
| **Sao lưu, xem lại lịch sử code** | Mỗi phiên bản là 1 commit / tag. Tab **Commits** để so sánh |
| **Portfolio / giới thiệu dự án** | README này + `docs/TAI_LIEU_TONG_HOP.md` mục 1 (audit) và 2 (kiến trúc) |

## Chạy test

```bash
npm test
```

Cần Node.js 18 trở lên, không cần cài thêm gì. Chi tiết: `docs/DEVELOPER_GUIDE.md` mục 4.

## Bảo mật

* `src/Config.gs` chỉ chứa **giá trị mẫu**. Điền giá trị thật trong Apps Script, **không commit lên GitHub**.
* Không đưa dữ liệu học viên thật lên repo.
* Nên để repo **Private**.

## Bản quyền

© 2026 thaiput. Mọi quyền được bảo lưu. Không sao chép hoặc sử dụng khi chưa có sự cho phép.
