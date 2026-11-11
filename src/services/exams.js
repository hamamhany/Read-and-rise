import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';

export const MAX_EXAM_ATTEMPTS = 2;

export const createExam = async (examData) => {
  const ref = await addDoc(collection(db, 'exams'), {
    ...examData,
    duration: examData.duration ?? null,
    startTime: examData.startTime ?? null,
    endTime: examData.endTime ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'published'
  });
  return ref.id;
};

export const updateExam = async (examId, examData) => {
  await updateDoc(doc(db, 'exams', examId), { ...examData, updatedAt: serverTimestamp() });
};

export const deleteExam = async (examId) => {
  await deleteDoc(doc(db, 'exams', examId));
};

export const getExamsByTeacher = async (teacherId) => {
  const q = query(collection(db, 'exams'), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getActiveExamsForStudent = async (classIds) => {
  const now = new Date();
  if (!classIds || classIds.length === 0) return [];
  
  const q = query(collection(db, 'exams'), where('classIds', 'array-contains-any', classIds));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(exam => {
    if (exam.status !== 'published') return false;
    if (exam.startTime) {
      const start = new Date(exam.startTime);
      if (!isNaN(start.getTime()) && now < start) return false;
    }
    if (exam.endTime) {
      const end = new Date(exam.endTime);
      if (!isNaN(end.getTime()) && now > end) return false;
    }
    return true;
  });
};

export const submitExamResult = async (resultData) => {
  const ref = await addDoc(collection(db, 'examResults'), {
    ...resultData,
    submittedAt: serverTimestamp()
  });
  return ref.id;
};

export const getExamResults = async (examId) => {
  const q = query(collection(db, 'examResults'), where('examId', '==', examId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getStudentExamResults = async (examId, studentId) => {
  const q = query(collection(db, 'examResults'), where('examId', '==', examId), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getStudentExamResult = async (examId, studentId) => {
  const results = await getStudentExamResults(examId, studentId);
  if (results.length === 0) return null;
  return results.reduce((best, current) => current.score > best.score ? current : best, results[0]);
};

export const getStudentAttemptsCount = async (examId, studentId) => {
  const results = await getStudentExamResults(examId, studentId);
  return results.length;
};