import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { WARNING_RETENTION_MS, MAX_WARNINGS } from '../constants';
import { generateId } from '../utils/helpers';

export const getActiveWarnings = (warnings = []) => {
  const now = Date.now();
  return warnings.filter(w => {
    const issuedAt = w.issuedAt ? new Date(w.issuedAt).getTime() : 0;
    const expiresAt = w.expiresAt ? new Date(w.expiresAt).getTime() : issuedAt + WARNING_RETENTION_MS;
    return expiresAt > now;
  });
};

export const cleanExpiredWarnings = async (studentId, currentWarnings = []) => {
  const active = getActiveWarnings(currentWarnings);
  if (active.length !== currentWarnings.length) {
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        warnings: active,
        updatedAt: serverTimestamp()
      });
    } catch (e) { console.warn('clean warnings failed:', e.message); }
  }
  return active;
};

export const issueWarning = async (studentId, description) => {
  const studentRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(studentRef);
  if (!snap.exists) throw new Error('الطالب غير موجود');

  const existing = getActiveWarnings(snap.data().warnings || []);
  if (existing.length >= MAX_WARNINGS) {
    throw new Error(`لا يمكن إصدار إنذار رابع. الطالب لديه ${existing.length} إنذارات نشطة.`);
  }

  const warningNumber = existing.length + 1;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + WARNING_RETENTION_MS);

  const newWarning = {
    id: generateId(),
    type: warningNumber,
    description,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  const newWarnings = [...existing, newWarning];
  await updateDoc(studentRef, {
    warnings: newWarnings,
    updatedAt: serverTimestamp()
  });

  return { warningNumber, warnings: newWarnings };
};