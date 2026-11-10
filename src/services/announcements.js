import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDoc
} from 'firebase/firestore';
import { sanitizeInput } from '../utils/helpers';

/**
 * ✅ إنشاء إعلان — لكن بانتظار موافقة المدير
 * (لا يُنشر تلقائياً، يُحفظ بحالة pending_approval)
 * هذي الدالة تُستدعى من المشرف/المدير عند إنشاء إعلان جديد
 */
export const createGeneralAnnouncement = async (title, body, scheduledFor = null, requestedBy = '', requestedByName = '') => {
  try {
    const announcement = {
      title: sanitizeInput(title),
      body: sanitizeInput(body),
      createdAt: serverTimestamp(),
      scheduledFor: scheduledFor || null,
      status: 'pending_approval', // ✅ بانتظار موافقة المدير
      requestedBy,
      requestedByName,
      approvedAt: null,
      approvedBy: null,
      approvedByName: null,
      updatedAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'announcements'), announcement);
    return docRef.id;
  } catch (err) {
    console.error('Error creating announcement:', err);
    throw err;
  }
};

/**
 * ✅ اعتماد الإعلان — يستدعى فقط من المدير
 * يغيّر الحالة إلى active أو scheduled
 */
export const approveAnnouncement = async (id, approvedBy, approvedByName) => {
  const ref = doc(db, 'announcements', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الإعلان غير موجود');
  const data = snap.data();
  const newStatus = data.scheduledFor ? 'scheduled' : 'active';
  await updateDoc(ref, {
    status: newStatus,
    approvedAt: serverTimestamp(),
    approvedBy,
    approvedByName,
    updatedAt: serverTimestamp()
  });
};

/**
 * ✅ رفض الإعلان
 */
export const rejectAnnouncement = async (id, reason = '') => {
  await updateDoc(doc(db, 'announcements', id), {
    status: 'rejected',
    rejectionReason: reason,
    updatedAt: serverTimestamp()
  });
};

export const updateAnnouncement = async (id, data) => {
  try {
    await updateDoc(doc(db, 'announcements', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Error updating announcement:', err);
    throw err;
  }
};

export const deleteAnnouncement = async (id) => {
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (err) {
    console.error('Error deleting announcement:', err);
    throw err;
  }
};