import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaTimes, FaTrashAlt, FaSave, FaClock, FaCalendarAlt } from 'react-icons/fa';
import { createExam } from '../../services/exams';

// ✅ دالة قراءة التاريخ من نص موحد (YYYY-MM-DD HH:MM)
const parseDateTimeStr = (str) => {
  if (!str || !str.trim()) return null; // فارغ = غير محدد
  const cleaned = str.trim().replace(/[/.]/g, '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return undefined; // صيغة غير صحيحة
  const [, y, mo, d, h, mi] = match;
  const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi), 0, 0);
  if (isNaN(date.getTime())) return undefined;
  return date;
};

const ExamManagerModal = ({ isOpen, onClose, classes, teacherId }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(''); // اختياري (فارغ = بلا مؤقت)
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [startTimeStr, setStartTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDuration('');
      setSelectedClasses([]);
      setStartTimeStr('');
      setEndTimeStr('');
      setQuestions([{
        id: Date.now().toString(),
        type: 'mcq',
        text: '',
        options: ['', '', '', ''],
        correctAnswer: '' // ✅ فارغة تماماً - المعلم يختار بنفسه
      }]);
    }
  }, [isOpen]);

  const addQuestion = (type) => {
    setQuestions([...questions, {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
      type,
      text: '',
      options: type === 'mcq' ? ['', '', '', ''] : type === 'true_false' ? ['صح', 'خطأ'] : [],
      correctAnswer: ''
    }]);
  };

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const updateOption = (qId, index, value) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      const newOptions = [...q.options];
      // إذا كان الخيار الذي نعدله هو الإجابة الصحيحة، وحذفنا محتواه → ألغِ الإجابة
      const wasCorrect = q.correctAnswer === q.options[index];
      newOptions[index] = value;
      return {
        ...q,
        options: newOptions,
        correctAnswer: wasCorrect && value.trim() === '' ? '' : q.correctAnswer
      };
    }));
  };

  const removeQuestion = (id) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleSave = async () => {
    if (!title.trim()) return toast.error('عنوان الاختبار مطلوب');
    if (selectedClasses.length === 0) return toast.error('اختر شعبة واحدة على الأقل');
    if (questions.length === 0) return toast.error('أضف سؤالاً واحداً على الأقل');

    let durationNum = null;
    if (duration && String(duration).trim()) {
      durationNum = parseInt(duration);
      if (isNaN(durationNum) || durationNum < 1) {
        return toast.error('المدة يجب أن تكون رقماً صحيحاً (1 على الأقل) أو تُترك فارغة');
      }
    }

    let startTimeIso = null;
    let endTimeIso = null;

    if (startTimeStr.trim()) {
      const parsed = parseDateTimeStr(startTimeStr);
      if (parsed === undefined) return toast.error('صيغة وقت البدء غير صحيحة. استخدم: YYYY-MM-DD HH:MM');
      startTimeIso = parsed.toISOString();
    }
    if (endTimeStr.trim()) {
      const parsed = parseDateTimeStr(endTimeStr);
      if (parsed === undefined) return toast.error('صيغة وقت الانتهاء غير صحيحة. استخدم: YYYY-MM-DD HH:MM');
      endTimeIso = parsed.toISOString();
    }
    if (startTimeIso && endTimeIso && new Date(endTimeIso) <= new Date(startTimeIso)) {
      return toast.error('وقت الانتهاء يجب أن يكون بعد وقت البدء');
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) return toast.error(`السؤال #${i + 1}: النص مطلوب`);
      if (q.type === 'mcq') {
        const filled = q.options.filter(o => o.trim());
        if (filled.length < 2) return toast.error(`السؤال #${i + 1}: خياران على الأقل`);
        if (!q.correctAnswer || !q.correctAnswer.trim()) {
          return toast.error(`السؤال #${i + 1}: يجب تحديد الإجابة الصحيحة يدوياً (اضغط زر الراديو بجانب الخيار)`);
        }
        if (!filled.includes(q.correctAnswer)) {
          return toast.error(`السؤال #${i + 1}: الإجابة الصحيحة يجب أن تكون من ضمن الخيارات المعبأة`);
        }
      }
      if (q.type === 'true_false' && !q.correctAnswer) {
        return toast.error(`السؤال #${i + 1}: حدد الإجابة الصحيحة (صح/خطأ)`);
      }
      if (q.type === 'short_text' && !q.correctAnswer.trim()) {
        return toast.error(`السؤال #${i + 1}: أدخل الإجابة الصحيحة النصية`);
      }
    }

    setSaving(true);
    try {
      await createExam({
        teacherId,
        title: title.trim(),
        duration: durationNum,
        classIds: selectedClasses,
        startTime: startTimeIso,
        endTime: endTimeIso,
        questions
      });
      toast.success('✅ تم إنشاء الاختبار بنجاح');
      onClose();
    } catch (error) {
      toast.error('فشل الحفظ: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">إنشاء اختبار جديد</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">عنوان الاختبار <span className="text-red-400">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" placeholder="مثال: اختبار الوحدة الأولى" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">المدة (بالدقائق) — اختياري</label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" min="1" placeholder="اتركه فارغاً إن لم ترد مؤقتاً" />
              <p className="text-[10px] text-gray-500 mt-1">اتركه فارغاً لاختبار بدون مؤقت</p>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                <FaCalendarAlt className="inline me-1 text-cyan-400" /> وقت البدء (اختياري)
              </label>
              <input
                type="text"
                value={startTimeStr}
                onChange={e => setStartTimeStr(e.target.value)}
                placeholder="2025-01-15 14:30"
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 font-mono text-sm text-center"
                dir="ltr"
              />
              <p className="text-[10px] text-gray-500 mt-1">صيغة موحدة: YYYY-MM-DD HH:MM (24 ساعة)</p>
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                <FaCalendarAlt className="inline me-1 text-cyan-400" /> وقت الانتهاء (اختياري)
              </label>
              <input
                type="text"
                value={endTimeStr}
                onChange={e => setEndTimeStr(e.target.value)}
                placeholder="2025-01-16 14:30"
                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 font-mono text-sm text-center"
                dir="ltr"
              />
              <p className="text-[10px] text-gray-500 mt-1">صيغة موحدة: YYYY-MM-DD HH:MM (24 ساعة)</p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">الشعب المستهدفة <span className="text-red-400">*</span></label>
            <select multiple value={selectedClasses} onChange={e => setSelectedClasses(Array.from(e.target.selectedOptions).map(o => o.value))} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 h-24">
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-1">اضغط Ctrl لاختيار أكثر من شعبة</p>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-lg font-bold text-white mb-3">الأسئلة</h4>
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-gray-800/50 p-4 rounded-xl mb-3 border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-blue-300">
                    السؤال #{idx + 1} ({q.type === 'mcq' ? 'اختيار من متعدد' : q.type === 'true_false' ? 'صح/خطأ' : 'نص قصير'})
                  </span>
                  <button onClick={() => removeQuestion(q.id)} className="text-red-400 hover:text-red-300"><FaTrashAlt /></button>
                </div>
                <input type="text" value={q.text} onChange={e => updateQuestion(q.id, 'text', e.target.value)} placeholder="نص السؤال" className="w-full bg-gray-700 text-white p-2 rounded mb-2 border border-gray-600" />

                {q.type === 'mcq' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-amber-300 mb-1">⚠️ اضغط زر الراديو بجانب الخيار الصحيح لتحديده (لا يتم تحديد شيء تلقائياً)</p>
                    {q.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={e => updateOption(q.id, i, e.target.value)}
                          placeholder={`الخيار ${i + 1}`}
                          className="flex-1 bg-gray-700 text-white p-2 rounded border border-gray-600"
                        />
                        <label className="flex items-center gap-1 text-xs text-green-400 cursor-pointer">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctAnswer !== '' && opt !== '' && q.correctAnswer === opt}
                            onChange={() => updateQuestion(q.id, 'correctAnswer', opt)}
                            disabled={!opt.trim()}
                            className="accent-green-500 w-5 h-5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          />
                          صحيح
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="flex gap-4">
                    {['صح', 'خطأ'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-gray-200 cursor-pointer">
                        <input
                          type="radio"
                          name={`tf-${q.id}`}
                          checked={q.correctAnswer === opt}
                          onChange={() => updateQuestion(q.id, 'correctAnswer', opt)}
                          className="accent-green-500"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'short_text' && (
                  <input type="text" value={q.correctAnswer} onChange={e => updateQuestion(q.id, 'correctAnswer', e.target.value)} placeholder="الإجابة الصحيحة (نص مطابق تماماً)" className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600" />
                )}
              </div>
            ))}
            
            <div className="flex gap-2 mt-2 flex-wrap">
              <button onClick={() => addQuestion('mcq')} className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded">+ اختيار متعدد</button>
              <button onClick={() => addQuestion('true_false')} className="text-sm bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded">+ صح/خطأ</button>
              <button onClick={() => addQuestion('short_text')} className="text-sm bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded">+ نص قصير</button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">إلغاء</button>
          <button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded font-bold">
            {saving ? 'جاري الحفظ...' : <><FaSave className="inline me-2" /> حفظ الاختبار</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamManagerModal;