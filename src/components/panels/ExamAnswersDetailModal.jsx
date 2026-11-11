import React from 'react';
import { FaTimes, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ثانية`;
  return `${m} دقيقة${s > 0 ? ` و ${s} ثانية` : ''}`;
};

const ExamAnswersDetailModal = ({ isOpen, onClose, result, exam }) => {
  if (!isOpen || !result || !exam) return null;

  const questionsMap = {};
  exam.questions.forEach(q => { questionsMap[q.id] = q; });

  const answers = result.answers || [];

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[110] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-purple-500/30" onClick={e => e.stopPropagation()}>
        
        <div className="flex justify-between items-center p-5 border-b border-gray-700 bg-gray-800 rounded-t-3xl">
          <div>
            <h3 className="text-xl font-bold text-white">إجابات الطالب: {result.studentName}</h3>
            <p className="text-sm text-gray-400">
              {result.studentSerial && <span>التسلسلي: <span className="font-mono text-cyan-300" dir="ltr">{result.studentSerial}</span> | </span>}
              الدرجة: <span className="font-bold text-green-400">{result.score}/{result.totalQuestions}</span> | 
              الوقت المستغرق: <span className="text-amber-300">{formatDuration(result.timeTakenSeconds)}</span>
              {result.autoSubmitted && <span className="text-red-400 mr-2"> • تسليم تلقائي</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {answers.map((ans, idx) => {
            const question = questionsMap[ans.questionId];
            if (!question) return null;

            // MCQ / True-False: عرض الخيارات مع الألوان
            if (ans.questionType === 'mcq' || ans.questionType === 'true_false') {
              const opts = ans.options && ans.options.length > 0 ? ans.options : question.options;
              const cleanOpts = opts.filter(o => o && o.trim());

              return (
                <div key={ans.questionId} className={`p-4 rounded-xl border-2 ${ans.isCorrect ? 'bg-green-900/20 border-green-500/40' : 'bg-red-900/10 border-red-500/40'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-white font-bold flex-1">{idx + 1}. {ans.questionText || question.text}</p>
                    <span className={`ml-2 text-xl ${ans.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                      {ans.isCorrect ? <FaCheckCircle /> : <FaTimesCircle />}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cleanOpts.map((opt, i) => {
                      const isStudentChoice = ans.studentAnswer === opt;
                      const isCorrectAnswer = ans.correctAnswer === opt;

                      let boxClass = 'bg-gray-800 border-gray-600 text-gray-300';
                      if (isStudentChoice && isCorrectAnswer) {
                        // إجابة الطالب صحيحة
                        boxClass = 'bg-green-500/20 border-green-500/60 text-green-100 font-bold';
                      } else if (isStudentChoice && !isCorrectAnswer) {
                        // اختيار خاطئ
                        boxClass = 'bg-red-500/20 border-red-500/60 text-red-100 font-bold';
                      } else if (isCorrectAnswer) {
                        // الإجابة الصحيحة (غير مختارة)
                        boxClass = 'bg-green-500/10 border-green-500/40 text-green-200';
                      }

                      return (
                        <div key={i} className={`p-2 rounded-lg border ${boxClass} flex items-center gap-2`}>
                          {isStudentChoice && <span className="text-xs bg-white/20 px-2 py-0.5 rounded">اختيارك</span>}
                          {!isStudentChoice && isCorrectAnswer && <span className="text-xs bg-green-500/30 px-2 py-0.5 rounded">الإجابة الصحيحة</span>}
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

            // Short text: عرض الإجابة النصية
            if (ans.questionType === 'short_text') {
              return (
                <div key={ans.questionId} className={`p-4 rounded-xl border-2 ${ans.isCorrect ? 'bg-green-900/20 border-green-500/40' : 'bg-red-900/10 border-red-500/40'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <p className="text-white font-bold flex-1">{idx + 1}. {ans.questionText || question.text}</p>
                    <span className={`ml-2 text-xl ${ans.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                      {ans.isCorrect ? <FaCheckCircle /> : <FaTimesCircle />}
                    </span>
                  </div>

                  <div className={`p-3 rounded-lg border ${ans.isCorrect ? 'bg-green-500/20 border-green-500/60 text-green-100' : 'bg-red-500/20 border-red-500/60 text-red-100'}`}>
                    <p className="text-xs opacity-70 mb-1">إجابة الطالب:</p>
                    <p className="font-bold">{ans.studentAnswer || '(لم يجب)'}</p>
                  </div>

                  {!ans.isCorrect && (
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