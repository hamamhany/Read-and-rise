import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp } from 'firebase/firestore';

export const MAX_EXAM_ATTEMPTS = 2;

// ✅ دالة تنقية شاملة: تحويل undefined إلى قيم آمنة، وحذف الحقول غير الصالحة
const sanitizeForFirestore = (data) => {
  const cleaned = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined) {
      cleaned[key] = '';
    } else if (value === null) {
      cleaned[key] = null;
    } else if (Array.isArray(value)) {
      // تنظيف المصفوفات من undefined
      cleaned[key] = value.map(item => {
        if (item === undefined) return '';
        if (item === null) return null;
        if (typeof item === 'object') return sanitizeForFirestore(item);
        return item;
      });
    } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      cleaned[key] = sanitizeForFirestore(value);
    } else {
      cleaned[key] = value;
    }
  });
  return cleaned;
};

// ✅ تنظيف الأسئلة قبل الحفظ (لضمان عدم وجود undefined)
const sanitizeQuestions = (questions) => {
  if (!Array.isArray(questions)) return [];
  return questions.map(q => ({
    id: q.id || '',
    type: q.type || 'mcq',
    text: q.text || '',
    options: Array.isArray(q.options) ? q.options.map(o => o || '') : [],
    correctAnswer: q.correctAnswer || ''
  }));
};

export const createExam = async (examData) => {
  const sanitized = {
    teacherId: examData.teacherId || '',
    title: (examData.title || '').trim(),
    duration: examData.duration ?? null,
    classIds: Array.isArray(examData.classIds) ? examData.classIds : [],
    startTime: examData.startTime ?? null,
    endTime: examData.endTime ?? null,
    questions: sanitizeQuestions(examData.questions),
    status: 'published',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'exams'), sanitized);
  return ref.id;
};

export const updateExam = async (examId, examData) => {
  const sanitized = {};
  if (examData.title !== undefined) sanitized.title = (examData.title || '').trim();
  if (examData.duration !== undefined) sanitized.duration = examData.duration ?? null;
  if (examData.classIds !== undefined) sanitized.classIds = Array.isArray(examData.classIds) ? examData.classIds : [];
  if (examData.startTime !== undefined) sanitized.startTime = examData.startTime ?? null;
  if (examData.endTime !== undefined) sanitized.endTime = examData.endTime ?? null;
  if (examData.questions !== undefined) sanitized.questions = sanitizeQuestions(examData.questions);
  if (examData.status !== undefined) sanitized.status = examData.status;

  sanitized.updatedAt = serverTimestamp();

  await updateDoc(doc(db, 'exams', examId), sanitized);
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

// ✅ حفظ نتيجة الاختبار مع حماية كاملة ضد undefined
export const submitExamResult = async (resultData) => {
  // تنظيف الإجابات التفصيلية (كل حقل داخلي)
  const cleanedAnswers = Array.isArray(resultData.answers)
    ? resultData.answers.map(ans => ({
        questionId: ans.questionId || '',
        questionText: ans.questionText || '',
        questionType: ans.questionType || 'mcq',
        options: Array.isArray(ans.options) ? ans.options.map(o => o || '') : [],
        studentAnswer: ans.studentAnswer ?? '',
        correctAnswer: ans.correctAnswer ?? '',
        isCorrect: !!ans.isCorrect
      }))
    : [];

  // بناء كائن نظيف بالكامل
  const cleanedResult = {
    examId: resultData.examId || '',
    examTitle: resultData.examTitle || '',
    studentId: resultData.studentId || '',
    studentName: resultData.studentName || 'طالب',
    studentSerial: resultData.studentSerial ?? '',          // ✅ آمن
    score: typeof resultData.score === 'number' ? resultData.score : 0,
    totalQuestions: typeof resultData.totalQuestions === 'number' ? resultData.totalQuestions : 0,
    answers: cleanedAnswers,
    tabSwitchCount: typeof resultData.tabSwitchCount === 'number' ? resultData.tabSwitchCount : 0,
    autoSubmitted: !!resultData.autoSubmitted,
    attemptNumber: typeof resultData.attemptNumber === 'number' ? resultData.attemptNumber : 1,
    timeTakenSeconds: typeof resultData.timeTakenSeconds === 'number' ? resultData.timeTakenSeconds : 0,
    submittedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'examResults'), cleanedResult);
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