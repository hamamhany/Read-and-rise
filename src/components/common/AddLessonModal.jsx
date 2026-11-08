import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaClock, FaSave, FaTrash, FaPlus } from 'react-icons/fa';
import { generateId } from '../../utils/helpers';

// دالة لجلب التاريخ المحلي بدقة لتفادي مشاكل التوقيت العالمي
const getLocalDateStr = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const AddLessonModal = ({ isOpen, onClose, onSubmit, initialTimes = [], classesList = [] }) => {
  const [schedules, setSchedules] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    if (isOpen) {
      const defaultClassId = classesList.length > 0 ? classesList[0].id : '';
      setSelectedClassId(defaultClassId);
      if (initialTimes && initialTimes.length > 0) {
        setSchedules(initialTimes.map(t => ({ ...t, id: generateId() })));
      } else {
        setSchedules([{ type: 'once', date: new Date(), time: { hours: 12, minutes: 0 }, classId: defaultClassId, id: generateId() }]);
      }
    }
  }, [isOpen, initialTimes, classesList]);

  if (!isOpen) return null;

  const updateSchedule = (id, updates) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const addSchedule = () => {
    if (schedules.length >= 6) return toast.error('الحد الأقصى 6 مواعيد');
    setSchedules([...schedules, { type: 'once', date: new Date(), time: { hours: 12, minutes: 0 }, classId: selectedClassId, id: generateId() }]);
  };

  const removeSchedule = (id) => {
    if (schedules.length === 1) return toast.error('يجب إضافة موعد واحد على الأقل، أو قم بإلغاء العملية');
    setSchedules(schedules.filter(s => s.id !== id));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const times = schedules.map(s => ({
      type: s.type,
      date: s.type === 'once' ? new Date(s.date).toISOString() : null,
      day: s.type === 'recurring' ? s.day : null,
      monthDay: s.type === 'monthly' ? s.monthDay : null,
      time: s.time,
      classId: s.classId
    }));
    onSubmit(times);
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        options.push({ value: timeStr, label: timeStr });
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl w-[95%] max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700">
        <h3 className="text-2xl font-bold text-white mb-4"><FaClock className="inline-block me-2" /> إدارة وتعديل المواعيد</h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {schedules.map((s, idx) => (
            <div key={s.id} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 relative space-y-3">
              <div className="flex justify-between items-center border-b border-gray-600 pb-2 mb-2">
                <span className="text-purple-300 font-bold">الموعد #{idx + 1}</span>
                <button type="button" onClick={() => removeSchedule(s.id)} className="text-red-400 hover:text-white hover:bg-red-500/20 px-3 py-1 rounded-md transition flex items-center gap-1 text-sm">
                  <FaTrash /> حذف هذا الموعد
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-400">الشعبة</label>
                  <select value={s.classId} onChange={e => updateSchedule(s.id, { classId: e.target.value })} className="w-full bg-gray-700 text-white p-2 rounded-md">
                    {classesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">نوع الموعد</label>
                  <select value={s.type} onChange={e => updateSchedule(s.id, { type: e.target.value })} className="w-full bg-gray-700 text-white p-2 rounded-md">
                    <option value="once">مرة واحدة (تاريخ محدد)</option>
                    <option value="recurring">متكرر أسبوعياً</option>
                    <option value="monthly">متكرر شهرياً</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">الوقت</label>
                  <select 
                    value={`${String(s.time.hours).padStart(2, '0')}:${String(s.time.minutes).padStart(2, '0')}`} 
                    onChange={e => {
                      const [h, m] = e.target.value.split(':').map(Number);
                      updateSchedule(s.id, { time: { hours: h, minutes: m } });
                    }}
                    className="w-full bg-gray-700 text-white p-2 rounded-md"
                  >
                    {timeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {s.type === 'once' && (
                <div>
                  <label className="text-xs text-gray-400">التاريخ (يمكنك اختيار أي يوم في الشهر)</label>
                  <input 
                    type="date" 
                    value={getLocalDateStr(s.date)} 
                    onChange={e => {
                      const val = e.target.value;
                      if (!val) return;
                      const [y, m, d] = val.split('-').map(Number);
                      updateSchedule(s.id, { date: new Date(y, m - 1, d, 12, 0, 0) }); // منتصف النهار لتفادي مشاكل التوقيت
                    }} 
                    className="w-full bg-gray-700 text-white p-2 rounded-md" 
                  />
                </div>
              )}

              {s.type === 'recurring' && (
                <div>
                  <label className="text-xs text-gray-400">اليوم</label>
                  <select value={s.day || ''} onChange={e => updateSchedule(s.id, { day: e.target.value })} className="w-full bg-gray-700 text-white p-2 rounded-md">
                    <option value="">اختر اليوم</option>
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {s.type === 'monthly' && (
                <div>
                  <label className="text-xs text-gray-400">يوم الشهر</label>
                  <select value={s.monthDay || ''} onChange={e => updateSchedule(s.id, { monthDay: e.target.value })} className="w-full bg-gray-700 text-white p-2 rounded-md">
                    <option value="">اختر اليوم</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          
          <button type="button" onClick={addSchedule} className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1 font-bold"><FaPlus /> إضافة موعد إضافي</button>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md text-white transition">إلغاء</button>
            <button type="submit" className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-md text-white font-bold transition flex items-center gap-2"><FaSave /> حفظ التعديلات</button>
          </div>
        </form>
      </div>
    </div>
  );
};