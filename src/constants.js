export const TEACHER_PHONE = '962786117388';
export const MAX_SUPERVISORS = 10;
export const ANNOUNCEMENTS_LIMIT = 6;

// =========================================================
// مركزية إرسال الرسائل عبر مدير النظام
// =========================================================
export const MESSAGE_REQUESTS_COLLECTION = 'messageRequests';

// مدة الاحتفاظ بالطلبات المعتمدة (بالمللي ثانية) = 48 ساعة
export const MESSAGE_REQUEST_RETENTION_MS = 48 * 60 * 60 * 1000;

export const MESSAGE_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

export const MESSAGE_REQUEST_TYPES = {
  WARNING: 'warning',
  GENERAL: 'general',
  REPORT: 'report',
  FREEZE: 'freeze',
  DELETE: 'delete',
  RESET_PASSWORD: 'reset_password',
  ACTIVATION: 'activation',
  DATA_UPDATE_APPROVAL: 'data_update_approval',
  DATA_UPDATE_REJECTION: 'data_update_rejection'
};

export const MESSAGE_REQUEST_TYPE_LABELS = {
  warning: 'إنذار',
  general: 'رسالة عامة',
  report: 'بلاغ',
  freeze: 'إشعار تجميد',
  delete: 'إشعار حذف',
  reset_password: 'إعادة تعيين كلمة مرور',
  activation: 'تفعيل حساب',
  data_update_approval: 'موافقة على تعديل بيانات',
  data_update_rejection: 'رفض تعديل بيانات'
};