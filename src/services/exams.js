import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import {
  MAX_EXAM_ATTEMPTS, EXAM_CORRECTION_MODE, EXAM_RESULT_STATUS
} from '../constants';

export { MAX_EXAM_ATTEMPTS };

// ✅ تنقية الأسئلة
const sanitizeQuestions = (questions) => {
  if (!Array.isArray(questions)) return [];
  return questions.map(q => {
    const points = Number(q.points);
    return {
      id: q.id || '',
      type: q.type || 'mcq',
      text: q.text || '',
      options: Array.isArray(q.options) ? q.options.map(o => o || '') : [],
      correctAnswer: q.correctAnswer || '',
      points: (!isNaN(points) && points > 0) ? points : 1
    };
  });
};

// ✅ ============================================================
// إنشاء اختبار جديد
// ✅ ============================================================
export const createExam = async (examData) => {
  const sanitized = {
    teacherId: examData.teacherId || '',
    title: (examData.title || '').trim(),
    duration: examData.duration ?? null,
    classIds: Array.isArray(examData.classIds) ? examData.classIds : [],
    startTime: examData.startTime ?? null,
    endTime: examData.endTime ?? null,
    correctionMode: examData.correctionMode || EXAM_CORRECTION_MODE.AUTO,
    questions: sanitizeQuestions(examData.questions),
    status: 'published',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'exams'), sanitized);
  return ref.id;
};

// ✅ ============================================================
// تحديث اختبار (سيتم استدعاء regrade بعد التحديث)
// ✅ ============================================================
export const updateExam = async (examId, examData) => {
  const sanitized = {};
  if (examData.title !== undefined) sanitized.title = (examData.title || '').trim();
  if (examData.duration !== undefined) sanitized.duration = examData.duration ?? null;
  if (examData.classIds !== undefined) sanitized.classIds = Array.isArray(examData.classIds) ? examData.classIds : [];
  if (examData.startTime !== undefined) sanitized.startTime = examData.startTime ?? null;
  if (examData.endTime !== undefined) sanitized.endTime = examData.endTime ?? null;
  if (examData.correctionMode !== undefined) sanitized.correctionMode = examData.correctionMode;
  if (examData.questions !== undefined) sanitized.questions = sanitizeQuestions(examData.questions);
  if (examData.status !== undefined) sanitized.status = examData.status;

  sanitized.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'exams', examId), sanitized);
};

// ✅ ============================================================
// حذف اختبار نهائياً + حذف جميع نتائجه
// ✅ ============================================================
export const deleteExam = async (examId) => {
  // حذف جميع النتائج المرتبطة
  const resultsSnap = await getDocs(
    query(collection(db, 'examResults'), where('examId', '==', examId))
  );
  const deletePromises = resultsSnap.docs.map(d => deleteDoc(doc(db, 'examResults', d.id)));
  await Promise.all(deletePromises);

  // حذف الاختبار نفسه
  await deleteDoc(doc(db, 'exams', examId));
};

