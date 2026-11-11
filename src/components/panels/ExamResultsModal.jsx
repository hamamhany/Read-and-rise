import React, { useState, useEffect } from 'react';
import { FaTimes, FaSpinner, FaEye } from 'react-icons/fa';
import { getExamResults } from '../../services/exams';
import ExamAnswersDetailModal from './ExamAnswersDetailModal';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  return `${m}د${s > 0 ? ` ${s}ث` : ''}`;
};

const ExamResultsModal = ({ isOpen, onClose, exam }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exploringResult, setExploringResult] = useState(null);

  useEffect(() => {
    if (isOpen && exam) loadResults();
  }, [isOpen, exam]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getExamResults(exam.id);
      // تجميع حسب الطالب — نأخذ أفضل محاولة
      const byStudent = {};
      data.forEach(r => {
        if (!byStudent[r.studentId] || r.score > byStudent[r.studentId].score) {
          byStudent[r.studentId] = r;
        }
      });
      const grouped = Object.values(byStudent).map(r => {
        const attempts = data.filter(x => x.studentId === r.studentId).length;
        return { ...r, totalAttempts: attempts };
      });
      grouped.sort((a, b) => b.score - a.score);
      setResults(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-gray-700">
          <div className="flex justify-between items-center p-5 border-b border-gray-700">
            <div>
              <h3 className="text-xl font-bold text-white">نتائج: {exam.title}</h3>
              <p className="text-xs text-gray-400 mt-1">
                {exam.duration ? `المدة: ${exam.duration} دقيقة` : 'بدون مؤقت'} | عدد الأسئلة: {exam.questions?.length || 0}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="text-center py-8"><FaSpinner className="animate-spin text-3xl text-gray-400" /></div>
            ) : results.length === 0 ? (
              <p className="text-gray-400 text-center py-8">لم يتقدم أي طالب لهذا الاختبار بعد.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-gray-800 text-gray-300 sticky top-0">
                    <tr>
                      <th className="p-2 border border-gray-700">#</th>
                      <th className="p-2 border border-gray-700">اسم الطالب</th>
                      <th className="p-2 border border-gray-700">الرقم التسلسلي</th>
                      <th className="p-2 border border-gray-700">الوقت المستغرق</th>
                      <th className="p-2 border border-gray-700">العلامة</th>
                      <th className="p-2 border border-gray-700">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const percent = Math.round((r.score / r.totalQuestions) * 100);
                      return (
                        <tr key={r.id} className="hover:bg-gray-800/50">
                          <td className="p-2 border border-gray-700 text-gray-300">{i + 1}</td>
                          <td className="p-2 border border-gray-700 text-white">
                            {r.studentName}
                            {r.totalAttempts > 1 && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded mr-2">
                                أفضل من {r.totalAttempts} محاولات
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-gray-700 text-cyan-300 font-mono text-xs" dir="ltr">{r.studentSerial || '—'}</td>
                          <td className="p-2 border border-gray-700 text-gray-300">{formatDuration(r.timeTakenSeconds)}</td>
                          <td className="p-2 border border-gray-700">
                            <span className={`font-bold ${percent >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {r.score}/{r.totalQuestions}
                            </span>
                            <span className="text-xs text-gray-400"> ({percent}%)</span>
                          </td>
                          <td className="p-2 border border-gray-700">
                            <button
                              onClick={() => setExploringResult(r)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded inline-flex items-center gap-1"
                            >
                              <FaEye /> استكشف الإجابات
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {exploringResult && (
        <ExamAnswersDetailModal
          isOpen={!!exploringResult}
          onClose={() => setExploringResult(null)}
          result={exploringResult}
          exam={exam}
        />
      )}
    </>
  );
};

export default ExamResultsModal;