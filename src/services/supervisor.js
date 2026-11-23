// src/services/supervisor.js
import { secondaryAuth, db } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, setDoc, getDocs, query, where, limit,
  serverTimestamp, onSnapshot, updateDoc, getDoc, arrayUnion
} from 'firebase/firestore';
import { generateId } from '../utils/helpers';
import { CLASS_VISIBILITY, PENDING_CHANGES_STATUS } from '../constants';
import { stripMeta, upsertHistory } from './requestCodes';

/**
 * توليد اسم مستخدم فريد للمشرف
 * الصيغة: supXXXXXX (6 أرقام عشوائية)
 */
const generateUniqueSupervisorUsername = async () => {
  for (let i = 0; i < 10; i++) {
    const candidate = `sup${Math.floor(Math.random() * 900000) + 100000}`;
    const snap = await getDocs(
      query(collection(db, 'profiles'), where('username', '==', candidate), limit(1))
    );
    if (snap.empty) return candidate;
  }
  throw new Error('تعذر إيجاد اسم مستخدم فريد — حاول مرة أخرى');
};

/**
 * إنشاء حساب مشرف جديد
 */
export const createSupervisorAccount = async (
  name,
  gender,
  age,
  phone,
  createdBy,
  permissions = { reports: true, resets: true, support: true },
  classVisibility = CLASS_VISIBILITY.ALL
) => {
  if (!name || !name.trim()) throw new Error('الاسم مطلوب');
  if (!gender) throw new Error('الجنس مطلوب');
  if (!age) throw new Error('العمر مطلوب');
  if (!phone) throw new Error('رقم الهاتف مطلوب');

  const username = await generateUniqueSupervisorUsername();
  const tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const email = `${username}@readandrise.com`;

  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
  } catch (err) {
    throw new Error('فشل إنشاء حساب المشرف: ' + err.message);
  }

  const firebaseUser = userCredential.user;
  await signOut(secondaryAuth);

  const newId = generateId();

  await setDoc(doc(db, 'profiles', newId), {
    uid: firebaseUser.uid,
    email,
    username,
    name: name.trim(),
    gender,
    age: parseInt(age),
    phone: String(phone),
    role: 'supervisor',
    isProfileComplete: false,
    infoVerified: false,
    tempPassword,
    classIds: [],
    permissions: {
      reports: permissions.reports !== false,
      resets: permissions.resets !== false,
      support: permissions.support !== false
    },
    classVisibility: classVisibility || CLASS_VISIBILITY.ALL,
    isFrozen: false,
    activeTicketCount: 0,
    ratingCount: 0,
    ratingAverage: 0,
    canPublishAnnouncements: true,
    createdBy: createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return {
    id: newId,
    name: name.trim(),
    username,
    tempPassword,
    email
  };
};

// =========================================================
//  تعديلات الملف المعلّقة — الطالب يعدّل → المشرف يوافق/يرفض
// =========================================================

const SKIP_FIELDS = ['submittedAt', 'submittedBy', 'submittedByName', 'requestCode'];

/**
 * اشتراك مباشر في قائمة الطلاب الذين لديهم تعديلات معلّقة
 * @param {Function} callback - يُستدعى بقائمة الطلاب
 * @returns {Function} unsubscribe
 */
export const subscribeToPendingStudentChanges = (callback) => {
  const q = query(
    collection(db, 'profiles'),
    where('role', '==', 'student'),
    where('pendingChangesStatus', '==', PENDING_CHANGES_STATUS.PENDING)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.warn('subscribeToPendingStudentChanges error:', err.message);
      callback([]);
    }
  );
};

/**
 * إرسال إشعار للمستخدم (يظهر في مركز إشعاراته)
 */
const sendUserNotification = async (userId, title, body, type = 'pending_changes') => {
  try {
    await setDoc(doc(collection(db, 'notifications', userId, 'userNotifications')), {
      title,
      body,
      type,
      createdAt: serverTimestamp(),
      read: false
    });
  } catch (e) {
    console.warn('sendUserNotification failed:', e.message);
  }
};

