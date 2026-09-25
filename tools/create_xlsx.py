"""Generate 3 XLSX files for thaiput v6.1.0 (3 spreadsheets, BOOKINGS 14 cols)."""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from datetime import datetime, timedelta
import calendar, os

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates')
SLOTS = ['17:00 - 17:25','17:30 - 17:55','18:00 - 18:25','18:30 - 18:55',
         '19:00 - 19:25','19:30 - 19:55','20:00 - 20:25','20:30 - 20:55',
         '21:00 - 21:25','21:30 - 21:55','22:00 - 22:25','22:30 - 22:55',
         '23:00 - 23:25','23:30 - 23:55']
DAY_VI = {0:'Thứ 2',1:'Thứ 3',2:'Thứ 4',3:'Thứ 5',4:'Thứ 6',5:'Thứ 7',6:'Chủ nhật'}
hdr_font = Font(bold=True, size=11)
hdr_fill = PatternFill('solid', fgColor='D6E4F0')
date_fmt = 'DD/MM/YYYY'

def aug_sept_dates():
    """August 2026 full + first week Sept 2026."""
    dates = [datetime(2026,8,d) for d in range(1,32)]
    dates += [datetime(2026,9,d) for d in range(1,8)]
    return dates

def write_headers(ws, headers):
    for c,h in enumerate(headers,1):
        cell = ws.cell(1,c,h)
        cell.font, cell.fill = hdr_font, hdr_fill

def write_calendar_grid(ws, dates, marks=None):
    """Write date grid for tutor/check_slot tabs. marks = {(row_date, slot): 'x'}"""
    headers = ['Ngày','Thứ'] + SLOTS
    write_headers(ws, headers)
    for i,d in enumerate(dates):
        r = i+2
        ws.cell(r,1,d).number_format = date_fmt
        ws.cell(r,2,DAY_VI[d.weekday()])
        if marks:
            for c,s in enumerate(SLOTS,3):
                key = (d.day, d.month, s)
                if key in marks:
                    ws.cell(r,c,marks[key])
    ws.column_dimensions['A'].width = 12
    ws.column_dimensions['B'].width = 10
    for c in range(3,17):
        ws.column_dimensions[get_column_letter(c)].width = 14

# ═══════════════════════════════════════
# FILE 1: REGISTRATION
# ═══════════════════════════════════════
def create_registration():
    wb = openpyxl.Workbook()
    # ── PACKAGES ──
    ws = wb.active; ws.title = 'PACKAGES'
    write_headers(ws, ['Tên gói','Số buổi','Học phí (VND)','Ghi chú'])
    pkgs = [('Gói 12 buổi',12,1560000,''),('Gói 24 buổi',24,2880000,'Tiết kiệm 7.5%'),('Gói 48 buổi',48,5280000,'Tiết kiệm 15%')]
    for i,(n,s,p,note) in enumerate(pkgs,2):
        ws.cell(i,1,n); ws.cell(i,2,s); ws.cell(i,3,p).number_format='#,##0'; ws.cell(i,4,note)
    ws.column_dimensions['A'].width=18; ws.column_dimensions['C'].width=16

    # ── STUDENT_REGISTRATION ──
    ws2 = wb.create_sheet('STUDENT_REGISTRATION')
    reg_h = ['Timestamp','Email','Họ và tên','Gói đăng ký','Trạng thái TT','StudentID','Số buổi','Học phí','Synced']
    write_headers(ws2, reg_h)
    students = [
        ('hoa@example.com','Lê Thị Hoa','Gói 12 buổi','Đã thanh toán'),
        ('dung@example.com','Nguyễn Văn Dũng','Gói 24 buổi','Đã thanh toán'),
        ('minhanh@example.com','Trần Minh Anh','Gói 12 buổi','Đã thanh toán'),
        ('bao@example.com','Phạm Quốc Bảo','Gói 48 buổi','Đã thanh toán'),
        ('linh@example.com','Võ Thuỳ Linh','Gói 12 buổi','Đã thanh toán'),
        ('nam@example.com','Đặng Hoàng Nam','Gói 24 buổi','Chưa thanh toán'),
        ('tam@example.com','Bùi Thanh Tâm','Gói 12 buổi','Đã thanh toán'),
        ('ngan@example.com','Lý Kim Ngân','Gói 48 buổi','Chưa thanh toán'),
    ]
    for i,(email,name,pkg,pay) in enumerate(students,2):
        ws2.cell(i,1,datetime(2026,7,15+i-2,10,0,0)).number_format='DD/MM/YYYY HH:MM'
        ws2.cell(i,2,email)
        ws2.cell(i,3,name)
        ws2.cell(i,4,pkg)
        ws2.cell(i,5,pay)
        # StudentID: S + 3 digits
        ws2.cell(i,6,f'S{i-1:03d}')
        # Số buổi: VLOOKUP
        ws2.cell(i,7).value = f'=VLOOKUP(D{i},PACKAGES!A:B,2,FALSE)'
        # Học phí: VLOOKUP
        ws2.cell(i,8).value = f'=VLOOKUP(D{i},PACKAGES!A:C,3,FALSE)'
        ws2.cell(i,8).number_format = '#,##0'
        # Synced
        ws2.cell(i,9,'Yes' if pay=='Đã thanh toán' else '')
    for c in range(1,10):
        ws2.column_dimensions[get_column_letter(c)].width = 16
    ws2.column_dimensions['A'].width = 20

    wb.save(os.path.join(DIR,'THAIPUT_REGISTRATION_v6.1.xlsx'))
    print('Created THAIPUT_REGISTRATION_v6.1.xlsx')

