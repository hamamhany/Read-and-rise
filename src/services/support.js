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
  CONTACT_REQUEST_STATUS,
  DELETE_REQUEST_STATUS,
  SUPPORT_REPORT_REASONS
} from '../constants';

const AI_MAX_END_REQUESTS = 2;
const AI_END_COOLDOWN_MS = 5 * 60 * 1000;

export const createSupportTicket = async (data) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('studentId', '==', data.studentId),
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.OPEN,
      SUPPORT_TICKET_STATUS.IN_PROGRESS,
      SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
      SUPPORT_TICKET_STATUS.AWAITING_RATING,
      SUPPORT_TICKET_STATUS.REPORTED,
      SUPPORT_TICKET_STATUS.NEEDS_COMPLETION
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
    requiresManager: false,
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
    ratedAgainstAi: false,
    managerReviewedAt: null,
    managerDecision: null,
    managerReason: null,
    unreadForStudent: false,
    unreadForSupervisor: true,
    bubbleDismissedByStudent: false,
    contactRequest: null,
    deleteRequest: null,
    report: null,
    reportResolvedAt: null,
    reportResolvedBy: null,
    reportAction: null,
    aiRequestedEnd: false,
    aiEndRequestCount: 0,
    lastAiEndRequestAt: null,
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
      SUPPORT_TICKET_STATUS.MANAGER_PENDING,
      SUPPORT_TICKET_STATUS.REPORTED,
      SUPPORT_TICKET_STATUS.NEEDS_COMPLETION
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
    where('status', 'in', [
      SUPPORT_TICKET_STATUS.OPEN,
      SUPPORT_TICKET_STATUS.NEEDS_COMPLETION
    ]),
    where('requiresManager', '==', false),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const subscribeToManagerReviewTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.RATED_LOW),
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

export const subscribeToLegacyTransfers = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.MANAGER_PENDING),
    orderBy('createdAt', 'asc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const subscribeToReportedTickets = (callback) => {
  const q = query(
    collection(db, SUPPORT_TICKETS_COLLECTION),
    where('status', '==', SUPPORT_TICKET_STATUS.REPORTED),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const subscribeToPendingContactRequests = (callback) => {
  return () => {};
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
    if (
      ticket.status !== SUPPORT_TICKET_STATUS.OPEN &&
      ticket.status !== SUPPORT_TICKET_STATUS.NEEDS_COMPLETION &&
      ticket.status !== SUPPORT_TICKET_STATUS.MANAGER_PENDING
    ) {
      throw new Error('التذكرة ليست متاحة');
    }

    const supData = supSnap.data() || {};
    const currentActive = supData.activeTicketCount || 0;

    if (!managerMode && currentActive >= SUPPORT_MAX_ACTIVE_OVERLOAD) {
      throw new Error(`لقد وصلت للحد الأقصى من التذاكر النشطة (${SUPPORT_MAX_ACTIVE_OVERLOAD}).`);
    }

    transaction.update(ticketRef, {
      assignedSupervisorId: supervisorId,
      assignedSupervisorName: supervisorName,
      assignedAt: serverTimestamp(),
      assignedMessageCount: (ticket.messages || []).length,
      status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
      requiresManager: false,
      updatedAt: serverTimestamp(),
      unreadForSupervisor: false,
      unreadForStudent: true
    });

    if (!managerMode) {
      transaction.update(supRef, { activeTicketCount: currentActive + 1 });
    }
  });
};

export const sendTicketMessage = async (ticketId, sender, text) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const ticketSnap = await getDoc(ticketRef);
  if (!ticketSnap.exists()) throw new Error('التذكرة غير موجودة');
  const ticketData = ticketSnap.data();

  if (ticketData.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED) {
    throw new Error('الدردشة متوقفة بانتظار قرار صاحب التذكرة');
  }
  if (ticketData.status === SUPPORT_TICKET_STATUS.REPORTED) {
    throw new Error('المحادثة محوّلة إلى قسم المراجعة — لا يمكن إرسال رسائل');
  }

  const message = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    text,
    createdAt: new Date().toISOString()
  };
  const isSupervisor = ['supervisor', 'system_manager'].includes(sender.role);

  const hasActiveDeleteRequest = ticketData.deleteRequest &&
    [DELETE_REQUEST_STATUS.PENDING, DELETE_REQUEST_STATUS.BOTH_APPROVED].includes(ticketData.deleteRequest.status);

  const updates = {
    messages: arrayUnion(message),
    updatedAt: serverTimestamp(),
    lastMessage: text,
    unreadForStudent: isSupervisor ? true : false,
    unreadForSupervisor: isSupervisor ? false : true
  };

  if (hasActiveDeleteRequest) {
    updates.deleteRequest = {
      ...ticketData.deleteRequest,
      status: DELETE_REQUEST_STATUS.CANCELLED,
      cancelledAt: serverTimestamp(),
      cancelledReason: 'رسالة جديدة أثناء طلب الحذف'
    };
  }

  await updateDoc(ticketRef, updates);
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
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  if (data.status !== SUPPORT_TICKET_STATUS.IN_PROGRESS) {
    throw new Error('لا يمكن تحويل التذكرة في هذه الحالة');
  }
  if (!data.assignedSupervisorId) {
    throw new Error('لا يمكن تحويل تذكرة لم يستلمها مشرف بعد');
  }

  const previousSupervisorId = data.assignedSupervisorId;

  const message = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: `📤 تم تحويل هذا الطلب إلى مدير النظام لحلّه مباشرة بواسطة ${supervisorName || 'المشرف'}. يمكنك متابعة الحديث مع المساعد الذكي "سند" في الأثناء.`,
    createdAt: new Date().toISOString()
  };

  await updateDoc(ticketRef, {
    status: SUPPORT_TICKET_STATUS.OPEN,
    assignedSupervisorId: null,
    assignedSupervisorName: null,
    assignedAt: null,
    requiresManager: true,
    transferredBy: supervisorName,
    transferredAt: serverTimestamp(),
    messages: arrayUnion(message),
    lastMessage: message.text,
    unreadForStudent: false,
    unreadForSupervisor: false,
    updatedAt: serverTimestamp()
  });

  if (previousSupervisorId) {
    try {
      const supRef = doc(db, 'profiles', previousSupervisorId);
      await runTransaction(db, async (tx) => {
        const s = await tx.get(supRef);
        if (s.exists()) {
          const current = s.data().activeTicketCount || 0;
          tx.update(supRef, { activeTicketCount: Math.max(0, current - 1) });
        }
      });
    } catch (e) { console.warn('decrement supervisor count failed:', e); }
  }
};

export const requestContactInfo = async (ticketId, reason, requesterId, requesterName = '') => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  if (data.contactRequest?.status === CONTACT_REQUEST_STATUS.PENDING) {
    throw new Error('يوجد طلب رقم قيد المراجعة بالفعل');
  }

  await updateDoc(ticketRef, {
    contactRequest: {
      reason,
      requestedBy: requesterId,
      requestedByName: requesterName,
      requestedAt: serverTimestamp(),
      status: CONTACT_REQUEST_STATUS.PENDING,
      mode: null,
      customNumber: null,
      reviewedAt: null,
      rejectionReason: null
    },
    updatedAt: serverTimestamp()
  });
};

export const approveContactRequest = async (ticketId, options = {}) => {
  const { mode = 'registered', customNumber = null } = options;
  if (mode === 'other' && (!customNumber || customNumber.length < 10)) {
    throw new Error('يرجى إدخال رقم تواصل صالح');
  }
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    'contactRequest.status': CONTACT_REQUEST_STATUS.APPROVED,
    'contactRequest.mode': mode,
    'contactRequest.customNumber': mode === 'other' ? customNumber : null,
    'contactRequest.reviewedAt': serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

export const rejectContactRequest = async (ticketId, reason = '') => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    'contactRequest.status': CONTACT_REQUEST_STATUS.REJECTED,
    'contactRequest.rejectionReason': reason,
    'contactRequest.reviewedAt': serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

export const requestTicketDeletion = async (ticketId, managerId, managerName) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  if (data.deleteRequest &&
      [DELETE_REQUEST_STATUS.PENDING, DELETE_REQUEST_STATUS.BOTH_APPROVED].includes(data.deleteRequest.status)) {
    throw new Error('يوجد طلب حذف نشط بالفعل');
  }

  const isManagerTheSupervisor = data.assignedSupervisorId === managerId;
  const isManagerTheCreator = data.studentId === managerId;

  await updateDoc(ticketRef, {
    deleteRequest: {
      requestedBy: managerId,
      requestedByName: managerName,
      requestedAt: serverTimestamp(),
      status: DELETE_REQUEST_STATUS.PENDING,
      supervisorApproved: isManagerTheSupervisor,
      supervisorApprovedAt: isManagerTheSupervisor ? serverTimestamp() : null,
      studentApproved: isManagerTheCreator,
      studentApprovedAt: isManagerTheCreator ? serverTimestamp() : null,
      scheduledDeleteAt: null,
      cancelledAt: null,
      cancelledReason: null
    },
    updatedAt: serverTimestamp()
  });
};

