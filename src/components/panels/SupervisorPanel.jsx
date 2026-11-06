import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaBell, FaSignOutAlt, FaBullhorn, FaPlus, FaEdit, FaTrashAlt, 
  FaSpinner, FaUpload, FaClock, FaEye 
} from 'react-icons/fa';
import { db, messaging } from '../../firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp, writeBatch, deleteDoc, getDocs, where, setDoc, arrayUnion } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { createGeneralAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../services/announcements';
import { sendNotificationToAllStudents, sendNotificationToTeacher } from '../../utils/notifications';
import { auth } from '../../services/firebaseAuth';
import { ANNOUNCEMENTS_LIMIT } from '../../constants';
import { sanitizeInput, arabicToEnglishNumber } from '../../utils/helpers';

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

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) {
        console.warn('Notification API not supported');
        return false;
      }

      if ('serviceWorker' in navigator) {
        try {
          await Promise.race([
            navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 5000))
          ]);
        } catch (e) { console.warn('SW register skipped:', e.message); }
      }

      let permission = Notification.permission;
      if (permission === 'denied') {
        toast.error('الإشعارات محظورة من إعدادات المتصفح');
        return false;
      }
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') {
        return false;
      }

      if (!messaging) return true;
      const vapidKey = import.meta.env.VITE_VAPID_KEY;
      if (!vapidKey) {
        console.warn('VAPID key missing');
        return true;
      }

      let token = null;
      try {
        token = await Promise.race([
          getToken(messaging, { vapidKey }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('getToken timeout')), 10000))
        ]);
      } catch (e) {
        console.warn('FCM token fetch failed:', e.message);
        return true;
      }

      if (token) {
        try {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
        } catch (e) { console.warn('Save token failed:', e.message); }
      }
      return true;
    } catch (err) {
      console.error('Notification error:', err);
      return false;
    }
  };

  useEffect(() => {
    if (!messaging) return;
    try {
      const unsubscribe = onMessage(messaging, (payload) => {
        toast.custom((t) => (
          <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
            <strong className="block text-lg">{payload.notification?.title}</strong>
            <p className="text-sm text-gray-200">{payload.notification?.body}</p>
          </div>
        ), { duration: 5000 });
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn('onMessage setup failed:', err);
    }
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
    if (!title || !body) {
      toast.error('يرجى إدخال العنوان والمحتوى.');
      return;
    }
    if (body.length > 10000) {
      toast.error('نص الإشعار طويل جداً (الحد الأقصى 10000 حرف).');
      return;
    }

    let scheduledFor = null;
    if (publishType === 'schedule') {
      const hoursNum = parseInt(arabicToEnglishNumber(delayHours));
      const minutesNum = parseInt(arabicToEnglishNumber(delayMinutes));
      if (isNaN(hoursNum) || hoursNum < 0 || isNaN(minutesNum) || minutesNum < 0 || minutesNum > 59) {
        setDelayError('يرجى إدخال عدد ساعات صحيح (0-24) ودقائق بين 0 و 59');
        return;
      }
      if (hoursNum === 0 && minutesNum === 0) {
        setDelayError('يرجى إدخال وقت أكبر من صفر');
        return;
      }
      if (hoursNum > 24) {
        setDelayError('الحد الأقصى للتأخير هو 24 ساعة.');
        return;
      }
      setDelayError('');
      const now = new Date();
      const scheduledDate = new Date(now.getTime() + hoursNum * 3600000 + minutesNum * 60000);
      scheduledFor = scheduledDate;
    }

    try {
      if (editingAnnouncementId) {
        const updates = {
          title,
          body,
          scheduledFor: scheduledFor || null,
          status: scheduledFor ? 'scheduled' : 'active',
          updatedAt: serverTimestamp()
        };
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
            const notification = {
              title,
              body,
              type: 'general_announcement',
              relatedId: id,
              createdAt: serverTimestamp(),
              read: false,
              readAt: null
            };
            await setDoc(doc(collection(db, 'notifications', supervisorId, 'userNotifications')), notification);
          }
        }
        toast.success('تم نشر الإشعار بنجاح.');
      }
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setCharCount(0);
      setPublishType('now');
      setDelayHours('');
      setDelayMinutes('');
      setDelayError('');
      setEditingAnnouncementId(null);
      setShowAnnouncementModal(false);
    } catch (err) {
      toast.error('فشل حفظ الإشعار: ' + err.message);
    }
  };

  const handleEditAnnouncement = (item) => {
    setEditingAnnouncementId(item.id);
    setAnnouncementTitle(item.title);
    setAnnouncementBody(item.body);
    setCharCount(item.body.length);
    if (item.status === 'scheduled' && item.scheduledFor) {
      setPublishType('schedule');
      const scheduled = new Date(item.scheduledFor.seconds * 1000);
      const now = new Date();
      const diff = (scheduled - now) / 60000;
      const hours = Math.floor(diff / 60);
      const minutes = Math.floor(diff % 60);
      setDelayHours(hours.toString());
      setDelayMinutes(minutes.toString());
    } else {
      setPublishType('now');
      setDelayHours('');
      setDelayMinutes('');
    }
    setShowAnnouncementModal(true);
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الإشعار نهائياً؟')) return;
    try {
      await deleteAnnouncement(id);
      toast.success('تم حذف الإشعار.');
    } catch (err) {
      toast.error('فشل حذف الإشعار: ' + err.message);
    }
  };

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayCount(prev => prev + ANNOUNCEMENTS_LIMIT);
      setIsLoadingMore(false);
    }, 800);
  };

  const handleAnnouncementClick = (item) => {
    setSelectedAnnouncement(item);
    setShowDetailsModal(true);
  };

  // ✅ فتح الإشعارات: نحفظ IDs الحالية ثم نطلب الإذن
  const handleOpenNotifications = () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      requestNotificationPermission().catch(err =>
        console.warn('Notification request failed:', err)
      );
    }
  };

  // ✅ إغلاق الإشعارات: نحذف كل الإشعارات المعروضة من Firestore
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
    } catch (err) {
      console.warn('فشل حذف الإشعارات:', err);
    }
    setNotificationIdsAtOpen([]);
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  const visibleAnnouncements = announcements.slice(0, displayCount);
  const hasMore = displayCount < announcements.length;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-green-300">لوحة المشرف</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username || user.email}</p>
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

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="text-xl font-semibold text-blue-200">
              <FaBullhorn className="inline-block me-2" /> الإشعارات العامة
            </h3>
            <button
              onClick={() => {
                setEditingAnnouncementId(null);
                setAnnouncementTitle('');
                setAnnouncementBody('');
                setCharCount(0);
                setPublishType('now');
                setDelayHours('');
                setDelayMinutes('');
                setDelayError('');
                setShowAnnouncementModal(true);
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
                <div
                  key={item.id}
                  className="p-4 bg-black/30 rounded-xl border border-gray-700 cursor-pointer hover:bg-gray-700/40 transition flex justify-between items-start"
                  onClick={() => handleAnnouncementClick(item)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{item.title}</span>
                      {item.status === 'scheduled' && (
                        <span className="text-xs text-yellow-400 bg-yellow-950/40 px-2 py-0.5 rounded-full">📅 مجدول</span>
                      )}
                      {item.status === 'active' && (
                        <span className="text-xs text-green-400 bg-green-950/40 px-2 py-0.5 rounded-full">✅ منشور</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                    </div>
                  </div>
                  <div className="flex gap-1 mr-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditAnnouncement(item); }}
                      className="text-blue-400 hover:text-blue-300 text-sm px-2 py-1"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAnnouncement(item.id); }}
                      className="text-red-400 hover:text-red-300 text-sm px-2 py-1"
                    >
                      <FaTrashAlt />
                    </button>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="w-full py-2 text-blue-400 hover:text-blue-300 transition flex items-center justify-center gap-2"
                >
                  {isLoadingMore ? (
                    <><FaSpinner className="animate-spin" /> جاري التحميل...</>
                  ) : (
                    'تحميل المزيد'
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showDetailsModal && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-purple-300">{selectedAnnouncement.title}</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="text-gray-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
              {selectedAnnouncement.body}
            </div>
            <div className="mt-4 text-xs text-gray-400">
              {selectedAnnouncement.createdAt?.toDate?.() ? new Date(selectedAnnouncement.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
              {selectedAnnouncement.status === 'scheduled' && (
                <span className="mr-2 text-yellow-400">(مجدول حتى {selectedAnnouncement.scheduledFor?.toDate?.() ? new Date(selectedAnnouncement.scheduledFor.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''})</span>
              )}
            </div>
          </div>
        </div>
      )}

      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAnnouncementModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">
              <FaBullhorn className="inline-block me-2" /> {editingAnnouncementId ? 'تعديل الإشعار' : 'إشعار جديد'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">العنوان <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">المحتوى <span className="text-red-400">*</span></label>
                <textarea
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white resize-none h-40"
                  value={announcementBody}
                  onChange={(e) => {
                    const text = e.target.value;
                    if (text.length <= 10000) {
                      setAnnouncementBody(text);
                      setCharCount(text.length);
                    } else {
                      toast.error('الحد الأقصى 10000 حرف');
                    }
                  }}
                  required
                />
                <div className="text-xs text-gray-400 mt-1 text-left">
                  {charCount} / 10000 حرف
                </div>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="radio"
                    value="now"
                    checked={publishType === 'now'}
                    onChange={() => setPublishType('now')}
                    className="accent-yellow-500"
                  />
                  <FaUpload className="inline-block me-1" /> نشر فوراً
                </label>
                <label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="radio"
                    value="schedule"
                    checked={publishType === 'schedule'}
                    onChange={() => setPublishType('schedule')}
                    className="accent-yellow-500"
                  />
                  <FaClock className="inline-block me-1" /> نشر بعد وقت
                </label>
              </div>
              {publishType === 'schedule' && (
                <div className="flex flex-wrap gap-4 items-center">
                  <div>
                    <label className="block text-sm text-gray-300">ساعات</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-20 bg-gray-800 text-center p-2 border border-gray-600 rounded-md text-white"
                      value={delayHours}
                      onChange={(e) => setDelayHours(arabicToEnglishNumber(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300">دقائق</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-20 bg-gray-800 text-center p-2 border border-gray-600 rounded-md text-white"
                      value={delayMinutes}
                      onChange={(e) => setDelayMinutes(arabicToEnglishNumber(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  {delayError && <p className="text-red-400 text-xs">{delayError}</p>}
                  <p className="text-xs text-gray-400">(الحد الأقصى 24 ساعة)</p>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleCreateAnnouncement}
                  className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white"
                >
                  {editingAnnouncementId ? 'تحديث' : 'نشر'}
                </button>
                <button
                  onClick={() => {
                    setShowAnnouncementModal(false);
                    setEditingAnnouncementId(null);
                    setAnnouncementTitle('');
                    setAnnouncementBody('');
                    setCharCount(0);
                    setPublishType('now');
                    setDelayHours('');
                    setDelayMinutes('');
                    setDelayError('');
                  }}
                  className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300">
                <FaBell className="inline-block me-2" /> الإشعارات
              </h3>
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
                      <span className="text-xs text-gray-400">
                        {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                      </span>
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