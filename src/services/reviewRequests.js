import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, getDoc, getDocs,
  query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { REVIEW_REQUEST_STATUS, REVIEW_VOTE_OPTIONS, REVIEW_REQUIRED_VOTES } from '../constants';

export const createAccountClosureRequest = async (data) => {
  const ref = await addDoc(collection(db, 'reviewRequests'), {
    type: 'account_closure',
    targetId: data.studentId,
    targetName: data.studentName,
    targetPhone: data.studentPhone,
    targetClass: data.studentClass || 'غير محدد',
    reason: data.reason,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: serverTimestamp(),
    status: REVIEW_REQUEST_STATUS.PENDING_VOTES,
    votes: [],
    requiredVotes: REVIEW_REQUIRED_VOTES,
    updatedAt: serverTimestamp()
  });
  return ref.id;
};

export const voteOnReview = async (reviewId, supervisorId, supervisorName, vote) => {
  if (![REVIEW_VOTE_OPTIONS.AGREE, REVIEW_VOTE_OPTIONS.EXAGGERATED].includes(vote)) {
    throw new Error('قيمة تصويت غير صحيحة');
  }
  const reviewRef = doc(db, 'reviewRequests', reviewId);
  const snap = await getDoc(reviewRef);
  if (!snap.exists) throw new Error('الطلب غير موجود');

  const data = snap.data();
  if (data.status !== REVIEW_REQUEST_STATUS.PENDING_VOTES) {
    throw new Error('الطلب لم يعد بحاجة للتصويت');
  }

  const existingVotes = data.votes || [];
  if (existingVotes.some(v => v.supervisorId === supervisorId)) {
    throw new Error('لقد قمت بالتصويت مسبقاً');
  }
  if (existingVotes.some(v => v.supervisorId === data.createdBy)) {
    // منشئ الطلب لا يصوت
  }

  const newVote = {
    supervisorId,
    supervisorName,
    vote,
    votedAt: new Date().toISOString()
  };
  const newVotes = [...existingVotes, newVote];

  let newStatus = REVIEW_REQUEST_STATUS.PENDING_VOTES;
  if (newVotes.length >= REVIEW_REQUIRED_VOTES) {
    const agreeCount = newVotes.filter(v => v.vote === REVIEW_VOTE_OPTIONS.AGREE).length;
    if (agreeCount === REVIEW_REQUIRED_VOTES) {
      newStatus = REVIEW_REQUEST_STATUS.APPROVED_BY_SUPERVISORS;
    } else {
      newStatus = REVIEW_REQUEST_STATUS.DISPUTED;
    }
  }

  await updateDoc(reviewRef, {
    votes: newVotes,
    status: newStatus,
    updatedAt: serverTimestamp()
  });

  return { newStatus, agreeCount: newVotes.filter(v => v.vote === REVIEW_VOTE_OPTIONS.AGREE).length };
};

export const subscribeReviewRequests = (callback) => {
  const q = query(collection(db, 'reviewRequests'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime() || 0;
      const tb = b.createdAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });
    callback(list);
  });
};

export const finalizeReviewByManager = async (reviewId, managerId, decision) => {
  // decision: 'approve' | 'reject'
  const reviewRef = doc(db, 'reviewRequests', reviewId);
  await updateDoc(reviewRef, {
    status: decision === 'approve'
      ? REVIEW_REQUEST_STATUS.APPROVED_BY_SUPERVISORS
      : REVIEW_REQUEST_STATUS.REJECTED,
    managerDecision: decision,
    managerId,
    updatedAt: serverTimestamp()
  });
};

export const markReviewAsSent = async (reviewId) => {
  await updateDoc(doc(db, 'reviewRequests', reviewId), {
    status: REVIEW_REQUEST_STATUS.SENT,
    sentAt: serverTimestamp()
  });
};