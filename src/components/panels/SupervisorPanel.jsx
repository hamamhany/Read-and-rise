import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaBell, FaSignOutAlt, FaBullhorn, FaPlus, FaEdit, FaTrashAlt, 
  FaSpinner, FaUpload, FaClock, FaUsers
} from 'react-icons/fa';
import { db, secondaryAuth, messaging } from '../../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, 
  serverTimestamp, writeBatch, getDocs, where, setDoc, arrayUnion,
  runTransaction
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getToken, onMessage } from 'firebase/messaging';
import { createGeneralAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../services/announcements';
import { sendNotificationToAllStudents, sendNotificationToTeacher } from '../../utils/notifications';
import { createMessageRequest } from '../../services/messageRequests';
import { ANNOUNCEMENTS_LIMIT, MESSAGE_REQUEST_TYPES } from '../../constants';
import { sanitizeInput, arabicToEnglishNumber, generateId, fetchClassNames } from '../../utils/helpers';
import ReportsReviewSection from './ReportsReviewSection';
import ReviewVotingSection from './ReviewVotingSection';

const SupervisorPanel = ({ user, onLogout }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(ANNOUNCEMENTS_LIMIT);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [publishType, setPublishType] = useState('now');
  const [delayHours, setDelayHours] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [delayError, setDelayError] = useState('');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);

  const [classes, setClasses] = useState([]);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGender, setNewStudentGender] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentClassIds, setNewStudentClassIds] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);

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
      } catch (e) { console.warn('FCM token fetch failed:', e.message); return true; }
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
      const unsubscribe = onMessage(messaging, (payload) => {
        toast.custom(() => (
          <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
            <strong className="block text-lg">{payload.notification?.title}</strong>
            <p className="text-sm text-gray-200">{payload.notification?.body}</p>
          </div>
        ), { duration: 5000 });
      });
      return () => unsubscribe();
    } catch (err) { console.warn('onMessage setup failed:', err); }
  }, []);

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
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const qClasses = query(collection(db, 'classes'));
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubClasses();
  }, []);

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
  }, [user]);

  const handleCreateAnnouncement = async () => {
    const title = sanitizeInput(announcementTitle);
    const body = sanitizeInput(announcementBody);
    if (!title || !body) { toast.error('يرجى إدخال العنوان والمحتوى.'); return; }
    if (body.length > 10000) { toast.error('نص الإشعار طويل جداً (الحد الأقصى 10000 حرف).'); return; }

    let scheduledFor = null;
    if (publishType === 'schedule') {
      const hoursNum = parseInt(arabicToEnglishNumber(delayHours));
      const minutesNum = parseInt(arabicToEnglishNumber(delayMinutes));
      if (isNaN(hoursNum) || hoursNum < 0 || isNaN(minutesNum) || minutesNum < 0 || minutesNum > 59) {
        setDelayError('يرجى إدخال عدد ساعات صحيح (0-24) ودقائق بين 0 و 59');
        return;
      }
      if (hoursNum === 0 && minutesNum === 0) { setDelayError('يرجى إدخال وقت أكبر من صفر'); return; }
      if (hoursNum > 24) { setDelayError('الحد الأقصى للتأخير هو 24 ساعة.'); return; }
      setDelayError('');
      const now = new Date();
      scheduledFor = new Date(now.getTime() + hoursNum * 3600000 + minutesNum * 60000);
    }

    try {
      if (editingAnnouncementId) {
        const updates = { title, body, scheduledFor: scheduledFor || null, status: scheduledFor ? 'scheduled' : 'active', updatedAt: serverTimestamp() };
        await updateAnnouncement(editingAnnouncementId, updates);
        toast.success('تم تحديث الإشعار بنجاح.');
      } else {
        const id = await createGeneralAnnouncement(title, body, scheduledFor);
        if (!scheduledFor) {
          await sendNotificationToAllStudents(title, body, 'general_announcement', id);
          await sendNotificationToTeacher(user.id, title, body, 'general_announcement', id);
          const supervisorQuery = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
          const supervisorSnap = await getDocs(supervisorQuery);
          for (const docSnap of supervisorSnap.docs) {
            const supervisorId = docSnap.id;
            if (supervisorId === user.id) continue;
            await setDoc(doc(collection(db, 'notifications', supervisorId, 'userNotifications')), {
              title, body, type: 'general_announcement', relatedId: id,
              createdAt: serverTimestamp(), read: false, readAt: null
            });
          }
        }
        toast.success('تم نشر الإشعار بنجاح.');
      }
      setAnnouncementTitle(''); setAnnouncementBody(''); setCharCount(0);
      setPublishType('now'); setDelayHours(''); setDelayMinutes('');
      setDelayError(''); setEditingAnnouncementId(null); setShowAnnouncementModal(false);
    } catch (err) { toast.error('فشل حفظ الإشعار: ' + err.message); }
  };

  const handleEditAnnouncement = (item) => {
    setEditingAnnouncementId(item.id);
    setAnnouncementTitle(item.title);
    setAnnouncementBody(item.body);
    setCharCount(item.body.length);
    if (item.status === 'scheduled' && item.scheduledFor) {
      setPublishType('schedule');
      const scheduled = new Date(item.scheduledFor.seconds * 1000);
      const diff = (scheduled - new Date()) / 60000;
      setDelayHours(Math.floor(diff / 60).toString());
      setDelayMinutes(Math.floor(diff % 60).toString());
    } else {
      setPublishType('now'); setDelayHours(''); setDelayMinutes('');
    }
    setShowAnnouncementModal(true);
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإشعار نهائياً؟')) return;
    try { await deleteAnnouncement(id); toast.success('تم حذف الإشعار.'); }
    catch (err) { toast.error('فشل حذف الإشعار: ' + err.message); }
  };

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => { setDisplayCount(prev => prev + ANNOUNCEMENTS_LIMIT); setIsLoadingMore(false); }, 800);
  };

  const handleAnnouncementClick = (item) => { setSelectedAnnouncement(item); setShowDetailsModal(true); };

  const handleOpenNotifications = () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      requestNotificationPermission().catch(err => console.warn('Notification request failed:', err));
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

  const generateNextUsernameNumber = async () => {
    const counterRef = doc(db, 'settings', 'userCounter');
    try {
      let nextNumber = 1;
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        if (!counterSnap.exists()) {
          transaction.set(counterRef, { lastStudentNumber: 1 });
          nextNumber = 1;
        } else {
          const current = counterSnap.data().lastStudentNumber || 0;
          nextNumber = current + 1;
          transaction.update(counterRef, { lastStudentNumber: nextNumber });
        }
      });
      return nextNumber;
    } catch (error) {
      console.error("Counter transaction failed: ", error);
      throw new Error('فشل في توليد رقم مستخدم جديد، يرجى المحاولة مرة أخرى');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (newStudentClassIds.length === 0) return toast.error('يرجى اختيار شعبة واحدة على الأقل.');
    
    const sanitizedName = sanitizeInput(newStudentName);
    const sanitizedGender = sanitizeInput(newStudentGender);
    const sanitizedAge = sanitizeInput(arabicToEnglishNumber(newStudentAge));
    const sanitizedPhone = sanitizeInput(arabicToEnglishNumber(newStudentPhone));
    
    if (!sanitizedName || !sanitizedGender || !sanitizedAge || !sanitizedPhone) {
      return toast.error('جميع الحقول مطلوبة.');
    }

    const phoneDigits = sanitizedPhone.replace(/[^\d]/g, '');
    const normalizedPhone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;
    if (normalizedPhone.startsWith('0')) {
      return toast.error('يرجى إدخال رقم الهاتف مع رمز الدولة بدون صفر بادئ.\nمثال: 9627XXXXXXXX', { duration: 7000 });
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return toast.error('رقم الهاتف غير صالح. يرجى إدخال الرقم مع رمز الدولة (10 إلى 15 رقماً).', { duration: 7000 });
    }

    setStudentLoading(true);
    try {
      const startNumber = await generateNextUsernameNumber();
      let currentNum = startNumber;
      let newUsername = `knight${currentNum}`;
      let tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      let email = `${newUsername}@readandrise.com`;
      let userCredential = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
          break;
        } catch (error) {
          if (error.code === 'auth/email-already-in-use') {
            currentNum++;
            newUsername = `knight${currentNum}`;
            email = `${newUsername}@readandrise.com`;
            attempts++;
          } else {
            throw error;
          }
        }
      }

      if (!userCredential) throw new Error('تعذر إيجاد اسم مستخدم فريد. يرجى المحاولة مرة أخرى.');

      const firebaseUser = userCredential.user;
      await signOut(secondaryAuth);
      const newId = generateId();
      const ageNum = parseInt(sanitizedAge);

      await setDoc(doc(db, 'profiles', newId), {
        email, username: newUsername, name: sanitizedName, gender: sanitizedGender,
        age: ageNum, phone: normalizedPhone, classIds: newStudentClassIds, role: 'student',
        isFrozen: false, infoVerified: false, isProfileComplete: false,
        pendingChanges: null, reviewResult: null, reviewExpiry: null,
        warnings: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        uid: firebaseUser.uid
      });

      const classMap = await fetchClassNames(newStudentClassIds);
      const classNames = newStudentClassIds.map(id => classMap[id] || null).filter(Boolean);
      
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.ACTIVATION,
        targetType: 'student',
        targetId: newId,
        targetName: sanitizedName,
        targetPhone: normalizedPhone,
        targetClass: classNames.join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: { username: newUsername, password: tempPassword, age: ageNum, gender: sanitizedGender }
      });

      toast.success(`✅ تم إنشاء حساب الطالب بنجاح باسم المستخدم: ${newUsername}`);
      setNewStudentName(''); setNewStudentGender(''); setNewStudentAge('');
      setNewStudentPhone(''); setNewStudentClassIds([]); setShowAddStudentModal(false);
    } catch (err) {
      toast.error('فشل إضافة الطالب: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setStudentLoading(false);
    }
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  const visibleAnnouncements = announcements.slice(0, displayCount);
  const hasMore = displayCount < announcements.length;
  const canPublish = user.canPublishAnnouncements !== false;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-green-300">لوحة المشرف</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username || user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNotifications} className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg" title="الإشعارات">
              <FaBell />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-semibold text-blue-200 flex items-center gap-2">
              <FaUsers /> إدارة الطلاب
            </h3>
            <p className="text-sm text-gray-400 mt-1">يمكنك إضافة حسابات الطلاب الجدد من هنا.</p>
          </div>
          <button 
            onClick={() => setShowAddStudentModal(true)} 
            className="btn-primary bg-blue-600 hover:bg-blue-700 py-2 px-6 rounded-md text-white font-bold"
          >
            <FaPlus className="inline-block me-2" /> إضافة طالب جديد
          </button>
        </div>

        <ReportsReviewSection user={user} />
        <ReviewVotingSection user={user} />

        {canPublish && (
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
              <h3 className="text-xl font-semibold text-blue-200">
                <FaBullhorn className="inline-block me-2" /> الإشعارات العامة
              </h3>
              <button
                onClick={() => {
                  setEditingAnnouncementId(null); setAnnouncementTitle(''); setAnnouncementBody('');
                  setCharCount(0); setPublishType('now'); setDelayHours(''); setDelayMinutes('');
                  setDelayError(''); setShowAnnouncementModal(true);
                }}
                className="btn-primary bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm"
              >
                <FaPlus className="inline-block me-2" /> إشعار جديد
              </button>
            </div>
            {announcements.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات حالياً.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {visibleAnnouncements.map((item) => (
                  <div key={item.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 cursor-pointer hover:bg-gray-700/40 transition flex justify-between items-start" onClick={() => handleAnnouncementClick(item)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{item.title}</span>
                        {item.status === 'scheduled' && <span className="text-xs text-yellow-400 bg-yellow-950/40 px-2 py-0.5 rounded-full">📅 مجدول</span>}
                        {item.status === 'active' && <span className="text-xs text-green-400 bg-green-950/40 px-2 py-0.5 rounded-full">✅ منشور</span>}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 mr-2">
                      <button onClick={(e) => { e.stopPropagation(); handleEditAnnouncement(item); }} className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1"><FaEdit /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAnnouncement(item.id); }} className="text-red-400 hover:text-red-300 text-sm px-2 py-1"><FaTrashAlt /></button>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={handleLoadMore} disabled={isLoadingMore} className="w-full py-2 text-blue-400 hover:text-blue-300 transition flex items-center justify-center gap-2">
                    {isLoadingMore ? <><FaSpinner className="animate-spin" /> جاري التحميل...</> : 'تحميل المزيد'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4"><FaPlus className="inline-block me-2" /> إضافة طالب جديد</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <input type="text" placeholder="الاسم الكامل *" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required />
              <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentGender} onChange={e => setNewStudentGender(e.target.value)} required>
                <option value="">الجنس *</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
              <input type="text" inputMode="numeric" placeholder="العمر *" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentAge} onChange={e => setNewStudentAge(arabicToEnglishNumber(e.target.value))} required />
              <input type="text" inputMode="numeric" placeholder="رقم الهاتف * (مع رمز الدولة بدون +)" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentPhone} onChange={e => setNewStudentPhone(arabicToEnglishNumber(e.target.value))} required />
              <div>
                <label className="text-xs text-gray-400 mb-1 block">الشعب الدراسية * (اضغط Ctrl لاختيار عدة شعب)</label>
                <select multiple className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentClassIds} onChange={(e) => setNewStudentClassIds(Array.from(e.target.selectedOptions).map(o => o.value))} required>
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={studentLoading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-md text-white">
                {studentLoading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showDetailsModal && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-purple-300">{selectedAnnouncement.title}</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="text-gray-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">{selectedAnnouncement.body}</div>
          </div>
        </div>
      )}

      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAnnouncementModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4"><FaBullhorn className="inline-block me-2" /> {editingAnnouncementId ? 'تعديل الإشعار' : 'إشعار جديد'}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">العنوان <span className="text-red-400">*</span></label>
                <input type="text" className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">المحتوى <span className="text-red-400">*</span></label>
                <textarea className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white resize-none h-40" value={announcementBody} onChange={(e) => { if (e.target.value.length <= 10000) { setAnnouncementBody(e.target.value); setCharCount(e.target.value.length); } else { toast.error('الحد الأقصى 10000 حرف'); } }} required />
                <div className="text-xs text-gray-400 mt-1 text-left">{charCount} / 10000 حرف</div>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-gray-300">
                  <input type="radio" value="now" checked={publishType === 'now'} onChange={() => setPublishType('now')} className="accent-yellow-500" />
                  <FaUpload className="inline-block me-1" /> نشر فوراً
                </label>
                <label className="flex items-center gap-2 text-gray-300">
                  <input type="radio" value="schedule" checked={publishType === 'schedule'} onChange={() => setPublishType('schedule')} className="accent-yellow-500" />
                  <FaClock className="inline-block me-1" /> نشر بعد وقت
                </label>
              </div>
              {publishType === 'schedule' && (
                <div className="flex flex-wrap gap-4 items-center">
                  <div><label className="block text-sm text-gray-300">ساعات</label><input type="text" inputMode="numeric" className="w-20 bg-gray-800 text-center p-2 border border-gray-600 rounded-md text-white" value={delayHours} onChange={(e) => setDelayHours(arabicToEnglishNumber(e.target.value))} placeholder="0" /></div>
                  <div><label className="block text-sm text-gray-300">دقائق</label><input type="text" inputMode="numeric" className="w-20 bg-gray-800 text-center p-2 border border-gray-600 rounded-md text-white" value={delayMinutes} onChange={(e) => setDelayMinutes(arabicToEnglishNumber(e.target.value))} placeholder="0" /></div>
                  {delayError && <p className="text-red-400 text-xs">{delayError}</p>}
                  <p className="text-xs text-gray-400">(الحد الأقصى 24 ساعة)</p>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={handleCreateAnnouncement} className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white">{editingAnnouncementId ? 'تحديث' : 'نشر'}</button>
                <button onClick={() => { setShowAnnouncementModal(false); setEditingAnnouncementId(null); setAnnouncementTitle(''); setAnnouncementBody(''); setCharCount(0); setPublishType('now'); setDelayHours(''); setDelayMinutes(''); setDelayError(''); }} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
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
            <p className="text-xs text-gray-500 mb-3">📌 ستُحذف هذه الإشعارات تلقائياً عند إغلاق النافذة.</p>
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl border bg-gray-800/60 border-blue-500/40">
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-gray-400">{n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}</span>
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

export default SupervisorPanel;