// ✅ ============================================================
// جلب اختبارات المعلم
// ✅ ============================================================
export const getExamsByTeacher = async (teacherId) => {
  const q = query(
    collection(db, 'exams'),
    where('teacherId', '==', teacherId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ✅ ============================================================
// جلب الاختبارات المتاحة للطالب
// ✅ ============================================================
export const getActiveExamsForStudent = async (classIds) => {
  const now = new Date();
  if (!classIds || classIds.length === 0) return [];

  const q = query(
    collection(db, 'exams'),
    where('classIds', 'array-contains-any', classIds)
  );
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

// ✅ ============================================================
// تقديم نتيجة اختبار
// ✅ ============================================================
export const submitExamResult = async (resultData, exam) => {
  const isAuto = (exam.correctionMode || EXAM_CORRECTION_MODE.AUTO) === EXAM_CORRECTION_MODE.AUTO;

  let totalPoints = 0;
  let score = 0;
  let correctCount = 0;

  const cleanedAnswers = (exam.questions || []).map(q => {
    const pointValue = Number(q.points) > 0 ? Number(q.points) : 1;
    totalPoints += pointValue;

    const studentAnswer = resultData.answers?.find(a => a.questionId === q.id)?.studentAnswer ?? '';
    let isCorrect = null;

    if (isAuto) {
      const normalized = String(studentAnswer).trim().toLowerCase();
      const correctNorm = String(q.correctAnswer ?? '').trim().toLowerCase();
      isCorrect = normalized !== '' && normalized === correctNorm;
      if (isCorrect) {
        score += pointValue;
        correctCount++;
      }
    }

    return {
      questionId: q.id || '',
      questionText: q.text || '',
      questionType: q.type || 'mcq',
      options: Array.isArray(q.options) ? q.options.map(o => o || '') : [],
      studentAnswer: studentAnswer,
      correctAnswer: q.correctAnswer ?? '',
      isCorrect,
      points: pointValue,
      earnedPoints: isCorrect === true ? pointValue : 0
    };
  });

  const correctionStatus = isAuto
    ? EXAM_RESULT_STATUS.AUTO_CORRECTED
    : EXAM_RESULT_STATUS.PENDING_CORRECTION;

  const cleanedResult = {
    examId: resultData.examId || '',
    examTitle: resultData.examTitle || '',
    studentId: resultData.studentId || '',
    studentName: resultData.studentName || 'طالب',
    studentSerial: resultData.studentSerial ?? '',
    score,
    correctCount,
    totalQuestions: exam.questions.length,
    totalPoints,
    answers: cleanedAnswers,
    tabSwitchCount: typeof resultData.tabSwitchCount === 'number' ? resultData.tabSwitchCount : 0,
    autoSubmitted: !!resultData.autoSubmitted,
    attemptNumber: 1,
    timeTakenSeconds: typeof resultData.timeTakenSeconds === 'number' ? resultData.timeTakenSeconds : 0,
    correctionMode: exam.correctionMode || EXAM_CORRECTION_MODE.AUTO,
    correctionStatus,
    correctedAt: isAuto ? serverTimestamp() : null,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, 'examResults'), cleanedResult);
  return { id: ref.id, score, totalPoints, totalQuestions: exam.questions.length };
};

// ✅ ============================================================
// جلب نتائج اختبار
// ✅ ============================================================
export const getExamResults = async (examId) => {
  const q = query(collection(db, 'examResults'), where('examId', '==', examId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ✅ ============================================================
// جلب نتيجة طالب واحدة
// ✅ ============================================================
export const getStudentExamResults = async (examId, studentId) => {
  const q = query(
    collection(db, 'examResults'),
    where('examId', '==', examId),
    where('studentId', '==', studentId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getStudentExamResult = async (examId, studentId) => {
  const results = await getStudentExamResults(examId, studentId);
  if (results.length === 0) return null;
  return results[0];
};

export const getStudentAttemptsCount = async (examId, studentId) => {
  const results = await getStudentExamResults(examId, studentId);
  return results.length;
};

// ✅ ============================================================
// إعادة تصحيح جميع النتائج بعد تعديل الاختبار
// ✅ ============================================================
export const regradeExamResults = async (examId, updatedExam) => {
  const results = await getExamResults(examId);
  const updatedResults = [];
  const notifications = [];

  for (const result of results) {
    const oldScore = typeof result.score === 'number' ? result.score : 0;
    const oldStatus = result.correctionStatus || 'auto_corrected';

    let newTotalPoints = 0;
    let newScore = 0;
    let newCorrectCount = 0;

    const newAnswers = (updatedExam.questions || []).map(q => {
      const pointValue = Number(q.points) > 0 ? Number(q.points) : 1;
      newTotalPoints += pointValue;

      const existingAnswer = (result.answers || []).find(a => a.questionId === q.id);
      const studentAnswer = existingAnswer?.studentAnswer ?? '';

      let isCorrect = null;

      // إعادة تصحيح تلقائي دائمًا بناءً على الإجابة الصحيحة الجديدة
      const normalized = String(studentAnswer).trim().toLowerCase();
      const correctNorm = String(q.correctAnswer ?? '').trim().toLowerCase();
      isCorrect = normalized !== '' && normalized === correctNorm;

      if (isCorrect) {
        newScore += pointValue;
        newCorrectCount++;
      }

      return {
        questionId: q.id || '',
        questionText: q.text || '',
        questionType: q.type || 'mcq',
        options: Array.isArray(q.options) ? q.options.map(o => o || '') : [],
        studentAnswer,
        correctAnswer: q.correctAnswer ?? '',
        isCorrect,
        points: pointValue,
        earnedPoints: isCorrect ? pointValue : 0
      };
    });

    const newCorrectionStatus = updatedExam.correctionMode === EXAM_CORRECTION_MODE.MANUAL
      ? EXAM_RESULT_STATUS.PENDING_CORRECTION
      : EXAM_RESULT_STATUS.AUTO_CORRECTED;

    await updateDoc(doc(db, 'examResults', result.id), {
      answers: newAnswers,
      score: newScore,
      correctCount: newCorrectCount,
      totalPoints: newTotalPoints,
      totalQuestions: updatedExam.questions.length,
      correctionMode: updatedExam.correctionMode,
      correctionStatus: newCorrectionStatus,
      correctedAt: serverTimestamp(),
      previousScore: oldScore,
      updatedAt: serverTimestamp()
    });

    // إشعار الطالب فقط إذا تغيرت النتيجة
    if (newScore !== oldScore) {
      notifications.push({
        studentId: result.studentId,
        studentName: result.studentName,
        oldScore,
        newScore,
        total: newTotalPoints,
        examTitle: updatedExam.title
      });
    }

    updatedResults.push({
      resultId: result.id,
      oldScore,
      newScore,
      total: newTotalPoints
    });
  }

  return { updatedResults, notifications };
};

// ✅ ============================================================
// ✅ التصحيح الشخصي: المعلم يحدد صح/خطأ لكل سؤال لطالب معين
// ✅ ============================================================
export const saveManualCorrections = async (resultId, corrections) => {
  // corrections = [{ questionId, isCorrect }, ...]
  const resultRef = doc(db, 'examResults', resultId);
  const resultSnap = await getDoc(resultRef);
  if (!resultSnap.exists()) throw new Error('النتيجة غير موجودة');
  const result = resultSnap.data();

  const correctionMap = {};
  corrections.forEach(c => { correctionMap[c.questionId] = c.isCorrect; });

  const oldScore = typeof result.score === 'number' ? result.score : 0;
  const wasPending = result.correctionStatus === EXAM_RESULT_STATUS.PENDING_CORRECTION;

  let newScore = 0;
  let newCorrectCount = 0;
  let newTotalPoints = 0;

  const newAnswers = (result.answers || []).map(ans => {
    const pointValue = Number(ans.points) > 0 ? Number(ans.points) : 1;
    newTotalPoints += pointValue;

    const isCorrect = correctionMap[ans.questionId] === true;
    if (isCorrect) {
      newScore += pointValue;
      newCorrectCount++;
    }

    return {
      ...ans,
      isCorrect,
      earnedPoints: isCorrect ? pointValue : 0,
      points: pointValue
    };
  });

  await updateDoc(resultRef, {
    answers: newAnswers,
    score: newScore,
    correctCount: newCorrectCount,
    totalPoints: newTotalPoints,
    correctionStatus: EXAM_RESULT_STATUS.MANUALLY_CORRECTED,
    correctedAt: serverTimestamp(),
    previousScore: wasPending ? null : oldScore,
    updatedAt: serverTimestamp()
  });

  return {
    newScore,
    newTotalPoints,
    oldScore,
    wasPending,
    scoreChanged: newScore !== oldScore,
    studentId: result.studentId,
    studentName: result.studentName,
    examTitle: result.examTitle
  };
};