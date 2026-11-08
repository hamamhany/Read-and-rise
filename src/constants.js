export const TEACHER_PHONE = '962786117388';
export const MAX_SUPERVISORS = 10;
export const ANNOUNCEMENTS_LIMIT = 6;

export const MESSAGE_REQUESTS_COLLECTION = 'messageRequests';
export const REVIEW_REQUESTS_COLLECTION = 'reviewRequests';
export const BLACKLIST_COLLECTION = 'blacklist';

export const MESSAGE_REQUEST_RETENTION_MS = 48 * 60 * 60 * 1000;

export const WARNING_RETENTION_DAYS = 120;
export const WARNING_RETENTION_MS = WARNING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
export const MAX_WARNINGS = 3;

// =========================================================
// ✅ نظام الغياب التلقائي (جديد)
// =========================================================
export const ABSENCE_WARNING_THRESHOLD = 10;   // 10 حصص → إنذار
export const ABSENCE_FREEZE_THRESHOLD = 13;    // 13 حصة → تجميد
export const ABSENCE_DELETE_DAYS = 7;          // 7 أيام بعد التجميد → حذف
export const BLACKLIST_DURATION_DAYS = 180;    // 6 أشهر حظر

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
  DELETE: 'delete',
  RESET_PASSWORD: 'reset_password',
  ACTIVATION: 'activation',
  DATA_UPDATE_APPROVAL: 'data_update_approval',
  DATA_UPDATE_REJECTION: 'data_update_rejection',
  // ✅ جديد
  ABSENCE_WARNING: 'absence_warning',
  AUTO_FREEZE: 'auto_freeze',
  AUTO_DELETE: 'auto_delete'
};

export const MESSAGE_REQUEST_TYPE_LABELS = {
  warning: 'إنذار',
  notice: 'تنبيه تحذيري',
  general: 'رسالة عامة',
  report: 'بلاغ',
  freeze: 'إشعار تجميد',
  delete: 'إشعار حذف',
  reset_password: 'إعادة تعيين كلمة مرور',
  activation: 'تفعيل حساب',
  data_update_approval: 'موافقة على تعديل بيانات',
  data_update_rejection: 'رفض تعديل بيانات',
  // ✅ جديد
  absence_warning: 'إنذار غياب متكرر',
  auto_freeze: 'تجميد تلقائي — غياب',
  auto_delete: 'حذف تلقائي — غياب'
};

export const REPORT_STATUS = {
  PENDING: 'pending',
  RESOLVED: 'resolved'
};

export const REVIEW_REQUEST_STATUS = {
  PENDING_VOTES: 'pending_votes',
  APPROVED_BY_SUPERVISORS: 'approved_by_supervisors',
  DISPUTED: 'disputed',
  SENT: 'sent',
  REJECTED: 'rejected'
};

export const REVIEW_VOTE_OPTIONS = {
  AGREE: 'agree',
  EXAGGERATED: 'exaggerated'
};

export const REVIEW_REQUIRED_VOTES = 4;