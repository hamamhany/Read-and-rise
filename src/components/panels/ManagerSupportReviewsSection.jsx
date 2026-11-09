// src/components/panels/ManagerSupportReviewsSection.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaExclamationTriangle, FaEye, FaUser, FaHeadset
} from 'react-icons/fa';
import {
  subscribeToManagerReviewTickets, subscribeToManagerOpenTickets,
  managerDecide, finalizeAndDeleteTicket, claimTicket
} from '../../services/support';
import {
  sendSupervisorRatingWarningMessage, sendApologyToStudentMessage,
  sendComplaintRejectedMessage
} from '../../utils/whatsapp';
import { doc, getDoc, collection, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { SUPPORT_RATING_CATEGORIES, SUPPORT_TICKET_STATUS } from '../../constants';
import SupportChat from '../common/SupportChat';

const ManagerSupportReviewsSection = ({ user }) => {
  const [reviews, setReviews] = useState([]);
  const [openTickets, setOpenTickets] = useState([]);
  const [myManagerTickets, setMyManagerTickets] = useState([]); // ✅ جديد
  const [selected, setSelected] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [student, setStudent] = useState(null);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [openChatId, setOpenChatId] = useState(null);

  useEffect(() => {
    const u1 = subscribeToManagerReviewTickets(setReviews);
    const u2 = subscribeToManagerOpenTickets(setOpenTickets);
    return () => { u1(); u2(); };
  }, []);

  // ✅ جديد — تذاكر المدير النشطة (المحجوزة) حتى يتمكن من فتحها مرة أخرى
  useEffect(() => {
    const q = query(
      collection(db, 'supportTickets'),
      where('assignedSupervisorId', '==', user.id),
      where('status', 'in', [
        SUPPORT_TICKET_STATUS.IN_PROGRESS,
        SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
        SUPPORT_TICKET_STATUS.AWAITING_RATING
      ]),
      orderBy('updatedAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q,
      (snap) => setMyManagerTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn('myManagerTickets subscription:', err.message)
    );
    return () => unsub();
  }, [user.id]);

  const openReview = async (ticket) => {
    setSelected(ticket);
    setMode(null);
    setReason('');
    try {
      if (ticket.assignedSupervisorId) {
        const s = await getDoc(doc(db, 'profiles', ticket.assignedSupervisorId));
        if (s.exists()) setSupervisor({ id: s.id, ...s.data() });
      }
      if (ticket.studentId) {
        const st = await getDoc(doc(db, 'profiles', ticket.studentId));
        if (st.exists()) setStudent({ id: st.id, ...st.data() });
      }
    } catch (e) { console.warn(e); }
  };

  const closeModal = () => {
    setSelected(null); setSupervisor(null); setStudent(null);
    setMode(null); setReason('');
  };

  const handleClaimOpenTicket = async (ticketId) => {
    try {
      await claimTicket(ticketId, user.id, user.name || 'مدير النظام', true);
      toast.success('✅ تم استلام التذكرة');
      setOpenChatId(ticketId);
    } catch (e) { toast.error(e.message); }
  };

  const handleApologize = async () => {
    if (!reason.trim()) { toast.error('اكتب سبب الاعتذار للمشرف'); return; }
    setProcessing(true);
    try {
      if (supervisor) {
        sendSupervisorRatingWarningMessage(supervisor, selected.rating, reason.trim());
      }
      if (student) {
        sendApologyToStudentMessage(student);
      }
      await managerDecide(selected.id, 'apologize', reason.trim());
      toast.success('✅ تم تسجيل القرار. اضغط "إنهاء وحذف" بعد إرسال الرسائل.');
      setMode('apologize');
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleReject = async () => {
    if (!window.confirm('سيتم إلغاء الشكوى وإعطاء المشرف 5 نجوم وإرسال تحذير حازم للطالب. متابعة؟')) return;
    setProcessing(true);
    try {
      if (student) {
        const classIds = student.classIds || [];
        let classNames = '';
        if (classIds.length > 0) {
          try {
            const { fetchClassNames } = await import('../../utils/helpers');
            const map = await fetchClassNames(classIds);
            classNames = classIds.map(id => map[id]).filter(Boolean).join(', ');
          } catch (e) { console.warn(e); }
        }
        sendComplaintRejectedMessage(student, classNames);
      }
      await managerDecide(selected.id, 'reject', '');
      toast.success('✅ تم رفض الشكوى. اضغط "إنهاء وحذف" بعد إرسال الرسالة.');
      setMode('reject');
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleFinalize = async () => {
    if (!window.confirm('سيتم حذف التذكرة نهائياً من السيرفر. تأكد من إرسال جميع الرسائل أولاً. متابعة؟')) return;
    setProcessing(true);
    try {
      await finalizeAndDeleteTicket(selected.id);
      toast.success('✅ تم حذف التذكرة نهائياً');
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  // ✅ لا نخفي القسم إذا كانت هناك دردشة مفتوحة أو تذاكر نشطة للمدير
  if (
    reviews.length === 0 &&
    openTickets.length === 0 &&
    myManagerTickets.length === 0 &&
    !openChatId
  ) return null;

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-rose-500/20">
      <h3 className="text-xl font-semibold text-rose-300 flex items-center gap-2 mb-4">
        <FaExclamationTriangle /> مراجعات تقييمات الدعم ({reviews.length})
      </h3>

      {/* التقييمات السلبية */}
      {reviews.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
          {reviews.map(t => {
            const catLabel = SUPPORT_RATING_CATEGORIES.find(c => c.value === t.ratingCategory)?.label || '';
            return (
              <div key={t.id} className="p-3 bg-black/30 rounded-lg border border-rose-500/30">
                <div className="flex justify-between items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm">
                      <strong>الطالب:</strong> {t.studentName}
                      {t.studentSerialNumber && <span className="text-xs text-gray-400 mx-1">({t.studentSerialNumber})</span>}
                    </p>
                    <p className="text-xs text-rose-200 mt-1">
                      ⭐ {t.rating}/5 — {catLabel}
                    </p>
                    <p className="text-xs text-gray-300 mt-1 line-clamp-2">"{t.ratingReason}"</p>
                    <p className="text-xs text-cyan-300 mt-1">المشرف: {t.assignedSupervisorName}</p>
                  </div>
                  <button onClick={() => openReview(t)} className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg">
                    <FaEye /> مراجعة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* تذاكر المدير النشطة (المحجوزة) — جديدة */}
      {myManagerTickets.length > 0 && (
        <div className="border-t border-gray-700 pt-4 mt-4">
          <p className="text-sm text-emerald-200 font-bold mb-2 flex items-center gap-2">
            <FaHeadset /> تذاكرك النشطة ({myManagerTickets.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {myManagerTickets.map(t => (
              <div key={t.id} className="p-2 bg-black/30 rounded-lg border border-emerald-500/20 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs truncate"><FaUser className="inline me-1" />{t.studentName}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {t.messages?.[t.messages.length - 1]?.text || 'لا توجد رسائل'}
                  </p>
                </div>
                <button onClick={() => setOpenChatId(t.id)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg">
                  فتح
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* تذاكر المشرفين (غير محجوزة) */}
      {openTickets.length > 0 && (
        <div className="border-t border-gray-700 pt-4 mt-4">
          <p className="text-sm text-cyan-200 font-bold mb-2 flex items-center gap-2">
            <FaHeadset /> تذاكر من المشرفين ({openTickets.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {openTickets.map(t => (
              <div key={t.id} className="p-2 bg-black/30 rounded-lg border border-cyan-500/20 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs truncate"><FaUser className="inline me-1" />{t.studentName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{t.messages?.[0]?.text}</p>
                </div>
                <button onClick={() => handleClaimOpenTicket(t.id)} className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded-lg">
                  استلام
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {openChatId && (
        <SupportChat
          user={user}
          ticketId={openChatId}
          viewerMode="manager"
          onClose={() => setOpenChatId(null)}
        />
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={closeModal}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-rose-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-rose-300">مراجعة تقييم سلبي</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>

            <div className="bg-gray-800/60 p-3 rounded-xl mb-3 text-sm">
              <p className="text-cyan-200 font-bold mb-1">👤 الطالب:</p>
              <p className="text-gray-300">الاسم: {selected.studentName}</p>
              {selected.studentSerialNumber && <p className="text-gray-300">الرقم التسلسلي: {selected.studentSerialNumber}</p>}
              {selected.studentPhone && <p className="text-gray-300">الهاتف: <span dir="ltr">{selected.studentPhone}</span></p>}
            </div>

            <div className="bg-gray-800/60 p-3 rounded-xl mb-3 text-sm">
              <p className="text-cyan-200 font-bold mb-1">🛡️ المشرف:</p>
              <p className="text-gray-300">الاسم: {selected.assignedSupervisorName}</p>
              {supervisor && (
                <>
                  <p className="text-gray-300">الهاتف: <span dir="ltr">{supervisor.phone}</span></p>
                  {supervisor.ratingCount > 0 && (
                    <p className="text-gray-300">التقييم الحالي: ⭐ {supervisor.ratingAverage?.toFixed?.(1) || supervisor.ratingAverage} ({supervisor.ratingCount} تقييم)</p>
                  )}
                </>
              )}
            </div>

            <div className="bg-rose-500/10 p-3 rounded-xl mb-3 text-sm border border-rose-500/30">
              <p className="text-rose-200 font-bold mb-1">⭐ التقييم السلبي:</p>
              <p className="text-gray-200">النجوم: {selected.rating}/5</p>
              <p className="text-gray-200">السبب: {SUPPORT_RATING_CATEGORIES.find(c => c.value === selected.ratingCategory)?.label}</p>
              <p className="text-gray-200">التفاصيل: "{selected.ratingReason}"</p>
            </div>

            <div className="bg-gray-800/40 p-3 rounded-xl mb-3 max-h-60 overflow-y-auto border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">📜 سجل المحادثة الكامل:</p>
              {selected.messages?.map(m => (
                <div key={m.id} className="text-xs mb-1">
                  <strong className="text-blue-300">{m.senderName}:</strong>
                  <span className="text-gray-300"> {m.text}</span>
                </div>
              ))}
            </div>

            {!mode && (
              <div className="space-y-2">
                <button onClick={() => setMode('apologize')} className="w-full p-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 text-sm">
                  🌸 قبول الشكوى والاعتذار (تنبيه للمشرف + اعتذار للطالب)
                </button>
                <button onClick={handleReject} disabled={processing} className="w-full p-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 rounded-xl text-red-200 text-sm disabled:opacity-50">
                  {processing ? 'جاري المعالجة...' : '🛑 رفض الشكوى (5 نجوم للمشرف + تحذير للطالب)'}
                </button>
              </div>
            )}

            {mode === 'apologize' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-300">سبب الاعتذار (سيُرسل للمشرف):</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm resize-none h-24"
                  placeholder="اشرح للمشرف ما الذي أخطأ فيه..."
                />
                <button onClick={handleApologize} disabled={processing || !reason.trim()} className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg disabled:opacity-50">
                  {processing ? 'جاري الإرسال...' : '📤 إرسال التنبيهات وتأكيد الاعتذار'}
                </button>
              </div>
            )}

            {(mode === 'apologize' || mode === 'reject') && (
              <div className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                <p className="text-green-200 text-xs mb-2">✅ تم تسجيل القرار. اضغط الزر التالي بعد إرسال الرسائل عبر واتساب:</p>
                <button onClick={handleFinalize} disabled={processing} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg">
                  🗑️ إنهاء وحذف التذكرة نهائياً
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerSupportReviewsSection;