"""Tạo 3 file XLSX mẫu cho thaiput v6.1.0 (3 spreadsheet, BOOKINGS 14 cột).

Template SẠCH để triển khai thật:
  * Không có ngày cố định. Tab tutor và CHECK_SLOT chỉ có dòng tiêu đề; menu "1. Khởi tạo" dựng lịch
    tháng hiện tại + 2 tuần tới lúc triển khai (template cũ chứa 08/2026 → triển khai tháng khác thì trống).
  * Không có học viên / đăng ký / booking giả. Chỉ có tutor mẫu và gói học mẫu (cấu hình: sửa trước khi dùng).
  * Dòng tiêu đề đóng băng; BOOKINGS cột J có dropdown trạng thái (huỷ = chọn Cancelled, không gõ tay).

Chạy: python3 tools/create_xlsx.py [thư_mục_đích]   (mặc định: templates/)
"""
import openpyxl, os, sys
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

VERSION = '6.1.0'
DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates')
SLOTS = ['17:00 - 17:25','17:30 - 17:55','18:00 - 18:25','18:30 - 18:55',
         '19:00 - 19:25','19:30 - 19:55','20:00 - 20:25','20:30 - 20:55',
         '21:00 - 21:25','21:30 - 21:55','22:00 - 22:25','22:30 - 22:55',
         '23:00 - 23:25','23:30 - 23:55']
STATUSES = ['Active','Completed','NoShow','Cancelled','Failed']
PAYMENT = ['Chưa thanh toán','Đã thanh toán']
hdr_font = Font(bold=True, size=11)
hdr_fill = PatternFill('solid', fgColor='D6E4F0')
note_font = Font(italic=True, size=10, color='666666')

def write_headers(ws, headers, widths=None):
    for c, h in enumerate(headers, 1):
        cell = ws.cell(1, c, h)
        cell.font, cell.fill = hdr_font, hdr_fill
        cell.alignment = Alignment(vertical='center')
        ws.column_dimensions[get_column_letter(c)].width = (widths or {}).get(c, 16)
    ws.freeze_panes = 'A2'

def calendar_grid(ws):
    """Tab tutor / CHECK_SLOT: chỉ tiêu đề. Script dựng dòng ngày (menu 1. Khởi tạo, heartbeat, rollover)."""
    write_headers(ws, ['Ngày','Thứ'] + SLOTS, {1: 12, 2: 10, **{c: 14 for c in range(3, 3 + len(SLOTS))}})
    ws.freeze_panes = 'C2'

def list_validation(ws, rng, values):
    dv = DataValidation(type='list', formula1='"' + ','.join(values) + '"', allow_blank=True, showErrorMessage=True)
    dv.add(rng); ws.add_data_validation(dv)

def guide(ws, lines):
    for i, line in enumerate(lines, 1):
        ws.cell(i, 1, line).font = Font(bold=True, size=14) if i == 1 else (Font(bold=True) if line.isupper() or line.endswith(':') else Font(size=11))
    ws.column_dimensions['A'].width = 110

# ═══════════════════════════════════════
# FILE 1: REGISTRATION
# ═══════════════════════════════════════
def create_registration():
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = 'PACKAGES'
    write_headers(ws, ['Tên gói','Số buổi','Học phí (VND)','Ghi chú'], {1: 18, 3: 16, 4: 30})
    for i, (n, s, p, note) in enumerate([('Gói 12 buổi', 12, 1560000, 'MẪU — sửa theo bảng giá thật'),
                                          ('Gói 24 buổi', 24, 2880000, 'Tiết kiệm 7.5%'),
                                          ('Gói 48 buổi', 48, 5280000, 'Tiết kiệm 15%')], 2):
        ws.cell(i, 1, n); ws.cell(i, 2, s); ws.cell(i, 3, p).number_format = '#,##0'; ws.cell(i, 4, note)

    # Form đăng ký ghi A–D; admin/script ghi E–I. Menu "2. Tạo 2 Form" thay tab này bằng tab response của form
    # (FormLink tự bổ sung tiêu đề E–I + dropdown cột E).
    ws2 = wb.create_sheet('STUDENT_REGISTRATION')
    write_headers(ws2, ['Timestamp','Email','Họ và tên','Gói đăng ký','Trạng thái TT','StudentID','Số buổi','Học phí','Synced'], {1: 20, 2: 26, 3: 22, 9: 40})
    list_validation(ws2, 'E2:E2000', PAYMENT)

    path = os.path.join(DIR, 'THAIPUT_REGISTRATION_v6.1.xlsx'); wb.save(path); print('Created', path)

# ═══════════════════════════════════════
# FILE 2: TUTOR
# ═══════════════════════════════════════
TUTORS = [('T001','Vân','van@thaiput.com','Active',120000,'MẪU — thay bằng tutor thật'),
          ('T002','Ánh','anh@thaiput.com','Active',120000,''),
          ('T003','Lan','lan@thaiput.com','Active',100000,''),
          ('T004','Minh','minh@thaiput.com','Active',100000,'')]

