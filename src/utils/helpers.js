import { db } from '../firebase';
import {
  doc, getDoc, collection, query, where, getDocs,
  runTransaction
} from 'firebase/firestore';
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
      if (docSnap.exists()) names[id] = docSnap.data().name;
      else names[id] = null;
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

export const checkPhoneBlacklist = async (phone) => {
  if (!phone) return { blacklisted: false };
  try {
    const normalized = String(phone).replace(/[^\d]/g, '');
    const q = query(collection(db, 'blacklist'), where('phone', '==', normalized));
    const snap = await getDocs(q);
    if (snap.empty) return { blacklisted: false };
    return { blacklisted: true, record: snap.docs[0].data() };
  } catch (err) {
    console.warn('Blacklist check failed:', err);
    return { blacklisted: false };
  }
};

export const validatePhoneNumber = (phone) => {
  if (!phone) return { valid: false, reason: 'empty' };
  let cleaned = String(phone).trim().replace(/[^\d]/g, '');
  if (!cleaned) return { valid: false, reason: 'empty' };
  if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
  if (cleaned.startsWith('0')) return { valid: false, reason: 'starts_with_zero' };
  if (cleaned.length < 10 || cleaned.length > 15) return { valid: false, reason: 'invalid_length' };
  return { valid: true, phone: cleaned };
};

// =========================================================
// ✅ الرقم التسلسلي للطالب (جديد)
// =========================================================
export const formatSerial = (num) => {
  if (num < 1000000) return String(num).padStart(6, '0');
  return String(num);
};

export const generateNextSerialNumber = async () => {
  const counterRef = doc(db, 'settings', 'studentSerialCounter');
  let serialNumber = 1;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    if (!snap.exists()) {
      transaction.set(counterRef, { lastSerial: 1 });
      serialNumber = 1;
    } else {
      serialNumber = (snap.data().lastSerial || 0) + 1;
      transaction.update(counterRef, { lastSerial: serialNumber });
    }
  });
  return serialNumber;
};

// =========================================================
// ✅ تنسيق الوقت النسبي بالعربية ("منذ كذا")
// يستخدم في الدردشة بدل عرض الساعة التقليدية.
// يتعامل مع التصريف العربي الصحيح: دقيقة/دقيقتين/دقائق/دقيقة...
// =========================================================
export const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '';

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffMs = now - date.getTime();

  // إذا كان التاريخ في المستقبل (اختلاف ساعة الجهاز مثلًا) نعرض "الآن"
  if (diffMs < 0) return 'الآن';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 5) return 'الآن';
  if (seconds < 60) return 'منذ لحظات';

  if (minutes < 60) {
    if (minutes === 1) return 'منذ دقيقة';
    if (minutes === 2) return 'منذ دقيقتين';
    if (minutes >= 3 && minutes <= 10) return `منذ ${minutes} دقائق`;
    return `منذ ${minutes} دقيقة`;
  }

  if (hours < 24) {
    if (hours === 1) return 'منذ ساعة';
    if (hours === 2) return 'منذ ساعتين';
    if (hours >= 3 && hours <= 10) return `منذ ${hours} ساعات`;
    return `منذ ${hours} ساعة`;
  }

  if (days < 30) {
    if (days === 1) return 'منذ يوم';
    if (days === 2) return 'منذ يومين';
    if (days >= 3 && days <= 10) return `منذ ${days} أيام`;
    return `منذ ${days} يوماً`;
  }

  if (weeks < 4) {
    if (weeks === 1) return 'منذ أسبوع';
    if (weeks === 2) return 'منذ أسبوعين';
    if (weeks >= 3) return `منذ ${weeks} أسابيع`;
  }

  if (months < 12) {
    if (months === 1) return 'منذ شهر';
    if (months === 2) return 'منذ شهرين';
    if (months >= 3 && months <= 10) return `منذ ${months} أشهر`;
    return `منذ ${months} شهراً`;
  }

  if (years === 1) return 'منذ سنة';
  if (years === 2) return 'منذ سنتين';
  if (years >= 3 && years <= 10) return `منذ ${years} سنوات`;
  return `منذ ${years} سنة`;
};