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

// =========================================================
// إنشاء تذكرة دعم جديدة
// =========================================================
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
    requiresManager: data.studentRole === 'supervisor' || data.studentRole === 'system_manager',
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
    unreadForStudent: false,
    unreadForSupervisor: true,
    bubbleDismissedByStudent: false,
    contactRequest: null,
    deleteRequest: null,
    report: null,
    reportResolvedAt: null,
    reportResolvedBy: null,
    reportAction: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, SUPPORT_TICKETS_COLLECTION), ticket);
  return ref.id;
};

// =========================================================
// جلب التذكرة المفتوحة للطالب
// =========================================================
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

// =========================================================
// Subscriptions
// =========================================================
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

// =========================================================
// ✅ حجز التذكرة + إشعار صاحب التذكرة تلقائياً
// =========================================================
export const claimTicket = async (ticketId, supervisorId, supervisorName, managerMode = false) => {
  const systemMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: managerMode
      ? `✅ تم استلام طلبك من قبل مدير النظام ${supervisorName}. سيتم الرد عليك في أقرب وقت.`
      : `✅ تم استلام طلبك من قبل المشرف ${supervisorName}. سيتم الرد عليك في أقرب وقت.`,
    createdAt: new Date().toISOString()
  };

  await runTransaction(db, async (transaction) => {
    const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
    const supRef = doc(db, 'profiles', supervisorId);

    const ticketSnap = await transaction.get(ticketRef);
    const supSnap = await transaction.get(supRef);

    if (!ticketSnap.exists()) throw new Error('التذكرة غير موجودة');
    const ticket = ticketSnap.data();
    if (ticket.assignedSupervisorId) throw new Error('التذكرة محجوزة لمشرف آخر');
    if (ticket.status !== SUPPORT_TICKET_STATUS.OPEN &&
        ticket.status !== SUPPORT_TICKET_STATUS.NEEDS_COMPLETION) {
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
      status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
      updatedAt: serverTimestamp(),
      unreadForSupervisor: false,
      unreadForStudent: true,
      messages: arrayUnion(systemMessage)
    });

    if (!managerMode) {
      transaction.update(supRef, { activeTicketCount: currentActive + 1 });
    }
  });
};

// =========================================================
// إرسال رسالة
// =========================================================
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

// =========================================================
// تعليم كمقروء
// =========================================================
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

// =========================================================
// طلب رقم صاحب التذكرة
// =========================================================
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

// =========================================================
// طلب حذف التذكرة
// =========================================================
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

// =========================================================
// ✅ طلب إغلاق التذكرة من المشرف (مع رسالة نظام داخل المحادثة)
// =========================================================
export const requestTicketEnd = async (ticketId, supervisorName = '') => {
  const now = Date.now();

  const systemMessage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    senderId: 'system',
    senderName: 'النظام',
    senderRole: 'system',
    text: `📩 طلب ${supervisorName || 'المشرف'} إغلاق تذكرة المساعدة`,
    createdAt: new Date().toISOString()
  };

  await updateDoc(doc(db, SUPPORT_TICKETS_COLLECTION, ticketId), {
    status: SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED,
    endRequestedAt: serverTimestamp(),
    endRequestExpiresAt: new Date(now + SUPPORT_END_TIMEOUT_MS),
    messages: arrayUnion(systemMessage),
    unreadForStudent: true,
    updatedAt: serverTimestamp()
  });
};

// =========================================================
// تأكيدات الطالب
// =========================================================
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

// =========================================================
// تقييم الطالب
// =========================================================
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

// =========================================================
// قرار المدير
// =========================================================
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

// =========================================================
// حذف نهائي ذرّي
// =========================================================
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

// =========================================================
// نظام بلاغات الدعم الفني
// =========================================================
export const reportTicket = async (ticketId, reporterId, reporterName, reasonValue, reasonDetails) => {
  const ticketRef = doc(db, SUPPORT_TICKETS_COLLECTION, ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('التذكرة غير موجودة');
  const data = snap.data();

  if (data.assignedSupervisorId !== reporterId) {
    throw new Error('لا يمكنك الإبلاغ عن تذكرة لا تملكها');
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
      reportedAt: serverTimestamp()
    },
    messages: arrayUnion(systemMessage),
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
};

export const closeReportedTicketAfterAccountDeletion = async (ticketId) => {
  await deleteTicketPermanently(ticketId);
};

export const finalizeReportWithWarning = async (ticketId, managerId) => {
  await deleteTicketPermanently(ticketId);
};