def create_tutor():
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = 'TUTOR_INFO'
    write_headers(ws, ['TutorID','Tên tutor','Email','Status','Đơn giá/buổi (VND)','Ghi chú'], {3: 26, 5: 20, 6: 32})
    for i, (tid, name, email, st, rate, note) in enumerate(TUTORS, 2):
        ws.cell(i, 1, tid); ws.cell(i, 2, name); ws.cell(i, 3, email)
        ws.cell(i, 4, st); ws.cell(i, 5, rate).number_format = '#,##0'; ws.cell(i, 6, note)
    list_validation(ws, 'D2:D200', ['Active','Inactive'])

    for _, name, *_ in TUTORS:
        calendar_grid(wb.create_sheet(f'Tutor-{name}'))

    guide(wb.create_sheet('HUONG_DAN'), [
        'HƯỚNG DẪN CHO TUTOR — thaiput',
        '',
        'MỖI TUẦN:',
        '  Chủ nhật 06:00 bạn nhận email nhắc. Hạn điền: 12:00 trưa Chủ nhật.',
        '  Mở tab Tutor-<tên bạn>, gõ x vào ô khung giờ bạn RẢNH của tuần tới.',
        '  Xoá x = không nhận học viên giờ đó (chỉ áp dụng cho slot chưa có ai đặt).',
        '',
        'KHÔNG ĐƯỢC:',
        '  Gõ gì khác ngoài x · sửa cột Ngày / Thứ · xoá dòng / cột · đổi tên tab.',
        '',
        'ADMIN — THÊM TUTOR:',
        '  1. TUTOR_INFO: thêm dòng (TutorID không trùng, Tên, Email, Status = Active, Đơn giá).',
        '  2. Chuột phải 1 tab Tutor-* → Duplicate → đổi tên thành Tutor-<Tên> (đúng y tên cột B) → xoá hết x.',
        '  3. Tutor nghỉ: Status = Inactive. KHÔNG xoá dòng / tab (payroll cần lịch sử).',
    ])

    path = os.path.join(DIR, 'THAIPUT_TUTOR_v6.1.xlsx'); wb.save(path); print('Created', path)

# ═══════════════════════════════════════
# FILE 3: MAIN
# ═══════════════════════════════════════
def create_main():
    wb = openpyxl.Workbook()

    # ── DASHBOARD ── vị trí ô phải khớp CONFIG.DASHBOARD_CELLS (B11–B14 form, B17–B21 vận hành)
    ws = wb.active; ws.title = 'DASHBOARD'
    ws.merge_cells('A1:F1')
    ws.cell(1, 1, f'thaiput — Booking System v{VERSION}').font = Font(bold=True, size=18)
    ws.cell(2, 1, 'Kiến trúc 3 spreadsheet: Main + Registration + Tutor').font = Font(size=12, color='666666')
    info = [('', ''), ('CẤU HÌNH', ''),
            ('Admin email', '(điền vào Config.gs)'),
            ('Registration Spreadsheet ID', '(điền vào Config.gs)'),
            ('Tutor Spreadsheet ID', '(điền vào Config.gs)'),
            ('', ''), ('LIÊN KẾT (script ghi)', ''),
            ('Form đặt lịch', '(menu 2. Tạo 2 Form)'),
            ('Form đăng ký', '(menu 2. Tạo 2 Form)'),
            ('Booking Form ID', ''), ('Registration Form ID', ''),
            ('', ''), ('VẬN HÀNH (script cập nhật mỗi 10 phút)', ''),
            ('Tuần active', '(chưa chạy)'),
            ('Bookings tuần này', '(chưa chạy)'),
            ('Tutor Active', '(chưa chạy)'),
            ('Lần đồng bộ cuối', '(chưa chạy)'),
            ('Giả lập thời gian', ''),
            ('HV Active', '=COUNTIF(STUDENT_INFO!I:I,"Active")')]
    for i, (k, v) in enumerate(info, 4):
        ws.cell(i, 1, k).font = Font(bold=True) if k else Font()
        ws.cell(i, 2, v)
    ws.cell(24, 1, '"Lần đồng bộ cuối" không đổi quá 10 phút = trigger heartbeat không chạy → menu 3. Tạo/cập nhật 8 trigger').font = note_font
    ws.column_dimensions['A'].width = 34; ws.column_dimensions['B'].width = 60

    # ── STUDENT_INFO ── F/G là CÔNG THỨC do script ghi (vùng mở $D$2:$D). Đừng gõ số vào F/G.
    ws2 = wb.create_sheet('STUDENT_INFO')
    write_headers(ws2, ['StudentID','Email','Họ và tên','Gói đăng ký','TotalSessions','SessionsUsed','SessionsRemaining','Ngày kích hoạt','Trạng thái','Ghi chú'], {2: 26, 3: 22, 10: 24})
    list_validation(ws2, 'I2:I5000', ['Active','Paused','Hết buổi'])

    calendar_grid(wb.create_sheet('CHECK_SLOT'))

    ws4 = wb.create_sheet('BOOKINGS')
    write_headers(ws4, ['BookingID','StudentID','StudentName','StudentEmail','TutorID','TutorName','Date','TimeSlot','MeetLink','Status','CreatedAt','FailReason','AttendanceMarkedAt','EventID'],
                  {1: 20, 4: 26, 9: 32, 11: 18, 12: 40, 13: 18})
    list_validation(ws4, 'J2:J50000', STATUSES)

    ws5 = wb.create_sheet('ĐĂNG KÝ MỚI')
    write_headers(ws5, ['Timestamp','Email','Họ và tên','Student ID','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'])

    ws6 = wb.create_sheet('PAYROLL_REPORT')
    ws6.cell(1, 1, 'BÁO CÁO LƯƠNG TUTOR').font = Font(bold=True, size=14)
    ws6.cell(2, 1, 'Từ ngày:').font = hdr_font
    ws6.cell(2, 3, 'Đến ngày:').font = hdr_font
    for c, h in enumerate(['Tutor','Completed','NoShow','Active','Tổng billable','Đơn giá','Thành tiền'], 1):
        ws6.cell(4, c, h).font = hdr_font; ws6.cell(4, c).fill = hdr_fill
        ws6.column_dimensions[get_column_letter(c)].width = 30 if c == 1 else 14

    guide(wb.create_sheet('HUONG_DAN'), [
        f'HƯỚNG DẪN SỬ DỤNG — thaiput v{VERSION}',
        '',
        'KIẾN TRÚC 3 SPREADSHEET:',
        '  1. THAIPUT_MAIN (file này): chứa Apps Script — DASHBOARD, STUDENT_INFO, CHECK_SLOT, BOOKINGS (14 cột), PAYROLL',
        '  2. THAIPUT_REGISTRATION: form đăng ký ghi vào đây — PACKAGES + STUDENT_REGISTRATION',
        '  3. THAIPUT_TUTOR: tutor tự đánh "x" — TUTOR_INFO + tab Tutor-<tên> + archive hàng tháng',
        '',
        'TRIỂN KHAI (làm theo thứ tự):',
        '  1. Upload 3 file XLSX lên Drive → mở từng file → File → Save as Google Sheets',
        '  2. REGISTRATION: sửa PACKAGES. TUTOR: sửa TUTOR_INFO, đổi tên các tab Tutor-<tên> cho khớp cột B',
        '  3. Copy Spreadsheet ID của REGISTRATION và TUTOR (đoạn giữa /d/ và /edit trên URL)',
        '  4. MAIN: Extensions → Apps Script → xoá Code.gs → tạo 12 file .gs, dán nội dung từ thư mục src/',
        '  5. Project Settings → Time zone = (GMT+07:00) Ho Chi Minh; bật "Show appsscript.json" → dán appsscript.json',
        '  6. Config.gs: điền ADMIN_EMAIL, TUTOR_SS_ID, REGISTRATION_SS_ID (+ SCHOOL_EMAIL, PAYMENT_INFO) → Lưu',
        '  7. Reload sheet → menu thaiput → 1. Khởi tạo + kiểm tra hệ thống → cấp quyền → chạy lại → phải 0 lỗi',
        '  8. Menu → 2. Tạo 2 Form mới + kết nối',
        '  9. Menu → 3. Tạo/cập nhật 8 trigger',
        '  10. Menu → Form → Kiểm tra kết nối Form (phải 0 vấn đề) → submit thử 1 lần bằng email học viên test',
        '',
        'LUỒNG DỮ LIỆU:',
        '  HV đăng ký (Form) → STUDENT_REGISTRATION → admin chọn "Đã thanh toán" cột E → menu Học viên → Kích hoạt',
        '  → STUDENT_INFO (Main) + email chào mừng kèm link đặt lịch',
        '  Tutor đánh "x" → script đồng bộ CHECK_SLOT + dropdown form mỗi 10 phút và sau mỗi booking / huỷ',
        '  HV đặt lịch (Form) → BOOKINGS + Google Meet + email HV và tutor',
        '  Huỷ: BOOKINGS cột J chọn Cancelled → tự hoàn buổi, xoá lịch Calendar, email HV + tutor',
        '',
        'KHÔNG ĐƯỢC:',
        '  Gõ tay dòng mới vào BOOKINGS · sửa cột F/G STUDENT_INFO · đổi tên tab · xoá dòng BOOKINGS cũ',
        '',
        'TEST TRÊN SHEET:',
        '  Menu → Test → Chạy tất cả (T0 → T11), xem log: Extensions → Apps Script → Executions',
        '  Xong: menu → Test → Dọn dữ liệu test',
        '',
        'Tài liệu đầy đủ: docs/TAI_LIEU_TONG_HOP.md trong repo',
    ])

    path = os.path.join(DIR, 'THAIPUT_MAIN_v6.1.xlsx'); wb.save(path); print('Created', path)

if __name__ == '__main__':
    os.makedirs(DIR, exist_ok=True)
    create_registration()
    create_tutor()
    create_main()
    print('Done — 3 XLSX files created in', os.path.abspath(DIR))
