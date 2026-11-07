import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaExclamationTriangle, FaCheckCircle, FaEye, FaTimes, FaPaperPlane, FaBan } from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, orderBy
} from 'firebase/firestore';
import {
  MESSAGE_REQUEST_TYPES, REPORT_STATUS
} from '../../constants';
import { createMessageRequest } from '../../services/messageRequests';
import { createAccountClosureRequest } from '../../services/reviewRequests';
import { issueWarning } from '../../services/warnings';
import { getActiveWarnings } from '../../utils/helpers';

const ReportsReviewSection = ({ user }) => {
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionMode, setActionMode] = useState(null); // 'notice' | 'warning' | 'closure'
  const [description, setDescription] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'messageRequests'),
      where('type', '==', 'report'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => (r.reportStatus || 'pending') === 'pending');
      setReports(list);
    });
    return () => unsub();
  }, []);

  const openReport = (r) => {
    setSelected(r);
    setActionMode(null);
    setDescription('');
    setClosureReason('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelected(null);
    setActionMode(null);
  };

  const resolveReport = async () => {
    if (!selected) return;
    await updateDoc(doc(db, 'messageRequests', selected.id), {
      reportStatus: REPORT_STATUS.RESOLVED,
      resolvedBy: user.id,
      resolvedByName: user.name || user.username || 'مشرف',
      resolvedAt: serverTimestamp()
    });
  };

  const handleNotice = async () => {
    if (!description.trim()) return toast.error('يرجى كتابة نص التنبيه');
    setIsSubmitting(true);
    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.NOTICE,
        targetType: 'student',
        targetId: selected.targetId,
        targetName: selected.targetName,
        targetPhone: selected.targetPhone,
        targetClass: selected.targetClass,
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: { description: description.trim() }
      });
      await resolveReport();
      toast.success('✅ تم حفظ التنبيه التحذيري');
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleWarning = async () => {
    if (!description.trim()) return toast.error('يرجى كتابة سبب الإنذار');
    setIsSubmitting(true);
    try {
      const result = await issueWarning(selected.targetId, description.trim());
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.WARNING,
        targetType: 'student',
        targetId: selected.targetId,
        targetName: selected.targetName,
        targetPhone: selected.targetPhone,
        targetClass: selected.targetClass,
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: {
          warningNumber: result.warningNumber,
          description: description.trim()
        }
      });
      await resolveReport();
      toast.success(`✅ تم إصدار الإنذار رقم ${result.warningNumber} وحفظه للإرسال`);
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setIsSubmitting(false); }
  };

  const handleClosure = async () => {
    if (!closureReason.trim()) return toast.error('يرجى كتابة سبب الإغلاق بالعربية الفصحى');
    if (!window.confirm('⚠️ هذا الطلب سيُحوّل إلى 4 مشرفين للتصويت. سيتمكنون من رؤية السبب. هل تريد المتابعة؟')) return;
    setIsSubmitting(true);
    try {
      await createAccountClosureRequest({
        studentId: selected.targetId,
        studentName: selected.targetName,
        studentPhone: selected.targetPhone,
        studentClass: selected.targetClass,
        reason: closureReason.trim(),
        createdBy: user.id,
        createdByName: user.name || user.username || 'مشرف'
      });
      await resolveReport();
      toast.success('✅ تم إنشاء طلب إغلاق الحساب — سيُرسل إلى 4 مشرفين للتصويت');
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setIsSubmitting(false); }
  };

  const selectedActiveWarnings = selected
    ? getActiveWarnings(selected.targetActiveWarnings || [])
    : [];

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-red-500/20">
      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <h3 className="text-xl font-semibold text-red-300 flex items-center gap-2">
          <FaExclamationTriangle /> البلاغات المعلّقة ({reports.length})
        </h3>
      </div>

      {reports.length === 0 ? (
        <p className="text-gray-400 text-center py-4">لا توجد بلاغات معلّقة حالياً.</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {reports.map(r => (
            <div key={r.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">
                    <strong>ضد:</strong> {r.targetName} {r.targetClass && <span className="text-gray-400 text-xs">({r.targetClass})</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    <strong>مقدم البلاغ:</strong> {r.requestedByName || 'معلم'}
                  </p>
                  <p className="text-xs text-red-200 mt-1">
                    <strong>السبب:</strong> {r.payload?.reason || 'غير محدد'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    {r.createdAt?.toDate?.() ? new Date(r.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                  </p>
                </div>
                <button
                  onClick={() => openReport(r)}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
                >
                  <FaEye /> مراجعة واتخاذ إجراء
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
             onClick={closeModal}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-red-500/30"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-red-300">مراجعة البلاغ</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl mb-4 space-y-2">
              <p className="text-sm text-gray-300"><strong>ضد:</strong> {selected.targetName}</p>
              <p className="text-sm text-gray-300"><strong>الشعبة:</strong> {selected.targetClass}</p>
              <p className="text-sm text-gray-300"><strong>مقدم البلاغ:</strong> {selected.requestedByName}</p>
              <p className="text-sm text-red-200"><strong>السبب:</strong> {selected.payload?.reason}</p>
            </div>

            {!actionMode && (
              <div className="space-y-3">
                <button onClick={() => setActionMode('notice')}
                  className="w-full p-3 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/40 rounded-xl text-yellow-200 text-sm">
                  📢 تنبيه تحذيري (أخف من الإنذار)
                </button>
                <button onClick={() => setActionMode('warning')}
                  className="w-full p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 rounded-xl text-orange-200 text-sm">
                  ⚠️ إصدار إنذار رسمي (بحد أقصى 3)
                </button>
                <button onClick={() => setActionMode('closure')}
                  className="w-full p-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 rounded-xl text-red-200 text-sm">
                  <FaBan className="inline me-2" /> إغلاق الحساب وحظر الرقم نهائياً (يحتاج تصويت 4 مشرفين)
                </button>
                <button onClick={async () => {
                  await resolveReport();
                  toast.success('تم تجاهل البلاغ');
                  closeModal();
                }}
                  className="w-full p-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-gray-300 text-xs">
                  تجاهل البلاغ وإغلاقه
                </button>
              </div>
            )}

            {actionMode === 'notice' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-300">نص التنبيه</label>
                <textarea
                  className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-28"
                  placeholder="اكتب نص التنبيه التحذيري..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={handleNotice} disabled={isSubmitting}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg">
                    <FaPaperPlane className="inline me-1" /> حفظ التنبيه
                  </button>
                  <button onClick={() => setActionMode(null)} className="bg-gray-600 hover:bg-gray-700 px-4 rounded-lg text-white">رجوع</button>
                </div>
              </div>
            )}

            {actionMode === 'warning' && (
              <div className="space-y-3">
                <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/30 text-xs text-amber-200">
                  عدد الإنذارات النشطة الحالي: <strong>{selectedActiveWarnings.length}</strong> / 3
                  {selectedActiveWarnings.length >= 3 && (
                    <p className="text-red-300 mt-1">⚠️ الطالب لديه 3 إنذارات نشطة بالفعل. استخدم خيار الإغلاق.</p>
                  )}
                </div>
                <label className="text-sm text-gray-300">سبب الإنذار (سيُرسل لولي الأمر)</label>
                <textarea
                  className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-28"
                  placeholder="اكتب السبب بالعربية الفصحى..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={handleWarning} disabled={isSubmitting || selectedActiveWarnings.length >= 3}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg disabled:opacity-50">
                    إصدار إنذار #{selectedActiveWarnings.length + 1}
                  </button>
                  <button onClick={() => setActionMode(null)} className="bg-gray-600 hover:bg-gray-700 px-4 rounded-lg text-white">رجوع</button>
                </div>
              </div>
            )}

            {actionMode === 'closure' && (
              <div className="space-y-3">
                <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/30 text-xs text-red-200">
                  ⚠️ هذا القرار سيُرسل إلى 4 مشرفين آخرين للتصويت. لا يُنفذ فوراً.
                </div>
                <label className="text-sm text-gray-300">سبب الإغلاق (بالعربية الفصحى)</label>
                <textarea
                  className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-32"
                  placeholder="اكتب السبب بالتفصيل — سيُرسل لولي الأمر..."
                  value={closureReason}
                  onChange={e => setClosureReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <button onClick={handleClosure} disabled={isSubmitting}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg">
                    <FaBan className="inline me-1" /> إرسال طلب الإغلاق للتصويت
                  </button>
                  <button onClick={() => setActionMode(null)} className="bg-gray-600 hover:bg-gray-700 px-4 rounded-lg text-white">رجوع</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsReviewSection;