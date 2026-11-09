import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPaperPlane, FaStar, FaCheckCircle, FaTimesCircle,
  FaSpinner, FaHeadset, FaPhone, FaLock, FaWhatsapp, FaTrashAlt, FaHourglassHalf
} from 'react-icons/fa';
import {
  subscribeToTicket, sendTicketMessage, studentConfirmSolved,
  studentConfirmNotSolved, submitRating, requestTicketEnd,
  transferToManager, requestContactInfo, markTicketAsRead, claimTicket,
  approveContactRequest, rejectContactRequest,
  requestTicketDeletion, approveDeletionBySupervisor, rejectDeletionBySupervisor,
  approveDeletionByStudent, rejectDeletionByStudent
} from '../../services/support';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  SUPPORT_TICKET_STATUS, SUPPORT_RATING_CATEGORIES,
  CONTACT_REQUEST_STATUS, DELETE_REQUEST_STATUS
} from '../../constants';

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
  const [claiming, setClaiming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showRejectContactModal, setShowRejectContactModal] = useState(false);
  const [rejectContactReason, setRejectContactReason] = useState('');
  const [showApproveContactModal, setShowApproveContactModal] = useState(false);
  const [approveContactMode, setApproveContactMode] = useState('registered');
  const [approveCustomNumber, setApproveCustomNumber] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const scrollRef = useRef(null);

  const contactReasons = [
    'إرسال صورة للتوضيح', 'إرسال فيديو للتوضيح', 'مشكلة تقنية',
    'استفسار عن الدرجات', 'مشكلة في الحساب', 'طلب توضيح إضافي', 'سبب آخر'
  ];

  useEffect(() => {
    if (!ticketId) return;
    if (viewerMode === 'student') markTicketAsRead(ticketId, 'student');
    if (viewerMode === 'supervisor') markTicketAsRead(ticketId, 'supervisor');
    if (viewerMode === 'manager') markTicketAsRead(ticketId, 'system_manager');

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

  // ============ الأدوار ============
  const isCreator = viewerMode === 'student';
  const isManager = viewerMode === 'manager';
  const isSupervisor = viewerMode === 'supervisor';
  const isAssignedSupervisor = ticket.assignedSupervisorId === user.id;
  const isWorkingOnTicket = isManager || isSupervisor;

  // ✅ منع الإرسال في SUPERVISOR_ENDED للطرفين
  const canSend = isCreator
    ? [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.IN_PROGRESS].includes(ticket.status)
    : isWorkingOnTicket && isAssignedSupervisor && ticket.status === SUPPORT_TICKET_STATUS.IN_PROGRESS;

  const contactRequest = ticket.contactRequest;
  const contactStatus = contactRequest?.status;
  const deleteRequest = ticket.deleteRequest;
  const deleteStatus = deleteRequest?.status;

  const closedStatuses = [
    SUPPORT_TICKET_STATUS.AUTO_CLOSED,
    SUPPORT_TICKET_STATUS.RATED_FULL,
    SUPPORT_TICKET_STATUS.MANAGER_APOLOGIZED,
    SUPPORT_TICKET_STATUS.MANAGER_REJECTED
  ];
  const showContactBar = !closedStatuses.includes(ticket.status) && (
    (isSupervisor && isAssignedSupervisor) || isManager
  );

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
    if (!window.confirm('هل أنت متأكد من إنهاء المحادثة؟ ستتوقف الدردشة حتى يقرر صاحب التذكرة.')) return;
    try {
      await requestTicketEnd(ticketId);
      toast.success('تم طلب الإنهاء — الدردشة متوقفة الآن');
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

  // ============ طلب الرقم ============
  const handleRequestContact = async () => {
    const finalReason = contactReason === 'سبب آخر' ? customReason.trim() : contactReason;
    if (!finalReason) return toast.error('اختر السبب أو اكتبه');
    setProcessing(true);
    try {
      await requestContactInfo(
        ticketId,
        finalReason,
        user.id,
        user.name || user.username || 'فريق الدعم'
      );
      toast.success('✅ تم إرسال طلب الرقم لصاحب التذكرة');
      setShowContactModal(false);
      setContactReason('');
      setCustomReason('');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  // ============ صاحب التذكرة يوافق (مع اختيار نوع الرقم) ============
  const handleConfirmApproveContact = async () => {
    if (approveContactMode === 'other') {
      const digits = approveCustomNumber.replace(/[^\d]/g, '');
      if (digits.length < 10 || digits.length > 15) {
        return toast.error('رقم التواصل غير صالح (10-15 رقماً)');
      }
    }
    setProcessing(true);
    try {
      await approveContactRequest(ticketId, {
        mode: approveContactMode,
        customNumber: approveContactMode === 'other'
          ? approveCustomNumber.replace(/[^\d]/g, '')
          : null
      });
      toast.success('✅ تمت الموافقة');
      setShowApproveContactModal(false);
      setApproveContactMode('registered');
      setApproveCustomNumber('');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleRejectContactSubmit = async () => {
    setProcessing(true);
    try {
      await rejectContactRequest(ticketId, rejectContactReason.trim());
      toast.success('تم رفض الطلب');
      setShowRejectContactModal(false);
      setRejectContactReason('');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  // ============ طلب الحذف (المدير) ============
  const handleRequestDelete = async () => {
    if (!window.confirm('⚠️ سيتم إرسال طلب حذف للمشرف وصاحب التذكرة. لا يتم الحذف مباشرة. متابعة؟')) return;
    setProcessing(true);
    try {
      await requestTicketDeletion(ticketId, user.id, user.name || 'مدير النظام');
      toast.success('✅ تم إرسال طلب الحذف — بانتظار موافقة الطرفين');
      setShowDeleteConfirm(false);
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  // ============ المشرف يوافق/يرفض على الحذف ============
  const handleApproveDeleteSupervisor = async () => {
    if (!window.confirm('الموافقة على حذف التذكرة؟ سيُحذف بعد 24 ساعة إن لم يكن تفاعل.')) return;
    setProcessing(true);
    try {
      await approveDeletionBySupervisor(ticketId);
      toast.success('✅ تمت موافقتك');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleRejectDeleteSupervisor = async () => {
    setProcessing(true);
    try {
      await rejectDeletionBySupervisor(ticketId, 'رفض المشرف');
      toast.success('تم رفض طلب الحذف');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  // ============ صاحب التذكرة يوافق/يرفض على الحذف ============
  const handleApproveDeleteStudent = async () => {
    if (!window.confirm('الموافقة على حذف التذكرة؟ سيُحذف بعد 24 ساعة إن لم يكن تفاعل.')) return;
    setProcessing(true);
    try {
      await approveDeletionByStudent(ticketId);
      toast.success('✅ تمت موافقتك');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleRejectDeleteStudent = async () => {
    setProcessing(true);
    try {
      await rejectDeletionByStudent(ticketId, 'رفض صاحب التذكرة');
      toast.success('تم رفض طلب الحذف');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
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
      toast.success(rating === 5 ? '✅ شكراً لتقييمك' : '✅ تم إرسال تقييمك للمدير');
      setShowRating(false);
      setTimeout(onClose, 1500);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setSubmittingRating(false); }
  };

  // ============ زر التواصل بعد الموافقة ============
  const renderContactButton = () => {
    if (contactStatus !== CONTACT_REQUEST_STATUS.APPROVED) return null;

    const mode = contactRequest?.mode || 'registered';
    const phone = mode === 'other' ? contactRequest?.customNumber : ticket.studentPhone;

    if (!phone) {
      return <span className="text-xs text-gray-400">⚠️ لم يتم توفير رقم للتواصل</span>;
    }

    if (mode === 'registered') {
      return (
        <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-green-300 hover:text-green-200 font-bold bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/30">
          <FaWhatsapp /> تواصل: <span dir="ltr">{phone}</span>
        </a>
      );
    }

    // mode === 'other' — نُخفي الرقم ونعرض زر تواصل فقط
    return (
      <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-green-300 hover:text-green-200 font-bold bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/30">
        <FaWhatsapp /> تواصل عبر واتساب
      </a>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()}>

        {/* ============ الهيدر ============ */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <FaHeadset className="text-blue-400 text-lg flex-shrink-0" />
            <p className="text-white font-bold text-sm truncate">الدعم الفني</p>

            {isSupervisor && isAssignedSupervisor && ticket.status === SUPPORT_TICKET_STATUS.IN_PROGRESS && (
              <>
                <button onClick={handleEndTicket} className="text-xs bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded text-white">إنهاء</button>
                <button onClick={handleTransferToManager} className="text-xs bg-amber-500 hover:bg-amber-600 px-2 py-0.5 rounded text-white">تحويل للمدير</button>
              </>
            )}

            {isManager && isAssignedSupervisor &&
              [SUPPORT_TICKET_STATUS.IN_PROGRESS, SUPPORT_TICKET_STATUS.MANAGER_PENDING].includes(ticket.status) && (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="text-xs bg-red-700 hover:bg-red-800 px-2 py-0.5 rounded text-white flex items-center gap-1">
                <FaTrashAlt size={10} /> طلب حذف
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl flex-shrink-0"><FaTimes /></button>
        </div>

        {/* ============ شريط طلب الرقم — للمشرف المعيّن أو المدير ============ */}
        {showContactBar && (
          <div className="px-3 py-2 border-b border-gray-700 bg-gray-800/50 text-xs">
            {!contactStatus && (
              <button onClick={() => setShowContactModal(true)} className="text-cyan-300 hover:text-cyan-200 flex items-center gap-1">
                <FaPhone size={10} /> طلب رقم صاحب التذكرة
              </button>
            )}
            {contactStatus === CONTACT_REQUEST_STATUS.PENDING && (
              <span className="text-yellow-300">
                ⏳ طلب الرقم قيد المراجعة من صاحب التذكرة
                {contactRequest.requestedByName && ` (من: ${contactRequest.requestedByName})`}
              </span>
            )}
            {contactStatus === CONTACT_REQUEST_STATUS.APPROVED && renderContactButton()}
            {contactStatus === CONTACT_REQUEST_STATUS.REJECTED && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-red-300">
                  ⚠️ رفض صاحب التذكرة المشاركة
                  {contactRequest.rejectionReason ? `: ${contactRequest.rejectionReason}` : ''}
                </span>
                <button onClick={() => setShowContactModal(true)} className="text-xs bg-red-500/30 hover:bg-red-500/50 text-red-200 px-2 py-0.5 rounded">طلب مرة أخرى</button>
              </div>
            )}
          </div>
        )}

        {/* ============ واجهة صاحب التذكرة: الموافقة على طلب الرقم ============ */}
        {isCreator && contactStatus === CONTACT_REQUEST_STATUS.PENDING && (
          <div className="m-3 p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl">
            <p className="text-amber-200 text-sm mb-1">
              📞 يطلب {contactRequest.requestedByName || 'فريق الدعم'} رقمك للتواصل
            </p>
            <p className="text-xs text-gray-300 mb-2"><strong>السبب:</strong> {contactRequest.reason}</p>
            <p className="text-sm text-white font-bold mb-2">هل توافق على مشاركة رقمك؟</p>
            <div className="flex gap-2">
              <button onClick={() => setShowApproveContactModal(true)} disabled={processing}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                {processing ? <FaSpinner className="animate-spin inline me-1" /> : <FaCheckCircle className="inline me-1" />}
                موافقة
              </button>
              <button onClick={() => setShowRejectContactModal(true)} disabled={processing}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50">
                <FaTimesCircle className="inline me-1" /> رفض
              </button>
            </div>
          </div>
        )}

        {isCreator && contactStatus === CONTACT_REQUEST_STATUS.APPROVED && (
          <div className="mx-3 mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-xs text-green-200">
            ✅ وافقت على {contactRequest?.mode === 'other' ? 'التواصل عبر رقم بديل' : 'مشاركة رقمك المسجل'} مع فريق الدعم.
          </div>
        )}

        {/* ============ طلب الحذف — عرض الحالة ============ */}
        {deleteStatus && deleteStatus !== DELETE_REQUEST_STATUS.CANCELLED && (
          <div className={`m-3 p-3 border rounded-xl text-sm ${
            deleteStatus === DELETE_REQUEST_STATUS.BOTH_APPROVED
              ? 'bg-red-500/10 border-red-500/40'
              : 'bg-orange-500/10 border-orange-500/40'
          }`}>
            <p className={`font-bold mb-1 ${deleteStatus === DELETE_REQUEST_STATUS.BOTH_APPROVED ? 'text-red-200' : 'text-orange-200'}`}>
              🗑️ طلب حذف التذكرة
            </p>

            {deleteStatus === DELETE_REQUEST_STATUS.PENDING && (
              <>
                <p className="text-xs text-gray-300 mb-2">
                  طلب المدير <strong>{deleteRequest.requestedByName}</strong> حذف التذكرة.
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  حالة الموافقات:
                  <span className={deleteRequest.supervisorApproved ? 'text-green-400' : 'text-red-400'}>
                    {' '}المشرف {deleteRequest.supervisorApproved ? '✅' : '❌'}
                  </span>
                  <span className={deleteRequest.studentApproved ? 'text-green-400 ml-2' : 'text-red-400 ml-2'}>
                    {' '}صاحب التذكرة {deleteRequest.studentApproved ? '✅' : '❌'}
                  </span>
                </p>

                {isSupervisor && isAssignedSupervisor && !deleteRequest.supervisorApproved && (
                  <div className="flex gap-2">
                    <button onClick={handleApproveDeleteSupervisor} disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ✅ موافقة المشرف
                    </button>
                    <button onClick={handleRejectDeleteSupervisor} disabled={processing}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ❌ رفض
                    </button>
                  </div>
                )}

                {isCreator && !deleteRequest.studentApproved && (
                  <div className="flex gap-2">
                    <button onClick={handleApproveDeleteStudent} disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ✅ موافقة صاحب التذكرة
                    </button>
                    <button onClick={handleRejectDeleteStudent} disabled={processing}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ❌ رفض
                    </button>
                  </div>
                )}

                {isManager && (
                  <p className="text-xs text-yellow-300 mt-1">⏳ بانتظار موافقة الطرفين...</p>
                )}
              </>
            )}

            {deleteStatus === DELETE_REQUEST_STATUS.BOTH_APPROVED && (
              <p className="text-xs text-red-300">
                ⚠️ وافق الطرفان — سيتم حذف التذكرة نهائياً خلال 24 ساعة من الآن إن لم يكن هناك رسائل جديدة.
                <br />أي رسالة جديدة ستلغي طلب الحذف.
              </p>
            )}
          </div>
        )}

        {deleteStatus === DELETE_REQUEST_STATUS.CANCELLED && (
          <div className="mx-3 mt-2 p-2 bg-gray-700/30 border border-gray-600 rounded-lg text-xs text-gray-300">
            ℹ️ تم إلغاء طلب الحذف{deleteRequest.cancelledReason ? `: ${deleteRequest.cancelledReason}` : ''}
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
        {isWorkingOnTicket && !isAssignedSupervisor && (
          <div className="p-4 bg-gray-800 border-t border-gray-700 text-center">
            <p className="text-gray-300 text-sm mb-3">لم تقم بحجز هذه التذكرة بعد.</p>
            <button onClick={handleClaim} disabled={claiming}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50">
              {claiming ? <><FaSpinner className="animate-spin inline me-1" /> جاري الحجز...</> : <><FaLock className="inline me-1" /> حجز التذكرة</>}
            </button>
          </div>
        )}

        {/* ============ حالة SUPERVISOR_ENDED — الدردشة متوقفة للطرفين ============ */}
        {ticket.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED && isCreator && (
          <div className="p-3 bg-yellow-500/10 border-t border-yellow-500/30">
            <p className="text-yellow-200 text-sm text-center mb-2">هل تم حل مشكلتك بنجاح؟</p>
            <div className="flex gap-2">
              <button onClick={handleSolved} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-bold"><FaCheckCircle className="inline me-1" /> نعم</button>
              <button onClick={handleNotSolved} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold"><FaTimesCircle className="inline me-1" /> لم تُحل</button>
            </div>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED && !isCreator && (
          <div className="p-3 bg-yellow-500/10 border-t border-yellow-500/30 text-center">
            <p className="text-yellow-200 text-sm flex items-center justify-center gap-2">
              <FaHourglassHalf /> الدردشة متوقفة بانتظار قرار صاحب التذكرة
            </p>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.AWAITING_RATING && isCreator && !showRating && (
          <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-center">
            <p className="text-green-200 text-sm mb-2">✅ يرجى تقييم الخدمة</p>
            <button onClick={() => setShowRating(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg font-bold"><FaStar className="inline me-1" /> تقييم</button>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.AWAITING_RATING && !isCreator && (
          <div className="p-3 bg-green-500/10 border-t border-green-500/30 text-center text-green-200 text-sm">
            ⏳ بانتظار تقييم صاحب التذكرة
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
              <h3 className="font-bold text-white mb-3">طلب رقم صاحب التذكرة</h3>

              <label className="text-sm text-gray-300 block mb-1">السبب</label>
              <select className="w-full bg-gray-800 text-white p-2 rounded mb-3" onChange={e => setContactReason(e.target.value)} value={contactReason}>
                <option value="">اختر السبب...</option>
                {contactReasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {contactReason === 'سبب آخر' && (
                <input type="text" placeholder="اكتب السبب" className="w-full bg-gray-800 text-white p-2 rounded mb-3" onChange={e => setCustomReason(e.target.value)} value={customReason} />
              )}

              <p className="text-xs text-gray-400 mb-3">
                📌 سيصل الطلب إلى صاحب التذكرة للموافقة أو الرفض.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowContactModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRequestContact} disabled={processing}
                  className="px-4 py-2 text-sm bg-green-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  إرسال الطلب
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ مودال موافقة صاحب التذكرة (مع اختيار نوع الرقم) ============ */}
        {showApproveContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-green-500/30">
              <h3 className="font-bold text-white mb-3">كيف تريد مشاركة رقمك؟</h3>

              <div className="space-y-2 mb-3">
                <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-green-500/40 transition">
                  <input
                    type="radio"
                    name="contactMode"
                    value="registered"
                    checked={approveContactMode === 'registered'}
                    onChange={() => setApproveContactMode('registered')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-bold">📱 مشاركة رقمي المسجل في المنصة</p>
                    <p className="text-xs text-gray-400" dir="ltr">{ticket.studentPhone || 'غير مسجل'}</p>
                    <p className="text-[10px] text-amber-300 mt-1">⚠️ سيظهر رقمك كاملاً لفريق الدعم</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-green-500/40 transition">
                  <input
                    type="radio"
                    name="contactMode"
                    value="other"
                    checked={approveContactMode === 'other'}
                    onChange={() => setApproveContactMode('other')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-bold">✏️ إدخال رقم آخر</p>
                    <p className="text-[10px] text-cyan-300 mt-1">🔒 يرجى العلم أن رقمك الشخصي يُعامل بخصوصية تامة، وسيتم حذفه ومسحه من سجلات التواصل فور انتهائك من الدردشة مع الدعم الفني </p>
                  </div>
                </label>
              </div>

              {approveContactMode === 'other' && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={approveCustomNumber}
                  onChange={e => setApproveCustomNumber(e.target.value)}
                  placeholder="أدخل الرقم مع رمز الدولة "
                  className="w-full bg-gray-800 text-white p-2 rounded mb-3"
                />
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowApproveContactModal(false); setApproveContactMode('registered'); setApproveCustomNumber(''); }} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleConfirmApproveContact} disabled={processing}
                  className="px-4 py-2 text-sm bg-green-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الموافقة
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ مودال رفض طلب الرقم ============ */}
        {showRejectContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-red-500/30">
              <h3 className="font-bold text-white mb-3">سبب رفض مشاركة الرقم (اختياري)</h3>
              <textarea value={rejectContactReason} onChange={e => setRejectContactReason(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 rounded mb-2 resize-none h-20"
                placeholder="مثال: لا أرغب بالمشاركة حالياً..." />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowRejectContactModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRejectContactSubmit} disabled={processing}
                  className="px-4 py-2 text-sm bg-red-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الرفض
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ مودال تأكيد طلب الحذف ============ */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-red-500/30">
              <h3 className="font-bold text-white mb-3">🗑️ طلب حذف التذكرة</h3>
              <p className="text-sm text-gray-300 mb-3">سيتم إرسال طلب حذف إلى:</p>
              <ul className="text-xs text-gray-400 mb-3 list-disc list-inside">
                <li>المشرف المعيّن (إن لم تكن أنت)</li>
                <li>صاحب التذكرة</li>
              </ul>
              <p className="text-xs text-amber-300 mb-3">
                ⚠️ يُحذف فقط إذا وافق الطرفان ولم يكن هناك رسائل جديدة خلال 24 ساعة.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRequestDelete} disabled={processing}
                  className="px-4 py-2 text-sm bg-red-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الطلب
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