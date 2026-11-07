import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FaExclamationTriangle } from 'react-icons/fa';
import { createMessageRequest } from '../../services/messageRequests';
import { MESSAGE_REQUEST_TYPES } from '../../constants';

const ReportModal = ({ isOpen, onClose, student, requesterId, requesterName }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);

  const reasons = [
    'إساءة لفظية أثناء الحصص',
    'مخالفة قوانين الأكاديمية',
    'عدم الالتزام بالواجبات',
    'سلوك غير لائق',
    'أخرى'
  ];

  const handleSubmit = async () => {
    if (!reason) {
      toast.error('يرجى اختيار سبب البلاغ');
      return;
    }
    if (!details.trim()) {
      toast.error('يرجى كتابة تفاصيل السبب بالعربية الفصحى');
      return;
    }
    setLoading(true);
    try {
      const finalReason = `${reason} — ${details.trim()}`;
      await createMessageRequest(
        {
          type: MESSAGE_REQUEST_TYPES.REPORT,
          targetType: 'student',
          targetId: student.id,
          targetName: student.name,
          targetPhone: student.phone || '',
          targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
          requestedBy: requesterId || '',
          requestedByName: requesterName || 'معلم',
          payload: {
            reasonCategory: reason,
            reasonDetails: details.trim(),
            reason: finalReason
          }
        },
        requesterName || 'معلم'
      );
      toast.success('✅ تم حفظ البلاغ. سيتم إرساله بعد تدقيق مدير النظام.');
      setReason('');
      setDetails('');
      onClose();
    } catch (err) {
      toast.error('فشل حفظ البلاغ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-red-500/30" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold text-red-300 mb-4">
          <FaExclamationTriangle className="inline-block me-2" /> تقديم بلاغ ضد الطالب
        </h3>
        <p className="text-gray-300 text-sm mb-2">
          الطالب: <strong>{student.name}</strong>
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300 block mb-1">سبب البلاغ <span className="text-red-400">*</span></label>
            <select
              className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="">اختر السبب</option>
              {reasons.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-300 block mb-1">تفاصيل السبب (بالعربية الفصحى) <span className="text-red-400">*</span></label>
            <textarea
              className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white resize-none h-24"
              placeholder="اكتب تفاصيل المخالفة بوضوح..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-xs text-red-300 leading-relaxed">
            ⚠️ تنبيه هام: البلاغ قد يتسبب في إغلاق الحساب أو حظر الرقم نهائياً. إذا كنت ترى أن الحل الأمثل هو تقديم بلاغ فلا تتردد.
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-xl text-white text-sm font-semibold transition">
              {loading ? 'جاري الحفظ...' : 'حفظ البلاغ'}
            </button>
            <button onClick={onClose} className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm transition">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;