/**
 * الموافقة على تعديلات طالب — تطبّق القيم الجديدة على ملفه
 * @param {string} studentId
 * @param {string} supervisorId
 * @param {string} supervisorName
 */
export const approveStudentChanges = async (studentId, supervisorId, supervisorName) => {
  const studentRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) throw new Error('الطالب غير موجود');

  const data = snap.data();
  if (data.pendingChangesStatus !== PENDING_CHANGES_STATUS.PENDING) {
    throw new Error('لا توجد تعديلات معلّقة على هذا الطالب');
  }
  const pending = data.pendingChanges || {};

  const updates = {};

  // تطبيق القيم الجديدة
  Object.entries(pending).forEach(([field, val]) => {
    if (SKIP_FIELDS.includes(field)) return;
    if (val && typeof val === 'object' && 'to' in val) {
      updates[field] = val.to;
    }
  });

  const requestCode = pending.requestCode || null;
  if (requestCode) {
    updates.changeRequestCodes = arrayUnion(requestCode);
    updates.changeRequests = upsertHistory(data.changeRequests, {
      code: requestCode,
      status: 'approved',
      submittedAt: pending.submittedAt || null,
      changes: stripMeta(pending),
      decidedAt: new Date().toISOString(),
      decidedById: supervisorId || '',
      decidedByName: supervisorName || 'مشرف'
    });
  }

  updates.pendingChanges = null;
  updates.pendingChangesStatus = PENDING_CHANGES_STATUS.APPROVED;
  updates.approvedChangesBy = supervisorId;
  updates.approvedChangesByName = supervisorName || 'مشرف';
  updates.approvedChangesAt = serverTimestamp();
  updates.updatedAt = serverTimestamp();

  await updateDoc(studentRef, updates);

  await sendUserNotification(
    studentId,
    ' تم اعتماد تعديلاتك',
    `وافق المشرف على تعديلات ملفك وتم تطبيقها.${requestCode ? ` (رقم الطلب: ${requestCode})` : ''}`,
    'pending_changes_approved'
  );
};

/**
 * رفض تعديلات طالب — تُمحى القيم الجديدة، ولا يُطبَّق شيء
 */
export const rejectStudentChanges = async (studentId, reason, supervisorId, supervisorName) => {
  const studentRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) throw new Error('الطالب غير موجود');

  const data = snap.data();
  if (data.pendingChangesStatus !== PENDING_CHANGES_STATUS.PENDING) {
    throw new Error('لا توجد تعديلات معلّقة على هذا الطالب');
  }

  const rejPending = data.pendingChanges || {};
  const rejCode = rejPending.requestCode || null;
  const rejHistory = rejCode ? {
    changeRequestCodes: arrayUnion(rejCode),
    changeRequests: upsertHistory(data.changeRequests, {
      code: rejCode,
      status: 'rejected',
      submittedAt: rejPending.submittedAt || null,
      changes: stripMeta(rejPending),
      decidedAt: new Date().toISOString(),
      decidedById: supervisorId || '',
      decidedByName: supervisorName || 'مشرف',
      rejectionReason: reason || ''
    })
  } : {};

  await updateDoc(studentRef, {
    ...rejHistory,
    pendingChanges: null,
    pendingChangesStatus: PENDING_CHANGES_STATUS.REJECTED,
    pendingChangesRejectionReason: reason || '',
    rejectedChangesBy: supervisorId,
    rejectedChangesByName: supervisorName || 'مشرف',
    rejectedChangesAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await sendUserNotification(
    studentId,
    '❌ تم رفض تعديلاتك',
    (reason ? `سبب الرفض: ${reason}` : 'تم رفض التعديلات من قبل المشرف.') + (rejCode ? ` (رقم الطلب: ${rejCode})` : ''),
    'pending_changes_rejected'
  );
};