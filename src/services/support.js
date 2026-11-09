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
  SUPPORT_END_TIMEOUT_MS,
  CONTACT_REQUEST_STATUS
} from '../constants';

export const createSupportTicket = async (data) => {
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
  if (!snap.empty) throw new Error('لديك تذكرة دعم مفتوحة بالفعل.');

  const initialMessage = data.initialMessage;
  delete data.initialMessage;

  const ticket = {
    ...data,
    status: SUPPORT_TICKET_STATUS.OPEN,
    requiresManager: data.studentRole === 'supervisor',
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
    unreadForStudent: false, // الطالب هو من أنشأها
    unreadForSupervisor: true, // المشرفون لم يروها بعد
    bubbleDismissedByStudent: false,
    contactRequest: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, SUPPORT_TICKETS_COLLECTION), ticket);
  return ref.id;
};

export const getStudentOpenTicket = async (studentId) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('studentId', '==', studentId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.OPEN,
      SUPPORT_TICKET_STATUS.IN_PROGRESS,
      SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
      SUPPORT_TICKET_STATUS.AWAITING_RATING,
      SUPPORT_TICKET_STATUS.RATED_LOW,
      SUPPORT_TICKET_STATUS.MANAGER_PENDING
    ]),
    limit(1)
  );
  const snap = await getDocs(q);
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data(), isClosed: false };

  const qClosed = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('studentId', '==', studentId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.AUTO_CLOSED,
      SUPPORT_TICKET_STATUS.RATED_FULL,
      SUPPORT_TICKET_STATUS.MANAGER_APOLOGIZED,
      SUPPORT_TICKET_STATUS.MANAGER_REJECTED
    ]),
    orderBy('updatedAt', 'desc'),
    limit(1)
  );
  const snapClosed = await getDocs(qClosed);
  if (!snapClosed.empty) {
    const ticket = { id: snapClosed.docs[0].id, ...snapClosed.docs[0].data() };
    const closedAt = ticket.closedAt?.toDate?.() || new Date(ticket.closedAt);
    const hours = (new Date() - closedAt) / (1000 * 60 * 60);
    if (hours < 24 && !ticket.bubbleDismissedByStudent) {
      return { ...ticket, isClosed: true };
    }
  }
  return null;
};

export const subscribeToTicket = (ticketId, callback) => {
  return onSnapshot(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
};

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

export const subscribeToUnassignedTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.OPEN),
    where('requiresManager', '==', false),
    orderBy('createdAt', 'asc'),
    limit(100) // نزيد الحد لنتمكن من التحميل التدريجي
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const subscribeToManagerReviewTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', 'in', [SUPPORT_TICKET_STATUS.RATED_LOW, SUPPORT_TICKET_STATUS.MANAGER_PENDING]),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

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

    if (!managerMode && currentActive >= SUPPORT_MAX_ACTIVE_OVERLOAD) {
      throw new Error(`لقد وصلت للحد الأقصى من التذاكر النشطة (${SUPPORT_MAX_ACTIVE_OVERLOAD}).`);
    }

    transaction.update(ticketRef, {
      assignedSupervisorId: supervisorId,
      assignedSupervisorName: supervisorName,
      assignedAt: serverTimestamp(),
      status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
      updatedAt: serverTimestamp(),
      unreadForSupervisor: false
    });

    if (!managerMode) {
      transaction.update(supRef, { activeTicketCount: currentActive + 1 });
    }
  });
};

export const sendTicketMessage = async (ticketId, sender, text) => {
  const message = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    text,
    createdAt: new Date().toISOString()
  };
  const isSupervisor = ['supervisor', 'system_manager'].includes(sender.role);
  const updates = {
    messages: arrayUnion(message),
    updatedAt: serverTimestamp(),
    lastMessage: text,
    // ✅ النقطة الحمراء تظهر للطالب فقط إذا كان المرسل مشرفاً
    unreadForStudent: isSupervisor ? true : false,
    // ✅ النقطة الحمراء تظهر للمشرف فقط إذا كان المرسل طالباً
    unreadForSupervisor: isSupervisor ? false : true
  };
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), updates);
};

export const markTicketAsRead = async (ticketId, role) => {
  const updates = {};
  if (role === 'student') updates.unreadForStudent = false;
  if (['supervisor', 'system_manager'].includes(role)) updates.unreadForSupervisor = false;
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), updates);
};

export const dismissClosedBubble = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), { bubbleDismissedByStudent: true });
};

export const transferToManager = async (ticketId, supervisorName) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.MANAGER_PENDING,
    transferredBy: supervisorName,
    updatedAt: serverTimestamp()
  });
};

export const requestContactInfo = async (ticketId, reason, supervisorId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    contactRequest: {
      reason,
      requestedBy: supervisorId,
      requestedAt: serverTimestamp(),
      status: CONTACT_REQUEST_STATUS.PENDING
    },
    updatedAt: serverTimestamp()
  });
};

export const requestTicketEnd = async (ticketId) => {
  const now = Date.now();
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
    endRequestedAt: serverTimestamp(),
    endRequestExpiresAt: new Date(now + SUPPORT_END_TIMEOUT_MS),
    updatedAt: serverTimestamp()
  });
};

export const studentConfirmSolved = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.AWAITING_RATING,
    studentSatisfied: true,
    updatedAt: serverTimestamp()
  });
};

export const studentConfirmNotSolved = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
    studentSatisfied: false,
    endRequestedAt: null,
    endRequestExpiresAt: null,
    updatedAt: serverTimestamp()
  });
};

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
    closedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  if (data.assignedSupervisorId) {
    const supRef = doc(db, 'profiles', data.assignedSupervisorId);
    const supSnap = await getDoc(supRef);
    if (supSnap.exists()) {
      const sup = supSnap.data();
      const count = sup.ratingCount || 0;
      const avg = sup.ratingAverage || 0;
      if (decision === 'reject') {
        const newCount = count + 1;
        const newAvg = ((avg * count) + 5) / newCount;
        await updateDoc(supRef, {
          ratingCount: newCount,
          ratingAverage: Math.round(newAvg * 100) / 100
        });
      }
    }
  }
  return newStatus;
};

export const finalizeAndDeleteTicket = async (ticketId) => {
  const ref = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();

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