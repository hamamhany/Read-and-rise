import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaUser, FaBell, FaSignOutAlt, FaPen, FaUsers, FaVideo, FaEdit,
  FaUpload, FaClock, FaCheckCircle, FaTimesCircle, FaEnvelope,
  FaComment, FaIdCard, FaFileAlt, FaEye
} from 'react-icons/fa';
import { db, messaging } from '../../firebase';
import { auth } from '../../services/firebaseAuth';
import {
  doc, getDoc, updateDoc, collection, query, where, getDocs,
  onSnapshot, orderBy, serverTimestamp, writeBatch, arrayUnion
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { useConfirm } from '../common/ConfirmContext';
import { CountdownTimer, HomeworkTextCountdown } from '../common/CountdownTimer';
import { sanitizeInput, arabicToEnglishNumber, fetchClassNames } from '../../utils/helpers';
import { recordAttendance, processStudentAbsences } from '../../services/attendance';
import { sendUrgentReminderMessage, sendContactTeacherMessage } from '../../utils/whatsapp';
import ExamTakingModal from './ExamTakingModal';
import ExamAnswersDetailModal from './ExamAnswersDetailModal';
import { getActiveExamsForStudent, getStudentAttemptsCount, getStudentExamResult } from '../../services/exams';

const StudentPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [teacherData, setTeacherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [availableHomeworks, setAvailableHomeworks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [notificationsActive, setNotificationsActive] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!messaging
  );

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editData, setEditData] = useState({});
  const [editFields, setEditFields] = useState({});
  const [pendingChanges, setPendingChanges] = useState(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [sentAccelerate, setSentAccelerate] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPendingRequestModal, setShowPendingRequestModal] = useState(false);

  const [showReviewResultModal, setShowReviewResultModal] = useState(false);
  const [reviewExpiry, setReviewExpiry] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const [classStudentCount, setClassStudentCount] = useState({});

  const [isRecordingAttendance, setIsRecordingAttendance] = useState(false);
  const absenceProcessedRef = useRef(false);

  // Exam states
  const [activeExams, setActiveExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [studentResults, setStudentResults] = useState({});
  const [reviewingExam, setReviewingExam] = useState(null);
  const [showReviewAnswers, setShowReviewAnswers] = useState(false);

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) return false;
      if ('serviceWorker' in navigator) {
        try {
          await Promise.race([
            navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 5000))
          ]);
        } catch (e) { console.warn('SW register skipped:', e.message); }
      }
      let permission = Notification.permission;
      if (permission === 'denied') { toast.error('الإشعارات محظورة من إعدادات المتصفح'); return false; }
      if (permission === 'default') { permission = await Notification.requestPermission(); }
      if (permission !== 'granted') return false;
      if (!messaging) return true;
      const vapidKey = import.meta.env.VITE_VAPID_KEY;
      if (!vapidKey) return true;
      let token = null;
      try {
        token = await Promise.race([
          getToken(messaging, { vapidKey }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('getToken timeout')), 10000))
        ]);
      } catch (e) { return true; }
      if (token) {
        try { await updateDoc(doc(db, 'profiles', user.id), { fcmTokens: arrayUnion(token) }); }
        catch (e) { console.warn('Save token failed:', e.message); }
      }
      return true;
    } catch (err) { console.error('Notification error:', err); return false; }
  };

  useEffect(() => {
    if (!messaging) return;
    try {
      const unsub = onMessage(messaging, (payload) => {
        toast.custom(() => (
          <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
            <strong className="block text-lg">{payload.notification?.title}</strong>
            <p className="text-sm text-gray-200">{payload.notification?.body}</p>
          </div>
        ), { duration: 5000 });
      });
      return () => unsub();
    } catch (err) { console.warn('onMessage setup failed:', err); }
  }, []);

  useEffect(() => {
    const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const unsubscribe = onSnapshot(studentsQuery, (snapshot) => {
      const counts = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        (data.classIds || []).forEach(classId => {
          counts[classId] = (counts[classId] || 0) + 1;
        });
      });
      setClassStudentCount(counts);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = new Date();
      const filtered = list.filter(item => {
        if (item.status === 'pending_approval' || item.status === 'rejected') return false;
        if (item.status === 'scheduled') {
          if (!item.scheduledFor) return false;
          const scheduled = new Date(item.scheduledFor.seconds * 1000);
          return scheduled > now;
        }
        return true;
      });
      setAnnouncements(filtered);
    });
    return () => unsubscribe();
  }, []);

  const handleOpenNotifications = () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      requestNotificationPermission()
        .then(ok => setNotificationsActive(ok))
        .catch(err => console.warn('Notification request failed:', err));
    }
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

  const fetchTeacherInfo = async () => {
    try {
      const q = query(collection(db, 'teachers'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();
        setTeacherData({ id: docSnap.id, ...data });
        const now = new Date().getTime();
        const available = (data.homeworks || []).filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    } catch (err) {
      setErrorMsg('فشل تحميل بيانات الصف: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'profiles', user.id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        let classNames = {};
        if (data.classIds && data.classIds.length > 0) {
          classNames = await fetchClassNames(data.classIds);
        }
        data.classes = (data.classIds || []).map(id => ({
          id, name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), { reviewResult: null, reviewExpiry: null });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }
        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        setSentAccelerate(!!(data.pendingChanges && data.pendingChanges.sentAccelerate));
        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        }
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    fetchTeacherInfo();
    fetchProfile();

    const q = query(collection(db, 'teachers'));
    const unsubscribeTeacher = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        setTeacherData({ id: docSnap.id, ...data });
        const now = new Date().getTime();
        const available = (data.homeworks || []).filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    });

    const unsubscribeProfile = onSnapshot(doc(db, 'profiles', user.id), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let classNames = {};
        if (data.classIds && data.classIds.length > 0) {
          classNames = await fetchClassNames(data.classIds);
        }
        data.classes = (data.classIds || []).map(id => ({
          id, name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), { reviewResult: null, reviewExpiry: null });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }
        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        setSentAccelerate(!!(data.pendingChanges && data.pendingChanges.sentAccelerate));
        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        }
      }
    });

    const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
    const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
    const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });

    return () => { unsubscribeTeacher(); unsubscribeProfile(); unsubscribeNotif(); };
  }, [user.id]);

  // ✅ تحميل الاختبارات المتاحة + نتائج الطالب (محاولة واحدة)
  useEffect(() => {
    if (!profile?.classIds || profile.classIds.length === 0) return;

    let isMounted = true;

    const loadExams = async () => {
      try {
        const exams = await getActiveExamsForStudent(profile.classIds);
        const available = [];
        const resultsMap = {};

        for (const exam of exams) {
          const attempts = await getStudentAttemptsCount(exam.id, user.id);
          const existingResult = await getStudentExamResult(exam.id, user.id);

          if (existingResult) {
            resultsMap[exam.id] = { ...existingResult, _examData: exam };
          }

          if (attempts < 1) {
            available.push({ ...exam, attemptsUsed: attempts });
          }
        }

        if (isMounted) {
          setActiveExams(available);
          setStudentResults(resultsMap);
        }
      } catch (err) {
        console.warn('Failed to load exams:', err);
      }
    };

    loadExams();
    return () => { isMounted = false; };
  }, [profile?.classIds, user.id, showExamModal]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (teacherData?.homeworks) {
        const now = new Date().getTime();
        const available = teacherData.homeworks.filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [teacherData?.homeworks]);

  useEffect(() => {
    if (absenceProcessedRef.current) return;
    if (!teacherData?.lessonTimes || !profile) return;
    absenceProcessedRef.current = true;
    processStudentAbsences(user.id, teacherData.lessonTimes).catch(err =>
      console.warn('absence processing failed:', err)
    );
  }, [teacherData?.lessonTimes, profile]);

  useEffect(() => {
    if (!reviewExpiry) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(reviewExpiry).getTime();
      const diff = expiry - now;
      if (diff <= 0) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
        clearInterval(interval);
        setShowReviewResultModal(false);
      } else {
        setTimeRemaining({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000)
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reviewExpiry]);

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null;
    const now = Date.now();
    const scheduled = teacherData.homeworks.filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() > now);
    if (scheduled.length === 0) return null;
    return scheduled.reduce((a, b) => new Date(a.reveal_time).getTime() < new Date(b.reveal_time).getTime() ? a : b);
  };

  const nextScheduled = getNextScheduledHomework();

  const getNextLessonTime = () => {
    if (!teacherData?.lessonTimes || teacherData.lessonTimes.length === 0) return null;
    const now = new Date();
    let nearest = null;

    for (const lt of teacherData.lessonTimes) {
      if (!lt.time || typeof lt.time.hours !== 'number' || typeof lt.time.minutes !== 'number') continue;

      if (lt.type === 'once') {
        const date = new Date(lt.date);
        if (!isNaN(date.getTime()) && date > now) {
          if (!nearest || date < new Date(nearest.date)) nearest = { ...lt, date: date.toISOString() };
        }
      } else if (lt.type === 'recurring') {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayIndex = days.indexOf(lt.day);
        if (dayIndex === -1) continue;
        const currentDay = now.getDay();
        let diff = dayIndex - currentDay;
        if (diff < 0) diff += 7;
        if (diff === 0) {
          const todayLessonTime = new Date(now);
          todayLessonTime.setHours(lt.time.hours, lt.time.minutes, 0, 0);
          if (todayLessonTime <= now) diff = 7;
        }
        const nextDate = new Date(now);
        nextDate.setDate(now.getDate() + diff);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (!nearest || nextDate < new Date(nearest.date)) nearest = { ...lt, date: nextDate.toISOString() };
      } else if (lt.type === 'monthly') {
        const monthDay = parseInt(lt.monthDay);
        if (!monthDay) continue;
        let nextDate = new Date(now.getFullYear(), now.getMonth(), monthDay);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (nextDate <= now) {
          nextDate = new Date(now.getFullYear(), now.getMonth() + 1, monthDay);
          nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        }
        if (!nearest || nextDate < new Date(nearest.date)) nearest = { ...lt, date: nextDate.toISOString() };
      }
    }
    return nearest;
  };

  const nextLesson = getNextLessonTime();

  const handleJoinLesson = async () => {
    setIsRecordingAttendance(true);
    try {
      await recordAttendance(user.id);
      setProfile(prev => prev ? {
        ...prev,
        lastAttendanceAt: new Date(),
        consecutiveAbsences: 0,
        absenceWarningSent: false
      } : prev);
      toast.success('✅ تم تسجيل حضورك بنجاح!');
    } catch (err) {
      toast.error('فشل تسجيل الحضور: ' + err.message);
    } finally {
      setIsRecordingAttendance(false);
    }
  };

  const openProfileModal = () => {
    if (hasPendingRequest) return setShowPendingRequestModal(true);
    if (reviewResult && reviewExpiry) return setShowReviewResultModal(true);
    setShowProfileModal(true);
    setEditData({
      name: profile?.name || '',
      gender: profile?.gender || '',
      age: profile?.age || '',
      phone: profile?.phone || ''
    });
    setEditFields({});
  };

  const toggleEditField = (field) => setEditFields(prev => ({ ...prev, [field]: !prev[field] }));
  const handleEditChange = (field, value) => setEditData(prev => ({ ...prev, [field]: value }));

  const handleSendChanges = async () => {
    const name = sanitizeInput(editData.name);
    const phoneRaw = sanitizeInput(editData.phone);
    if (!name || !phoneRaw) return toast.error('الاسم ورقم الهاتف إلزاميان');

    const phoneDigits = phoneRaw.replace(/[^\d]/g, '');
    const phone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;
    if (phone.startsWith('0')) {
      return toast.error('يرجى إدخال رقم الهاتف مع رمز الدولة بدون صفر بادئ.\nمثال: 9627XXXXXXXX', { duration: 7000 });
    }
    if (phone.length < 10 || phone.length > 15) {
      return toast.error('رقم الهاتف غير صالح. يرجى إدخال الرقم مع رمز الدولة (10 إلى 15 رقماً).', { duration: 7000 });
    }

    const changes = {};
    if (name !== profile.name) changes.name = name;
    if (editData.gender !== profile.gender) changes.gender = editData.gender;
    if (editData.age !== profile.age) changes.age = parseInt(editData.age) || null;
    if (phone !== profile.phone) changes.phone = phone;
    if (Object.keys(changes).length === 0) return toast.error('لم تقم بأي تغيير.');

    try {
      await updateDoc(doc(db, 'profiles', user.id), {
        pendingChanges: { updated_at: new Date().toISOString(), ...changes },
        updatedAt: serverTimestamp()
      });
      toast.success('تم إرسال طلب تعديل المعلومات بنجاح.');
      setShowProfileModal(false);
      setShowConfirmModal(true);
    } catch (err) {
      toast.error('فشل إرسال الطلب: ' + err.message);
    }
  };

  const handleContactTeacher = () => {
    sendUrgentReminderMessage(profile);
    if (profile && profile.pendingChanges) {
      updateDoc(doc(db, 'profiles', user.id), { 'pendingChanges.sentAccelerate': true }).catch(() => {});
    }
    setSentAccelerate(true);
    setShowConfirmModal(false);
    setShowPendingRequestModal(false);
    toast.success('تم إرسال رسالة الاستعجال للمعلم.');
  };

  // ✅ بدء اختبار — محاولة واحدة فقط
  const handleStartExam = async (exam) => {
    const used = exam.attemptsUsed || 0;
    if (used >= 1) {
      toast.error('لقد قدمت هذا الاختبار بالفعل. لا يمكنك إعادة المحاولة.');
      return;
    }
    const ok = await confirm(
      'بدء الاختبار',
      `هل أنت متأكد من بدء الاختبار "${exam.title}"؟\nلديك محاولة واحدة فقط. بعد التسليم لا يمكنك التراجع أو إعادة المحاولة.`
    );
    if (!ok) return;
    setSelectedExam(exam);
    setShowExamModal(true);
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <button onClick={openProfileModal} type="button" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md flex items-center gap-1">
              <FaUser className="inline-block me-1" /> معلوماتي
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title={notificationsActive ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}
            >
              <FaBell />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
              {notificationsActive && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/20 p-4 rounded-2xl border border-cyan-500/30 text-center">
            <p className="text-xs text-cyan-300 uppercase tracking-widest font-semibold mb-1">الرقم التسلسلي</p>
            <p className="text-2xl font-bold text-cyan-100 font-mono tracking-widest" dir="ltr">
              {profile?.serialNumber || '—'}
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-900/40 to-green-900/20 p-4 rounded-2xl border border-emerald-500/30 text-center">
            <p className="text-xs text-emerald-300 uppercase tracking-widest font-semibold mb-1">العمر</p>
            <p className="text-2xl font-bold text-emerald-100">{profile?.age || '—'} <span className="text-xs">سنة</span></p>
          </div>
          <div className="bg-gradient-to-br from-amber-900/40 to-orange-900/20 p-4 rounded-2xl border border-amber-500/30 text-center">
            <p className="text-xs text-amber-300 uppercase tracking-widest font-semibold mb-1">البلد</p>
            <p className="text-2xl font-bold text-amber-100">{profile?.country || '—'}</p>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-green-500/20">
          <h3 className="text-xl font-semibold text-green-200 mb-4 flex items-center gap-2">
            <FaUsers className="inline-block" /> عدد الطلاب في شعبك
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile?.classes?.map(cls => (
              <div key={cls.id} className="relative bg-gradient-to-br from-green-900/30 to-emerald-900/20 p-4 rounded-xl border border-green-500/20 hover:border-green-400/40 transition group overflow-hidden">
                <div className="absolute top-0 left-0 w-16 h-16 bg-green-500/10 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
                <div className="relative z-10 flex justify-between items-center">
                  <div>
                    <span className="text-gray-300 text-sm">{cls.name}</span>
                    <p className="text-[10px] text-green-500/70 mt-0.5">شعبة</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                    <span className="text-white font-bold text-base">
                      {classStudentCount[cls.id] || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {(!profile?.classes || profile.classes.length === 0) && (
              <p className="text-gray-400 text-sm col-span-2">لا توجد شعب مسجلة لك.</p>
            )}
          </div>
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          <CountdownTimer targetDate={nextLesson ? nextLesson.date : null} />
          <div className="mt-4 flex flex-col items-center gap-2 w-full">
            <button
              onClick={handleJoinLesson}
              disabled={isRecordingAttendance}
              className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg transition-all duration-300 transform hover:scale-105 w-full text-center block"
            >
              <FaVideo className="inline-block me-2" />
              {isRecordingAttendance ? 'جاري تسجيل الحضور...' : '🎯 انضم إلى غرفة الصف الآن (تسجيل حضور)'}
            </button>

            {profile?.consecutiveAbsences > 0 && (
              <div className={`mt-3 p-3 rounded-xl border text-sm text-center w-full ${
                profile.consecutiveAbsences >= 13
                  ? 'bg-red-500/20 border-red-500/40 text-red-200'
                  : profile.consecutiveAbsences >= 10
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-200'
                    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
              }`}>
                ⚠️ غيابك المتتالي: <strong>{profile.consecutiveAbsences}</strong> حصة — يُرجى تسجيل الحضور فوراً
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-3">
          <h3 className="text-xl font-semibold text-pink-300"><FaPen className="inline-block me-2" /> الواجبات المدرسية</h3>
          {availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
                  <p className="text-xs text-gray-400 mt-1">نشر في: {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400">لا توجد واجبات متاحة حالياً.</p>
              {nextScheduled && <HomeworkTextCountdown targetDate={nextScheduled.reveal_time} />}
            </div>
          )}
        </div>

        {/* ✅ قسم الاختبارات المتاحة — محاولة واحدة */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-orange-500/20">
          <h3 className="text-xl font-semibold text-orange-300 mb-4">
            <FaFileAlt className="inline-block me-2" /> الاختبارات المتاحة
          </h3>
          <div className="space-y-3">
            {activeExams.map(exam => (
              <div
                key={exam.id}
                className="flex justify-between items-center p-4 bg-black/30 rounded-xl border border-orange-500/20 flex-wrap gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold">{exam.title}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    المدة: {exam.duration ? `${exam.duration} دقيقة` : 'غير محددة'} |
                    الأسئلة: {exam.questions?.length || 0} |
                    التصحيح: {exam.correctionMode === 'manual' ? 'يدوي' : 'تلقائي'}
                  </p>
                  {exam.startTime && (
                    <p className="text-[10px] text-cyan-300 mt-1">
                      متاح من: {new Date(exam.startTime).toLocaleString('ar-EG')}
                    </p>
                  )}
                  {exam.endTime && (
                    <p className="text-[10px] text-red-300 mt-0.5">
                      ينتهي في: {new Date(exam.endTime).toLocaleString('ar-EG')}
                    </p>
                  )}
                  <p className="text-[10px] text-red-300 mt-1 bg-red-500/10 px-2 py-1 rounded inline-block border border-red-500/30">
                    ⚠️ محاولة واحدة فقط
                  </p>
                </div>
                <button
                  onClick={() => handleStartExam(exam)}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-bold whitespace-nowrap"
                >
                  بدء الاختبار
                </button>
              </div>
            ))}
            {activeExams.length === 0 && (
              <p className="text-gray-400 text-center py-4">لا توجد اختبارات متاحة حالياً.</p>
            )}
          </div>
        </div>

        {/* ✅ اختباراتك المقدمة — مراجعة الإجابات */}
        {Object.keys(studentResults).length > 0 && (
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-green-500/20">
            <h3 className="text-xl font-semibold text-green-300 mb-4">
              <FaCheckCircle className="inline-block me-2" /> اختباراتك المقدمة
            </h3>
            <div className="space-y-3">
              {Object.entries(studentResults).map(([examId, result]) => {
                const isCorrected = result.correctionStatus === 'auto_corrected' || result.correctionStatus === 'manually_corrected';
                const isPending = result.correctionStatus === 'pending_correction';

                return (
                  <div
                    key={examId}
                    className="flex justify-between items-center p-4 bg-black/30 rounded-xl border border-green-500/20 flex-wrap gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold">{result.examTitle}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        العلامة: <span className={isCorrected ? 'text-green-400 font-bold' : 'text-gray-400'}>
                          {isCorrected ? `${result.score}/${result.totalPoints || result.totalQuestions}` : 'قيد التصحيح'}
                        </span>
                        {' | '}
                        الوقت: {result.timeTakenSeconds ? `${Math.floor(result.timeTakenSeconds / 60)}د ${result.timeTakenSeconds % 60}ث` : '—'}
                      </p>
                      {isPending && (
                        <p className="text-[10px] text-yellow-300 mt-1 bg-yellow-500/10 px-2 py-1 rounded inline-block border border-yellow-500/30">
                          ⏳ سيتم التصحيح من قبل المعلم
                        </p>
                      )}
                    </div>
                    {isCorrected && (
                      <button
                        onClick={() => {
                          setReviewingExam({ result, exam: result._examData });
                          setShowReviewAnswers(true);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold whitespace-nowrap"
                      >
                        <FaEye className="inline me-1" /> مراجعة الإجابات
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowProfileModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4"><FaUser className="inline-block me-2" /> معلوماتي الشخصية</h3>

            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-cyan-300 mb-1"><FaIdCard className="inline me-1" /> الرقم التسلسلي (ثابت)</p>
              <p className="text-lg font-bold text-cyan-100 font-mono tracking-widest" dir="ltr">
                {profile?.serialNumber || '—'}
              </p>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 text-center">
              <p className="text-xs text-amber-300 mb-1">البلد (ثابت — لا يمكن تغييره)</p>
              <p className="text-lg font-bold text-amber-100">{profile?.country || '—'}</p>
            </div>

            <div className="space-y-4">
              {['name', 'gender', 'age', 'phone'].map(field => {
                const labels = { name: 'الاسم الكامل', gender: 'الجنس', age: 'العمر', phone: 'رقم الهاتف' };
                const required = field === 'name' || field === 'phone';
                return (
                  <div key={field}>
                    <div className="flex justify-between items-center">
                      <label className="text-sm text-gray-300">{labels[field]} {required && <span className="text-red-400">*</span>}</label>
                      <button onClick={() => toggleEditField(field)} className="text-xs text-blue-400 hover:text-blue-300">
                        {editFields[field] ? 'إلغاء التعديل' : <><FaEdit className="inline-block me-1" /> تعديل</>}
                      </button>
                    </div>
                    {editFields[field] ? (
                      field === 'gender' ? (
                        <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={editData[field] || ''} onChange={(e) => handleEditChange(field, e.target.value)}>
                          <option value="">اختر</option>
                          <option value="ذكر">ذكر</option>
                          <option value="أنثى">أنثى</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          inputMode={field === 'age' || field === 'phone' ? 'numeric' : 'text'}
                          placeholder={field === 'phone' ? 'مع رمز الدولة بدون + مثال: 9627XXXXXXXX' : ''}
                          className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                          value={editData[field] || ''}
                          onChange={(e) => handleEditChange(field, (field === 'age' || field === 'phone') ? arabicToEnglishNumber(e.target.value) : e.target.value)}
                        />
                      )
                    ) : (
                      <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData[field] || 'غير مسجل'}</p>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-3 mt-4">
                <button onClick={handleSendChanges} className="btn-primary bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-md text-white"><FaUpload className="inline-block me-2" /> إرسال التغييرات</button>
                <button onClick={() => setShowProfileModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300"><FaBell className="inline-block me-2" /> الإشعارات</h3>
              <button onClick={handleCloseNotifications} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">📌 ستُحذف الإشعارات تلقائياً عند إغلاق النافذة .</p>
            {!notificationsActive && (
              <div className="mb-4 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-200 text-sm">
                ⚠️ الإشعارات غير مفعلة. اضغط على زر الجرس لتفعيلها.
              </div>
            )}
            <div className="space-y-3">
              {announcements.map(item => (
                <div key={item.id} className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
                  <div className="flex justify-between items-start">
                    <h4 className="text-white font-medium">{item.title}</h4>
                    <span className="text-xs text-gray-400">
                      {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{item.body}</p>
                </div>
              ))}
              {notifications.map((n) => (
                <div key={n.id} className="p-3 rounded-xl border bg-gray-800/60 border-blue-500/40">
                  <div className="flex justify-between items-start">
                    <h4 className="text-white font-medium">{n.title}</h4>
                    <span className="text-xs text-gray-400">
                      {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                </div>
              ))}
              {announcements.length === 0 && notifications.length === 0 && <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>}
            </div>
          </div>
        </div>
      )}

      {showPendingRequestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPendingRequestModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4"><FaClock className="inline-block me-2" /> طلب قيد المراجعة</h3>
            <p className="text-gray-300 text-center mb-4">لديك طلب تعديل بيانات قيد المراجعة حالياً.</p>
            <div className="flex flex-col gap-3">
              <button onClick={handleContactTeacher} disabled={sentAccelerate} className={`btn-primary w-full py-3 rounded-md text-white ${sentAccelerate ? 'bg-gray-600 cursor-not-allowed opacity-60' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {sentAccelerate ? '✅ تم إرسال الطلب' : <><FaEnvelope className="inline-block me-2" /> تسريع الطلب</>}
              </button>
              <button onClick={() => setShowPendingRequestModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-green-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4"><FaCheckCircle className="inline-block me-2" /> تم إرسال الطلب</h3>
            <p className="text-gray-300 text-center mb-4">سيتم مراجعة البيانات خلال 48 ساعة.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => sendContactTeacherMessage(profile, 'update')} className="btn-primary bg-blue-600 hover:bg-blue-700 w-full py-3 rounded-md text-white"><FaComment className="inline-block me-2" /> تواصل مع المعلم</button>
              <button onClick={() => setShowConfirmModal(false)} className="btn-primary bg-red-600 hover:bg-red-700 w-full py-3 rounded-md text-white"><FaClock className="inline-block me-2" /> انتظار</button>
            </div>
          </div>
        </div>
      )}

      {showReviewResultModal && reviewExpiry && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReviewResultModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-purple-300 mb-2 text-center">
              {reviewResult === 'approved' ? <><FaCheckCircle className="inline-block me-2" /> تمت الموافقة</> : <><FaTimesCircle className="inline-block me-2" /> تم الرفض</>}
            </h3>
            <p className="text-gray-300 text-center mb-4">الوقت المتبقي لفتح التعديل مرة أخرى:</p>
            <div className="flex justify-center gap-4 text-2xl font-bold text-white">
              <div><span className="text-purple-300">{String(timeRemaining.hours).padStart(2, '0')}</span><span className="text-xs block text-gray-400">ساعات</span></div>
              <span className="text-gray-500">:</span>
              <div><span className="text-purple-300">{String(timeRemaining.minutes).padStart(2, '0')}</span><span className="text-xs block text-gray-400">دقائق</span></div>
              <span className="text-gray-500">:</span>
              <div><span className="text-purple-300">{String(timeRemaining.seconds).padStart(2, '0')}</span><span className="text-xs block text-gray-400">ثواني</span></div>
            </div>
            <button onClick={() => setShowReviewResultModal(false)} className="mt-4 btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white">إغلاق</button>
          </div>
        </div>
      )}

      {selectedExam && showExamModal && (
        <ExamTakingModal
          exam={selectedExam}
          student={{
            ...user,
            serialNumber: profile?.serialNumber || user?.serialNumber || '',
            name: profile?.name || user?.name || user?.username || 'طالب'
          }}
          onClose={() => {
            setShowExamModal(false);
            setSelectedExam(null);
          }}
        />
      )}

      {showReviewAnswers && reviewingExam && (
        <ExamAnswersDetailModal
          isOpen={showReviewAnswers}
          onClose={() => { setShowReviewAnswers(false); setReviewingExam(null); }}
          result={reviewingExam.result}
          exam={reviewingExam.exam}
          viewerMode="student"
        />
      )}
    </div>
  );
};

export default StudentPanel;