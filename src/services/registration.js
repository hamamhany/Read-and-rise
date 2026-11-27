// src/services/registration.js
// روابط التسجيل الفردي (المدير) + الاتصال بدالة السيرفر api/registration
import { db } from '../firebase';
import {
  collection, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp
} from 'firebase/firestore';
import { auth } from './firebaseAuth';

export const REGISTRATION_LINKS_COLLECTION = 'registrationLinks';

// ---------- توكن عشوائي طويل لا يمكن تخمينه ----------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const generateToken = (len = 40) => {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
};

export const buildLinkUrl = (token) => `${window.location.origin}/register?t=${token}`;

// ---------- الاتصال بالسيرفر ----------
export const callRegistrationApi = async (action, payload = {}, { authed = false } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (authed) {
    const user = auth.currentUser;
    if (!user) throw new Error('يجب تسجيل الدخول');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  const res = await fetch('/api/registration', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حدث خطأ، حاول مرة أخرى');
  return data;
};

// ---------- روابط المدير ----------
export const listRegistrationLinks = async () => {
  const snap = await getDocs(collection(db, REGISTRATION_LINKS_COLLECTION));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
};

/**
 * إنشاء رابط جديد.
 * type: 'sections' (أقسام فقط) | 'classes' (شعب فقط)
 * يرفض إذا وُجد رابط فعّال لنفس المجموعة تماماً، ويُرجع الرابط الموجود في error.existing
 */
export const createRegistrationLink = async ({ type, targetIds, targetNames, createdBy, expiresInDays }) => {
  if (!['sections', 'classes'].includes(type)) throw new Error('نوع الرابط غير صحيح');
  const ids = [...new Set((targetIds || []).filter(Boolean))];
  if (ids.length === 0) throw new Error('اختر عنصراً واحداً على الأقل');

  const targetKey = `${type}:${[...ids].sort().join('|')}`;
  const dup = await getDocs(query(
    collection(db, REGISTRATION_LINKS_COLLECTION),
    where('targetKey', '==', targetKey),
    where('active', '==', true)
  ));
  if (!dup.empty) {
    const existing = { id: dup.docs[0].id, ...dup.docs[0].data() };
    const err = new Error('يوجد رابط فعّال لنفس الاختيار بالفعل');
    err.existing = existing;
    throw err;
  }

  const token = generateToken(40);
  const days = Number(expiresInDays) || 0;
  await setDoc(doc(db, REGISTRATION_LINKS_COLLECTION, token), {
    type,
    targetIds: ids,
    targetNames: targetNames || [],
    targetKey,
    active: true,
    expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null,
    createdBy: createdBy || '',
    createdAt: serverTimestamp()
  });
  return { id: token };
};

export const setRegistrationLinkActive = async (token, active) => {
  await updateDoc(doc(db, REGISTRATION_LINKS_COLLECTION, token), { active: !!active });
};

export const deleteRegistrationLink = async (token) => {
  await deleteDoc(doc(db, REGISTRATION_LINKS_COLLECTION, token));
};
