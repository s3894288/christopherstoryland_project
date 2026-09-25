/**
 * Config.gs — Cấu hình tập trung (v6.0 FINAL)
 *
 * BẮT BUỘC ĐIỀN: ADMIN_EMAIL, TUTOR_SS_ID, REGISTRATION_SS_ID
 * KHÔNG CẦN ĐIỀN: BOOKING_FORM_ID, REGISTRATION_FORM_ID (tự lưu vào Script Properties
 *                  khi chạy setupAllForms hoặc menu Form → Kết nối)
 *
 * v6.0: BOOKINGS 14 cột (thêm N: EventID để xoá lịch Calendar khi huỷ)
 *       PAST_SLOT + MIN_LEAD_MINUTES chặn đặt slot đã qua / quá sát giờ
 *       ROUND_ROBIN_SCOPE = 'week' cân bằng theo tuần, không theo lịch sử trọn đời
 */
var CONFIG = {
  VERSION: '6.0.1',
  ADMIN_EMAIL: 'PASTE_ADMIN_EMAIL_HERE',
  TUTOR_SS_ID: '',
  REGISTRATION_SS_ID: '',
  BOOKING_FORM_ID: '',
  REGISTRATION_FORM_ID: '',

  SCHOOL_NAME: 'thaiput',
  SCHOOL_TAGLINE: '1:1 Vietnamese Tutoring',
  SCHOOL_EMAIL: '',
  SCHOOL_PHONE: '',
  SUPPORT_HOURS: 'Thứ 2 – Thứ 7, 09:00 – 21:00',
  PAYMENT_INFO: { BANK_NAME:'Vietcombank', ACCOUNT_NUMBER:'0123456789', ACCOUNT_HOLDER:'CONG TY THAIPUT', TRANSFER_NOTE_HINT:'Ghi rõ: <Email đăng ký> <Tên gói>' },
  TIMEZONE: 'Asia/Ho_Chi_Minh',

  SHEETS: { DASHBOARD:'DASHBOARD', PACKAGES:'PACKAGES', REGISTRATION:'STUDENT_REGISTRATION', STUDENT_INFO:'STUDENT_INFO', CHECK_SLOT:'CHECK_SLOT', BOOKINGS:'BOOKINGS', DANG_KY:'ĐĂNG KÝ MỚI', TUTOR_INFO:'TUTOR_INFO', PAYROLL:'PAYROLL_REPORT' },
  TUTOR_SHEET_PREFIX: 'Tutor-',
  ARCHIVE_PREFIX: '_ARCHIVE_',

  BOOKING_COLS: { BOOKING_ID:1, STUDENT_ID:2, STUDENT_NAME:3, STUDENT_EMAIL:4, TUTOR_ID:5, TUTOR_NAME:6, DATE:7, TIME_SLOT:8, MEET_LINK:9, STATUS:10, CREATED_AT:11, FAIL_REASON:12, ATTENDANCE_AT:13, EVENT_ID:14 },
  BOOKING_NUM_COLS: 14,
  STUDENT_COLS: { STUDENT_ID:1, EMAIL:2, NAME:3, PACKAGE:4, TOTAL:5, USED:6, REMAINING:7, ACTIVATED_AT:8, STATUS:9, NOTE:10 },
  REG_COLS: { TIMESTAMP:1, EMAIL:2, NAME:3, PACKAGE:4, PAYMENT:5, STUDENT_ID:6, SESSIONS:7, FEE:8, SYNCED:9 },
  PACKAGE_COLS: { NAME:1, SESSIONS:2, PRICE:3, NOTE:4 },
  TUTOR_COLS: { ID:1, NAME:2, EMAIL:3, STATUS:4, RATE:5, NOTE:6 },
  DASHBOARD_CELLS: { BOOKING_URL:'B11', REG_URL:'B12', BOOKING_ID:'B13', REG_ID:'B14', ACTIVE_WEEK:'B17', BOOKINGS_WEEK:'B18', TUTOR_COUNT:'B19', LAST_SYNC:'B20', SIM_NOW:'B21' },

  STATUS: { ACTIVE:'Active', COMPLETED:'Completed', NOSHOW:'NoShow', CANCELLED:'Cancelled', FAILED:'Failed' },
  CONSUMING_STATUSES: ['Active','Completed','NoShow'],
  BILLABLE_STATUSES: ['Completed','NoShow'],
  PAYMENT_STATUS: { PAID:'Đã thanh toán', UNPAID:'Chưa thanh toán' },
  STUDENT_STATUS: { ACTIVE:'Active', PAUSED:'Paused', EXHAUSTED:'Hết buổi' },

  QUOTA: { ENFORCE:true, ALLOW_UNKNOWN_STUDENT:false, LOW_BALANCE_THRESHOLD:1, NOTIFY_LOW_BALANCE:true, NOTIFY_EXHAUSTED:true, ADMIN_CC_ON_EXHAUSTED:true },
  FAIL_REASONS: {
    NO_CREDITS:'Hết buổi học — cần nạp thêm',
    OVER_BUDGET:'Vượt quá số buổi còn lại trong lần đăng ký này',
    SLOT_FULL:'Khung giờ đã hết chỗ',
    NO_TUTOR:'Không còn tutor trống cho khung giờ này',
    UNKNOWN_STUDENT:'Email chưa được kích hoạt trong hệ thống',
    PAST_SLOT:'Khung giờ đã qua hoặc quá sát giờ học'
  },

  ASSIGNMENT_STRATEGY: 'round_robin',
  ROUND_ROBIN_SCOPE: 'week',
  TIME_SLOTS: ['17:00 - 17:25','17:30 - 17:55','18:00 - 18:25','18:30 - 18:55','19:00 - 19:25','19:30 - 19:55','20:00 - 20:25','20:30 - 20:55','21:00 - 21:25','21:30 - 21:55','22:00 - 22:25','22:30 - 22:55','23:00 - 23:25','23:30 - 23:55'],
  DAY_LABELS: ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'],
  DAY_OFFSETS: {'Thứ 2':0,'Thứ 3':1,'Thứ 4':2,'Thứ 5':3,'Thứ 6':4,'Thứ 7':5,'Chủ nhật':6},
  NO_CHOICE_LABEL: 'Không chọn',

  EMAIL: { SEND_CONFIRMATION:true, SEND_FAILURE_STUDENT:true, NOTIFY_ADMIN_ON_FAILURE:true, SEND_CANCEL_NOTIFICATION:true, SEND_TUTOR_NOTIFICATION:true, SEND_WELCOME_ON_ACTIVATE:true },
  POLICY: { CANCEL_NOTICE_HOURS:24, JOIN_EARLY_MINUTES:5, MIN_LEAD_MINUTES:60 },
  LOCK_TIMEOUT_MS: 30000,
  ID_PREFIX: { BOOKING:'BK', STUDENT:'S' }
};
function getReplyToEmail_() { return CONFIG.SCHOOL_EMAIL || CONFIG.ADMIN_EMAIL; }
