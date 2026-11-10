// src/services/supervisor.js
import { secondaryAuth, db } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, doc, setDoc, getDocs, query, where, limit,
  serverTimestamp
} from 'firebase/firestore';
import { generateId } from '../utils/helpers';
import { CLASS_VISIBILITY } from '../constants';

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
 * @param {string} name - الاسم الكامل
 * @param {string} gender - ذكر / أنثى
 * @param {number} age - العمر
 * @param {string} phone - رقم الهاتف (مع رمز الدولة)
 * @param {string} createdBy - ID المدير المنشئ
 * @param {Object} permissions - { reports, resets, support }
 * @param {string} classVisibility - 'all' | 'own_gender'
 * @returns {Object} { id, name, username, tempPassword, email }
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