import './index.css';
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import toast, { Toaster } from 'react-hot-toast';

// Firebase imports
import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  signOut
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// ========== Utility: generateId ==========
const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
};

// ========== Utility: تحويل النص العربي إلى إنجليزي (تقريبي) ==========
const arabicToEnglish = (text) => {
  const map = {
    'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'th', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ة': 'h', 'ى': 'a',
    'ء': 'a', 'ؤ': 'a', 'ئ': 'a'
  };
  return text.split('').map(ch => map[ch] || ch).join('');
};

// ========== دالة موحدة لجلب أسماء الشعب ==========
const fetchClassNames = async (classIds) => {
  if (!classIds || classIds.length === 0) return {};
  const names = {};
  for (const id of classIds) {
    try {
      const docSnap = await getDoc(doc(db, 'classes', id));
      if (docSnap.exists()) {
        names[id] = docSnap.data().name;
      } else {
        names[id] = null;
      }
    } catch (err) {
      console.error('Error fetching class name:', err);
      names[id] = null;
    }
  }
  return names;
};

// ============================================================
// 1. مكوّن إضافة الواجب (مع خيار النشر الفوري / الجدولة)
// ============================================================
const AddAssignmentModal = ({
  isOpen,
  onClose,
  onSubmit,
  classesList = []
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [time, setTime] = useState({ hours: 12, minutes: 0 });
  const [section, setSection] = useState('');
  const [assignmentText, setAssignmentText] = useState('');
  const [publishMode, setPublishMode] = useState('now');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!assignmentText.trim()) {
      toast.error('يرجى كتابة نص الواجب.');
      return;
    }
    if (!section) {
      toast.error('يرجى اختيار الشعبة.');
      return;
    }

    const data = {
      section,
      text: assignmentText,
    };

    if (publishMode === 'now') {
      const now = new Date();
      data.date = now;
      data.time = { hours: now.getHours(), minutes: now.getMinutes() };
    } else {
      data.date = selectedDate;
      data.time = time;
    }

    onSubmit(data);
  };

  const Calendar = ({ selectedDate, onDateChange }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
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
          {days.map((day, idx) => (
            <div
              key={idx}
              onClick={() => day && onDateChange(day)}
              className={`text-center py-2 rounded-full cursor-pointer transition
                ${!day ? '' :
                  isSameDay(day, selectedDate)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'hover:bg-white/10 text-white'
                }`}
            >
              {day ? day.getDate() : ''}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const ClockPicker = ({ time, onTimeChange }) => {
    const svgRef = useRef(null);
    const radius = 120;
    const center = 140;
    const [dragging, setDragging] = useState(null);

    const [hoursStr, setHoursStr] = useState(time.hours.toString().padStart(2, '0'));
    const [minutesStr, setMinutesStr] = useState(time.minutes.toString().padStart(2, '0'));

    useEffect(() => {
      setHoursStr(time.hours.toString().padStart(2, '0'));
      setMinutesStr(time.minutes.toString().padStart(2, '0'));
    }, [time]);

    const getAngle = (hours, minutes) => {
      const hAngle = (hours % 12) * (Math.PI / 6) + minutes * (Math.PI / 360);
      const mAngle = minutes * (Math.PI / 30);
      return { hAngle, mAngle };
    };

    const getCoords = (angle) => {
      const x = center + radius * 0.7 * Math.sin(angle);
      const y = center - radius * 0.7 * Math.cos(angle);
      return { x, y };
    };

    const handleMouseDown = (type) => (e) => {
      e.preventDefault();
      setDragging(type);
    };

    const handleMouseMove = (e) => {
      if (!dragging) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - center;
      const mouseY = e.clientY - rect.top - center;
      let angle = Math.atan2(mouseX, -mouseY);
      if (angle < 0) angle += 2 * Math.PI;

      let newHours = time.hours;
      let newMinutes = time.minutes;

      if (dragging === 'hour') {
        const hoursFromAngle = (angle / (2 * Math.PI)) * 12;
        newHours = Math.round(hoursFromAngle) % 12 || 12;
      } else if (dragging === 'minute') {
        const minutesFromAngle = (angle / (2 * Math.PI)) * 60;
        newMinutes = Math.round(minutesFromAngle) % 60;
      }

      onTimeChange({ hours: newHours, minutes: newMinutes });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    useEffect(() => {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [dragging]);

    const { hAngle, mAngle } = getAngle(time.hours, time.minutes);
    const hourCoords = getCoords(hAngle);
    const minuteCoords = getCoords(mAngle);

    const handleHoursChange = (e) => {
      const val = e.target.value;
      setHoursStr(val);
    };

    const handleHoursBlur = () => {
      let val = parseInt(hoursStr);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 12) val = 12;
      setHoursStr(val.toString().padStart(2, '0'));
      onTimeChange({ ...time, hours: val });
    };

    const handleMinutesChange = (e) => {
      const val = e.target.value;
      setMinutesStr(val);
    };

    const handleMinutesBlur = () => {
      let val = parseInt(minutesStr);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 59) val = 59;
      setMinutesStr(val.toString().padStart(2, '0'));
      onTimeChange({ ...time, minutes: val });
    };

    return (
      <div className="flex flex-col items-center">
        <svg ref={svgRef} width={280} height={280} viewBox="0 0 280 280" className="cursor-pointer">
          <circle cx={center} cy={center} r={radius} fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * 2 * Math.PI;
            const x1 = center + radius * 0.85 * Math.sin(angle);
            const y1 = center - radius * 0.85 * Math.cos(angle);
            const x2 = center + radius * 0.95 * Math.sin(angle);
            const y2 = center - radius * 0.95 * Math.cos(angle);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.6)" strokeWidth="3" />
            );
          })}
          <line
            x1={center} y1={center}
            x2={hourCoords.x} y2={hourCoords.y}
            stroke="#fff" strokeWidth="6" strokeLinecap="round"
            onMouseDown={handleMouseDown('hour')}
          />
          <line
            x1={center} y1={center}
            x2={minuteCoords.x} y2={minuteCoords.y}
            stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"
            onMouseDown={handleMouseDown('minute')}
          />
          <circle cx={center} cy={center} r={8} fill="#ef4444" />
          {[...Array(12)].map((_, i) => {
            const num = i === 0 ? 12 : i;
            const angle = (i / 12) * 2 * Math.PI;
            const x = center + radius * 0.72 * Math.sin(angle);
            const y = center - radius * 0.72 * Math.cos(angle);
            return (
              <text key={i} x={x} y={y + 5} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="bold">
                {num}
              </text>
            );
          })}
        </svg>

        <div className="flex gap-4 mt-4">
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">ساعات</label>
            <input
              type="text"
              maxLength="2"
              value={hoursStr}
              onChange={handleHoursChange}
              onBlur={handleHoursBlur}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">دقائق</label>
            <input
              type="text"
              maxLength="2"
              value={minutesStr}
              onChange={handleMinutesChange}
              onBlur={handleMinutesBlur}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl w-[90%] max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center p-2 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">إضافة واجب جديد</h2>
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
              نشر فوراً
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="schedule"
                checked={publishMode === 'schedule'}
                onChange={() => setPublishMode('schedule')}
                className="accent-blue-500"
              />
              جدولة
            </label>
          </div>

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
              إضافة الواجب
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 2. مكوّن جدولة موعد الحصة (منفصل)
// ============================================================
const AddLessonModal = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [time, setTime] = useState({ hours: 12, minutes: 0 });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ date: selectedDate, time });
  };

  const Calendar = ({ selectedDate, onDateChange }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate));
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
          {days.map((day, idx) => (
            <div
              key={idx}
              onClick={() => day && onDateChange(day)}
              className={`text-center py-2 rounded-full cursor-pointer transition
                ${!day ? '' :
                  isSameDay(day, selectedDate)
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'hover:bg-white/10 text-white'
                }`}
            >
              {day ? day.getDate() : ''}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const ClockPicker = ({ time, onTimeChange }) => {
    const svgRef = useRef(null);
    const radius = 120;
    const center = 140;
    const [dragging, setDragging] = useState(null);

    const [hoursStr, setHoursStr] = useState(time.hours.toString().padStart(2, '0'));
    const [minutesStr, setMinutesStr] = useState(time.minutes.toString().padStart(2, '0'));

    useEffect(() => {
      setHoursStr(time.hours.toString().padStart(2, '0'));
      setMinutesStr(time.minutes.toString().padStart(2, '0'));
    }, [time]);

    const getAngle = (hours, minutes) => {
      const hAngle = (hours % 12) * (Math.PI / 6) + minutes * (Math.PI / 360);
      const mAngle = minutes * (Math.PI / 30);
      return { hAngle, mAngle };
    };

    const getCoords = (angle) => {
      const x = center + radius * 0.7 * Math.sin(angle);
      const y = center - radius * 0.7 * Math.cos(angle);
      return { x, y };
    };

    const handleMouseDown = (type) => (e) => {
      e.preventDefault();
      setDragging(type);
    };

    const handleMouseMove = (e) => {
      if (!dragging) return;
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - center;
      const mouseY = e.clientY - rect.top - center;
      let angle = Math.atan2(mouseX, -mouseY);
      if (angle < 0) angle += 2 * Math.PI;

      let newHours = time.hours;
      let newMinutes = time.minutes;

      if (dragging === 'hour') {
        const hoursFromAngle = (angle / (2 * Math.PI)) * 12;
        newHours = Math.round(hoursFromAngle) % 12 || 12;
      } else if (dragging === 'minute') {
        const minutesFromAngle = (angle / (2 * Math.PI)) * 60;
        newMinutes = Math.round(minutesFromAngle) % 60;
      }

      onTimeChange({ hours: newHours, minutes: newMinutes });
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    useEffect(() => {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [dragging]);

    const { hAngle, mAngle } = getAngle(time.hours, time.minutes);
    const hourCoords = getCoords(hAngle);
    const minuteCoords = getCoords(mAngle);

    const handleHoursChange = (e) => {
      const val = e.target.value;
      setHoursStr(val);
    };

    const handleHoursBlur = () => {
      let val = parseInt(hoursStr);
      if (isNaN(val) || val < 1) val = 1;
      if (val > 12) val = 12;
      setHoursStr(val.toString().padStart(2, '0'));
      onTimeChange({ ...time, hours: val });
    };

    const handleMinutesChange = (e) => {
      const val = e.target.value;
      setMinutesStr(val);
    };

    const handleMinutesBlur = () => {
      let val = parseInt(minutesStr);
      if (isNaN(val) || val < 0) val = 0;
      if (val > 59) val = 59;
      setMinutesStr(val.toString().padStart(2, '0'));
      onTimeChange({ ...time, minutes: val });
    };

    return (
      <div className="flex flex-col items-center">
        <svg ref={svgRef} width={280} height={280} viewBox="0 0 280 280" className="cursor-pointer">
          <circle cx={center} cy={center} r={radius} fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          {[...Array(12)].map((_, i) => {
            const angle = (i / 12) * 2 * Math.PI;
            const x1 = center + radius * 0.85 * Math.sin(angle);
            const y1 = center - radius * 0.85 * Math.cos(angle);
            const x2 = center + radius * 0.95 * Math.sin(angle);
            const y2 = center - radius * 0.95 * Math.cos(angle);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.6)" strokeWidth="3" />
            );
          })}
          <line
            x1={center} y1={center}
            x2={hourCoords.x} y2={hourCoords.y}
            stroke="#fff" strokeWidth="6" strokeLinecap="round"
            onMouseDown={handleMouseDown('hour')}
          />
          <line
            x1={center} y1={center}
            x2={minuteCoords.x} y2={minuteCoords.y}
            stroke="#3b82f6" strokeWidth="4" strokeLinecap="round"
            onMouseDown={handleMouseDown('minute')}
          />
          <circle cx={center} cy={center} r={8} fill="#ef4444" />
          {[...Array(12)].map((_, i) => {
            const num = i === 0 ? 12 : i;
            const angle = (i / 12) * 2 * Math.PI;
            const x = center + radius * 0.72 * Math.sin(angle);
            const y = center - radius * 0.72 * Math.cos(angle);
            return (
              <text key={i} x={x} y={y + 5} textAnchor="middle" fontSize="14" fill="#fff" fontWeight="bold">
                {num}
              </text>
            );
          })}
        </svg>

        <div className="flex gap-4 mt-4">
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">ساعات</label>
            <input
              type="text"
              maxLength="2"
              value={hoursStr}
              onChange={handleHoursChange}
              onBlur={handleHoursBlur}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
          <div className="flex flex-col items-center">
            <label className="text-sm font-medium text-gray-300">دقائق</label>
            <input
              type="text"
              maxLength="2"
              value={minutesStr}
              onChange={handleMinutesChange}
              onBlur={handleMinutesBlur}
              className="w-20 px-3 py-2 border border-gray-600 rounded-md text-center bg-gray-800 text-white focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl w-[90%] max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        <div className="flex justify-between items-center p-2 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">جدولة موعد الحصة</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 flex flex-col md:flex-row gap-6">
            <div className="flex-1 border-l md:border-l-0 md:border-r border-gray-700 pr-4">
              <Calendar selectedDate={selectedDate} onDateChange={setSelectedDate} />
            </div>
            <div className="hidden md:block w-px bg-gray-700 self-stretch"></div>
            <div className="flex-1 pl-4">
              <ClockPicker time={time} onTimeChange={setTime} />
            </div>
          </div>

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
              حفظ الموعد
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// باقي المكونات (CountdownTimer, HomeworkTextCountdown, ConfirmContext, إلخ)
// ============================================================

const useDynamicBackground = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes logoPulseSoft {
        0% { transform: scale(1); opacity: 0.12; }
        50% { transform: scale(1.04); opacity: 0.18; }
        100% { transform: scale(1); opacity: 0.12; }
      }
      .animate-logo-bg {
        animation: logoPulseSoft 6s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);

    const bgGradients = [
      'linear-gradient(135deg, #0f172a, #1e1b4b, #311042)',
      'linear-gradient(135deg, #090d16, #111827, #1f2937)',
      'linear-gradient(135deg, #020617, #0f172a, #1e293b)',
      'linear-gradient(135deg, #070a13, #161224, #281432)'
    ];
    let currentIndex = 0;

    document.body.style.background = bgGradients[currentIndex];
    document.body.style.transition = 'background 4s ease-in-out';

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % bgGradients.length;
      document.body.style.background = bgGradients[currentIndex];
    }, 7000);

    return () => {
      clearInterval(interval);
      document.body.style.background = '';
      document.body.style.transition = '';
      document.head.removeChild(style);
    };
  }, []);
};

