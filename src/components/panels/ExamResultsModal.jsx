import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaSpinner, FaEye, FaClipboardList
} from 'react-icons/fa';
import { getExamResults } from '../../services/exams';
import ExamAnswersDetailModal from './ExamAnswersDetailModal';
import ExamManualCorrectionModal from './ExamManualCorrectionModal';
import { EXAM_RESULT_STATUS } from '../../constants';

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
  const [showManualCorrection, setShowManualCorrection] = useState(false);

  useEffect(() => {
    if (isOpen && exam) loadResults();
    // eslint-disable-next-line
  }, [isOpen, exam, showManualCorrection]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getExamResults(exam.id);
      // تجميع حسب الطالب — أفضل محاولة
      const byStudent = {};
      data.forEach(r => {
        if (!byStudent[r.studentId] || (r.score || 0) > (byStudent[r.studentId].score || 0)) {
          byStudent[r.studentId] = r;
        }
      });
      const grouped = Object.values(byStudent).map(r => {
        const attempts = data.filter(x => x.studentId === r.studentId).length;
        return { ...r, totalAttempts: attempts };
      });
      grouped.sort((a, b) => (b.score || 0) - (a.score || 0));
      setResults(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isManual = exam.correctionMode === 'manual';

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
        <div className="min-h-screen flex flex-col max-w-5xl mx-auto">
          <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-blue-500/40 p-4 shadow-xl">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="text-xl font-bold text-white">نتائج: {exam.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {exam.duration ? `المدة: ${exam.duration} دقيقة` : 'بدون مؤقت'} |
                  عدد الأسئلة: {exam.questions?.length || 0} |
                  مجموع العلامات: {exam.questions?.reduce((s, q) => s + (Number(q.points) || 1), 0)} |
                  طريقة التصحيح: {isManual ? 'يدوي (شخصي)' : 'تلقائي'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isManual && (
                  <button
                    onClick={() => setShowManualCorrection(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                  >
                    <FaClipboardList /> تصحيح
                  </button>
                )}
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
                  <FaTimes />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 p-4">
            {loading ? (
              <div className="text-center py-8">
                <FaSpinner className="animate-spin text-3xl text-gray-400 mx-auto" />
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">لم يتقدم أي طالب لهذا الاختبار بعد.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2 border-gray-700">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-gray-800 text-gray-300 sticky top-0">
                    <tr>
                      <th className="p-2 border border-gray-700">#</th>
                      <th className="p-2 border border-gray-700">اسم الطالب</th>
                      <th className="p-2 border border-gray-700">الرقم التسلسلي</th>
                      <th className="p-2 border border-gray-700">الوقت المستغرق</th>
                      <th className="p-2 border border-gray-700">العلامة</th>
                      <th className="p-2 border border-gray-700">الحالة</th>
                      <th className="p-2 border border-gray-700">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const total = r.totalPoints || r.totalQuestions || 1;
                      const percent = total > 0 ? Math.round(((r.score || 0) / total) * 100) : 0;
                      const status = r.correctionStatus || EXAM_RESULT_STATUS.AUTO_CORRECTED;

                      let statusBadge = null;
                      if (status === EXAM_RESULT_STATUS.PENDING_CORRECTION) {
                        statusBadge = (
                          <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                            ⏳ قيد التصحيح
                          </span>
                        );
                      } else if (status === EXAM_RESULT_STATUS.MANUALLY_CORRECTED) {
                        statusBadge = (
                          <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                            ✅ مصحح يدوياً
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                            ✓ تلقائي
                          </span>
                        );
                      }

                      return (
                        <tr key={r.id} className="hover:bg-gray-800/50">
                          <td className="p-2 border border-gray-700 text-gray-300">{i + 1}</td>
                          <td className="p-2 border border-gray-700 text-white">
                            {r.studentName}
                            {r.totalAttempts > 1 && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded mr-2">
                                {r.totalAttempts} محاولات
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-gray-700 text-cyan-300 font-mono text-xs" dir="ltr">
                            {r.studentSerial || '—'}
                          </td>
                          <td className="p-2 border border-gray-700 text-gray-300">
                            {formatDuration(r.timeTakenSeconds)}
                          </td>
                          <td className="p-2 border border-gray-700">
                            <span className={`font-bold ${percent >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {r.score || 0}/{total}
                            </span>
                            <span className="text-xs text-gray-400"> ({percent}%)</span>
                          </td>
                          <td className="p-2 border border-gray-700">{statusBadge}</td>
                          <td className="p-2 border border-gray-700">
                            <button
                              onClick={() => setExploringResult(r)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded inline-flex items-center gap-1"
                            >
                              <FaEye /> استكشف
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
          viewerMode="teacher"
        />
      )}

      {showManualCorrection && (
        <ExamManualCorrectionModal
          isOpen={showManualCorrection}
          onClose={() => { setShowManualCorrection(false); loadResults(); }}
          exam={exam}
        />
      )}
    </>
  );
};

export default ExamResultsModal;