import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaEye, FaTimes, FaCheckCircle, FaTimesCircle,
  FaSpinner, FaDownload, FaLock
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, onSnapshot, doc, serverTimestamp, getDocs, limit
} from 'firebase/firestore';
import {
  PASSWORD_RESET_REQUESTS_COLLECTION, PASSWORD_RESET_STATUS,
  MESSAGE_REQUEST_TYPES
} from '../../constants';
import {
  findUserBySerial, approvePasswordReset, rejectPasswordReset,
  claimPasswordResetRequest
} from '../../services/passwordReset';
import { createMessageRequest } from '../../services/messageRequests';
import { fetchClassNames } from '../../utils/helpers';
import { useConfirm } from '../common/ConfirmContext';

const CLAIM_DURATION_MS = 10 * 60 * 1000;

const ResetRequestsSection = ({ user }) => {
  const confirm = useConfirm();
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [resolvedUser, setResolvedUser] = useState(null);
  const [resolvedClassNames, setResolvedClassNames] = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [actionMode, setActionMode] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, PASSWORD_RESET_REQUESTS_COLLECTION),
      where('status', '==', PASSWORD_RESET_STATUS.PENDING),
      where('claimedBy', '==', user.id)
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user.id]);

  const loadMoreRequests = async () => {
    setIsLoading(true);
    try {
      const q = query(
        collection(db, PASSWORD_RESET_REQUESTS_COLLECTION),
        where('status', '==', PASSWORD_RESET_STATUS.PENDING),
        limit(40)
      );
      const snap = await getDocs(q);
      const now = Date.now();
      const candidates = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (data.claimedBy === user.id) continue;
        const claimAge = data.claimedAt?.toMillis?.() ? now - data.claimedAt.toMillis() : Infinity;
        const isLocked = data.claimedBy && claimAge < CLAIM_DURATION_MS;
        if (!isLocked) candidates.push(d);
      }

      let claimedCount = 0;
      for (const d of candidates) {
        if (claimedCount >= 5) break;
        try {
          await claimPasswordResetRequest(d.id, user.id, user.name || user.username || 'مشرف');
          claimedCount++;
        } catch (e) { /* skip */ }
      }

      if (claimedCount === 0) {
        toast('لا توجد طلبات جديدة متاحة حالياً.', { icon: 'ℹ️' });
      } else {
        toast.success(`تم تحميل ${claimedCount} طلب جديد.`);
      }
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally { setIsLoading(false); }
  };

  const openRequest = async (r) => {
    setSelected(r);
    setResolvedUser(null);
    setResolvedClassNames([]);
    setActionMode(null);
    setRejectionReason('');
    setLoadingUser(true);
    try {
      const found = await findUserBySerial(r.submittedSerialNumber);
      if (!found) {
        toast.error('الرقم التسلسلي المُدخل غير موجود في النظام.');
      } else {
        setResolvedUser(found);
        if (found.classIds?.length) {
          const map = await fetchClassNames(found.classIds);
          setResolvedClassNames(found.classIds.map(id => map[id]).filter(Boolean));
        }
      }
    } catch (err) {
      toast.error('فشل جلب البيانات: ' + err.message);
    } finally { setLoadingUser(false); }
  };

  const closeModal = () => {
    setSelected(null); setResolvedUser(null); setResolvedClassNames([]);
    setActionMode(null); setRejectionReason('');
  };

  const handleApprove = async () => {
    if (!resolvedUser) return toast.error('لا يمكن الموافقة بدون مطابقة الرقم التسلسلي.');
    const ok = await confirm('الموافقة على الطلب', 'سيتم تحديث بيانات دخول الطالب وإرسال رسالة عبر واتساب. متابعة؟');
    if (!ok) return;
    setSubmitting(true);
    try {
      const randomNum = Math.floor(Math.random() * 900000) + 100000;
      const newUsername = `knight${randomNum}`;
      const newPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');

      await approvePasswordReset({
        requestId: selected.id,
        resolvedUser,
        newUsername,
        newPassword,
        supervisorId: user.id,
        supervisorName: user.name || user.username || 'مشرف'
      });

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.PASSWORD_RESET_APPROVAL,
        targetType: 'student',
        targetId: resolvedUser.id,
        targetName: resolvedUser.name || selected.submittedName,
        targetPhone: resolvedUser.phone || '',
        targetClass: resolvedClassNames.join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: {
          username: newUsername,
          password: newPassword,
          serialNumber: resolvedUser.serialNumber || selected.submittedSerialNumber
        }
      });

      toast.success(`✅ تمت الموافقة. سيتم إرسال البيانات إلى الرقم المسجل (${resolvedUser.phone}).`);
      closeModal();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!resolvedUser) return toast.error('لا يمكن الرفض قبل التحقق من الرقم التسلسلي.');
    if (!rejectionReason.trim()) return toast.error('أدخل سبب الرفض.');
    setSubmitting(true);
    try {
      await rejectPasswordReset({
        requestId: selected.id,
        reason: rejectionReason.trim(),
        supervisorId: user.id,
        supervisorName: user.name || user.username || 'مشرف'
      });

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.PASSWORD_RESET_REJECTION,
        targetType: 'student',
        targetId: resolvedUser.id,
        targetName: selected.submittedName,
        targetPhone: selected.submittedPhone,
        targetClass: '',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: { reason: rejectionReason.trim() }
      });

      toast.success('تم رفض الطلب وإنشاء رسالة إخطار.');
      closeModal();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-cyan-500/20">
      <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
        <h3 className="text-xl font-semibold text-cyan-300 flex items-center gap-2"><FaLock /> طلباتك المحجوزة ({requests.length})</h3>
        <button onClick={loadMoreRequests} disabled={isLoading} className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          {isLoading ? <FaSpinner className="animate-spin" /> : <FaDownload />}
          {isLoading ? 'جاري التحميل...' : 'تحميل 5 طلبات جديدة'}
        </button>
      </div>

      {requests.length === 0 ? (
        <p className="text-gray-400 text-center py-4">لا توجد طلبات محجوزة لك حالياً — اضغط الزر لتحميل طلبات جديدة.</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {requests.map(r => (
            <div key={r.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm"><strong>الاسم:</strong> {r.submittedName} <span className="text-gray-400 text-xs">({r.submittedGender}، {r.submittedAge} سنة)</span></p>
                  <p className="text-xs text-gray-400 mt-1"><strong>الرقم التسلسلي:</strong> {r.submittedSerialNumber}</p>
                  <p className="text-xs text-gray-400"><strong>الهاتف في الطلب:</strong> <span dir="ltr">{r.submittedPhone}</span></p>
                  <p className="text-[10px] text-gray-500 mt-1">{r.createdAt?.toDate?.() ? new Date(r.createdAt.toDate()).toLocaleString('ar-EG') : ''}</p>
                </div>
                <button onClick={() => openRequest(r)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <FaEye /> مراجعة الطلب
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-cyan-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-cyan-300">مراجعة طلب استعادة بيانات الدخول</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl mb-4 space-y-1 text-sm">
              <p className="text-cyan-200 font-bold mb-1">📝 البيانات المكتوبة في الطلب:</p>
              <p className="text-gray-300"><strong>الاسم:</strong> {selected.submittedName}</p>
              <p className="text-gray-300"><strong>الجنس:</strong> {selected.submittedGender}</p>
              <p className="text-gray-300"><strong>العمر:</strong> {selected.submittedAge}</p>
              <p className="text-gray-300"><strong>الهاتف:</strong> <span dir="ltr">{selected.submittedPhone}</span></p>
              <p className="text-gray-300"><strong>الرقم التسلسلي:</strong> {selected.submittedSerialNumber}</p>
            </div>

            <div className="bg-gray-800/50 p-4 rounded-xl mb-4 space-y-1 text-sm">
              <p className="text-green-200 font-bold mb-1">🔍 البيانات الفعلية من النظام (بالرقم التسلسلي):</p>
              {loadingUser ? (
                <p className="text-gray-400 text-center py-3"><FaSpinner className="animate-spin inline me-2" /> جاري البحث...</p>
              ) : resolvedUser ? (
                <>
                  <p className="text-gray-300"><strong>الاسم:</strong> {resolvedUser.name}</p>
                  <p className="text-gray-300"><strong>اسم المستخدم:</strong> {resolvedUser.username}</p>
                  <p className="text-gray-300"><strong>الجنس:</strong> {resolvedUser.gender || 'غير مسجل'}</p>
                  <p className="text-gray-300"><strong>العمر:</strong> {resolvedUser.age || 'غير مسجل'}</p>
                  <p className="text-gray-300"><strong>الهاتف:</strong> <span dir="ltr">{resolvedUser.phone}</span></p>
                  <p className="text-gray-300"><strong>الشعب:</strong> {resolvedClassNames.join(', ') || 'غير محدد'}</p>
                  <p className="text-gray-300"><strong>الرقم التسلسلي:</strong> {resolvedUser.serialNumber}</p>
                </>
              ) : (
                <p className="text-red-300 text-center py-2">⚠️ الرقم التسلسلي المُدخل لا يطابق أي حساب في النظام — يمكنك الرفض فقط.</p>
              )}
            </div>

            {!actionMode && (
              <div className="space-y-2">
                <button
                  onClick={() => setActionMode('approve')}
                  disabled={!resolvedUser}
                  className="w-full p-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 rounded-xl text-green-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FaCheckCircle className="inline me-2" /> الموافقة وإرسال بيانات دخول جديدة
                </button>
                <button
                  onClick={() => setActionMode('reject')}
                  className="w-full p-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 rounded-xl text-red-200 text-sm"
                >
                  <FaTimesCircle className="inline me-2" /> رفض الطلب
                </button>
              </div>
            )}

            {actionMode === 'approve' && (
              <div className="space-y-3">
                <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/30 text-xs text-green-200">
                  ℹ️ سيتم تحديث بيانات الدخول في Firebase Auth، وإنشاء رسالة واتساب تُرسل إلى الرقم المسجل في النظام (<span dir="ltr">{resolvedUser?.phone}</span>).
                </div>
                <div className="flex gap-2">
                  <button onClick={handleApprove} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg disabled:opacity-50">
                    {submitting ? <FaSpinner className="animate-spin inline me-1" /> : <FaCheckCircle className="inline me-1" />} تأكيد الموافقة
                  </button>
                  <button onClick={() => setActionMode(null)} className="bg-gray-600 hover:bg-gray-700 px-4 rounded-lg text-white">رجوع</button>
                </div>
              </div>
            )}

            {actionMode === 'reject' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-300">سبب الرفض (سيُرسل للرقم المكتوب في الطلب)</label>
                <textarea className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-24" placeholder="مثال: الرقم التسلسلي غير مطابق..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={handleReject} disabled={submitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg disabled:opacity-50">
                    {submitting ? <FaSpinner className="animate-spin inline me-1" /> : <FaTimesCircle className="inline me-1" />} تأكيد الرفض
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

export default ResetRequestsSection;