export const approveDeletionBySupervisor = async (ticketId) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ticketRef);
    if (!snap.exists()) throw new Error('التذكرة غير موجودة');
    const data = snap.data();

    if (!data.deleteRequest) throw new Error('لا يوجد طلب حذف نشط');

    if (data.deleteRequest.status === DELETE_REQUEST_STATUS.BOTH_APPROVED) {
      return { shouldDelete: true };
    }
    if (data.deleteRequest.status !== DELETE_REQUEST_STATUS.PENDING) {
      throw new Error('لا يوجد طلب حذف نشط');
    }

    const studentAlready = data.deleteRequest.studentApproved === true;

    if (studentAlready) {
      transaction.update(ticketRef, {
        'deleteRequest.status': DELETE_REQUEST_STATUS.BOTH_APPROVED,
        'deleteRequest.supervisorApproved': true,
        'deleteRequest.supervisorApprovedAt': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { shouldDelete: true };
    }

    transaction.update(ticketRef, {
      'deleteRequest.supervisorApproved': true,
      'deleteRequest.supervisorApprovedAt': serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { shouldDelete: false };
  });

  if (result.shouldDelete) {
    await deleteTicketPermanently(ticketId);
  }
  return result;
};

export const rejectDeletionBySupervisor = async (ticketId, reason = '') => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    'deleteRequest.status': DELETE_REQUEST_STATUS.CANCELLED,
    'deleteRequest.supervisorApproved': false,
    'deleteRequest.cancelledAt': serverTimestamp(),
    'deleteRequest.cancelledReason': reason || 'رفض المشرف',
    updatedAt: serverTimestamp()
  });
};

export const approveDeletionByStudent = async (ticketId) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);

  const result = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ticketRef);
    if (!snap.exists()) throw new Error('التذكرة غير موجودة');
    const data = snap.data();

    if (!data.deleteRequest) throw new Error('لا يوجد طلب حذف نشط');

    if (data.deleteRequest.status === DELETE_REQUEST_STATUS.BOTH_APPROVED) {
      return { shouldDelete: true };
    }
    if (data.deleteRequest.status !== DELETE_REQUEST_STATUS.PENDING) {
      throw new Error('لا يوجد طلب حذف نشط');
    }

    const supervisorAlready = data.deleteRequest.supervisorApproved === true;

    if (supervisorAlready) {
      transaction.update(ticketRef, {
        'deleteRequest.status': DELETE_REQUEST_STATUS.BOTH_APPROVED,
        'deleteRequest.studentApproved': true,
        'deleteRequest.studentApprovedAt': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return { shouldDelete: true };
    }

    transaction.update(ticketRef, {
      'deleteRequest.studentApproved': true,
      'deleteRequest.studentApprovedAt': serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { shouldDelete: false };
  });

  if (result.shouldDelete) {
    await deleteTicketPermanently(ticketId);
  }
  return result;
};

export const rejectDeletionByStudent = async (ticketId, reason = '') => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    'deleteRequest.status': DELETE_REQUEST_STATUS.CANCELLED,
    'deleteRequest.studentApproved': false,
    'deleteRequest.cancelledAt': serverTimestamp(),
    'deleteRequest.cancelledReason': reason || 'رفض صاحب التذكرة',
    updatedAt: serverTimestamp()
  });
};

export const requestTicketEnd = async (ticketId, supervisorName = '', opts = {}) => {
  const { aiEnd = false } = opts;
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);

  let updates = {
    status: SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
    endRequestedAt: serverTimestamp(),
    endRequestExpiresAt: new Date(Date.now() + SUPPORT_END_TIMEOUT_MS),
    unreadForStudent: true,
    aiRequestedEnd: aiEnd,
    updatedAt: serverTimestamp()
  };

  if (aiEnd) {
    const snap = await getDoc(ticketRef);
    if (!snap.exists()) throw new Error('التذكرة غير موجودة');
    const data = snap.data();
    const count = data.aiEndRequestCount || 0;
    const lastAt = data.lastAiEndRequestAt?.toMillis?.() || 0;

    if (count >= AI_MAX_END_REQUESTS) {
      throw new Error('المساعد الذكي وصل للحد الأقصى من طلبات الإغلاق لهذه التذكرة');
    }
    if (lastAt && Date.now() - lastAt < AI_END_COOLDOWN_MS) {
      throw new Error('لا يمكن طلب إغلاق جديد قبل انقضاء 5 دقائق');
    }

    updates.aiEndRequestCount = count + 1;
    updates.lastAiEndRequestAt = serverTimestamp();
  }

  await updateDoc(ticketRef, updates);
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
    aiRequestedEnd: false,
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

  //  الشكوى ضد سند = تقييم سلبي بدون مشرف بشري
  const hadHumanSupervisor = !!(data.assignedSupervisorId);
  const ratedAgainstAi = !isFull && !hadHumanSupervisor;

  await updateDoc(ticketRef, {
    rating,
    ratingCategory: ratingCategory || null,
    ratingReason: ratingReason || null,
    ratedAt: serverTimestamp(),
    status: newStatus,
    closedAt: isFull ? serverTimestamp() : null,
    ratedAgainstAi,
    updatedAt: serverTimestamp()
  });

  // تحديث تقييم المشرف فقط لو كان مشرف بشري
  if (!ratedAgainstAi && data.assignedSupervisorId) {
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

  //  الحذف التلقائي فقط للـ 5 نجوم. التقييم السلبي (سواء سند أو مشرف) يبقى للمدير يراجعه.
  if (isFull) {
    try { await deleteTicketPermanently(ticketId); }
    catch (e) { console.warn('auto-delete after full rating failed:', e); }
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

  // تعديل تقييم المشرف فقط لو كان مشرف بشري
  if (data.assignedSupervisorId && data.ratedAgainstAi !== true) {
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

  try { await deleteTicketPermanently(ticketId); }
  catch (e) { console.warn('auto-delete after manager decision failed:', e); }

  return newStatus;
};

export const deleteTicketPermanently = async (ticketId) => {
  const ref = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  let supervisorId = null;

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) return;
      const data = snap.data();
      supervisorId = data.assignedSupervisorId;
      transaction.delete(ref);
    });
  } catch (e) {
    console.warn('delete ticket transaction failed:', e);
    return;
  }

  if (supervisorId) {
    try {
      const supRef = doc(db, 'profiles', supervisorId);
      await runTransaction(db, async (transaction) => {
        const supSnap = await transaction.get(supRef);
        if (supSnap.exists()) {
          const current = supSnap.data().activeTicketCount || 0;
          transaction.update(supRef, { activeTicketCount: Math.max(0, current - 1) });
        }
      });
    } catch (e) { console.warn('decrement failed:', e); }
  }
};

export const finalizeAndDeleteTicket = deleteTicketPermanently;

export const reportTicket = async (ticketId, reporterId, reporterName, reasonValue, reasonDetails, messageInfo = null) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  const isSupervisorReporter = data.assignedSupervisorId === reporterId;
  const isStudentReporter = data.studentId === reporterId;
  if (!isSupervisorReporter && !isStudentReporter) {
    throw new Error('لا يمكنك الإبلاغ عن محادثة لست طرفاً فيها');
  }
  if (data.status !== SUPPORT_TICKET_STATUS.IN_PROGRESS) {
    throw new Error('لا يمكن الإبلاغ عن تذكرة في هذه الحالة');
  }
  if (!reasonValue) throw new Error('يرجى اختيار سبب البلاغ');
  if (!reasonDetails || !reasonDetails.trim()) throw new Error('يرجى كتابة تفاصيل البلاغ');

  const reasonLabel = SUPPORT_REPORT_REASONS.find(r => r.value === reasonValue)?.label || reasonValue;

  const systemMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: '🔒 تم تحويل المحادثة إلى قسم المراجعة في الإدارة بسبب تقديم بلاغ على المحادثة. لا يمكن إرسال رسائل حتى تنتهي المراجعة.',
    createdAt: new Date().toISOString()
  };

  await updateDoc(ticketRef, {
    status: SUPPORT_TICKET_STATUS.REPORTED,
    report: {
      reason: reasonValue,
      reasonLabel,
      details: reasonDetails.trim(),
      reportedBy: reporterId,
      reportedByName: reporterName,
      reportedByRole: isStudentReporter ? 'student' : 'supervisor',
      messageId: messageInfo?.id || null,
      messageText: messageInfo?.text ? String(messageInfo.text).slice(0, 1000) : null,
      messageSenderName: messageInfo?.senderName || null,
      reportedAt: serverTimestamp()
    },
    messages: arrayUnion(systemMessage),
    updatedAt: serverTimestamp()
  });
};

/** ✅ المدير: لا يوجد ما يستدعي الإيقاف — تُستأنف الدردشة كما كانت مع نفس المشرف */
export const dismissReportAndContinue = async (ticketId, managerId) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  const systemMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: '✅ راجعت الإدارة البلاغ ولا يوجد ما يستدعي إيقاف المحادثة. يمكنكما متابعة الدردشة.',
    createdAt: new Date().toISOString()
  };

  await updateDoc(ticketRef, {
    status: data.assignedSupervisorId ? SUPPORT_TICKET_STATUS.IN_PROGRESS : SUPPORT_TICKET_STATUS.OPEN,
    report: null,
    reportResolvedAt: serverTimestamp(),
    reportResolvedBy: managerId,
    reportAction: 'continued',
    messages: arrayUnion(systemMessage),
    unreadForStudent: true,
    unreadForSupervisor: true,
    updatedAt: serverTimestamp()
  });
};

/** ✅ سند حوّل المحادثة لقسم الإشراف — لن يرد سند بعد الآن */
export const markAiHandedOff = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    aiHandedOff: true,
    aiHandedOffAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

export const cancelReportAndDelete = async (ticketId) => {
  await deleteTicketPermanently(ticketId);
};

export const cancelReportAndReopen = async (ticketId, managerId) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  const systemMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: 'تم فك الحظر عن هذه الدردشة، نعتذر منك لقد حدث عطل ما اضطرنا إلى تحويل الدردشة إلى الإدارة بعد الإشتباه في حالة مخالفة للقوانين الأكاديمية',
    createdAt: new Date().toISOString(),
    hiddenFor: ['supervisor']
  };

  await updateDoc(ticketRef, {
    status: SUPPORT_TICKET_STATUS.NEEDS_COMPLETION,
    assignedSupervisorId: null,
    assignedSupervisorName: null,
    assignedAt: null,
    report: null,
    reportResolvedAt: serverTimestamp(),
    reportResolvedBy: managerId,
    reportAction: 'reopened',
    messages: arrayUnion(systemMessage),
    updatedAt: serverTimestamp()
  });

  if (data.assignedSupervisorId) {
    try {
      const supRef = doc(db, 'profiles', data.assignedSupervisorId);
      await runTransaction(db, async (tx) => {
        const s = await tx.get(supRef);
        if (s.exists()) {
          const current = s.data().activeTicketCount || 0;
          tx.update(supRef, { activeTicketCount: Math.max(0, current - 1) });
        }
      });
    } catch (e) { console.warn('decrement failed:', e); }
  }
};

export const closeReportedTicketAfterAccountDeletion = async (ticketId) => {
  await deleteTicketPermanently(ticketId);
};

export const finalizeReportWithWarning = async (ticketId, managerId) => {
  await deleteTicketPermanently(ticketId);
};

export const setTicketTyping = async (ticketId, who) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    typing: { id: who.id, name: who.name || '', role: who.role || '', at: Date.now() }
  });
};

export const clearTicketTyping = async (ticketId) => {
  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), { typing: null });
};

export const claimAiReply = async (ticketId, messageId) => {
  try {
    const ref = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return false;
      if (snap.data().aiRepliedToMessageId === messageId) return false;
      tx.update(ref, { aiRepliedToMessageId: messageId });
      return true;
    });
  } catch (err) {
    console.warn('claimAiReply failed, continuing anyway:', err);
    return true;
  }
};

export const logSecurityIncident = async (ticketId, userRole, text) => {
  try {
    await addDoc(collection(db, 'securityIncidents'), {
      ticketId: ticketId || null,
      userRole: userRole || 'unknown',
      text: String(text || '').slice(0, 2000),
      createdAt: serverTimestamp(),
      reviewed: false
    });
  } catch (e) {
    console.warn('logSecurityIncident failed:', e);
  }
};