# ═══════════════════════════════════════
# FILE 2: TUTOR
# ═══════════════════════════════════════
def create_tutor():
    wb = openpyxl.Workbook()
    # ── TUTOR_INFO ──
    ws = wb.active; ws.title = 'TUTOR_INFO'
    write_headers(ws, ['TutorID','Tên tutor','Email','Status','Đơn giá/buổi (VND)','Ghi chú'])
    tutors = [('T001','Vân','van@thaiput.com','Active',120000,''),
              ('T002','Ánh','anh@thaiput.com','Active',120000,''),
              ('T003','Lan','lan@thaiput.com','Active',100000,''),
              ('T004','Minh','minh@thaiput.com','Active',100000,'')]
    for i,(tid,name,email,st,rate,note) in enumerate(tutors,2):
        ws.cell(i,1,tid); ws.cell(i,2,name); ws.cell(i,3,email)
        ws.cell(i,4,st); ws.cell(i,5,rate).number_format='#,##0'; ws.cell(i,6,note)
    for c in range(1,7):
        ws.column_dimensions[get_column_letter(c)].width = 18

    # ── Tutor sheets with August availability ──
    dates = aug_sept_dates()
    # Availability patterns (day_of_month, month, slot) -> 'x'
    # Vân: Mon-Fri 19:00-22:00
    van_marks = {}
    for d in dates:
        if d.weekday() < 5:  # Mon-Fri
            for s in SLOTS[4:10]:  # 19:00-21:55
                van_marks[(d.day,d.month,s)] = 'x'

    # Ánh: Mon-Thu 20:00-23:00
    anh_marks = {}
    for d in dates:
        if d.weekday() < 4:  # Mon-Thu
            for s in SLOTS[6:12]:  # 20:00-22:55
                anh_marks[(d.day,d.month,s)] = 'x'

    # Lan: Mon-Sat 17:00-20:00
    lan_marks = {}
    for d in dates:
        if d.weekday() < 6:  # Mon-Sat
            for s in SLOTS[0:6]:  # 17:00-19:55
                lan_marks[(d.day,d.month,s)] = 'x'

    # Minh: Tue-Sat 18:00-21:00
    minh_marks = {}
    for d in dates:
        if d.weekday() in [1,2,3,4,5]:  # Tue-Sat
            for s in SLOTS[2:8]:  # 18:00-20:55
                minh_marks[(d.day,d.month,s)] = 'x'

    for name, marks in [('Vân',van_marks),('Ánh',anh_marks),('Lan',lan_marks),('Minh',minh_marks)]:
        ws_t = wb.create_sheet(f'Tutor-{name}')
        write_calendar_grid(ws_t, dates, marks)

    wb.save(os.path.join(DIR,'THAIPUT_TUTOR_v6.1.xlsx'))
    print('Created THAIPUT_TUTOR_v6.1.xlsx')

