import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDocs, query, where, setDoc
} from 'firebase/firestore';
import {
  MESSAGE_REQUESTS_COLLECTION,
  MESSAGE_REQUEST_STATUS,
  MESSAGE_REQUEST_TYPE_LABELS
} from '../constants';

/**
 * إنشاء طلب رسالة جديد (يُحفظ بحالة pending)
 * ويُرسل إشعاراً لجميع مديري النظام
 */
export const createMessageRequest = async (data, requesterName = 'معلم') => {
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

    // إشعار جميع مديري النظام
    try {
      const smQuery = query(
        collection(db, 'profiles'),
        where('role', '==', 'system_manager')
      );
      const smSnap = await getDocs(smQuery);
      const typeLabel = MESSAGE_REQUEST_TYPE_LABELS[data.type] || 'رسالة';
      for (const smDoc of smSnap.docs) {
        await setDoc(
          doc(collection(db, 'notifications', smDoc.id, 'userNotifications')),
          {
            title: `📨 طلب ${typeLabel} جديد`,
            body: `${requesterName} طلب إرسال ${typeLabel} للطالب ${data.targetName || ''}`,
            type: 'message_request',
            relatedId: docRef.id,
            createdAt: serverTimestamp(),
            read: false,
            readAt: null
          }
        );
      }
    } catch (notifErr) {
      console.warn('فشل إشعار مديري النظام:', notifErr);
    }

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
 * حذف طلب
 */
export const deleteMessageRequest = async (id) => {
  try {
    await deleteDoc(doc(db, MESSAGE_REQUESTS_COLLECTION, id));
  } catch (err) {
    console.error('خطأ في حذف الطلب:', err);
    throw err;
  }
};