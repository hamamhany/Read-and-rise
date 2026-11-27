// src/services/nextLesson.js
// ✅ "الحصة القادمة" العامة محفوظة في مستند واحد: settings/globalNextLesson
//    - المعلم عند حفظ مواعيده يرسل أقرب موعد عنده، والمستند يتحدّث فقط إن كان أقرب من المحفوظ.
//    - المدير يقرأ هذا المستند الواحد بدل قراءة كل مستندات المعلمين.
//    - إذا صار المستند قديماً أو ملغى، يعيد المدير بناءه مرة واحدة (انظر SystemManagerPanel).
import { db } from '../firebase';
import { doc, runTransaction, deleteDoc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getNextLessonFromTimes } from '../utils/helpers';

const REF = () => doc(db, 'settings', 'globalNextLesson');

export const readGlobalNextLesson = async () => {
  const snap = await getDoc(REF());
  if (!snap.exists()) return null;
  const d = snap.data();
  return d?.at ? { at: d.at, teacherId: d.teacherId || '' } : null;
};

export const writeGlobalNextLesson = async (atMs, teacherId) => {
  await setDoc(REF(), { at: atMs, teacherId: teacherId || '', updatedAt: serverTimestamp() });
};

/**
 * يُستدعى من لوحة المعلم بعد أي تعديل على المواعيد. لا يرمي أخطاء (يفشل بصمت).
 */
export const syncGlobalNextLesson = async (teacherId, lessonTimes) => {
  try {
    const mineDate = getNextLessonFromTimes(lessonTimes || []);
    const mine = mineDate ? mineDate.getTime() : null;
    const now = Date.now();

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(REF());
      const stored = snap.exists() ? snap.data() : null;
      const storedValid = stored && stored.at && stored.at > now;

      // لا يوجد محفوظ صالح → لا نخمّن؛ المدير سيعيد البناء عند فتحه
      if (!storedValid) return;

      if (mine !== null && mine < stored.at) {
        // موعدي أقرب → احفظه
        tx.set(REF(), { at: mine, teacherId, updatedAt: serverTimestamp() });
      } else if (stored.teacherId === teacherId && (mine === null || mine !== stored.at)) {
        // المحفوظ كان لي وتغيّر/أُلغي → المحفوظ لم يعد موثوقاً، يُحذف ليُعاد بناؤه
        tx.delete(REF());
      }
      // غير ذلك: موعدي ليس أقرب → لا شيء
    });
  } catch (e) {
    console.warn('syncGlobalNextLesson failed:', e);
  }
};

export const invalidateGlobalNextLesson = async () => {
  try { await deleteDoc(REF()); } catch (e) { /* ignore */ }
};