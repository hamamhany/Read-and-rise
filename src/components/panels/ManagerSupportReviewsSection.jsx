// src/components/panels/ManagerSupportReviewsSection.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaExclamationTriangle, FaEye, FaUser, FaHeadset, FaTimes,
  FaSpinner, FaTrashAlt, FaCheckCircle, FaRedoAlt, FaBan, FaBell, FaRobot,
  FaPlay, FaPause, FaChartBar, FaSyncAlt
} from 'react-icons/fa';
import {
  subscribeToManagerReviewTickets, subscribeToManagerOpenTickets,
  subscribeToReportedTickets,
  managerDecide, claimTicket,
  cancelReportAndDelete, cancelReportAndReopen,
  finalizeReportWithWarning,
  closeReportedTicketAfterAccountDeletion
} from '../../services/support';
import {
  sendSupervisorRatingWarningMessage, sendApologyToStudentMessage,
  sendComplaintRejectedMessage,
  sendReportRejectedMessage, sendReportAccountClosedMessage,
  sendReportWarningMessage
} from '../../utils/whatsapp';
import { issueWarning } from '../../services/warnings';
import { deleteUserCompletely } from '../../services/accountDeletion';
import {
  doc, getDoc, setDoc, deleteDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  SUPPORT_RATING_CATEGORIES, SUPPORT_TICKET_STATUS
} from '../../constants';
import SupportChat from '../common/SupportChat';
import { RichText } from '../common/ChatParts';
import { useConfirm } from '../common/ConfirmContext';

const ManagerSupportReviewsSection = ({ user }) => {
  const confirm = useConfirm();
  const [reviews, setReviews] = useState([]);
  const [openTickets, setOpenTickets] = useState([]);
  const [myManagerTickets, setMyManagerTickets] = useState([]);
  const [reportedTickets, setReportedTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [student, setStudent] = useState(null);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [openChatId, setOpenChatId] = useState(null);

  const [selectedReport, setSelectedReport] = useState(null);
  const [reportedStudent, setReportedStudent] = useState(null);
  const [reportedSupervisor, setReportedSupervisor] = useState(null);

  // ===== حالة AI =====
  const [aiEnabled, setAiEnabled] = useState(true);
  const [togglingAi, setTogglingAi] = useState(false);
  const [aiStats, setAiStats] = useState({
    totalToday: 0,
    peakPerMinute: 0,
    totalLast24h: 0,
    quotaExceeded: 0
  });

  useEffect(() => {
    const u1 = subscribeToManagerReviewTickets(setReviews);
    const u2 = subscribeToManagerOpenTickets(setOpenTickets);
    const u3 = subscribeToReportedTickets(setReportedTickets);
    return () => { u1(); u2(); u3(); };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'supportTickets'),
      where('assignedSupervisorId', '==', user.id),
      where('status', 'in', [
        SUPPORT_TICKET_STATUS.IN_PROGRESS,
        SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
        SUPPORT_TICKET_STATUS.AWAITING_RATING,
        SUPPORT_TICKET_STATUS.MANAGER_PENDING
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

  // ===== الاشتراك بحالة AI =====
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'ai'),
      (snap) => setAiEnabled(snap.exists() ? snap.data().enabled !== false : true),
      (err) => console.warn('aiSettings subscription:', err.message)
    );
    return () => unsub();
  }, []);

  // ===== تحميل إحصائيات الاستخدام (كل 30 ثانية) =====
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
        const [todaySnap, ySnap] = await Promise.all([
          getDoc(doc(db, 'aiUsage', today)),
          getDoc(doc(db, 'aiUsage', yesterday))
        ]);
        if (cancelled) return;

        const todayData = todaySnap.exists() ? todaySnap.data() : {};
        const yData = ySnap.exists() ? ySnap.data() : {};

        const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
        let peak = 0;
        let totalLast24h = 0;

        const tMins = todayData.minutes || {};
        for (let m = 0; m <= currentMinute; m++) {
          const v = tMins[m] || 0;
          if (v > peak) peak = v;
          totalLast24h += v;
        }

        const yMins = yData.minutes || {};
        for (let m = currentMinute; m <= 1439; m++) {
          const v = yMins[m] || 0;
          if (v > peak) peak = v;
          totalLast24h += v;
        }

        setAiStats({
          totalToday: todayData.totalRequests || 0,
          peakPerMinute: peak,
          totalLast24h,
          quotaExceeded: todayData.totalQuotaExceeded || 0
        });
      } catch (e) {
        console.warn('ai stats load failed:', e);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const toggleAi = async () => {
    const nextEnabled = !aiEnabled;
    const action = nextEnabled ? 'تشغيل' : 'إيقاف';
    const ok = await confirm(
      `تأكيد ${action} ردود سند`,
      `هل تريد ${action} ردود المساعد الذكي "سند" لجميع المستخدمين؟`
    );
    if (!ok) return;
    setTogglingAi(true);
    try {
      await setDoc(doc(db, 'systemSettings', 'ai'), {
        enabled: nextEnabled,
        updatedAt: serverTimestamp(),
        updatedBy: user.id,
        updatedByName: user.name || user.username || 'مدير النظام'
      }, { merge: true });
      toast.success(`✅ تم ${action} ردود المساعد الذكي`);
    } catch (e) {
      toast.error(`فشل: ${e.message}`);
    } finally {
      setTogglingAi(false);
    }
  };

  const handleResetStats = async () => {
    const ok = await confirm('تصفير الإحصائيات', 'هل تريد تصفير إحصائيات استخدام المساعد الذكي لهذا اليوم والأمس؟');
    if (!ok) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await deleteDoc(doc(db, 'aiUsage', today));
      await deleteDoc(doc(db, 'aiUsage', yesterday));
      setAiStats({ totalToday: 0, peakPerMinute: 0, totalLast24h: 0, quotaExceeded: 0 });
      toast.success('✅ تم تصفير الإحصائيات بنجاح');
    } catch (e) {
      toast.error('فشل التصفير: ' + e.message);
    }
  };

  const openReview = async (ticket) => {
    setSelected(ticket);
    setMode(null);
    setReason('');
    try {
      if (ticket.assignedSupervisorId && ticket.ratedAgainstAi !== true) {
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

  const openReportedTicket = async (ticket) => {
    setSelectedReport(ticket);
    setReportedStudent(null);
    setReportedSupervisor(null);
    try {
      if (ticket.studentId) {
        const st = await getDoc(doc(db, 'profiles', ticket.studentId));
        if (st.exists()) setReportedStudent({ id: st.id, ...st.data() });
      }
      if (ticket.report?.reportedBy) {
        const sp = await getDoc(doc(db, 'profiles', ticket.report.reportedBy));
        if (sp.exists()) setReportedSupervisor({ id: sp.id, ...sp.data() });
      }
    } catch (e) { console.warn(e); }
  };

  const closeReportModal = () => {
    setSelectedReport(null);
    setReportedStudent(null);
    setReportedSupervisor(null);
  };

  const handleClaimOpenTicket = async (ticketId) => {
    try {
      await claimTicket(ticketId, user.id, user.name || 'مدير النظام', true);
      toast.success('✅ تم استلام التذكرة');
      setOpenChatId(ticketId);
    } catch (e) { toast.error(e.message); }
  };

  const handleApologize = async () => {
    if (!reason.trim()) {
      toast.error(selected.ratedAgainstAi === true
        ? 'اكتب سبب الاعتذار للطالب'
        : 'اكتب سبب الاعتذار للمشرف');
      return;
    }
    setProcessing(true);
    try {
      if (selected.ratedAgainstAi !== true && supervisor) {
        sendSupervisorRatingWarningMessage(supervisor, selected.rating, reason.trim());
      }
      if (student) {
        sendApologyToStudentMessage(student);
      }
      await managerDecide(selected.id, 'apologize', reason.trim());
      toast.success(selected.ratedAgainstAi === true
        ? '✅ تم الاعتذار للطالب وحذف التذكرة من السيرفر'
        : '✅ تم الاعتذار وحذف التذكرة من السيرفر');
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleReject = async () => {
    const msg = selected.ratedAgainstAi === true
      ? 'سيتم رفض الشكوى ضد المساعد الذكي سند وحذف التذكرة من السيرفر. لا يحتسب أي تقييم على أي مشرف. متابعة؟'
      : 'سيتم إلغاء الشكوى وإعطاء المشرف 5 نجوم وإرسال تحذير حازم للطالب وحذف التذكرة من السيرفر. متابعة؟';
    const ok = await confirm('رفض الشكوى', msg);
    if (!ok) return;
    setProcessing(true);
    try {
      if (selected.ratedAgainstAi !== true && student) {
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
      toast.success('✅ تم رفض الشكوى وحذف التذكرة من السيرفر');
      closeModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleCancelReportAndDelete = async () => {
    if (!selectedReport) return;
    const ok = await confirm('رفض البلاغ وحذف التذكرة', 'سيتم رفض البلاغ وحذف التذكرة من السيرفر نهائياً. متابعة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      if (reportedSupervisor) sendReportRejectedMessage(reportedSupervisor);
      await cancelReportAndDelete(selectedReport.id);
      toast.success('✅ تم رفض البلاغ وحذف التذكرة من السيرفر');
      closeReportModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleCancelReportAndReopen = async () => {
    if (!selectedReport) return;
    const ok = await confirm('إعادة فتح المحادثة', 'سيتم رفض البلاغ وإعادة فتح المحادثة لمشرف آخر. متابعة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      if (reportedSupervisor) sendReportRejectedMessage(reportedSupervisor);
      await cancelReportAndReopen(selectedReport.id, user.id);
      toast.success('✅ تم رفض البلاغ وإعادة فتح المحادثة — بحاجة إلى مشرف جديد');
      closeReportModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleCloseReportedAccount = async () => {
    if (!selectedReport) return;
    const ok = await confirm('إغلاق الحساب نهائياً', 'سيتم حذف حساب المُبلَّغ عنه نهائياً وإدراجه في القائمة السوداء، ثم حذف التذكرة من السيرفر. متأكد؟');
    if (!ok) return;
    setProcessing(true);
    try {
      const studentObj = {
        name: selectedReport.studentName,
        phone: selectedReport.studentPhone,
        serialNumber: reportedStudent?.serialNumber
      };
      const opened = sendReportAccountClosedMessage(studentObj);
      if (!opened) {
        toast.error('لم يتم فتح واتساب — لم يتم إغلاق الحساب');
        setProcessing(false);
        return;
      }
      await deleteUserCompletely(selectedReport.studentId, {
        blacklistReason: 'مخالفة سلوك أثناء التواصل مع الدعم الفني'
      });
      await closeReportedTicketAfterAccountDeletion(selectedReport.id);
      toast.success('✅ تم إغلاق الحساب وحذف التذكرة من السيرفر');
      closeReportModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const handleWarnReported = async () => {
    if (!selectedReport) return;
    const ok = await confirm('إرسال تنبيه إداري', 'سيتم إرسال تنبيه إداري للمُبلَّغ عنه وحذف التذكرة من السيرفر. متابعة؟');
    if (!ok) return;
    setProcessing(true);
    try {
      const studentObj = {
        name: selectedReport.studentName,
        phone: selectedReport.studentPhone,
        serialNumber: reportedStudent?.serialNumber
      };
      const opened = sendReportWarningMessage(studentObj);
      if (!opened) {
        toast.error('لم يتم فتح واتساب — لم يتم إرسال التنبيه');
        setProcessing(false);
        return;
      }
      try {
        await issueWarning(selectedReport.studentId, 'مخالفة سلوك أثناء التواصل مع الدعم الفني');
      } catch (warnErr) {
        if (warnErr.message.includes('إنذار')) {
          toast.error(warnErr.message + ' — استخدم خيار إغلاق الحساب');
          setProcessing(false);
          return;
        }
        throw warnErr;
      }
      await finalizeReportWithWarning(selectedReport.id, user.id);
      toast.success('✅ تم إرسال التنبيه وإصدار إنذار وحذف التذكرة من السيرفر');
      closeReportModal();
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const hasAnyContent =
    reviews.length > 0 ||
    openTickets.length > 0 ||
    myManagerTickets.length > 0 ||
    reportedTickets.length > 0 ||
    !!openChatId;

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-rose-500/20 space-y-4">
      {/* ✅ لوحة المساعد الذكي سند */}
      <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/20 p-4 rounded-xl border border-indigo-500/40">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h4 className="text-indigo-200 font-bold flex items-center gap-2 text-sm">
            <FaRobot /> المساعد الذكي سند
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${aiEnabled ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'bg-red-500/20 text-red-300 border border-red-500/40'}`}>
              {aiEnabled ? '● يعمل' : '■ متوقف'}
            </span>
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetStats}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-300 bg-gray-700 hover:bg-gray-600 flex items-center gap-1.5 transition"
              title="تصفير الإحصائيات"
            >
              <FaSyncAlt size={10} /> تصفير
            </button>
            <button
              onClick={toggleAi}
              disabled={togglingAi}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 disabled:opacity-50 transition ${
                aiEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {togglingAi ? <FaSpinner className="animate-spin" size={10} /> : aiEnabled ? <FaPause size={10} /> : <FaPlay size={10} />}
              {togglingAi ? '...' : aiEnabled ? 'إيقاف الردود' : 'تشغيل الردود'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-black/40 p-2 rounded-lg text-center border border-gray-700">
            <p className="text-[10px] text-gray-400 mb-0.5">طلبات اليوم</p>
            <p className="text-lg font-bold text-white">{aiStats.totalToday.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-black/40 p-2 rounded-lg text-center border border-amber-500/20">
            <p className="text-[10px] text-gray-400 mb-0.5">ذروة/دقيقة (24س)</p>
            <p className="text-lg font-bold text-amber-300">{aiStats.peakPerMinute.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-black/40 p-2 rounded-lg text-center border border-cyan-500/20">
            <p className="text-[10px] text-gray-400 mb-0.5">إجمالي 24س</p>
            <p className="text-lg font-bold text-cyan-300">{aiStats.totalLast24h.toLocaleString('ar-EG')}</p>
          </div>
          <div className="bg-black/40 p-2 rounded-lg text-center border border-red-500/20">
            <p className="text-[10px] text-gray-400 mb-0.5">تجاوز الحصة</p>
            <p className={`text-lg font-bold ${aiStats.quotaExceeded > 0 ? 'text-red-300' : 'text-gray-400'}`}>
              {aiStats.quotaExceeded.toLocaleString('ar-EG')}
            </p>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
          <FaChartBar size={9} />
          هذه الأرقام تقديرية — للحصة الفعلية الرسمية:{' '}
          <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline">
            افتح لوحة Google AI Studio
          </a>
        </p>
      </div>

      {!hasAnyContent && (
        <p className="text-gray-500 text-sm text-center py-3">لا توجد طلبات مراجعة أو بلاغات حالياً.</p>
      )}

      {hasAnyContent && (
        <>
          <h3 className="text-xl font-semibold text-rose-300 flex items-center gap-2">
            <FaExclamationTriangle /> مراجعات الدعم الفني
          </h3>

          {reportedTickets.length > 0 && (
            <div className="border border-red-500/30 rounded-xl p-3 bg-red-900/10">
              <p className="text-sm text-red-200 font-bold mb-2 flex items-center gap-2">
                <FaBell /> بلاغات الدعم الفني — بانتظار قرارك ({reportedTickets.length})
              </p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {reportedTickets.map(t => (
                  <div key={t.id} className="p-2 bg-black/40 rounded-lg border border-red-500/20 flex justify-between items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs truncate">
                        <FaUser className="inline me-1" />{t.studentName}
                      </p>
                      <p className="text-[10px] text-red-300 truncate">
                        بلاغ من: {t.report?.reportedByName} — {t.report?.reasonLabel}
                      </p>
                    </div>
                    <button onClick={() => openReportedTicket(t)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg whitespace-nowrap">
                      <FaEye /> مراجعة
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reviews.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {reviews.map(t => {
                const catLabel = SUPPORT_RATING_CATEGORIES.find(c => c.value === t.ratingCategory)?.label || '';
                return (
                  <div key={t.id} className={`p-3 bg-black/30 rounded-lg border ${t.ratedAgainstAi === true ? 'border-indigo-500/40' : 'border-rose-500/30'}`}>
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm">
                          <strong>الطالب:</strong> {t.studentName}
                          {t.studentSerialNumber && <span className="text-xs text-gray-400 mx-1">({t.studentSerialNumber})</span>}
                        </p>
                        <p className="text-xs text-rose-200 mt-1">⭐ {t.rating}/5 — {catLabel}</p>
                        <p className="text-xs text-gray-300 mt-1 line-clamp-2">"{t.ratingReason}"</p>
                        {t.ratedAgainstAi === true ? (
                          <p className="text-xs text-indigo-300 mt-1 flex items-center gap-1">
                            <FaRobot size={10} /> الشكوى ضد المساعد الذكي سند
                          </p>
                        ) : (
                          <p className="text-xs text-cyan-300 mt-1">المشرف: {t.assignedSupervisorName}</p>
                        )}
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

          {myManagerTickets.length > 0 && (
            <div className="border-t border-gray-700 pt-4">
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

          {openTickets.length > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <p className="text-sm text-cyan-200 font-bold mb-2 flex items-center gap-2">
                <FaHeadset /> تذاكر من المشرفين / محوّلة للمدير ({openTickets.length})
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {openTickets.map(t => (
                  <div key={t.id} className="p-2 bg-black/30 rounded-lg border border-cyan-500/20 flex justify-between items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs truncate"><FaUser className="inline me-1" />{t.studentName}</p>
                      <p className="text-[10px] text-gray-400 truncate">{t.messages?.[0]?.text}</p>
                      {t.transferredBy && (
                        <p className="text-[10px] text-amber-300 truncate">📤 محوّلة من: {t.transferredBy}</p>
                      )}
                    </div>
                    <button onClick={() => handleClaimOpenTicket(t.id)} className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1 rounded-lg">
                      استلام
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {openChatId && (
        <SupportChat
          user={user}
          ticketId={openChatId}
          viewerMode="manager"
          onClose={() => setOpenChatId(null)}
        />
      )}

      {selectedReport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={closeReportModal}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-red-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-red-300 flex items-center gap-2">
                <FaExclamationTriangle /> مراجعة بلاغ
              </h3>
              <button onClick={closeReportModal} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>

            <div className="bg-gray-800/60 p-3 rounded-xl mb-3 text-sm">
              <p className="text-cyan-200 font-bold mb-1">👤 المُبلَّغ عنه (صاحب التذكرة):</p>
              <p className="text-gray-300">الاسم: {selectedReport.studentName}</p>
              {reportedStudent?.serialNumber && <p className="text-gray-300">الرقم التسلسلي: {reportedStudent.serialNumber}</p>}
              {selectedReport.studentPhone && <p className="text-gray-300">الهاتف: <span dir="ltr">{selectedReport.studentPhone}</span></p>}
            </div>

            <div className="bg-gray-800/60 p-3 rounded-xl mb-3 text-sm">
              <p className="text-cyan-200 font-bold mb-1">🛡️ المشرف المُبلِّغ:</p>
              <p className="text-gray-300">الاسم: {selectedReport.report?.reportedByName}</p>
              {reportedSupervisor?.phone && <p className="text-gray-300">الهاتف: <span dir="ltr">{reportedSupervisor.phone}</span></p>}
            </div>

            <div className="bg-rose-500/10 p-3 rounded-xl mb-3 text-sm border border-rose-500/30">
              <p className="text-rose-200 font-bold mb-1">📝 تفاصيل البلاغ:</p>
              <p className="text-gray-200">السبب: {selectedReport.report?.reasonLabel}</p>
              <p className="text-gray-200">التفاصيل: "{selectedReport.report?.details}"</p>
            </div>

            <div className="bg-gray-800/40 p-3 rounded-xl mb-3 max-h-60 overflow-y-auto border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">📜 سجل المحادثة الكامل:</p>
              {selectedReport.messages?.map(m => (
                <div key={m.id} className="text-xs mb-1">
                  <strong className="text-blue-300">{m.senderName}:</strong>
                  <span className="text-gray-300"> <RichText text={m.text} /></span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-amber-300 mb-2 text-center">
              ⚠️ أي إجراء تختاره سيؤدي إلى حذف التذكرة نهائياً من السيرفر.
            </p>

            <div className="space-y-2">
              <button onClick={handleCancelReportAndDelete} disabled={processing}
                className="w-full p-3 bg-gray-600/30 hover:bg-gray-600/50 border border-gray-500/40 rounded-xl text-gray-200 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <FaTrashAlt /> رفض البلاغ وحذف المحادثة نهائياً
              </button>

              <button onClick={handleCancelReportAndReopen} disabled={processing}
                className="w-full p-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-200 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <FaRedoAlt /> رفض البلاغ وإعادة المحادثة لمشرف آخر
              </button>

              <button onClick={handleWarnReported} disabled={processing}
                className="w-full p-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <FaBell /> إرسال تنبيه إداري للمُبلَّغ عنه
              </button>

              <button onClick={handleCloseReportedAccount} disabled={processing}
                className="w-full p-3 bg-red-600/30 hover:bg-red-600/50 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                <FaBan /> إغلاق حساب المُبلَّغ عنه نهائياً
              </button>

              <button onClick={closeReportModal} className="w-full p-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-gray-300 text-xs">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={closeModal}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-rose-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-rose-300">
                {selected.ratedAgainstAi === true ? 'شكوى ضد المساعد الذكي سند' : 'مراجعة تقييم سلبي'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>

            <div className="bg-gray-800/60 p-3 rounded-xl mb-3 text-sm">
              <p className="text-cyan-200 font-bold mb-1">👤 الطالب:</p>
              <p className="text-gray-300">الاسم: {selected.studentName}</p>
              {selected.studentSerialNumber && <p className="text-gray-300">الرقم التسلسلي: {selected.studentSerialNumber}</p>}
              {selected.studentPhone && <p className="text-gray-300">الهاتف: <span dir="ltr">{selected.studentPhone}</span></p>}
            </div>

            {selected.ratedAgainstAi === true ? (
              <div className="bg-indigo-500/10 p-3 rounded-xl mb-3 text-sm border border-indigo-500/30">
                <p className="text-indigo-200 font-bold mb-1 flex items-center gap-2">
                  <FaRobot /> الشكوى ضد المساعد الذكي سند
                </p>
                <p className="text-gray-300 text-xs">
                  لم يتدخل أي مشرف بشري — الاعتذار للطالب فقط، ولا يُحتسب أي تقييم على أي مشرف.
                </p>
              </div>
            ) : (
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
            )}

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
                  <span className="text-gray-300"> <RichText text={m.text} /></span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-amber-300 mb-2 text-center">
              ⚠️ أي قرار تتخذه سيؤدي إلى حذف التذكرة نهائياً من السيرفر فوراً.
            </p>

            {!mode && (
              <div className="space-y-2">
                <button onClick={() => setMode('apologize')} className="w-full p-3 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 text-sm">
                  {selected.ratedAgainstAi === true
                    ? '🌸 قبول الشكوى والاعتذار للطالب (لا شيء على أي مشرف)'
                    : '🌸 قبول الشكوى والاعتذار (تنبيه للمشرف + اعتذار للطالب)'}
                </button>
                <button onClick={handleReject} disabled={processing} className="w-full p-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 rounded-xl text-red-200 text-sm disabled:opacity-50">
                  {processing
                    ? 'جاري المعالجة...'
                    : selected.ratedAgainstAi === true
                      ? '🛑 رفض الشكوى (حذف التذكرة دون أي تقييم)'
                      : '🛑 رفض الشكوى (5 نجوم للمشرف + تحذير للطالب)'}
                </button>
              </div>
            )}

            {mode === 'apologize' && (
              <div className="space-y-3">
                <label className="text-sm text-gray-300">
                  {selected.ratedAgainstAi === true
                    ? 'سبب الاعتذار (سيُرسل للطالب):'
                    : 'سبب الاعتذار (سيُرسل للمشرف):'}
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm resize-none h-24"
                  placeholder={selected.ratedAgainstAi === true
                    ? 'اشرح للطالب سبب الاعتذار...'
                    : 'اشرح للمشرف ما الذي أخطأ فيه...'}
                />
                <button onClick={handleApologize} disabled={processing || !reason.trim()} className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg disabled:opacity-50">
                  {processing
                    ? 'جاري الإرسال والحذف...'
                    : selected.ratedAgainstAi === true
                      ? '📤 إرسال الاعتذار للطالب (سيتم حذف التذكرة)'
                      : '📤 إرسال التنبيهات وتأكيد الاعتذار (سيتم حذف التذكرة)'}
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