const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calculateTime = () => {
      if (!targetDate) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return true;
      }
      const target = new Date(targetDate).getTime();
      if (isNaN(target)) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return true;
      }
      const now = new Date().getTime();
      const distance = target - now;
      if (distance <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return true;
      }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
      return false;
    };

    calculateTime();
    const interval = setInterval(() => {
      const ended = calculateTime();
      if (ended) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const labels = { days: 'أيام', hours: 'ساعات', minutes: 'دقائق', seconds: 'ثواني' };

  return (
    <div className="flex gap-4 text-center flex-wrap justify-center">
      {Object.entries(timeLeft).map(([unit, value]) => (
        <div key={unit} className="bg-gray-800/80 p-4 min-w-[85px] rounded-2xl border border-gray-700 shadow-md">
          <div className="text-3xl font-bold text-purple-300 drop-shadow">{value}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400 mt-1">{labels[unit]}</div>
        </div>
      ))}
    </div>
  );
};

const HomeworkTextCountdown = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isPast, setIsPast] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const target = new Date(targetDate).getTime();
      const now = new Date().getTime();
      const distance = target - now;
      if (distance <= 0) {
        setIsPast(true);
        return true;
      }
      setIsPast(false);
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      });
      return false;
    };

    calculate();
    const interval = setInterval(() => {
      const ended = calculate();
      if (ended) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (isPast) return null;

  return (
    <div className="text-sm font-semibold text-pink-300 mt-2 tracking-wide bg-pink-950/30 px-4 py-2 rounded-xl inline-block border border-pink-500/20 animate-pulse">
      متبقي على إظهار الواجب : {timeLeft.days} يوم :{timeLeft.hours} ساعة :{timeLeft.minutes} دقائق :{timeLeft.seconds} ثواني
    </div>
  );
};

// ========== Confirm Context ==========
const ConfirmContext = createContext();

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null
  });

  const showConfirm = (title, message) => {
    return new Promise((resolve) => {
      setState({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          setState({ ...state, isOpen: false });
          resolve(true);
        },
        onCancel: () => {
          setState({ ...state, isOpen: false });
          resolve(false);
        }
      });
    });
  };

  return (
    <ConfirmContext.Provider value={showConfirm}>
      {children}
      {state.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-2">{state.title}</h3>
            <p className="text-gray-300 mb-4">{state.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={state.onCancel}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
              >
                إلغاء
              </button>
              <button
                onClick={state.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);

// ========== FrozenAccount ==========
const FrozenAccount = ({ user, onLogout }) => {
  const studentName = user?.name || user?.username || 'الطالب';
  const studentClass = user?.class_name || 'غير محدد';
  const studentUsername = user?.username || 'غير مسجل';
  const studentWhatsApp = user?.phone || 'غير مسجل';

  const waMessage = encodeURIComponent(
    `السلام عليكم ورحمة الله وبركاته\n` +
    `الموضوع: طلب فك تجميد حساب - [${studentName}]\n\n` +
    `مرحباً أستاذ همام هاني محمد ،\n` +
    `أرجو منكم التكرم بفك تجميد حسابي في التطبيق، حيث أنني حالياً لا أستطيع الوصول للمحتوى التعليمي.\n\n` +
    `بيانات الطالب:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `اسم المستخدم: ${studentUsername}\n` +
    `الشعبة: ${studentClass}\n` +
    `رقم واتساب: ${studentWhatsApp}\n\n` +
    `شاكراً لكم تعاونكم.`
  );

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-700 text-center space-y-6">
          <div className="text-6xl mb-2">🚫</div>
          <h2 className="text-2xl font-bold text-red-400">الحساب مجمد</h2>
          <p className="text-gray-300 leading-relaxed">
            يرجى التواصل مع <strong className="text-purple-300">رئيس قسم التكنولوجيا وإدارة المعلومات: همام هاني محمد</strong> عبر واتساب.
          </p>
          <a
            href={`https://wa.me/962786117388?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-4 text-lg bg-green-600 hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
          >
            <span>💬</span> اضغط هنا للتواصل مع المشرف
          </a>
          <button
            onClick={onLogout}
            type="button"
            className="text-sm text-gray-400 hover:text-white transition-colors mt-4"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
};

// ========== CompleteProfile ==========
const CompleteProfile = ({ user, onSuccess, onCancel }) => {
  useEffect(() => {
    toast('يرجى استخدام رابط "تسجيل الدخول لأول مرة" لإكمال حسابك.', { icon: 'ℹ️' });
    onCancel();
  }, [onCancel]);
  return null;
};

// ============================================================
// Login - تصميم محسّن مع الحفاظ على الخلفيات الزجاجية والمتحركة
// ============================================================
const Login = ({ onLogin, onFrozen, onCompleteProfile }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activationMode, setActivationMode] = useState(false);
  const [activationStep, setActivationStep] = useState(1);
  const [activationProfile, setActivationProfile] = useState(null);
  const [activationConfirmName, setActivationConfirmName] = useState('');
  const [activationConfirmGender, setActivationConfirmGender] = useState('');
  const [activationConfirmAge, setActivationConfirmAge] = useState('');
  const [activationConfirmPhone, setActivationConfirmPhone] = useState('');
  const [activationNewUsername, setActivationNewUsername] = useState('');
  const [activationNewPassword, setActivationNewPassword] = useState('');
  const [activationConfirmPassword, setActivationConfirmPassword] = useState('');
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationError, setActivationError] = useState('');

  const confirm = useConfirm();

  const handleUsernameChange = (e) => {
    const raw = e.target.value;
    const converted = arabicToEnglish(raw);
    setUsername(converted);
  };

  const handleActivationNewUsernameChange = (e) => {
    const raw = e.target.value;
    const converted = arabicToEnglish(raw);
    setActivationNewUsername(converted);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        setError('يرجى إدخال اسم المستخدم');
        setLoading(false);
        return;
      }

      const q = query(collection(db, 'profiles'), where('username', '==', cleanUsername));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError('اسم المستخدم غير موجود. تأكد من أن المعلم قام بإضافتك.');
        setLoading(false);
        return;
      }

      const profileDoc = querySnapshot.docs[0];
      const profileData = profileDoc.data();
      const email = `${cleanUsername}@readandrise.com`;

      let firebaseUser = null;
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      } catch (loginErr) {
        if (loginErr.code === 'auth/user-not-found') {
          setError('لم يتم إنشاء حسابك بعد. يرجى استخدام رابط "تسجيل الدخول لأول مرة" لتفعيل الحساب.');
          setLoading(false);
          return;
        } else {
          throw loginErr;
        }
      }

      const docSnap = await getDoc(doc(db, 'profiles', firebaseUser.uid));
      if (!docSnap.exists()) {
        setError('بياناتك غير مكتملة في النظام. يرجى التواصل مع المعلم.');
        setLoading(false);
        return;
      }

      const profile = docSnap.data();

      if (profile.isFrozen) {
        onFrozen({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          classIds: profile.classIds || []
        });
        setLoading(false);
        return;
      }

      if (!profile.isProfileComplete) {
        onCompleteProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || cleanUsername,
          ...profile
        });
        setLoading(false);
        return;
      }

      onLogin({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        classIds: profile.classIds || [],
        needsPasswordChange: profile.infoVerified === false,
        isProfileComplete: true
      });
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        setError('كلمة المرور غير صحيحة');
      } else if (err.code === 'auth/too-many-requests') {
        setError('تم حظر الحساب مؤقتاً بسبب كثرة المحاولات، حاول لاحقاً');
      } else {
        setError(err.message || 'حدث خطأ غير متوقع.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleActivationStep1 = async (e) => {
    e.preventDefault();
    setActivationError('');
    setActivationLoading(true);

    const name = activationConfirmName.trim();
    const gender = activationConfirmGender.trim();
    const age = activationConfirmAge.trim();
    const phone = activationConfirmPhone.trim();

    if (!name || !gender || !age || !phone) {
      setActivationError('جميع الحقول مطلوبة');
      setActivationLoading(false);
      return;
    }

    try {
      const qName = query(collection(db, 'profiles'), where('name', '==', name));
      const snapshot = await getDocs(qName);

      let foundProfile = null;
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.gender === gender && String(data.age) === age && data.phone === phone) {
          foundProfile = { id: doc.id, ...data };
        }
      });

      if (!foundProfile) {
        setActivationError('لا يوجد طالب بهذه المعلومات. تأكد من دقة البيانات أو تواصل مع المعلم.');
        setActivationLoading(false);
        return;
      }

      if (foundProfile.isProfileComplete) {
        setActivationError('هذا الحساب مفعل بالفعل. يرجى تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور.');
        setActivationLoading(false);
        return;
      }

      setActivationProfile(foundProfile);
      setActivationStep(2);
      setActivationLoading(false);
    } catch (err) {
      console.error(err);
      setActivationError('حدث خطأ أثناء البحث: ' + err.message);
      setActivationLoading(false);
    }
  };

  const handleActivationStep2 = async (e) => {
    e.preventDefault();
    setActivationError('');

    const usernameRegex = /^[a-zA-Z0-9@._-]+$/;
    const newUsername = activationNewUsername.trim();
    if (!usernameRegex.test(newUsername)) {
      setActivationError('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط');
      return;
    }
    if (!usernameRegex.test(activationNewPassword)) {
      setActivationError('كلمة المرور يجب أن تحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط');
      return;
    }
    if (activationNewPassword !== activationConfirmPassword) {
      setActivationError('كلمة المرور غير متطابقة مع تأكيدها');
      return;
    }
    if (activationNewPassword.length < 6) {
      setActivationError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    const q = query(collection(db, 'profiles'), where('username', '==', newUsername));
    const querySnap = await getDocs(q);
    let exists = false;
    querySnap.forEach(doc => {
      if (doc.id !== activationProfile.id) exists = true;
    });
    if (exists) {
      setActivationError('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار آخر');
      return;
    }

    setActivationLoading(true);

    try {
      const email = `${newUsername}@readandrise.com`;
      const userCredential = await createUserWithEmailAndPassword(auth, email, activationNewPassword);
      const newUid = userCredential.user.uid;

      const oldDocRef = doc(db, 'profiles', activationProfile.id);
      const oldDocSnap = await getDoc(oldDocRef);
      if (!oldDocSnap.exists()) {
        throw new Error('بيانات الملف الشخصي غير موجودة');
      }
      const studentData = oldDocSnap.data();

      const newDocRef = doc(db, 'profiles', newUid);
      await setDoc(newDocRef, {
        ...studentData,
        username: newUsername,
        email: email,
        isProfileComplete: true,
        infoVerified: true,
        updatedAt: serverTimestamp()
      });

      await deleteDoc(oldDocRef);

      toast.success(`تم تفعيل حسابك بنجاح!\nاسم المستخدم: ${newUsername}\nيمكنك الآن تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور.`);
      setActivationMode(false);
      setActivationStep(1);
      setActivationProfile(null);
      setActivationNewUsername('');
      setActivationNewPassword('');
      setActivationConfirmPassword('');
      setActivationLoading(false);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setActivationError('البريد الإلكتروني مستخدم بالفعل. قد يكون الحساب مفعلاً مسبقاً.');
      } else {
        setActivationError('فشل التفعيل: ' + (err.message || 'خطأ غير معروف'));
      }
      setActivationLoading(false);
    }
  };

  const cancelActivation = () => {
    setActivationMode(false);
    setActivationStep(1);
    setActivationProfile(null);
    setActivationError('');
  };

  // وضع التفعيل
  if (activationMode) {
    return (
      <div className="container-center relative min-h-screen overflow-hidden" dir="rtl">
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
        <div className="relative z-10 w-full max-w-md px-4">
          <div className="glass p-8 flex flex-col items-center">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-400 text-transparent bg-clip-text mb-4">
              تفعيل الحساب لأول مرة
            </h2>
            {activationStep === 1 && (
              <form onSubmit={handleActivationStep1} className="space-y-4 w-full">
                <p className="text-gray-300 text-sm text-center">يرجى إدخال المعلومات كما هي مسجلة لدينا للتأكيد</p>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">الاسم الكامل</label>
                  <input type="text" className="input-glass" value={activationConfirmName} onChange={e => setActivationConfirmName(e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">الجنس</label>
                  <select className="input-glass" value={activationConfirmGender} onChange={e => setActivationConfirmGender(e.target.value)} required>
                    <option value="">اختر</option>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">العمر</label>
                  <input type="number" className="input-glass" value={activationConfirmAge} onChange={e => setActivationConfirmAge(e.target.value)} required />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">رقم الهاتف</label>
                  <input type="text" className="input-glass" value={activationConfirmPhone} onChange={e => setActivationConfirmPhone(e.target.value)} required />
                </div>
                {activationError && <p className="text-red-400 text-sm text-center">{activationError}</p>}
                <button type="submit" disabled={activationLoading} className="btn-primary w-full">
                  {activationLoading ? 'جاري البحث...' : 'تأكيد المعلومات'}
                </button>
                <button type="button" onClick={cancelActivation} className="text-sm text-gray-400 hover:text-white w-full text-center mt-2">عودة لتسجيل الدخول</button>
              </form>
            )}
            {activationStep === 2 && (
              <form onSubmit={handleActivationStep2} className="space-y-4 w-full">
                <p className="text-gray-300 text-sm text-center">اختر اسم مستخدم وكلمة مرور جديدة</p>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">اسم المستخدم الجديد</label>
                  <input type="text" className="input-glass" value={activationNewUsername} onChange={handleActivationNewUsernameChange} required pattern="[a-zA-Z0-9@._-]+" />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">كلمة المرور الجديدة</label>
                  <input type="password" className="input-glass" value={activationNewPassword} onChange={e => setActivationNewPassword(e.target.value)} required minLength="6" />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">تأكيد كلمة المرور</label>
                  <input type="password" className="input-glass" value={activationConfirmPassword} onChange={e => setActivationConfirmPassword(e.target.value)} required />
                </div>
                {activationError && <p className="text-red-400 text-sm text-center">{activationError}</p>}
                <button type="submit" disabled={activationLoading} className="btn-primary w-full bg-gradient-to-r from-purple-500 to-purple-700">
                  {activationLoading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
                </button>
                <button type="button" onClick={cancelActivation} className="text-sm text-gray-400 hover:text-white w-full text-center mt-2">إلغاء</button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // واجهة تسجيل الدخول المحسّنة (مع الحفاظ على الخلفيات)
  return (
    <div className="container-center relative min-h-screen overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-8 flex flex-col items-center">
          <div className="text-center mb-6">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
              الفرسان التقنيين
            </h2>
            <p className="text-gray-300 text-sm mt-1">اقرأ وارتق</p>
            <div className="mt-2 inline-block bg-black/30 px-4 py-1 rounded-full text-xs text-gray-300 border border-gray-600">
              المعلم: همام هاني محمد
            </div>
          </div>

          <form onSubmit={handleAuth} className="space-y-5 w-full">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">اسم المستخدم</label>
              <input
                type="text"
                className="input-glass"
                placeholder="أدخل اسم المستخدم"
                value={username}
                onChange={handleUsernameChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="input-glass pr-12"
                  placeholder="أدخل كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors bg-gray-700/30 px-2 py-1 rounded"
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="btn-primary w-full py-3 text-lg"
              disabled={loading}
            >
              {loading ? 'جاري التحميل...' : 'تسجيل الدخول'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setActivationMode(true)}
              className="text-sm text-blue-400 hover:text-blue-300 underline transition-colors"
            >
              تسجيل الدخول لأول مرة (تفعيل الحساب)
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-700 text-center text-xs text-gray-500 w-full">
            جميع الحقوق محفوظة © 2026 همام هاني محمد علي
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TeacherPanel (معدل)
// ============================================================
const TeacherPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [lessonTime, setLessonTime] = useState('');
  const [homeworks, setHomeworks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingReviews, setPendingReviews] = useState([]);

  // حالات المودالات
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showManageClassesModal, setShowManageClassesModal] = useState(false);

  // حالات مودال الرسالة العامة
  const [showGeneralMessageModal, setShowGeneralMessageModal] = useState(false);
  const [generalMessageSubject, setGeneralMessageSubject] = useState('');
  const [generalMessageText, setGeneralMessageText] = useState('');
  const [selectedStudentForMessage, setSelectedStudentForMessage] = useState(null);

  // حالات إدارة الشعب
  const [newClassName, setNewClassName] = useState('');
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState('');

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGender, setNewStudentGender] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentClassIds, setNewStudentClassIds] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);

  // حالات المودالات الإجبارية
  const [showAddNotificationModal, setShowAddNotificationModal] = useState(false);
  const [newlyAddedStudent, setNewlyAddedStudent] = useState(null);
  const [showFreezeNotificationModal, setShowFreezeNotificationModal] = useState(false);
  const [frozenStudent, setFrozenStudent] = useState(null);

  const cleanPhoneNumber = (phone) => {
    if (!phone) return '';
    return phone.replace(/^0+/, '').replace(/[^0-9]/g, '');
  };

  const fetchTeacherData = async () => {
    try {
      const teacherId = user.id;
      const teacherRef = doc(db, 'teachers', teacherId);
      let teacherDoc = await getDoc(teacherRef);

      if (!teacherDoc.exists()) {
        await setDoc(teacherRef, {
          lessonTime: null,
          homeworks: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        teacherDoc = await getDoc(teacherRef);
      }

      const teacherData = teacherDoc.data();
      setLessonTime(teacherData.lessonTime || '');
      setHomeworks(teacherData.homeworks || []);

      const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentsQuery);
      let studentsList = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const allClassIds = studentsList.flatMap(s => s.classIds || []);
      const classMap = await fetchClassNames(allClassIds);
      studentsList = studentsList.map(s => ({
        ...s,
        classes: (s.classIds || [])
          .map(id => ({ id, name: classMap[id] || null }))
          .filter(c => c.name)
      }));
      setStudents(studentsList);

      const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', teacherId));
      const classesSnapshot = await getDocs(classesQuery);
      let classesList = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (classesList.length === 0) {
        const defaultClasses = [
          { name: 'أساسيات البرمجة', teacherId: teacherId },
          { name: 'بايثون (Python)', teacherId: teacherId }
        ];
        const created = [];
        for (const cls of defaultClasses) {
          const ref = doc(collection(db, 'classes'));
          await setDoc(ref, { ...cls, createdAt: serverTimestamp() });
          created.push({ id: ref.id, ...cls });
        }
        classesList = created;
      }
      setClasses(classesList);

      const pendingQuery = query(
        collection(db, 'profiles'),
        where('role', '==', 'student'),
        where('pendingChanges', '!=', null)
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      let pendingList = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const pendingClassIds = pendingList.flatMap(s => s.classIds || []);
      const pendingClassMap = await fetchClassNames(pendingClassIds);
      pendingList = pendingList.map(s => ({
        ...s,
        classes: (s.classIds || [])
          .map(id => ({ id, name: pendingClassMap[id] || null }))
          .filter(c => c.name)
      }));
      setPendingReviews(pendingList);

    } catch (err) {
      console.error('Error fetching teacher data:', err);
      setErrorMsg('فشل تحميل البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeacherData();

    const teacherRef = doc(db, 'teachers', user.id);
    const unsubscribeTeacher = onSnapshot(teacherRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLessonTime(data.lessonTime || '');
        setHomeworks(data.homeworks || []);
      }
    });

    const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const unsubscribeStudents = onSnapshot(studentsQuery, async (snapshot) => {
      let studentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const allClassIds = studentsList.flatMap(s => s.classIds || []);
      const classMap = await fetchClassNames(allClassIds);
      studentsList = studentsList.map(s => ({
        ...s,
        classes: (s.classIds || [])
          .map(id => ({ id, name: classMap[id] || null }))
          .filter(c => c.name)
      }));
      setStudents(studentsList);
    });

    const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', user.id));
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      const classesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(classesList);
    });

    const pendingQuery = query(
      collection(db, 'profiles'),
      where('role', '==', 'student'),
      where('pendingChanges', '!=', null)
    );
    const unsubscribePending = onSnapshot(pendingQuery, async (snapshot) => {
      let pendingList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const pendingClassIds = pendingList.flatMap(s => s.classIds || []);
      const pendingClassMap = await fetchClassNames(pendingClassIds);
      pendingList = pendingList.map(s => ({
        ...s,
        classes: (s.classIds || [])
          .map(id => ({ id, name: pendingClassMap[id] || null }))
          .filter(c => c.name)
      }));
      setPendingReviews(pendingList);
    });

    return () => {
      unsubscribeTeacher();
      unsubscribeStudents();
      unsubscribeClasses();
      unsubscribePending();
    };
  }, [user.id]);

  // ===== دوال إرسال رسائل واتساب =====
  const sendActivationMessage = (student) => {
    const phone = student.phone || '';
    if (!phone) {
      toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
      return;
    }
    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) {
      toast.error('رقم الهاتف غير صالح.');
      return;
    }
    const studentName = student.name || '';
    const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
    const studentAge = student.age || 'غير محدد';
    const studentGender = student.gender || 'غير محدد';
    const message = encodeURIComponent(
      `الموضوع: تأكيد تفعيل حسابك في الفرسان التقنيين - اقرأ وارتق\n\n` +
      `عزيزي الطالب ${studentName}،\n` +
      `يسعدنا انضمامك إلينا في بيئة التعلم الرقمية الخاصة بـ "الفرسان التقنيين". نود إبلاغك بأنه تم إنشاء حسابك بنجاح، ونرفق لكم أدناه البيانات المسجلة في نظامنا:\n` +
      `الاسم الكامل: ${studentName}\n` +
      `الصف الدراسي: ${studentClass}\n` +
      `رقم الهاتف: ${student.phone || 'غير مسجل'}\n` +
      `العمر: ${studentAge}\n` +
      `الجنس: ${studentGender}\n\n` +
      `خطوة أخيرة لتفعيل الحساب:\n` +
      `لإتمام عملية التسجيل، يرجى الانتقال إلى الرابط أدناه وتسجيل الدخول لأول مرة لملء البيانات اللازمة وتأكيد حسابك:\n` +
      `https://read-and-rise-two.vercel.app/\n\n` +
      `نرجو منكم الاحتفاظ بهذه البيانات، والالتزام بالقوانين التعليمية المتبعة. نتمنى لكم رحلة تعليمية مثمرة ومليئة بالإنجازات.\n\n` +
      `مع التقدير،\n` +
      `همام هاني محمد علي\n` +
      `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
    );
    window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
  };

  const sendFreezeMessage = (student) => {
    const phone = student.phone || '';
    if (!phone) {
      toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
      return;
    }
    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) {
      toast.error('رقم الهاتف غير صالح.');
      return;
    }
    const studentName = student.name || '';
    const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
    const message = encodeURIComponent(
      `الموضوع: إشعار بشأن حساب الطالب في منصة "اقرأ وارتق"\n\n` +
      `عزيزي ولي أمر الطالب/ة ${studentName} المحترم،\n` +
      `تحية طيبة وبعد،،\n` +
      `نود إحاطتكم علماً بأنه قد تم إجراء "تجميد مؤقت" لحساب الطالب في منصة الفرسان التقنيين - اقرأ وارتق التعليمية. يأتي هذا الإجراء وفقاً للسياسات التنظيمية المتبعة في المنصة لضمان سير العملية التعليمية بفعالية.\n\n` +
      `بيانات الطالب:\n` +
      `اسم الطالب: ${studentName}\n` +
      `الصف الدراسي: ${studentClass}\n` +
      `سبب الإجراء: عدم الالتزام بالحصص والانقطاع لفترة طويلة\n\n` +
      `نرجو منكم التواصل معنا لمناقشة الإجراءات اللازمة لفك التجميد وإعادة تفعيل الحساب لضمان استمرارية الطالب في مسيرته التعليمية دون انقطاع.\n` +
      `نحن نقدر حرصكم الدائم على متابعة مستوى الطالب ونتطلع لتعاونكم معنا.\n\n` +
      `مع التقدير،\n` +
      `همام هاني محمد علي\n` +
      `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
    );
    window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
  };

  const sendResetPasswordMessage = (student) => {
    const phone = student.phone || '';
    if (!phone) {
      toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
      return;
    }
    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) {
      toast.error('رقم الهاتف غير صالح.');
      return;
    }
    const studentName = student.name || '';
    const message = encodeURIComponent(
      `الموضوع: تم إعادة تعيين بيانات دخولك - بانتظار تحديث حسابك في "اقرأ وارتق"\n\n` +
      `عزيزي الطالب ${studentName}،\n` +
      `نود إعلامك بأنه قد تمت إعادة تعيين بيانات الدخول الخاصة بحسابك في منصة الفرسان التقنيين - اقرأ وارتق لتصحيح بياناتك.\n\n` +
      `ما الخطوة التالية؟\n` +
      `بما أن الحساب الآن يحتاج لبيانات جديدة، يرجى التوجه إلى رابط تسجيل الدخول لأول مرة وتعبئة اسم المستخدم وكلمة المرور الخاصة بك من جديد:\n` +
      `https://read-and-rise-two.vercel.app/\n\n` +
      `ملاحظة هامة:\n` +
      `بمجرد دخولك وتعبئة البيانات المطلوبة، سيتم ربط حسابك ببياناتك الدراسية الموجودة مسبقاً في النظام.\n\n` +
      `للاستفسار والدعم الفني:\n` +
      `لأي استفسار حول طريقة إكمال المعلومات، أو في حال وجود معلومات ناقصة، لا تتردد بالتواصل معي مباشرة عبر الرقم التالي:\n` +
      `+962 7 8611 7388\n\n` +
      `نحن هنا لضمان تجربة تعليمية آمنة ومستقرة لكم.\n\n` +
      `مع التقدير،\n` +
      `همام هاني محمد علي\n` +
      `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
    );
    window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
  };

  const sendGeneralMessage = (student) => {
    if (!student) {
      toast.error('يرجى اختيار طالب.');
      return;
    }
    const phone = student.phone || '';
    if (!phone) {
      toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
      return;
    }
    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) {
      toast.error('رقم الهاتف غير صالح.');
      return;
    }
    const studentName = student.name || '';
    const material = student.classes?.length > 0 ? student.classes[0].name : 'لا توجد شعبة';
    const subject = generalMessageSubject.trim() || 'إشعار رسمي';
    const body = generalMessageText.trim() || '(نص الرسالة)';
    const dateNow = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman' });
    const fullMessage = encodeURIComponent(
      `السلام عليكم ورحمة الله وبركاته\n` +
      `الموضوع : [ ${subject} ]\n` +
      `المعلم: همام هاني محمد علي\n` +
      `المادة: ${material}\n` +
      `التاريخ: ${dateNow}\n\n` +
      `عزيزي الطالب/ة ${studentName}،\n` +
      `${body}\n\n` +
      `للتواصل والدعم: +962 7 8611 7388\n\n` +
      `مع التقدير،\n` +
      `اسم المعلم : همام هاني محمد علي\n` +
      `رئيس قسم التكنولوجيا وأمن المعلومات : همام هاني محمد علي\n` +
      `للبلاغ : +962 7 8611 7388`
    );
    window.open(`https://wa.me/${cleanedPhone}?text=${fullMessage}`, '_blank');
    setShowGeneralMessageModal(false);
    setGeneralMessageSubject('');
    setGeneralMessageText('');
    setSelectedStudentForMessage(null);
  };

  // ===== إدارة الشعب =====
  const handleAddClass = async () => {
    const name = newClassName.trim();
    if (!name) {
      toast.error('يرجى إدخال اسم الشعبة');
      return;
    }
    if (classes.some(c => c.name === name)) {
      toast.error('هذه الشعبة موجودة بالفعل');
      return;
    }
    try {
      const ref = doc(collection(db, 'classes'));
      await setDoc(ref, {
        name: name,
        teacherId: user.id,
        createdAt: serverTimestamp()
      });
      setNewClassName('');
      toast.success('تم إضافة الشعبة بنجاح');
    } catch (err) {
      toast.error('فشل إضافة الشعبة: ' + err.message);
    }
  };

  const handleDeleteClass = async (classId) => {
    const ok = await confirm('حذف الشعبة', 'هل أنت متأكد من حذف هذه الشعبة؟ سيتم إزالتها من جميع الطلاب.');
    if (!ok) return;
    try {
      const studentsWithClass = students.filter(s => (s.classIds || []).includes(classId));
      for (const student of studentsWithClass) {
        const newClassIds = (student.classIds || []).filter(id => id !== classId);
        await updateDoc(doc(db, 'profiles', student.id), {
          classIds: newClassIds,
          updatedAt: serverTimestamp()
        });
      }
      await deleteDoc(doc(db, 'classes', classId));
      toast.success('تم حذف الشعبة وإزالتها من جميع الطلاب');
    } catch (err) {
      toast.error('فشل حذف الشعبة: ' + err.message);
    }
  };

  const handleEditClass = async () => {
    if (!editingClassId || !editingClassName.trim()) return;
    try {
      await updateDoc(doc(db, 'classes', editingClassId), {
        name: editingClassName.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingClassId(null);
      setEditingClassName('');
      toast.success('تم تحديث اسم الشعبة');
    } catch (err) {
      toast.error('فشل تحديث الشعبة: ' + err.message);
    }
  };

  const handleResetStudent = async (studentId) => {
    const ok = await confirm(
      'إعادة تعيين الحساب',
      'سيتم إعادة تعيين هذا الحساب ليصبح كأنه جديد، وسيُطلب من الطالب تغيير كلمة المرور عند تسجيل الدخول. كما سيتم إرسال رسالة إشعار لولي الأمر. هل تريد المتابعة؟'
    );
    if (!ok) return;

    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        infoVerified: false,
        isFrozen: false,
        pendingChanges: null,
        updatedAt: serverTimestamp()
      });

      const student = students.find(s => s.id === studentId);
      if (student) {
        sendResetPasswordMessage(student);
      } else {
        const docSnap = await getDoc(doc(db, 'profiles', studentId));
        if (docSnap.exists()) {
          const studentData = docSnap.data();
          let classNames = [];
          if (studentData.classIds) {
            const classMap = await fetchClassNames(studentData.classIds);
            classNames = studentData.classIds.map(id => classMap[id] || null).filter(Boolean);
          }
          const studentObj = {
            ...studentData,
            classes: classNames.map(name => ({ name }))
          };
          sendResetPasswordMessage(studentObj);
        }
      }

      toast.success('تم إعادة تعيين الحساب وإرسال رسالة إشعار.');
    } catch (err) {
      toast.error('فشل إعادة التعيين: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const acceptReview = async (studentId) => {
    try {
      const docRef = doc(db, 'profiles', studentId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
        toast.error('الطالب غير موجود.');
        return;
      }
      const student = docSnap.data();
      if (!student.pendingChanges) {
        toast.error('لا توجد تغييرات معلقة لهذا الطالب.');
        return;
      }

      const newData = {
        name: student.pendingChanges.name ?? student.name,
        gender: student.pendingChanges.gender ?? student.gender,
        age: student.pendingChanges.age != null ? Number(student.pendingChanges.age) : student.age,
        phone: student.pendingChanges.phone ?? student.phone,
        infoVerified: true,
        pendingChanges: null,
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, newData);
      toast.success('تم قبول التغييرات وتحديث بيانات الطالب بنجاح.');
    } catch (err) {
      console.error('Error accepting review:', err);
      toast.error('فشل قبول المراجعة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const rejectReview = async (studentId) => {
    const ok = await confirm('رفض التغييرات', 'هل أنت متأكد من رفض هذه التغييرات؟');
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        pendingChanges: null,
        updatedAt: serverTimestamp()
      });
      toast.success('تم رفض التغييرات.');
    } catch (err) {
      console.error('Error rejecting review:', err);
      toast.error('فشل رفض المراجعة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const saveHomeworkFromModal = async (data) => {
    const { date, time, section, text } = data;
    const combinedDate = new Date(date);
    combinedDate.setHours(time.hours, time.minutes, 0, 0);
    const revealTime = combinedDate.toISOString();

    const newHwItem = {
      id: generateId(),
      text: text,
      section: section,
      reveal_time: revealTime,
      is_scheduled: true
    };

    try {
      const teacherRef = doc(db, 'teachers', user.id);
      await updateDoc(teacherRef, {
        homeworks: arrayUnion(newHwItem),
        updatedAt: serverTimestamp()
      });
      toast.success('تم نشر الواجب بنجاح!');
      setShowAssignmentModal(false);
    } catch (err) {
      toast.error('فشل حفظ الواجب: ' + err.message);
    }
  };

  const saveLessonTimeFromModal = async (data) => {
    const { date, time } = data;
    const combinedDate = new Date(date);
    combinedDate.setHours(time.hours, time.minutes, 0, 0);
    const isoTime = combinedDate.toISOString();

    try {
      await updateDoc(doc(db, 'teachers', user.id), {
        lessonTime: isoTime,
        updatedAt: serverTimestamp()
      });
      toast.success('تم تحديث موعد الحصة القادمة بنجاح!');
      setShowLessonModal(false);
    } catch (err) {
      toast.error('فشل تحديث موعد الحصة: ' + err.message);
    }
  };

  const deleteHomework = async (hwId) => {
    const ok = await confirm('حذف الواجب', 'هل تريد حذف هذا الواجب نهائياً؟');
    if (!ok) return;
    try {
      const teacherRef = doc(db, 'teachers', user.id);
      const docSnap = await getDoc(teacherRef);
      if (docSnap.exists()) {
        const currentHomeworks = docSnap.data().homeworks || [];
        const filtered = currentHomeworks.filter(h => h.id !== hwId);
        await updateDoc(teacherRef, {
          homeworks: filtered,
          updatedAt: serverTimestamp()
        });
        toast.success('تم حذف الواجب.');
      }
    } catch (err) {
      toast.error('فشل حذف الواجب: ' + err.message);
    }
  };

  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.isFrozen;
    if (nextStatus) {
      const ok = await confirm(
        'تجميد الحساب',
        'تنبيه هام:\nإذا قمت بتجميد هذا الحساب، سيبقى مجمداً حتى تقوم بفك التجميد يدوياً.\nهل تريد المتابعة؟'
      );
      if (!ok) return;
    }
    try {
      await updateDoc(doc(db, 'profiles', student.id), {
        isFrozen: nextStatus,
        frozenAt: nextStatus ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });

      if (nextStatus) {
        setFrozenStudent(student);
        setShowFreezeNotificationModal(true);
      } else {
        toast.success('تم فك التجميد.');
      }
    } catch (err) {
      console.error('Error toggling freeze:', err);
      toast.error('فشل تحديث حالة التجميد: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const getInactivityDays = (lastSeenStr) => {
    if (!lastSeenStr) return 0;
    const lastSeen = new Date(lastSeenStr);
    const diffTime = new Date().getTime() - lastSeen.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleDeleteStudentPermanently = async (studentId) => {
    const ok = await confirm('حذف دائم', 'إجراء خطير: هل أنت متأكد من حذف حساب هذا الطالب نهائياً وفوراً؟');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'profiles', studentId));
      toast.success('تم حذف الطالب من النظام.');
    } catch (err) {
      toast.error('فشل حذف الطالب: ' + err.message);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (newStudentClassIds.length === 0) {
      toast.error('يرجى اختيار شعبة واحدة على الأقل للطالب.');
      return;
    }
    if (!newStudentName || !newStudentGender || !newStudentAge || !newStudentPhone) {
      toast.error('جميع الحقول مطلوبة.');
      return;
    }

    setStudentLoading(true);
    try {
      for (const classId of newStudentClassIds) {
        const classRef = doc(db, 'classes', classId);
        const classSnap = await getDoc(classRef);
        if (!classSnap.exists()) {
          toast.error('إحدى الشعب المختارة غير صالحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
          setStudentLoading(false);
          return;
        }
      }

      const newId = generateId();
      const tempEmail = `student_${newId}@temp.com`;

      const baseUsername = newStudentName.trim().replace(/\s+/g, '.').toLowerCase();
      let username = baseUsername;
      let counter = 1;
      let exists = true;
      while (exists) {
        const q = query(collection(db, 'profiles'), where('username', '==', username));
        const querySnap = await getDocs(q);
        if (querySnap.empty) {
          exists = false;
        } else {
          username = `${baseUsername}${counter}`;
          counter++;
        }
      }

      const cleanPhone = newStudentPhone.replace(/[^0-9]/g, '');
      const ageNum = parseInt(newStudentAge);
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
        toast.error('العمر يجب أن يكون رقماً بين 1 و 99.');
        setStudentLoading(false);
        return;
      }

      if (!['ذكر', 'أنثى'].includes(newStudentGender)) {
        toast.error('الجنس يجب أن يكون ذكر أو أنثى.');
        setStudentLoading(false);
        return;
      }

      await setDoc(doc(db, 'profiles', newId), {
        email: tempEmail,
        username: username,
        name: newStudentName.trim(),
        gender: newStudentGender,
        age: ageNum,
        phone: cleanPhone,
        classIds: newStudentClassIds,
        role: 'student',
        isFrozen: false,
        infoVerified: false,
        isProfileComplete: false,
        pendingChanges: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const classMap = await fetchClassNames(newStudentClassIds);
      const classNames = newStudentClassIds.map(id => classMap[id] || null).filter(Boolean);
      const addedStudent = {
        name: newStudentName.trim(),
        gender: newStudentGender,
        age: ageNum,
        phone: cleanPhone,
        classIds: newStudentClassIds,
        classes: classNames.map(name => ({ name }))
      };

      setNewlyAddedStudent(addedStudent);
      setShowAddNotificationModal(true);

      setNewStudentName('');
      setNewStudentGender('');
      setNewStudentAge('');
      setNewStudentPhone('');
      setNewStudentClassIds([]);
      setShowAddStudentModal(false);
    } catch (err) {
      console.error('Error adding student:', err);
      toast.error('فشل إضافة الطالب: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setStudentLoading(false);
    }
  };

  const sortedHomeworks = [...homeworks].sort((a, b) => (b.is_scheduled ? 1 : 0) - (a.is_scheduled ? 1 : 0));
  const sortedStudents = [...students].sort((a, b) => (a.isFrozen ? 1 : 0) - (b.isFrozen ? 1 : 0));

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.username || user.email}</p>
          </div>
          <button onClick={onLogout} type="button" className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm px-4 py-2 rounded-md text-white">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-purple-200">عدد الطلاب</h3>
            <p className="text-4xl font-extrabold text-white mt-2 bg-purple-950/40 px-4 py-2 rounded-xl border border-purple-500/30 inline-block self-start">
              {students.length}
            </p>
          </div>
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">الوقت المتبقي للحصة</h3>
            {lessonTime ? (
              <CountdownTimer key={lessonTime} targetDate={lessonTime} />
            ) : (
              <p className="text-gray-400 text-center py-2">لم يتم تحديد موعد</p>
            )}
          </div>
        </div>

        {pendingReviews.length > 0 && (
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
            <h3 className="text-xl font-semibold text-yellow-300 mb-3">📋 مراجعات الملفات الشخصية</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {pendingReviews.map(student => (
                <div key={student.id} className="p-3 bg-black/30 rounded-xl border border-yellow-500/20">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <p className="text-white font-medium">{student.name || student.username}</p>
                      <p className="text-xs text-gray-400">اسم المستخدم: {student.username}</p>
                      {student.classes && <p className="text-xs text-blue-300">الشعب: {student.classes.map(c => c.name).join(', ')}</p>}
                      <div className="mt-1 text-xs text-gray-300 bg-yellow-950/30 p-2 rounded border border-yellow-500/10">
                        <p className="font-semibold text-yellow-200">التغييرات المطلوبة:</p>
                        {student.pendingChanges?.name && <p>الاسم: {student.pendingChanges.name}</p>}
                        {student.pendingChanges?.gender && <p>الجنس: {student.pendingChanges.gender}</p>}
                        {student.pendingChanges?.age && <p>العمر: {student.pendingChanges.age}</p>}
                        {student.pendingChanges?.phone && <p>رقم الهاتف: {student.pendingChanges.phone}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => acceptReview(student.id)} type="button" className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg">قبول ✅</button>
                      <button onClick={() => rejectReview(student.id)} type="button" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg">رفض ❌</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== قسم إدارة الواجبات ===== */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-pink-300">إدارة الواجبات</h3>
            <button
              onClick={() => setShowAssignmentModal(true)}
              type="button"
              className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-2 px-4 text-sm rounded-md text-white"
            >
              📝 إضافة واجب جديد
            </button>
          </div>

          {homeworks.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {sortedHomeworks.map(hw => {
                const isRevealed = new Date(hw.reveal_time).getTime() <= new Date().getTime();
                return (
                  <div key={hw.id} className="p-3 bg-black/30 rounded-xl border border-gray-700 flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <p className="text-gray-100 text-sm">{hw.text}</p>
                      {hw.section && <span className="text-xs text-blue-300 mr-2">(شعبة {hw.section})</span>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isRevealed ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                          {isRevealed ? '🟢 متاح' : '📅 مجدول'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteHomework(hw.id)} type="button" className="p-1.5 bg-red-600/30 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-600/50 text-xs">حذف</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">لا توجد واجبات مضافة بعد.</p>
          )}
        </div>

        {/* ===== قسم إدارة الطلاب ===== */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-xl font-semibold text-blue-300">إدارة الطلاب</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddStudentModal(true)} type="button" className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-2 px-4 text-sm rounded-md text-white">+ إضافة طالب</button>
              <button onClick={() => setShowStudentsModal(true)} type="button" className="btn-primary bg-purple-600 hover:bg-purple-700 py-2 px-4 text-sm rounded-md text-white">📋 عرض قوائم الطلبة</button>
              <button onClick={() => setShowManageClassesModal(true)} type="button" className="btn-primary bg-green-600 hover:bg-green-700 py-2 px-4 text-sm rounded-md text-white">🏫 إدارة الشعب</button>
            </div>
          </div>
        </div>

        {/* ===== قسم جدولة موعد حصة ===== */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة موعد حصة</h3>
          <button
            onClick={() => setShowLessonModal(true)}
            type="button"
            className="btn-primary bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 py-3 px-6 w-full sm:w-auto rounded-md text-white"
          >
            🕒 اختيار موعد الحصة
          </button>
          {lessonTime && (
            <p className="text-sm text-gray-300 mt-2">
              الموعد الحالي: {new Date(lessonTime).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
            </p>
          )}
        </div>
      </div>

      {/* ===== مودال إدارة الشعب ===== */}
      {showManageClassesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowManageClassesModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">🏫 إدارة الشعب</h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="bg-gray-800 flex-1 text-right p-2 border border-gray-600 rounded-md text-white"
                  placeholder="اسم الشعبة الجديدة"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                />
                <button onClick={handleAddClass} className="btn-primary bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md text-white">إضافة</button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {classes.map(cls => (
                  <div key={cls.id} className="flex justify-between items-center p-2 bg-black/30 rounded-xl border border-gray-700">
                    {editingClassId === cls.id ? (
                      <div className="flex gap-2 flex-1">
                        <input
                          type="text"
                          className="bg-gray-800 flex-1 text-right p-1 border border-gray-600 rounded-md text-white"
                          value={editingClassName}
                          onChange={(e) => setEditingClassName(e.target.value)}
                        />
                        <button onClick={handleEditClass} className="text-green-400 hover:text-green-300 text-sm">حفظ</button>
                        <button onClick={() => { setEditingClassId(null); setEditingClassName(''); }} className="text-gray-400 hover:text-white text-sm">إلغاء</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-white">{cls.name}</span>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingClassId(cls.id); setEditingClassName(cls.name); }} className="text-blue-400 hover:text-blue-300 text-sm">✏️</button>
                          <button onClick={() => handleDeleteClass(cls.id)} className="text-red-400 hover:text-red-300 text-sm">🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {classes.length === 0 && <p className="text-gray-400 text-center">لا توجد شعب مسجلة</p>}
              </div>
              <button onClick={() => setShowManageClassesModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 w-full py-2 rounded-md text-white">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودالات إجبارية ===== */}
      {showAddNotificationModal && newlyAddedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-green-500/30">
            <h3 className="text-xl font-semibold text-green-300 mb-2 text-center">✅ تم تسجيل الطالب</h3>
            <p className="text-gray-300 text-center mb-4">
              تم إضافة الطالب <span className="text-white font-bold">{newlyAddedStudent.name}</span> بنجاح.
              <br />
              <span className="text-sm text-gray-400">يجب إرسال رسالة التفعيل لولي الأمر الآن.</span>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  sendActivationMessage(newlyAddedStudent);
                  setShowAddNotificationModal(false);
                  setNewlyAddedStudent(null);
                }}
                className="btn-primary bg-green-600 hover:bg-green-700 w-full py-3 flex items-center justify-center gap-2 text-lg rounded-md text-white"
              >
                <span>💬</span> إخبار ولي الأمر
              </button>
            </div>
          </div>
        </div>
      )}

      {showFreezeNotificationModal && frozenStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-orange-500/30">
            <h3 className="text-xl font-semibold text-orange-300 mb-2 text-center">🚫 تم تجميد الحساب</h3>
            <p className="text-gray-300 text-center mb-4">
              تم تجميد حساب الطالب <span className="text-white font-bold">{frozenStudent.name}</span>.
              <br />
              <span className="text-sm text-gray-400">يجب إرسال رسالة إشعار لولي الأمر الآن.</span>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  sendFreezeMessage(frozenStudent);
                  setShowFreezeNotificationModal(false);
                  setFrozenStudent(null);
                }}
                className="btn-primary bg-orange-600 hover:bg-orange-700 w-full py-3 flex items-center justify-center gap-2 text-lg rounded-md text-white"
              >
                <span>💬</span> إخبار ولي الأمر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال عرض الطلاب ===== */}
      {showStudentsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowStudentsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-4xl w-full max-h-[80vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-300">قائمة الطلاب المسجلين ({students.length})</h3>
              <button onClick={() => setShowStudentsModal(false)} type="button" className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {sortedStudents.map(s => {
                const hasAccount = s.email && !s.email.endsWith('@temp.com');
                const inactiveDays = getInactivityDays(s.last_seen);
                const frozenDays = s.isFrozen && s.frozenAt ? Math.floor((new Date() - new Date(s.frozenAt.seconds * 1000)) / (1000 * 60 * 60 * 24)) : 0;
                const classNames = s.classes?.map(c => c.name).filter(Boolean).join(', ') || 'لا توجد شعبة';
                return (
                  <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.isFrozen ? 'bg-gray-800/60 border-gray-700 opacity-80' : 'bg-gray-800/30 border-gray-700'}`}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white text-sm font-medium">{s.name || s.username}</span>
                      <span className="text-xs text-gray-400">({s.username})</span>
                      <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">
                        الشعب: {classNames}
                      </span>
                      {s.phone && <span className="text-xs text-gray-400">📱 {s.phone}</span>}
                      {s.gender && <span className="text-xs text-gray-400">{s.gender}</span>}
                      {s.age && <span className="text-xs text-gray-400">عمر {s.age}</span>}
                      {s.isFrozen && (
                        <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">
                          ⏳ مجمد {frozenDays > 0 && `منذ ${frozenDays} يوم`}
                        </span>
                      )}
                      {inactiveDays >= 30 && !s.isFrozen && (
                        <span className="text-xs text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/30 animate-pulse">
                          🚨 لم يفتح منذ {inactiveDays} يوم!
                        </span>
                      )}
                      {!hasAccount && <span className="text-xs text-yellow-400 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">⚠️ لم يتم التفعيل بعد</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedStudentForMessage(s);
                          setGeneralMessageSubject('');
                          setGeneralMessageText('');
                          setShowGeneralMessageModal(true);
                        }}
                        type="button"
                        className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg hover:bg-green-500/30"
                      >
                        ✉️ رسالة
                      </button>
                      {s.isFrozen && (
                        <button onClick={() => sendFreezeMessage(s)} type="button" className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-1 rounded-lg hover:bg-orange-500/30">🚫 تجميد</button>
                      )}
                      <button onClick={() => handleResetStudent(s.id)} type="button" className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg hover:bg-indigo-500/30">🔄 إعادة تعيين</button>
                      <button onClick={() => handleDeleteStudentPermanently(s.id)} type="button" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">❌ حذف</button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{s.isFrozen ? 'مجمد' : 'مفعل'}</span>
                        <div onClick={() => toggleFreezeStudent(s)} className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${s.isFrozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                          <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${s.isFrozen ? 'translate-x-0' : '-translate-x-6'}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {students.length === 0 && <p className="text-gray-400 text-center py-2">لا يوجد طلاب مسجلين.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إضافة طالب ===== */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">إضافة طالب جديد</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">الجنس <span className="text-red-400">*</span></label>
                <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentGender} onChange={e => setNewStudentGender(e.target.value)} required>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block">العمر <span className="text-red-400">*</span></label>
                <input type="number" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentAge} onChange={e => setNewStudentAge(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentPhone} onChange={e => setNewStudentPhone(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">الشعب <span className="text-red-400">*</span></label>
                <select
                  multiple
                  className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white"
                  value={newStudentClassIds}
                  onChange={(e) => {
                    const options = e.target.options;
                    const selected = [];
                    for (let i = 0; i < options.length; i++) {
                      if (options[i].selected) {
                        selected.push(options[i].value);
                      }
                    }
                    setNewStudentClassIds(selected);
                  }}
                  required
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">اضغط Ctrl (أو ⌘) لاختيار عدة شعب</p>
                <p className="text-xs text-red-400 mt-1">* يجب اختيار شعبة واحدة على الأقل</p>
              </div>
              <button type="submit" disabled={studentLoading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-md text-white">
                {studentLoading ? 'جاري الإضافة...' : 'إضافة الطالب'}
              </button>
              <button type="button" onClick={() => setShowAddStudentModal(false)} className="text-sm text-gray-400 hover:text-white w-full mt-2">إلغاء</button>
            </form>
          </div>
        </div>
      )}

      {/* ===== مودال الرسالة العامة ===== */}
      {showGeneralMessageModal && selectedStudentForMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGeneralMessageModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">✉️ إرسال رسالة إلى {selectedStudentForMessage.name}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block">الشعبة</label>
                <input
                  type="text"
                  className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white cursor-not-allowed"
                  value={selectedStudentForMessage?.classes?.length > 0 ? selectedStudentForMessage.classes[0].name : 'لا توجد شعبة'}
                  disabled
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 block">الموضوع</label>
                <input
                  type="text"
                  className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                  placeholder="اكتب موضوع الرسالة"
                  value={generalMessageSubject}
                  onChange={(e) => setGeneralMessageSubject(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm text-gray-300 block">نص الرسالة</label>
                <textarea
                  className="bg-gray-800 w-full h-32 text-right p-2 border border-gray-600 rounded-md text-white resize-none"
                  placeholder="اكتب نص الرسالة هنا..."
                  value={generalMessageText}
                  onChange={(e) => setGeneralMessageText(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => sendGeneralMessage(selectedStudentForMessage)}
                  className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white"
                >
                  إرسال
                </button>
                <button
                  onClick={() => {
                    setShowGeneralMessageModal(false);
                    setSelectedStudentForMessage(null);
                    setGeneralMessageSubject('');
                    setGeneralMessageText('');
                  }}
                  className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إضافة الواجب ===== */}
      <AddAssignmentModal
        isOpen={showAssignmentModal}
        onClose={() => setShowAssignmentModal(false)}
        onSubmit={saveHomeworkFromModal}
        classesList={classes}
      />

      {/* ===== مودال جدولة الحصة ===== */}
      <AddLessonModal
        isOpen={showLessonModal}
        onClose={() => setShowLessonModal(false)}
        onSubmit={saveLessonTimeFromModal}
      />
    </div>
  );
};

// ============================================================
// StudentPanel (معدل)
// ============================================================
const StudentPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [teacherData, setTeacherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [availableHomeworks, setAvailableHomeworks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  const fetchTeacherInfo = async () => {
    try {
      const q = query(collection(db, 'teachers'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();
        setTeacherData({ id: docSnap.id, ...data });
        const now = new Date().getTime();
        const available = (data.homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('فشل تحميل بيانات الصف: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'profiles', user.id));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.classIds) {
          const classMap = await fetchClassNames(data.classIds);
          data.classes = data.classIds.map(id => ({ id, name: classMap[id] || null })).filter(c => c.name);
        }
        setProfile(data);
        setEditData(data || {});
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTeacherInfo();
    fetchProfile();

    const q = query(collection(db, 'teachers'));
    const unsubscribeTeacher = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        const data = docSnap.data();
        setTeacherData({ id: docSnap.id, ...data });
        const now = new Date().getTime();
        const available = (data.homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    });

    const unsubscribeProfile = onSnapshot(doc(db, 'profiles', user.id), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.classIds) {
          const classMap = await fetchClassNames(data.classIds);
          data.classes = data.classIds.map(id => ({ id, name: classMap[id] || null })).filter(c => c.name);
        }
        setProfile(data);
        setEditData(data || {});
      }
    });

    return () => {
      unsubscribeTeacher();
      unsubscribeProfile();
    };
  }, [user.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (teacherData?.homeworks) {
        const now = new Date().getTime();
        const available = teacherData.homeworks.filter(hw => new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [teacherData?.homeworks]);

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null;
    const now = new Date().getTime();
    const scheduled = teacherData.homeworks.filter(hw => new Date(hw.reveal_time).getTime() > now);
    if (scheduled.length === 0) return null;
    return scheduled.reduce((a, b) => new Date(a.reveal_time).getTime() < new Date(b.reveal_time).getTime() ? a : b);
  };

  const nextScheduled = getNextScheduledHomework();

  const startEditing = () => {
    setEditing(true);
    setEditData({
      name: profile?.name || '',
      gender: profile?.gender || '',
      age: profile?.age || '',
      phone: profile?.phone || ''
    });
  };

  const saveChanges = async () => {
    if (!editData.name || !editData.phone) {
      toast.error('الاسم ورقم الهاتف إلزاميان');
      return;
    }
    try {
      const updates = {
        name: editData.name,
        gender: editData.gender,
        age: parseInt(editData.age) || null,
        phone: editData.phone,
        infoVerified: false,
        pendingChanges: {
          updated_at: new Date().toISOString(),
          name: editData.name,
          gender: editData.gender,
          age: parseInt(editData.age) || null,
          phone: editData.phone
        },
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, 'profiles', user.id), updates);
      toast.success('سيتم مراجعة البيانات خلال 48 ساعة.');
      setEditing(false);
      fetchProfile();
    } catch (err) {
      toast.error('فشل حفظ التغييرات: ' + err.message);
    }
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.username || user.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onLogout} type="button" className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm px-4 py-2 rounded-md text-white">تسجيل الخروج</button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-blue-200">معلوماتي الشخصية</h3>
            {!editing && <button onClick={startEditing} type="button" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"><span>✏️</span> تعديل</button>}
          </div>
          {editing ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-gray-300">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-gray-300">الجنس</label>
                <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={editData.gender} onChange={e => setEditData({ ...editData, gender: e.target.value })}>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">العمر</label>
                <input type="number" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={editData.age} onChange={e => setEditData({ ...editData, age: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-gray-300">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveChanges} type="button" className="btn-primary bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md text-white">حفظ</button>
                <button onClick={() => setEditing(false)} type="button" className="btn-primary bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-400">الاسم:</span> {profile?.name || 'غير مسجل'}</p>
              <p><span className="text-gray-400">الجنس:</span> {profile?.gender || 'غير محدد'}</p>
              <p><span className="text-gray-400">العمر:</span> {profile?.age || 'غير محدد'}</p>
              <p><span className="text-gray-400">رقم الهاتف:</span> {profile?.phone || 'غير مسجل'}</p>
              <p className="col-span-2"><span className="text-gray-400">الشعب:</span> {profile?.classes?.map(c => c.name).join(', ') || 'غير محددة'}</p>
              <p className="col-span-2"><span className="text-gray-400">حالة التحقق:</span> {profile?.infoVerified ? '✅ تم التحقق' : '⏳ قيد المراجعة'}</p>
            </div>
          )}
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          {teacherData?.lessonTime ? <CountdownTimer key={teacherData.lessonTime} targetDate={teacherData.lessonTime} /> : <p className="text-gray-400 text-center py-2">لا توجد حصة مجدولة</p>}
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-3">
          <h3 className="text-xl font-semibold text-pink-300">الواجبات المدرسية</h3>
          {availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
                  {hw.section && <span className="text-xs text-blue-300 mr-2">(شعبة {hw.section})</span>}
                  <p className="text-xs text-gray-400 mt-1">
                    نشر في: {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400">لا توجد واجبات متاحة حالياً.</p>
              {nextScheduled && (
                <div className="mt-2">
                  <HomeworkTextCountdown targetDate={nextScheduled.reveal_time} />
                  <p className="text-xs text-gray-500 mt-1">(الواجب القادم سيظهر تلقائياً)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// App
// ============================================================
const App = () => {
  const [user, setUser] = useState(null);
  const [frozenUser, setFrozenUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingUserForComplete, setPendingUserForComplete] = useState(null);

  useDynamicBackground();

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setFrozenUser(null);
    setPendingUserForComplete(null);
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setFrozenUser(null);
    setPendingUserForComplete(null);
  };

  const handleFrozen = async (frozenData) => {
    let classNames = [];
    if (frozenData.classIds) {
      const classMap = await fetchClassNames(frozenData.classIds);
      classNames = frozenData.classIds.map(id => classMap[id] || null).filter(Boolean);
    }
    setFrozenUser({
      ...frozenData,
      class_name: classNames.join(', ') || 'غير محدد'
    });
    setUser(null);
    setPendingUserForComplete(null);
  };

  const handleCompleteProfile = (userData) => {
    setPendingUserForComplete(userData);
  };

  const handleCompleteProfileSuccess = (updatedUser) => {
    setUser(updatedUser);
    setPendingUserForComplete(null);
  };

  const checkSessionAndProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null);
      setFrozenUser(null);
      setPendingUserForComplete(null);
      setLoading(false);
      return;
    }

    try {
      const docSnap = await getDoc(doc(db, 'profiles', firebaseUser.uid));
      if (!docSnap.exists()) {
        setPendingUserForComplete({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: firebaseUser.displayName || ''
        });
        setUser(null);
        setFrozenUser(null);
        setLoading(false);
        return;
      }

      const profile = docSnap.data();

      if (profile.isFrozen) {
        let classNames = [];
        if (profile.classIds) {
          const classMap = await fetchClassNames(profile.classIds);
          classNames = profile.classIds.map(id => classMap[id] || null).filter(Boolean);
        }
        setFrozenUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          class_name: classNames.join(', ') || 'غير محدد'
        });
        setUser(null);
        setPendingUserForComplete(null);
        setLoading(false);
        return;
      }

      if (!profile.isProfileComplete) {
        setPendingUserForComplete({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || '',
          ...profile
        });
        setUser(null);
        setFrozenUser(null);
        setLoading(false);
        return;
      }

      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        classIds: profile.classIds || [],
        needsPasswordChange: profile.infoVerified === false,
        isProfileComplete: true
      });
      setFrozenUser(null);
      setPendingUserForComplete(null);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setUser(null);
      setFrozenUser(null);
      setPendingUserForComplete(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await checkSessionAndProfile(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="container-center min-h-screen text-white"><div className="bg-gray-900 p-8 rounded-2xl border border-gray-700 shadow-xl animate-pulse">جاري التحميل...</div></div>;

  if (pendingUserForComplete) {
    return (
      <CompleteProfile
        user={pendingUserForComplete}
        onSuccess={handleCompleteProfileSuccess}
        onCancel={handleLogout}
      />
    );
  }

  if (frozenUser) {
    return <FrozenAccount user={frozenUser} onLogout={handleLogout} />;
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        onFrozen={handleFrozen}
        onCompleteProfile={handleCompleteProfile}
      />
    );
  }

  return user.role === 'teacher' ? <TeacherPanel user={user} onLogout={handleLogout} /> : <StudentPanel user={user} onLogout={handleLogout} />;
};

// ============================================================
// التطبيق مع Providers
// ============================================================
const Root = () => (
  <ConfirmProvider>
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#1e293b',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '16px',
          padding: '16px',
          direction: 'rtl'
        }
      }}
    />
    <App />
  </ConfirmProvider>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);