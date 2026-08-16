import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaPen, FaCalendarAlt, FaSave, FaClock, FaUpload, FaClipboardList,
  FaSchool, FaUser, FaBell, FaSignOutAlt, FaExclamationTriangle,
  FaCheckCircle, FaTimesCircle, FaBullhorn, FaTrashAlt, FaEdit,
  FaThumbtack, FaComment, FaEnvelope, FaHourglassHalf, FaPlus, FaBan,
  FaWhatsapp, FaUsers, FaTrash, FaUnlockAlt, FaEye, FaEyeSlash,
  FaSpinner, FaVideo, FaWindowRestore, FaMobileAlt
} from 'react-icons/fa';
import { db, messaging } from '../../firebase';
import { auth, secondaryAuth } from '../../services/firebaseAuth';
import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query,
  where, getDocs, onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
  orderBy, writeBatch, addDoc
} from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { supabase } from '../../supabaseClient';

import { useConfirm } from '../common/ConfirmContext';
import { CountdownTimer } from '../common/CountdownTimer';
import { ChoiceModal } from '../common/ChoiceModal';
import { AddAssignmentModal } from '../common/AddAssignmentModal';
import { AddLessonModal } from '../common/AddLessonModal';
import { ZoomMeetingModal } from '../common/MeetingModal';
import { 
  generateId, sanitizeInput, arabicToEnglishNumber, 
  fetchClassNames, cleanPhoneNumber 
} from '../../utils/helpers';
import { 
  sendNotificationToStudents, sendNotificationToAllStudents, 
  sendNotificationToTeacher 
} from '../../utils/notifications';
import {
  sendWarningMessage, sendSupervisorWarningMessage,
  sendActivationMessage, sendFreezeMessage, sendDeleteMessage,
  sendResetPasswordMessage, sendDataUpdateApprovalMessage,
  sendDataUpdateRejectionMessage, sendUrgentReminderMessage,
  sendContactTeacherMessage
} from '../../utils/whatsapp';
import { createSupervisorAccount } from '../../services/supervisor';
import { 
  getZoomMeetings, deleteZoomMeeting, createRealZoomMeeting 
} from '../../services/meeting';
import { MAX_SUPERVISORS, ANNOUNCEMENTS_LIMIT, TEACHER_PHONE } from '../../constants';

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

  const [supervisors, setSupervisors] = useState([]);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [newSupervisorGender, setNewSupervisorGender] = useState('');
  const [newSupervisorAge, setNewSupervisorAge] = useState('');
  const [newSupervisorPhone, setNewSupervisorPhone] = useState('');
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

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
  const [selectedClassForLesson, setSelectedClassForLesson] = useState('');
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedStudentForWarning, setSelectedStudentForWarning] = useState(null);
  const [warningDescription, setWarningDescription] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewStudent, setSelectedReviewStudent] = useState(null);

  const [showSupervisorWarningModal, setShowSupervisorWarningModal] = useState(false);
  const [selectedSupervisorForWarning, setSelectedSupervisorForWarning] = useState(null);
  const [supervisorWarningDescription, setSupervisorWarningDescription] = useState('');

  // Zoom states
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [showOpenMeetingChoice, setShowOpenMeetingChoice] = useState(false);
  const [pendingMeeting, setPendingMeeting] = useState(null);
  const [teacherZoomMeetings, setTeacherZoomMeetings] = useState([]);

  // Functions for Zoom
  const fetchTeacherMeetings = async () => {
    try {
      const meetings = await getZoomMeetings(null, user.id);
      const now = new Date();
      const activeMeetings = meetings.filter(m => {
        const start = new Date(m.start_time);
        const diffMinutes = (now - start) / (1000 * 60);
        return diffMinutes < 60 && diffMinutes > -10;
      });
      setTeacherZoomMeetings(activeMeetings);
    } catch (err) {
      console.error('فشل جلب حصص المعلم:', err);
    }
  };

  const handleCreateMeeting = async (topic, startTime, classId) => {
    try {
      toast.loading('جاري إنشاء الغرفة...', { id: 'zoom-create' });
      
      const result = await createRealZoomMeeting(topic, startTime, 60, classId, user.id);
      
      toast.dismiss('zoom-create');
      
      if (result && result.join_url) {
        setPendingMeeting({
          id: result.id,
          join_url: result.join_url,
          topic: topic,
          meeting_number: result.meeting_number,
          password: result.password || '',
        });
        setShowOpenMeetingChoice(true);
        await fetchTeacherMeetings();
        toast.success('✅ تم إنشاء الغرفة بنجاح!');
      } else {
        toast.error('❌ لم يتم استلام رابط الاجتماع. حاول مرة أخرى.');
      }
    } catch (err) {
      toast.dismiss('zoom-create');
      console.error('❌ فشل إنشاء الغرفة:', err);
      toast.error('❌ فشل إنشاء الغرفة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const handleOpenMeetingChoice = (choice) => {
    if (!pendingMeeting) return;
    const rawNumber = pendingMeeting.meeting_number || pendingMeeting.id || pendingMeeting.meetingNumber;
    const cleanMeetingNumber = String(rawNumber || '').replace(/\D/g, '');

    if (choice === 'iframe') {
      setActiveMeeting({
        id: pendingMeeting.id || pendingMeeting._id,
        meeting_number: cleanMeetingNumber,
        password: pendingMeeting.password || '',
        signature: '',
        topic: pendingMeeting.topic || 'حصة زوم المباشرة',
        join_url: pendingMeeting.join_url
      });
      setIsZoomOpen(true);
    } else if (choice === 'zoomapp') {
      if (pendingMeeting.join_url) {
        window.open(pendingMeeting.join_url, '_blank');
        toast.info('تم فتح الحصة في تطبيق زوم.');
      } else {
        toast.error('رابط الانضمام غير متوفر.');
      }
    }
    setShowOpenMeetingChoice(false);
    setPendingMeeting(null);
  };

  const handleEndMeeting = async (meetingId) => {
    const targetId = meetingId || activeMeeting?.id;
    if (!targetId) return;
    const ok = await confirm('إنهاء الحصة', 'هل أنت متأكد من إنهاء هذه الحصة؟ سيتم حذفها من النظام ولن يتمكن الطلاب من الانضمام إليها.');
    if (!ok) return;
    try {
      const deleted = await deleteZoomMeeting(targetId);
      if (deleted) {
        toast.success('✅ تم إنهاء الحصة وحذفها بنجاح.');
        setIsZoomOpen(false);
        setActiveMeeting(null);
        await fetchTeacherMeetings();
      } else {
        toast.error('فشل حذف الحصة من السيرفر.');
      }
    } catch (err) {
      toast.error('فشل إنهاء الحصة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  // ✅ الدالة المعدلة – استخدام VAPID_KEY من متغيرات البيئة
  const requestNotificationPermission = async () => {
    if (!auth.currentUser) {
      toast.error('يرجى تسجيل الدخول أولاً.');
      return;
    }

    // ✅ جلب مفتاح VAPID من متغيرات البيئة (آمن)
    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) {
      toast.error('مفتاح VAPID غير مضبوط في البيئة. يرجى إضافته في Vercel.');
      return;
    }

    if (Notification.permission === 'granted') {
      try {
        const token = await getToken(messaging, { vapidKey });
        if (token) {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
          toast.success('تم تفعيل الإشعارات');
        }
      } catch (err) {
        console.error('FCM token error:', err);
        toast.error('فشل جلب توكن الإشعارات: ' + err.message);
      }
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error('تم رفض الإذن، يرجى تفعيله من إعدادات المتصفح');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        const token = await getToken(messaging, { vapidKey });
        if (token) {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
          toast.success('تم تفعيل الإشعارات بنجاح');
        }
      } catch (err) {
        toast.error('فشل تفعيل الإشعارات: ' + err.message);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onMessage(messaging, (payload) => {
      toast.custom((t) => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsubscribe();
  }, []);

  // باقي الكود كما هو (جميع الدوال الأخرى لم تتغير)
  // ... (سأضع باقي الدوال بنفس الشكل السابق لكن باختصار لتوفير المساحة، أو يمكنك الاحتفاظ بنسختك السابقة)

  // ============================================================
  // باقي الدوال (نفس الكود السابق)
  // ============================================================

  // Supervisor handlers
  const handleAddSupervisor = async (e) => {
    e.preventDefault();
    const name = sanitizeInput(newSupervisorName);
    const gender = sanitizeInput(newSupervisorGender);
    const age = sanitizeInput(arabicToEnglishNumber(newSupervisorAge));
    const phone = sanitizeInput(arabicToEnglishNumber(newSupervisorPhone));
    if (!name || !gender || !age || !phone) {
      toast.error('جميع الحقول مطلوبة.');
      return;
    }
    setSupervisorLoading(true);
    try {
      const result = await createSupervisorAccount(name, gender, age, phone, user.id);
      toast.success(`تم إضافة المشرف ${result.name} (اسم المستخدم: ${result.username})`);
      setNewSupervisorName('');
      setNewSupervisorGender('');
      setNewSupervisorAge('');
      setNewSupervisorPhone('');
      setShowSupervisorModal(false);
    } catch (err) {
      toast.error('فشل إضافة المشرف: ' + err.message);
    } finally {
      setSupervisorLoading(false);
    }
  };

  const handleDeleteSupervisor = async (supervisorId) => {
    const ok = await confirm('حذف المشرف', 'هل أنت متأكد من حذف هذا المشرف نهائياً؟ سيتم حذف الملف الشخصي فقط، ويجب حذف حساب المصادقة يدوياً من Firebase Console.');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'profiles', supervisorId));
      toast.success('تم حذف المشرف.');
    } catch (err) {
      toast.error('فشل حذف المشرف: ' + err.message);
    }
  };

  const toggleFreezeSupervisor = async (supervisor) => {
    const nextStatus = !supervisor.isFrozen;
    if (nextStatus) {
      const ok = await confirm('تجميد الحساب', 'تنبيه هام:\nإذا قمت بتجميد هذا الحساب، سيبقى مجمداً حتى تقوم بفك التجميد يدوياً.\nهل تريد المتابعة؟');
      if (!ok) return;
    }
    try {
      await updateDoc(doc(db, 'profiles', supervisor.id), {
        isFrozen: nextStatus,
        frozenAt: nextStatus ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      setSupervisors(prev =>
        prev.map(s => s.id === supervisor.id ? { ...s, isFrozen: nextStatus } : s)
      );
      toast.success(nextStatus ? 'تم تجميد حساب المشرف.' : 'تم فك تجميد حساب المشرف.');
    } catch (err) {
      console.error('Error toggling freeze supervisor:', err);
      toast.error('فشل تحديث حالة التجميد: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const handleResetSupervisor = async (supervisorId) => {
    const ok = await confirm('إعادة تعيين الحساب', 'سيتم إعادة تعيين هذا الحساب ليصبح كأنه جديد، وسيُطلب من المشرف تغيير كلمة المرور عند تسجيل الدخول. هل تريد المتابعة؟');
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'profiles', supervisorId), {
        infoVerified: false,
        isFrozen: false,
        isProfileComplete: false,
        pendingChanges: null,
        reviewResult: null,
        reviewExpiry: null,
        updatedAt: serverTimestamp()
      });
      toast.success('تم إعادة تعيين حساب المشرف.');
    } catch (err) {
      toast.error('فشل إعادة التعيين: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const openSupervisorWarningModal = (supervisor) => {
    setSelectedSupervisorForWarning(supervisor);
    setSupervisorWarningDescription('');
    setShowSupervisorWarningModal(true);
  };

  const confirmSupervisorWarning = async () => {
    if (!selectedSupervisorForWarning) return;
    const desc = sanitizeInput(supervisorWarningDescription);
    if (!desc.trim()) {
      toast.error('يرجى كتابة وصف المخالفة.');
      return;
    }
    const supervisor = selectedSupervisorForWarning;
    const currentWarnings = supervisor.warnings || [];
    const newWarningNumber = currentWarnings.length + 1;
    if (newWarningNumber > 3) {
      toast.error('تم تجاوز عدد الإنذارات المسموح به.');
      return;
    }
    sendSupervisorWarningMessage(supervisor, newWarningNumber, desc.trim());
    const warningObj = {
      id: generateId(),
      issuedAt: new Date().toISOString(),
      type: newWarningNumber,
      description: desc.trim()
    };
    try {
      const supervisorRef = doc(db, 'profiles', supervisor.id);
      await updateDoc(supervisorRef, {
        warnings: arrayUnion(warningObj),
        updatedAt: serverTimestamp()
      });
      setSupervisors(prev =>
        prev.map(s => {
          if (s.id === supervisor.id) {
            const updatedWarnings = [...(s.warnings || []), warningObj];
            return { ...s, warnings: updatedWarnings };
          }
          return s;
        })
      );
      if (newWarningNumber === 3) {
        await updateDoc(supervisorRef, {
          isFrozen: true,
          frozenAt: serverTimestamp(),
          freezeReason: 'تجاوز عدد الإنذارات (3 إنذارات)'
        });
        setSupervisors(prev =>
          prev.map(s => s.id === supervisor.id ? { ...s, isFrozen: true } : s)
        );
        toast.error('⚠️ تم تجميد حساب المشرف تلقائياً لأن عدد الإنذارات بلغ 3.');
      } else {
        toast.success(`✅ تم إرسال الإنذار رقم ${newWarningNumber} بنجاح.`);
      }
      setShowSupervisorWarningModal(false);
      setSelectedSupervisorForWarning(null);
      setSupervisorWarningDescription('');
    } catch (err) {
      console.error('Error issuing supervisor warning:', err);
      toast.error('فشل إصدار الإنذار: ' + err.message);
    }
  };

  // Class management
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

  // Add student
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
      const tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      const email = `${newUsername}@readandrise.com`;
      const newId = generateId();
      const cleanPhone = sanitizedPhone.replace(/[^0-9]/g, '');
      const ageNum = parseInt(sanitizedAge);
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
        toast.error('العمر يجب أن يكون رقماً بين 1 و 99.');
        setStudentLoading(false);
        return;
      }
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      } catch (authError) {
        console.error('Auth creation error for student (secondary):', authError);
        if (authError.code === 'auth/email-already-in-use') {
          toast.error('البريد الإلكتروني مستخدم بالفعل. حاول مرة أخرى.');
        } else {
          toast.error('فشل إنشاء حساب المصادقة: ' + authError.message);
        }
        setStudentLoading(false);
        return;
      }
      const firebaseUser = userCredential.user;
      await signOut(secondaryAuth);
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
        updatedAt: serverTimestamp(),
        uid: firebaseUser.uid
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
    const ok = await confirm('حذف دائم', '⚠️ إجراء خطير: سيتم حذف الملف الشخصي للطالب نهائياً.\n\nتنبيه هام: حساب المصادقة (Authentication) لن يُحذف تلقائياً.\nيجب عليك حذفه يدوياً من Firebase Console لتحرير اسم المستخدم.\n\nهل أنت متأكد من المتابعة؟');
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
        toast('لم يتم إرسال رسالة واتساب لأن رقم الهاتف غير مسجل.', {
          duration: 4000,
          style: { background: '#333', color: '#fff' }
        });
      }
      toast.success('✅ تم حذف الملف الشخصي للطالب وإرسال رسالة إشعار لولي الأمر.');
      toast.warn('🔴 تذكر حذف حساب المصادقة من Firebase Console يدوياً.');
    } catch (err) {
      toast.error('فشل حذف الطالب: ' + err.message);
    }
  };

  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.isFrozen;
    if (nextStatus) {
      const ok = await confirm('تجميد الحساب', 'تنبيه هام:\nإذا قمت بتجميد هذا الحساب، سيبقى مجمداً حتى تقوم بفك التجميد يدوياً.\nهل تريد المتابعة؟');
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

  const handleResetStudent = async (studentId) => {
    const ok = await confirm('إعادة تعيين الحساب', 'سيتم إعادة تعيين هذا الحساب ليصبح كأنه جديد.\nسيتم توليد كلمة مرور جديدة وإرسالها للطالب عبر واتساب.\nملاحظة: يجب على المعلم تحديث كلمة المرور في Firebase Console يدوياً إلى نفس القيمة.\nهل تريد المتابعة؟');
    if (!ok) return;
    try {
      const docSnap = await getDoc(doc(db, 'profiles', studentId));
      if (!docSnap.exists()) {
        toast.error('الطالب غير موجود.');
        return;
      }
      const student = docSnap.data();
      const newPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      await updateDoc(doc(db, 'profiles', studentId), {
        infoVerified: false,
        isFrozen: false,
        isProfileComplete: false,
        pendingChanges: null,
        reviewResult: null,
        reviewExpiry: null,
        tempPassword: newPassword,
        updatedAt: serverTimestamp()
      });
      const studentObj = {
        ...student,
        username: student.username,
        name: student.name,
        phone: student.phone,
        classes: student.classIds ? await fetchClassNames(student.classIds) : {}
      };
      sendResetPasswordMessage(studentObj, newPassword);
      await sendNotificationToTeacher(
        user.id,
        '🔄 إعادة تعيين حساب',
        `تم إعادة تعيين حساب الطالب ${student.name || ''} (${studentId})`,
        'reset_student',
        studentId
      );
      toast.success('✅ تم إعادة تعيين الحساب وإرسال كلمة المرور الجديدة للطالب.');
      toast.warn('🔴 تذكر تحديث كلمة المرور في Firebase Console إلى: ' + newPassword);
    } catch (err) {
      console.error('Error resetting student:', err);
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
        infoVerified: true,
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
      toast.error('فشل رفض المراجعة: ' + err.message);
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

  // Fetch data with onSnapshot
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

      const supervisorQuery = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
      const supervisorSnapshot = await getDocs(supervisorQuery);
      const supervisorsList = supervisorSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSupervisors(supervisorsList);

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

    const supervisorQuery = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
    const unsubscribeSupervisors = onSnapshot(supervisorQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSupervisors(list);
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
        unsubscribeSupervisors();
        unsubscribeNotif();
      };
    }

    return () => {
      unsubscribeTeacher();
      unsubscribeStudents();
      unsubscribeClasses();
      unsubscribePending();
      unsubscribeSupervisors();
    };
  }, [user.id]);

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

  // ============================================================
  // قسم التصيير (Render) – نفسه كما في النسخة السابقة
  // ============================================================
  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username || user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                await requestNotificationPermission();
                setShowNotificationsModal(true);
              }}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title="الإشعارات"
            >
              <FaBell />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        {/* باقي الأقسام كاملة كما في النسخة السابقة – لم تتغير */}
        {/* Pending reviews */}
        {pendingReviews.length > 0 && (
          <div className="bg-yellow-900/30 p-6 rounded-2xl border border-yellow-500/40 shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold text-yellow-300 flex items-center gap-2">
                <FaClipboardList className="inline-block" />
                طلبات تعديل البيانات ({pendingReviews.length})
              </h3>
              <span className="text-xs text-yellow-400 bg-yellow-950/40 px-3 py-1 rounded-full border border-yellow-500/30">
                في انتظار المراجعة
              </span>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {pendingReviews.map(student => {
                const changes = student.pendingChanges || {};
                const changeFields = Object.keys(changes).filter(k => k !== 'updated_at' && k !== 'sentAccelerate');
                return (
                  <div key={student.id} className="bg-black/30 p-4 rounded-xl border border-yellow-500/20 hover:border-yellow-500/50 transition flex flex-wrap justify-between items-center gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-white font-medium">{student.name || student.username}</span>
                        <span className="text-xs text-gray-400">({student.username})</span>
                        <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">
                          {student.classes?.map(c => c.name).join(', ') || 'لا توجد شعبة'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-300 mt-1 space-y-0.5">
                        <span className="text-yellow-400">التغييرات المطلوبة:</span>
                        {changeFields.map(field => {
                          const oldVal = student[field] ?? '(فارغ)';
                          const newVal = changes[field] ?? '(فارغ)';
                          const labels = {
                            name: 'الاسم',
                            gender: 'الجنس',
                            age: 'العمر',
                            phone: 'رقم الهاتف'
                          };
                          return (
                            <div key={field} className="mr-2 text-xs">
                              <span className="text-gray-400">{labels[field] || field}:</span>
                              <span className="text-red-400 line-through mx-1">{oldVal}</span>
                              <span className="text-gray-400">→</span>
                              <span className="text-green-300 mx-1">{newVal}</span>
                            </div>
                          );
                        })}
                        {changes.updated_at && (
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            طُلب في: {new Date(changes.updated_at).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openReviewModal(student)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition"
                      >
                        <FaEye className="inline-block me-1" /> مراجعة
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Stats and next lesson */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-purple-200">
              <FaUsers className="inline-block me-2" /> عدد الطلاب
            </h3>
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
            {nextLesson ? (
              <button
                onClick={() => {
                  const topic = `حصة شعبة ${classes.find(c => c.id === selectedClassForLesson)?.name || selectedClassForLesson}`;
                  const startTime = nextLesson.date || new Date().toISOString();
                  handleCreateMeeting(topic, startTime, selectedClassForLesson);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg w-full mt-2"
              >
                <FaVideo className="inline-block me-2" /> إنشاء غرفة للحصة القادمة
              </button>
            ) : (
              <div className="text-yellow-400 text-sm bg-yellow-900/20 p-3 rounded-xl border border-yellow-500/30 w-full text-center mt-2">
                ⚠️ لا توجد حصة قادمة حالياً
              </div>
            )}
            <button
              onClick={() => {
                const classId = selectedClassForLesson || classes[0]?.id || '';
                if (!classId) {
                  toast.error('يرجى اختيار شعبة أولاً');
                  return;
                }
                const className = classes.find(c => c.id === classId)?.name || 'غير محدد';
                const topic = `غرفة فورية - شعبة ${className}`;
                const now = new Date().toISOString();
                handleCreateMeeting(topic, now, classId);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg w-full mt-2"
            >
              <FaVideo className="inline-block me-2" /> إنشاء غرفة صفية فورية
            </button>
          </div>
        </div>

        {/* Homeworks management */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-pink-300">
              <FaPen className="inline-block me-2" /> إدارة الواجبات
            </h3>
            <button onClick={() => setShowAssignmentChoice(true)} type="button" className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-2 px-4 text-sm rounded-md text-white">
              <FaPen className="inline-block me-2" /> إضافة واجب جديد
            </button>
          </div>
          {homeworks.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {homeworks.map(hw => (
                <div key={hw.id} className="p-3 rounded-xl border border-gray-700 bg-black/30 flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="text-gray-100 text-sm">{hw.text}</p>
                    {hw.is_draft && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full mr-2">💾 مسودة</span>}
                    {hw.section && <span className="text-xs text-blue-300 mr-2">(شعبة {classes.find(c => c.id === hw.section)?.name || hw.section})</span>}
                    <div className="flex flex-wrap gap-2 mt-1">
                      {!hw.is_draft && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${new Date(hw.reveal_time).getTime() <= new Date().getTime() ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                          {new Date(hw.reveal_time).getTime() <= new Date().getTime() ? '🟢 متاح' : '📅 مجدول'}
                        </span>
                      )}
                      {hw.is_draft && <span className="text-xs text-yellow-400">⏳ لم ينشر بعد</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteHomework(hw.id)} type="button" className="p-1.5 bg-red-600/30 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-600/50 text-xs">
                    <FaTrashAlt className="inline-block me-1" /> حذف
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">لا توجد واجبات مضافة بعد.</p>
          )}
        </div>

        {/* Students management */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-xl font-semibold text-blue-300">
              <FaUser className="inline-block me-2" /> إدارة الطلاب
            </h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddStudentModal(true)} type="button" className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-2 px-4 text-sm rounded-md text-white">
                <FaPlus className="inline-block me-2" /> إضافة طالب
              </button>
              <button onClick={() => setShowStudentsModal(true)} type="button" className="btn-primary bg-purple-600 hover:bg-purple-700 py-2 px-4 text-sm rounded-md text-white">
                <FaClipboardList className="inline-block me-2" /> عرض قوائم الطلبة
              </button>
              <button onClick={() => setShowManageClassesModal(true)} type="button" className="btn-primary bg-green-600 hover:bg-green-700 py-2 px-4 text-sm rounded-md text-white">
                <FaSchool className="inline-block me-2" /> إدارة الشعب
              </button>
            </div>
          </div>
        </div>

        {/* Schedule lessons */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">
            <FaClock className="inline-block me-2" /> جدولة مواعيد الحصص
          </h3>
          <button onClick={() => setShowLessonChoice(true)} type="button" className="btn-primary bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 py-3 px-6 w-full sm:w-auto rounded-md text-white">
            <FaClock className="inline-block me-2" /> إدارة المواعيد (حتى 6)
          </button>
        </div>

        {/* Active meetings */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-cyan-500/30">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-xl font-semibold text-cyan-300">
              <FaVideo className="inline-block me-2" /> الحصص النشطة ({teacherZoomMeetings.length})
            </h3>
            <button
              onClick={fetchTeacherMeetings}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-md"
            >
              <FaSpinner className="inline-block me-1" /> تحديث
            </button>
          </div>
          {teacherZoomMeetings.length === 0 ? (
            <p className="text-gray-400 text-center py-2">لا توجد حصص نشطة حالياً.</p>
          ) : (
            <div className="space-y-2 mt-2 max-h-40 overflow-y-auto">
              {teacherZoomMeetings.map(meeting => (
                <div key={meeting.id} className="flex justify-between items-center p-2 bg-black/30 rounded-xl border border-cyan-500/20">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white text-sm">{meeting.topic || 'حصة'}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(meeting.start_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                    </span>
                    <span className="text-xs text-cyan-300">رقم الاجتماع: {meeting.meeting_number}</span>
                  </div>
                  <button
                    onClick={() => handleEndMeeting(meeting.id)}
                    className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1 rounded-lg hover:bg-red-500/30 transition"
                  >
                    <FaTrashAlt className="inline-block me-1" /> إنهاء الحصة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Supervisors section */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-indigo-500/30 mt-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-xl font-semibold text-indigo-300">
              <FaEye className="inline-block me-2" /> المشرفين ({supervisors.length}/{MAX_SUPERVISORS})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSupervisorModal(true)}
                disabled={supervisors.length >= MAX_SUPERVISORS}
                className={`btn-primary ${supervisors.length >= MAX_SUPERVISORS ? 'bg-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-4 py-2 rounded-md text-sm`}
              >
                <FaPlus className="inline-block me-2" /> إضافة مشرف
              </button>
            </div>
          </div>
          {supervisors.length > 0 ? (
            <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
              {supervisors.map(obs => {
                const warningCount = (obs.warnings || []).length;
                return (
                  <div key={obs.id} className="flex flex-wrap justify-between items-center gap-2 p-2 bg-black/30 rounded-xl border border-gray-700">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white text-sm font-medium">{obs.name}</span>
                      <span className="text-xs text-gray-400">({obs.username})</span>
                      {obs.phone && <span className="text-xs text-gray-400">📱 {obs.phone}</span>}
                      {obs.isFrozen && <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">⏳ مجمد</span>}
                      <span className="text-xs text-yellow-300 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">
                        <FaExclamationTriangle className="inline-block me-1" /> الإنذارات: {warningCount}/3
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {warningCount < 3 ? (
                        <button
                          onClick={() => openSupervisorWarningModal(obs)}
                          className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30"
                        >
                          <FaExclamationTriangle className="inline-block me-1" /> إنذار
                        </button>
                      ) : (
                        <span className="text-xs text-red-400 bg-red-950/40 px-2 py-1 rounded border border-red-500/30">⚠️ إنذارات مكتملة</span>
                      )}
                      <button onClick={() => handleResetSupervisor(obs.id)} type="button" className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg hover:bg-indigo-500/30">
                        <FaEdit className="inline-block me-1" /> إعادة تعيين
                      </button>
                      <button onClick={() => handleDeleteSupervisor(obs.id)} type="button" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">
                        <FaTrashAlt className="inline-block me-1" /> حذف
                      </button>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">{obs.isFrozen ? 'مجمد' : 'مفعل'}</span>
                        <div onClick={() => toggleFreezeSupervisor(obs)} className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${obs.isFrozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                          <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${obs.isFrozen ? 'translate-x-0' : 'translate-x-5'}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">لا يوجد مشرفين مسجلين.</p>
          )}
        </div>

        {/* Zoom Meeting Modal - مع userRole={1} للمعلم (مضيف) */}
        <ZoomMeetingModal
          isOpen={isZoomOpen}
          onClose={() => {
            setIsZoomOpen(false);
            setActiveMeeting(null);
          }}
          meetingDetails={activeMeeting}
          userName={user.name || user.username || "معلم"}
          userEmail={user.email || `${user.username}@readandrise.com`}
          userRole={1}
        />

      </div>

      {/* Choice modal for opening meeting */}
      <ChoiceModal
        isOpen={showOpenMeetingChoice}
        onClose={() => {
          setShowOpenMeetingChoice(false);
          setPendingMeeting(null);
        }}
        onSelect={handleOpenMeetingChoice}
        title="اختر طريقة فتح الحصة"
        options={[
          { value: 'iframe', label: <><FaWindowRestore className="inline-block me-2" /> فتح داخل المنصة (مضمن)</> },
          { value: 'zoomapp', label: <><FaMobileAlt className="inline-block me-2" /> فتح في تطبيق زوم</> }
        ]}
      />

      {/* باقي المودالات كما هي - لم تتغير */}
      {/* Supervisors add modal */}
      {showSupervisorModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSupervisorModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-indigo-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-indigo-300 mb-4">
              <FaEye className="inline-block me-2" /> إضافة مشرف جديد
            </h3>
            <form onSubmit={handleAddSupervisor} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorName} onChange={e => setNewSupervisorName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">الجنس <span className="text-red-400">*</span></label>
                <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorGender} onChange={e => setNewSupervisorGender(e.target.value)} required>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block">العمر <span className="text-red-400">*</span></label>
                <input type="text" inputMode="numeric" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorAge} onChange={e => setNewSupervisorAge(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" inputMode="numeric" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorPhone} onChange={e => setNewSupervisorPhone(e.target.value)} required />
              </div>
              <button type="submit" disabled={supervisorLoading} className="btn-primary w-full py-3 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white">
                {supervisorLoading ? 'جاري الإضافة...' : 'إضافة المشرف'}
              </button>
              <button type="button" onClick={() => setShowSupervisorModal(false)} className="text-sm text-gray-400 hover:text-white w-full mt-2">إلغاء</button>
            </form>
          </div>
        </div>
      )}

      {/* Supervisor warning modal */}
      {showSupervisorWarningModal && selectedSupervisorForWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSupervisorWarningModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">
              <FaExclamationTriangle className="inline-block me-2" /> إصدار إنذار للمشرف
            </h3>
            <p className="text-gray-300 text-sm mb-2">
              المشرف: <strong>{selectedSupervisorForWarning.name}</strong>
              <br />
              الإنذار الحالي: رقم { (selectedSupervisorForWarning.warnings || []).length + 1 } من 3
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block mb-1">وصف المخالفة</label>
                <textarea
                  className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white resize-none"
                  placeholder="اكتب وصف المخالفة..."
                  value={supervisorWarningDescription}
                  onChange={(e) => setSupervisorWarningDescription(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmSupervisorWarning}
                  className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white"
                >
                  إرسال الإنذار
                </button>
                <button
                  onClick={() => setShowSupervisorWarningModal(false)}
                  className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications modal */}
      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNotificationsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300">
                <FaBell className="inline-block me-2" /> الإشعارات
              </h3>
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

      {/* Choice modals for assignment and lesson */}
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
          { value: 'now', label: <><FaUpload className="inline-block me-2" /> نشر فوراً</> },
          { value: 'schedule', label: <><FaCalendarAlt className="inline-block me-2" /> جدولة (تاريخ ووقت)</> },
          { value: 'draft', label: <><FaSave className="inline-block me-2" /> حفظ كمسودة (نشر لاحقاً)</> },
          { value: 'delay', label: <><FaClock className="inline-block me-2" /> نشر بعد وقت (ساعات/دقائق)</> }
        ]}
      />

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
          { value: 'manage', label: <><FaClock className="inline-block me-2" /> إضافة / تعديل المواعيد (حتى 6)</> }
        ]}
      />

      {/* Manage Classes Modal */}
      {showManageClassesModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowManageClassesModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">
              <FaSchool className="inline-block me-2" /> إدارة الشعب
            </h3>
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
                          <button onClick={() => { setEditingClassId(cls.id); setEditingClassName(cls.name); }} className="text-blue-400 hover:text-blue-300 text-sm">
                            <FaEdit className="inline-block" />
                          </button>
                          <button onClick={() => handleDeleteClass(cls.id)} className="text-red-400 hover:text-red-300 text-sm">
                            <FaTrashAlt className="inline-block" />
                          </button>
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

      {/* Students List Modal */}
      {showStudentsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowStudentsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-4xl w-full max-h-[80vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-300">
                <FaClipboardList className="inline-block me-2" /> قائمة الطلاب المسجلين ({students.length})
              </h3>
              <button onClick={() => setShowStudentsModal(false)} type="button" className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {students.map(s => {
                const hasAccount = s.email && !s.email.endsWith('@temp.com');
                const inactiveDays = s.last_seen ? Math.floor((new Date() - new Date(s.last_seen)) / (1000 * 60 * 60 * 24)) : 0;
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
                        <FaExclamationTriangle className="inline-block me-1" /> الإنذارات: {warningCount}/3
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {warningCount < 3 ? (
                        <button
                          onClick={() => openWarningModal(s)}
                          className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30"
                        >
                          <FaExclamationTriangle className="inline-block me-1" /> إنذار ({warningCount}/3)
                        </button>
                      ) : (
                        <span className="text-xs text-red-400 bg-red-950/40 px-2 py-1 rounded border border-red-500/30">
                          <FaBan className="inline-block me-1" /> إنذارات مكتملة
                        </span>
                      )}
                      {warningCount >= 3 && (
                        <button
                          onClick={() => handleDeleteStudentPermanently(s.id)}
                          className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30 animate-pulse"
                        >
                          <FaTrash className="inline-block me-1" /> حذف الحساب (إجباري)
                        </button>
                      )}
                      <button
                        onClick={() => openClassSelection(s)}
                        className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/30"
                      >
                        <FaThumbtack className="inline-block me-1" /> تحديد الشعبة
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
                        <FaComment className="inline-block me-1" /> رسالة
                      </button>
                      {s.isFrozen && (
                        <button onClick={() => sendFreezeMessage(s)} type="button" className="text-xs bg-orange-500/20 text-orange-300 border border-orange-500/30 px-2 py-1 rounded-lg hover:bg-orange-500/30">
                          <FaBan className="inline-block me-1" /> تجميد
                        </button>
                      )}
                      <button onClick={() => handleResetStudent(s.id)} type="button" className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg hover:bg-indigo-500/30">
                        <FaEdit className="inline-block me-1" /> إعادة تعيين
                      </button>
                      <button onClick={() => handleDeleteStudentPermanently(s.id)} type="button" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">
                        <FaTrashAlt className="inline-block me-1" /> حذف
                      </button>
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

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">
              <FaPlus className="inline-block me-2" /> إضافة طالب جديد
            </h3>
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

      {/* General message modal */}
      {showGeneralMessageModal && selectedStudentForMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGeneralMessageModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">
              <FaComment className="inline-block me-2" /> إرسال رسالة إلى {selectedStudentForMessage.name}
            </h3>
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

      {/* Add notification modal for new student */}
      {showAddNotificationModal && newlyAddedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-green-500/30">
            <h3 className="text-xl font-semibold text-green-300 mb-2 text-center">
              <FaCheckCircle className="inline-block me-2" /> تم تسجيل الطالب
            </h3>
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
                <FaComment className="inline-block me-2" /> إخبار ولي الأمر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Freeze notification modal */}
      {showFreezeNotificationModal && frozenStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-orange-500/30">
            <h3 className="text-xl font-semibold text-orange-300 mb-2 text-center">
              <FaBan className="inline-block me-2" /> تم تجميد الحساب
            </h3>
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
                <FaComment className="inline-block me-2" /> إخبار ولي الأمر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class selection modal */}
      {showClassSelectionModal && selectedStudentForClass && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowClassSelectionModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">
              <FaThumbtack className="inline-block me-2" /> تحديد شعبة الطالب
            </h3>
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

      {/* Add Assignment Modal */}
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

      {/* Add Lesson Modal */}
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

      {/* Warning Modal */}
      {showWarningModal && selectedStudentForWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWarningModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">
              <FaExclamationTriangle className="inline-block me-2" /> إصدار إنذار للطالب
            </h3>
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

      {/* Review Modal */}
      {showReviewModal && selectedReviewStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowReviewModal(false); setSelectedReviewStudent(null); }}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">
              <FaClipboardList className="inline-block me-2" /> مراجعة طلب تعديل البيانات
            </h3>
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
              <button onClick={() => acceptReview(selectedReviewStudent.id)} className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white">
                <FaCheckCircle className="inline-block me-2" /> قبول
              </button>
              <button onClick={() => rejectReview(selectedReviewStudent.id)} className="btn-primary bg-red-600 hover:bg-red-700 px-6 py-2 rounded-md text-white">
                <FaTimesCircle className="inline-block me-2" /> رفض
              </button>
              <button onClick={() => { setShowReviewModal(false); setSelectedReviewStudent(null); }} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TeacherPanel;