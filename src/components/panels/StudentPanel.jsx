import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaUser, FaBell, FaSignOutAlt, FaPen, FaUsers, FaVideo, FaEdit, 
  FaUpload, FaClock, FaCheckCircle, FaTimesCircle, FaEnvelope, 
  FaComment, FaBan, FaExclamationTriangle 
} from 'react-icons/fa';
import { db, messaging } from '../../firebase';
import { auth } from '../../services/firebaseAuth';
import { 
  doc, getDoc, updateDoc, collection, query, where, getDocs, 
  onSnapshot, orderBy, serverTimestamp, writeBatch, deleteDoc,
  arrayUnion
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { useConfirm } from '../common/ConfirmContext';
import { CountdownTimer, HomeworkTextCountdown } from '../common/CountdownTimer';
import { MeetingModal } from '../common/MeetingModal';
import { sanitizeInput, arabicToEnglishNumber, fetchClassNames } from '../../utils/helpers';
import { getZoomMeetings } from '../../services/zoom';
import { sendUrgentReminderMessage, sendContactTeacherMessage } from '../../utils/whatsapp';

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
  const [announcements, setAnnouncements] = useState([]);

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

  // Zoom states
  const [zoomMeetings, setZoomMeetings] = useState([]);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState(null);

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (!auth.currentUser) {
      toast.error('يرجى تسجيل الدخول أولاً.');
      return;
    }
    if (Notification.permission === 'granted') {
      try {
        const token = await getToken(messaging, { vapidKey: 'BMuOctGyoxHcX03mppaXioqagujweclql9d9dpeLRTsZAIQpcgdcBveP-DGzaVctK7nIF1liaeo6vvfxg-uIAbI' });
        if (token) {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
        }
      } catch (err) {
        console.error('FCM token error:', err);
        toast.error('فشل جلب توكن الإشعارات: ' + err.message);
      }
      return;
    }
    if (Notification.permission === 'denied') {
      toast.error('تم رفض الإذن، يرجى تفعيله من إعدادات المتصفح');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        const token = await getToken(messaging, { vapidKey: 'BMuOctGyoxHcX03mppaXioqagujweclql9d9dpeLRTsZAIQpcgdcBveP-DGzaVctK7nIF1liaeo6vvfxg-uIAbI' });
        if (token) {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
          toast.success('تم تفعيل الإشعارات بنجاح');
        }
      } catch (err) {
        toast.error('فشل تفعيل الإشعارات: ' + err.message);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onMessage(messaging, (payload) => {
      toast.custom((t) => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsubscribe();
  }, []);

  // Fetch student count per class
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

  // Fetch announcements
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = new Date();
      const filtered = list.filter(item => {
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

  // Fetch Zoom meetings from Supabase
  useEffect(() => {
    const fetchZoomMeetings = async () => {
      if (!user?.classIds || user.classIds.length === 0) return;
      const allMeetings = [];
      for (const classId of user.classIds) {
        const meetings = await getZoomMeetings(classId, null);
        allMeetings.push(...meetings);
      }
      setZoomMeetings(allMeetings);
    };
    fetchZoomMeetings();
  }, [user?.classIds]);

  const cleanOldNotifications = async () => {
    if (!user) return;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oldOnes = notifications.filter(n => {
      if (!n.createdAt) return false;
      const date = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
      return date < sevenDaysAgo;
    });
    if (oldOnes.length === 0) return;
    try {
      const batch = writeBatch(db);
      oldOnes.forEach(n => {
        const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
        batch.delete(ref);
      });
      await batch.commit();
      toast.success(`تم حذف ${oldOnes.length} إشعار قديم`);
    } catch (err) {
      console.error('خطأ في حذف الإشعارات القديمة:', err);
    }
  };

  const handleOpenNotifications = async () => {
    await requestNotificationPermission();
    cleanOldNotifications();
    setShowNotificationsModal(true);
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
      console.error(err);
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
          id,
          name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), {
              reviewResult: null,
              reviewExpiry: null
            });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }

        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        if (data.pendingChanges && data.pendingChanges.sentAccelerate) {
          setSentAccelerate(true);
        } else {
          setSentAccelerate(false);
        }

        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        } else {
          setReviewResult(null);
          setReviewExpiry(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
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
          id,
          name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), {
              reviewResult: null,
              reviewExpiry: null
            });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }

        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        if (data.pendingChanges && data.pendingChanges.sentAccelerate) {
          setSentAccelerate(true);
        } else {
          setSentAccelerate(false);
        }

        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        } else {
          setReviewResult(null);
          setReviewExpiry(null);
        }
      }
    });

    if (user) {
      const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
      const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
      const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(list);
        setUnreadCount(list.filter(n => !n.read).length);
      });
      return () => {
        unsubscribeTeacher();
        unsubscribeProfile();
        unsubscribeNotif();
      };
    }

    return () => {
      unsubscribeTeacher();
      unsubscribeProfile();
    };
  }, [user.id]);

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
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining({ hours, minutes, seconds });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reviewExpiry]);

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null;
    const now = new Date().getTime();
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
      if (lt.type === 'once') {
        const date = new Date(lt.date);
        if (date > now) {
          if (!nearest || date < new Date(nearest.date)) nearest = lt;
        }
      } else if (lt.type === 'recurring') {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayIndex = days.indexOf(lt.day);
        const today = new Date();
        const currentDay = today.getDay();
        let diff = dayIndex - currentDay;
        if (diff < 0) diff += 7;
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + diff);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (nextDate > now) {
          if (!nearest || nextDate < new Date(nearest.date)) {
            nearest = { ...lt, date: nextDate.toISOString() };
          }
        }
      }
    }
    return nearest;
  };

  const nextLesson = getNextLessonTime();

  const handleJoinMeeting = (meeting) => {
    if (!meeting.signature) {
      toast.error('لا يوجد توقيع صالح لهذا الاجتماع.');
      return;
    }
    setActiveMeeting({
      meeting_number: meeting.meeting_number,
      password: meeting.password || '',
      signature: meeting.signature,
      topic: meeting.topic
    });
    setIsZoomOpen(true);
  };

  const openProfileModal = () => {
    if (hasPendingRequest) {
      setShowPendingRequestModal(true);
      return;
    }
    if (reviewResult && reviewExpiry) {
      setShowReviewResultModal(true);
      return;
    }
    setShowProfileModal(true);
    setEditData({
      name: profile?.name || '',
      gender: profile?.gender || '',
      age: profile?.age || '',
      phone: profile?.phone || ''
    });
    setEditFields({});
  };

  const toggleEditField = (field) => {
    setEditFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleEditChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleSendChanges = async () => {
    const name = sanitizeInput(editData.name);
    const phone = sanitizeInput(editData.phone);
    if (!name || !phone) {
      toast.error('الاسم ورقم الهاتف إلزاميان');
      return;
    }
    const changes = {};
    if (name !== profile.name) changes.name = name;
    if (editData.gender !== profile.gender) changes.gender = editData.gender;
    if (editData.age !== profile.age) changes.age = parseInt(editData.age) || null;
    if (phone !== profile.phone) changes.phone = phone;
    if (Object.keys(changes).length === 0) {
      toast.error('لم تقم بأي تغيير.');
      return;
    }

    try {
      const updates = {
        pendingChanges: {
          updated_at: new Date().toISOString(),
          ...changes
        },
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, 'profiles', user.id), updates);
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
      updateDoc(doc(db, 'profiles', user.id), {
        'pendingChanges.sentAccelerate': true
      }).catch(err => console.error(err));
    }
    setSentAccelerate(true);
    setShowConfirmModal(false);
    setShowPendingRequestModal(false);
    toast.success('تم إرسال رسالة الاستعجال للمعلم.');
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <button
              onClick={openProfileModal}
              type="button"
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md flex items-center gap-1"
            >
              <FaUser className="inline-block me-1" /> معلوماتي
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title="الإشعارات"
            >
              <FaBell />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-green-500/20">
          <h3 className="text-xl font-semibold text-green-200 mb-2">
            <FaUsers className="inline-block me-2" /> عدد الطلاب في شعبك
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile?.classes?.map(cls => (
              <div key={cls.id} className="bg-black/30 p-3 rounded-xl flex justify-between items-center border border-green-500/10">
                <span className="text-gray-300">{cls.name}</span>
                <span className="text-white font-bold text-lg bg-green-900/40 px-3 py-1 rounded-full">
                  {classStudentCount[cls.id] || 0}
                </span>
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
          {teacherData?.lessonTimes && teacherData.lessonTimes.length > 0 && (
            <div className="text-gray-300 text-center mt-2">
              <p>جميع المواعيد المحددة:</p>
              <ul className="text-sm list-disc list-inside">
                {teacherData.lessonTimes.map((lt, idx) => (
                  <li key={idx}>
                    {lt.type === 'once' ?
                      `مرة واحدة: ${new Date(lt.date).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}` :
                      `متكرر: كل ${lt.day} الساعة ${lt.time.hours}:${String(lt.time.minutes).padStart(2, '0')}`
                    }
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Join meeting button */}
          {zoomMeetings.length > 0 && (() => {
            const now = new Date();
            let nearestMeeting = null;
            let nearestDiff = Infinity;
            for (const meeting of zoomMeetings) {
              const meetingTime = new Date(meeting.start_time);
              const diffMinutes = (meetingTime - now) / (1000 * 60);
              if (diffMinutes >= -5 && diffMinutes <= 10 && diffMinutes < nearestDiff) {
                nearestDiff = diffMinutes;
                nearestMeeting = meeting;
              }
            }
            if (nearestMeeting) {
              return (
                <div className="mt-4 flex flex-col items-center gap-2 w-full">
                  <button
                    onClick={() => handleJoinMeeting(nearestMeeting)}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg transition-all duration-300 transform hover:scale-105 w-full text-center block animate-pulse"
                  >
                    <FaVideo className="inline-block me-2" />
                    🎯 انضم إلى غرفة الصف الآن (داخل المنصة)
                  </button>
                  <span className="text-xs text-gray-400">
                    الاجتماع يبدأ {nearestDiff >= 0 ? `خلال ${Math.round(nearestDiff)} دقيقة` : `منذ ${Math.round(-nearestDiff)} دقيقة`}
                  </span>
                </div>
              );
            }
            return null;
          })()}

          <ZoomMeetingModal
            isOpen={isZoomOpen}
            onClose={() => {
              setIsZoomOpen(false);
              setActiveMeeting(null);
            }}
            meetingDetails={activeMeeting}
            userName={user.name || user.username || "طالب"}
            userEmail={user.email || `${user.username}@readandrise.com`}
          />
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-3">
          <h3 className="text-xl font-semibold text-pink-300">
            <FaPen className="inline-block me-2" /> الواجبات المدرسية
          </h3>
          {availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    نشر في: {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400">لا توجد واجبات متاحة حالياً.</p>
              {nextScheduled && (
                <div className="mt-2">
                  <HomeworkTextCountdown targetDate={nextScheduled.reveal_time} />
                  <p className="text-xs text-gray-500 mt-1">(الواجب القادم سيظهر تلقائياً)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowProfileModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">
              <FaUser className="inline-block me-2" /> معلوماتي الشخصية
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">الاسم الكامل <span className="text-red-400">*</span></label>
                  <button onClick={() => toggleEditField('name')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.name ? 'إلغاء التعديل' : <><FaEdit className="inline-block me-1" /> تعديل</>}
                  </button>
                </div>
                {editFields.name ? (
                  <input
                    type="text"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.name}
                    onChange={(e) => handleEditChange('name', e.target.value)}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.name || 'غير مسجل'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">الجنس</label>
                  <button onClick={() => toggleEditField('gender')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.gender ? 'إلغاء التعديل' : <><FaEdit className="inline-block me-1" /> تعديل</>}
                  </button>
                </div>
                {editFields.gender ? (
                  <select
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.gender}
                    onChange={(e) => handleEditChange('gender', e.target.value)}
                  >
                    <option value="">اختر</option>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.gender || 'غير محدد'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">العمر</label>
                  <button onClick={() => toggleEditField('age')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.age ? 'إلغاء التعديل' : <><FaEdit className="inline-block me-1" /> تعديل</>}
                  </button>
                </div>
                {editFields.age ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.age}
                    onChange={(e) => handleEditChange('age', arabicToEnglishNumber(e.target.value))}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.age || 'غير محدد'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">رقم الهاتف <span className="text-red-400">*</span></label>
                  <button onClick={() => toggleEditField('phone')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.phone ? 'إلغاء التعديل' : <><FaEdit className="inline-block me-1" /> تعديل</>}
                  </button>
                </div>
                {editFields.phone ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.phone}
                    onChange={(e) => handleEditChange('phone', arabicToEnglishNumber(e.target.value))}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.phone || 'غير مسجل'}</p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleSendChanges} className="btn-primary bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-md text-white">
                  <FaUpload className="inline-block me-2" /> إرسال التغييرات
                </button>
                <button onClick={() => setShowProfileModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending request modal */}
      {showPendingRequestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPendingRequestModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">
              <FaClock className="inline-block me-2" /> طلب قيد المراجعة
            </h3>
            <p className="text-gray-300 text-center mb-4">
              لديك طلب تعديل بيانات قيد المراجعة حالياً. يرجى الانتظار حتى يتم الرد على طلبك.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  if (!sentAccelerate) {
                    handleContactTeacher();
                  } else {
                    toast('تم إرسال رسالة الاستعجال مسبقاً.', {
                      duration: 3000,
                      style: { background: '#333', color: '#fff' }
                    });
                  }
                }}
                disabled={sentAccelerate}
                className={`btn-primary w-full py-3 rounded-md text-white ${
                  sentAccelerate
                    ? 'bg-gray-600 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {sentAccelerate ? '✅ تم إرسال الطلب للمعلم' : <><FaEnvelope className="inline-block me-2" /> إرسال رسالة لتسريع الطلب</>}
              </button>
              <button
                onClick={() => setShowPendingRequestModal(false)}
                className="btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-green-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">
              <FaCheckCircle className="inline-block me-2" /> تم إرسال الطلب
            </h3>
            <p className="text-gray-300 text-center mb-4">
              تم ارسال طلب تعديل المعلومات سيتم مراجعة البيانات خلال 48 ساعة والتأكد من صحتها وتعديلها.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => sendContactTeacherMessage(profile, 'update')}
                className="btn-primary bg-blue-600 hover:bg-blue-700 w-full py-3 rounded-md text-white"
              >
                <FaComment className="inline-block me-2" /> تواصل مع المعلم لتسريع معالجة طلبك
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="btn-primary bg-red-600 hover:bg-red-700 w-full py-3 rounded-md text-white"
              >
                <FaClock className="inline-block me-2" /> انتظار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review result modal */}
      {showReviewResultModal && reviewExpiry && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReviewResultModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-purple-300 mb-2 text-center">
              {reviewResult === 'approved' ? (
                <><FaCheckCircle className="inline-block me-2" /> تمت الموافقة على التغييرات</>
              ) : (
                <><FaTimesCircle className="inline-block me-2" /> تم رفض التغييرات</>
              )}
            </h3>
            <p className="text-gray-300 text-center mb-4">
              {reviewResult === 'approved'
                ? 'تم تحديث بياناتك بنجاح. يمكنك تعديل بياناتك مرة أخرى بعد انتهاء المدة المحددة.'
                : 'تم رفض طلب تعديل البيانات. يمكنك تقديم طلب جديد بعد انتهاء المدة المحددة.'
              }
            </p>
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">الوقت المتبقي لفتح التعديل:</p>
              <div className="flex justify-center gap-4 text-2xl font-bold text-white">
                <div>
                  <span className="text-purple-300">{String(timeRemaining.hours).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">ساعات</span>
                </div>
                <span className="text-gray-500">:</span>
                <div>
                  <span className="text-purple-300">{String(timeRemaining.minutes).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">دقائق</span>
                </div>
                <span className="text-gray-500">:</span>
                <div>
                  <span className="text-purple-300">{String(timeRemaining.seconds).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">ثواني</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowReviewResultModal(false)}
              className="mt-4 btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Notifications modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNotificationsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300">
                <FaBell className="inline-block me-2" /> الإشعارات
              </h3>
              <button onClick={() => setShowNotificationsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {announcements.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 border-b border-gray-700 pb-1">📢 إشعارات عامة</p>
                  {announcements.map(item => (
                    <div key={item.id} className="p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5">
                      <div className="flex justify-between items-start">
                        <h4 className="text-white font-medium">{item.title}</h4>
                        <span className="text-xs text-gray-400">
                          {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mt-1">{item.body}</p>
                    </div>
                  ))}
                </>
              )}
              {notifications.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 border-b border-gray-700 pb-1 mt-2">🔔 إشعارات خاصة</p>
                  {notifications.map((n) => (
                    <div key={n.id} className={`p-3 rounded-xl border ${n.read ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-800/60 border-blue-500/40'}`}>
                      <div className="flex justify-between items-start">
                        <h4 className="text-white font-medium">{n.title}</h4>
                        <span className="text-xs text-gray-400">
                          {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                      {!n.read && (
                        <button
                          onClick={async () => {
                            await updateDoc(doc(db, 'notifications', user.id, 'userNotifications', n.id), {
                              read: true,
                              readAt: serverTimestamp()
                            });
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300 mt-2 block"
                        >
                          وضع علامة مقروء
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
              {announcements.length === 0 && notifications.length === 0 && (
                <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
              )}
            </div>
            {notifications.some(n => !n.read) && (
              <button
                onClick={async () => {
                  const batch = writeBatch(db);
                  notifications.filter(n => !n.read).forEach(n => {
                    const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
                    batch.update(ref, { read: true, readAt: serverTimestamp() });
                  });
                  await batch.commit();
                }}
                className="mt-4 text-sm text-purple-400 hover:text-purple-300"
              >
                تعيين الكل كمقروء
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPanel;