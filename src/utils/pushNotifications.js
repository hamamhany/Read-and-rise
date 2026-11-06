import { messaging, db } from '../firebase';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import toast from 'react-hot-toast';

export const requestNotificationPermission = async (userId) => {
  try {
    if (!messaging) {
      toast.error('الإشعارات غير مدعومة في هذا المتصفح');
      return false;
    }
    if (!('Notification' in window)) {
      toast.error('متصفحك لا يدعم الإشعارات');
      return false;
    }

    // تسجيل Service Worker صراحةً
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      } catch (swErr) {
        console.error('SW registration failed:', swErr);
      }
    }

    let permission = Notification.permission;
    if (permission === 'denied') {
      toast.error('تم رفض الإذن، يرجى تفعيله من إعدادات المتصفح');
      return false;
    }
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      toast.error('لم يتم منح إذن الإشعارات');
      return false;
    }

    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) {
      toast.error('مفتاح VAPID غير مضبوط في متغيرات البيئة');
      return false;
    }

    const token = await getToken(messaging, { vapidKey });
    if (!token) {
      toast.error('فشل الحصول على توكن الإشعارات');
      return false;
    }

    const profileRef = doc(db, 'profiles', userId);
    const profileSnap = await getDoc(profileRef);
    const existingTokens = profileSnap.data()?.fcmTokens || [];

    if (existingTokens.includes(token)) {
      // ✅ تمت إزالة رسالة النجاح هنا
      return true;
    }

    await updateDoc(profileRef, { fcmTokens: arrayUnion(token) });
    // ✅ تمت إزالة رسالة النجاح هنا
    return true;
  } catch (err) {
    console.error('Notification permission error:', err);
    toast.error('فشل تفعيل الإشعارات: ' + (err.message || 'خطأ غير معروف'));
    return false;
  }
};

export const setupOnMessageListener = (callback) => {
  if (!messaging) return () => {};
  try {
    return onMessage(messaging, callback);
  } catch (err) {
    console.warn('onMessage setup failed:', err);
    return () => {};
  }
};