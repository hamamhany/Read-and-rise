import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaTimes, FaPlus, FaTrashAlt, FaSave } from 'react-icons/fa';
import { createExam } from '../../services/exams';

const ExamManagerModal = ({ isOpen, onClose, classes, teacherId }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(30);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDuration(30);
      setSelectedClasses([]);
      setStartTime('');
      setEndTime('');
      setQuestions([{ id: Date.now().toString(), type: 'mcq', text: '', options: ['', '', '', ''], correctAnswer: '' }]);
    }
  }, [isOpen]);

  const addQuestion = (type) => {
    setQuestions([...questions, {
      id: Date.now().toString(),
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
      newOptions[index] = value;
      return { ...q, options: newOptions };
    }));
  };

  const removeQuestion = (id) => {
    setQuestions(questions.filter(q => q.id !== id));
  };

  const handleSave = async () => {
    if (!title.trim()) return toast.error('عنوان الاختبار مطلوب');
    if (selectedClasses.length === 0) return toast.error('اختر شعبة واحدة على الأقل');
    if (questions.length === 0) return toast.error('أضف سؤالاً واحداً على الأقل');

    for (const q of questions) {
      if (!q.text.trim()) return toast.error('نص السؤال مطلوب');
      if (q.type === 'mcq' && (!q.options.some(o => o.trim()) || !q.correctAnswer)) {
        return toast.error('يجب ملء الخيارات وتحديد الإجابة الصحيحة');
      }
      if (q.type === 'true_false' && !q.correctAnswer) {
        return toast.error('حدد الإجابة الصحيحة (صح/خطأ)');
      }
      if (q.type === 'short_text' && !q.correctAnswer) {
        return toast.error('أدخل الإجابة الصحيحة للنص');
      }
    }

    setSaving(true);
    try {
      await createExam({
        teacherId,
        title,
        duration: parseInt(duration),
        classIds: selectedClasses,
        startTime: startTime || null,
        endTime: endTime || null,
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
              <label className="block text-sm text-gray-300 mb-1">عنوان الاختبار</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" placeholder="مثال: اختبار الوحدة الأولى" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">المدة (بالدقائق)</label>
              <input type="number" value={duration} onChange={e => setDuration(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" min="1" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">وقت البدء (اختياري)</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">وقت الانتهاء (اختياري)</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">الشعب المستهدفة</label>
            <select multiple value={selectedClasses} onChange={e => setSelectedClasses(Array.from(e.target.selectedOptions).map(o => o.value))} className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 h-24">
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-lg font-bold text-white mb-3">الأسئلة</h4>
            {questions.map((q, idx) => (
              <div key={q.id} className="bg-gray-800/50 p-4 rounded-xl mb-3 border border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-blue-300">السؤال #{idx + 1} ({q.type === 'mcq' ? 'اختيار متعدد' : q.type === 'true_false' ? 'صح/خطأ' : 'نص قصير'})</span>
                  <button onClick={() => removeQuestion(q.id)} className="text-red-400 hover:text-red-300"><FaTrashAlt /></button>
                </div>
                <input type="text" value={q.text} onChange={e => updateQuestion(q.id, 'text', e.target.value)} placeholder="نص السؤال" className="w-full bg-gray-700 text-white p-2 rounded mb-2 border border-gray-600" />
                
                {q.type === 'mcq' && (
                  <div className="space-y-2">
                    {q.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="text" value={opt} onChange={e => updateOption(q.id, i, e.target.value)} placeholder={`الخيار ${i + 1}`} className="flex-1 bg-gray-700 text-white p-2 rounded border border-gray-600" />
                        <input type="radio" name={`correct-${q.id}`} checked={q.correctAnswer === opt} onChange={() => updateQuestion(q.id, 'correctAnswer', opt)} className="accent-green-500 w-5 h-5" />
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-gray-200"><input type="radio" name={`tf-${q.id}`} checked={q.correctAnswer === 'صح'} onChange={() => updateQuestion(q.id, 'correctAnswer', 'صح')} /> صح</label>
                    <label className="flex items-center gap-2 text-gray-200"><input type="radio" name={`tf-${q.id}`} checked={q.correctAnswer === 'خطأ'} onChange={() => updateQuestion(q.id, 'correctAnswer', 'خطأ')} /> خطأ</label>
                  </div>
                )}

                {q.type === 'short_text' && (
                  <input type="text" value={q.correctAnswer} onChange={e => updateQuestion(q.id, 'correctAnswer', e.target.value)} placeholder="الإجابة الصحيحة (نص)" className="w-full bg-gray-700 text-white p-2 rounded border border-gray-600" />
                )}
              </div>
            ))}
            
            <div className="flex gap-2 mt-2">
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