# ═══════════════════════════════════════
# FILE 3: MAIN
# ═══════════════════════════════════════
def create_main():
    wb = openpyxl.Workbook()

    # ── DASHBOARD ──
    ws = wb.active; ws.title = 'DASHBOARD'
    ws.merge_cells('A1:F1')
    ws.cell(1,1,'thaiput — Booking System v6.1.0').font = Font(bold=True, size=18)
    ws.cell(2,1,'Kiến trúc 3 spreadsheet: Main + Registration + Tutor').font = Font(size=12, color='666666')
    info = [('',''),('CẤU HÌNH',''),
            ('Admin email','(điền vào Config.gs)'),
            ('Registration Spreadsheet ID','(điền sau khi upload lên Google Sheets)'),
            ('Tutor Spreadsheet ID','(điền sau khi upload lên Google Sheets)'),
            ('',''),('LIÊN KẾT',''),
            ('Form đặt lịch','(tạo bởi setupAllForms)'),
            ('Form đăng ký','(tạo bởi setupAllForms)'),
            ('Booking Form ID',''),('Registration Form ID',''),
            ('',''),('VẬN HÀNH (script tự cập nhật mỗi 10 phút)',''),
            ('Tuần active','(chưa chạy)'),
            ('Bookings tuần này','(chưa chạy)'),
            ('Tutor Active','(chưa chạy)'),
            ('Lần đồng bộ cuối','(chưa chạy)'),
            ('Giả lập thời gian',''),
            ('HV Active','=COUNTIF(STUDENT_INFO!I:I,"Active")')]
    for i,(k,v) in enumerate(info,4):
        ws.cell(i,1,k).font = Font(bold=True) if k else Font()
        ws.cell(i,2,v)
    ws.column_dimensions['A'].width=30; ws.column_dimensions['B'].width=50

    # ── STUDENT_INFO ──
    ws2 = wb.create_sheet('STUDENT_INFO')
    si_h = ['StudentID','Email','Họ và tên','Gói đăng ký','TotalSessions','SessionsUsed','SessionsRemaining','Ngày kích hoạt','Trạng thái','Ghi chú']
    write_headers(ws2, si_h)
    # 6 students (matching paid registrations)
    synced = [
        ('S001','hoa@example.com','Lê Thị Hoa','Gói 12 buổi',12),
        ('S002','dung@example.com','Nguyễn Văn Dũng','Gói 24 buổi',24),
        ('S003','minhanh@example.com','Trần Minh Anh','Gói 12 buổi',12),
        ('S004','bao@example.com','Phạm Quốc Bảo','Gói 48 buổi',48),
        ('S005','linh@example.com','Võ Thuỳ Linh','Gói 12 buổi',12),
        ('S006','tam@example.com','Bùi Thanh Tâm','Gói 12 buổi',12),
    ]
    for i,(sid,email,name,pkg,total) in enumerate(synced,2):
        ws2.cell(i,1,sid); ws2.cell(i,2,email); ws2.cell(i,3,name); ws2.cell(i,4,pkg)
        ws2.cell(i,5,total)
        # SessionsUsed: COUNTIFS Active+Completed+NoShow. Vùng mở $D$2:$D — KHÔNG giới hạn $2000
        # (v6.1.0: qua 2000 dòng BOOKINGS thì booking mới không bị trừ buổi). Dòng HV mới do script ghi công thức.
        ws2.cell(i,6).value = (
            f'=COUNTIFS(BOOKINGS!$D$2:$D,$B{i},BOOKINGS!$J$2:$J,"Active")'
            f'+COUNTIFS(BOOKINGS!$D$2:$D,$B{i},BOOKINGS!$J$2:$J,"Completed")'
            f'+COUNTIFS(BOOKINGS!$D$2:$D,$B{i},BOOKINGS!$J$2:$J,"NoShow")')
        # SessionsRemaining
        ws2.cell(i,7).value = f'=MAX(0,E{i}-F{i})'
        ws2.cell(i,8,datetime(2026,7,20)).number_format = date_fmt
        ws2.cell(i,9,'Active')
        ws2.cell(i,10,f'Kích hoạt 20/07/2026')
    for c in range(1,11):
        ws2.column_dimensions[get_column_letter(c)].width = 16

    # ── CHECK_SLOT ──
    ws3 = wb.create_sheet('CHECK_SLOT')
    dates = aug_sept_dates()
    write_calendar_grid(ws3, dates)
    # All values 0 (placeholder — script computes real values)
    for i in range(len(dates)):
        for c in range(3,17):
            ws3.cell(i+2, c, 0)

    # ── BOOKINGS ──
    ws4 = wb.create_sheet('BOOKINGS')
    bk_h = ['BookingID','StudentID','StudentName','StudentEmail','TutorID','TutorName',
            'Date','TimeSlot','MeetLink','Status','CreatedAt','FailReason','AttendanceMarkedAt','EventID']
    write_headers(ws4, bk_h)
    for c in range(1,15):
        ws4.column_dimensions[get_column_letter(c)].width = 16

    # ── ĐĂNG KÝ MỚI ──
    ws5 = wb.create_sheet('ĐĂNG KÝ MỚI')
    dk_h = ['Timestamp','Email','Họ và tên','Student ID','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật']
    write_headers(ws5, dk_h)
    for c in range(1,12):
        ws5.column_dimensions[get_column_letter(c)].width = 14

    # ── PAYROLL_REPORT ──
    ws6 = wb.create_sheet('PAYROLL_REPORT')
    ws6.cell(1,1,'BÁO CÁO LƯƠNG TUTOR').font = Font(bold=True, size=14)
    ws6.cell(2,1,'Từ ngày:').font = hdr_font
    ws6.cell(2,2,datetime(2026,8,1)).number_format = date_fmt
    ws6.cell(2,3,'Đến ngày:').font = hdr_font
    ws6.cell(2,4,datetime(2026,8,31)).number_format = date_fmt
    pr_h = ['Tutor','Completed','NoShow','Active','Tổng billable','Đơn giá','Thành tiền']
    for c,h in enumerate(pr_h,1):
        ws6.cell(4,c,h).font = hdr_font; ws6.cell(4,c).fill = hdr_fill
    for c in range(1,8):
        ws6.column_dimensions[get_column_letter(c)].width = 14

    # ── HUONG_DAN ──
    ws7 = wb.create_sheet('HUONG_DAN')
    guide = [
        'HƯỚNG DẪN SỬ DỤNG — thaiput v6.1.0',
        '',
        'KIẾN TRÚC 3 SPREADSHEET:',
        '  1. THAIPUT_MAIN: sheet chính, chứa Apps Script — STUDENT_INFO, CHECK_SLOT, BOOKINGS (14 cột), PAYROLL',
        '  2. THAIPUT_REGISTRATION: form đăng ký ghi vào đây — PACKAGES + STUDENT_REGISTRATION',
        '  3. THAIPUT_TUTOR: tutor tự đánh "x" — TUTOR_INFO + 4 tab tutor + archive hàng tháng',
        '',
        'TRIỂN KHAI (làm theo thứ tự):',
        '  1. Upload 3 file XLSX lên Drive → mở bằng Google Sheets',
        '  2. Copy Spreadsheet ID của REGISTRATION và TUTOR (đoạn giữa /d/ và /edit trên URL)',
        '  3. Trong MAIN: Extensions → Apps Script → dán 12 file .gs',
        '  4. Project Settings → Time zone = (GMT+07:00) Ho Chi Minh; bật "Show appsscript.json" → dán appsscript.json',
        '  5. Services (+) → Google Calendar API → Add',
        '  6. Config.gs: điền ADMIN_EMAIL, TUTOR_SS_ID, REGISTRATION_SS_ID',
        '  7. Reload sheet → menu thaiput → 1. Kiểm tra hệ thống (phải 0 lỗi)',
        '  8. Menu → 2. Tạo 2 Form mới + kết nối',
        '  9. Menu → 3. Tạo/cập nhật 8 trigger',
        '  10. Menu → Form → Kiểm tra kết nối Form (phải 0 vấn đề)',
        '',
        'LUỒNG DỮ LIỆU:',
        '  HV đăng ký (Form) → STUDENT_REGISTRATION (Registration) → admin đánh "Đã thanh toán" cột E',
        '  → menu Học viên → Kích hoạt → STUDENT_INFO (Main) + email welcome',
        '  Tutor đánh "x" (Tutor) → script đồng bộ CHECK_SLOT (Main) mỗi 10 phút + sau mỗi booking/huỷ',
        '  HV đặt lịch (Form) → BOOKINGS (Main) + Calendar/Meet + email',
        '  Huỷ: đổi cột J thành Cancelled → tự hoàn buổi, xoá lịch Calendar, email',
        '',
        'TEST:',
        '  Menu → Test → Chạy tất cả (T0 → T11), xem log Extensions → Apps Script → Executions',
        '  Xong: menu → Test → Dọn dữ liệu test',
        '  Dữ liệu tháng 8/2026 nạp sẵn trong tutor tabs để test archive (T10)',
    ]
    for i,line in enumerate(guide,1):
        ws7.cell(i,1,line).font = Font(bold=True,size=14) if i==1 else Font(size=11)
    ws7.column_dimensions['A'].width = 80

    wb.save(os.path.join(DIR,'THAIPUT_MAIN_v6.1.xlsx'))
    print('Created THAIPUT_MAIN_v6.1.xlsx')

if __name__ == '__main__':
    create_registration()
    create_tutor()
    create_main()
    print('Done — 3 XLSX files created')
