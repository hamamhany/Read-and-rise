import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { submitExamResult } from '../../services/exams';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  return `${m} د${s > 0 ? ` ${s} ث` : ''}`;
};

const ExamTakingModal = ({ exam, student, attemptNumber, onClose }) => {
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(exam.duration ? exam.duration * 60 : null);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef(null);
  const startTimestampRef = useRef(Date.now());

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - startTimestampRef.current) / 1000);
      setElapsed(elapsedSec);

      if (exam.duration) {
        const remaining = exam.duration * 60 - elapsedSec;
        if (remaining <= 0) {
          setTimeLeft(0);
          clearInterval(timerRef.current);
          if (!submitted) handleSubmit(true);
        } else {
          setTimeLeft(remaining);
        }
      }
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches(prev => {
          const newCount = prev + 1;
          if (newCount === 1) toast.error('⚠️ تم رصد مغادرة الصفحة! سيتم تسجيل ذلك.');
          if (newCount >= 3) {
            toast.error('❌ تم إنهاء الاختبار بسبب مغادرة الصفحة المتكررة!');
            if (!submitted) handleSubmit(true, true);
          }
          return newCount;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // eslint-disable-line

  const handleAnswer = (qId, answer) => {
    setAnswers({ ...answers, [qId]: answer });
  };

  const handleSubmit = async (autoSubmit = false, forceSubmit = false) => {
    if (submitting || submitted) return;
    if (!autoSubmit && !forceSubmit) {
      const unanswered = exam.questions.length - Object.keys(answers).length;
      const confirmMsg = unanswered > 0
        ? `لديك ${unanswered} سؤال بدون إجابة. هل أنت متأكد من تسليم الاختبار؟`
        : 'هل أنت متأكد من تسليم الاختبار؟ لن تتمكن من التعديل بعد التسليم.';
      if (!window.confirm(confirmMsg)) return;
    }

    setSubmitting(true);
    setSubmitted(true);
    clearInterval(timerRef.current);

    let score = 0;
    const detailedAnswers = exam.questions.map(q => {
      const studentAnswer = answers[q.id] ?? '';
      const normalized = String(studentAnswer).trim().toLowerCase();
      const correctNormalized = String(q.correctAnswer ?? '').trim().toLowerCase();
      const isCorrect = normalized !== '' && normalized === correctNormalized;
      if (isCorrect) score++;
      return {
        questionId: q.id || '',
        questionText: q.text || '',
        questionType: q.type || 'mcq',
        options: Array.isArray(q.options) ? q.options : [],
        studentAnswer: studentAnswer,
        correctAnswer: q.correctAnswer ?? '',
        isCorrect
      };
    });

    const timeTakenSeconds = Math.floor((Date.now() - startTimestampRef.current) / 1000);

    try {
      // ✅ جميع الحقول آمنة ومحمية
      await submitExamResult({
        examId: exam.id || '',
        examTitle: exam.title || '',
        studentId: student.id || '',
        studentName: student.name || student.username || 'طالب',
        studentSerial: student.serialNumber ?? '',
        score,
        totalQuestions: exam.questions.length,
        answers: detailedAnswers,
        tabSwitchCount: tabSwitches,
        autoSubmitted: !!autoSubmit,
        attemptNumber: attemptNumber || 1,
        timeTakenSeconds: timeTakenSeconds || 0
      });

      const percent = Math.round((score / exam.questions.length) * 100);
      toast.success(
        autoSubmit
          ? `⏱️ تم إنهاء الاختبار تلقائياً! نتيجتك: ${score}/${exam.questions.length} (${percent}%)`
          : `✅ تم التسليم! نتيجتك: ${score}/${exam.questions.length} (${percent}%)`,
        { duration: 6000 }
      );
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      console.error('Submit exam error:', err);
      toast.error('فشل حفظ النتيجة: ' + err.message);
      setSubmitting(false);
      setSubmitted(false);
    }
  };

  const formatTime = (secs) => {
    if (secs === null) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-red-500/30">
        <div className="flex justify-between items-center p-4 border-b border-gray-700 bg-gray-800 rounded-t-3xl">
          <div>
            <h3 className="text-xl font-bold text-white">{exam.title}</h3>
            <p className="text-sm text-gray-400">
              الطالب: {student.name || student.username}
              {attemptNumber > 1 && <span className="text-amber-300"> (محاولة #{attemptNumber})</span>}
            </p>
          </div>
          <div className="text-right">
            {exam.duration ? (
              <div className={`text-2xl font-mono px-4 py-2 rounded-xl border ${timeLeft < 60 ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse' : 'bg-blue-500/20 text-blue-300 border-blue-500/50'}`}>
                <FaClock className="inline me-2" /> {formatTime(timeLeft)}
              </div>
            ) : (
              <div className="text-sm font-mono px-4 py-2 rounded-xl border bg-gray-700/50 text-gray-300 border-gray-600">
                <FaClock className="inline me-2" /> مرت: {formatDuration(elapsed)}
              </div>
            )}
          </div>
        </div>

        {tabSwitches > 0 && (
          <div className="bg-red-500/20 text-red-200 text-center py-2 text-sm border-b border-red-500/30">
            ⚠️ تم رصد {tabSwitches} محاولة مغادرة للصفحة. تكرار ذلك سيؤدي لإنهاء الاختبار.
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {exam.questions.map((q, idx) => (
            <div key={q.id} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
              <p className="text-white font-bold mb-3">{idx + 1}. {q.text}</p>
              
              {q.type === 'mcq' && (
                <div className="space-y-2">
                  {q.options.filter(o => o && o.trim()).map((opt, i) => (
                    <label key={i} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${answers[q.id] === opt ? 'bg-blue-900/40 border border-blue-500/50' : 'hover:bg-gray-700'} text-gray-200`}>
                      <input type="radio" name={`q-${q.id}`} value={opt} checked={answers[q.id] === opt} onChange={() => handleAnswer(q.id, opt)} className="w-4 h-4 accent-blue-500" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'true_false' && (
                <div className="flex gap-4">
                  {['صح', 'خطأ'].map(opt => (
                    <label key={opt} className={`flex items-center gap-2 text-gray-200 p-2 rounded-lg cursor-pointer transition ${answers[q.id] === opt ? 'bg-blue-900/40 border border-blue-500/50' : 'hover:bg-gray-700'}`}>
                      <input type="radio" name={`q-${q.id}`} value={opt} checked={answers[q.id] === opt} onChange={() => handleAnswer(q.id, opt)} className="w-4 h-4 accent-blue-500" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'short_text' && (
                <input type="text" value={answers[q.id] || ''} onChange={e => handleAnswer(q.id, e.target.value)} placeholder="اكتب إجابتك هنا..." className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600" />
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-700">
          <button onClick={() => handleSubmit(false)} disabled={submitting} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold disabled:opacity-50">
            {submitting ? 'جاري التسليم...' : 'تسليم الاختبار'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamTakingModal;