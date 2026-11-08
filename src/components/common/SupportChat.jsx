import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPaperPlane, FaStar, FaCheckCircle, FaTimesCircle,
  FaSpinner, FaUserCircle, FaInfoCircle,
  FaHeadset
} from 'react-icons/fa';
import {
  subscribeToTicket, sendTicketMessage, studentConfirmSolved,
  studentConfirmNotSolved, submitRating, requestTicketEnd
} from '../../services/support';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { SUPPORT_TICKET_STATUS, SUPPORT_RATING_CATEGORIES } from '../../constants';

const SupportChat = ({ user, ticketId, onClose, viewerMode = 'student' }) => {
  const [ticket, setTicket] = useState(null);
  const [supervisorInfo, setSupervisorInfo] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingCategory, setRatingCategory] = useState('');
  const [ratingReason, setRatingReason] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!ticketId) return;
    const unsub = subscribeToTicket(ticketId, (t) => {
      setTicket(t);
      if (t?.assignedSupervisorId) {
        getDoc(doc(db, 'profiles', t.assignedSupervisorId)).then(snap => {
          if (snap.exists()) setSupervisorInfo(snap.data());
        }).catch(() => {});
      }
    });
    return () => unsub();
  }, [ticketId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [ticket?.messages?.length]);

  if (!ticket) {
    return (
      <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center" onClick={onClose}>
        <div className="bg-gray-900 p-6 rounded-2xl text-gray-300" onClick={e => e.stopPropagation()}>
          <FaSpinner className="animate-spin inline me-2" /> جاري التحميل...
        </div>
      </div>
    );
  }

  const isStudent = viewerMode === 'student';
  const canSend = isStudent
    ? [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.IN_PROGRESS].includes(ticket.status)
    : [SUPPORT_TICKET_STATUS.IN_PROGRESS, SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED].includes(ticket.status);

  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await sendTicketMessage(ticketId, {
        id: user.id, name: user.name || user.username || 'مستخدم', role: user.role
      }, t);
      setText('');
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setSending(false); }
  };

  const handleSolved = async () => {
    try {
      await studentConfirmSolved(ticketId);
      setShowRating(true);
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  const handleNotSolved = async () => {
    try {
      await studentConfirmNotSolved(ticketId);
      toast.success('تم إبلاغ المشرف — يمكنك متابعة المحادثة');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  const submitRatingAndClose = async () => {
    if (!rating || rating < 1 || rating > 5) { toast.error('اختر عدد النجوم'); return; }
    if (rating < 5) {
      if (!ratingCategory) { toast.error('اختر سبب التقييم'); return; }
      if (!ratingReason.trim()) { toast.error('اكتب سبب التقييم'); return; }
    }
    setSubmittingRating(true);
    try {
      await submitRating(ticketId, rating, ratingCategory, ratingReason.trim());
      toast.success(rating === 5 ? '✅ شكراً لتقييمك' : '✅ تم إرسال تقييمك للمدير للمراجعة');
      setShowRating(false);
      setTimeout(onClose, 1500);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setSubmittingRating(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0">
            <FaHeadset className="text-blue-400 text-lg flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-white font-bold text-sm truncate">الدعم الفني</p>
              <p className="text-[10px] text-gray-400 truncate">
                {ticket.assignedSupervisorName
                  ? `مع: ${ticket.assignedSupervisorName}`
                  : 'بانتظار مشرف...'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl flex-shrink-0"><FaTimes /></button>
        </div>

        {/* Supervisor info */}
        {supervisorInfo && isStudent && (
          <div className="px-3 py-2 bg-blue-500/5 border-b border-blue-500/20 text-[11px] text-blue-200">
            <FaUserCircle className="inline me-1" /> {supervisorInfo.name || 'مشرف'}
            {supervisorInfo.age && <span className="mx-2">• {supervisorInfo.age} سنة</span>}
            {supervisorInfo.gender && <span className="mx-2">• {supervisorInfo.gender}</span>}
            {supervisorInfo.ratingCount > 0 && (
              <span className="mx-2">• ⭐ {supervisorInfo.ratingAverage?.toFixed?.(1) || supervisorInfo.ratingAverage} ({supervisorInfo.ratingCount})</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
          {ticket.messages?.map((m) => {
            const isMe = m.senderId === user.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-2 rounded-xl text-sm ${
                  isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none'
                }`}>
                  {!isMe && <p className="text-[10px] font-bold text-blue-300 mb-0.5">{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className="text-[9px] opacity-60 mt-1">
                    {m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status banners */}
        {ticket.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED && isStudent && (
          <div className="p-3 bg-yellow-500/10 border-t border-yellow-500/30">
            <p className="text-yellow-200 text-sm text-center mb-2">هل تم حل مشكلتك بنجاح؟</p>
            <div className="flex gap-2">
              <button onClick={handleSolved} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold">
                <FaCheckCircle className="inline me-1" /> نعم، تم الحل
              </button>
              <button onClick={handleNotSolved} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold">
                <FaTimesCircle className="inline me-1" /> لم تُحل
              </button>
            </div>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.AWAITING_RATING && isStudent && !showRating && (
          <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-center">
            <p className="text-green-200 text-sm mb-2">✅ شكراً لتأكيدك — يرجى تقييم الخدمة</p>
            <button onClick={() => setShowRating(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold">
              <FaStar className="inline me-1" /> تقييم الخدمة
            </button>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.RATED_LOW && isStudent && (
          <div className="p-3 bg-amber-500/10 border-t border-amber-500/30 text-center text-amber-200 text-sm">
            <FaInfoCircle className="inline me-1" /> تقييمك قيد المراجعة من قبل المدير.
          </div>
        )}

        {(ticket.status === SUPPORT_TICKET_STATUS.RATED_FULL ||
          ticket.status === SUPPORT_TICKET_STATUS.MANAGER_APOLOGIZED ||
          ticket.status === SUPPORT_TICKET_STATUS.MANAGER_REJECTED ||
          ticket.status === SUPPORT_TICKET_STATUS.AUTO_CLOSED) && (
          <div className="p-3 bg-gray-800 border-t border-gray-700 text-center text-gray-300 text-sm">
            ✅ تم إغلاق هذه التذكرة.
          </div>
        )}

        {/* Input */}
        {canSend && (
          <div className="p-2 border-t border-gray-700 flex gap-2">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !sending && handleSend()}
              placeholder="اكتب رسالتك..."
              className="flex-1 bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm"
              maxLength={2000}
            />
            <button onClick={handleSend} disabled={sending || !text.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg disabled:opacity-40">
              {sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}
            </button>
          </div>
        )}

        {/* Rating Modal */}
        {showRating && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-yellow-500/30">
              <h3 className="text-lg font-bold text-yellow-300 text-center mb-3">قيّم الخدمة</h3>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRating(n)} className="text-3xl">
                    <FaStar className={n <= rating ? 'text-yellow-400' : 'text-gray-600'} />
                  </button>
                ))}
              </div>

              {rating > 0 && rating < 5 && (
                <>
                  <div className="mb-3">
                    <label className="text-sm text-gray-300 block mb-1">اختر السبب <span className="text-red-400">*</span></label>
                    <select value={ratingCategory} onChange={e => setRatingCategory(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm">
                      <option value="">اختر</option>
                      {SUPPORT_RATING_CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="text-sm text-gray-300 block mb-1">اذكر التفاصيل <span className="text-red-400">*</span></label>
                    <textarea value={ratingReason} onChange={e => setRatingReason(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm resize-none h-20" placeholder="اكتب سبب التقييم بالتفصيل..." />
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button onClick={submitRatingAndClose} disabled={submittingRating || !rating} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-bold disabled:opacity-50">
                  {submittingRating ? 'جاري الإرسال...' : 'إرسال التقييم'}
                </button>
                <button onClick={() => setShowRating(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">إلغاء</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportChat;