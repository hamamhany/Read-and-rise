import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaSignOutAlt, FaUserShield, FaExclamationTriangle, FaWhatsapp,
  FaTimesCircle, FaUsers, FaTrashAlt, FaBell, FaPaperPlane,
  FaChalkboardTeacher, FaBroadcastTower, FaHourglassHalf,
  FaBan, FaChevronLeft
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, onSnapshot, doc, serverTimestamp,
  orderBy, where, writeBatch, getCountFromServer
} from 'firebase/firestore';
import { requestNotificationPermission, setupOnMessageListener } from '../../utils/pushNotifications';
import { messaging } from '../../firebase';
import {
  MESSAGE_REQUEST_TYPE_LABELS,
  MESSAGE_REQUEST_STATUS
} from '../../constants';
import {
  updateMessageRequestStatus,
  deleteMessageRequest,
  cleanupOldApprovedRequests
} from '../../services/messageRequests';
import {
  sendWarningMessage, sendNoticeMessage, sendActivationMessage, sendFreezeMessage,
  sendDeleteMessage, sendResetPasswordMessage, sendDataUpdateApprovalMessage,
  sendDataUpdateRejectionMessage, sendGeneralMessageToStudent, sendReportMessage
} from '../../utils/whatsapp';
import SystemManagerReviewsSection from './SystemManagerReviewsSection';
import SupervisorsManagerModal from './SupervisorsManagerModal';
import StudentsManagerModal from './StudentsManagerModal';
import BlacklistModal from './BlacklistModal';
import CountUp from '../common/CountUp';

const computeNextGlobalLesson = (allTimes) => {
  const now = new Date();
  let nearest = null;
  for (const lt of allTimes) {
    if (!lt.time) continue;
    let d = null;
    if (lt.type === 'once') {
      const dd = new Date(lt.date);
      if (!isNaN(dd.getTime())) {
        dd.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (dd > now) d = dd;
      }
    } else if (lt.type === 'recurring') {
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayIndex = days.indexOf(lt.day);
      if (dayIndex === -1) continue;
      let diff = dayIndex - now.getDay();
      if (diff < 0) diff += 7;
      if (diff === 0) {
        const t = new Date(now); t.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (t <= now) diff = 7;
      }
      const dd = new Date(now);
      dd.setDate(now.getDate() + diff);
      dd.setHours(lt.time.hours, lt.time.minutes, 0, 0);
      d = dd;
    } else if (lt.type === 'monthly') {
      const md = parseInt(lt.monthDay);
      if (!md) continue;
      let dd = new Date(now.getFullYear(), now.getMonth(), md);
      dd.setHours(lt.time.hours, lt.time.minutes, 0, 0);
      if (dd <= now) { dd = new Date(now.getFullYear(), now.getMonth() + 1, md); dd.setHours(lt.time.hours, lt.time.minutes, 0, 0); }
      d = dd;
    }
    if (d && (!nearest || d < nearest)) nearest = d;
  }
  return nearest;
};

const computeActiveLectures = (allTimes) => {
  const now = new Date();
  let count = 0;
  for (const lt of allTimes) {
    if (!lt.time) continue;
    let start = null;
    if (lt.type === 'once') {
      const dd = new Date(lt.date);
      if (!isNaN(dd.getTime())) { dd.setHours(lt.time.hours, lt.time.minutes, 0, 0); start = dd; }
    } else if (lt.type === 'recurring') {
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayIndex = days.indexOf(lt.day);
      if (dayIndex !== now.getDay()) continue;
      const dd = new Date(now); dd.setHours(lt.time.hours, lt.time.minutes, 0, 0); start = dd;
    } else if (lt.type === 'monthly') {
      const md = parseInt(lt.monthDay);
      if (md !== now.getDate()) continue;
      const dd = new Date(now); dd.setHours(lt.time.hours, lt.time.minutes, 0, 0); start = dd;
    }
    if (start) {
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      if (now >= start && now < end) count++;
    }
  }
  return count;
};

const SystemManagerPanel = ({ user, onLogout }) => {
  const [messageRequests, setMessageRequests] = useState([]);
  const [allLessonTimes, setAllLessonTimes] = useState([]);
  const [nextGlobalLesson, setNextGlobalLesson] = useState(null);
  const [activeLecturesCount, setActiveLecturesCount] = useState(0);
  const [liveCountdown, setLiveCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });

  const [studentsCount, setStudentsCount] = useState(0);
  const [supervisorsCount, setSupervisorsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [blacklistCount, setBlacklistCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [notificationsActive, setNotificationsActive] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!messaging
  );

  const [requestFilter, setRequestFilter] = useState('pending');

  // ✅ Modals state
  const [showSupervisorsModal, setShowSupervisorsModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);

  useEffect(() => {
    const unsub = setupOnMessageListener((payload) => {
      toast.custom(() => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-amber-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    cleanupOldApprovedRequests().catch(err => console.warn('cleanup initial failed:', err));
  }, []);

  // Counts
  useEffect(() => {
    (async () => {
      try {
        const [s, sup, t, bl] = await Promise.all([
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'student'))),
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'supervisor'))),
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
          getCountFromServer(collection(db, 'blacklist'))
        ]);
        setStudentsCount(s.data().count);
        setSupervisorsCount(sup.data().count);
        setTeachersCount(t.data().count);
        setBlacklistCount(bl.data().count);
      } catch (e) { console.warn('count load failed:', e); }
    })();
  }, []);

  useEffect(() => {
    const qRequests = query(collection(db, 'messageRequests'), orderBy('createdAt', 'desc'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setMessageRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubLessonTimes = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      const times = [];
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        (data.lessonTimes || []).forEach(t => times.push({ teacherId: docSnap.id, ...t }));
      });
      setAllLessonTimes(times);
    });

    const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
    const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });

    setLoading(false);
    return () => { unsubRequests(); unsubLessonTimes(); unsubNotif(); };
  }, [user.id]);

  useEffect(() => {
    if (!messageRequests.length) return;
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    const toDelete = messageRequests.filter(r => {
      if (r.status !== 'approved') return false;
      if (!r.processedAt) return false;
      const ms = r.processedAt.toDate ? r.processedAt.toDate().getTime() : 0;
      if (!ms) return false;
      return (now - ms) > fortyEightHours;
    });
    if (toDelete.length > 0) {
      (async () => {
        try {
          const batch = writeBatch(db);
          toDelete.forEach(r => batch.delete(doc(db, 'messageRequests', r.id)));
          await batch.commit();
        } catch (err) { console.warn('cleanup failed:', err); }
      })();
    }
  }, [messageRequests]);

  useEffect(() => {
    if (allLessonTimes.length === 0) { setNextGlobalLesson(null); setActiveLecturesCount(0); return; }
    const tick = () => {
      setNextGlobalLesson(computeNextGlobalLesson(allLessonTimes));
      setActiveLecturesCount(computeActiveLectures(allLessonTimes));
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [allLessonTimes]);

  useEffect(() => {
    if (!nextGlobalLesson) { setLiveCountdown({ d: 0, h: 0, m: 0, s: 0 }); return; }
    const tick = () => {
      const diff = nextGlobalLesson.getTime() - Date.now();
      if (diff <= 0) { setLiveCountdown({ d: 0, h: 0, m: 0, s: 0 }); return; }
      setLiveCountdown({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        s: Math.floor((diff % (1000 * 60)) / 1000)
      });
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextGlobalLesson]);

  const handleOpenNotifications = async () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setNotificationsActive(true);
      return;
    }
    const ok = await requestNotificationPermission(user.id);
    setNotificationsActive(ok);
  };

  const handleCloseNotifications = async () => {
    setShowNotificationsModal(false);
    try {
      if (notificationIdsAtOpen.length > 0) {
        const batch = writeBatch(db);
        notificationIdsAtOpen.forEach(id => {
          batch.delete(doc(db, 'notifications', user.id, 'userNotifications', id));
        });
        await batch.commit();
      }
    } catch (err) { console.warn('فشل حذف الإشعارات:', err); }
    setNotificationIdsAtOpen([]);
  };

  const handleSendRequest = async (request) => {
    try {
      const studentObj = {
        name: request.targetName || '',
        phone: request.targetPhone || '',
        classes: request.targetClass ? request.targetClass.split(', ').map(n => ({ name: n })) : [],
        age: request.payload?.age,
        gender: request.payload?.gender,
        username: request.payload?.username || ''
      };

      let success = true;
      switch (request.type) {
        case 'warning': success = sendWarningMessage(studentObj, request.payload.warningNumber, request.payload.description); break;
        case 'notice': success = sendNoticeMessage(studentObj, request.payload.description); break;
        case 'general': success = sendGeneralMessageToStudent(studentObj, request.payload.subject, request.payload.body); break;
        case 'report': success = sendReportMessage(studentObj, request.payload.reason, request.targetClass); break;
        case 'freeze': success = sendFreezeMessage(studentObj); break;
        case 'delete': success = sendDeleteMessage(studentObj); break;
        case 'reset_password': success = sendResetPasswordMessage(studentObj, request.payload.newPassword); break;
        case 'activation': success = sendActivationMessage(studentObj, request.payload.username, request.payload.password); break;
        case 'data_update_approval': success = sendDataUpdateApprovalMessage(studentObj, {}); break;
        case 'data_update_rejection': success = sendDataUpdateRejectionMessage(studentObj, request.payload?.reason); break;
        default:
          toast.error('نوع طلب غير معروف.');
          return;
      }

      if (!success) {
        toast.error('لم يتم اعتماد الطلب لأن واتساب لم يُفتح.');
        return;
      }

      await deleteMessageRequest(request.id);
      toast.success('✅ تم فتح واتساب واعتماد الطلب ومسحه من السجلات.');
    } catch (err) {
      toast.error('فشل إرسال الطلب: ' + err.message);
    }
  };

  const handleRejectRequest = async (requestId) => {
    const reason = window.prompt('سبب الرفض (اختياري):', '') || '';
    try {
      await updateMessageRequestStatus(requestId, MESSAGE_REQUEST_STATUS.REJECTED, user.id, reason);
      toast.success('تم رفض الطلب.');
    } catch (err) { toast.error('فشل الرفض: ' + err.message); }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    try {
      await deleteMessageRequest(requestId);
      toast.success('تم حذف الطلب.');
    } catch (err) { toast.error('فشل الحذف: ' + err.message); }
  };

  const filteredRequests = messageRequests.filter(r => {
    if (r.type === 'report') return false;
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const pendingCount = messageRequests.filter(r => r.status === 'pending' && r.type !== 'report').length;
  const pad2 = (n) => String(n).padStart(2, '0');

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-5xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-amber-400 flex items-center gap-2">
              <FaUserShield /> لوحة مدير النظام
            </h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNotifications} className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg" title={notificationsActive ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}>
              <FaBell />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
              {notificationsActive && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-red-900/50 to-red-900/20 p-6 rounded-2xl border border-red-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg"><FaExclamationTriangle className="text-white text-xl" /></div>
              <div><p className="text-xs text-red-300 uppercase tracking-widest font-semibold">طلبات معلّقة</p><h3 className="text-sm font-bold text-red-100">قيد المراجعة</h3></div>
            </div>
            <p className="text-4xl font-black text-white"><CountUp value={pendingCount} /></p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900/50 to-emerald-900/20 p-6 rounded-2xl border border-emerald-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg"><FaUsers className="text-white text-xl" /></div>
              <div><p className="text-xs text-emerald-300 uppercase tracking-widest font-semibold">الطلاب</p><h3 className="text-sm font-bold text-emerald-100">إجمالي المسجلين</h3></div>
            </div>
            <p className="text-4xl font-black text-white"><CountUp value={studentsCount} /></p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900/50 to-indigo-900/20 p-6 rounded-2xl border border-indigo-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg"><FaUserShield className="text-white text-xl" /></div>
              <div><p className="text-xs text-indigo-300 uppercase tracking-widest font-semibold">المشرفين</p><h3 className="text-sm font-bold text-indigo-100">الحسابات النشطة</h3></div>
            </div>
            <p className="text-4xl font-black text-white"><CountUp value={supervisorsCount} /></p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-blue-900/50 to-blue-900/20 p-6 rounded-2xl border border-blue-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg"><FaChalkboardTeacher className="text-white text-xl" /></div>
              <div><p className="text-xs text-blue-300 uppercase tracking-widest font-semibold">المعلمين</p><h3 className="text-sm font-bold text-blue-100">في النظام</h3></div>
            </div>
            <p className="text-4xl font-black text-white"><CountUp value={teachersCount} /></p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-purple-900/50 to-purple-900/20 p-6 rounded-2xl border border-purple-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg"><FaBroadcastTower className="text-white text-xl" /></div>
              <div><p className="text-xs text-purple-300 uppercase tracking-widest font-semibold">محاضرات</p><h3 className="text-sm font-bold text-purple-100">نشطة الآن (60 دقيقة)</h3></div>
            </div>
            <p className="text-4xl font-black text-white"><CountUp value={activeLecturesCount} /></p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-amber-900/50 to-amber-900/20 p-6 rounded-2xl border border-amber-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg"><FaHourglassHalf className="text-white text-xl" /></div>
              <div><p className="text-xs text-amber-300 uppercase tracking-widest font-semibold">الحصة القادمة</p><h3 className="text-sm font-bold text-amber-100">العد التنازلي</h3></div>
            </div>
            {nextGlobalLesson ? (
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-black text-white tabular-nums leading-tight" dir="ltr">
                  {liveCountdown.d > 0 && <span className="text-amber-200">{liveCountdown.d}<span className="text-xs font-bold text-amber-300 mx-1">يوم</span></span>}
                  {pad2(liveCountdown.h)}:{pad2(liveCountdown.m)}:{pad2(liveCountdown.s)}
                </p>
                <p className="text-[10px] text-amber-300 mt-1 tracking-wider">
                  {liveCountdown.d > 0 ? 'يوم : ساعة : دقيقة : ثانية' : 'ساعة : دقيقة : ثانية'}
                </p>
              </div>
            ) : <p className="text-2xl font-black text-gray-500 text-center">—</p>}
          </div>
        </div>

        {/* System Manager Reviews */}
        <SystemManagerReviewsSection user={user} />

        {/* ✅ Management Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setShowSupervisorsModal(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-indigo-900/40 to-blue-900/20 p-5 rounded-2xl border border-indigo-500/30 hover:border-indigo-400/60 transition-all duration-300 text-right shadow-lg hover:shadow-indigo-500/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <FaUserShield className="text-white text-xl" />
                </div>
                <div>
                  <p className="text-white font-bold">إدارة المشرفين</p>
                  <p className="text-xs text-indigo-300 mt-0.5">{supervisorsCount} مشرف</p>
                </div>
              </div>
              <FaChevronLeft className="text-indigo-300 group-hover:text-white transition-colors" />
            </div>
          </button>

          <button
            onClick={() => setShowStudentsModal(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-blue-900/40 to-cyan-900/20 p-5 rounded-2xl border border-blue-500/30 hover:border-blue-400/60 transition-all duration-300 text-right shadow-lg hover:shadow-blue-500/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
                  <FaUsers className="text-white text-xl" />
                </div>
                <div>
                  <p className="text-white font-bold">إدارة الطلاب</p>
                  <p className="text-xs text-blue-300 mt-0.5">{studentsCount} طالب</p>
                </div>
              </div>
              <FaChevronLeft className="text-blue-300 group-hover:text-white transition-colors" />
            </div>
          </button>

          <button
            onClick={() => setShowBlacklistModal(true)}
            className="group relative overflow-hidden bg-gradient-to-br from-red-900/40 to-rose-900/20 p-5 rounded-2xl border border-red-500/30 hover:border-red-400/60 transition-all duration-300 text-right shadow-lg hover:shadow-red-500/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
                  <FaBan className="text-white text-xl" />
                </div>
                <div>
                  <p className="text-white font-bold">القائمة السوداء</p>
                  <p className="text-xs text-red-300 mt-0.5">{blacklistCount} رقم محظور</p>
                </div>
              </div>
              <FaChevronLeft className="text-red-300 group-hover:text-white transition-colors" />
            </div>
          </button>
        </div>

        {/* Message Requests */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-amber-500/30">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="text-xl font-semibold text-amber-300 flex items-center gap-2">
              <FaPaperPlane /> طلبات الرسائل والتواصل مع الطلاب ({filteredRequests.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setRequestFilter('pending')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300'}`}>قيد المراجعة ({pendingCount})</button>
              <button onClick={() => setRequestFilter('approved')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'approved' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>تم الإرسال</button>
              <button onClick={() => setRequestFilter('rejected')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}>مرفوضة</button>
              <button onClick={() => setRequestFilter('all')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>الكل</button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-3">📌 الطلبات تُمسح فور اعتمادها. (البلاغات تُدار من لوحة المشرفين)</p>

          {filteredRequests.length === 0 ? (
            <p className="text-gray-400 text-center py-6">لا توجد طلبات في هذا التصنيف.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredRequests.map(request => {
                const isPending = request.status === 'pending';
                const isApproved = request.status === 'approved';
                const statusBadge = isPending ? (
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">⏳ قيد المراجعة</span>
                ) : isApproved ? (
                  <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">✅ تم الإرسال</span>
                ) : (
                  <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">❌ مرفوض</span>
                );

                return (
                  <div key={request.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-amber-300 font-bold text-sm">{MESSAGE_REQUEST_TYPE_LABELS[request.type] || request.type}</span>
                          {statusBadge}
                        </div>
                        <p className="text-white text-sm mt-1">
                          <strong>{request.targetName}</strong>
                          {request.targetClass && <span className="text-gray-400 text-xs mr-2">({request.targetClass})</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">مقدم من: {request.requestedByName || 'معلم'}</p>

                        {request.type === 'warning' && (
                          <p className="text-xs text-yellow-200 mt-1">إنذار رقم {request.payload?.warningNumber} — {request.payload?.description}</p>
                        )}
                        {request.type === 'notice' && (
                          <p className="text-xs text-yellow-200 mt-1">تنبيه: {request.payload?.description}</p>
                        )}
                        {request.type === 'general' && (
                          <div className="mt-1 text-xs text-gray-300">
                            <p><strong>الموضوع:</strong> {request.payload?.subject}</p>
                            <p className="line-clamp-2"><strong>النص:</strong> {request.payload?.body}</p>
                          </div>
                        )}
                        {request.type === 'activation' && (
                          <p className="text-xs text-green-200 mt-1">اسم المستخدم: {request.payload?.username}</p>
                        )}
                        {request.type === 'reset_password' && (
                          <p className="text-xs text-indigo-200 mt-1">اسم المستخدم: {request.payload?.username}</p>
                        )}
                        {request.type === 'data_update_rejection' && request.payload?.reason && (
                          <p className="text-xs text-red-200 mt-1">سبب الرفض: {request.payload.reason}</p>
                        )}
                        {request.rejectionReason && (
                          <p className="text-xs text-red-300 mt-1">سبب الرفض (من المدير): {request.rejectionReason}</p>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">
                          {request.createdAt?.toDate?.() ? new Date(request.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {isPending && (
                          <>
                            <button onClick={() => handleSendRequest(request)} className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg">
                              <FaWhatsapp /> إرسال واتساب
                            </button>
                            <button onClick={() => handleRejectRequest(request.id)} className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg">
                              <FaTimesCircle /> رفض
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDeleteRequest(request.id)} className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg">
                          <FaTrashAlt /> حذف
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ✅ Modals */}
      <SupervisorsManagerModal
        isOpen={showSupervisorsModal}
        onClose={() => setShowSupervisorsModal(false)}
        user={user}
        onCountChange={setSupervisorsCount}
      />
      <StudentsManagerModal
        isOpen={showStudentsModal}
        onClose={() => setShowStudentsModal(false)}
        onCountChange={setStudentsCount}
      />
      <BlacklistModal
        isOpen={showBlacklistModal}
        onClose={() => setShowBlacklistModal(false)}
        onCountChange={setBlacklistCount}
      />

      {/* Notifications Modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-amber-300"><FaBell className="inline-block me-2" /> الإشعارات</h3>
              <button onClick={handleCloseNotifications} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">📌 ستُحذف هذه الإشعارات تلقائياً عند إغلاق النافذة.</p>
            {!notificationsActive && (
              <div className="mb-4 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-200 text-sm">
                ⚠️ الإشعارات غير مفعلة. اضغط على زر الجرس لتفعيلها.
              </div>
            )}
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl border bg-gray-800/60 border-blue-500/40">
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-gray-400">{n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG') : ''}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemManagerPanel;