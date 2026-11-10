export const TEACHER_PHONE = '962786117388';
export const MAX_SUPERVISORS = 10;
export const ANNOUNCEMENTS_LIMIT = 6;

export const MESSAGE_REQUESTS_COLLECTION = 'messageRequests';
export const REVIEW_REQUESTS_COLLECTION = 'reviewRequests';
export const BLACKLIST_COLLECTION = 'blacklist';
export const SUPPORT_TICKETS_COLLECTION = 'supportTickets';
export const PASSWORD_RESET_REQUESTS_COLLECTION = 'passwordResetRequests';

export const MESSAGE_REQUEST_RETENTION_MS = 48 * 60 * 60 * 1000;

export const WARNING_RETENTION_DAYS = 120;
export const WARNING_RETENTION_MS = WARNING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_WARNINGS = 3;

export const ABSENCE_WARNING_THRESHOLD = 10;
export const ABSENCE_FREEZE_THRESHOLD = 13;
export const ABSENCE_DELETE_DAYS = 7;
export const BLACKLIST_DURATION_DAYS = 180;

// ✅ تنبيه وحذف الحسابات غير المفعّلة
export const UNACTIVATED_ACCOUNT_REMINDER_DAYS = 21;   // بعد 3 أسابيع → تنبيه
export const UNACTIVATED_ACCOUNT_DELETE_DAYS = 7;      // بعد أسبوع من التنبيه → حذف

export const MESSAGE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export const MESSAGE_REQUEST_TYPES = {
  WARNING: 'warning',
  NOTICE: 'notice',
  GENERAL: 'general',
  REPORT: 'report',
  FREEZE: 'freeze',
  UNFREEZE: 'unfreeze',
  DELETE: 'delete',
  RESET_PASSWORD: 'reset_password',
  ACTIVATION: 'activation',
  DATA_UPDATE_APPROVAL: 'data_update_approval',
  DATA_UPDATE_REJECTION: 'data_update_rejection',
  ABSENCE_WARNING: 'absence_warning',
  AUTO_FREEZE: 'auto_freeze',
  AUTO_DELETE: 'auto_delete',
  PASSWORD_RESET_APPROVAL: 'password_reset_approval',
  PASSWORD_RESET_REJECTION: 'password_reset_rejection',
  SUPPORT_APOLOGY: 'support_apology',
  SUPPORT_REJECTION: 'support_rejection',
  // ✅ جديدة
  CLASS_GENDER_CHANGE: 'class_gender_change',
  CLASS_DELETE: 'class_delete',
  STUDENT_CLASS_TRANSFER: 'student_class_transfer',
  ANNOUNCEMENT_PUBLISH: 'announcement_publish',
  UNACTIVATED_ACCOUNT_REMINDER: 'unactivated_account_reminder',
  UNACTIVATED_ACCOUNT_DELETED: 'unactivated_account_deleted'
};

export const MESSAGE_REQUEST_TYPE_LABELS = {
  warning: 'إنذار',
  notice: 'تنبيه تحذيري',
  general: 'رسالة عامة',
  report: 'بلاغ',
  freeze: 'إشعار تجميد',
  unfreeze: 'إشعار فك تجميد',
  delete: 'إشعار حذف',
  reset_password: 'إعادة تعيين كلمة مرور',
  activation: 'تفعيل حساب',
  data_update_approval: 'موافقة على تعديل بيانات',
  data_update_rejection: 'رفض تعديل بيانات',
  absence_warning: 'إنذار غياب متكرر',
  auto_freeze: 'تجميد تلقائي — غياب',
  auto_delete: 'حذف تلقائي — غياب',
  password_reset_approval: 'موافقة على إعادة تعيين بيانات الدخول',
  password_reset_rejection: 'رفض طلب إعادة تعيين بيانات الدخول',
  support_apology: 'اعتذار رسمي — تقييم دعم',
  support_rejection: 'رفض شكوى — تقييم دعم',
  class_gender_change: 'تغيير جنس شعبة',
  class_delete: 'حذف شعبة',
  student_class_transfer: 'نقل طالب لشعبة أخرى',
  announcement_publish: 'نشر إشعار عام',
  unactivated_account_reminder: 'تنبيه عدم تفعيل الحساب',
  unactivated_account_deleted: 'حذف حساب غير مفعّل'
};

export const REPORT_STATUS = { PENDING: 'pending', RESOLVED: 'resolved' };

export const REVIEW_REQUEST_STATUS = {
  PENDING_VOTES: 'pending_votes',
  APPROVED_BY_SUPERVISORS: 'approved_by_supervisors',
  DISPUTED: 'disputed',
  SENT: 'sent',
  REJECTED: 'rejected'
};

export const REVIEW_VOTE_OPTIONS = { AGREE: 'agree', EXAGGERATED: 'exaggerated' };
export const REVIEW_REQUIRED_VOTES = 4;

export const PASSWORD_RESET_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

export const SUPPORT_TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  SUPERVISOR_ENDED: 'supervisor_ended',
  AWAITING_RATING: 'awaiting_rating',
  RATED_FULL: 'rated_full',
  RATED_LOW: 'rated_low',
  MANAGER_APOLOGIZED: 'manager_apologized',
  MANAGER_REJECTED: 'manager_rejected',
  AUTO_CLOSED: 'auto_closed',
  MANAGER_PENDING: 'manager_pending',
  REPORTED: 'reported',
  NEEDS_COMPLETION: 'needs_completion'
};

export const CONTACT_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export const SUPPORT_MAX_ACTIVE_PER_SUPERVISOR = 5;
export const SUPPORT_MAX_ACTIVE_OVERLOAD = 8;
export const SUPPORT_END_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const SUPPORT_AUTO_CLOSE_MS = 24 * 60 * 60 * 1000;

export const SUPPORT_RATING_CATEGORIES = [
  { value: 'bad_treatment', label: 'سوء في المعاملة' },
  { value: 'poor_response', label: 'طريقة الرد غير مناسبة' },
  { value: 'slow_reply', label: 'تأخر في الرد' },
  { value: 'wrong_info', label: 'معلومات غير دقيقة' },
  { value: 'unresolved', label: 'المشكلة لم تُحل فعلياً' }
];

export const DELETE_REQUEST_STATUS = {
  PENDING: 'pending',
  BOTH_APPROVED: 'both_approved',
  CANCELLED: 'cancelled'
};

export const CONTACT_PREFERENCE_MODES = {
  REGISTERED: 'registered',
  OTHER: 'other',
  NONE: 'none'
};

export const SUPPORT_REPORT_REASONS = [
  { value: 'verbal_abuse',     label: 'إساءة لفظية' },
  { value: 'threats',          label: 'تهديد أو ترويع' },
  { value: 'disrespect',       label: 'عدم احترام الكادر التعليمي' },
  { value: 'harassment',       label: 'تحرش أو مضايقة' },
  { value: 'false_info',       label: 'تقديم معلومات كاذبة أو مضللة' },
  { value: 'inappropriate',    label: 'سلوك غير لائق أو مسيء' },
  { value: 'other',            label: 'أخرى' }
];

// ✅ إدارة الشعب - جنس الشعبة
export const CLASS_GENDER = {
  MALE: 'male',
  FEMALE: 'female',
  MIXED: 'mixed'
};

export const CLASS_GENDER_LABELS = {
  male: 'ذكور فقط',
  female: 'إناث فقط',
  mixed: 'مختلطة'
};

export const CLASS_VISIBILITY = {
  ALL: 'all',
  OWN_GENDER: 'own_gender'
};

export const CLASS_VISIBILITY_LABELS = {
  all: 'ذكور وإناث',
  own_gender: 'حسب جنس المشرف'
};