// src/services/support.js
import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, onSnapshot, serverTimestamp, limit,
  runTransaction, arrayUnion
} from 'firebase/firestore';
import {
  SUPPORT_TICKETS_COLLECTION,
  SUPPORT_TICKET_STATUS,
  SUPPORT_MAX_ACTIVE_OVERLOAD,
  SUPPORT_END_TIMEOUT_MS
} from '../constants';

// ✅ إنشاء تذكرة دعم جديدة
export const createSupportTicket = async (data) => {
  // التحقق من وجود تذكرة مفتوحة سابقة
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('studentId', '==', data.studentId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.OPEN,
      SUPPORT_TICKET_STATUS.IN_PROGRESS,
      SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
      SUPPORT_TICKET_STATUS.AWAITING_RATING
    ]),
    limit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error('لديك تذكرة دعم مفتوحة بالفعل. يرجى متابعتها أولاً.');
  }

  const initialMessage = data.initialMessage;
  delete data.initialMessage;

  const ticket = {
    ...data,
    status: SUPPORT_TICKET_STATUS.OPEN,
    requiresManager: data.studentRole === 'supervisor', // تذاكر المشرفين للمدير فقط
    assignedSupervisorId: null,
    assignedSupervisorName: null,
    assignedAt: null,
    messages: [{
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      senderId: data.studentId,
      senderName: data.studentName,
      senderRole: data.studentRole,
      text: initialMessage,
      createdAt: new Date().toISOString()
    }],
    endRequestedAt: null,
    endRequestExpiresAt: null,
    studentSatisfied: null,
    rating: null,
    ratingCategory: null,
    ratingReason: null,
    ratedAt: null,
    managerReviewedAt: null,
    managerDecision: null,
    managerReason: null,
    managerNotificationSent: false,
    supervisorNotificationSent: false,
    studentNotificationSent: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, SUPPORT_TICKETS_COLLECTION), ticket);
  return ref.id;
};

// ✅ جلب تذكرة واحدة للطالب
export const getStudentOpenTicket = async (studentId) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('studentId', '==', studentId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.OPEN,
      SUPPORT_TICKET_STATUS.IN_PROGRESS,
      SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
      SUPPORT_TICKET_STATUS.AWAITING_RATING,
      SUPPORT_TICKET_STATUS.RATED_LOW
    ]),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
};

// ✅ متابعة تذكرة واحدة (realtime)
export const subscribeToTicket = (ticketId, callback) => {
  return onSnapshot(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
};

// ✅ تذاكر المشرف (المخصصة له)
export const subscribeToSupervisorTickets = (supervisorId, callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('assignedSupervisorId', '==', supervisorId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.IN_PROGRESS,
      SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
      SUPPORT_TICKET_STATUS.AWAITING_RATING
    ]),
    orderBy('updatedAt', 'desc'),
    limit(30)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ✅ التذاكر غير المحجوزة (للمشرفين)
export const subscribeToUnassignedTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.OPEN),
    where('requiresManager', '==', false),
    orderBy('createdAt', 'asc'),
    limit(30)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ✅ التذاكر التي تحتاج قرار مدير (تقييم سلبي)
export const subscribeToManagerReviewTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.RATED_LOW),
    orderBy('ratedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ✅ التذاكر المفتوحة للمدير (تذاكر مشرفين)
export const subscribeToManagerOpenTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('requiresManager', '==', true),
    where('status', '==', SUPPORT_TICKET_STATUS.OPEN),
    orderBy('createdAt', 'asc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

// ✅ حجز تذكرة (Transaction آمن)
export const claimTicket = async (ticketId, supervisorId, supervisorName, managerMode = false) => {
  await runTransaction(db, async (transaction) => {
    const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
    const supRef = doc(db, 'profiles', supervisorId);

    const ticketSnap = await transaction.get(ticketRef);
    const supSnap = await transaction.get(supRef);

    if (!ticketSnap.exists()) throw new Error('التذكرة غير موجودة');
    const ticket = ticketSnap.data();
    if (ticket.assignedSupervisorId) throw new Error('التذكرة محجوزة لمشرف آخر');
    if (ticket.status !== SUPPORT_TICKET_STATUS.OPEN) throw new Error('التذكرة ليست متاحة');

    const supData = supSnap.data() || {};
    const currentActive = supData.activeTicketCount || 0;

    // المدير لا يوجد لديه حد أقصى
    if (!managerMode) {
      const cap = SUPPORT_MAX_ACTIVE_OVERLOAD;
      if (currentActive >= cap) {
        throw new Error(`لقد وصلت للحد الأقصى من التذاكر النشطة (${cap}). أنهِ بعضها أولاً.`);
      }
    }

    transaction.update(ticketRef, {
      assignedSupervisorId: supervisorId,
      assignedSupervisorName: supervisorName,
      assignedAt: serverTimestamp(),
      status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
      updatedAt: serverTimestamp()
    });

    if (!managerMode) {
      transaction.update(supRef, { activeTicketCount: currentActive + 1 });
    }
  });
};

// ✅ إرسال رسالة في التذكرة
export const sendTicketMessage = async (ticketId, sender, text) => {
  const message = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    text,
    createdAt: new Date().toISOString()
  };
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    messages: arrayUnion(message),
    updatedAt: serverTimestamp()
  });
};

// ✅ المشرف يطلب إنهاء المحادثة
export const requestTicketEnd = async (ticketId) => {
  const now = Date.now();
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
    endRequestedAt: serverTimestamp(),
    endRequestExpiresAt: new Date(now + SUPPORT_END_TIMEOUT_MS),
    updatedAt: serverTimestamp()
  });
};

// ✅ الطالب يؤكد الحل
export const studentConfirmSolved = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.AWAITING_RATING,
    studentSatisfied: true,
    updatedAt: serverTimestamp()
  });
};

// ✅ الطالب يؤكد عدم الحل
export const studentConfirmNotSolved = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
    studentSatisfied: false,
    endRequestedAt: null,
    endRequestExpiresAt: null,
    updatedAt: serverTimestamp()
  });
};

// ✅ تقديم التقييم
export const submitRating = async (ticketId, rating, ratingCategory, ratingReason) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  const isFull = rating === 5;
  const newStatus = isFull ? SUPPORT_TICKET_STATUS.RATED_FULL : SUPPORT_TICKET_STATUS.RATED_LOW;

  await updateDoc(ticketRef, {
    rating,
    ratingCategory: ratingCategory || null,
    ratingReason: ratingReason || null,
    ratedAt: serverTimestamp(),
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  // تحديث تقييم المشرف
  if (data.assignedSupervisorId) {
    const supRef = doc(db, 'profiles', data.assignedSupervisorId);
    const supSnap = await getDoc(supRef);
    if (supSnap.exists()) {
      const sup = supSnap.data();
      const count = sup.ratingCount || 0;
      const avg = sup.ratingAverage || 0;
      const newCount = count + 1;
      const newAvg = ((avg * count) + rating) / newCount;
      await updateDoc(supRef, {
        ratingCount: newCount,
        ratingAverage: Math.round(newAvg * 100) / 100
      });
    }
  }

  return newStatus;
};

// ✅ قرار المدير (اعتذار أو رفض)
export const managerDecide = async (ticketId, decision, managerReason) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  const newStatus = decision === 'apologize'
    ? SUPPORT_TICKET_STATUS.MANAGER_APOLOGIZED
    : SUPPORT_TICKET_STATUS.MANAGER_REJECTED;

  await updateDoc(ticketRef, {
    status: newStatus,
    managerReviewedAt: serverTimestamp(),
    managerDecision: decision,
    managerReason: managerReason || '',
    updatedAt: serverTimestamp()
  });

  // تحديث تقييم المشرف
  if (data.assignedSupervisorId) {
    const supRef = doc(db, 'profiles', data.assignedSupervisorId);
    const supSnap = await getDoc(supRef);
    if (supSnap.exists()) {
      const sup = supSnap.data();
      const count = sup.ratingCount || 0;
      const avg = sup.ratingAverage || 0;

      if (decision === 'reject') {
        // إضافة تقييم 5 نجوم كتعويض للمشرف
        const newCount = count + 1;
        const newAvg = ((avg * count) + 5) / newCount;
        await updateDoc(supRef, {
          ratingCount: newCount,
          ratingAverage: Math.round(newAvg * 100) / 100
        });
      }
      // في حالة "اعتذار" — التقييم السلبي يبقى محسوباً ضد المشرف
    }
  }

  return newStatus;
};

// ✅ حذف التذكرة نهائياً (بعد إرسال الرسائل)
export const finalizeAndDeleteTicket = async (ticketId) => {
  const ref = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

  // إنقاص العداد من المشرف
  if (data.assignedSupervisorId) {
    try {
      const supRef = doc(db, 'profiles', data.assignedSupervisorId);
      const supSnap = await getDoc(supRef);
      if (supSnap.exists()) {
        const current = supSnap.data().activeTicketCount || 0;
        await updateDoc(supRef, { activeTicketCount: Math.max(0, current - 1) });
      }
    } catch (e) { console.warn('decrement failed:', e); }
  }

  await deleteDoc(ref);
};