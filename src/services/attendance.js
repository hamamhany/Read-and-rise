// src/services/attendance.js
import { db } from '../firebase';
import {
  doc, getDoc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { createMessageRequest } from './messageRequests';
import {
  MESSAGE_REQUEST_TYPES,
  ABSENCE_WARNING_THRESHOLD,
  ABSENCE_FREEZE_THRESHOLD
} from '../constants';

// حساب عدد الحصص المجدولة بين تاريخين
export const countLessonsBetween = (startDate, endDate, lessonTimes) => {
  if (!lessonTimes || lessonTimes.length === 0) return 0;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;

  let count = 0;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  for (const lt of lessonTimes) {
    if (!lt || !lt.time) continue;
    if (typeof lt.time.hours !== 'number' || typeof lt.time.minutes !== 'number') continue;

    if (lt.type === 'once') {
      const d = new Date(lt.date);
      if (isNaN(d.getTime())) continue;
      d.setHours(lt.time.hours, lt.time.minutes, 0, 0);
      if (d.getTime() > start && d.getTime() <= end) count++;
    } else if (lt.type === 'recurring') {
      const dayIndex = days.indexOf(lt.day);
      if (dayIndex === -1) continue;
      let cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      while (cur <= endDay) {
        if (cur.getDay() === dayIndex) {
          const t = new Date(cur);
          t.setHours(lt.time.hours, lt.time.minutes, 0, 0);
          if (t.getTime() > start && t.getTime() <= end) count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else if (lt.type === 'monthly') {
      const md = parseInt(lt.monthDay);
      if (!md) continue;
      let cur = new Date(start);
      cur.setDate(1);
      const endDay = new Date(end);
      while (cur <= endDay) {
        const t = new Date(cur.getFullYear(), cur.getMonth(), md, lt.time.hours, lt.time.minutes, 0, 0);
        if (t.getTime() > start && t.getTime() <= end) count++;
        cur.setMonth(cur.getMonth() + 1);
      }
    }
  }
  return count;
};

// ✅ تسجيل الحضور (زر الانضمام)
export const recordAttendance = async (studentId) => {
  await updateDoc(doc(db, 'profiles', studentId), {
    lastAttendanceAt: serverTimestamp(),
    consecutiveAbsences: 0,
    absenceWarningSent: false,
    updatedAt: serverTimestamp()
  });
};

// ✅ معالجة الغياب تلقائياً عند تحميل لوحة الطالب
export const processStudentAbsences = async (studentId, lessonTimes) => {
  const docRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.isFrozen) return; // مجمد بالفعل

  const lastAtt = data.lastAttendanceAt?.toDate?.() || null;
  if (!lastAtt) {
    await updateDoc(docRef, {
      lastAttendanceAt: serverTimestamp(),
      consecutiveAbsences: 0
    });
    return;
  }

  const absences = countLessonsBetween(lastAtt, new Date(), lessonTimes);
  const updates = { consecutiveAbsences: absences };

  // ✅ 10 حصص → إنذار
  if (absences >= ABSENCE_WARNING_THRESHOLD && !data.absenceWarningSent) {
    updates.absenceWarningSent = true;
    updates.absenceWarningAt = serverTimestamp();
    await createMessageRequest({
      type: MESSAGE_REQUEST_TYPES.ABSENCE_WARNING,
      targetType: 'student',
      targetId: studentId,
      targetName: data.name || '',
      targetPhone: data.phone || '',
      targetClass: '',
      requestedBy: 'system',
      requestedByName: 'النظام التلقائي',
      payload: { absenceCount: absences }
    });
  }

  // ✅ 13 حصة → تجميد تلقائي
  if (absences >= ABSENCE_FREEZE_THRESHOLD && !data.isFrozen) {
    updates.isFrozen = true;
    updates.frozenAt = serverTimestamp();
    updates.freezeReason = 'تجاوز 13 حصة غياب متتالية';
    await createMessageRequest({
      type: MESSAGE_REQUEST_TYPES.AUTO_FREEZE,
      targetType: 'student',
      targetId: studentId,
      targetName: data.name || '',
      targetPhone: data.phone || '',
      targetClass: '',
      requestedBy: 'system',
      requestedByName: 'النظام التلقائي',
      payload: { autoFreeze: true, absenceCount: absences }
    });
  }

  await updateDoc(docRef, updates);
};