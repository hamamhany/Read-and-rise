import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPaperPlane, FaStar, FaCheckCircle, FaTimesCircle,
  FaSpinner, FaHeadset, FaPhone, FaLock, FaWhatsapp, FaTrashAlt,
  FaHourglassHalf, FaExclamationTriangle, FaShieldAlt
} from 'react-icons/fa';
import {
  subscribeToTicket, sendTicketMessage, studentConfirmSolved,
  studentConfirmNotSolved, submitRating, requestTicketEnd,
  transferToManager, requestContactInfo, markTicketAsRead, claimTicket,
  approveContactRequest, rejectContactRequest,
  requestTicketDeletion, approveDeletionBySupervisor, rejectDeletionBySupervisor,
  approveDeletionByStudent, rejectDeletionByStudent,
  reportTicket
} from '../../services/support';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  SUPPORT_TICKET_STATUS, SUPPORT_RATING_CATEGORIES,
  CONTACT_REQUEST_STATUS, DELETE_REQUEST_STATUS,
  SUPPORT_REPORT_REASONS
} from '../../constants';
import { useConfirm } from './ConfirmContext';

const SupportChat = ({ user, ticketId, onClose, viewerMode = 'student' }) => {
  const confirm = useConfirm();
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');

  const scrollRef = useRef(null);
  const [ticketWasLoaded, setTicketWasLoaded] = useState(false);

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
      if (t) setTicketWasLoaded(true);
      if (t?.assignedSupervisorId) {
        getDoc(doc(db, 'profiles', t.assignedSupervisorId)).then(snap => {
          if (snap.exists()) setSupervisorInfo(snap.data());
        }).catch(() => {});
      }
    });
    return () => unsub();
  }, [ticketId, viewerMode]);

  useEffect(() => {
    if (ticketWasLoaded && ticket === null) {
      setTimeout(() => onClose(), 600);
    }
  }, [ticket, ticketWasLoaded, onClose]);

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

  const isCreator = viewerMode === 'student';
  const isManager = viewerMode === 'manager';
  const isSupervisor = viewerMode === 'supervisor';
  const isAssignedSupervisor = ticket.assignedSupervisorId === user.id;
  const isWorkingOnTicket = isManager || isSupervisor;

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

  const showDeleteBar = deleteStatus &&
    deleteStatus !== DELETE_REQUEST_STATUS.CANCELLED &&
    ticket.status !== SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED;

  // ✅ تعديل: دالة الإرسال المربوطة بجوجل جمني
  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      // 1. إرسال رسالة الطالب لقاعدة البيانات (فايربيس) كالعادة
      await sendTicketMessage(ticketId, { id: user.id, name: user.name || user.username || 'مستخدم', role: user.role }, t);
      setText('');

      // 2. إذا كان المرسل هو الطالب، ننادي المساعد الذكي (Gemini)
            if (isCreator) {
        alert("جاري الاتصال بالذكاء الاصطناعي...");
        try {
          const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: t })
          });
          
          const data = await response.json();
          
          if (data.text) {
            // 3. إرسال رد المساعد الذكي لقاعدة البيانات عشان يظهر بالشات
            await sendTicketMessage(
              ticketId, 
              { id: 'ai-assistant', name: 'المساعد الذكي', role: 'system' }, 
              data.text
            );
          }
        } catch (aiError) {
          console.error("خطأ في الاتصال بالمساعد الذكي:", aiError);
        }
      }
    } catch (e) { 
      toast.error('فشل: ' + e.message); 
    } finally { 
      setSending(false); 
    }
  };

  const handleClaim = async () => {
    const ok = await confirm('حجز التذكرة', 'هل تريد حجز هذه التذكرة لاستلامها؟');
    if (!ok) return;
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

  const handleEndTicket = async () => {
    const ok = await confirm('إغلاق التذكرة', 'هل أنت متأكد من إغلاق التذكرة؟ سيظهر لصاحب التذكرة خياران لتأكيد حل المشكلة.');
    if (!ok) return;
    try {
      await requestTicketEnd(ticketId, user.name || user.username || 'المشرف');
      toast.success('تم طلب الإغلاق — بانتظار تأكيد صاحب التذكرة');
    } catch (e) { toast.error(e.message); }
  };

  const handleTransferToManager = async () => {
    const ok = await confirm('تحويل للمدير', 'تحويل التذكرة للمدير؟ لن تتمكن من الرد بعد الآن.');
    if (!ok) return;
    try {
      await transferToManager(ticketId, user.name || user.username);
      toast.success('تم التحويل للمدير');
      onClose();
    } catch (e) { toast.error(e.message); }
  };

  const handleRequestContact = async () => {
    const finalReason = contactReason === 'سبب آخر' ? customReason.trim() : contactReason;
    if (!finalReason) return toast.error('اختر السبب أو اكتبه');
    setProcessing(true);
    try {
      await requestContactInfo(
        ticketId, finalReason, user.id,
        user.name || user.username || 'فريق الدعم'
      );
      toast.success('✅ تم إرسال طلب الرقم لصاحب التذكرة');
      setShowContactModal(false);
      setContactReason('');
      setCustomReason('');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

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

  const handleRequestDelete = async () => {
    const ok = await confirm('طلب حذف التذكرة', 'سيتم إرسال طلب حذف للطرف الآخر. لا يتم الحذف مباشرة حتى يوافق الطرفان. متابعة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      await requestTicketDeletion(
        ticketId,
        user.id,
        user.name || user.username || (isManager ? 'مدير النظام' : 'مشرف')
      );
      toast.success('✅ تم إرسال طلب الحذف — بانتظار موافقة الطرف الآخر');
      setShowDeleteConfirm(false);
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleApproveDeleteSupervisor = async () => {
    const ok = await confirm('تأكيد الحذف', 'الموافقة على حذف التذكرة نهائياً؟ لا يمكن التراجع.');
    if (!ok) return;
    setProcessing(true);
    try {
      const result = await approveDeletionBySupervisor(ticketId);
      if (result?.shouldDelete) {
        toast.success('✅ تم حذف التذكرة نهائياً');
      } else {
        toast.success('✅ تمت موافقتك — بانتظار موافقة صاحب التذكرة');
      }
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleRejectDeleteSupervisor = async () => {
    const ok = await confirm('رفض الحذف', 'رفض طلب حذف التذكرة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      await rejectDeletionBySupervisor(ticketId, 'رفض المشرف');
      toast.success('تم رفض طلب الحذف');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleApproveDeleteStudent = async () => {
    const ok = await confirm('تأكيد الحذف', 'الموافقة على حذف التذكرة نهائياً؟ لا يمكن التراجع.');
    if (!ok) return;
    setProcessing(true);
    try {
      const result = await approveDeletionByStudent(ticketId);
      if (result?.shouldDelete) {
        toast.success('✅ تم حذف التذكرة نهائياً');
      } else {
        toast.success('✅ تمت موافقتك — بانتظار موافقة المشرف');
      }
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
  };

  const handleRejectDeleteStudent = async () => {
    const ok = await confirm('رفض الحذف', 'رفض طلب حذف التذكرة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      await rejectDeletionByStudent(ticketId, 'رفض صاحب التذكرة');
      toast.success('تم رفض طلب الحذف');
    } catch (e) { toast.error(e.message); }
    finally { setProcessing(false); }
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
      toast.success(rating === 5 ? '✅ شكراً لتقييمك' : '✅ تم إرسال تقييمك للمدير');
      setShowRating(false);
      setTimeout(onClose, 1500);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setSubmittingRating(false); }
  };

  const handleSubmitReport = async () => {
    if (!reportReason) return toast.error('اختر سبب البلاغ');
    if (!reportDetails.trim()) return toast.error('اكتب تفاصيل البلاغ');
    const ok = await confirm('تأكيد البلاغ', 'بعد تقديم البلاغ ستُغلق المحادثة مؤقتاً حتى تراجعها الإدارة. متابعة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      await reportTicket(
        ticketId,
        user.id,
        user.name || user.username || 'مشرف',
        reportReason,
        reportDetails.trim()
      );
      toast.success('✅ تم إرسال البلاغ للإدارة — المحادثة محوّلة للمراجعة');
      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

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

    return (
      <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-green-300 hover:text-green-200 font-bold bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/30">
        <FaWhatsapp /> تواصل عبر واتساب
      </a>
    );
  };

  const shouldHideMessage = (m) => {
    if (!m.hiddenFor || !Array.isArray(m.hiddenFor)) return false;
    if (isSupervisor && m.hiddenFor.includes('supervisor')) return true;
    if (isManager && m.hiddenFor.includes('manager')) return true;
    return false;
  };

  const canInitiateDelete =
    ((isManager && isAssignedSupervisor) || (isSupervisor && isAssignedSupervisor)) &&
    [SUPPORT_TICKET_STATUS.IN_PROGRESS, SUPPORT_TICKET_STATUS.MANAGER_PENDING].includes(ticket.status) &&
    (!deleteStatus || deleteStatus === DELETE_REQUEST_STATUS.CANCELLED);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <FaHeadset className="text-blue-400 text-lg flex-shrink-0" />
            <p className="text-white font-bold text-sm truncate">الدعم الفني</p>

            {isSupervisor && isAssignedSupervisor && ticket.status === SUPPORT_TICKET_STATUS.IN_PROGRESS && (
              <>
                <button onClick={handleEndTicket} className="text-xs bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded text-white">إنهاء</button>
                <button onClick={handleTransferToManager} className="text-xs bg-amber-500 hover:bg-amber-600 px-2 py-0.5 rounded text-white">تحويل للمدير</button>
                <button
                  onClick={() => setShowReportModal(true)}
                  className="text-xs bg-red-700 hover:bg-red-800 px-2 py-0.5 rounded text-white flex items-center gap-1"
                >
                  <FaExclamationTriangle size={10} /> إبلاغ
                </button>
              </>
            )}

            {canInitiateDelete && (
              <button onClick={() => setShowDeleteConfirm(true)}
                className="text-xs bg-red-700 hover:bg-red-800 px-2 py-0.5 rounded text-white flex items-center gap-1">
                <FaTrashAlt size={10} /> طلب حذف
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl flex-shrink-0"><FaTimes /></button>
        </div>

        {isCreator && ticket.assignedSupervisorName && !closedStatuses.includes(ticket.status) && (
          <div className="px-3 py-1.5 border-b border-gray-700 bg-green-900/20 text-xs text-green-300 flex items-center gap-1">
            ✅ تم استلام طلبك من قبل {ticket.assignedSupervisorName}
          </div>
        )}

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

        {showDeleteBar && (
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
                  طلب <strong>{deleteRequest.requestedByName}</strong> حذف التذكرة.
                </p>

                {isSupervisor && isAssignedSupervisor && !deleteRequest.supervisorApproved && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleApproveDeleteSupervisor} disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ✅ موافقة
                    </button>
                    <button onClick={handleRejectDeleteSupervisor} disabled={processing}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ❌ رفض
                    </button>
                  </div>
                )}

                {isCreator && !deleteRequest.studentApproved && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={handleApproveDeleteStudent} disabled={processing}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ✅ موافقة
                    </button>
                    <button onClick={handleRejectDeleteStudent} disabled={processing}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-xs font-bold disabled:opacity-50">
                      ❌ رفض
                    </button>
                  </div>
                )}
              </>
            )}

            {deleteStatus === DELETE_REQUEST_STATUS.BOTH_APPROVED && (
              <p className="text-xs text-red-300 flex items-center gap-2">
                <FaSpinner className="animate-spin" /> جاري حذف التذكرة نهائياً...
              </p>
            )}
          </div>
        )}

        {deleteStatus === DELETE_REQUEST_STATUS.CANCELLED && (
          <div className="mx-3 mt-2 p-2 bg-gray-700/30 border border-gray-600 rounded-lg text-xs text-gray-300">
            ℹ️ تم إلغاء طلب الحذف{deleteRequest.cancelledReason ? `: ${deleteRequest.cancelledReason}` : ''}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 200 }}>
          {ticket.messages?.filter(m => !shouldHideMessage(m)).map((m) => {
            const isMe = m.senderId === user.id;
            const isSystem = m.senderRole === 'system';
            return (
              <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-2 rounded-xl text-sm ${
                  isSystem
                    ? 'bg-purple-600/30 text-purple-100 border border-purple-500/40 rounded-bl-none'
                    : isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-gray-700 text-gray-100 rounded-bl-none'
                }`}>
                  {!isMe && <p className={`text-[10px] font-bold mb-0.5 ${isSystem ? 'text-purple-300' : 'text-blue-300'}`}>{m.senderName}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className="text-[9px] opacity-60 mt-1">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
                </div>
              </div>
            );
          })}
        </div>

        {ticket.status === SUPPORT_TICKET_STATUS.REPORTED && (
          <div className="p-4 bg-red-500/10 border-t-2 border-red-500/40 text-center">
            <FaShieldAlt className="text-red-400 text-2xl mx-auto mb-2" />
            <p className="text-red-200 text-sm font-bold mb-1">
              تم تحويل المحادثة إلى قسم المراجعة في الإدارة
            </p>
            <p className="text-xs text-gray-300">
              بسبب تقديم بلاغ على المحادثة. لا يمكن إرسال رسائل حتى تنتهي المراجعة.
            </p>
          </div>
        )}

        {isWorkingOnTicket && !isAssignedSupervisor &&
          [SUPPORT_TICKET_STATUS.OPEN, SUPPORT_TICKET_STATUS.NEEDS_COMPLETION].includes(ticket.status) && (
          <div className="p-4 bg-gray-800 border-t border-gray-700 text-center">
            <p className="text-gray-300 text-sm mb-3">لم تقم بحجز هذه التذكرة بعد.</p>
            <button onClick={handleClaim} disabled={claiming}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50">
              {claiming ? <><FaSpinner className="animate-spin inline me-1" /> جاري الحجز...</> : <><FaLock className="inline me-1" /> حجز التذكرة</>}
            </button>
          </div>
        )}

        {ticket.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED && isCreator && (
          <div className="p-4 bg-yellow-500/10 border-t-2 border-yellow-500/40">
            <p className="text-yellow-200 text-sm text-center mb-3 font-bold">
              📩 طلب {ticket.assignedSupervisorName || 'المشرف'} إغلاق تذكرة الدعم الفني
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleSolved} className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                <FaCheckCircle /> نعم شكراً، لقد حصلت على الدعم الذي أريده
              </button>
              <button onClick={handleNotSolved} className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                <FaTimesCircle /> لا، ما زلت لدي بعض المشاكل
              </button>
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

        {canSend && (
          <div className="p-2 border-t border-gray-700 flex gap-2">
            <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !sending && handleSend()} placeholder="اكتب رسالتك..." className="flex-1 bg-gray-800 text-white p-2 rounded-lg border border-gray-600 text-sm" maxLength={2000} />
            <button onClick={handleSend} disabled={sending || !text.trim()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg disabled:opacity-40">{sending ? <FaSpinner className="animate-spin" /> : <FaPaperPlane />}</button>
          </div>
        )}

        {showReportModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-red-500/30 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-red-300 flex items-center gap-2">
                  <FaExclamationTriangle /> تقديم بلاغ ضد صاحب التذكرة
                </h3>
                <button onClick={() => setShowReportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                سيتم تحويل المحادثة إلى الإدارة للمراجعة. لن تتمكن من إرسال رسائل حتى تنتهي المراجعة.
              </p>

              <label className="text-sm text-gray-300 block mb-1">سبب البلاغ <span className="text-red-400">*</span></label>
              <select
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 mb-3 text-sm"
              >
                <option value="">اختر السبب...</option>
                {SUPPORT_REPORT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              <label className="text-sm text-gray-300 block mb-1">تفاصيل البلاغ <span className="text-red-400">*</span></label>
              <textarea
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 resize-none h-24 text-sm mb-3"
                placeholder="اشرح ما حدث بالتفصيل..."
                maxLength={1000}
              />

              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowReportModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleSubmitReport} disabled={processing}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  إرسال البلاغ
                </button>
              </div>
            </div>
          </div>
        )}

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

        {showApproveContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-green-500/30">
              <h3 className="font-bold text-white mb-3">كيف تريد مشاركة رقمك؟</h3>

              <div className="space-y-2 mb-3">
                <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-green-500/40 transition">
                  <input type="radio" name="contactMode" value="registered" checked={approveContactMode === 'registered'} onChange={() => setApproveContactMode('registered')} className="mt-1" />
                  <div>
                    <p className="font-bold">📱 مشاركة رقمي المسجل في المنصة</p>
                    <p className="text-xs text-gray-400" dir="ltr">{ticket.studentPhone || 'غير مسجل'}</p>
                    <p className="text-[10px] text-amber-300 mt-1"> سيظهر رقمك كاملاً لفريق الدعم</p>
                  </div>
                </label>

                <label className="flex items-start gap-2 text-sm text-gray-200 cursor-pointer p-2 rounded-lg border border-gray-700 hover:border-green-500/40 transition">
                  <input type="radio" name="contactMode" value="other" checked={approveContactMode === 'other'} onChange={() => setApproveContactMode('other')} className="mt-1" />
                  <div>
                    <p className="font-bold">✏️ إدخال رقم آخر</p>
                    <p className="text-[10px] text-cyan-300 mt-1">🔒 رقمك الشخصي يُعامل بخصوصية تامة وسيُحذف من سجلات التواصل بعد الدردشة</p>
                  </div>
                </label>
              </div>

              {approveContactMode === 'other' && (
                <input type="text" inputMode="numeric" value={approveCustomNumber} onChange={e => setApproveCustomNumber(e.target.value)} placeholder="أدخل الرقم مع رمز الدولة" className="w-full bg-gray-800 text-white p-2 rounded mb-3" />
              )}

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowApproveContactModal(false); setApproveContactMode('registered'); setApproveCustomNumber(''); }} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleConfirmApproveContact} disabled={processing} className="px-4 py-2 text-sm bg-green-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الموافقة
                </button>
              </div>
            </div>
          </div>
        )}

        {showRejectContactModal && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-red-500/30">
              <h3 className="font-bold text-white mb-3">سبب رفض مشاركة الرقم (اختياري)</h3>
              <textarea value={rejectContactReason} onChange={e => setRejectContactReason(e.target.value)}
                className="w-full bg-gray-800 text-white p-2 rounded mb-2 resize-none h-20"
                placeholder="مثال: لا أرغب بالمشاركة حالياً..." />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowRejectContactModal(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRejectContactSubmit} disabled={processing} className="px-4 py-2 text-sm bg-red-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الرفض
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-red-500/30">
              <h3 className="font-bold text-white mb-3">🗑️ طلب حذف التذكرة</h3>
              <p className="text-sm text-gray-300 mb-3">سيتم إرسال طلب حذف إلى:</p>
              <ul className="text-xs text-gray-400 mb-3 list-disc list-inside">
                {!isManager && <li>المدير (إن لم تكن أنت)</li>}
                {isSupervisor && <li>صاحب التذكرة</li>}
                {isManager && <li>المشرف المعيّن وصاحب التذكرة</li>}
              </ul>
              <p className="text-xs text-amber-300 mb-3">
                ⚠️ يُحذف نهائياً وفوراً بمجرد موافقة الطرفين. لا يمكن التراجع بعد الحذف.
              </p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm bg-gray-700 rounded text-white">إلغاء</button>
                <button onClick={handleRequestDelete} disabled={processing} className="px-4 py-2 text-sm bg-red-600 rounded text-white font-bold disabled:opacity-50">
                  {processing ? <FaSpinner className="animate-spin inline me-1" /> : null}
                  تأكيد الطلب
                </button>
              </div>
            </div>
          </div>
        )}

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