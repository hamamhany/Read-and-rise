// ===================== main.jsx (الكامل - عداد الطلاب + إشعارات فورية) =====================

import './index.css';
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import toast, { Toaster } from 'react-hot-toast';

// Firebase imports
import { auth, db, messaging } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updatePassword,
  updateEmail,
  signOut,
  fetchSignInMethodsForEmail,
  onAuthStateChanged
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
  arrayRemove,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';

// ========== رقم المعلم الثابت ==========
const TEACHER_PHONE = '962786117388';

// ========== Utility: generateId ==========
const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
};

// ========== Utility: تحويل الأرقام العربية إلى إنجليزية ==========
const arabicToEnglishNumber = (str) => {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.replace(/[٠-٩]/g, (d) => map[d] || d);
};

// ========== دالة تنقية النصوص (Sanitization) ==========
const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim();
};

// ========== دالة مساعدة لتحويل أي قيمة إلى Date صالح ==========
const safeDate = (d) => {
  const date = new Date(d);
  return isNaN(date.getTime()) ? new Date() : date;
};

// ========== دالة موحدة لجلب أسماء الشعب (محسنة) ==========
const fetchClassNames = async (classIds) => {
  if (!classIds || classIds.length === 0) return {};
  const names = {};
  await Promise.all(classIds.map(async (id) => {
    try {
      const docSnap = await getDoc(doc(db, 'classes', id));
      if (docSnap.exists()) {
        names[id] = docSnap.data().name;
      } else {
        names[id] = null;
      }
    } catch (err) {
      console.error('Error fetching class name for id', id, err);
      names[id] = null;
    }
  }));
  return names;
};

// ========== دوال الإشعارات ==========
const sendNotificationToStudents = async (classIds, title, body, type, relatedId = null) => {
  if (!classIds || classIds.length === 0) return;
  try {
    const q = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const snapshot = await getDocs(q);
    const students = snapshot.docs.filter(doc => {
      const data = doc.data();
      return (data.classIds || []).some(id => classIds.includes(id));
    });

    for (const studentDoc of students) {
      const studentId = studentDoc.id;
      const notification = {
        title,
        body,
        type,
        relatedId,
        createdAt: serverTimestamp(),
        read: false,
        readAt: null
      };
      await setDoc(doc(collection(db, 'notifications', studentId, 'userNotifications')), notification);
    }
  } catch (err) {
    console.error('Error sending notifications:', err);
  }
};

const sendNotificationToAllStudents = async (title, body, type, relatedId = null) => {
  try {
    const q = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const snapshot = await getDocs(q);
    for (const docSnap of snapshot.docs) {
      const studentId = docSnap.id;
      const notification = {
        title,
        body,
        type,
        relatedId,
        createdAt: serverTimestamp(),
        read: false,
        readAt: null
      };
      await setDoc(doc(collection(db, 'notifications', studentId, 'userNotifications')), notification);
    }
  } catch (err) {
    console.error('Error sending notification to all:', err);
  }
};

const sendNotificationToTeacher = async (teacherId, title, body, type, relatedId = null) => {
  if (!teacherId) return;
  try {
    const notification = {
      title,
      body,
      type,
      relatedId,
      createdAt: serverTimestamp(),
      read: false,
      readAt: null
    };
    await setDoc(doc(collection(db, 'notifications', teacherId, 'userNotifications')), notification);
  } catch (err) {
    console.error('Error sending notification to teacher:', err);
  }
};

// ========== دوال الإنذارات وإرسال رسائل واتساب ==========
const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return phone.replace(/^0+/, '').replace(/[^0-9]/g, '');
};

const sendWhatsAppToTeacher = (message) => {
  const cleanedTeacherPhone = cleanPhoneNumber(TEACHER_PHONE);
  if (!cleanedTeacherPhone) {
    toast.error('رقم المعلم غير صالح.');
    return;
  }
  const encodedMessage = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanedTeacherPhone}?text=${encodedMessage}`, '_blank');
};

const sendWarningMessage = (student, warningNumber, description) => {
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

  const studentName = student.name || 'الطالب';
  const currentDate = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman' });
  const descriptionText = description || 'مخالفة غير محددة';

  let subject, body;
  if (warningNumber === 1) {
    subject = `إشعار إنذار أكاديمي أول – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `نحيطكم علماً بأن الطالب قد ارتكب مخالفة للوائح الأكاديمية بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `يُعد هذا إشعاراً رسمياً أول، ونود التأكيد أننا نطبق سياسة صارمة للحفاظ على بيئة تعليمية مناسبة. تبقى للطالب 2 إنذاران قبل اتخاذ إجراء الحذف النهائي للحساب.\n` +
           `يرجى العلم أنه في حال تلقي إنذار آخر خلال فترة 90 يوماً من تاريخ اليوم، سيتم إيقاف الحساب مؤقتاً كإجراء تأديبي.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 2) {
    subject = `إشعار إنذار أكاديمي ثانٍ – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `بالإشارة إلى المخالفات السابقة، نبلغكم بأن الطالب ${studentName} قد ارتكب مخالفة إضافية بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `نحيطكم علماً بأن هذا هو الإنذار الثاني، ويتبقى للطالب إنذار واحد فقط قبل أن يتم حذف حسابه نهائياً من الأكاديمية.\n` +
           `نؤكد لكم أن أي مخالفة إضافية خلال فترة الـ 90 يوماً القادمة ستؤدي إلى إيقاف الحساب مؤقتاً فوراً وتصعيد الموقف نحو الإجراء النهائي (الحذف).\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 3) {
    subject = `إنذار أكاديمي نهائي – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `نكتب إليكم ببالغ الجدية بخصوص التجاوزات المستمرة من قِبل الطالب ${studentName} للوائح الأكاديمية، حيث سجلنا مخالفة جديدة بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `هذا هو الإنذار الأخير الموجه لكم. نود إبلاغكم وبشكل قاطع أن ارتكاب أي مخالفة إضافية خلال فترة الـ 90 يوماً القادمة سيؤدي إلى إغلاق وحذف الحساب نهائياً من أنظمتنا دون إشعار آخر.\n` +
           `نرجو منكم أخذ هذا الإنذار على محمل الجد التام، حيث إننا لا نستطيع التهاون أكثر في تطبيق قوانين الأكاديمية.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else {
    return;
  }

  const fullMessage = encodeURIComponent(
    `الموضوع: ${subject}\n\n` +
    body +
    `\n\nللتواصل والدعم: +962 7 8611 7388`
  );

  window.open(`https://wa.me/${cleanedPhone}?text=${fullMessage}`, '_blank');
};

