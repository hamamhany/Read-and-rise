import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaClock, FaSave } from 'react-icons/fa';
import { safeDate, arabicToEnglishNumber } from '../../utils/helpers';

export const AddLessonModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialTimes = [],
  classesList = []
}) => {
  const [schedules, setSchedules] = useState([]);
  const [error, setError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  useEffect(() => {
    if (isOpen) {
      let defaultClassId = '';
      if (classesList.length > 0) {
        const existingClassId = initialTimes.find(t => t.classId)?.classId;
        defaultClassId = existingClassId || classesList[0].id;
      }
      setSelectedClassId(defaultClassId);

      if (initialTimes && initialTimes.length > 0) {
        const timesWithClass = initialTimes.map(t => ({
          ...t,
          classId: t.classId || null,
          type: t.type || 'once',
          day: t.day || null
        }));
        setSchedules(timesWithClass.map(t => ({ ...t, id: generateId() })));
      } else {
        setSchedules([{
          type: 'once',
          date: new Date(),
          time: { hours: 12, minutes: 0 },
          day: null,
          id: generateId(),
          classId: defaultClassId
        }]);
      }
      setError('');
    }
  }, [isOpen, initialTimes, classesList]);

  if (!isOpen) return null;

  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }
  };

  const updateSchedule = (id, updates) => {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const addSchedule = () => {
    if (schedules.length >= 6) {
      toast.error('لا يمكن إضافة أكثر من 6 مواعيد.');
      return;
    }
    setSchedules(prev => [...prev, {
      type: 'once',
      date: new Date(),
      time: { hours: 12, minutes: 0 },
      day: null,
      id: generateId(),
      classId: selectedClassId
    }]);
  };

  const removeSchedule = (id) => {
    if (schedules.length === 1) {
      toast.error('يجب أن يكون هناك موعد واحد على الأقل.');
      return;
    }
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const validateAndSubmit = (e) => {
    e.preventDefault();
    for (const s of schedules) {
      if (!s.classId) {
        setError('يرجى اختيار شعبة لكل موعد.');
        return;
      }
      if (s.type === 'once') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(s.date);
        selected.setHours(0, 0, 0, 0);
        if (selected <= today) {
          setError('يجب اختيار يوم مستقبلي (بعد اليوم الحالي) للمواعيد من نوع "مرة واحدة".');
          return;
        }
      } else if (s.type === 'recurring') {
        if (!s.day) {
          setError('يرجى اختيار يوم من أيام الأسبوع للمواعيد المتكررة.');
          return;
        }
      }
      if (s.time.hours < 0 || s.time.hours > 12 || s.time.minutes < 0 || s.time.minutes > 59) {
        setError('تأكد من صحة الوقت (الساعات 1-12، الدقائق 0-59).');
        return;
      }
    }
    setError('');
    const times = schedules.map(s => {
      if (s.type === 'once') {
        const combined = new Date(s.date);
        combined.setHours(s.time.hours, s.time.minutes, 0, 0);
        return {
          type: 'once',
          date: combined.toISOString(),
          time: { hours: s.time.hours, minutes: s.time.minutes },
          classId: s.classId,
          day: null
        };
      } else {
        return {
          type: 'recurring',
          day: s.day,
          time: { hours: s.time.hours, minutes: s.time.minutes },
          classId: s.classId,
          date: null
        };
      }
    });
    onSubmit(times);
  };

  // Inner components Calendar, ClockPicker (similar to AddAssignmentModal, but simplified)
  const Calendar = ({ selectedDate, onDateChange }) => {
    const [currentMonth, setCurrentMonth] = useState(safeDate(selectedDate));
    const [days, setDays] = useState([]);

    useEffect(() => {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const daysArray = [];
      for (let i = 0; i < firstDay; i++) {
        daysArray.push(null);
      }
      for (let i = 1; i <= daysInMonth; i++) {
        daysArray.push(new Date(year, month, i));
      }
      setDays(daysArray);
    }, [currentMonth]);

    const goPrevMonth = () => {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };
    const goNextMonth = () => {
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const isSameDay = (d1, d2) => {
      return d1 && d2 && d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
    };

    const isDisabled = (day) => {
      if (!day) return true;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return day <= today;
    };

    return (
      <div className="p-2 w-64">
        <div className="flex justify-between items-center mb-2">
          <button onClick={goPrevMonth} className="text-xl px-2 hover:bg-white/20 rounded text-white">‹</button>
          <span className="font-bold text-sm text-white">
            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goNextMonth} className="text-xl px-2 hover:bg-white/20 rounded text-white">›</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-gray-300">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5 mt-0.5">
          {days.map((day, idx) => {
            const disabled = isDisabled(day);
            return (
              <div
                key={idx}
                onClick={() => day && !disabled && onDateChange(day)}
                className={`text-center py-1.5 rounded-full cursor-pointer transition text-xs
                  ${!day ? '' :
                    disabled ? 'text-gray-600 cursor-not-allowed' :
                    isSameDay(day, selectedDate)
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'hover:bg-white/10 text-white'
                  }`}
              >
                {day ? day.getDate() : ''}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ClockPicker = ({ time, onTimeChange }) => {
    const [hoursStr, setHoursStr] = useState(time.hours.toString().padStart(2, '0'));
    const [minutesStr, setMinutesStr] = useState(time.minutes.toString().padStart(2, '0'));
    const [err, setErr] = useState('');

    useEffect(() => {
      setHoursStr(time.hours.toString().padStart(2, '0'));
      setMinutesStr(time.minutes.toString().padStart(2, '0'));
    }, [time]);

    const handleHours = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      if (val === '') { setHoursStr(''); return; }
      let num = parseInt(val);
      if (num > 12) num = 12;
      if (num < 1 && val.length > 0) num = 1;
      val = num.toString();
      setHoursStr(val);
      onTimeChange({ ...time, hours: num });
    };
    const handleMinutes = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      if (val === '') { setMinutesStr(''); return; }
      let num = parseInt(val);
      if (num > 59) { setErr('الدقائق يجب أن تكون بين 0 و 59'); num = 59; } else setErr('');
      if (num < 0) num = 0;
      val = num.toString().padStart(2, '0');
      setMinutesStr(val);
      onTimeChange({ ...time, minutes: num });
    };
    const incHour = () => {
      let h = time.hours + 1;
      if (h > 12) h = 1;
      onTimeChange({ ...time, hours: h });
    };
    const decHour = () => {
      let h = time.hours - 1;
      if (h < 1) h = 12;
      onTimeChange({ ...time, hours: h });
    };
    const incMin = () => {
      let m = time.minutes + 1;
      if (m > 59) m = 0;
      onTimeChange({ ...time, minutes: m });
    };
    const decMin = () => {
      let m = time.minutes - 1;
      if (m < 0) m = 59;
      onTimeChange({ ...time, minutes: m });
    };

    return (
      <div className="flex items-center gap-2">
        <div className="flex flex-col items-center">
          <label className="text-xs text-gray-300">ساعات</label>
          <div className="flex items-center gap-0.5">
            <button onClick={incHour} className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-xs hover:bg-gray-600">▲</button>
            <input type="text" inputMode="numeric" value={hoursStr} onChange={handleHours} className="w-10 px-1 py-1 border border-gray-600 rounded-md text-center bg-gray-800 text-white text-sm" maxLength="2" />
            <button onClick={decHour} className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-xs hover:bg-gray-600">▼</button>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <label className="text-xs text-gray-300">دقائق</label>
          <div className="flex items-center gap-0.5">
            <button onClick={incMin} className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-xs hover:bg-gray-600">▲</button>
            <input type="text" inputMode="numeric" value={minutesStr} onChange={handleMinutes} className="w-10 px-1 py-1 border border-gray-600 rounded-md text-center bg-gray-800 text-white text-sm" maxLength="2" />
            <button onClick={decMin} className="bg-gray-700 text-white px-1.5 py-0.5 rounded text-xs hover:bg-gray-600">▼</button>
          </div>
          {err && <p className="text-red-400 text-xs mt-0.5">{err}</p>}
        </div>
      </div>
    );
  };

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl w-[95%] max-w-5xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center p-2 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">
            <FaClock className="inline-block me-2" /> جدولة مواعيد الحصص (حد أقصى 6)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <form onSubmit={validateAndSubmit}>
          <div className="p-4 border-b border-gray-700 flex items-center gap-4">
            <label className="text-sm text-gray-300">اختر الشعبة للمواعيد الجديدة:</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-gray-700 text-white rounded-md px-3 py-1 border border-gray-600"
            >
              {classesList.map(cls => (
                <option key={cls.id} value={cls.id}>{cls.name}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">(يمكن تغييرها لكل موعد على حدة)</span>
          </div>

          <div className="space-y-6 p-4">
            {schedules.map((s, idx) => (
              <div key={s.id} className="bg-gray-800/40 p-4 rounded-xl border border-gray-700 relative">
                <div className="flex justify-between items-start">
                  <h4 className="text-sm font-semibold text-purple-300">الموعد #{idx + 1}</h4>
                  <button type="button" onClick={() => removeSchedule(s.id)} className="text-red-400 hover:text-red-300 text-sm">✕ إزالة</button>
                </div>
                <div className="flex flex-wrap gap-4 items-center mt-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-300">الشعبة:</label>
                    <select
                      value={s.classId || ''}
                      onChange={(e) => updateSchedule(s.id, { classId: e.target.value })}
                      className="bg-gray-700 text-white text-sm rounded-md px-2 py-1 border border-gray-600"
                    >
                      {classesList.map(cls => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-300">النوع:</label>
                    <select
                      value={s.type || 'once'}
                      onChange={(e) => {
                        const newType = e.target.value;
                        const updates = { type: newType };
                        if (newType === 'once') {
                          updates.day = null;
                        } else {
                          updates.date = null;
                        }
                        updateSchedule(s.id, updates);
                      }}
                      className="bg-gray-700 text-white text-sm rounded-md px-2 py-1 border border-gray-600"
                    >
                      <option value="once">مرة واحدة</option>
                      <option value="recurring">متكرر (أسبوعياً)</option>
                    </select>
                  </div>

                  {s.type === 'once' && (
                    <div className="flex items-center gap-2">
                      <Calendar selectedDate={safeDate(s.date)} onDateChange={(date) => updateSchedule(s.id, { date })} />
                    </div>
                  )}

                  {s.type === 'recurring' && (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-300">اليوم:</label>
                      <select
                        value={s.day || ''}
                        onChange={(e) => updateSchedule(s.id, { day: e.target.value })}
                        className="bg-gray-700 text-white text-sm rounded-md px-2 py-1 border border-gray-600"
                      >
                        <option value="">اختر اليوم</option>
                        {daysOfWeek.map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <ClockPicker
                      time={s.time}
                      onTimeChange={(newTime) => updateSchedule(s.id, { time: newTime })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addSchedule}
              className="text-blue-400 hover:text-blue-300 text-sm flex items-center gap-1"
              disabled={schedules.length >= 6}
            >
              <span>➕</span> إضافة موعد آخر ({schedules.length}/6)
            </button>
            {error && <p className="text-red-400 text-sm">{error}</p>}
          </div>

          <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600">إلغاء</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">
              <FaSave className="inline-block me-2" /> حفظ المواعيد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};