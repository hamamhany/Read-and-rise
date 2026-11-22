// src/components/panels/SystemManagerPanel.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaSignOutAlt, FaUserShield, FaExclamationTriangle, FaWhatsapp,
  FaTimesCircle, FaUsers, FaTrashAlt, FaBell, FaPaperPlane,
  FaChalkboardTeacher, FaBroadcastTower, FaHourglassHalf,
  FaBan, FaChevronLeft, FaCopy, FaCheckCircle, FaRedoAlt, FaEye, FaLayerGroup,
  FaChevronDown, FaChevronUp, FaSyncAlt, FaDownload
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, onSnapshot, doc, serverTimestamp,
  orderBy, where, writeBatch, getCountFromServer, updateDoc,
  getDoc, setDoc, getDocs
} from 'firebase/firestore';
import { auth } from '../../services/firebaseAuth';
import { requestNotificationPermission, setupOnMessageListener } from '../../utils/pushNotifications';
import { messaging } from '../../firebase';
import {
  MESSAGE_REQUEST_TYPE_LABELS, MESSAGE_REQUEST_STATUS, MESSAGE_REQUEST_TYPES
} from '../../constants';
import {
  updateMessageRequestStatus, deleteMessageRequest,
  cleanupOldApprovedRequests, resendRejectedRequest
} from '../../services/messageRequests';
import {
  sendWarningMessage, sendNoticeMessage, sendActivationMessage, sendFreezeMessage,
  sendUnfreezeMessage, sendDeleteMessage, sendResetPasswordMessage,
  sendDataUpdateApprovalMessage, sendDataUpdateRejectionMessage,
  sendGeneralMessageToStudent, sendReportMessage, sendAbsenceWarningMessage,
  sendAutoFreezeMessage, sendAutoDeleteMessage, sendPasswordResetApprovalMessage,
  sendPasswordResetRejectionMessage, sendUnactivatedAccountReminderMessage,
  sendUnactivatedAccountDeletedMessage
} from '../../utils/whatsapp';
import { deleteUserCompletely } from '../../services/accountDeletion';
import { updateClassGender, deleteClassById, moveStudentToClass, purgeClassesWithoutSection, setStudentClasses } from '../../services/classes';
import { approveAnnouncement, rejectAnnouncement } from '../../services/announcements';
import SystemManagerReviewsSection from './SystemManagerReviewsSection';
import ManagerSupportReviewsSection from './ManagerSupportReviewsSection';
import SupervisorsManagerModal from './SupervisorsManagerModal';
import StudentsManagerModal from './StudentsManagerModal';
import BlacklistModal from './BlacklistModal';
import SectionsManagerModal from './SectionsManagerModal';
import CountUp from '../common/CountUp';
import { useConfirm, usePrompt } from '../common/ConfirmContext';

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

const ACTION_TYPES = ['class_gender_change', 'class_delete', 'student_class_transfer'];

const SystemManagerPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const prompt = usePrompt();

  // ✅ البيانات المحمّلة بشكل Lazy
  const [messageRequests, setMessageRequests] = useState([]);
  const [pendingAnnouncements, setPendingAnnouncements] = useState([]);
  const [allLessonTimes, setAllLessonTimes] = useState([]);
  const [nextGlobalLesson, setNextGlobalLesson] = useState(null);
  const [activeLecturesCount, setActiveLecturesCount] = useState(0);
  const [liveCountdown, setLiveCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });

  // ✅ عدادات (getCountFromServer — رخيصة جداً)
  const [studentsCount, setStudentsCount] = useState(0);
  const [supervisorsCount, setSupervisorsCount] = useState(0);
  const [teachersCount, setTeachersCount] = useState(0);
  const [blacklistCount, setBlacklistCount] = useState(0);
  const [sectionsCount, setSectionsCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  // ✅ حالات Lazy Loading لكل قسم
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);

  const [lessonTimesLoaded, setLessonTimesLoaded] = useState(false);
  const [loadingLessonTimes, setLoadingLessonTimes] = useState(false);

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [notificationsActive, setNotificationsActive] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!messaging
  );

  const [requestFilter, setRequestFilter] = useState('pending');

  const [showSupervisorsModal, setShowSupervisorsModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);
  const [showSectionsModal, setShowSectionsModal] = useState(false);

  const [openRequestModal, setOpenRequestModal] = useState(null);
  const [processingAction, setProcessingAction] = useState(false);

  // ✅ 1) حذف الشعب اليتيمة + جلب عدد الأقسام (رخيص - count فقط)
  useEffect(() => {
    (async () => {
      try {
        await purgeClassesWithoutSection();
        const secsCount = await getCountFromServer(collection(db, 'sections'));
        setSectionsCount(secsCount.data().count);
      } catch (e) { console.warn('purge classes failed:', e); }
    })();
  }, []);

  // ✅ 2) تحميل الإشعارات فقط (خفيفة، ضرورية للجرس)
  useEffect(() => {
    if (!user) return;
    const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
    const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
    const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });
    return () => unsubscribeNotif();
  }, [user.id]);

  // ✅ 3) setupOnMessageListener
  useEffect(() => {
    const unsub = setupOnMessageListener((payload) => {
      toast.custom(() => (
        <div className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white p-4 rounded-xl border border-amber-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-slate-600 dark:text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsub();
  }, []);

  // ✅ 4) cleanup الطلبات القديمة (عملية كتابة - لا تُكلف قراءة)
  useEffect(() => {
    cleanupOldApprovedRequests().catch(err => console.warn('cleanup initial failed:', err));
  }, []);

  // ✅ 5) العدادات الأساسية (getCountFromServer — رخيصة جداً)
  useEffect(() => {
    (async () => {
      try {
        const [s, sup, t, bl, pc, pr] = await Promise.all([
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'student'))),
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'supervisor'))),
          getCountFromServer(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
          getCountFromServer(collection(db, 'blacklist')),
          getCountFromServer(query(collection(db, 'messageRequests'), where('status', '==', 'pending'))),
          getCountFromServer(query(collection(db, 'messageRequests'), where('status', '==', 'pending'), where('type', '==', 'report')))
        ]);
        setStudentsCount(s.data().count);
        setSupervisorsCount(sup.data().count);
        setTeachersCount(t.data().count);
        setBlacklistCount(bl.data().count);
        setPendingCount(Math.max(0, pc.data().count - pr.data().count));
      } catch (e) { console.warn('count load failed:', e); }
      finally { setLoading(false); }
    })();
  }, []);

  // ✅ 6) Lazy: تحميل طلبات الرسائل فقط عند فتح القسم
  useEffect(() => {
    if (!requestsOpen) return;
    setRequestsLoading(true);
    const q = query(collection(db, 'messageRequests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMessageRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setRequestsLoaded(true);
      setRequestsLoading(false);
    }, (err) => {
      console.warn('requests load failed:', err);
      setRequestsLoading(false);
    });
    return () => unsub();
  }, [requestsOpen]);

  // ✅ 7) Lazy: تحميل الإعلانات المعلقة فقط عند فتح القسم
  useEffect(() => {
    if (!announcementsOpen) return;
    const q = query(collection(db, 'announcements'), where('status', '==', 'pending_approval'));
    const unsub = onSnapshot(q, (snap) => {
      setPendingAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAnnouncementsLoaded(true);
    }, (err) => {
      console.warn('announcements load failed:', err);
    });
    return () => unsub();
  }, [announcementsOpen]);

  // ✅ 8) Lazy: تحميل أوقات الدروس عند الضغط على زر "تحميل"
  const loadLessonTimes = async () => {
    if (lessonTimesLoaded || loadingLessonTimes) return;
    setLoadingLessonTimes(true);
    try {
      const snap = await getDocs(collection(db, 'teachers'));
      const times = [];
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        (data.lessonTimes || []).forEach(t => times.push({ teacherId: docSnap.id, ...t }));
      });
      setAllLessonTimes(times);
      setLessonTimesLoaded(true);
    } catch (e) {
      toast.error('فشل تحميل أوقات الدروس: ' + e.message);
    } finally {
      setLoadingLessonTimes(false);
    }
  };

  // ✅ تحميل أوقات الدروس تلقائياً عند فتح اللوحة (بدون الضغط على زر "تحميل")
  useEffect(() => {
    loadLessonTimes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ 9) الحصة القادمة - فقط بعد التحميل
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
      setNotificationsActive(true); return;
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

  const buildMessageText = (request) => {
    const studentObj = {
      name: request.targetName || '',
      phone: request.targetPhone || '',
      classes: request.targetClass ? request.targetClass.split(', ').map(n => ({ name: n })) : [],
      age: request.payload?.age,
      gender: request.payload?.gender,
      username: request.payload?.username || '',
      serialNumber: request.payload?.serialNumber || '',
      tempPassword: request.payload?.password
    };
    const currentDate = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman' });
    switch (request.type) {
      case 'activation':
        return `الموضوع: تأكيد تفعيل حسابك في المنصة الإلكترونية - اقرأ وارتق\n\nعزيزي الطالب ${studentObj.name}،\nالرقم التسلسلي: ${studentObj.serialNumber || 'غير مسجل'}\n  اسم المستخدم: ${request.payload?.username}\nكلمة المرور: ${request.payload?.password}\n\nسجّل الدخول من: https://read-and-rise-two.vercel.app/`;
      case 'warning':
        return `إنذار رقم ${request.payload?.warningNumber} — ${request.targetName}\nالسبب: ${request.payload?.description}\nالرقم التسلسلي: ${request.payload?.serialNumber || 'غير مسجل'}`;
      case 'notice':
        return `تنبيه تحذيري — ${request.targetName}\n${request.payload?.description}`;
      case 'general':
        return `الموضوع: ${request.payload?.subject}\n\n${request.payload?.body}`;
      case 'report':
        return `بلاغ ضد الطالب ${request.targetName}\nالسبب: ${request.payload?.reason}`;
      case 'freeze':
        return `🧊 تجميد حساب — ${request.targetName}\nالسبب: ${request.payload?.reason || 'تجاوز القوانين'}\n\nالتاريخ: ${currentDate}`;
      case 'unfreeze':
        return `🔓 فك تجميد الحساب — ${request.targetName}\n\nالتاريخ: ${currentDate}`;
      case 'delete':
        return `إشعار حذف الحساب — ${request.targetName}\nالرقم التسلسلي: ${request.payload?.serialNumber || 'غير مسجل'}`;
      case 'password_reset_approval':
        return `✅ استعادة بيانات الدخول — ${request.targetName}\nاسم المستخدم: ${request.payload?.username}\nكلمة المرور: ${request.payload?.password}\nالرقم التسلسلي: ${request.payload?.serialNumber || '—'}`;
      case 'password_reset_rejection':
        return `❌ رفض طلب استعادة بيانات الدخول — ${request.targetName}`;
      case 'absence_warning':
        return `⚠️ إنذار غياب — ${request.targetName}\nعدد الحصص المتغيب عنها: ${request.payload?.absenceCount || 10}`;
      case 'auto_freeze':
        return `🧊 تجميد تلقائي — ${request.targetName}\nعدد الحصص المتغيب عنها: ${request.payload?.absenceCount || 13}`;
      case 'auto_delete':
        return `🚨 حذف تلقائي — ${request.targetName}`;
      case 'data_update_approval':
        return `✅ موافقة على تعديل البيانات — ${request.targetName}`;
      case 'data_update_rejection':
        return `❌ رفض تعديل البيانات — ${request.targetName}\nالسبب: ${request.payload?.reason || ''}`;
      case 'unactivated_account_reminder':
        return `⚠️ تنبيه عدم تفعيل الحساب — ${request.targetName}\nالرقم التسلسلي: ${request.payload?.serialNumber || '—'}\nاسم المستخدم: ${request.payload?.username || '—'}\nكلمة المرور: ${request.payload?.password || '—'}`;
      case 'unactivated_account_deleted':
        return `🚨 حذف حساب غير مفعّل — ${request.targetName}\nالرقم التسلسلي: ${request.payload?.serialNumber || '—'}`;
      default:
        return `رسالة إلى ${request.targetName}`;
    }
  };

  const executeRequestAction = async (request) => {
    switch (request.type) {
      case 'freeze':
        await updateDoc(doc(db, 'profiles', request.targetId), {
          isFrozen: true, frozenAt: serverTimestamp(),
          freezeReason: request.payload?.reason || '', updatedAt: serverTimestamp()
        });
        break;
      case 'unfreeze':
        await updateDoc(doc(db, 'profiles', request.targetId), {
          isFrozen: false, frozenAt: null, updatedAt: serverTimestamp()
        });
        break;
      case 'delete':
        await deleteUserCompletely(request.targetId, { blacklistReason: request.payload?.reason || 'حذف بواسطة المدير' });
        break;
      case 'auto_delete':
      case 'unactivated_account_deleted':
        break;
      case 'password_reset_approval': {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({
            userId: request.targetId,
            newUsername: request.payload?.username,
            newPassword: request.payload?.password
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'فشل تحديث بيانات الدخول');
        }
        break;
      }
      case 'class_gender_change': {
        await updateClassGender(request.payload.classId, request.payload.newGender);
        const transfers = request.payload.transfers || [];
        for (const t of transfers) {
          if (t.toClassId) {
            await moveStudentToClass(t.studentId, request.payload.classId, t.toClassId);
            await setDoc(doc(collection(db, 'notifications', t.studentId, 'userNotifications')), {
              title: 'تغيير الشعبة',
              body: `تم نقلك من شعبة "${request.payload.className}" إلى "${t.toClassName || ''}" بسبب تغيير جنس الشعبة.`,
              type: 'class_transfer',
              createdAt: serverTimestamp(),
              read: false
            });
          }
        }
        break;
      }
      case 'class_delete':
        await deleteClassById(request.payload.classId);
        break;
      case 'student_class_transfer':
        if (Array.isArray(request.payload.finalClassIds)) {
          // تعديل شعب (حذف/إضافة) — يُطبَّق كاملاً وبشرط بقاء شعبة واحدة على الأقل
          await setStudentClasses(request.payload.studentId, request.payload.finalClassIds);
        } else {
          await moveStudentToClass(request.payload.studentId, request.payload.fromClassId, request.payload.toClassId);
        }
        await setDoc(doc(collection(db, 'notifications', request.payload.studentId, 'userNotifications')), {
          title: 'تغيير الشعبة',
          body: Array.isArray(request.payload.finalClassIds)
            ? `تم تعديل شعبك.${request.payload.addedClassIds?.length ? ` أُضيفت: ${request.payload.toClassName}.` : ''}${request.payload.removedClassIds?.length ? ` أُزيلت: ${request.payload.fromClassName}.` : ''}`
            : `تم نقلك من شعبة "${request.payload.fromClassName}" إلى "${request.payload.toClassName}".`,
          type: 'class_transfer',
          createdAt: serverTimestamp(),
          read: false
        });
        break;
      case 'unactivated_account_reminder':
      case 'warning':
      case 'notice':
      case 'general':
      case 'report':
      case 'absence_warning':
      case 'auto_freeze':
      case 'data_update_approval':
      case 'data_update_rejection':
      case 'password_reset_rejection':
      case 'reset_password':
        break;
      default:
        break;
    }
  };

  const handleSendWhatsApp = async (request) => {
    try {
      const studentObj = {
        name: request.targetName || '',
        phone: request.targetPhone || '',
        classes: request.targetClass ? request.targetClass.split(', ').map(n => ({ name: n })) : [],
        age: request.payload?.age,
        gender: request.payload?.gender,
        username: request.payload?.username || '',
        serialNumber: request.payload?.serialNumber || '',
        tempPassword: request.payload?.password
      };

      let success = true;
      switch (request.type) {
        case 'warning': success = sendWarningMessage(studentObj, request.payload.warningNumber, request.payload.description); break;
        case 'notice': success = sendNoticeMessage(studentObj, request.payload.description); break;
        case 'general': success = sendGeneralMessageToStudent(studentObj, request.payload.subject, request.payload.body); break;
        case 'report': success = sendReportMessage(studentObj, request.payload.reason, request.targetClass); break;
        case 'freeze': success = sendFreezeMessage(studentObj, request.payload?.reason || ''); break;
        case 'unfreeze': success = sendUnfreezeMessage(studentObj); break;
        case 'delete': success = sendDeleteMessage(studentObj); break;
        case 'reset_password': success = sendResetPasswordMessage(studentObj, request.payload.newPassword); break;
        case 'activation': success = sendActivationMessage(studentObj, request.payload.username, request.payload.password); break;
        case 'data_update_approval': success = sendDataUpdateApprovalMessage(studentObj, {}); break;
        case 'data_update_rejection': success = sendDataUpdateRejectionMessage(studentObj, request.payload?.reason); break;
        case 'absence_warning': success = sendAbsenceWarningMessage(studentObj, request.payload?.absenceCount || 10); break;
        case 'auto_freeze': success = sendAutoFreezeMessage(studentObj, request.payload?.absenceCount || 13); break;
        case 'auto_delete': success = sendAutoDeleteMessage(studentObj); break;
        case 'password_reset_approval': success = sendPasswordResetApprovalMessage(studentObj, request.payload?.username, request.payload?.password); break;
        case 'password_reset_rejection': success = sendPasswordResetRejectionMessage(studentObj); break;
        case 'unactivated_account_reminder': success = sendUnactivatedAccountReminderMessage(studentObj); break;
        case 'unactivated_account_deleted': success = sendUnactivatedAccountDeletedMessage(studentObj); break;
        default:
          toast.error('نوع طلب غير معروف.');
          return;
      }
      if (!success) toast.error('لم يتم فتح واتساب.');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const handleMarkSent = async (request) => {
    setProcessingAction(true);
    try {
      await executeRequestAction(request);
      await deleteMessageRequest(request.id);
      toast.success('✅ تم تنفيذ الإجراء وحذف الطلب نهائياً');
      setOpenRequestModal(null);
    } catch (e) {
      toast.error('فشل التنفيذ: ' + e.message);
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRejectRequest = async (requestId) => {
    const reason = await prompt('رفض الطلب', 'سبب الرفض (اختياري):', '');
    if (reason === null) return;
    try {
      await updateMessageRequestStatus(requestId, MESSAGE_REQUEST_STATUS.REJECTED, user.id, reason || '');
      toast.success('تم رفض الطلب.');
      setOpenRequestModal(null);
    } catch (err) { toast.error('فشل الرفض: ' + err.message); }
  };

  const handleResendRejected = async (requestId) => {
    try {
      await resendRejectedRequest(requestId);
      toast.success('✅ تم إرجاع الطلب لقائمة الانتظار');
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  const handleDeleteRequest = async (requestId) => {
    const ok = await confirm('حذف الطلب', 'هل أنت متأكد من حذف هذا الطلب نهائياً؟');
    if (!ok) return;
    try {
      await deleteMessageRequest(requestId);
      toast.success('تم حذف الطلب.');
    } catch (err) { toast.error('فشل الحذف: ' + err.message); }
  };

  const handleApproveAnnouncement = async (ann) => {
    const ok = await confirm('نشر الإعلان', `نشر الإعلان "${ann.title}" لجميع الطلاب؟`);
    if (!ok) return;
    try {
      await approveAnnouncement(ann.id, user.id, user.name || 'مدير');
      const studentsSnap = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'student')));
      for (const s of studentsSnap.docs) {
        await setDoc(doc(collection(db, 'notifications', s.id, 'userNotifications')), {
          title: ann.title,
          body: ann.body,
          type: 'general_announcement',
          relatedId: ann.id,
          createdAt: serverTimestamp(),
          read: false
        });
      }
      toast.success('✅ تم نشر الإعلان وإشعار جميع الطلاب');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const handleRejectAnnouncement = async (ann) => {
    const reason = await prompt('رفض الإعلان', 'سبب الرفض:', '');
    if (reason === null) return;
    try {
      await rejectAnnouncement(ann.id, reason);
      toast.success('تم رفض الإعلان.');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  const filteredRequests = messageRequests.filter(r => {
    if (r.type === 'report') return false;
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const pad2 = (n) => String(n).padStart(2, '0');

  if (loading) return <div className="text-center text-slate-500 dark:text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-white/90 dark:bg-gray-900/80 p-8 max-w-5xl w-full space-y-6 z-10 border border-gray-200 dark:border-gray-700 rounded-3xl backdrop-blur-sm shadow-xl">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-300 dark:border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <FaUserShield /> لوحة مدير النظام
            </h2>
            <p className="text-slate-600 dark:text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNotifications} className="relative bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-800 dark:text-white p-2 rounded-full text-2xl transition shadow-lg">
              <FaBell />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
              {notificationsActive && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg"><FaSignOutAlt /></button>
          </div>
        </div>

        {/* ✅ بطاقات العدادات — كلها getCountFromServer (رخصة جداً) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/50 dark:to-red-900/20 p-6 rounded-2xl border border-red-200 dark:border-red-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg"><FaExclamationTriangle className="text-white text-xl" /></div>
              <div><p className="text-xs text-red-600 dark:text-red-300 uppercase tracking-widest font-semibold">طلبات معلّقة</p><h3 className="text-sm font-bold text-red-900 dark:text-red-100">قيد المراجعة</h3></div>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white"><CountUp value={pendingCount} /></p>
          </div>

          <div className="bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/50 dark:to-emerald-900/20 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg"><FaUsers className="text-white text-xl" /></div>
              <div><p className="text-xs text-emerald-600 dark:text-emerald-300 uppercase tracking-widest font-semibold">الطلاب</p><h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">إجمالي المسجلين</h3></div>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white"><CountUp value={studentsCount} /></p>
          </div>

          <div className="bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/50 dark:to-indigo-900/20 p-6 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg"><FaUserShield className="text-white text-xl" /></div>
              <div><p className="text-xs text-indigo-600 dark:text-indigo-300 uppercase tracking-widest font-semibold">المشرفين</p><h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-100">الحسابات النشطة</h3></div>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white"><CountUp value={supervisorsCount} /></p>
          </div>

          <div className="bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/50 dark:to-blue-900/20 p-6 rounded-2xl border border-blue-200 dark:border-blue-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg"><FaChalkboardTeacher className="text-white text-xl" /></div>
              <div><p className="text-xs text-blue-600 dark:text-blue-300 uppercase tracking-widest font-semibold">المعلمين</p><h3 className="text-sm font-bold text-blue-900 dark:text-blue-100">في النظام</h3></div>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white"><CountUp value={teachersCount} /></p>
          </div>

          {/* ✅ بطاقة المحاضرات النشطة — تعتمد على lessonTimes المحملة lazily */}
          <div className="bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/50 dark:to-purple-900/20 p-6 rounded-2xl border border-purple-200 dark:border-purple-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg"><FaBroadcastTower className="text-white text-xl" /></div>
              <div><p className="text-xs text-purple-600 dark:text-purple-300 uppercase tracking-widest font-semibold">محاضرات</p><h3 className="text-sm font-bold text-purple-900 dark:text-purple-100">نشطة الآن</h3></div>
            </div>
            {lessonTimesLoaded ? (
              <p className="text-4xl font-black text-slate-900 dark:text-white"><CountUp value={activeLecturesCount} /></p>
            ) : (
              <button
                onClick={loadLessonTimes}
                disabled={loadingLessonTimes}
                className="text-sm text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 font-bold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loadingLessonTimes ? 'جاري التحميل...' : <><FaDownload /> تحميل</>}
              </button>
            )}
          </div>

          {/* ✅ بطاقة الحصة القادمة — lazy */}
          <div className="bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/50 dark:to-amber-900/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg"><FaHourglassHalf className="text-white text-xl" /></div>
              <div><p className="text-xs text-amber-600 dark:text-amber-300 uppercase tracking-widest font-semibold">الحصة القادمة</p></div>
            </div>
            {!lessonTimesLoaded ? (
              <button
                onClick={loadLessonTimes}
                disabled={loadingLessonTimes}
                className="text-sm text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 font-bold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loadingLessonTimes ? 'جاري التحميل...' : <><FaDownload /> تحميل</>}
              </button>
            ) : nextGlobalLesson ? (
              <p className="text-3xl font-black text-slate-900 dark:text-white tabular-nums" dir="ltr">
                {liveCountdown.d > 0 && <span className="text-amber-600 dark:text-amber-200">{liveCountdown.d}d </span>}
                {pad2(liveCountdown.h)}:{pad2(liveCountdown.m)}:{pad2(liveCountdown.s)}
              </p>
            ) : <p className="text-2xl font-black text-slate-400 dark:text-gray-500 text-center">—</p>}
          </div>
        </div>

        {/* ✅ الإعلانات المعلقة — Lazy (تُحمَّل عند فتح القسم) */}
        <div className="bg-blue-50 dark:bg-gray-800/60 rounded-2xl border border-blue-200 dark:border-blue-500/30 overflow-hidden">
          <button
            onClick={() => setAnnouncementsOpen(v => !v)}
            className="w-full p-6 flex justify-between items-center gap-3 hover:bg-blue-100/50 dark:hover:bg-gray-700/30 transition text-right"
          >
            <h3 className="text-xl font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <FaBroadcastTower /> إعلانات بانتظار موافقتك {announcementsLoaded && `(${pendingAnnouncements.length})`}
            </h3>
            {announcementsOpen
              ? <FaChevronUp className="text-blue-600 dark:text-blue-300" />
              : <FaChevronDown className="text-blue-600 dark:text-blue-300" />}
          </button>

          {announcementsOpen && (
            <div className="p-6 pt-0">
              {!announcementsLoaded ? (
                <div className="text-center py-6 text-gray-400">
                  <FaSyncAlt className="animate-spin text-2xl mx-auto mb-2" />
                  <p className="text-sm">جاري التحميل...</p>
                </div>
              ) : pendingAnnouncements.length === 0 ? (
                <p className="text-slate-500 dark:text-gray-400 text-center py-4">لا توجد إعلانات معلقة.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {pendingAnnouncements.map(ann => (
                    <div key={ann.id} className="p-4 bg-white dark:bg-black/30 rounded-xl border border-blue-200 dark:border-blue-500/20">
                      <div className="flex justify-between items-start gap-2 flex-wrap mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 dark:text-white font-bold">{ann.title}</p>
                          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">من: {ann.requestedByName || 'مشرف'}</p>
                          <p className="text-sm text-slate-700 dark:text-gray-300 mt-2 line-clamp-3 whitespace-pre-wrap">{ann.body}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <button onClick={() => handleApproveAnnouncement(ann)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                          <FaCheckCircle className="inline me-1" /> نشر
                        </button>
                        <button onClick={() => handleRejectAnnouncement(ann)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                          <FaTimesCircle className="inline me-1" /> رفض
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <SystemManagerReviewsSection user={user} />
        <ManagerSupportReviewsSection user={user} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onClick={() => setShowSectionsModal(true)} className="bg-teal-50 dark:bg-gradient-to-br dark:from-teal-900/40 dark:to-cyan-900/20 p-5 rounded-2xl border border-teal-200 dark:border-teal-500/30 hover:border-teal-400 dark:hover:border-teal-400/60 text-right shadow-lg transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg"><FaLayerGroup className="text-white text-xl" /></div>
                <div><p className="text-slate-900 dark:text-white font-bold">إدارة الأقسام</p><p className="text-xs text-teal-600 dark:text-teal-300 mt-0.5">{sectionsCount} قسم</p></div>
              </div>
              <FaChevronLeft className="text-teal-500 dark:text-teal-300" />
            </div>
          </button>

          <button onClick={() => setShowSupervisorsModal(true)} className="bg-indigo-50 dark:bg-gradient-to-br dark:from-indigo-900/40 dark:to-blue-900/20 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-500/30 hover:border-indigo-400 dark:hover:border-indigo-400/60 text-right shadow-lg transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg"><FaUserShield className="text-white text-xl" /></div>
                <div><p className="text-slate-900 dark:text-white font-bold">إدارة المشرفين</p><p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">{supervisorsCount} مشرف</p></div>
              </div>
              <FaChevronLeft className="text-indigo-500 dark:text-indigo-300" />
            </div>
          </button>

          <button onClick={() => setShowStudentsModal(true)} className="bg-blue-50 dark:bg-gradient-to-br dark:from-blue-900/40 dark:to-cyan-900/20 p-5 rounded-2xl border border-blue-200 dark:border-blue-500/30 hover:border-blue-400 dark:hover:border-blue-400/60 text-right shadow-lg transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg"><FaUsers className="text-white text-xl" /></div>
                <div><p className="text-slate-900 dark:text-white font-bold">إدارة الطلاب</p><p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">{studentsCount} طالب</p></div>
              </div>
              <FaChevronLeft className="text-blue-500 dark:text-blue-300" />
            </div>
          </button>

          <button onClick={() => setShowBlacklistModal(true)} className="bg-red-50 dark:bg-gradient-to-br dark:from-red-900/40 dark:to-rose-900/20 p-5 rounded-2xl border border-red-200 dark:border-red-500/30 hover:border-red-400 dark:hover:border-red-400/60 text-right shadow-lg transition-colors">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg"><FaBan className="text-white text-xl" /></div>
                <div><p className="text-slate-900 dark:text-white font-bold">القائمة السوداء</p><p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{blacklistCount} رقم محظور</p></div>
              </div>
              <FaChevronLeft className="text-red-500 dark:text-red-300" />
            </div>
          </button>
        </div>

        {/* ✅ طلبات الرسائل — Lazy (تُحمَّل عند فتح القسم) */}
        <div className="bg-amber-50 dark:bg-gray-800/60 rounded-2xl border border-amber-200 dark:border-amber-500/30 overflow-hidden">
          <button
            onClick={() => setRequestsOpen(v => !v)}
            className="w-full p-6 flex justify-between items-center gap-3 hover:bg-amber-100/50 dark:hover:bg-gray-700/30 transition text-right"
          >
            <div className="text-right">
              <h3 className="text-xl font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <FaPaperPlane /> طلبات الرسائل والإجراءات {requestsLoaded && `(${filteredRequests.length})`}
              </h3>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {pendingCount > 0 ? `⏳ ${pendingCount} طلب بانتظار المراجعة` : 'لا توجد طلبات معلقة حالياً'}
              </p>
            </div>
            {requestsOpen
              ? <FaChevronUp className="text-amber-600 dark:text-amber-300" />
              : <FaChevronDown className="text-amber-600 dark:text-amber-300" />}
          </button>

          {requestsOpen && (
            <div className="px-6 pb-6 pt-0">
              {requestsLoading && !requestsLoaded ? (
                <div className="text-center py-6 text-gray-400">
                  <FaSyncAlt className="animate-spin text-2xl mx-auto mb-2" />
                  <p className="text-sm">جاري تحميل الطلبات...</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button onClick={() => setRequestFilter('pending')} className={`px-3 py-1 rounded-lg text-xs transition-colors ${requestFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300'}`}>قيد المراجعة ({messageRequests.filter(r => r.status === 'pending' && r.type !== 'report').length})</button>
                    <button onClick={() => setRequestFilter('approved')} className={`px-3 py-1 rounded-lg text-xs transition-colors ${requestFilter === 'approved' ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300'}`}>معتمدة</button>
                    <button onClick={() => setRequestFilter('rejected')} className={`px-3 py-1 rounded-lg text-xs transition-colors ${requestFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300'}`}>مرفوضة</button>
                    <button onClick={() => setRequestFilter('all')} className={`px-3 py-1 rounded-lg text-xs transition-colors ${requestFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300'}`}>الكل</button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-gray-500 mb-3">📌 اضغط "فتح" لمراجعة الطلب — إرسال (فاتح واتساب) / تم الإرسال (تنفيذ + مسح) / رفض</p>

                  {filteredRequests.length === 0 ? (
                    <p className="text-slate-500 dark:text-gray-400 text-center py-6">لا توجد طلبات في هذا التصنيف.</p>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {filteredRequests.map(request => {
                        const isPending = request.status === 'pending';
                        const isApproved = request.status === 'approved';
                        const isRejected = request.status === 'rejected';
                        const isActionType = ACTION_TYPES.includes(request.type);
                        const statusBadge = isPending ? (
                          <span className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">⏳ قيد المراجعة</span>
                        ) : isApproved ? (
                          <span className="text-xs bg-green-500/20 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">✅ تم</span>
                        ) : (
                          <span className="text-xs bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">❌ مرفوض</span>
                        );

                        return (
                          <div key={request.id} className="p-4 bg-white dark:bg-black/30 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-amber-600 dark:text-amber-300 font-bold text-sm">{MESSAGE_REQUEST_TYPE_LABELS[request.type] || request.type}</span>
                                  {statusBadge}
                                </div>
                                <p className="text-slate-900 dark:text-white text-sm mt-1">
                                  <strong>{request.targetName}</strong>
                                  {request.targetClass && <span className="text-slate-500 dark:text-gray-400 text-xs mr-2">({request.targetClass})</span>}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">مقدم من: {request.requestedByName || 'مشرف'}</p>
                                <p className="text-[10px] text-slate-400 dark:text-gray-500 mt-1">
                                  {request.createdAt?.toDate?.() ? new Date(request.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2">
                                {isPending && (
                                  <>
                                    {isActionType ? (
                                      <button onClick={async () => {
                                        const ok = await confirm('تنفيذ الإجراء', 'تنفيذ هذا الإجراء مباشرة؟');
                                        if (!ok) return;
                                        setProcessingAction(true);
                                        try {
                                          await executeRequestAction(request);
                                          await deleteMessageRequest(request.id);
                                          toast.success('✅ تم التنفيذ');
                                        } catch (e) { toast.error('فشل: ' + e.message); }
                                        finally { setProcessingAction(false); }
                                      }} disabled={processingAction} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg">
                                        ✅ موافقة وتنفيذ
                                      </button>
                                    ) : (
                                      <button onClick={() => setOpenRequestModal(request)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                                        <FaEye className="inline me-1" /> فتح
                                      </button>
                                    )}
                                    <button onClick={() => handleRejectRequest(request.id)} className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg">
                                      <FaTimesCircle className="inline me-1" /> رفض
                                    </button>
                                  </>
                                )}
                                {isRejected && (
                                  <button onClick={() => handleResendRejected(request.id)} className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
                                    <FaRedoAlt className="inline me-1" /> إعادة للقائمة
                                  </button>
                                )}
                                {isApproved && (
                                  <button onClick={() => handleDeleteRequest(request.id)} className="text-xs bg-slate-500 hover:bg-slate-600 dark:bg-gray-600 dark:hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg">
                                    <FaTrashAlt className="inline me-1" /> حذف
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {openRequestModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => !processingAction && setOpenRequestModal(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col border border-amber-300 dark:border-amber-500/30 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-amber-600 dark:text-amber-300">
                {MESSAGE_REQUEST_TYPE_LABELS[openRequestModal.type] || openRequestModal.type}
              </h3>
              <button onClick={() => setOpenRequestModal(null)} className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="bg-slate-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-transparent">
                <p className="text-xs text-slate-500 dark:text-gray-400 mb-1">المستلم:</p>
                <p className="text-slate-900 dark:text-white font-bold">{openRequestModal.targetName}</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-sm text-cyan-600 dark:text-cyan-300 font-mono flex-1" dir="ltr">{openRequestModal.targetPhone || '—'}</p>
                  {openRequestModal.targetPhone && (
                    <button
                      onClick={() => { navigator.clipboard.writeText(openRequestModal.targetPhone); toast.success('تم نسخ الرقم'); }}
                      className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 p-1.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20"
                      title="نسخ الرقم"
                    >
                      <FaCopy />
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-transparent">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-slate-500 dark:text-gray-400">نص الرسالة:</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(buildMessageText(openRequestModal)); toast.success('تم نسخ الرسالة'); }}
                    className="text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 p-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20"
                    title="نسخ الرسالة"
                  >
                    <FaCopy />
                  </button>
                </div>
                <p className="text-sm text-slate-700 dark:text-gray-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto bg-white dark:bg-black/30 p-2 rounded border border-gray-200 dark:border-gray-700">
                  {buildMessageText(openRequestModal)}
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg p-2 text-xs text-blue-700 dark:text-blue-200">
                ℹ️ اضغط "إرسال" لفتح واتساب. بعد إتمام الإرسال فعلياً، اضغط "تم الإرسال" لتنفيذ الإجراء النهائي وحذف الطلب.
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
              <button
                onClick={() => handleSendWhatsApp(openRequestModal)}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <FaWhatsapp /> إرسال (فتح واتساب)
              </button>
              <button
                onClick={() => handleMarkSent(openRequestModal)}
                disabled={processingAction}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <FaCheckCircle /> {processingAction ? 'جاري التنفيذ...' : 'تم الإرسال (تنفيذ وحذف الطلب)'}
              </button>
              <button
                onClick={() => handleRejectRequest(openRequestModal.id)}
                disabled={processingAction}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <FaTimesCircle /> رفض
              </button>
            </div>
          </div>
        </div>
      )}

      <SupervisorsManagerModal isOpen={showSupervisorsModal} onClose={() => setShowSupervisorsModal(false)} user={user} onCountChange={setSupervisorsCount} />
      <StudentsManagerModal isOpen={showStudentsModal} onClose={() => setShowStudentsModal(false)} user={user} onCountChange={setStudentsCount} />
      <SectionsManagerModal isOpen={showSectionsModal} onClose={() => setShowSectionsModal(false)} user={user} onCountChange={setSectionsCount} mode="manager" />
      <BlacklistModal isOpen={showBlacklistModal} onClose={() => setShowBlacklistModal(false)} onCountChange={setBlacklistCount} />

      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-200 dark:border-gray-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-amber-600 dark:text-amber-300"><FaBell className="inline-block me-2" /> الإشعارات</h3>
              <button onClick={handleCloseNotifications} className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-2xl">✕</button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-slate-500 dark:text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl border bg-slate-50 dark:bg-gray-800/60 border-blue-200 dark:border-blue-500/40">
                    <div className="flex justify-between items-start">
                      <h4 className="text-slate-900 dark:text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-slate-500 dark:text-gray-400">{n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG') : ''}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-gray-300 mt-1">{n.body}</p>
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