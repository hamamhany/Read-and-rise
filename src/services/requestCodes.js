// src/services/requestCodes.js
// رمز تسلسلي لكل طلب تعديل بيانات + أدوات البحث عن الطلب بالرمز
import { db } from '../firebase';
import { doc, runTransaction, collection, query, where, getDocs } from 'firebase/firestore';

export const REQUEST_CODE_PREFIX = 'REQ-';
const COUNTER_START = 1000;

// الحقول الإضافية داخل pendingChanges (ليست تعديلات فعلية)
export const PENDING_META_KEYS = ['submittedAt', 'submittedBy', 'submittedByName', 'requestCode'];

export const stripMeta = (pending) => {
  const out = {};
  Object.entries(pending || {}).forEach(([k, v]) => {
    if (!PENDING_META_KEYS.includes(k)) out[k] = v;
  });
  return out;
};

// يقبل "REQ-1005" أو "req1005" أو "1005"
export const normalizeRequestCode = (input) => {
  const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return REQUEST_CODE_PREFIX + raw;
  if (raw.startsWith('REQ') && !raw.startsWith('REQ-')) return REQUEST_CODE_PREFIX + raw.slice(3);
  return raw;
};

const randomFallbackCode = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return REQUEST_CODE_PREFIX + s;
};

// رقم تسلسلي (REQ-1001, REQ-1002 ...) من عدّاد في Firestore.
// إن منعت قواعد الأمان الكتابة على العدّاد نستخدم رمزاً عشوائياً فريداً حتى لا يتعطل الطلب.
export const generateRequestCode = async () => {
  try {
    const ref = doc(db, 'settings', 'requestCounter');
    let next = COUNTER_START + 1;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const last = snap.exists() ? (Number(snap.data().last) || COUNTER_START) : COUNTER_START;
      next = last + 1;
      tx.set(ref, { last: next }, { merge: true });
    });
    return REQUEST_CODE_PREFIX + next;
  } catch (e) {
    console.warn('requestCounter غير متاح، استخدام رمز عشوائي:', e.message);
    return randomFallbackCode();
  }
};

// يضيف/يحدّث طلباً في سجل طلبات الطالب (آخر 10 طلبات)
export const upsertHistory = (history, entry) => {
  const list = Array.isArray(history) ? [...history] : [];
  const i = list.findIndex((r) => r.code === entry.code);
  if (i >= 0) list[i] = { ...list[i], ...entry };
  else list.push(entry);
  return list.slice(-10);
};

// البحث عن طلب برمزه: يرجع [{ student, request }]
export const findChangeRequestsByCode = async (rawCode) => {
  const code = normalizeRequestCode(rawCode);
  if (!code) return [];
  const found = new Map();
  const run = async (q) => {
    try {
      const snap = await getDocs(q);
      snap.docs.forEach((d) => found.set(d.id, { id: d.id, ...d.data() }));
    } catch (e) { console.warn('بحث الطلب:', e.message); }
  };
  await run(query(collection(db, 'profiles'), where('changeRequestCodes', 'array-contains', code)));
  await run(query(collection(db, 'profiles'), where('pendingChanges.requestCode', '==', code)));

  const results = [];
  found.forEach((student) => {
    const hist = (student.changeRequests || []).find((r) => r.code === code);
    const pend = student.pendingChanges && student.pendingChanges.requestCode === code ? student.pendingChanges : null;
    let request = null;
    if (pend) {
      request = {
        code, status: 'pending', submittedAt: pend.submittedAt || null,
        changes: stripMeta(pend), accelerated: !!student.pendingChangesAccelerated
      };
    } else if (hist) {
      request = hist;
    }
    if (request) results.push({ student, request });
  });
  return results;
};