const sendDataUpdateApprovalMessage = (student, newData) => {
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
  const studentName = student.name || 'الطالب';
  const message = encodeURIComponent(
    `الموضوع: تأكيد الموافقة على طلب تصحيح البيانات – الطالب ${studentName}\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `تحية طيبة،،\n` +
    `نود إعلامكم بأنه قد تم قبول طلبكم المقدم بخصوص تصحيح وتحديث البيانات الخاصة بكم في نظامنا الأكاديمي.\n` +
    `لقد تم إجراء التعديلات المطلوبة بنجاح، وأصبحت سجلاتكم الآن محدثة وفقاً للبيانات الجديدة التي قدمتموها. يمكنكم الآن الاطلاع على ملفكم الشخصي للتأكد من صحة التعديلات.\n` +
    `نشكر لكم حرصكم على دقة بياناتكم، ونتمنى لكم التوفيق في مسيرتكم الدراسية.\n\n` +
    `مع تحيات إدارة الأكاديمية`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

const sendDataUpdateRejectionMessage = (student, reason = 'عدم مطابقة الوثائق الرسمية / الحاجة لتقديم إثبات رسمي آخر / عدم استيفاء الشروط المطلوبة') => {
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
  const studentName = student.name || 'الطالب';
  const message = encodeURIComponent(
    `الموضوع: بخصوص طلبكم الخاص بتصحيح البيانات – الطالب ${studentName}\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `تحية طيبة،،\n` +
    `بالإشارة إلى طلبكم المتعلق بتصحيح البيانات في نظام الأكاديمية، نود إعلامكم بأنه قد تعذر قبول الطلب في الوقت الحالي وذلك بسبب:\n` +
    `[${reason}].\n` +
    `نحن نحرص دائماً على دقة البيانات لضمان سلامة السجلات الأكاديمية. في حال كان لديكم أي اعتراض على هذا القرار، يمكنكم إرسال إثباتات أو مستندات داعمة إضافية عبر الرد على هذه الرسالة لإعادة النظر في طلبكم.\n` +
    `شاكرين لكم تفهمكم.\n\n` +
    `مع تحيات إدارة الأكاديمية`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

const sendUrgentReminderMessage = (student) => {
  if (!student) {
    toast.error('لا توجد بيانات الطالب.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const studentPhone = student.phone || 'غير مسجل';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const message = 
    `الموضوع: طلب عاجل: استكمال تصحيح وتأكيد بيانات الطالب - ${studentName}\n\n` +
    `إلى إدارة الأكاديمية الموقرة،\n` +
    `تحية طيبة وبعد،،\n` +
    `أرجو من حضراتكم التكرم بالموافقة على معالجة طلبي المتعلق بتصحيح وتأكيد بياناتي الأكاديمية في أقرب وقت ممكن.\n` +
    `اسم الطالب: ${studentName}\n` +
    `الرقم المسجل : ${studentPhone}\n` +
    `نوع الطلب: تصحيح وتحديث بيانات\n` +
    `إنني بحاجة ماسة لاستكمال هذا الإجراء لضمان دقة سجلاتي في النظام وتجنب أي تأخير في الخدمات الأكاديمية المقدمة لي.\n` +
    `شاكراً لكم حسن تعاونكم وسرعة استجابتكم.\n\n` +
    `مع خالص التحية،\n` +
    `${studentName}`;
  
  sendWhatsAppToTeacher(message);
};

const sendContactTeacherMessage = (student, requestType = 'تحديث') => {
  if (!student) {
    toast.error('لا توجد بيانات الطالب.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const studentPhone = student.phone || 'غير مسجل';
  const purpose = requestType === 'update' ? 'تحديث' : 'تأكيد';
  const message =
    `الموضوع: طلب تأكيد بيانات الطالب - ${studentName}\n\n` +
    `إلى إدارة الأكاديمية،\n` +
    `أتقدم إليكم بهذا الطلب لتأكيد وتحديث بياناتي في نظام الأكاديمية، وذلك لضمان استمرارية الخدمات التعليمية المقدمة لي بشكل صحيح.\n` +
    `بيانات الطالب المطلوبة:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `الصف/المستوى الدراسي: ${studentClass}\n` +
    `رقم الهاتف للتواصل: ${studentPhone}\n` +
    `الغرض من الطلب: ${purpose}\n\n` +
    `أقر بأن كافة البيانات المذكورة أعلاه صحيحة ومحدثة، وأتحمل مسؤولية أي خطأ فيها.\n` +
    `شاكراً لكم جهودكم في تسريع معالجة هذا الطلب.\n\n` +
    `مع التحية،\n` +
    `${studentName}`;

  sendWhatsAppToTeacher(message);
};

// ============================================================
// مكونات المودالات (ChoiceModal, AddAssignmentModal, AddLessonModal)
// ============================================================
const ChoiceModal = ({ isOpen, onClose, onSelect, title, options }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700 shadow-2xl">
        <h3 className="text-2xl font-bold text-white text-center mb-6">{title}</h3>
        <div className="space-y-3">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-white font-medium text-lg transition border border-gray-600"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2 text-gray-400 hover:text-white transition text-sm"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
};

// ---- AddAssignmentModal ----
const AddAssignmentModal = ({
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
            {publishMode === 'draft' ? '💾 حفظ مسودة جديدة' : '📝 إضافة واجب جديد'}
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
              📤 نشر فوراً
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="schedule"
                checked={publishMode === 'schedule'}
                onChange={() => setPublishMode('schedule')}
                className="accent-blue-500"
              />
              📅 جدولة
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="draft"
                checked={publishMode === 'draft'}
                onChange={() => setPublishMode('draft')}
                className="accent-blue-500"
              />
              💾 حفظ كمسودة
            </label>
            <label className="flex items-center gap-2 text-gray-300">
              <input
                type="radio"
                value="delay"
                checked={publishMode === 'delay'}
                onChange={() => setPublishMode('delay')}
                className="accent-blue-500"
              />
              ⏱️ نشر بعد وقت
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
              {publishMode === 'draft' ? '💾 حفظ المسودة' : '✅ إضافة الواجب'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---- AddLessonModal ----
const AddLessonModal = ({
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
          <h2 className="text-2xl font-bold text-white">🕒 جدولة مواعيد الحصص (حد أقصى 6)</h2>
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
            <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">حفظ المواعيد</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// CountdownTimer, HomeworkTextCountdown, ConfirmContext, FrozenAccount, CompleteProfile, Login
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

// ============================================================
// CompleteProfile
// ============================================================
const CompleteProfile = ({ user, onSuccess, onCancel }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const usernameRegex = /^[a-zA-Z0-9@._-]+$/;
    const cleanUsername = sanitizeInput(newUsername);
    if (!usernameRegex.test(cleanUsername)) {
      setError('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط');
      return;
    }
    if (!usernameRegex.test(newPassword)) {
      setError('كلمة المرور يجب أن تحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('كلمة المرور غير متطابقة مع تأكيدها');
      return;
    }
    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    const email = `${cleanUsername}@readandrise.com`;

    try {
      const q = query(collection(db, 'profiles'), where('username', '==', cleanUsername));
      const querySnap = await getDocs(q);
      let exists = false;
      querySnap.forEach(doc => {
        if (doc.id !== user.id) exists = true;
      });
      if (exists) {
        setError('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار آخر');
        return;
      }
    } catch (err) {
      console.warn('خطأ في التحقق:', err);
      setError('حدث خطأ أثناء التحقق، حاول مرة أخرى.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('المستخدم غير مسجل الدخول');
      }

      await updatePassword(currentUser, newPassword);

      await setDoc(doc(db, 'profiles', user.id), {
        username: cleanUsername,
        email: email,
        uid: user.uid,
        isProfileComplete: true,
        infoVerified: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      toast.success('تم تفعيل حسابك بنجاح! يمكنك الآن استخدام اسم المستخدم الجديد وكلمة المرور.');
      onSuccess({
        ...user,
        username: cleanUsername,
        email: email,
        isProfileComplete: true
      });
    } catch (err) {
      console.error('خطأ في التفعيل:', err);
      if (err.code === 'auth/requires-recent-login') {
        setError('لأسباب أمنية، يجب تسجيل الخروج والدخول مرة أخرى لتحديث كلمة المرور. سيتم تسجيل خروجك الآن.');
        setTimeout(async () => {
          await signOut(auth);
          onCancel();
        }, 2000);
      } else {
        setError('فشل التفعيل: ' + (err.message || 'خطأ غير معروف'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-6 rounded-3xl shadow-2xl border border-gray-700 flex flex-col items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-400 text-transparent bg-clip-text mb-4">
            إكمال تفعيل الحساب
          </h2>
          <p className="text-gray-300 text-sm text-center mb-4">
            مرحباً {user.name || 'الطالب'}، يرجى اختيار اسم مستخدم وكلمة مرور جديدين لتأكيد حسابك.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            <div>
              <label className="text-sm text-gray-300 block mb-1">اسم المستخدم الجديد (أحرف إنجليزية وأرقام والرموز @ . _ -)</label>
              <input
                type="text"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                pattern="[a-zA-Z0-9@._-]+"
                title="أحرف إنجليزية وأرقام والرموز @ . _ -"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">كلمة المرور الجديدة (6 أحرف على الأقل)</label>
              <input
                type="password"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength="6"
                pattern="[a-zA-Z0-9@._-]+"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
            >
              {loading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-white w-full text-center mt-2"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Login
// ============================================================
const Login = ({ onLogin, onFrozen, onCompleteProfile }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const docId = profileDoc.id;
      const email = `${cleanUsername}@readandrise.com`;
      let firebaseUser = null;

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        firebaseUser = userCredential.user;
      } catch (loginErr) {
        if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
          try {
            const tempPassword = '123456';
            const userCredential = await createUserWithEmailAndPassword(auth, email, tempPassword);
            firebaseUser = userCredential.user;
            await signOut(auth);
            const finalCred = await signInWithEmailAndPassword(auth, email, tempPassword);
            firebaseUser = finalCred.user;
          } catch (createErr) {
            if (createErr.code === 'auth/email-already-in-use') {
              setError('كلمة المرور غير صحيحة. الحساب موجود مسبقاً، يرجى التواصل مع المعلم لإعادة تعيين كلمة المرور.');
              setLoading(false);
              return;
            } else {
              console.error('فشل إنشاء الحساب:', createErr);
              setError('فشل إنشاء الحساب. يرجى التأكد من صحة البيانات أو التواصل مع المعلم.');
              setLoading(false);
              return;
            }
          }
        } else {
          throw loginErr;
        }
      }

      const docSnap = await getDoc(doc(db, 'profiles', docId));
      if (!docSnap.exists()) {
        setError('بياناتك غير مكتملة في النظام. يرجى التواصل مع المعلم.');
        setLoading(false);
        return;
      }
      const profile = docSnap.data();

      if (!profile.uid || profile.uid !== firebaseUser.uid) {
        await updateDoc(doc(db, 'profiles', docId), { uid: firebaseUser.uid });
      }

      if (profile.isFrozen) {
        onFrozen({
          id: docId,
          uid: firebaseUser.uid,
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
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || cleanUsername,
          ...profile
        });
        setLoading(false);
        return;
      }

      onLogin({
        id: docId,
        uid: firebaseUser.uid,
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

  return (
    <div className="container-center relative min-h-screen overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-6 rounded-3xl shadow-2xl border border-gray-700 flex flex-col items-center relative overflow-hidden min-h-[440px] justify-center">
          <div className="absolute inset-0 flex items-start justify-center pt-6 pointer-events-none z-0 overflow-hidden">
            <img src="/images/logo.png" alt="" className="w-96 h-96 md:w-[420px] md:h-[420px] object-contain opacity-15 animate-logo-bg select-none" onError={(e) => e.target.style.display = 'none'} />
          </div>
          <div className="w-full z-10 flex flex-col items-center space-y-4">
            <div className="text-center space-y-1 w-full">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
                الفرسان التقنيين - اقرآ وارتق
              </h2>
              <div className="w-full max-w-[310px] bg-black/50 border border-gray-700 px-4 py-1.5 rounded-full mx-auto shadow-inner">
                <span className="text-sm font-semibold text-gray-200 tracking-wide">
                  المعلم المسؤول : Dev / همام هاني محمد
                </span>
              </div>
            </div>
            <form onSubmit={handleAuth} className="space-y-3.5 w-full">
              <div className="relative flex items-center">
                <span className="absolute right-4 text-gray-400 pointer-events-none text-sm font-medium">اسم المستخدم</span>
                <input type="text" className="bg-gray-800 w-full text-right pr-24 pl-4 text-base border border-gray-600 rounded-md text-white" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="relative flex items-center">
                <span className="absolute right-4 text-gray-400 pointer-events-none text-sm font-medium">كلمة المرور</span>
                <input type={showPassword ? "text" : "password"} className="bg-gray-800 w-full text-right pr-24 pl-12 text-base border border-gray-600 rounded-md text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors focus:outline-none bg-white/5 px-2 py-1 rounded border border-gray-600">
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm text-center whitespace-pre-wrap">{error}</p>}
              <button type="submit" className="btn-primary w-full py-2.5 text-lg font-semibold tracking-wide shadow-lg bg-blue-600 hover:bg-blue-700 text-white rounded-md" disabled={loading}>
                {loading ? 'جاري التحميل...' : 'تسجيل الدخول'}
              </button>
            </form>

            <div className="pt-2 border-t border-gray-700 text-center text-xs text-gray-400 w-full">
              <p>جميع الحقوق محفوظة © 2026 لصالح المبرمج همام هاني محمد علي</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TeacherPanel (معدل - إضافة إشعارات فورية)
// ============================================================
const TeacherPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [lessonTimes, setLessonTimes] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingReviews, setPendingReviews] = useState([]);
  const [studentsWithoutClass, setStudentsWithoutClass] = useState([]);

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showManageClassesModal, setShowManageClassesModal] = useState(false);
  const [showStudentsWithoutClassModal, setShowStudentsWithoutClassModal] = useState(false);

  const [showAssignmentChoice, setShowAssignmentChoice] = useState(false);
  const [showLessonChoice, setShowLessonChoice] = useState(false);
  const [selectedAssignmentType, setSelectedAssignmentType] = useState(null);
  const [selectedLessonType, setSelectedLessonType] = useState(null);

  const [showGeneralMessageModal, setShowGeneralMessageModal] = useState(false);
  const [generalMessageSubject, setGeneralMessageSubject] = useState('');
  const [generalMessageText, setGeneralMessageText] = useState('');
  const [selectedStudentForMessage, setSelectedStudentForMessage] = useState(null);

  const [newClassName, setNewClassName] = useState('');
  const [editingClassId, setEditingClassId] = useState(null);
  const [editingClassName, setEditingClassName] = useState('');

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGender, setNewStudentGender] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentClassIds, setNewStudentClassIds] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);

  const [showAddNotificationModal, setShowAddNotificationModal] = useState(false);
  const [newlyAddedStudent, setNewlyAddedStudent] = useState(null);
  const [showFreezeNotificationModal, setShowFreezeNotificationModal] = useState(false);
  const [frozenStudent, setFrozenStudent] = useState(null);

  const [showClassSelectionModal, setShowClassSelectionModal] = useState(false);
  const [selectedStudentForClass, setSelectedStudentForClass] = useState(null);
  const [tempClassIds, setTempClassIds] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const [selectedClassForLesson, setSelectedClassForLesson] = useState('');

  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedStudentForWarning, setSelectedStudentForWarning] = useState(null);
  const [warningDescription, setWarningDescription] = useState('');

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewStudent, setSelectedReviewStudent] = useState(null);

  // ===== إعداد الإشعارات الفورية للمعلم =====
  useEffect(() => {
    const setupPush = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' });
          if (token) {
            await updateDoc(doc(db, 'profiles', user.id), {
              fcmTokens: arrayUnion(token)
            });
            console.log('Teacher FCM token saved');
          }
        }
      } catch (err) {
        console.error('FCM setup error:', err);
      }
    };
    setupPush();

    const unsubscribe = onMessage(messaging, (payload) => {
      toast.custom((t) => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsubscribe();
  }, [user.id]);

  // ===== دوال المعلم (جميع الدوال كاملة) =====
  const cleanPhoneNumber = (phone) => {
    if (!phone) return '';
    return phone.replace(/^0+/, '').replace(/[^0-9]/g, '');
  };

  const cleanOldNotifications = async () => {
    if (!user) return;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oldOnes = notifications.filter(n => {
      if (!n.createdAt) return false;
      const date = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
      return date < sevenDaysAgo;
    });
    if (oldOnes.length === 0) return;
    try {
      const batch = writeBatch(db);
      oldOnes.forEach(n => {
        const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
        batch.delete(ref);
      });
      await batch.commit();
      toast.success(`تم حذف ${oldOnes.length} إشعار قديم`);
    } catch (err) {
      console.error('خطأ في حذف الإشعارات القديمة:', err);
    }
  };

  const handleOpenNotifications = () => {
    cleanOldNotifications();
    setShowNotificationsModal(true);
  };

  const sendActivationMessage = (student, tempUsername, tempPassword) => {
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
      `الجنس: ${studentGender}\n` +
      `اسم المستخدم المؤقت: ${tempUsername}\n` +
      `كلمة المرور المؤقتة: ${tempPassword}\n\n` +
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

  const sendDeleteMessage = (student) => {
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
      `الموضوع: إشعار بخصوص إلغاء حساب الطالب ${studentName} في نظامنا الأكاديمي\n\n` +
      `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
      `تحية طيبة وبعد،،\n` +
      `نود إعلامكم بأنه قد تم إغلاق وحذف حساب الطالب ${studentName} من نظامنا الأكاديمي، وذلك بناءً على [ تعدد الإنذارات / ارتكاب خطأ أدى لحذف حسابه بناءً على تعليمات الأكاديمية ].\n` +
      `يُرجى العلم أن هذا الإجراء يتضمن ما يلي:\n` +
      `- إيقاف صلاحية الدخول والوصول الكامل للحساب عبر المنصة الأكاديمية.\n` +
      `- حذف كافة البيانات، السجلات، والتقارير المرتبطة بالحساب نهائياً من قاعدة بياناتنا.\n\n` +
      `نود أن نشكركم على ثقتكم بنا خلال فترة انضمام الطالب للأكاديمية، ونتمنى له دوام التوفيق والنجاح في مسيرته التعليمية القادمة.\n\n` +
      `مع خالص التحية والتقدير،\n` +
      `إدارة الأكاديمية`
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
      `نود إعلامك بأنه قد تمت إعادة تعيين البيانات الدخول الخاصة بحسابك في منصة الفرسان التقنيين - اقرأ وارتق لتصحيح بياناتك.\n\n` +
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
    const classNames = student.classes?.map(c => c.name).filter(Boolean) || [];
    const material = classNames.length > 0 ? classNames.join(', ') : 'لا توجد شعبة';
    const subject = sanitizeInput(generalMessageSubject) || 'إشعار رسمي';
    const body = sanitizeInput(generalMessageText) || '(نص الرسالة)';
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

  const openWarningModal = (student) => {
    setSelectedStudentForWarning(student);
    setWarningDescription('');
    setShowWarningModal(true);
  };

  const confirmWarning = async () => {
    if (!selectedStudentForWarning) return;
    const desc = sanitizeInput(warningDescription);
    if (!desc.trim()) {
      toast.error('يرجى كتابة وصف المخالفة.');
      return;
    }

    const student = selectedStudentForWarning;
    const currentWarnings = student.warnings || [];
    const newWarningNumber = currentWarnings.length + 1;

    if (newWarningNumber > 3) {
      toast.error('تم تجاوز عدد الإنذارات المسموح به.');
      return;
    }

    sendWarningMessage(student, newWarningNumber, desc.trim());

    const warningObj = {
      id: generateId(),
      issuedAt: new Date().toISOString(),
      type: newWarningNumber,
      description: desc.trim()
    };

    try {
      const studentRef = doc(db, 'profiles', student.id);
      await updateDoc(studentRef, {
        warnings: arrayUnion(warningObj),
        updatedAt: serverTimestamp()
      });

      if (newWarningNumber === 3) {
        await updateDoc(studentRef, {
          isFrozen: true,
          frozenAt: serverTimestamp(),
          freezeReason: 'تجاوز عدد الإنذارات (3 إنذارات)'
        });

        await sendNotificationToTeacher(
          user.id,
          '🚫 تجميد تلقائي للحساب',
          `تم تجميد حساب الطالب ${student.name} بسبب تجاوز عدد الإنذارات.`,
          'auto_freeze',
          student.id
        );

        if (student.classIds && student.classIds.length > 0) {
          await sendNotificationToStudents(
            student.classIds,
            '🚫 حساب مجمد',
            `تم تجميد حساب الطالب ${student.name} بسبب تجاوز عدد الإنذارات.`,
            'auto_freeze_notification',
            student.id
          );
        }

        toast.error('⚠️ تم تجميد الحساب تلقائياً لأن عدد الإنذارات بلغ 3. يجب على المعلم حذف الحساب نهائياً.');
      } else {
        toast.success(`✅ تم إرسال الإنذار رقم ${newWarningNumber} بنجاح.`);
      }

      setShowWarningModal(false);
      setSelectedStudentForWarning(null);
      setWarningDescription('');
    } catch (err) {
      console.error('Error issuing warning:', err);
      toast.error('فشل إصدار الإنذار: ' + err.message);
    }
  };

  const handleAddClass = async () => {
    const name = sanitizeInput(newClassName);
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
    const name = sanitizeInput(editingClassName);
    try {
      await updateDoc(doc(db, 'classes', editingClassId), {
        name: name,
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
        isProfileComplete: false,
        pendingChanges: null,
        reviewResult: null,
        reviewExpiry: null,
        updatedAt: serverTimestamp()
      });

      await sendNotificationToTeacher(
        user.id,
        '🔄 إعادة تعيين حساب',
        `تم إعادة تعيين حساب الطالب (${studentId})`,
        'reset_student',
        studentId
      );

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

  const openReviewModal = (student) => {
    setSelectedReviewStudent(student);
    setShowReviewModal(true);
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
        reviewResult: 'approved',
        reviewExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: serverTimestamp()
      };

      await updateDoc(docRef, newData);

      const updatedStudent = { ...student, ...newData };
      sendDataUpdateApprovalMessage(updatedStudent, newData);

      await sendNotificationToTeacher(
        user.id,
        '✅ قبول مراجعة',
        `تم قبول تغييرات الطالب ${student.name || ''}`,
        'review_accepted',
        studentId
      );

      toast.success('تم قبول التغييرات وتحديث بيانات الطالب بنجاح.');
      setShowReviewModal(false);
      setSelectedReviewStudent(null);
    } catch (err) {
      console.error('Error accepting review:', err);
      toast.error('فشل قبول المراجعة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const rejectReview = async (studentId) => {
    const ok = await confirm('رفض التغييرات', 'هل أنت متأكد من رفض هذه التغييرات؟');
    if (!ok) return;
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

      await updateDoc(docRef, {
        pendingChanges: null,
        reviewResult: 'rejected',
        reviewExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: serverTimestamp()
      });

      sendDataUpdateRejectionMessage(student, 'عدم مطابقة الوثائق الرسمية / الحاجة لتقديم إثبات رسمي آخر / عدم استيفاء الشروط المطلوبة');

      await sendNotificationToTeacher(
        user.id,
        '❌ رفض مراجعة',
        `تم رفض تغييرات الطالب (${studentId})`,
        'review_rejected',
        studentId
      );

      toast.success('تم رفض التغييرات.');
      setShowReviewModal(false);
      setSelectedReviewStudent(null);
    } catch (err) {
      console.error('Error rejecting review:', err);
      toast.error('فشل رفض المراجعة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const saveHomeworkFromModal = async (data) => {
    const { date, time, section, text, is_draft } = data;

    let revealTime = null;
    if (!is_draft) {
      const combinedDate = new Date(date);
      combinedDate.setHours(time.hours, time.minutes, 0, 0);
      revealTime = combinedDate.toISOString();
    }

    const newHwItem = {
      id: generateId(),
      text: text,
      section: section,
      reveal_time: revealTime,
      is_scheduled: !is_draft,
      is_draft: is_draft || false,
      created_at: new Date().toISOString()
    };

    try {
      const teacherRef = doc(db, 'teachers', user.id);
      await updateDoc(teacherRef, {
        homeworks: arrayUnion(newHwItem),
        updatedAt: serverTimestamp()
      });
      toast.success(is_draft ? '💾 تم حفظ المسودة بنجاح!' : '✅ تم نشر الواجب بنجاح!');

      if (!is_draft) {
        await sendNotificationToTeacher(
          user.id,
          '📝 واجب جديد',
          `تم نشر واجب: "${text}"`,
          'homework_added',
          newHwItem.id
        );
      }

      if (!is_draft) {
        await sendNotificationToStudents(
          [section],
          '📝 واجب جديد',
          `تم نشر واجب: "${text}"`,
          'homework',
          newHwItem.id
        );
      }

      setShowAssignmentModal(false);
      setSelectedAssignmentType(null);
    } catch (err) {
      toast.error('فشل حفظ الواجب: ' + err.message);
    }
  };

  const saveLessonTimesFromModal = async (times) => {
    try {
      const timesWithId = times.map(t => ({ ...t, id: generateId() }));
      await updateDoc(doc(db, 'teachers', user.id), {
        lessonTimes: timesWithId,
        updatedAt: serverTimestamp()
      });
      toast.success('✅ تم تحديث مواعيد الحصص بنجاح!');

      await sendNotificationToTeacher(
        user.id,
        '🕒 تحديث مواعيد الحصص',
        `تم تحديث جدول الحصص، عدد المواعيد: ${times.length}`,
        'lesson_schedule_updated'
      );

      await sendNotificationToAllStudents(
        '🕒 تحديث مواعيد الحصص',
        `تم تحديث جدول الحصص، عدد المواعيد: ${times.length}`,
        'lesson_schedule'
      );

      setShowLessonModal(false);
      setSelectedLessonType(null);
    } catch (err) {
      toast.error('فشل تحديث المواعيد: ' + err.message);
    }
  };

  const deleteLessonTime = async (id) => {
    const ok = await confirm('حذف موعد', 'هل أنت متأكد من حذف هذا الموعد؟');
    if (!ok) return;
    try {
      const teacherRef = doc(db, 'teachers', user.id);
      const docSnap = await getDoc(teacherRef);
      if (docSnap.exists()) {
        const currentTimes = docSnap.data().lessonTimes || [];
        const filtered = currentTimes.filter(t => t.id !== id);
        await updateDoc(teacherRef, {
          lessonTimes: filtered,
          updatedAt: serverTimestamp()
        });
        toast.success('تم حذف الموعد بنجاح');
      }
    } catch (err) {
      toast.error('فشل حذف الموعد: ' + err.message);
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

      await sendNotificationToTeacher(
        user.id,
        nextStatus ? '🚫 تجميد حساب' : '✅ فك تجميد حساب',
        `تم ${nextStatus ? 'تجميد' : 'فك تجميد'} حساب الطالب ${student.name || ''}`,
        nextStatus ? 'freeze_student' : 'unfreeze_student',
        student.id
      );

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
    let studentData = null;
    try {
      const docSnap = await getDoc(doc(db, 'profiles', studentId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        let classNames = [];
        if (data.classIds) {
          const classMap = await fetchClassNames(data.classIds);
          classNames = data.classIds.map(id => classMap[id] || null).filter(Boolean);
        }
        studentData = {
          ...data,
          classes: classNames.map(name => ({ name }))
        };
      }
    } catch (err) {
      console.warn('فشل جلب بيانات الطالب قبل الحذف', err);
    }

    const ok = await confirm('حذف دائم', 'إجراء خطير: سيتم حذف الملف الشخصي للطالب نهائياً. ملاحظة: يجب حذف حساب المصادقة (Authentication) يدوياً من Firebase Console لتحرير اسم المستخدم.');
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'profiles', studentId));

      await sendNotificationToTeacher(
        user.id,
        '🗑️ حذف طالب',
        `تم حذف الملف الشخصي للطالب (${studentId})`,
        'delete_student',
        studentId
      );

      if (studentData && studentData.classIds && studentData.classIds.length > 0) {
        await sendNotificationToStudents(
          studentData.classIds,
          '📢 إشعار',
          'تم طرد طالب من شعبتك',
          'delete_student_notification',
          studentId
        );
      }

      if (studentData && studentData.phone) {
        sendDeleteMessage(studentData);
      } else {
        toast.info('لم يتم إرسال رسالة واتساب لأن رقم الهاتف غير مسجل.');
      }

      toast.success('تم حذف الملف الشخصي للطالب وإرسال رسالة إشعار لولي الأمر. تذكر حذف حساب المصادقة يدوياً من Firebase Console.');
    } catch (err) {
      toast.error('فشل حذف الطالب: ' + err.message);
    }
  };

  const updateStudentClasses = async (studentId, newClassIds) => {
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        classIds: newClassIds,
        updatedAt: serverTimestamp()
      });

      await sendNotificationToTeacher(
        user.id,
        '📌 تحديث الشعبة',
        `تم تحديث شعبة الطالب (${studentId})`,
        'update_class',
        studentId
      );

      toast.success('تم تحديث شعبة الطالب بنجاح');
    } catch (err) {
      toast.error('فشل تحديث الشعبة: ' + err.message);
    }
  };

  const openClassSelection = (student) => {
    setSelectedStudentForClass(student);
    setTempClassIds(student.classIds || []);
    setShowClassSelectionModal(true);
  };

  const saveClassSelection = async () => {
    if (!selectedStudentForClass) return;
    await updateStudentClasses(selectedStudentForClass.id, tempClassIds);
    setShowClassSelectionModal(false);
    setSelectedStudentForClass(null);
    setTempClassIds([]);
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (newStudentClassIds.length === 0) {
      toast.error('يرجى اختيار شعبة واحدة على الأقل للطالب.');
      return;
    }
    const sanitizedName = sanitizeInput(newStudentName);
    const sanitizedGender = sanitizeInput(newStudentGender);
    const sanitizedAge = sanitizeInput(arabicToEnglishNumber(newStudentAge));
    const sanitizedPhone = sanitizeInput(arabicToEnglishNumber(newStudentPhone));

    if (!sanitizedName || !sanitizedGender || !sanitizedAge || !sanitizedPhone) {
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

      let maxNum = 0;
      const q = query(collection(db, 'profiles'), where('username', '>=', 'knight'), where('username', '<', 'knight\uF7FF'));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        const uname = doc.data().username;
        if (uname && uname.startsWith('knight')) {
          const numPart = uname.substring(6);
          const num = parseInt(numPart, 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      const newUsername = `knight${maxNum + 1}`;
      const tempPassword = '123456';
      const email = `${newUsername}@readandrise.com`;

      const newId = generateId();
      const cleanPhone = sanitizedPhone.replace(/[^0-9]/g, '');
      const ageNum = parseInt(sanitizedAge);
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
        toast.error('العمر يجب أن يكون رقماً بين 1 و 99.');
        setStudentLoading(false);
        return;
      }

      await setDoc(doc(db, 'profiles', newId), {
        email: email,
        username: newUsername,
        name: sanitizedName,
        gender: sanitizedGender,
        age: ageNum,
        phone: cleanPhone,
        classIds: newStudentClassIds,
        role: 'student',
        isFrozen: false,
        infoVerified: false,
        isProfileComplete: false,
        pendingChanges: null,
        reviewResult: null,
        reviewExpiry: null,
        warnings: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await sendNotificationToTeacher(
        user.id,
        '➕ إضافة طالب جديد',
        `تم إضافة الطالب ${sanitizedName} (اسم المستخدم: ${newUsername})`,
        'add_student',
        newId
      );

      if (newStudentClassIds.length > 0) {
        await sendNotificationToStudents(
          newStudentClassIds,
          '📢 إشعار',
          'تم إضافة طالب جديد إلى شعبتك',
          'add_student_notification',
          newId
        );
      }

      const classMap = await fetchClassNames(newStudentClassIds);
      const classNames = newStudentClassIds.map(id => classMap[id] || null).filter(Boolean);
      const addedStudent = {
        name: sanitizedName,
        gender: sanitizedGender,
        age: ageNum,
        phone: cleanPhone,
        classIds: newStudentClassIds,
        classes: classNames.map(name => ({ name })),
        username: newUsername,
        password: tempPassword
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

  // ===== جلب البيانات =====
  const fetchTeacherData = async () => {
    try {
      const teacherId = user.id;
      const teacherRef = doc(db, 'teachers', teacherId);
      let teacherDoc = await getDoc(teacherRef);

      if (!teacherDoc.exists()) {
        await setDoc(teacherRef, {
          lessonTimes: [],
          homeworks: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        teacherDoc = await getDoc(teacherRef);
      }

      const teacherData = teacherDoc.data();
      setLessonTimes(teacherData.lessonTimes || []);
      setHomeworks(teacherData.homeworks || []);

      const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentsQuery);
      let studentsList = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const allClassIds = studentsList.flatMap(s => s.classIds || []);
      const classMap = await fetchClassNames(allClassIds);
      studentsList = studentsList.map(s => ({
        ...s,
        warnings: s.warnings || [],
        classes: (s.classIds || [])
          .map(id => ({ id, name: classMap[id] || null }))
          .filter(c => c.name)
      }));
      setStudents(studentsList);

      const withoutClass = studentsList.filter(s => !s.classes || s.classes.length === 0);
      setStudentsWithoutClass(withoutClass);
      if (withoutClass.length > 0 && !showStudentsWithoutClassModal) {
        setShowStudentsWithoutClassModal(true);
      }

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

      if (classesList.length > 0 && !selectedClassForLesson) {
        setSelectedClassForLesson(classesList[0].id);
      }

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
        setLessonTimes(data.lessonTimes || []);
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
        warnings: s.warnings || [],
        classes: (s.classIds || [])
          .map(id => ({ id, name: classMap[id] || null }))
          .filter(c => c.name)
      }));
      setStudents(studentsList);

      const withoutClass = studentsList.filter(s => !s.classes || s.classes.length === 0);
      setStudentsWithoutClass(withoutClass);
      if (withoutClass.length > 0 && !showStudentsWithoutClassModal) {
        setShowStudentsWithoutClassModal(true);
      }
    });

    const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', user.id));
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      const classesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(classesList);
      if (classesList.length > 0 && !selectedClassForLesson) {
        setSelectedClassForLesson(classesList[0].id);
      }
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

    if (user) {
      const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
      const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
      const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(list);
        setUnreadCount(list.filter(n => !n.read).length);
      });
      return () => {
        unsubscribeTeacher();
        unsubscribeStudents();
        unsubscribeClasses();
        unsubscribePending();
        unsubscribeNotif();
      };
    }

    return () => {
      unsubscribeTeacher();
      unsubscribeStudents();
      unsubscribeClasses();
      unsubscribePending();
    };
  }, [user.id]);

  const sortedHomeworks = [...homeworks].sort((a, b) => {
    if (a.is_draft && !b.is_draft) return 1;
    if (!a.is_draft && b.is_draft) return -1;
    return (b.is_scheduled ? 1 : 0) - (a.is_scheduled ? 1 : 0);
  });
  const sortedStudents = [...students].sort((a, b) => (a.isFrozen ? 1 : 0) - (b.isFrozen ? 1 : 0));

  const getNextLessonTime = (classId) => {
    if (!lessonTimes || lessonTimes.length === 0) return null;
    const now = new Date();
    let nearest = null;
    for (const lt of lessonTimes) {
      if (classId && lt.classId && lt.classId !== classId) continue;
      if (lt.type === 'once') {
        const date = new Date(lt.date);
        if (date > now) {
          if (!nearest || date < new Date(nearest.date)) nearest = lt;
        }
      } else if (lt.type === 'recurring') {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayIndex = days.indexOf(lt.day);
        const today = new Date();
        const currentDay = today.getDay();
        let diff = dayIndex - currentDay;
        if (diff < 0) diff += 7;
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + diff);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (nextDate > now) {
          if (!nearest || nextDate < new Date(nearest.date)) {
            nearest = { ...lt, date: nextDate.toISOString() };
          }
        }
      }
    }
    return nearest;
  };

  const nextLesson = getNextLessonTime(selectedClassForLesson);

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        {/* رأس الصفحة */}
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username || user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title="الإشعارات"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">🚪</button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        {/* عدد الطلاب والعد التنازلي */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-purple-200">عدد الطلاب</h3>
            <p className="text-4xl font-extrabold text-white mt-2 bg-purple-950/40 px-4 py-2 rounded-xl border border-purple-500/30 inline-block self-start">
              {students.length}
            </p>
          </div>
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-purple-200">الوقت المتبقي للحصة القادمة</h3>
              {classes.length > 0 && (
                <select
                  value={selectedClassForLesson}
                  onChange={(e) => setSelectedClassForLesson(e.target.value)}
                  className="bg-gray-700 text-white rounded-md px-3 py-1 text-sm border border-gray-600"
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              )}
            </div>
            <CountdownTimer targetDate={nextLesson ? nextLesson.date : null} />
            {nextLesson && (
              <div className="text-xs text-gray-400 mt-1">
                الموعد القادم للشعبة المختارة: {nextLesson.type === 'once' ? 'مرة واحدة' : 'متكرر'}
              </div>
            )}
          </div>
        </div>

        {/* عرض المواعيد المحددة */}
        {lessonTimes && lessonTimes.length > 0 && (
          <div className="bg-gray-800/40 p-4 rounded-2xl border border-gray-600">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-md font-semibold text-purple-200">📋 جدول المواعيد المحددة</h4>
              <span className="text-xs text-gray-400">(يمكنك حذف أي موعد)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {lessonTimes.map((lt) => {
                const classObj = classes.find(c => c.id === lt.classId);
                const className = classObj ? classObj.name : 'عام';
                return (
                  <div key={lt.id} className="bg-black/30 p-3 rounded-xl border border-gray-700 text-sm">
                    <div className="flex justify-start mb-2">
                      <button
                        onClick={() => deleteLessonTime(lt.id)}
                        className="text-red-400 hover:text-red-300 text-xs bg-red-950/40 px-2 py-1 rounded border border-red-500/30"
                      >
                        🗑️ حذف
                      </button>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">الشعبة:</span>
                      <span className="text-white font-medium">{className}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">النوع:</span>
                      <span className="text-blue-300">{lt.type === 'once' ? 'مرة واحدة' : 'متكرر'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">التاريخ/اليوم:</span>
                      <span className="text-white">
                        {lt.type === 'once' 
                          ? new Date(lt.date).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })
                          : `كل ${lt.day}`
                        }
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">الوقت:</span>
                      <span className="text-white">{lt.time.hours}:{String(lt.time.minutes).padStart(2, '0')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* تنبيه الطلاب بدون شعب */}
        {studentsWithoutClass.length > 0 && (
          <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-2xl">
            <h4 className="text-red-300 font-semibold">⚠️ طلاب بدون شعبة</h4>
            <ul className="list-disc list-inside text-sm text-gray-300">
              {studentsWithoutClass.map(s => (
                <li key={s.id}>{s.name || s.username}</li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-2">يرجى تحديد شعبة لهم من خلال زر "تحديد الشعبة" في قائمة الطلاب.</p>
          </div>
        )}

        {/* مراجعات الملفات الشخصية */}
        {pendingReviews.length > 0 && (
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
            <h3 className="text-xl font-semibold text-yellow-300 mb-3">📋 مراجعات الملفات الشخصية</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {pendingReviews.map(student => {
                const changes = [];
                if (student.pendingChanges?.name && student.pendingChanges.name !== student.name) {
                  changes.push({ field: 'الاسم', old: student.name, new: student.pendingChanges.name });
                }
                if (student.pendingChanges?.gender && student.pendingChanges.gender !== student.gender) {
                  changes.push({ field: 'الجنس', old: student.gender, new: student.pendingChanges.gender });
                }
                if (student.pendingChanges?.age && student.pendingChanges.age != student.age) {
                  changes.push({ field: 'العمر', old: student.age, new: student.pendingChanges.age });
                }
                if (student.pendingChanges?.phone && student.pendingChanges.phone !== student.phone) {
                  changes.push({ field: 'رقم الهاتف', old: student.phone, new: student.pendingChanges.phone });
                }
                if (changes.length === 0) {
                  changes.push({ field: 'جميع البيانات', old: '(غير معروض)', new: 'طلب تعديل' });
                }
                return (
                  <div key={student.id} className="p-3 bg-black/30 rounded-xl border border-yellow-500/20">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div>
                        <p className="text-white font-medium">{student.name || student.username}</p>
                        <p className="text-xs text-gray-400">اسم المستخدم: {student.username}</p>
                        {student.classes && <p className="text-xs text-blue-300">الشعب: {student.classes.map(c => c.name).join(', ')}</p>}
                        <div className="mt-1 text-xs text-gray-300 bg-yellow-950/30 p-2 rounded border border-yellow-500/10">
                          <p className="font-semibold text-yellow-200">التغييرات المطلوبة:</p>
                          {changes.map((c, idx) => (
                            <p key={idx}><span className="text-gray-400">{c.field}:</span> <span className="text-red-400 line-through">{c.old}</span> → <span className="text-green-300">{c.new}</span></p>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openReviewModal(student)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">مراجعة الطلب</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* إدارة الواجبات */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-pink-300">إدارة الواجبات</h3>
            <button onClick={() => setShowAssignmentChoice(true)} type="button" className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-2 px-4 text-sm rounded-md text-white">📝 إضافة واجب جديد</button>
          </div>
          {homeworks.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {sortedHomeworks.map(hw => {
                const isRevealed = new Date(hw.reveal_time).getTime() <= new Date().getTime();
                const classObj = classes.find(c => c.id === hw.section);
                const displayName = classObj ? classObj.name : hw.section;
                return (
                  <div key={hw.id} className={`p-3 rounded-xl border ${hw.is_draft ? 'border-yellow-500/30 bg-yellow-900/20' : 'border-gray-700 bg-black/30'} flex justify-between items-start gap-3`}>
                    <div className="flex-1">
                      <p className="text-gray-100 text-sm">{hw.text}</p>
                      {hw.is_draft && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full mr-2">💾 مسودة</span>}
                      {hw.section && <span className="text-xs text-blue-300 mr-2">(شعبة {displayName})</span>}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {!hw.is_draft && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${isRevealed ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                            {isRevealed ? '🟢 متاح' : '📅 مجدول'}
                          </span>
                        )}
                        {hw.is_draft && <span className="text-xs text-yellow-400">⏳ لم ينشر بعد</span>}
                        <span className="text-xs text-gray-400">
                          {hw.is_draft ? `تم الحفظ: ${new Date(hw.created_at).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}` : 
                          new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                        </span>
                      </div>
                      {!hw.is_draft && !isRevealed && <HomeworkTextCountdown targetDate={hw.reveal_time} />}
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

        {/* إدارة الطلاب */}
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

        {/* جدولة مواعيد الحصص */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة مواعيد الحصص</h3>
          <button onClick={() => setShowLessonChoice(true)} type="button" className="btn-primary bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 py-3 px-6 w-full sm:w-auto rounded-md text-white">🕒 إدارة المواعيد (حتى 6)</button>
        </div>
      </div>

      {/* ===== مودال اختيار نوع الواجب ===== */}
      <ChoiceModal
        isOpen={showAssignmentChoice}
        onClose={() => {
          setShowAssignmentChoice(false);
          setSelectedAssignmentType(null);
        }}
        onSelect={(type) => {
          setSelectedAssignmentType(type);
          setShowAssignmentChoice(false);
          setShowAssignmentModal(true);
        }}
        title="اختر نوع الواجب"
        options={[
          { value: 'now', label: '📤 نشر فوراً' },
          { value: 'schedule', label: '📅 جدولة (تاريخ ووقت)' },
          { value: 'draft', label: '💾 حفظ كمسودة (نشر لاحقاً)' },
          { value: 'delay', label: '⏱️ نشر بعد وقت (ساعات/دقائق)' }
        ]}
      />

      {/* ===== مودال اختيار نوع الحصة ===== */}
      <ChoiceModal
        isOpen={showLessonChoice}
        onClose={() => {
          setShowLessonChoice(false);
          setSelectedLessonType(null);
        }}
        onSelect={(type) => {
          setSelectedLessonType(type);
          setShowLessonChoice(false);
          setShowLessonModal(true);
        }}
        title="إدارة مواعيد الحصص"
        options={[
          { value: 'manage', label: '📅 إضافة / تعديل المواعيد (حتى 6)' }
        ]}
      />

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

      {/* ===== مودال الطلاب بدون شعب ===== */}
      {showStudentsWithoutClassModal && studentsWithoutClass.length > 0 && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowStudentsWithoutClassModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">⚠️ طلاب بدون شعبة</h3>
            <p className="text-gray-300 text-sm mb-4">يرجى تحديد شعبة لكل طالب من خلال زر "تحديد الشعبة" بجانب كل طالب.</p>
            <div className="space-y-4">
              {studentsWithoutClass.map(s => (
                <div key={s.id} className="p-3 bg-black/30 rounded-xl border border-yellow-500/20 flex justify-between items-center">
                  <span className="text-white font-medium">{s.name || s.username}</span>
                  <button
                    onClick={() => {
                      setShowStudentsWithoutClassModal(false);
                      openClassSelection(s);
                    }}
                    className="btn-primary bg-blue-600 hover:bg-blue-700 py-1 px-3 text-sm rounded-md text-white"
                  >
                    تحديد الشعبة
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setShowStudentsWithoutClassModal(false)} className="mt-4 btn-primary bg-gray-600 hover:bg-gray-700 w-full py-2 rounded-md text-white">إغلاق</button>
          </div>
        </div>
      )}

      {/* ===== مودال تحديد الشعبة ===== */}
      {showClassSelectionModal && selectedStudentForClass && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowClassSelectionModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">تحديد شعبة الطالب</h3>
            <p className="text-gray-300 text-sm mb-2">الطالب: <strong>{selectedStudentForClass.name || selectedStudentForClass.username}</strong></p>
            <div className="space-y-2">
              {classes.map(cls => (
                <label key={cls.id} className="flex items-center gap-2 text-gray-200">
                  <input
                    type="checkbox"
                    checked={tempClassIds.includes(cls.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setTempClassIds([...tempClassIds, cls.id]);
                      } else {
                        setTempClassIds(tempClassIds.filter(id => id !== cls.id));
                      }
                    }}
                    className="accent-blue-500"
                  />
                  {cls.name}
                </label>
              ))}
              {classes.length === 0 && <p className="text-gray-400">لا توجد شعب مسجلة. أضف شعبة أولاً.</p>}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveClassSelection} className="btn-primary bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md text-white">حفظ</button>
              <button onClick={() => setShowClassSelectionModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md text-white">إلغاء</button>
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
                  sendActivationMessage(newlyAddedStudent, newlyAddedStudent.username, newlyAddedStudent.password);
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

      {/* ===== مودال عرض قوائم الطلبة ===== */}
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
                const warningCount = (s.warnings || []).length;
                return (
                  <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.isFrozen ? 'bg-gray-800/60 border-gray-700 opacity-80' : 'bg-gray-800/30 border-gray-700'}`}>
                    <div className="flex items-center gap-3 flex-wrap flex-1">
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
                      <span className="text-xs text-yellow-300 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">
                        ⚠️ الإنذارات: {warningCount}/3
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {warningCount < 3 ? (
                        <button
                          onClick={() => openWarningModal(s)}
                          className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30"
                        >
                          ⚠️ إنذار ({warningCount}/3)
                        </button>
                      ) : (
                        <span className="text-xs text-red-400 bg-red-950/40 px-2 py-1 rounded border border-red-500/30">
                          ⛔ إنذارات مكتملة
                        </span>
                      )}
                      {warningCount >= 3 && (
                        <button
                          onClick={() => handleDeleteStudentPermanently(s.id)}
                          className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30 animate-pulse"
                        >
                          🗑️ حذف الحساب (إجباري)
                        </button>
                      )}
                      <button
                        onClick={() => openClassSelection(s)}
                        className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/30"
                      >
                        📌 تحديد الشعبة
                      </button>
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
                <input type="text" inputMode="numeric" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentAge} onChange={e => setNewStudentAge(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" inputMode="numeric" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentPhone} onChange={e => setNewStudentPhone(e.target.value)} required />
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
                  value={selectedStudentForMessage?.classes?.length > 0 ? selectedStudentForMessage.classes.map(c => c.name).join(', ') : 'لا توجد شعبة'}
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

      {/* ===== مودال الإشعارات ===== */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNotificationsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300">📢 الإشعارات</h3>
              <button onClick={() => setShowNotificationsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className={`p-3 rounded-xl border ${n.read ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-800/60 border-blue-500/40'}`}>
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-gray-400">
                        {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                    {!n.read && (
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'notifications', user.id, 'userNotifications', n.id), {
                            read: true,
                            readAt: serverTimestamp()
                          });
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 mt-2 block"
                      >
                        وضع علامة مقروء
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {notifications.some(n => !n.read) && (
              <button
                onClick={async () => {
                  const batch = writeBatch(db);
                  notifications.filter(n => !n.read).forEach(n => {
                    const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
                    batch.update(ref, { read: true, readAt: serverTimestamp() });
                  });
                  await batch.commit();
                }}
                className="mt-4 text-sm text-purple-400 hover:text-purple-300"
              >
                تعيين الكل كمقروء
              </button>
            )}
          </div>
        </div>
      )}

      {/* ===== مودال إضافة الواجب ===== */}
      <AddAssignmentModal
        isOpen={showAssignmentModal}
        onClose={() => {
          setShowAssignmentModal(false);
          setSelectedAssignmentType(null);
        }}
        onSubmit={saveHomeworkFromModal}
        classesList={classes}
        initialMode={selectedAssignmentType || 'now'}
      />

      {/* ===== مودال جدولة الحصة ===== */}
      <AddLessonModal
        isOpen={showLessonModal}
        onClose={() => {
          setShowLessonModal(false);
          setSelectedLessonType(null);
        }}
        onSubmit={saveLessonTimesFromModal}
        initialTimes={lessonTimes}
        classesList={classes}
      />

      {/* ===== مودال الإنذارات ===== */}
      {showWarningModal && selectedStudentForWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWarningModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">⚠️ إصدار إنذار للطالب</h3>
            <p className="text-gray-300 text-sm mb-2">
              الطالب: <strong>{selectedStudentForWarning.name}</strong>
              <br />
              الإنذار الحالي: رقم { (selectedStudentForWarning.warnings || []).length + 1 } من 3
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block mb-1">وصف المخالفة</label>
                <textarea
                  className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white resize-none"
                  placeholder="اكتب وصف المخالفة..."
                  value={warningDescription}
                  onChange={(e) => setWarningDescription(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmWarning}
                  className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white"
                >
                  إرسال الإنذار
                </button>
                <button
                  onClick={() => setShowWarningModal(false)}
                  className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال مراجعة الطلب ===== */}
      {showReviewModal && selectedReviewStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowReviewModal(false); setSelectedReviewStudent(null); }}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">📋 مراجعة طلب تعديل البيانات</h3>
            <p className="text-gray-300 text-sm mb-2">
              الطالب: <strong>{selectedReviewStudent.name}</strong> (اسم المستخدم: {selectedReviewStudent.username})
            </p>
            <div className="space-y-2 bg-black/20 p-4 rounded-xl border border-gray-700">
              <p className="text-yellow-200 text-sm font-semibold">التغييرات المطلوبة:</p>
              {selectedReviewStudent.pendingChanges && (
                <>
                  {selectedReviewStudent.pendingChanges.name && selectedReviewStudent.pendingChanges.name !== selectedReviewStudent.name && (
                    <div className="flex justify-between text-sm"><span className="text-gray-400">الاسم:</span> <span><span className="text-red-400 line-through">{selectedReviewStudent.name}</span> → <span className="text-green-300">{selectedReviewStudent.pendingChanges.name}</span></span></div>
                  )}
                  {selectedReviewStudent.pendingChanges.gender && selectedReviewStudent.pendingChanges.gender !== selectedReviewStudent.gender && (
                    <div className="flex justify-between text-sm"><span className="text-gray-400">الجنس:</span> <span><span className="text-red-400 line-through">{selectedReviewStudent.gender}</span> → <span className="text-green-300">{selectedReviewStudent.pendingChanges.gender}</span></span></div>
                  )}
                  {selectedReviewStudent.pendingChanges.age && selectedReviewStudent.pendingChanges.age != selectedReviewStudent.age && (
                    <div className="flex justify-between text-sm"><span className="text-gray-400">العمر:</span> <span><span className="text-red-400 line-through">{selectedReviewStudent.age}</span> → <span className="text-green-300">{selectedReviewStudent.pendingChanges.age}</span></span></div>
                  )}
                  {selectedReviewStudent.pendingChanges.phone && selectedReviewStudent.pendingChanges.phone !== selectedReviewStudent.phone && (
                    <div className="flex justify-between text-sm"><span className="text-gray-400">رقم الهاتف:</span> <span><span className="text-red-400 line-through">{selectedReviewStudent.phone}</span> → <span className="text-green-300">{selectedReviewStudent.pendingChanges.phone}</span></span></div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => acceptReview(selectedReviewStudent.id)} className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white">✅ قبول</button>
              <button onClick={() => rejectReview(selectedReviewStudent.id)} className="btn-primary bg-red-600 hover:bg-red-700 px-6 py-2 rounded-md text-white">❌ رفض</button>
              <button onClick={() => { setShowReviewModal(false); setSelectedReviewStudent(null); }} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// StudentPanel (معدل - إضافة عداد الطلاب + إشعارات فورية)
// ============================================================
const StudentPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [teacherData, setTeacherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [availableHomeworks, setAvailableHomeworks] = useState([]);
  const [profile, setProfile] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editData, setEditData] = useState({});
  const [editFields, setEditFields] = useState({});
  const [pendingChanges, setPendingChanges] = useState(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [sentAccelerate, setSentAccelerate] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPendingRequestModal, setShowPendingRequestModal] = useState(false);

  const [showReviewResultModal, setShowReviewResultModal] = useState(false);
  const [reviewExpiry, setReviewExpiry] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState({ hours: 0, minutes: 0, seconds: 0 });

  // ===== عداد الطلاب =====
  const [classStudentCount, setClassStudentCount] = useState({});

  // ===== إعداد الإشعارات الفورية =====
  useEffect(() => {
    const setupPush = async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY' });
          if (token) {
            await updateDoc(doc(db, 'profiles', user.id), {
              fcmTokens: arrayUnion(token)
            });
            console.log('Student FCM token saved');
          }
        }
      } catch (err) {
        console.error('FCM setup error:', err);
      }
    };
    setupPush();

    const unsubscribe = onMessage(messaging, (payload) => {
      toast.custom((t) => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsubscribe();
  }, [user.id]);

  // ===== جلب عدد الطلاب في كل شعبة =====
  useEffect(() => {
    const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const unsubscribe = onSnapshot(studentsQuery, (snapshot) => {
      const counts = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        (data.classIds || []).forEach(classId => {
          counts[classId] = (counts[classId] || 0) + 1;
        });
      });
      setClassStudentCount(counts);
    });
    return () => unsubscribe();
  }, []);

  // ===== دوال الطالب =====
  const cleanOldNotifications = async () => {
    if (!user) return;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oldOnes = notifications.filter(n => {
      if (!n.createdAt) return false;
      const date = n.createdAt.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
      return date < sevenDaysAgo;
    });
    if (oldOnes.length === 0) return;
    try {
      const batch = writeBatch(db);
      oldOnes.forEach(n => {
        const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
        batch.delete(ref);
      });
      await batch.commit();
      toast.success(`تم حذف ${oldOnes.length} إشعار قديم`);
    } catch (err) {
      console.error('خطأ في حذف الإشعارات القديمة:', err);
    }
  };

  const handleOpenNotifications = () => {
    cleanOldNotifications();
    setShowNotificationsModal(true);
  };

  const fetchTeacherInfo = async () => {
    try {
      const q = query(collection(db, 'teachers'));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const data = docSnap.data();
        setTeacherData({ id: docSnap.id, ...data });
        const now = new Date().getTime();
        const available = (data.homeworks || []).filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
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
        let classNames = {};
        if (data.classIds && data.classIds.length > 0) {
          classNames = await fetchClassNames(data.classIds);
        }
        data.classes = (data.classIds || []).map(id => ({
          id,
          name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), {
              reviewResult: null,
              reviewExpiry: null
            });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }

        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        if (data.pendingChanges && data.pendingChanges.sentAccelerate) {
          setSentAccelerate(true);
        } else {
          setSentAccelerate(false);
        }

        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        } else {
          setReviewResult(null);
          setReviewExpiry(null);
        }
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
        const available = (data.homeworks || []).filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    });

    const unsubscribeProfile = onSnapshot(doc(db, 'profiles', user.id), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let classNames = {};
        if (data.classIds && data.classIds.length > 0) {
          classNames = await fetchClassNames(data.classIds);
        }
        data.classes = (data.classIds || []).map(id => ({
          id,
          name: classNames[id] || null
        })).filter(c => c.name);

        if (data.reviewResult && data.reviewExpiry) {
          const expiry = new Date(data.reviewExpiry);
          if (Date.now() > expiry.getTime()) {
            await updateDoc(doc(db, 'profiles', user.id), {
              reviewResult: null,
              reviewExpiry: null
            });
            data.reviewResult = null;
            data.reviewExpiry = null;
          }
        }

        setProfile(data);
        setEditData(data || {});
        setPendingChanges(data.pendingChanges || null);
        setHasPendingRequest(!!data.pendingChanges);
        if (data.pendingChanges && data.pendingChanges.sentAccelerate) {
          setSentAccelerate(true);
        } else {
          setSentAccelerate(false);
        }

        if (data.reviewResult && data.reviewExpiry) {
          setReviewResult(data.reviewResult);
          setReviewExpiry(data.reviewExpiry);
        } else {
          setReviewResult(null);
          setReviewExpiry(null);
        }
      }
    });

    if (user) {
      const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
      const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
      const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(list);
        setUnreadCount(list.filter(n => !n.read).length);
      });
      return () => {
        unsubscribeTeacher();
        unsubscribeProfile();
        unsubscribeNotif();
      };
    }

    return () => {
      unsubscribeTeacher();
      unsubscribeProfile();
    };
  }, [user.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (teacherData?.homeworks) {
        const now = new Date().getTime();
        const available = teacherData.homeworks.filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() <= now);
        setAvailableHomeworks(available);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [teacherData?.homeworks]);

  useEffect(() => {
    if (!reviewExpiry) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const expiry = new Date(reviewExpiry).getTime();
      const diff = expiry - now;
      if (diff <= 0) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
        clearInterval(interval);
        setShowReviewResultModal(false);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining({ hours, minutes, seconds });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reviewExpiry]);

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null;
    const now = new Date().getTime();
    const scheduled = teacherData.homeworks.filter(hw => !hw.is_draft && new Date(hw.reveal_time).getTime() > now);
    if (scheduled.length === 0) return null;
    return scheduled.reduce((a, b) => new Date(a.reveal_time).getTime() < new Date(b.reveal_time).getTime() ? a : b);
  };

  const nextScheduled = getNextScheduledHomework();

  const getNextLessonTime = () => {
    if (!teacherData?.lessonTimes || teacherData.lessonTimes.length === 0) return null;
    const now = new Date();
    let nearest = null;
    for (const lt of teacherData.lessonTimes) {
      if (lt.type === 'once') {
        const date = new Date(lt.date);
        if (date > now) {
          if (!nearest || date < new Date(nearest.date)) nearest = lt;
        }
      } else if (lt.type === 'recurring') {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayIndex = days.indexOf(lt.day);
        const today = new Date();
        const currentDay = today.getDay();
        let diff = dayIndex - currentDay;
        if (diff < 0) diff += 7;
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + diff);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (nextDate > now) {
          if (!nearest || nextDate < new Date(nearest.date)) {
            nearest = { ...lt, date: nextDate.toISOString() };
          }
        }
      }
    }
    return nearest;
  };

  const nextLesson = getNextLessonTime();

  const openProfileModal = () => {
    if (hasPendingRequest) {
      setShowPendingRequestModal(true);
      return;
    }
    if (reviewResult && reviewExpiry) {
      setShowReviewResultModal(true);
      return;
    }
    setShowProfileModal(true);
    setEditData({
      name: profile?.name || '',
      gender: profile?.gender || '',
      age: profile?.age || '',
      phone: profile?.phone || ''
    });
    setEditFields({});
  };

  const toggleEditField = (field) => {
    setEditFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleEditChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const handleSendChanges = async () => {
    const name = sanitizeInput(editData.name);
    const phone = sanitizeInput(editData.phone);
    if (!name || !phone) {
      toast.error('الاسم ورقم الهاتف إلزاميان');
      return;
    }
    const changes = {};
    if (name !== profile.name) changes.name = name;
    if (editData.gender !== profile.gender) changes.gender = editData.gender;
    if (editData.age !== profile.age) changes.age = parseInt(editData.age) || null;
    if (phone !== profile.phone) changes.phone = phone;
    if (Object.keys(changes).length === 0) {
      toast.error('لم تقم بأي تغيير.');
      return;
    }

    try {
      const updates = {
        infoVerified: false,
        pendingChanges: {
          updated_at: new Date().toISOString(),
          ...changes
        },
        updatedAt: serverTimestamp()
      };
      await updateDoc(doc(db, 'profiles', user.id), updates);
      toast.success('تم إرسال طلب تعديل المعلومات بنجاح.');
      setShowProfileModal(false);
      setShowConfirmModal(true);
    } catch (err) {
      toast.error('فشل إرسال الطلب: ' + err.message);
    }
  };

  const handleContactTeacher = () => {
    sendUrgentReminderMessage(profile);
    if (profile && profile.pendingChanges) {
      updateDoc(doc(db, 'profiles', user.id), {
        'pendingChanges.sentAccelerate': true
      }).catch(err => console.error(err));
    }
    setSentAccelerate(true);
    setShowConfirmModal(false);
    setShowPendingRequestModal(false);
    toast.success('تم إرسال رسالة الاستعجال للمعلم.');
  };

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.name || user.username || user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title="الإشعارات"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">🚪</button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        {/* معلوماتي الشخصية */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-blue-200">معلوماتي الشخصية</h3>
            <button onClick={openProfileModal} type="button" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
              <span>✏️</span> تعديل
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <p><span className="text-gray-400">الاسم:</span> {profile?.name || 'غير مسجل'}</p>
            <p><span className="text-gray-400">الجنس:</span> {profile?.gender || 'غير محدد'}</p>
            <p><span className="text-gray-400">العمر:</span> {profile?.age || 'غير محدد'}</p>
            <p><span className="text-gray-400">رقم الهاتف:</span> {profile?.phone || 'غير مسجل'}</p>
            <p className="col-span-2"><span className="text-gray-400">الشعب:</span> {profile?.classes?.map(c => c.name).join(', ') || 'غير محددة'}</p>
            <p className="col-span-2">
              <span className="text-gray-400">حالة التحقق:</span>
              {profile?.reviewResult === 'approved' ? (
                <span className="text-green-400 mr-2">✅ تمت الموافقة على التغييرات</span>
              ) : profile?.reviewResult === 'rejected' ? (
                <span className="text-red-400 mr-2">❌ تم رفض التغييرات</span>
              ) : profile?.pendingChanges ? (
                <span className="text-yellow-400 mr-2">⏳ قيد المراجعة</span>
              ) : profile?.infoVerified ? (
                <span className="text-green-400 mr-2">✅ تم التحقق</span>
              ) : (
                <span className="text-gray-400 mr-2">لا توجد طلبات مقدمة</span>
              )}
              {profile?.reviewExpiry && (
                <span className="text-xs text-gray-400 mr-2">
                  (ينتهي بعد {Math.max(0, Math.ceil((new Date(profile.reviewExpiry) - new Date()) / (1000 * 60 * 60)))} ساعة)
                </span>
              )}
            </p>
            <p className="col-span-2"><span className="text-gray-400">الإنذارات:</span> {profile?.warnings?.length ? profile.warnings.map(w => `#${w.type}`).join(', ') : 'لا يوجد'}</p>
            {profile?.isFrozen && profile?.freezeReason === 'تجاوز عدد الإنذارات (3 إنذارات)' && (
              <div className="col-span-2 bg-red-900/30 p-2 rounded-xl border border-red-500/30 text-red-300 text-sm">
                ⛔ تم تجميد حسابك بسبب تجاوز عدد الإنذارات. يرجى التواصل مع المعلم.
              </div>
            )}
          </div>
        </div>

        {/* ===== عداد الطلاب في شعبك ===== */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-green-500/20">
          <h3 className="text-xl font-semibold text-green-200 mb-2">👥 عدد الطلاب في شعبك</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {profile?.classes?.map(cls => (
              <div key={cls.id} className="bg-black/30 p-3 rounded-xl flex justify-between items-center border border-green-500/10">
                <span className="text-gray-300">{cls.name}</span>
                <span className="text-white font-bold text-lg bg-green-900/40 px-3 py-1 rounded-full">
                  {classStudentCount[cls.id] || 0}
                </span>
              </div>
            ))}
            {(!profile?.classes || profile.classes.length === 0) && (
              <p className="text-gray-400 text-sm col-span-2">لا توجد شعب مسجلة لك.</p>
            )}
          </div>
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          <CountdownTimer targetDate={nextLesson ? nextLesson.date : null} />
          {teacherData?.lessonTimes && teacherData.lessonTimes.length > 0 && (
            <div className="text-gray-300 text-center mt-2">
              <p>جميع المواعيد المحددة:</p>
              <ul className="text-sm list-disc list-inside">
                {teacherData.lessonTimes.map((lt, idx) => (
                  <li key={idx}>
                    {lt.type === 'once' ? 
                      `مرة واحدة: ${new Date(lt.date).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}` :
                      `متكرر: كل ${lt.day} الساعة ${lt.time.hours}:${String(lt.time.minutes).padStart(2, '0')}`
                    }
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-3">
          <h3 className="text-xl font-semibold text-pink-300">الواجبات المدرسية</h3>
          {availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
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

      {/* ===== مودال تعديل المعلومات الشخصية ===== */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowProfileModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">✏️ تعديل المعلومات الشخصية</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">الاسم الكامل <span className="text-red-400">*</span></label>
                  <button onClick={() => toggleEditField('name')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.name ? 'إلغاء التعديل' : '✏️ تعديل'}
                  </button>
                </div>
                {editFields.name ? (
                  <input
                    type="text"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.name}
                    onChange={(e) => handleEditChange('name', e.target.value)}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.name || 'غير مسجل'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">الجنس</label>
                  <button onClick={() => toggleEditField('gender')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.gender ? 'إلغاء التعديل' : '✏️ تعديل'}
                  </button>
                </div>
                {editFields.gender ? (
                  <select
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.gender}
                    onChange={(e) => handleEditChange('gender', e.target.value)}
                  >
                    <option value="">اختر</option>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.gender || 'غير محدد'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">العمر</label>
                  <button onClick={() => toggleEditField('age')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.age ? 'إلغاء التعديل' : '✏️ تعديل'}
                  </button>
                </div>
                {editFields.age ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.age}
                    onChange={(e) => handleEditChange('age', arabicToEnglishNumber(e.target.value))}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.age || 'غير محدد'}</p>
                )}
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm text-gray-300">رقم الهاتف <span className="text-red-400">*</span></label>
                  <button onClick={() => toggleEditField('phone')} className="text-xs text-blue-400 hover:text-blue-300">
                    {editFields.phone ? 'إلغاء التعديل' : '✏️ تعديل'}
                  </button>
                </div>
                {editFields.phone ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={editData.phone}
                    onChange={(e) => handleEditChange('phone', arabicToEnglishNumber(e.target.value))}
                  />
                ) : (
                  <p className="text-white p-2 bg-gray-800/50 rounded-md">{editData.phone || 'غير مسجل'}</p>
                )}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleSendChanges} className="btn-primary bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-md text-white">📤 إرسال التغييرات</button>
                <button onClick={() => setShowProfileModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال الطلب المعلق ===== */}
      {showPendingRequestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPendingRequestModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">⏳ طلب قيد المراجعة</h3>
            <p className="text-gray-300 text-center mb-4">
              لديك طلب تعديل بيانات قيد المراجعة حالياً. يرجى الانتظار حتى يتم الرد على طلبك.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  if (!sentAccelerate) {
                    handleContactTeacher();
                  } else {
                    toast.info('تم إرسال رسالة الاستعجال مسبقاً.');
                  }
                }}
                disabled={sentAccelerate}
                className={`btn-primary w-full py-3 rounded-md text-white ${
                  sentAccelerate 
                    ? 'bg-gray-600 cursor-not-allowed opacity-60' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {sentAccelerate ? '✅ تم إرسال الطلب للمعلم' : '📨 إرسال رسالة لتسريع الطلب'}
              </button>
              <button
                onClick={() => setShowPendingRequestModal(false)}
                className="btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال التأكيد بعد الإرسال ===== */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-green-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">✅ تم إرسال الطلب</h3>
            <p className="text-gray-300 text-center mb-4">
              تم ارسال طلب تعديل المعلومات سيتم مراجعة البيانات خلال 48 ساعة والتأكد من صحتها وتعديلها.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => sendContactTeacherMessage(profile, 'update')}
                className="btn-primary bg-blue-600 hover:bg-blue-700 w-full py-3 rounded-md text-white"
              >
                💬 تواصل مع المعلم لتسريع معالجة طلبك
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="btn-primary bg-red-600 hover:bg-red-700 w-full py-3 rounded-md text-white"
              >
                ⏳ انتظار
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال الوقت المتبقي لانتهاء صلاحية نتيجة المراجعة ===== */}
      {showReviewResultModal && reviewExpiry && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReviewResultModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-purple-300 mb-2 text-center">
              {reviewResult === 'approved' ? '✅ تمت الموافقة على التغييرات' : '❌ تم رفض التغييرات'}
            </h3>
            <p className="text-gray-300 text-center mb-4">
              {reviewResult === 'approved' 
                ? 'تم تحديث بياناتك بنجاح. يمكنك تعديل بياناتك مرة أخرى بعد انتهاء المدة المحددة.'
                : 'تم رفض طلب تعديل البيانات. يمكنك تقديم طلب جديد بعد انتهاء المدة المحددة.'
              }
            </p>
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">الوقت المتبقي لفتح التعديل:</p>
              <div className="flex justify-center gap-4 text-2xl font-bold text-white">
                <div>
                  <span className="text-purple-300">{String(timeRemaining.hours).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">ساعات</span>
                </div>
                <span className="text-gray-500">:</span>
                <div>
                  <span className="text-purple-300">{String(timeRemaining.minutes).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">دقائق</span>
                </div>
                <span className="text-gray-500">:</span>
                <div>
                  <span className="text-purple-300">{String(timeRemaining.seconds).padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">ثواني</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowReviewResultModal(false)}
              className="mt-4 btn-primary bg-gray-600 hover:bg-gray-700 w-full py-3 rounded-md text-white"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* ===== مودال الإشعارات ===== */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNotificationsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300">📢 الإشعارات</h3>
              <button onClick={() => setShowNotificationsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className={`p-3 rounded-xl border ${n.read ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-800/60 border-blue-500/40'}`}>
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-gray-400">
                        {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                    {!n.read && (
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'notifications', user.id, 'userNotifications', n.id), {
                            read: true,
                            readAt: serverTimestamp()
                          });
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300 mt-2 block"
                      >
                        وضع علامة مقروء
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {notifications.some(n => !n.read) && (
              <button
                onClick={async () => {
                  const batch = writeBatch(db);
                  notifications.filter(n => !n.read).forEach(n => {
                    const ref = doc(db, 'notifications', user.id, 'userNotifications', n.id);
                    batch.update(ref, { read: true, readAt: serverTimestamp() });
                  });
                  await batch.commit();
                }}
                className="mt-4 text-sm text-purple-400 hover:text-purple-300"
              >
                تعيين الكل كمقروء
              </button>
            )}
          </div>
        </div>
      )}
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
      let q = query(collection(db, 'profiles'), where('uid', '==', firebaseUser.uid));
      let querySnapshot = await getDocs(q);
      let docSnap = null;
      let docId = null;
      let profile = null;

      if (!querySnapshot.empty) {
        docSnap = querySnapshot.docs[0];
        docId = docSnap.id;
        profile = docSnap.data();
      } else {
        q = query(collection(db, 'profiles'), where('email', '==', firebaseUser.email));
        querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          docSnap = querySnapshot.docs[0];
          docId = docSnap.id;
          profile = docSnap.data();
          await updateDoc(doc(db, 'profiles', docId), { uid: firebaseUser.uid });
        } else {
          setPendingUserForComplete({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: firebaseUser.displayName || ''
          });
          setUser(null);
          setFrozenUser(null);
          setLoading(false);
          return;
        }
      }

      if (profile.isFrozen) {
        let classNames = [];
        if (profile.classIds) {
          const classMap = await fetchClassNames(profile.classIds);
          classNames = profile.classIds.map(id => classMap[id] || null).filter(Boolean);
        }
        setFrozenUser({
          id: docId,
          uid: firebaseUser.uid,
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
          id: docId,
          uid: firebaseUser.uid,
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
        id: docId,
        uid: firebaseUser.uid,
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