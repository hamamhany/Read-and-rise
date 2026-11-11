import React, { useState, useEffect } from 'react';
import { FaTimes, FaSpinner } from 'react-icons/fa';
import { getExamResults } from '../../services/exams';

const ExamResultsModal = ({ isOpen, onClose, exam }) => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && exam) {
      loadResults();
    }
  }, [isOpen, exam]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getExamResults(exam.id);
      data.sort((a, b) => b.score - a.score);
      setResults(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">نتائج: {exam.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8"><FaSpinner className="animate-spin text-3xl text-gray-400" /></div>
          ) : results.length === 0 ? (
            <p className="text-gray-400 text-center py-8">لا توجد نتائج بعد.</p>
          ) : (
            <table className="w-full text-right border-collapse text-sm">
              <thead className="bg-gray-800 text-gray-300 sticky top-0">
                <tr>
                  <th className="p-2 border border-gray-700">#</th>
                  <th className="p-2 border border-gray-700">اسم الطالب</th>
                  <th className="p-2 border border-gray-700">الرقم التسلسلي</th>
                  <th className="p-2 border border-gray-700">الدرجة</th>
                  <th className="p-2 border border-gray-700">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-800/50">
                    <td className="p-2 border border-gray-700 text-gray-300">{i + 1}</td>
                    <td className="p-2 border border-gray-700 text-white">{r.studentName}</td>
                    <td className="p-2 border border-gray-700 text-cyan-300 font-mono" dir="ltr">{r.studentSerial}</td>
                    <td className="p-2 border border-gray-700 text-green-300 font-bold">{r.score} / {r.totalQuestions}</td>
                    <td className="p-2 border border-gray-700 text-xs">
                      {r.autoSubmitted ? <span className="text-red-400">تسليم تلقائي</span> : <span className="text-green-400">يدوي</span>}
                      {r.tabSwitchCount > 0 && <span className="text-orange-400 block">غادر الصفحة {r.tabSwitchCount} مرة</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamResultsModal;