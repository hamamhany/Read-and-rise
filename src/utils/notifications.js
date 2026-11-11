import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

export const sendNotificationToStudents = async (classIds, title, body, type, relatedId = null) => {
  if (!classIds || classIds.length === 0) return;
  try {
    const q = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const snapshot = await getDocs(q);
    const students = snapshot.docs.filter(doc => {
      const data = doc.data();
      return (data.classIds || []).some(id => classIds.includes(id));
    });

    for (const studentDoc of students) {
      const studentId = studentDoc.id;
      const notification = {
        title, body, type, relatedId,
        createdAt: serverTimestamp(),
        read: false, readAt: null
      };
      await setDoc(doc(collection(db, 'notifications', studentId, 'userNotifications')), notification);
    }
  } catch (err) {
    console.error('Error sending notifications:', err);
  }
};

export const sendNotificationToAllStudents = async (title, body, type, relatedId = null) => {
  try {
    const q = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const snapshot = await getDocs(q);
    for (const docSnap of snapshot.docs) {
      const studentId = docSnap.id;
      const notification = {
        title, body, type, relatedId,
        createdAt: serverTimestamp(),
        read: false, readAt: null
      };
      await setDoc(doc(collection(db, 'notifications', studentId, 'userNotifications')), notification);
    }
  } catch (err) {
    console.error('Error sending notification to all:', err);
  }
};

export const sendNotificationToTeacher = async (teacherId, title, body, type, relatedId = null) => {
  if (!teacherId) return;
  try {
    const notification = {
      title, body, type, relatedId,
      createdAt: serverTimestamp(),
      read: false, readAt: null
    };
    await setDoc(doc(collection(db, 'notifications', teacherId, 'userNotifications')), notification);
  } catch (err) {
    console.error('Error sending notification to teacher:', err);
  }
};

// ✅ إشعار تصحيح/تعديل الاختبار للطالب
export const sendExamCorrectionNotification = async (studentId, examTitle, newScore, totalPoints, oldScore, wasPending) => {
  if (!studentId) return;
  try {
    let body;
    if (wasPending) {
      body = `تم تصحيح اختبارك "${examTitle}" وحصلت على: ${newScore} من ${totalPoints}.\nيمكنك مراجعة إجاباتك الآن.`;
    } else if (newScore > oldScore) {
      const diff = newScore - oldScore;
      body = `لقد تم تصحيح إجابات الاختبار "${examTitle}".\nحصلت على: ${newScore} من ${totalPoints}.\nوحصلت على ${diff} علامة إضافية بعد التصحيح.`;
    } else if (newScore < oldScore) {
      const diff = oldScore - newScore;
      body = `تم تعديل تصحيح الاختبار "${examTitle}".\nعلامتك الجديدة: ${newScore} من ${totalPoints}.\n(تم خصم ${diff} علامة بعد التصحيح)`;
    } else {
      body = `تم تحديث تصحيح اختبار "${examTitle}".\nعلامتك: ${newScore} من ${totalPoints}.`;
    }

    const notification = {
      title: '✅ تم تصحيح اختبارك',
      body,
      type: 'exam_correction',
      relatedId: null,
      createdAt: serverTimestamp(),
      read: false, readAt: null
    };
    await setDoc(doc(collection(db, 'notifications', studentId, 'userNotifications')), notification);
  } catch (err) {
    console.error('Error sending exam correction notification:', err);
  }
};