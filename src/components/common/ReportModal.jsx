import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FaExclamationTriangle } from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const ReportModal = ({ isOpen, onClose, student }) => {
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
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
    if (reason === 'أخرى' && !otherReason.trim()) {
      toast.error('يرجى كتابة سبب البلاغ');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'reports'), {
        studentId: student.id,
        studentName: student.name,
        studentClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
        reason: reason === 'أخرى' ? otherReason : reason,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      toast.success('تم إرسال البلاغ بنجاح إلى مدير النظام');
      onClose();
    } catch (err) {
      toast.error('فشل إرسال البلاغ: ' + err.message);
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
            <label className="text-sm text-gray-300 block mb-1">سبب البلاغ</label>
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
          {reason === 'أخرى' && (
            <div>
              <label className="text-sm text-gray-300 block mb-1">اكتب السبب</label>
              <textarea
                className="w-full bg-gray-800 h-20 text-right p-2 border border-gray-600 rounded-md text-white resize-none"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
              />
            </div>
          )}
          <div className="bg-red-500/10 p-3 rounded-xl border border-red-500/20 text-xs text-red-300 leading-relaxed">
            ⚠️ تنبيه هام: البلاغ قد يتسبب في إغلاق الحساب أو حظر الرقم نهائياً أو تقديم إنذار للطالب أو يتم اتخاذ عقوبة أشد في حال استلزم الأمر. إذا كنت ترى أن الحل الأمثل هو تقديم بلاغ فلا تتردد.
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 rounded-xl text-white text-sm font-semibold transition">
              {loading ? 'جاري الإرسال...' : 'إرسال البلاغ'}
            </button>
            <button onClick={onClose} className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm transition">إلغاء</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;