import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPaperPlane, FaStar, FaCheckCircle, FaTimesCircle,
  FaSpinner, FaHeadset, FaPhone, FaLock, FaWhatsapp, FaTrashAlt, FaBan
} from 'react-icons/fa';
import {
  subscribeToTicket, sendTicketMessage, studentConfirmSolved,
  studentConfirmNotSolved, submitRating, requestTicketEnd,
  transferToManager, requestContactInfo, markTicketAsRead, claimTicket,
  approveContactRequest, rejectContactRequest, deleteTicketPermanently
} from '../../services/support';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { SUPPORT_TICKET_STATUS, SUPPORT_RATING_CATEGORIES, CONTACT_REQUEST_STATUS } from '../../constants';

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
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactReason, setContactReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [contactMode, setContactMode] = useState('registered');
  const [customContactNumber, setCustomContactNumber] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [processingContact, setProcessingContact] = useState(false);
  const [showRejectContactModal, setShowRejectContactModal] = useState(false);
  const [rejectContactReason, setRejectContactReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef(null);

  const contactReasons = [
    'إرسال صورة للتوضيح', 'إرسال فيديو للتوضيح', 'مشكلة تقنية',
    'استفسار عن الدرجات', 'مشكلة في الحساب', 'طلب توضيح إضافي', 'سبب آخر'
  ];

  useEffect(() => {
    if (!ticketId) return;
    if (viewerMode === 'student') markTicketAsRead(ticketId, 'student');
    if (viewerMode === 'supervisor') markTicketAsRead(ticketId, 'supervisor');

    const unsub = subscribeToTicket(ticketId, (t) => {
      setTicket(t);
      if (t?.assignedSupervisorId) {
        getDoc(doc(db, 'profiles', t.assignedSupervisorId)).then(snap => {
          if (snap.exists()) setSupervisorInfo(snap.data());
        }).catch(() => {});
      }
    });
    return () => unsub();
  }, [ticketId, viewerMode]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
  const isSupervisor = viewerMode === 'supervisor';
  const isManager = viewerMode === 'manager';
  const isClaimedByMe = ticket.assignedSupervisorId === user.id;

  const canSend = isStudent
    ? [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.IN_PROGRESS].includes(ticket.status)
    : isClaimedByMe && [
        SUPPORT_TICKET_STATUS.IN_PROGRESS,
        SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED
      ].includes(ticket.status);

  const contactRequest = ticket.contactRequest;
  const contactStatus = contactRequest?.status;
  const contactModeStored = contactRequest?.mode || 'registered';

  // ============ إرسال ============
  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await sendTicketMessage(ticketId, { id: user.id, name: user.name || user.username || 'مستخدم', role: user.role }, t);
      setText('');
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setSending(false); }
  };

  const handleClaim = async () => {
    if (!window.confirm('هل تريد حجز هذه التذكرة لاستلامها؟')) return;
    setClaiming(true);
    try {
      await claimTicket(ticketId, user.id, user.name || user.username || 'مشرف', isManager);
      toast.success('✅ تم حجز التذكرة بنجاح');
    } catch (e) {
      toast.error('فشل الحجز: ' + e.message);
    } finally {
      setClaiming(false);
    }
  };

  // ============ مشرف ============
  const handleEndTicket = async () => {
    if (!window.confirm('هل أنت متأكد من إنهاء المحادثة؟ سيتم إرسال طلب للطالب للتأكيد.')) return;
    try {
      await requestTicketEnd(ticketId);
      toast.success('تم طلب الإنهاء');
      onClose();
    } catch (e) { toast.error(e.message); }
  };

  const handleTransferToManager = async () => {
    if (!window.confirm('تحويل التذكرة للمدير؟ لن تتمكن من الرد بعد الآن.')) return;
    try {
      await transferToManager(ticketId, user.name || user.username);
      toast.success('تم التحويل للمدير');
      onClose();
    } catch (e) { toast.error(e.message); }
  };

  // ============ طلب الرقم (مشرف + مدير) ============
  const handleRequestContact = async () => {
    const finalReason = contactReason === 'سبب آخر' ? customReason : contactReason;
    if (!finalReason) return toast.error('اختر السبب');

    let phoneToStore = null;
    if (contactMode === 'other') {
      const phoneDigits = customContactNumber.replace(/[^\d]/g, '');
      if (!phoneDigits) return toast.error('يرجى إدخال رقم التواصل');
      if (phoneDigits.length < 10 || phoneDigits.length > 15) {
        return toast.error('رقم التواصل غير صالح (10-15 رقماً)');
      }
      phoneToStore = phoneDigits;
    }

    try {
      await requestContactInfo(ticketId, finalReason, user.id, {
        mode: contactMode,
        customNumber: phoneToStore,
        isManager
      });
      toast.success(
        isManager
          ? '✅ تم تسجيل طلب الرقم — سترى زر التواصل الآن'
          : '✅ تم إرسال طلب الرقم للمدير — بانتظار الموافقة'
      );
      setShowContactModal(false);
      setContactReason('');
      setCustomReason('');
      setContactMode('registered');
      setCustomContactNumber('');
    } catch (e) { toast.error(e.message); }
  };

  // ============ مدير ============
  const handleApproveContact = async () => {
    if (!window.confirm('الموافقة على طلب الرقم من المشرف؟')) return;
    setProcessingContact(true);
    try {
      await approveContactRequest(ticketId, user.id);
      toast.success('✅ تمت الموافقة');
    } catch (e) { toast.error(e.message); }
    finally { setProcessingContact(false); }
  };

  const handleRejectContactSubmit = async () => {
    setProcessingContact(true);
    try {
      await rejectContactRequest(ticketId, user.id, rejectContactReason.trim());
      toast.success('تم رفض الطلب');
      setShowRejectContactModal(false);
      setRejectContactReason('');
    } catch (e) { toast.error(e.message); }
    finally { setProcessingContact(false); }
  };

  const handlePermanentDelete = async () => {
    if (!window.confirm('⚠️ سيتم حذف التذكرة نهائياً من السيرفر ولا يمكن استرجاعها. متأكد؟')) return;
    setDeleting(true);
    try {
      await deleteTicketPermanently(ticketId);
      toast.success('✅ تم حذف التذكرة نهائياً من السيرفر');
      onClose();
    } catch (e) { toast.error('فشل الحذف: ' + e.message); }
    finally { setDeleting(false); }
  };

  // ============ طالب ============
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

  // ✅ تحديد زر التواصل بناءً على خيار الطلب
  const renderContactButton = () => {
    if (contactStatus !== CONTACT_REQUEST_STATUS.APPROVED) return null;

    if (contactModeStored === 'registered') {
      const phone = ticket.studentPhone;
      if (!phone) {
        return <span className="text-xs text-gray-400">⚠️ رقم الطالب غير مسجل في المنصة</span>;
      }
      return (
        <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
          className="text-green-300 hover:text-green-200 flex items-center gap-1 font-bold">
          <FaWhatsapp /> تواصل مع الطالب: <span dir="ltr">{phone}</span>
        </a>
      );
    } else {
      // رقم آخر — نخفي الرقم ونظهر زر تواصل فقط
      const phone = contactRequest?.customNumber;
      if (!phone) {
        return <span className="text-xs text-gray-400">⚠️ لم يتم تحديد رقم</span>;
      }
      return (
        <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
          className="text-green-300 hover:text-green-200 flex items-center gap-1 font-bold bg-green-500/10 px-3 py-1 rounded-lg border border-green-500/30">
          <FaWhatsapp /> تواصل عبر واتساب
        </a>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()}>

        {/* ============ الهيدر ============ */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <FaHeadset className="text-blue-400 text-lg flex-shrink-0" />
            <p className="text-white font-bold text-sm truncate">الدعم الفني</p>

            {/* أزرار المشرف */}
            {isSupervisor && isClaimedByMe && ticket.status === SUPPORT_TICKET_STATUS.IN_PROGRESS && (
              <>
                <button onClick={handleEndTicket} className="text-xs bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded text-white">إنهاء</button>
                <button onClick={handleTransferToManager} className="text-xs bg-amber-500 hover:bg-amber-600 px-2 py-0.5 rounded text-white">تحويل للمدير</button>
              </>
            )}

            {/* أزرار المدير */}
            {isManager && (
              <>
                <button onClick={() => setShowContactModal(true)} className="text-xs bg-green-600 hover:bg-green-700 px-2 py-0.5 rounded text-white flex items-center gap-1">
                  <FaPhone size={10} /> طلب الرقم
                </button>
                <button onClick={handlePermanentDelete} disabled={deleting} className="text-xs bg-red-700 hover:bg-red-800 px-2 py-0.5 rounded text-white flex items-center gap-1 disabled:opacity-50">
                  {deleting ? <FaSpinner className="animate-spin" size={10} /> : <FaTrashAlt size={10} />}
                  حذف نهائي
                </button>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl flex-shrink-0"><FaTimes /></button>
        </div>

        {/* ============ شريط طلب الرقم — للمشرف ============ */}
        {isSupervisor && isClaimedByMe && ticket.status === SUPPORT_TICKET_STATUS.IN_PROGRESS && (
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50 text-xs">
            {!contactStatus && (
              <button onClick={() => setShowContactModal(true)} className="text-cyan-300 hover:text-cyan-200 flex items-center gap-1">
                <FaPhone size={10} /> الحصول على رقم الطالب
              </button>
            )}
            {contactStatus === CONTACT_REQUEST_STATUS.PENDING && (
              <span className="text-yellow-300 flex items-center gap-1">
                ⏳ طلب الرقم قيد المراجعة من قبل المدير
              </span>
            )}
            {contactStatus === CONTACT_REQUEST_STATUS.APPROVED && renderContactButton()}
            {contactStatus === CONTACT_REQUEST_STATUS.REJECTED && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-red-300">⚠️ تم رفض الطلب{contactRequest.rejectionReason ? `: ${contactRequest.rejectionReason}` : ''}</span>
                <button onClick={() => setShowContactModal(true)} className="text-xs bg-red-500/30 hover:bg-red-500/50 text-red-200 px-2 py-0.5 rounded">طلب مرة أخرى</button>
              </div>
            )}
          </div>
        )}

        {/* ============ شريط طلب الرقم — للمدير ============ */}
        {isManager && contactStatus === CONTACT_REQUEST_STATUS.APPROVED && (
          <div className="mx-3 mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-xs">
            <span className="text-green-200 block mb-1">
              ✅ تم تسجيل طلب الرقم — يمكنك التواصل الآن:
            </span>
            {renderContactButton()}
          </div>
        )}

        {/* ============ موافقة/رفض المدير على طلب المشرف ============ */}
        {isManager && contactStatus === CONTACT_REQUEST_STATUS.PENDING && (
          <div className="m-3 p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl">
            <p className="text-amber-200 text-sm mb-1">📞 طلب الحصول على رقم الطالب</p>
            <p className="text-xs text-gray-300 mb-1">
              <strong>من:</strong> {supervisorInfo?.name || ticket.assignedSupervisorName || 'مشرف'}
            </p>
            <p className="text-xs text-gray-300 mb-1"><strong>السبب:</strong> {contactRequest.reason}</p>
            <p className="text-xs text-cyan-200 mb-2">
              <strong>نوع الرقم المطلوب:</strong>{' '}
              {contactModeStored === 'registered' ? 'الرقم المسجل في المنصة' : 'رقم آخر (مخفي)'}
            </p>
            <p className="text-sm text-white font-bold mb-2">هل توافق؟</p>
            <div className="flex gap-2">
              <button onClick={handleApproveContact} disabled={processingContact}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                {processingContact ? <FaSpinner className="animate-spin inline me-1" /> : <FaCheckCircle className="inline me-1" />}
                موافقة
              </button>
              <button onClick={() => setShowRejectContactModal(true)} disabled={processingContact}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                <FaTimesCircle className="inline me-1" /> رفض
              </button>
            </div>
          </div>
        )}

        {isManager && contactStatus === CONTACT_REQUEST_STATUS.REJECTED && (
          <div className="mx-3 mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-200">
            ❌ تم رفض طلب المشرف. السبب: {contactRequest.rejectionReason || 'غير محدد'}
          </div>
        )}

        {/* ============ المحادثة ============ */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
          {ticket.messages?.map((m) => {
            const isMe = m.senderId === user.id;
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-2 rounded-xl text-sm ${isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-100 rounded-bl-none'}`}>
                  {!isMe && <p className="text-[10px] font-bold text-blue-300 mb-0.5">{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className="text-[9px] opacity-60 mt-1">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ============ حجز التذكرة ============ */}
        {!isStudent && !isClaimedByMe && (
          <div className="p-4 bg-gray-800 border-t border-gray-700 text-center">
            <p className="text-gray-300 text-sm mb-3">لم تقم بحجز هذه التذكرة بعد.</p>
            <button onClick={handleClaim} disabled={claiming}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50">
              {claiming ? <><FaSpinner className="animate-spin inline me-1" /> جاري الحجز...</> : <><FaLock className="inline me-1" /> حجز التذكرة</>}
            </button>
          </div>
        )}

        {/* ============ حالة إنهاء المشرف — للطالب ============ */}
        {ticket.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED && isStudent && (
          <div className="p-3 bg-yellow-500/10 border-t border-yellow-500/30">
            <p className="text-yellow-200 text-sm text-center mb-2">هل تم حل مشكلتك بنجاح؟</p>
            <div className="flex gap-2">
              <button onClick={handleSolved} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold"><FaCheckCircle className="inline me-1" /> نعم</button>
              <button onClick={handleNotSolved} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold"><FaTimesCircle className="inline me-1" /> لم تُحل</button>
            </div>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.AWAITING_RATING && isStudent && !showRating && (
          <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-center">
            <p className="text-green-200 text-sm mb-2">✅ يرجى تقييم الخدمة</p>
            <button onClick={() => setShowRating(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold"><FaStar className="inline me-1" /> تقييم</button>
          </div>
        )}

        {/* ============ مربع الإدخال ============ */}
        {canSend && (
          <div className="p-2 border-t border-gray-700 flex gap-2">
            <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !sending && handleSend()} placeholder="اكتب رسالتك..." className="flex-1 bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm" maxLength={2000} />
            <button onClick={handleSend} disabled={sending || !text.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg disabled:opacity-40">{sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}</button>
          </div>
        )}

        {/* ============ مودال طلب الرقم ============ */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-green-500/30">
              <h3 className="font-bold text-white mb-3">طلب رقم الطالب</h3>

              <label className="text-sm text-gray-300 block mb-1">السبب</label>
              <select className="w-full bg-gray-800 text-white p-2 rounded mb-3" onChange={e => setContactReason(e.target.value)} value={contactReason}>
                <option value="">اختر السبب...</option>
                {contactReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {contactReason === 'سبب آخر' && (
                <input type="text" placeholder="اكتب السبب" className="w-full bg-gray-800 text-white p-2 rounded mb-3" onChange={e => setCustomReason(e.target.value)} />
              )}

              <label className="text-sm text-gray-300 block mb-1">نوع الرقم</label>
              <div className="space-y-1 mb-3">
                <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input type="radio" value="registered" checked={contactMode === 'registered'} onChange={() => setContactMode('registered')} />
                  الرقم المسجل في المنصة (يُعرض للجميع)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                  <input type="radio" value="other" checked={contactMode === 'other'} onChange={() => setContactMode('other')} />
                  إدخال رقم آخر (زر تواصل فقط بدون إظهار الرقم)
                </label>
              </div>

              {contactMode === 'other' && (
                <input
                  type="text" inputMode="numeric"
                  placeholder="أدخل رقم التواصل (مع رمز الدولة)"
                  className="w-full bg-gray-800 text-white p-2 rounded mb-3"
                  onChange={e => setCustomContactNumber(e.target.value)}
                  value={customContactNumber}
                />
              )}

              <p className="text-xs text-gray-400 mb-3">
                {isManager
                  ? '📌 كمدير: سيتم تسجيل الطلب والموافقة عليه فوراً.'
                  : '📌 سيصل الطلب إلى مدير النظام للموافقة أو الرفض.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowContactModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRequestContact} className="px-4 py-2 text-sm bg-green-600 rounded text-white font-bold">
                  {isManager ? 'تأكيد وإظهار الرقم' : 'إرسال الطلب'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ مودال رفض طلب الرقم ============ */}
        {showRejectContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-red-500/30">
              <h3 className="font-bold text-white mb-3">سبب رفض طلب الرقم</h3>
              <textarea value={rejectContactReason} onChange={e => setRejectContactReason(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 rounded mb-2 resize-none h-20"
                placeholder="مثال: لا حاجة لكشف الرقم في هذه الحالة..." />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowRejectContactModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRejectContactSubmit} disabled={processingContact}
                  className="px-4 py-2 text-sm bg-red-600 rounded text-white font-bold disabled:opacity-50">
                  {processingContact ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الرفض
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ مودال التقييم ============ */}
        {showRating && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-yellow-500/30">
              <h3 className="text-lg font-bold text-yellow-300 text-center mb-3">قيّم الخدمة</h3>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} onClick={() => setRating(n)} className="text-3xl"><FaStar className={n <= rating ? 'text-yellow-400' : 'text-gray-600'} /></button>
                ))}
              </div>
              {rating > 0 && rating < 5 && (
                <>
                  <div className="mb-3">
                    <label className="text-sm text-gray-300 block mb-1">اختر السبب <span className="text-red-400">*</span></label>
                    <select value={ratingCategory} onChange={e => setRatingCategory(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm">
                      <option value="">اختر</option>
                      {SUPPORT_RATING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="text-sm text-gray-300 block mb-1">التفاصيل <span className="text-red-400">*</span></label>
                    <textarea value={ratingReason} onChange={e => setRatingReason(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm resize-none h-20" placeholder="اكتب سبب التقييم..." />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button onClick={submitRatingAndClose} disabled={submittingRating || !rating} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg font-bold disabled:opacity-50">{submittingRating ? 'جاري الإرسال...' : 'إرسال التقييم'}</button>
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