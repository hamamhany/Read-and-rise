import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { FaClock, FaTimes } from 'react-icons/fa';
import { submitExamResult } from '../../services/exams';
import { useConfirm } from '../common/ConfirmContext';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  return `${m} د${s > 0 ? ` ${s} ث` : ''}`;
};

const ExamTakingModal = ({ exam, student, onClose }) => {
  const confirm = useConfirm();
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
          if (!submitted) handleSubmit(true, true);
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
    // eslint-disable-next-line
  }, []);

  const handleAnswer = (qId, answer) => {
    setAnswers({ ...answers, [qId]: answer });
  };

  const handleSubmit = async (autoSubmit = false, forceSubmit = false) => {
    if (submitting || submitted) return;

    if (!autoSubmit && !forceSubmit) {
      const unanswered = exam.questions.length - Object.keys(answers).length;
      const msg = unanswered > 0
        ? `لديك ${unanswered} سؤال بدون إجابة.\nهل أنت متأكد من تسليم الاختبار؟\nلن تتمكن من التعديل أو إعادة المحاولة بعد التسليم.`
        : 'هل أنت متأكد من تسليم الاختبار؟\nلن تتمكن من التعديل أو إعادة المحاولة بعد التسليم.';
      const ok = await confirm('تأكيد التسليم', msg);
      if (!ok) return;
    }

    setSubmitting(true);
    setSubmitted(true);
    clearInterval(timerRef.current);

    const timeTakenSeconds = Math.floor((Date.now() - startTimestampRef.current) / 1000);

    try {
      const detailedAnswers = exam.questions.map(q => ({
        questionId: q.id || '',
        studentAnswer: answers[q.id] ?? ''
      }));

      const result = await submitExamResult(
        {
          examId: exam.id || '',
          examTitle: exam.title || '',
          studentId: student.id || '',
          studentName: student.name || student.username || 'طالب',
          studentSerial: student.serialNumber ?? '',
          answers: detailedAnswers,
          tabSwitchCount: tabSwitches,
          autoSubmitted: !!autoSubmit,
          timeTakenSeconds: timeTakenSeconds || 0
        },
        exam
      );

      const isManual = (exam.correctionMode || 'auto') === 'manual';

      if (isManual) {
        toast.success(
          `✅ تم تسليم الاختبار!\nسيتم تصحيحه من قِبل المعلم قريباً.`,
          { duration: 5000 }
        );
      } else {
        const percent = result.totalPoints > 0 ? Math.round((result.score / result.totalPoints) * 100) : 0;
        toast.success(
          autoSubmit
            ? `⏱️ تم إنهاء الاختبار تلقائياً!\nنتيجتك: ${result.score}/${result.totalPoints} (${percent}%)`
            : `✅ تم التسليم!\nنتيجتك: ${result.score}/${result.totalPoints} (${percent}%)`,
          { duration: 6000 }
        );
      }
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
    <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
      <div className="min-h-screen flex flex-col max-w-3xl mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-blue-500/40 p-4 shadow-xl">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{exam.title}</h2>
              <p className="text-sm text-gray-400">
                الطالب: {student.name || student.username}
              </p>
            </div>
            <div className="text-right">
              {exam.duration ? (
                <div className={`text-2xl font-mono px-4 py-2 rounded-xl border ${
                  timeLeft < 60
                    ? 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse'
                    : 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                }`}>
                  <FaClock className="inline me-2" /> {formatTime(timeLeft)}
                </div>
              ) : (
                <div className="text-sm font-mono px-4 py-2 rounded-xl border bg-gray-700/50 text-gray-300 border-gray-600">
                  <FaClock className="inline me-2" /> مرت: {formatDuration(elapsed)}
                </div>
              )}
            </div>
          </div>
        </div>

        {tabSwitches > 0 && (
          <div className="bg-red-500/20 text-red-200 text-center py-2 text-sm border-b border-red-500/30">
            ⚠️ تم رصد {tabSwitches} محاولة مغادرة للصفحة. تكرار ذلك سيؤدي لإنهاء الاختبار.
          </div>
        )}

        <div className="flex-1 p-4 md:p-6 space-y-5">
          {exam.questions.map((q, idx) => (
            <div key={q.id} className="bg-gray-900 p-4 rounded-2xl border-2 border-gray-700">
              <div className="flex justify-between items-start mb-3 gap-2">
                <p className="text-white font-bold flex-1 text-base">
                  {idx + 1}. {q.text}
                </p>
                <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                  {Number(q.points) || 1} علامة
                </span>
              </div>

              {q.type === 'mcq' && (
                <div className="space-y-2">
                  {q.options.filter(o => o && o.trim()).map((opt, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                        answers[q.id] === opt
                          ? 'bg-blue-900/40 border-2 border-blue-500/60 text-white'
                          : 'bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleAnswer(q.id, opt)}
                        className="w-5 h-5 accent-blue-500"
                      />
                      <span className="flex-1">{opt}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'true_false' && (
                <div className="grid grid-cols-2 gap-3">
                  {['صح', 'خطأ'].map(opt => (
                    <label
                      key={opt}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer transition font-bold ${
                        answers[q.id] === opt
                          ? 'bg-blue-900/40 border-2 border-blue-500/60 text-white'
                          : 'bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => handleAnswer(q.id, opt)}
                        className="w-4 h-4 accent-blue-500"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {q.type === 'short_text' && (
                <input
                  type="text"
                  value={answers[q.id] || ''}
                  onChange={e => handleAnswer(q.id, e.target.value)}
                  placeholder="اكتب إجابتك هنا..."
                  className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none"
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-900 border-t-2 border-gray-700 p-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-3 rounded-xl font-bold"
          >
            <FaTimes className="inline me-2" /> إلغاء
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold"
          >
            {submitting ? 'جاري التسليم...' : 'تسليم الاختبار'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamTakingModal;