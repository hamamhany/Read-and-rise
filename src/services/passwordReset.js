import { db, auth } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, getDocs,
  query, where, serverTimestamp, getDoc, limit
} from 'firebase/firestore';
import { PASSWORD_RESET_REQUESTS_COLLECTION, PASSWORD_RESET_STATUS } from '../constants';

// المستخدم يُنشئ طلب الاستعادة (من صفحة Login)
export const createPasswordResetRequest = async (data) => {
  const ref = await addDoc(collection(db, PASSWORD_RESET_REQUESTS_COLLECTION), {
    ...data,
    status: PASSWORD_RESET_STATUS.PENDING,
    createdAt: serverTimestamp(),
    claimedBy: null,
    claimedAt: null,
    claimedByName: null,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    resolvedUserId: null,
    rejectionReason: null
  });
  return ref.id;
};

// البحث عن مستخدم بالرقم التسلسلي
export const findUserBySerial = async (serialNumber) => {
  const q = query(
    collection(db, 'profiles'),
    where('serialNumber', '==', serialNumber),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
};

// المشرف يعتمد الطلب — يستدعي API لتحديث Firebase Auth ثم ينشئ messageRequest
export const approvePasswordReset = async ({ requestId, resolvedUser, newUsername, newPassword, supervisorId, supervisorName }) => {
  if (!auth.currentUser) throw new Error('يجب تسجيل الدخول أولاً');
  const idToken = await auth.currentUser.getIdToken();

  // 1. نداء API لتحديث Firebase Auth
  const res = await fetch('/api/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      userId: resolvedUser.id,
      newUsername,
      newPassword
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'فشل تحديث بيانات الدخول');
  }

  // 2. تحديث حالة الطلب
  await updateDoc(doc(db, PASSWORD_RESET_REQUESTS_COLLECTION, requestId), {
    status: PASSWORD_RESET_STATUS.APPROVED,
    resolvedUserId: resolvedUser.id,
    reviewedBy: supervisorId,
    reviewedByName: supervisorName,
    reviewedAt: serverTimestamp()
  });

  return true;
};

// المشرف يرفض الطلب
export const rejectPasswordReset = async ({ requestId, reason, supervisorId, supervisorName }) => {
  await updateDoc(doc(db, PASSWORD_RESET_REQUESTS_COLLECTION, requestId), {
    status: PASSWORD_RESET_STATUS.REJECTED,
    rejectionReason: reason || '',
    reviewedBy: supervisorId,
    reviewedByName: supervisorName,
    reviewedAt: serverTimestamp()
  });
};

// المشرف يحجز طلباً من قائمة الانتظار
export const claimPasswordResetRequest = async (requestId, supervisorId, supervisorName) => {
  await updateDoc(doc(db, PASSWORD_RESET_REQUESTS_COLLECTION, requestId), {
    claimedBy: supervisorId,
    claimedByName: supervisorName,
    claimedAt: serverTimestamp()
  });
};