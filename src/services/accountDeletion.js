import { auth } from './firebaseAuth';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const API_URL = import.meta.env.VITE_API_URL || '';

export const deleteUserCompletely = async (userId, options = {}) => {
  const { blacklistReason, onProgress } = options;

  onProgress?.('جاري التحقق من البيانات...');
  const profileRef = doc(db, 'profiles', userId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) throw new Error('الملف الشخصي غير موجود');

  const profile = profileSnap.data();
  const uid = profile.uid;
  const phone = profile.phone;

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('يجب تسجيل الدخول أولاً');
  const idToken = await currentUser.getIdToken();

  onProgress?.('جاري حذف الحساب والبيانات نهائياً...');

  const response = await fetch(`${API_URL}/api/delete-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      userId,
      targetUid: uid,
      targetPhone: phone,
      blacklistReason: blacklistReason || null
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'فشل حذف الحساب');
  }

  onProgress?.('تم الحذف بنجاح ✓');
  return true;
};