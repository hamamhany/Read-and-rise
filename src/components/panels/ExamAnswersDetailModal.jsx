import React from 'react';
import { FaTimes, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ثانية`;
  return `${m} دقيقة${s > 0 ? ` و ${s} ثانية` : ''}`;
};

const ExamAnswersDetailModal = ({ isOpen, onClose, result, exam, viewerMode = 'teacher' }) => {
  if (!isOpen || !result || !exam) return null;

  const questionsMap = {};
  exam.questions.forEach(q => { questionsMap[q.id] = q; });

  const answers = result.answers || [];
  const isStudent = viewerMode === 'student';
  const labelChoice = isStudent ? 'إجابتك' : 'اختيار الطالب';

  return (
    <div className="fixed inset-0 z-[110] bg-gray-950 overflow-y-auto" dir="rtl">
      <div className="min-h-screen flex flex-col max-w-3xl mx-auto">
        <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-purple-500/40 p-4 shadow-xl">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-xl font-bold text-white">
                {isStudent ? 'مراجعة إجاباتك' : `إجابات الطالب: ${result.studentName}`}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {result.studentSerial && (
                  <span>التسلسلي: <span className="font-mono text-cyan-300" dir="ltr">{result.studentSerial}</span> | </span>
                )}
                الدرجة: <span className="font-bold text-green-400">{result.score}/{result.totalPoints || result.totalQuestions}</span>
                {result.timeTakenSeconds !== undefined && (
                  <> | الوقت: <span className="text-amber-300">{formatDuration(result.timeTakenSeconds)}</span></>
                )}
                {result.autoSubmitted && <span className="text-red-400 mr-2"> • تسليم تلقائي</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
              <FaTimes />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4">
          {answers.map((ans, idx) => {
            const question = questionsMap[ans.questionId];
            if (!question) return null;

            const qPoints = Number(ans.points) || Number(question.points) || 1;

            // MCQ / True-False
            if (ans.questionType === 'mcq' || ans.questionType === 'true_false') {
              const opts = ans.options && ans.options.length > 0 ? ans.options : question.options;
              const cleanOpts = opts.filter(o => o && o.trim());

              return (
                <div
                  key={ans.questionId}
                  className={`p-4 rounded-xl border-2 ${
                    ans.isCorrect === true ? 'bg-green-900/20 border-green-500/40' :
                    ans.isCorrect === false ? 'bg-red-900/10 border-red-500/40' :
                    'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-white font-bold flex-1">
                      {idx + 1}. {ans.questionText || question.text}
                    </p>
                    <span className="mx-2 text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                      {qPoints} علامة
                    </span>
                    {ans.isCorrect === true && <FaCheckCircle className="text-green-400 text-xl flex-shrink-0" />}
                    {ans.isCorrect === false && <FaTimesCircle className="text-red-400 text-xl flex-shrink-0" />}
                    {ans.isCorrect === null && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded flex-shrink-0">
                        ⏳ قيد التصحيح
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {cleanOpts.map((opt, i) => {
                      const isStudentChoice = ans.studentAnswer === opt;
                      const isCorrectAnswer = ans.correctAnswer === opt;

                      let boxClass = 'bg-gray-800 border-gray-600 text-gray-300';
                      let badge = null;

                      if (isStudentChoice && isCorrectAnswer) {
                        boxClass = 'bg-green-500/20 border-green-500/60 text-green-100 font-bold';
                        badge = { text: labelChoice, color: 'bg-green-500/40' };
                      } else if (isStudentChoice && !isCorrectAnswer) {
                        boxClass = 'bg-red-500/20 border-red-500/60 text-red-100 font-bold';
                        badge = { text: labelChoice, color: 'bg-red-500/40' };
                      } else if (isCorrectAnswer && ans.correctAnswer) {
                        boxClass = 'bg-green-500/10 border-green-500/40 text-green-200';
                        badge = { text: 'الإجابة الصحيحة', color: 'bg-green-500/30' };
                      }

                      return (
                        <div key={i} className={`p-2.5 rounded-lg border ${boxClass} flex items-center gap-2`}>
                          {badge && (
                            <span className={`text-[10px] ${badge.color} px-2 py-0.5 rounded`}>
                              {badge.text}
                            </span>
                          )}
                          <span className="flex-1">{opt}</span>
                          {isStudentChoice && isCorrectAnswer && <FaCheckCircle className="text-green-400" />}
                          {isStudentChoice && !isCorrectAnswer && <FaTimesCircle className="text-red-400" />}
                        </div>
                      );
                    })}

                    {!ans.studentAnswer && (
                      <p className="text-xs text-red-300 bg-red-500/10 p-2 rounded border border-red-500/30">
                        ⚠️ لم يجب الطالب على هذا السؤال
                      </p>
                    )}
                  </div>
                </div>
              );
            }

            // Short text
            if (ans.questionType === 'short_text') {
              return (
                <div
                  key={ans.questionId}
                  className={`p-4 rounded-xl border-2 ${
                    ans.isCorrect === true ? 'bg-green-900/20 border-green-500/40' :
                    ans.isCorrect === false ? 'bg-red-900/10 border-red-500/40' :
                    'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-white font-bold flex-1">
                      {idx + 1}. {ans.questionText || question.text}
                    </p>
                    <span className="mx-2 text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                      {qPoints} علامة
                    </span>
                    {ans.isCorrect === true && <FaCheckCircle className="text-green-400 text-xl" />}
                    {ans.isCorrect === false && <FaTimesCircle className="text-red-400 text-xl" />}
                  </div>

                  <div
                    className={`p-3 rounded-lg border ${
                      ans.isCorrect === true
                        ? 'bg-green-500/20 border-green-500/60 text-green-100'
                        : ans.isCorrect === false
                        ? 'bg-red-500/20 border-red-500/60 text-red-100'
                        : 'bg-gray-800 border-gray-600 text-gray-200'
                    }`}
                  >
                    <p className="text-xs opacity-70 mb-1">{labelChoice}:</p>
                    <p className="font-bold">{ans.studentAnswer || '(لم يجب)'}</p>
                  </div>

                  {ans.isCorrect === false && ans.correctAnswer && (
                    <div className="mt-2 p-3 rounded-lg border bg-green-500/10 border-green-500/40 text-green-200">
                      <p className="text-xs opacity-70 mb-1">الإجابة الصحيحة:</p>
                      <p className="font-bold">{ans.correctAnswer}</p>
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
};

export default ExamAnswersDetailModal;