// src/services/teacherHistory.js
// سجل التغييرات على حسابات المعلمين (تكليف / إعفاء) — يُقرأ فقط عند الطلب (تحميل كسول)
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

export const TEACHER_HISTORY_COLLECTION = 'teacherHistory';

export const TEACHER_EVENT_LABELS = {
  assigned: 'تكليف بشعبة',
  relieved: 'إعفاء من شعبة'
};

export const logTeacherEvent = async ({ teacherId, type, classId, className, byId, byName, reason }) => {
  if (!teacherId) return;
  try {
    await addDoc(collection(db, TEACHER_HISTORY_COLLECTION), {
      teacherId,
      type, // 'assigned' | 'relieved'
      classId: classId || '',
      className: className || '',
      byId: byId || '',
      byName: byName || '',
      reason: reason || '',
      at: serverTimestamp()
    });
  } catch (e) {
    console.warn('teacher history log failed:', e);
  }
};

export const getTeacherHistory = async (teacherId) => {
  const snap = await getDocs(query(collection(db, TEACHER_HISTORY_COLLECTION), where('teacherId', '==', teacherId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
};

// آخر إعفاء لكل معلم من مجموعة (دفعات من 30 بسبب حد in)
export const getLastReliefMap = async (teacherIds) => {
  const map = {};
  for (let i = 0; i < teacherIds.length; i += 30) {
    const chunk = teacherIds.slice(i, i + 30);
    const snap = await getDocs(query(
      collection(db, TEACHER_HISTORY_COLLECTION),
      where('teacherId', 'in', chunk),
      where('type', '==', 'relieved')
    ));
    snap.docs.forEach(d => {
      const v = d.data();
      const sec = v.at?.seconds || 0;
      if (!map[v.teacherId] || sec > (map[v.teacherId].at?.seconds || 0)) map[v.teacherId] = v;
    });
  }
  return map;
};
