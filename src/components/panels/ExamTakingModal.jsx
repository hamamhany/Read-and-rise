import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FaClock, FaExclamationTriangle } from 'react-icons/fa';
import { submitExamResult } from '../../services/exams';

const ExamTakingModal = ({ exam, student, onClose }) => {
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(exam.duration * 60);
  const [submitting, setSubmitting] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleSubmit(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setTabSwitches(prev => {
          const newCount = prev + 1;
          if (newCount === 1) toast.error('⚠️ تم رصد مغادرة الصفحة! سيتم تسجيل ذلك.');
          if (newCount >= 3) {
            toast.error('❌ تم إنهاء الاختبار بسبب مغادرة الصفحة المتكررة!');
            handleSubmit(true);
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

  const handleSubmit = async (autoSubmit = false) => {
    if (submitting) return;
    setSubmitting(true);
    clearInterval(timerRef.current);

    let score = 0;
    const detailedAnswers = exam.questions.map(q => {
      const studentAnswer = answers[q.id] || '';
      const isCorrect = studentAnswer.toString().trim() === q.correctAnswer.toString().trim();
      if (isCorrect) score++;
      return { questionId: q.id, studentAnswer, isCorrect };
    });

    try {
      await submitExamResult({
        examId: exam.id,
        examTitle: exam.title,
        studentId: student.id,
        studentName: student.name,
        studentSerial: student.serialNumber,
        score,
        totalQuestions: exam.questions.length,
        answers: detailedAnswers,
        tabSwitchCount: tabSwitches,
        autoSubmitted: autoSubmit
      });
      toast.success(autoSubmit ? 'تم إنهاء الاختبار تلقائياً!' : 'تم تسليم الاختبار بنجاح!');
      onClose();
    } catch (err) {
      toast.error('فشل حفظ النتيجة: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (secs) => {
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
            <p className="text-sm text-gray-400">الطالب: {student.name}</p>
          </div>
          <div className={`text-2xl font-mono px-4 py-2 rounded-xl border ${timeLeft < 60 ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse' : 'bg-blue-500/20 text-blue-300 border-blue-500/50'}`}>
            <FaClock className="inline me-2" /> {formatTime(timeLeft)}
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
                  {q.options.filter(o => o.trim()).map((opt, i) => (
                    <label key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 cursor-pointer text-gray-200">
                      <input type="radio" name={`q-${q.id}`} value={opt} onChange={() => handleAnswer(q.id, opt)} className="w-4 h-4 accent-blue-500" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'true_false' && (
                <div className="flex gap-4">
                  {['صح', 'خطأ'].map(opt => (
                    <label key={opt} className="flex items-center gap-2 text-gray-200 p-2 rounded-lg hover:bg-gray-700 cursor-pointer">
                      <input type="radio" name={`q-${q.id}`} value={opt} onChange={() => handleAnswer(q.id, opt)} className="w-4 h-4 accent-blue-500" />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'short_text' && (
                <input type="text" placeholder="اكتب إجابتك هنا..." onChange={e => handleAnswer(q.id, e.target.value)} className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600" />
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