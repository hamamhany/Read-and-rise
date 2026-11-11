import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaTrashAlt, FaSave, FaCalendarAlt, FaPlus,
  FaCheckCircle, FaChevronLeft, FaChevronRight, FaClipboardList
} from 'react-icons/fa';
import { createExam, updateExam, regradeExamResults } from '../../services/exams';
import { sendExamCorrectionNotification } from '../../utils/notifications';
import { EXAM_CORRECTION_MODE } from '../../constants';

const parseDateTimeStr = (str) => {
  if (!str || !str.trim()) return null;
  const cleaned = str.trim().replace(/[/.]/g, '-');
  const match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const [, y, mo, d, h, mi] = match;
  const date = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(h), parseInt(mi), 0, 0);
  if (isNaN(date.getTime())) return undefined;
  return date;
};

const ExamManagerModal = ({ isOpen, onClose, classes, teacherId, exam = null }) => {
  const isEditMode = !!exam;

  const [step, setStep] = useState('settings');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [startTimeStr, setStartTimeStr] = useState('');
  const [endTimeStr, setEndTimeStr] = useState('');
  const [correctionMode, setCorrectionMode] = useState(EXAM_CORRECTION_MODE.AUTO);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [settingsErrors, setSettingsErrors] = useState({});
  const [questionsErrors, setQuestionsErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    if (exam) {
      setTitle(exam.title || '');
      setDuration(exam.duration ? String(exam.duration) : '');
      setSelectedClasses(exam.classIds || []);
      setCorrectionMode(exam.correctionMode || EXAM_CORRECTION_MODE.AUTO);
      setStartTimeStr(exam.startTime ? new Date(exam.startTime).toLocaleString('sv-SE').replace('T', ' ').slice(0, 16) : '');
      setEndTimeStr(exam.endTime ? new Date(exam.endTime).toLocaleString('sv-SE').replace('T', ' ').slice(0, 16) : '');
      setQuestions((exam.questions || []).map(q => ({
        id: q.id || Date.now().toString() + Math.random().toString(36).slice(2, 5),
        type: q.type || 'mcq',
        text: q.text || '',
        options: Array.isArray(q.options) && q.options.length > 0 ? [...q.options] : ['', ''],
        correctAnswer: q.correctAnswer || '',
        points: q.points || 1
      })));
    } else {
      setTitle('');
      setDuration('');
      setSelectedClasses([]);
      setCorrectionMode(EXAM_CORRECTION_MODE.AUTO);
      setStartTimeStr('');
      setEndTimeStr('');
      setQuestions([]);
    }
    setStep('settings');
    setSettingsErrors({});
    setQuestionsErrors({});
    // eslint-disable-next-line
  }, [isOpen, exam]);

  if (!isOpen) return null;

  const validateSettings = () => {
    const errors = {};
    if (!title.trim()) errors.title = 'يجب أن تكتب اسم الاختبار';

    let durationNum = null;
    if (duration && String(duration).trim()) {
      durationNum = parseInt(duration);
      if (isNaN(durationNum) || durationNum < 1) {
        errors.duration = 'يجب أن تكون المدة رقماً صحيحاً (1 على الأقل) أو تُترك فارغة';
      }
    }

    if (selectedClasses.length === 0) {
      errors.classes = 'يجب أن تختار شعبة واحدة على الأقل';
    }

    if (startTimeStr.trim()) {
      const parsed = parseDateTimeStr(startTimeStr);
      if (parsed === undefined) errors.startTime = 'يجب أن تكون صيغة وقت البدء: YYYY-MM-DD HH:MM';
    }
    if (endTimeStr.trim()) {
      const parsed = parseDateTimeStr(endTimeStr);
      if (parsed === undefined) errors.endTime = 'يجب أن تكون صيغة وقت الانتهاء: YYYY-MM-DD HH:MM';
    }
    if (startTimeStr.trim() && endTimeStr.trim()) {
      const s = parseDateTimeStr(startTimeStr);
      const e = parseDateTimeStr(endTimeStr);
      if (s && e && e <= s) {
        errors.endTime = 'يجب أن يكون وقت الانتهاء بعد وقت البدء';
      }
    }

    setSettingsErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const goToQuestions = () => {
    if (validateSettings()) {
      if (questions.length === 0) addQuestion('mcq');
      setStep('questions');
    } else {
      toast.error('يجب إكمال جميع البيانات المطلوبة قبل الانتقال');
    }
  };

  const addQuestion = (type) => {
    setQuestions([...questions, {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
      type,
      text: '',
      options: type === 'mcq' ? ['', ''] : type === 'true_false' ? ['صح', 'خطأ'] : [],
      correctAnswer: '',
      points: 1
    }]);
  };

  const updateQuestion = (id, field, value) => {
    setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
    if (questionsErrors[id]) {
      const newErrors = { ...questionsErrors };
      delete newErrors[id];
      setQuestionsErrors(newErrors);
    }
  };

  const updateOption = (qId, index, value) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      const newOptions = [...q.options];
      const wasCorrect = q.correctAnswer === q.options[index];
      newOptions[index] = value;
      return {
        ...q,
        options: newOptions,
        correctAnswer: wasCorrect && value.trim() === '' ? '' : q.correctAnswer
      };
    }));
  };

  const addOption = (qId) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      if (q.options.length >= 6) return q;
      return { ...q, options: [...q.options, ''] };
    }));
  };

  const removeOption = (qId, index) => {
    setQuestions(questions.map(q => {
      if (q.id !== qId) return q;
      if (q.options.length <= 2) return q;
      const removedOpt = q.options[index];
      const newOptions = q.options.filter((_, i) => i !== index);
      return {
        ...q,
        options: newOptions,
        correctAnswer: q.correctAnswer === removedOpt ? '' : q.correctAnswer
      };
    }));
  };

  const removeQuestion = (id) => {
    if (questions.length === 1) return toast.error('يجب أن يكون هناك سؤال واحد على الأقل');
    setQuestions(questions.filter(q => q.id !== id));
  };

  const validateQuestions = () => {
    const errors = {};
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text.trim()) {
        errors[q.id] = `السؤال #${i + 1}: يجب أن تكتب نص السؤال`;
        continue;
      }
      if (q.type === 'mcq') {
        const filled = q.options.filter(o => o.trim());
        if (filled.length < 2) {
          errors[q.id] = `السؤال #${i + 1}: يجب أن يكون خياران على الأقل معبأين`;
          continue;
        }
        if (!q.correctAnswer || !q.correctAnswer.trim()) {
          errors[q.id] = `السؤال #${i + 1}: يجب أن تحدد الإجابة الصحيحة (اضغط زر الراديو بجانب الخيار)`;
          continue;
        }
        if (!filled.includes(q.correctAnswer)) {
          errors[q.id] = `السؤال #${i + 1}: الإجابة الصحيحة يجب أن تكون من ضمن الخيارات المعبأة`;
          continue;
        }
      }
      if (q.type === 'true_false' && !q.correctAnswer) {
        errors[q.id] = `السؤال #${i + 1}: يجب أن تحدد الإجابة الصحيحة (صح/خطأ)`;
        continue;
      }
      if (q.type === 'short_text' && !q.correctAnswer.trim()) {
        errors[q.id] = `السؤال #${i + 1}: يجب أن تكتب الإجابة الصحيحة النصية`;
        continue;
      }
      if (!q.points || q.points < 1) {
        errors[q.id] = `السؤال #${i + 1}: يجب أن تحدد علامة السؤال (1 على الأقل)`;
      }
    }
    setQuestionsErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateQuestions()) {
      toast.error('يجب إكمال جميع بيانات الأسئلة قبل الحفظ');
      return;
    }

    let durationNum = null;
    if (duration && String(duration).trim()) durationNum = parseInt(duration);

    let startTimeIso = null;
    let endTimeIso = null;
    if (startTimeStr.trim()) startTimeIso = parseDateTimeStr(startTimeStr).toISOString();
    if (endTimeStr.trim()) endTimeIso = parseDateTimeStr(endTimeStr).toISOString();

    setSaving(true);
    try {
      const examData = {
        teacherId,
        title: title.trim(),
        duration: durationNum,
        classIds: selectedClasses,
        startTime: startTimeIso,
        endTime: endTimeIso,
        correctionMode,
        questions: questions.map(q => ({
          id: q.id,
          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: Number(q.points) || 1
        }))
      };

      if (isEditMode) {
        await updateExam(exam.id, examData);
        const regradeResult = await regradeExamResults(exam.id, examData);

        for (const notif of regradeResult.notifications) {
          await sendExamCorrectionNotification(
            notif.studentId,
            notif.examTitle,
            notif.newScore,
            notif.total,
            notif.oldScore,
            false
          );
        }

        if (regradeResult.notifications.length > 0) {
          toast.success(
            `✅ تم تحديث الاختبار وإعادة تصحيح ${regradeResult.updatedResults.length} نتيجة — تم إشعار ${regradeResult.notifications.length} طالب`,
            { duration: 6000 }
          );
        } else {
          toast.success('✅ تم تحديث الاختبار وإعادة تصحيح النتائج');
        }
      } else {
        await createExam(examData);
        toast.success('✅ تم إنشاء الاختبار بنجاح');
      }
      onClose(true);
    } catch (error) {
      toast.error('فشل الحفظ: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const inputBaseClass = "w-full bg-gray-800 text-white p-2 rounded border";
  const inputErrorClass = "border-red-500 ring-2 ring-red-500/30";
  const inputNormalClass = "border-gray-600";
  const errorMsgClass = "text-red-400 text-xs mt-1 font-bold";

  return (
    <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-orange-500/40 p-4 flex justify-between items-center shadow-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => step === 'questions' ? setStep('settings') : onClose(false)}
              className="text-gray-400 hover:text-white text-2xl"
            >
              <FaChevronRight />
            </button>
            <div>
              <h2 className="text-2xl font-bold text-orange-300">
                {isEditMode ? '✏️ تعديل الاختبار' : '➕ إنشاء اختبار جديد'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === 'settings' ? 'الخطوة 1 من 2: إعدادات الاختبار' : 'الخطوة 2 من 2: الأسئلة'}
              </p>
            </div>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-400 hover:text-white text-2xl">
            <FaTimes />
          </button>
        </div>

        <div className="bg-gray-900 px-4 pb-3">
          <div className="flex gap-2">
            <div className={`flex-1 h-2 rounded-full ${step === 'settings' ? 'bg-orange-500' : 'bg-green-500'}`} />
            <div className={`flex-1 h-2 rounded-full ${step === 'questions' ? 'bg-orange-500' : 'bg-gray-700'}`} />
          </div>
        </div>

        <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
          {step === 'settings' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm text-gray-300 mb-1 font-bold">
                  عنوان الاختبار <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => { setTitle(e.target.value); if (settingsErrors.title) setSettingsErrors({ ...settingsErrors, title: null }); }}
                  className={`${inputBaseClass} ${settingsErrors.title ? inputErrorClass : inputNormalClass}`}
                  placeholder="مثال: اختبار الوحدة الأولى"
                />
                {settingsErrors.title && <p className={errorMsgClass}>⚠️ {settingsErrors.title}</p>}
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-2 font-bold">
                  طريقة التصحيح <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className={`p-4 rounded-xl border-2 cursor-pointer transition ${correctionMode === EXAM_CORRECTION_MODE.AUTO ? 'bg-green-500/20 border-green-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                    <input
                      type="radio"
                      name="correctionMode"
                      value={EXAM_CORRECTION_MODE.AUTO}
                      checked={correctionMode === EXAM_CORRECTION_MODE.AUTO}
                      onChange={() => setCorrectionMode(EXAM_CORRECTION_MODE.AUTO)}
                      className="hidden"
                    />
                    <p className="text-white font-bold flex items-center gap-2">
                      <FaCheckCircle className={correctionMode === EXAM_CORRECTION_MODE.AUTO ? 'text-green-400' : 'text-gray-500'} />
                      تصحيح تلقائي
                    </p>
                    <p className="text-xs text-gray-400 mt-1">النظام يصحح تلقائياً فور تسليم الطالب</p>
                  </label>
                  <label className={`p-4 rounded-xl border-2 cursor-pointer transition ${correctionMode === EXAM_CORRECTION_MODE.MANUAL ? 'bg-amber-500/20 border-amber-500' : 'bg-gray-800 border-gray-700 hover:border-gray-600'}`}>
                    <input
                      type="radio"
                      name="correctionMode"
                      value={EXAM_CORRECTION_MODE.MANUAL}
                      checked={correctionMode === EXAM_CORRECTION_MODE.MANUAL}
                      onChange={() => setCorrectionMode(EXAM_CORRECTION_MODE.MANUAL)}
                      className="hidden"
                    />
                    <p className="text-white font-bold flex items-center gap-2">
                      <FaClipboardList className={correctionMode === EXAM_CORRECTION_MODE.MANUAL ? 'text-amber-400' : 'text-gray-500'} />
                      تصحيح شخصي
                    </p>
                    <p className="text-xs text-gray-400 mt-1">أنت تصحح إجابات كل طالب يدوياً</p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1 font-bold">
                  المدة (بالدقائق) — اختياري
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={e => { setDuration(e.target.value); if (settingsErrors.duration) setSettingsErrors({ ...settingsErrors, duration: null }); }}
                  className={`${inputBaseClass} ${settingsErrors.duration ? inputErrorClass : inputNormalClass}`}
                  min="1"
                  placeholder="اتركه فارغاً لاختبار بدون مؤقت"
                />
                {settingsErrors.duration && <p className={errorMsgClass}>⚠️ {settingsErrors.duration}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1 font-bold">
                    <FaCalendarAlt className="inline me-1 text-cyan-400" /> وقت البدء (اختياري)
                  </label>
                  <input
                    type="text"
                    value={startTimeStr}
                    onChange={e => { setStartTimeStr(e.target.value); if (settingsErrors.startTime) setSettingsErrors({ ...settingsErrors, startTime: null }); }}
                    placeholder="2025-01-15 14:30"
                    className={`${inputBaseClass} font-mono text-sm text-center ${settingsErrors.startTime ? inputErrorClass : inputNormalClass}`}
                    dir="ltr"
                  />
                  {settingsErrors.startTime && <p className={errorMsgClass}>⚠️ {settingsErrors.startTime}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1 font-bold">
                    <FaCalendarAlt className="inline me-1 text-cyan-400" /> وقت الانتهاء (اختياري)
                  </label>
                  <input
                    type="text"
                    value={endTimeStr}
                    onChange={e => { setEndTimeStr(e.target.value); if (settingsErrors.endTime) setSettingsErrors({ ...settingsErrors, endTime: null }); }}
                    placeholder="2025-01-16 14:30"
                    className={`${inputBaseClass} font-mono text-sm text-center ${settingsErrors.endTime ? inputErrorClass : inputNormalClass}`}
                    dir="ltr"
                  />
                  {settingsErrors.endTime && <p className={errorMsgClass}>⚠️ {settingsErrors.endTime}</p>}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1 font-bold">
                  الشعب المستهدفة <span className="text-red-400">*</span>
                </label>
                <div className={`bg-gray-800 border rounded-lg p-3 max-h-60 overflow-y-auto ${settingsErrors.classes ? inputErrorClass : inputNormalClass}`}>
                  {classes.length === 0 ? (
                    <p className="text-gray-500 text-center py-3">لا توجد شعب متاحة</p>
                  ) : (
                    classes.map(c => (
                      <label key={c.id} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedClasses.includes(c.id)}
                          onChange={e => {
                            if (e.target.checked) setSelectedClasses([...selectedClasses, c.id]);
                            else setSelectedClasses(selectedClasses.filter(id => id !== c.id));
                            if (settingsErrors.classes) setSettingsErrors({ ...settingsErrors, classes: null });
                          }}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-white text-sm">{c.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {settingsErrors.classes && <p className={errorMsgClass}>⚠️ {settingsErrors.classes}</p>}
              </div>
            </div>
          )}

          {step === 'questions' && (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id} className={`bg-gray-900 p-4 rounded-2xl border-2 ${questionsErrors[q.id] ? 'border-red-500' : 'border-gray-700'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-base font-bold text-blue-300">
                      السؤال #{idx + 1} ({q.type === 'mcq' ? 'اختيار من متعدد' : q.type === 'true_false' ? 'صح/خطأ' : 'نص قصير'})
                    </span>
                    <button onClick={() => removeQuestion(q.id)} className="text-red-400 hover:text-red-300 text-xl">
                      <FaTrashAlt />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={q.text}
                    onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                    placeholder="نص السؤال"
                    className={`${inputBaseClass} mb-3 ${questionsErrors[q.id] && !q.text.trim() ? inputErrorClass : inputNormalClass}`}
                  />

                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">
                      علامة السؤال (افتراضي 1)
                    </label>
                    <input
                      type="number"
                      value={q.points}
                      onChange={e => updateQuestion(q.id, 'points', Number(e.target.value) || 1)}
                      min="1"
                      className="w-32 bg-gray-800 text-white p-2 rounded border border-gray-600 text-center"
                    />
                  </div>

                  {q.type === 'mcq' && (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-300 mb-1">
                        ⚠️ اضغط زر الراديو بجانب الخيار الصحيح لتحديده
                      </p>
                      {q.options.map((opt, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.id}`}
                            checked={q.correctAnswer === opt && opt.trim() !== ''}
                            onChange={() => updateQuestion(q.id, 'correctAnswer', opt)}
                            disabled={!opt.trim()}
                            className="w-5 h-5 accent-green-500 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={e => updateOption(q.id, i, e.target.value)}
                            placeholder={`الخيار ${i + 1}`}
                            className={`flex-1 ${inputBaseClass} ${inputNormalClass}`}
                          />
                          {q.options.length > 2 && (
                            <button
                              onClick={() => removeOption(q.id, i)}
                              className="text-red-400 hover:text-red-300 px-2"
                              title="حذف هذا الخيار"
                            >
                              <FaTimes />
                            </button>
                          )}
                        </div>
                      ))}

                      {q.options.length < 6 && (
                        <button
                          onClick={() => addOption(q.id)}
                          className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2 font-bold"
                        >
                          <FaPlus /> إضافة اختيار جديد ({q.options.length}/6)
                        </button>
                      )}
                    </div>
                  )}

                  {q.type === 'true_false' && (
                    <div className="flex gap-4 mt-2">
                      {['صح', 'خطأ'].map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-gray-200 cursor-pointer p-2 rounded-lg hover:bg-gray-800">
                          <input
                            type="radio"
                            name={`tf-${q.id}`}
                            checked={q.correctAnswer === opt}
                            onChange={() => updateQuestion(q.id, 'correctAnswer', opt)}
                            className="w-4 h-4 accent-green-500"
                          />
                          <span className="font-bold">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === 'short_text' && (
                    <input
                      type="text"
                      value={q.correctAnswer}
                      onChange={e => updateQuestion(q.id, 'correctAnswer', e.target.value)}
                      placeholder="الإجابة الصحيحة (يجب أن يطابقها الطالب تماماً)"
                      className={`w-full ${inputBaseClass} ${inputNormalClass}`}
                    />
                  )}

                  {questionsErrors[q.id] && (
                    <p className={errorMsgClass}>⚠️ {questionsErrors[q.id]}</p>
                  )}
                </div>
              ))}

              <div className="flex gap-2 flex-wrap">
                <button onClick={() => addQuestion('mcq')} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold text-sm">
                  <FaPlus className="inline me-1" /> اختيار متعدد
                </button>
                <button onClick={() => addQuestion('true_false')} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm">
                  <FaPlus className="inline me-1" /> صح/خطأ
                </button>
                <button onClick={() => addQuestion('short_text')} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold text-sm">
                  <FaPlus className="inline me-1" /> نص قصير
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-900 border-t-2 border-gray-700 p-4 flex justify-between items-center gap-3">
          {step === 'settings' ? (
            <>
              <button onClick={() => onClose(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
                إلغاء
              </button>
              <button onClick={goToQuestions} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2">
                التالي <FaChevronLeft />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('settings')} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                <FaChevronRight /> السابق
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2"
              >
                <FaSave /> {saving ? 'جاري الحفظ...' : (isEditMode ? 'حفظ التعديلات' : 'حفظ الاختبار')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamManagerModal;