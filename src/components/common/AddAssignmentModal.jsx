import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaPen, FaCalendarAlt, FaUpload, FaSave, FaClock } from 'react-icons/fa';
import { sanitizeInput, arabicToEnglishNumber, safeDate } from '../../utils/helpers';

export const AddAssignmentModal = ({
  isOpen,
  onClose,
  onSubmit,
  classesList = [],
  initialMode = 'now'
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [time, setTime] = useState({ hours: 12, minutes: 0 });
  const [section, setSection] = useState('');
  const [assignmentText, setAssignmentText] = useState('');
  const [publishMode, setPublishMode] = useState(initialMode);
  const [delayHours, setDelayHours] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [delayError, setDelayError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPublishMode(initialMode);
      setDelayHours('');
      setDelayMinutes('');
      setDelayError('');
    }
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const sanitizedText = sanitizeInput(assignmentText);
    if (!sanitizedText.trim()) {
      toast.error('يرجى كتابة نص الواجب.');
      return;
    }
    if (!section) {
      toast.error('يرجى اختيار الشعبة.');
      return;
    }

    const data = {
      section,
      text: sanitizedText,
    };

    if (publishMode === 'now') {
      const now = new Date();
      data.date = now;
      data.time = { hours: now.getHours(), minutes: now.getMinutes() };
      data.is_draft = false;
      data.is_scheduled = false;
      data.reveal_time = now.toISOString();
    } else if (publishMode === 'schedule') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate <= today) {
        toast.error('يرجى اختيار يوم مستقبلي (بعد اليوم الحالي)');
        return;
      }
      data.date = selectedDate;
      data.time = time;
      data.is_draft = false;
      data.is_scheduled = true;
      const combined = new Date(selectedDate);
      combined.setHours(time.hours, time.minutes, 0, 0);
      data.reveal_time = combined.toISOString();
    } else if (publishMode === 'draft') {
      data.date = new Date();
      data.time = { hours: 0, minutes: 0 };
      data.is_draft = true;
      data.is_scheduled = false;
      data.reveal_time = null;
    } else if (publishMode === 'delay') {
      const hoursNum = parseInt(arabicToEnglishNumber(delayHours));
      const minutesNum = parseInt(arabicToEnglishNumber(delayMinutes));
      if (isNaN(hoursNum) || hoursNum < 0 || isNaN(minutesNum) || minutesNum < 0 || minutesNum > 59) {
        setDelayError('يرجى إدخال عدد ساعات صحيح (0 أو أكثر) ودقائق بين 0 و 59');
        return;
      }
      if (hoursNum === 0 && minutesNum === 0) {
        setDelayError('يرجى إدخال وقت أكبر من صفر');
        return;
      }
      setDelayError('');
      const now = new Date();
      const revealTime = new Date(now.getTime() + hoursNum * 3600000 + minutesNum * 60000);
      data.date = revealTime;
      data.time = { hours: revealTime.getHours(), minutes: revealTime.getMinutes() };
      data.is_draft = false;
      data.is_scheduled = true;
      data.reveal_time = revealTime.toISOString();
    }

    onSubmit(data);
  };

  // Inner component: Calendar
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
      <div className="p-4 w-72">
        <div className="flex justify-between items-center mb-4">
          <button onClick={goPrevMonth} className="text-xl px-2 hover:bg-white/20 rounded text-white">‹</button>
          <span className="font-bold text-lg text-white">
            {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={goNextMonth} className="text-xl px-2 hover:bg-white/20 rounded text-white">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-sm text-gray-300">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 mt-1">
          {days.map((day, idx) => {
            const disabled = isDisabled(day);
            return (
              <div
                key={idx}
                onClick={() => day && !disabled && onDateChange(day)}
                className={`text-center py-2 rounded-full cursor-pointer transition
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

  // Inner component: ClockPicker
  const ClockPicker = ({ time, onTimeChange }) => {
    const [hoursStr, setHoursStr] = useState(time.hours.toString().padStart(2, '0'));
    const [minutesStr, setMinutesStr] = useState(time.minutes.toString().padStart(2, '0'));
    const [error, setError] = useState('');

    useEffect(() => {
      setHoursStr(time.hours.toString().padStart(2, '0'));
      setMinutesStr(time.minutes.toString().padStart(2, '0'));
    }, [time]);

    const handleHoursChange = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      if (val === '') {
        setHoursStr('');
        return;
      }
      let num = parseInt(val);
      if (num > 12) num = 12;
      if (num < 1 && val.length > 0) num = 1;
      val = num.toString();
      setHoursStr(val);
      onTimeChange({ ...time, hours: num });
    };

    const handleMinutesChange = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      if (val === '') {
        setMinutesStr('');
        return;
      }
      let num = parseInt(val);
      if (num > 59) {
        setError('الدقائق يجب أن تكون بين 0 و 59');
        num = 59;
      } else {
        setError('');
      }
      if (num < 0) num = 0;
      val = num.toString().padStart(2, '0');
      setMinutesStr(val);
      onTimeChange({ ...time, minutes: num });
    };

    const incrementHour = () => {
      let h = time.hours + 1;
      if (h > 12) h = 1;
      onTimeChange({ ...time, hours: h });
    };
    const decrementHour = () => {
      let h = time.hours - 1;
      if (h < 1) h = 12;
      onTimeChange({ ...time, hours: h });
    };
    const incrementMinute = () => {
      let m = time.minutes + 1;
      if (m > 59) m = 0;
      onTimeChange({ ...time, minutes: m });
    };
    const decrementMinute = () => {
      let m = time.minutes - 1;
      if (m < 0) m = 59;
      onTimeChange({ ...time, minutes: m });
    };

    return (
      <div className="flex flex-col items-center">
        <div className="flex gap-6 mt-4">
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">ساعات</label>
            <div className="flex items-center gap-1">
              <button onClick={incrementHour} className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600">▲</button>
              <input
                type="text"
                inputMode="numeric"
                value={hoursStr}
                onChange={handleHoursChange}
                className="w-16 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500"
                maxLength="2"
              />
              <button onClick={decrementHour} className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600">▼</button>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">دقائق</label>
            <div className="flex items-center gap-1">
              <button onClick={incrementMinute} className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600">▲</button>
              <input
                type="text"
                inputMode="numeric"
                value={minutesStr}
                onChange={handleMinutesChange}
                className="w-16 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500"
                maxLength="2"
              />
              <button onClick={decrementMinute} className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-gray-600">▼</button>
            </div>
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
        </div>
      </div>
    );
  };

  // Inner component: DelayInput
  const DelayInput = ({ hours, minutes, onHoursChange, onMinutesChange, error }) => {
    const [hoursStr, setHoursStr] = useState(hours);
    const [minutesStr, setMinutesStr] = useState(minutes);

    useEffect(() => {
      setHoursStr(hours);
      setMinutesStr(minutes);
    }, [hours, minutes]);

    const handleHours = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      setHoursStr(val);
      onHoursChange(val);
    };
    const handleMinutes = (e) => {
      let val = arabicToEnglishNumber(e.target.value);
      if (val === '') {
        setMinutesStr('');
        onMinutesChange('');
        return;
      }
      let num = parseInt(val);
      if (num > 59) num = 59;
      if (num < 0) num = 0;
      val = num.toString();
      setMinutesStr(val);
      onMinutesChange(val);
    };

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-6">
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">ساعات</label>
            <input
              type="text"
              inputMode="numeric"
              value={hoursStr}
              onChange={handleHours}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">دقائق</label>
            <input
              type="text"
              inputMode="numeric"
              value={minutesStr}
              onChange={handleMinutes}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl w-[90%] max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center p-2 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">
            {publishMode === 'draft' ? (
              <><FaSave className="inline-block me-2" /> حفظ مسودة جديدة</>
            ) : (
              <><FaPen className="inline-block me-2" /> إضافة واجب جديد</>
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">الشعبة</label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-800 text-white focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">اختر الشعبة</option>
                {classesList.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">الموضوع / الواجب</label>
              <input
                type="text"
                value={assignmentText}
                onChange={(e) => setAssignmentText(e.target.value)}
                placeholder="مثلاً: حل التمارين صفحة ٥"
                className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-800 text-white focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="px-4 pb-2 flex flex-wrap gap-4 border-b border-gray-700">
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="now"
                checked={publishMode === 'now'}
                onChange={() => setPublishMode('now')}
                className="accent-blue-500"
              />
              <FaUpload className="inline-block me-1" /> نشر فوراً
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="schedule"
                checked={publishMode === 'schedule'}
                onChange={() => setPublishMode('schedule')}
                className="accent-blue-500"
              />
              <FaCalendarAlt className="inline-block me-1" /> جدولة
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="draft"
                checked={publishMode === 'draft'}
                onChange={() => setPublishMode('draft')}
                className="accent-blue-500"
              />
              <FaSave className="inline-block me-1" /> حفظ كمسودة
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="delay"
                checked={publishMode === 'delay'}
                onChange={() => setPublishMode('delay')}
                className="accent-blue-500"
              />
              <FaClock className="inline-block me-1" /> نشر بعد وقت
            </label>
          </div>

          {publishMode === 'now' && (
            <div className="p-4 text-center text-gray-300">
              ⏳ سيتم نشر الواجب فوراً دون تأخير.
            </div>
          )}
          {publishMode === 'schedule' && (
            <div className="p-4 flex flex-col md:flex-row gap-6">
              <div className="flex-1 border-l md:border-l-0 md:border-r border-gray-700 pr-4">
                <Calendar selectedDate={selectedDate} onDateChange={setSelectedDate} />
              </div>
              <div className="hidden md:block w-px bg-gray-700 self-stretch"></div>
              <div className="flex-1 pl-4">
                <ClockPicker time={time} onTimeChange={setTime} />
              </div>
            </div>
          )}
          {publishMode === 'draft' && (
            <div className="p-4 text-center text-gray-400">
              📌 سيتم حفظ الواجب كمسودة دون نشر، يمكنك نشره لاحقاً من لوحة التحكم.
            </div>
          )}
          {publishMode === 'delay' && (
            <div className="p-4 flex flex-col items-center">
              <DelayInput
                hours={delayHours}
                minutes={delayMinutes}
                onHoursChange={setDelayHours}
                onMinutesChange={setDelayMinutes}
                error={delayError}
              />
              <p className="text-xs text-gray-400 mt-2">سيتم نشر الواجب بعد المدة المحددة تلقائياً</p>
            </div>
          )}

          <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              {publishMode === 'draft' ? (
                <><FaSave className="inline-block me-2" /> حفظ المسودة</>
              ) : (
                <><FaPen className="inline-block me-2" /> إضافة الواجب</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};