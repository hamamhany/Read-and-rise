import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDocs, query, where
} from 'firebase/firestore';
import {
  MESSAGE_REQUESTS_COLLECTION,
  MESSAGE_REQUEST_STATUS,
  MESSAGE_REQUEST_RETENTION_MS
} from '../constants';

/**
 * إنشاء طلب رسالة جديد (يُحفظ بحالة pending)
 * ⚠️ لا يُرسل أي إشعار لمدير النظام — الطلب يظهر مباشرة في لوحته
 */
export const createMessageRequest = async (data) => {
  try {
    const request = {
      ...data,
      status: MESSAGE_REQUEST_STATUS.PENDING,
      createdAt: serverTimestamp(),
      processedAt: null,
      processedBy: null,
      rejectionReason: null
    };
    const docRef = await addDoc(collection(db, MESSAGE_REQUESTS_COLLECTION), request);
    return docRef.id;
  } catch (err) {
    console.error('خطأ في إنشاء طلب الرسالة:', err);
    throw err;
  }
};

/**
 * تحديث حالة الطلب (approved / rejected)
 */
export const updateMessageRequestStatus = async (
  id,
  status,
  processedBy,
  rejectionReason = null
) => {
  try {
    await updateDoc(doc(db, MESSAGE_REQUESTS_COLLECTION, id), {
      status,
      processedBy,
      processedAt: serverTimestamp(),
      rejectionReason
    });
  } catch (err) {
    console.error('خطأ في تحديث حالة الطلب:', err);
    throw err;
  }
};

/**
 * حذف طلب واحد
 */
export const deleteMessageRequest = async (id) => {
  try {
    await deleteDoc(doc(db, MESSAGE_REQUESTS_COLLECTION, id));
  } catch (err) {
    console.error('خطأ في حذف الطلب:', err);
    throw err;
  }
};

/**
 * حذف الطلبات المعتمدة التي مضى عليها أكثر من 48 ساعة
 * (يتم استدعاؤها دورياً من لوحة مدير النظام)
 * @returns {Promise<number>} عدد الطلبات المحذوفة
 */
export const cleanupOldApprovedRequests = async () => {
  try {
    const q = query(
      collection(db, MESSAGE_REQUESTS_COLLECTION),
      where('status', '==', MESSAGE_REQUEST_STATUS.APPROVED)
    );
    const snapshot = await getDocs(q);
    const now = Date.now();
    let deletedCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      if (!data.processedAt) continue;

      const processedMs = data.processedAt.toDate
        ? data.processedAt.toDate().getTime()
        : (data.processedAt.seconds ? data.processedAt.seconds * 1000 : 0);

      if (!processedMs) continue;

      if (now - processedMs >= MESSAGE_REQUEST_RETENTION_MS) {
        try {
          await deleteDoc(doc(db, MESSAGE_REQUESTS_COLLECTION, docSnap.id));
          deletedCount++;
        } catch (delErr) {
          console.warn('فشل حذف طلب قديم:', docSnap.id, delErr);
        }
      }
    }

    return deletedCount;
  } catch (err) {
    console.error('خطأ في تنظيف الطلبات القديمة:', err);
    return 0;
  }
};