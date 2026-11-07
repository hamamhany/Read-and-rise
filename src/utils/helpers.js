import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { WARNING_RETENTION_MS } from '../constants';

export const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
};

export const arabicToEnglishNumber = (str) => {
  if (str === null || str === undefined) return '';
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
  };
  return String(str).replace(/[٠-٩۰-۹]/g, (d) => map[d] || d);
};

export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim();
};

export const safeDate = (d) => {
  const date = new Date(d);
  return isNaN(date.getTime()) ? new Date() : date;
};

export const fetchClassNames = async (classIds) => {
  if (!classIds || classIds.length === 0) return {};
  const names = {};
  await Promise.all(classIds.map(async (id) => {
    try {
      const docSnap = await getDoc(doc(db, 'classes', id));
      if (docSnap.exists()) {
        names[id] = docSnap.data().name;
      } else {
        names[id] = null;
      }
    } catch (err) {
      console.error('Error fetching class name for id', id, err);
      names[id] = null;
    }
  }));
  return names;
};

export const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return phone.replace(/^0+/, '').replace(/[^0-9]/g, '');
};

// دالة ترتيب الطلاب أبجدياً
export const sortStudentsAlphabetically = (students) => {
  return [...students].sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    const isArabicA = /[\u0600-\u06FF]/.test(nameA);
    const isArabicB = /[\u0600-\u06FF]/.test(nameB);
    if (isArabicA && !isArabicB) return -1;
    if (!isArabicA && isArabicB) return 1;
    const isEnglishA = /[a-zA-Z]/.test(nameA);
    const isEnglishB = /[a-zA-Z]/.test(nameB);
    if (isEnglishA && !isEnglishB) return -1;
    if (!isEnglishA && isEnglishB) return 1;
    return nameA.localeCompare(nameB, 'ar');
  });
};

// =========================================================
// ✅ إدارة الإنذارات (120 يوماً)
// =========================================================
export const getActiveWarnings = (warnings = []) => {
  const now = Date.now();
  return warnings.filter(w => {
    const issuedAt = w.issuedAt ? new Date(w.issuedAt).getTime() : 0;
    const expiresAt = w.expiresAt
      ? new Date(w.expiresAt).getTime()
      : issuedAt + WARNING_RETENTION_MS;
    return expiresAt > now;
  });
};

// =========================================================
// ✅ فحص القائمة السوداء (Blacklist)
// =========================================================
export const checkPhoneBlacklist = async (phone) => {
  if (!phone) return { blacklisted: false };
  try {
    const normalized = String(phone).replace(/[^\d]/g, '');
    const q = query(
      collection(db, 'blacklist'),
      where('phone', '==', normalized)
    );
    const snap = await getDocs(q);
    if (snap.empty) return { blacklisted: false };
    return { blacklisted: true, record: snap.docs[0].data() };
  } catch (err) {
    console.warn('Blacklist check failed:', err);
    return { blacklisted: false };
  }
};

// =========================================================
// ✅ التحقق الموحد من رقم الهاتف
// =========================================================
export const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, reason: 'empty' };
  let cleaned = String(phone).trim().replace(/[^\d]/g, '');
  if (!cleaned) return { valid: false, reason: 'empty' };
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  if (cleaned.startsWith('0')) return { valid: false, reason: 'starts_with_zero' };
  if (cleaned.length < 10 || cleaned.length > 15) return { valid: false, reason: 'invalid_length' };
  return { valid: true, phone: cleaned };
};