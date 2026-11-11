import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaCheckCircle, FaTimesCircle, FaChevronLeft,
  FaSave, FaUser, FaSpinner, FaCheck
} from 'react-icons/fa';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getExamResults, saveManualCorrections } from '../../services/exams';
import { sendExamCorrectionNotification } from '../../utils/notifications';
import { useConfirm } from '../common/ConfirmContext';
import { EXAM_RESULT_STATUS } from '../../constants';

const ExamManualCorrectionModal = ({ isOpen, onClose, exam }) => {
  const confirm = useConfirm();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState(null);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && exam) loadResults();
    else {
      setSelectedResult(null);
      setMarks({});
    }
    // eslint-disable-next-line
  }, [isOpen, exam]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getExamResults(exam.id);
      // ترتيب حسب الاسم
      data.sort((a, b) => (a.studentName || '').localeCompare(b.studentName || '', 'ar'));
      setResults(data);
    } catch (e) {
      toast.error('فشل تحميل النتائج: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const openStudent = (result) => {
    setSelectedResult(result);
    const initialMarks = {};
    (result.answers || []).forEach(ans => {
      if (result.pendingCorrections && typeof result.pendingCorrections[ans.questionId] === 'boolean') {
        initialMarks[ans.questionId] = result.pendingCorrections[ans.questionId];
      } else if (ans.isCorrect === true || ans.isCorrect === false) {
        initialMarks[ans.questionId] = ans.isCorrect;
      }
    });
    // أي سؤال غير محدد نضع له false بشكل مبدئي حتى يقرره المعلم
    (exam.questions || []).forEach(q => {
      if (initialMarks[q.id] === undefined) initialMarks[q.id] = false;
    });
    setMarks(initialMarks);
  };

  const toggleMark = async (questionId, isCorrect) => {
    const newMarks = { ...marks, [questionId]: isCorrect };
    setMarks(newMarks);

    // ✅ حفظ فوري في السحابة
    try {
      await updateDoc(doc(db, 'examResults', selectedResult.id), {
        [`pendingCorrections.${questionId}`]: isCorrect
      });
    } catch (e) {
      console.warn('auto-save failed:', e);
    }
  };

  const handleSave = async () => {
    if (!selectedResult) return;

    // تحقق أن كل الأسئلة لها علامة
    const unmarked = (exam.questions || []).filter(q => marks[q.id] === undefined);
    if (unmarked.length > 0) {
      toast.error(`يجب تصحيح جميع الأسئلة (بقي ${unmarked.length} سؤال)`);
      return;
    }

    const ok = await confirm(
      'حفظ التصحيح',
      'هل أنت متأكد من حفظ التصحيح؟ سيتم إرسال إشعار للطالب بالعلامة النهائية.'
    );
    if (!ok) return;

    setSaving(true);
    try {
      const corrections = (exam.questions || []).map(q => ({
        questionId: q.id,
        isCorrect: marks[q.id] === true
      }));

      const result = await saveManualCorrections(selectedResult.id, corrections);

      // إشعار الطالب إذا كان أول تصحيح أو إذا تغيرت العلامة
      if (result.wasPending) {
        await sendExamCorrectionNotification(
          selectedResult.studentId,
          exam.title,
          result.newScore,
          result.newTotalPoints,
          result.oldScore,
          true
        );
      } else if (result.scoreChanged) {
        await sendExamCorrectionNotification(
          selectedResult.studentId,
          exam.title,
          result.newScore,
          result.newTotalPoints,
          result.oldScore,
          false
        );
      }

      toast.success(
        `✅ تم حفظ التصحيح — العلامة: ${result.newScore}/${result.newTotalPoints}`
      );

      await loadResults();
      setSelectedResult(null);
      setMarks({});
    } catch (e) {
      toast.error('فشل الحفظ: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const backToList = () => {
    setSelectedResult(null);
    setMarks({});
  };

  // =============== عرض الطلاب ===============
  if (!selectedResult) {
    return (
      <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
        <div className="min-h-screen flex flex-col max-w-4xl mx-auto">
          <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-amber-500/40 p-4 flex justify-between items-center shadow-xl">
            <div>
              <h2 className="text-2xl font-bold text-amber-300">تصحيح شخصي</h2>
              <p className="text-xs text-gray-400 mt-0.5">{exam.title}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
              <FaTimes />
            </button>
          </div>

          <div className="flex-1 p-4">
            {loading ? (
              <div className="text-center py-12 text-gray-400">
                <FaSpinner className="animate-spin text-3xl mx-auto mb-3" />
                جاري التحميل...
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <FaUser className="text-5xl text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">لم يتقدم أي طالب لهذا الاختبار بعد.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {results.map(r => {
                  const status = r.correctionStatus || EXAM_RESULT_STATUS.PENDING_CORRECTION;
                  const isPending = status === EXAM_RESULT_STATUS.PENDING_CORRECTION;
                  const hasDraft = r.pendingCorrections && Object.keys(r.pendingCorrections).length > 0;

                  return (
                    <button
                      key={r.id}
                      onClick={() => openStudent(r)}
                      className="w-full p-4 bg-gray-900 hover:bg-gray-800 rounded-xl border-2 border-gray-700 hover:border-amber-500/50 transition text-right flex justify-between items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold">
                          {r.studentName || 'طالب'}
                          {r.studentSerial && (
                            <span className="text-xs text-cyan-300 font-mono mr-2" dir="ltr">
                              #{r.studentSerial}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          العلامة الحالية: <span className="text-amber-300 font-bold">
                            {r.score || 0}/{r.totalPoints || exam.questions?.length || 0}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {isPending && (
                            <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded border border-red-500/30">
                              ⏳ بحاجة لتصحيح
                            </span>
                          )}
                          {!isPending && status === EXAM_RESULT_STATUS.MANUALLY_CORRECTED && (
                            <span className="text-[10px] bg-green-500/20 text-green-300 px-2 py-0.5 rounded border border-green-500/30">
                              ✅ تم التصحيح يدوياً
                            </span>
                          )}
                          {hasDraft && isPending && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                              📝 {Object.keys(r.pendingCorrections).length} مسودة
                            </span>
                          )}
                        </div>
                      </div>
                      <FaChevronLeft className="text-gray-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =============== عرض الأسئلة للتصحيح ===============
  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
      <div className="min-h-screen flex flex-col max-w-4xl mx-auto">
        <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-amber-500/40 p-4 flex justify-between items-center shadow-xl">
          <div className="flex items-center gap-3">
            <button onClick={backToList} className="text-gray-400 hover:text-white text-2xl">
              <FaChevronLeft />
            </button>
            <div>
              <h2 className="text-lg font-bold text-amber-300">
                {selectedResult.studentName}
              </h2>
              <p className="text-xs text-gray-400">
                {exam.title} — {selectedResult.studentSerial && (
                  <span className="font-mono" dir="ltr">#{selectedResult.studentSerial}</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-200">
            ℹ️ لكل سؤال اختر "صح" أو "خطأ" حسب إجابة الطالب. يتم حفظ اختيارك تلقائياً في السحابة. عند الضغط على "حفظ التصحيح" يتم تثبيت العلامة وإرسال إشعار للطالب.
          </div>

          {(exam.questions || []).map((q, idx) => {
            const studentAnswer = (selectedResult.answers || []).find(a => a.questionId === q.id)?.studentAnswer || '';
            const currentMark = marks[q.id];
            const qPoints = Number(q.points) || 1;

            return (
              <div
                key={q.id}
                className={`bg-gray-900 p-4 rounded-xl border-2 ${
                  currentMark === true ? 'border-green-500/60' :
                  currentMark === false ? 'border-red-500/60' :
                  'border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <p className="text-white font-bold flex-1">
                    {idx + 1}. {q.text}
                  </p>
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                    {qPoints} {qPoints === 1 ? 'علامة' : 'علامات'}
                  </span>
                </div>

                {/* الخيارات مع تمييز إجابة الطالب */}
                {(q.type === 'mcq' || q.type === 'true_false') && (
                  <div className="space-y-1.5 mb-3">
                    {(q.options || []).filter(o => o && o.trim()).map((opt, i) => {
                      const isStudentChoice = studentAnswer === opt;
                      return (
                        <div
                          key={i}
                          className={`p-2 rounded-lg border text-sm ${
                            isStudentChoice
                              ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-100 font-bold'
                              : 'bg-gray-800 border-gray-700 text-gray-300'
                          }`}
                        >
                          {isStudentChoice && (
                            <span className="text-[10px] bg-cyan-500/40 px-2 py-0.5 rounded me-2">
                              إجابة الطالب
                            </span>
                          )}
                          {opt}
                        </div>
                      );
                    })}
                    {!studentAnswer && (
                      <p className="text-xs text-red-300 bg-red-500/10 p-2 rounded border border-red-500/30">
                        ⚠️ لم يجب الطالب على هذا السؤال
                      </p>
                    )}
                  </div>
                )}

                {q.type === 'short_text' && (
                  <div className="mb-3 p-2 rounded-lg border bg-cyan-500/20 border-cyan-500/60 text-cyan-100">
                    <p className="text-xs opacity-70 mb-1">إجابة الطالب:</p>
                    <p className="font-bold">{studentAnswer || '(لم يجب)'}</p>
                  </div>
                )}

                {/* أزرار صح / خطأ */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleMark(q.id, true)}
                    className={`py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                      currentMark === true
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/30'
                        : 'bg-green-500/20 text-green-300 border border-green-500/30 hover:bg-green-500/30'
                    }`}
                  >
                    <FaCheckCircle /> صح
                  </button>
                  <button
                    onClick={() => toggleMark(q.id, false)}
                    className={`py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                      currentMark === false
                        ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
                        : 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                    }`}
                  >
                    <FaTimesCircle /> خطأ
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t-2 border-gray-700 p-4 flex gap-3">
          <button
            onClick={backToList}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-xl font-bold"
          >
            رجوع
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {saving ? (
              <><FaSpinner className="animate-spin" /> جاري الحفظ...</>
            ) : (
              <><FaSave /> حفظ التصحيح</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamManualCorrectionModal;