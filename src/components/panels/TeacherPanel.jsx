import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaPen, FaCalendarAlt, FaSave, FaClock, FaUpload, FaClipboardList,
  FaSchool, FaUser, FaBell, FaSignOutAlt, FaExclamationTriangle,
  FaCheckCircle, FaTimesCircle, FaBullhorn, FaTrashAlt, FaEdit,
  FaThumbtack, FaComment, FaEnvelope, FaHourglassHalf, FaPlus, FaBan,
  FaWhatsapp, FaUsers, FaTrash, FaUnlockAlt, FaEye, FaEyeSlash,
  FaSpinner, FaVideo, FaWindowRestore, FaMobileAlt, FaPrint
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

import { useConfirm } from '../common/ConfirmContext';
import { CountdownTimer } from '../common/CountdownTimer';
import { ChoiceModal } from '../common/ChoiceModal';
import { AddAssignmentModal } from '../common/AddAssignmentModal';
import { AddLessonModal } from '../common/AddLessonModal';
import PrintStudentsModal from '../common/PrintStudentsModal';
import ReportModal from '../common/ReportModal';
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

  // New States for Print & Report
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedStudentForReport, setSelectedStudentForReport] = useState(null);

  const [showSupervisorWarningModal, setShowSupervisorWarningModal] = useState(false);
  const [selectedSupervisorForWarning, setSelectedSupervisorForWarning] = useState(null);
  const [supervisorWarningDescription, setSupervisorWarningDescription] = useState('');

  const requestNotificationPermission = async () => {
    if (!auth.currentUser) {
      toast.error('يرجى تسجيل الدخول أولاً.');
      return;
    }

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

  // Handlers
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
    const ok = await confirm('حذف المشرف', 'هل أنت متأكد من حذف هذا المشرف نهائياً؟');
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
      const ok = await confirm('تجميد الحساب', 'تنبيه هام: سيبقى مجمداً حتى تقوم بفك التجميد يدوياً. هل تريد المتابعة؟');
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
      toast.error('فشل تحديث حالة التجميد: ' + err.message);
    }
  };

  const handleResetSupervisor = async (supervisorId) => {
    const ok = await confirm('إعادة تعيين الحساب', 'سيتم إعادة تعيين هذا الحساب ليصبح كأنه جديد. هل تريد المتابعة؟');
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
      toast.error('فشل إعادة التعيين: ' + err.message);
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
          toast.error('إحدى الشعب المختارة غير صالحة.');
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
      
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      } catch (authError) {
        toast.error('فشل إنشاء حساب المصادقة: ' + authError.message);
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
        studentData = { ...data, classes: classNames.map(name => ({ name })) };
      }
    } catch (err) {}
    const ok = await confirm('حذف دائم', '⚠️ إجراء خطير: سيتم حذف الملف الشخصي للطالب نهائياً. هل أنت متأكد؟');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'profiles', studentId));
      await sendNotificationToTeacher(user.id, '🗑️ حذف طالب', `تم حذف الملف الشخصي للطالب (${studentId})`, 'delete_student', studentId);
      if (studentData && studentData.classIds && studentData.classIds.length > 0) {
        await sendNotificationToStudents(studentData.classIds, '📢 إشعار', 'تم طرد طالب من شعبتك', 'delete_student_notification', studentId);
      }
      if (studentData && studentData.phone) {
        sendDeleteMessage(studentData);
      }
      toast.success('✅ تم حذف الملف الشخصي للطالب.');
    } catch (err) {
      toast.error('فشل حذف الطالب: ' + err.message);
    }
  };

  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.isFrozen;
    if (nextStatus) {
      const ok = await confirm('تجميد الحساب', 'هل تريد المتابعة؟');
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
      toast.error('فشل تحديث حالة التجميد: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const updateStudentClasses = async (studentId, newClassIds) => {
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        classIds: newClassIds,
        updatedAt: serverTimestamp()
      });
      await sendNotificationToTeacher(user.id, '📌 تحديث الشعبة', `تم تحديث شعبة الطالب (${studentId})`, 'update_class', studentId);
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
        await sendNotificationToTeacher(user.id, '🚫 تجميد تلقائي للحساب', `تم تجميد حساب الطالب ${student.name} بسبب تجاوز عدد الإنذارات.`, 'auto_freeze', student.id);
        toast.error('⚠️ تم تجميد الحساب تلقائياً لأن عدد الإنذارات بلغ 3.');
      } else {
        toast.success(`✅ تم إرسال الإنذار رقم ${newWarningNumber} بنجاح.`);
      }
      setShowWarningModal(false);
      setSelectedStudentForWarning(null);
      setWarningDescription('');
    } catch (err) {
      toast.error('فشل إصدار الإنذار: ' + err.message);
    }
  };

  const handleResetStudent = async (studentId) => {
    const ok = await confirm('إعادة تعيين الحساب', 'سيتم إعادة تعيين هذا الحساب. هل تريد المتابعة؟');
    if (!ok) return;
    try {
      const docSnap = await getDoc(doc(db, 'profiles', studentId));
      if (!docSnap.exists()) return;
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
      const studentObj = { ...student, username: student.username, name: student.name, phone: student.phone, classes: student.classIds ? await fetchClassNames(student.classIds) : {} };
      sendResetPasswordMessage(studentObj, newPassword);
      await sendNotificationToTeacher(user.id, '🔄 إعادة تعيين حساب', `تم إعادة تعيين حساب الطالب ${student.name || ''} (${studentId})`, 'reset_student', studentId);
      toast.success('✅ تم إعادة تعيين الحساب.');
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
      if (!docSnap.exists()) return;
      const student = docSnap.data();
      if (!student.pendingChanges) return;
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
      await sendNotificationToTeacher(user.id, '✅ قبول مراجعة', `تم قبول تغييرات الطالب ${student.name || ''}`, 'review_accepted', studentId);
      toast.success('تم قبول التغييرات.');
      setShowReviewModal(false);
      setSelectedReviewStudent(null);
    } catch (err) {
      toast.error('فشل قبول المراجعة: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  const rejectReview = async (studentId) => {
    const ok = await confirm('رفض التغييرات', 'هل أنت متأكد من رفض هذه التغييرات؟');
    if (!ok) return;
    try {
      const docRef = doc(db, 'profiles', studentId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return;
      const student = docSnap.data();
      if (!student.pendingChanges) return;
      await updateDoc(docRef, {
        pendingChanges: null,
        reviewResult: 'rejected',
        reviewExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        infoVerified: true,
        updatedAt: serverTimestamp()
      });
      sendDataUpdateRejectionMessage(student, 'عدم مطابقة الوثائق الرسمية / الحاجة لتقديم إثبات رسمي آخر / عدم استيفاء الشروط المطلوبة');
      await sendNotificationToTeacher(user.id, '❌ رفض مراجعة', `تم رفض تغييرات الطالب (${studentId})`, 'review_rejected', studentId);
      toast.success('تم رفض التغييرات.');
      setShowReviewModal(false);
      setSelectedReviewStudent(null);
    } catch (err) {
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
        await sendNotificationToTeacher(user.id, '📝 واجب جديد', `تم نشر واجب: "${text}"`, 'homework_added', newHwItem.id);
        await sendNotificationToStudents([section], '📝 واجب جديد', `تم نشر واجب: "${text}"`, 'homework', newHwItem.id);
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
      await sendNotificationToTeacher(user.id, '🕒 تحديث مواعيد الحصص', `تم تحديث جدول الحصص، عدد المواعيد: ${times.length}`, 'lesson_schedule_updated');
      await sendNotificationToAllStudents('🕒 تحديث مواعيد الحصص', `تم تحديث جدول الحصص، عدد المواعيد: ${times.length}`, 'lesson_schedule');
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
        await updateDoc(teacherRef, { homeworks: filtered, updatedAt: serverTimestamp() });
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
        await updateDoc(teacherRef, { lessonTimes: filtered, updatedAt: serverTimestamp() });
        toast.success('تم حذف الموعد بنجاح');
      }
    } catch (err) {
      toast.error('فشل حذف الموعد: ' + err.message);
    }
  };

  const sendGeneralMessage = (student) => {
    if (!student) return;
    const phone = student.phone || '';
    if (!phone) return toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) return toast.error('رقم الهاتف غير صالح.');
    
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

  const fetchTeacherData = async () => {
    try {
      const teacherId = user.id;
      const teacherRef = doc(db, 'teachers', teacherId);
      let teacherDoc = await getDoc(teacherRef);
      if (!teacherDoc.exists()) {
        await setDoc(teacherRef, { lessonTimes: [], homeworks: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
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
        classes: (s.classIds || []).map(id => ({ id, name: classMap[id] || null })).filter(c => c.name)
      }));
      setStudents(studentsList);

      const withoutClass = studentsList.filter(s => !s.classes || s.classes.length === 0);
      setStudentsWithoutClass(withoutClass);

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

      const pendingQuery = query(collection(db, 'profiles'), where('role', '==', 'student'), where('pendingChanges', '!=', null));
      const pendingSnapshot = await getDocs(pendingQuery);
      let pendingList = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const pendingClassIds = pendingList.flatMap(s => s.classIds || []);
      const pendingClassMap = await fetchClassNames(pendingClassIds);
      pendingList = pendingList.map(s => ({
        ...s,
        classes: (s.classIds || []).map(id => ({ id, name: pendingClassMap[id] || null })).filter(c => c.name)
      }));
      setPendingReviews(pendingList);

      const supervisorQuery = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
      const supervisorSnapshot = await getDocs(supervisorQuery);
      setSupervisors(supervisorSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

    } catch (err) {
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
        classes: (s.classIds || []).map(id => ({ id, name: classMap[id] || null })).filter(c => c.name)
      }));
      setStudents(studentsList);
      setStudentsWithoutClass(studentsList.filter(s => !s.classes || s.classes.length === 0));
    });

    const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', user.id));
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      const classesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setClasses(classesList);
      if (classesList.length > 0 && !selectedClassForLesson) {
        setSelectedClassForLesson(classesList[0].id);
      }
    });

    const pendingQuery = query(collection(db, 'profiles'), where('role', '==', 'student'), where('pendingChanges', '!=', null));
    const unsubscribePending = onSnapshot(pendingQuery, async (snapshot) => {
      let pendingList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const pendingClassIds = pendingList.flatMap(s => s.classIds || []);
      const pendingClassMap = await fetchClassNames(pendingClassIds);
      pendingList = pendingList.map(s => ({
        ...s,
        classes: (s.classIds || []).map(id => ({ id, name: pendingClassMap[id] || null })).filter(c => c.name)
      }));
      setPendingReviews(pendingList);
    });

    const supervisorQuery = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
    const unsubscribeSupervisors = onSnapshot(supervisorQuery, (snapshot) => {
      setSupervisors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
      } else if (lt.type === 'monthly') {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const dayOfMonth = parseInt(lt.monthDay);
        let nextDate = new Date(currentYear, currentMonth, dayOfMonth);
        nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (nextDate <= now) {
          nextDate = new Date(currentYear, currentMonth + 1, dayOfMonth);
          nextDate.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        }
        if (!nearest || nextDate < new Date(nearest.date)) {
          nearest = { ...lt, date: nextDate.toISOString() };
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

        {/* Pending reviews */}
        {pendingReviews.length > 0 && (
          <div className="bg-yellow-900/30 p-6 rounded-2xl border border-yellow-500/40 shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xl font-semibold text-yellow-300 flex items-center gap-2">
                <FaClipboardList className="inline-block" />
                طلبات تعديل البيانات ({pendingReviews.length})
              </h3>
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
                      </div>
                      <div className="text-xs text-gray-300 mt-1 space-y-0.5">
                        {changeFields.map(field => (
                          <div key={field} className="mr-2 text-xs">
                            <span className="text-gray-400">{field}:</span>
                            <span className="text-red-400 line-through mx-1">{student[field] ?? '(فارغ)'}</span>
                            <span className="text-gray-400">→</span>
                            <span className="text-green-300 mx-1">{changes[field] ?? '(فارغ)'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openReviewModal(student)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition">
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
            {nextLesson ? (
              <button
                onClick={() => {
                  toast.success('✅ تم إنشاء الحصة بنجاح! سيتم إشعار الطلاب.');
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
              <button onClick={() => setShowPrintModal(true)} type="button" className="btn-primary bg-teal-600 hover:bg-teal-700 py-2 px-4 text-sm rounded-md text-white">
                <FaPrint className="inline-block me-2" /> طباعة الجدول
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

        {/* Supervisors section */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-indigo-500/30 mt-6">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="text-xl font-semibold text-indigo-300">
              <FaEye className="inline-block me-2" /> المشرفين ({supervisors.length}/{MAX_SUPERVISORS})
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setShowSupervisorModal(true)} disabled={supervisors.length >= MAX_SUPERVISORS} className={`btn-primary ${supervisors.length >= MAX_SUPERVISORS ? 'bg-gray-600 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'} text-white px-4 py-2 rounded-md text-sm`}>
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
                      {obs.isFrozen && <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">⏳ مجمد</span>}
                      <span className="text-xs text-yellow-300 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">
                        <FaExclamationTriangle className="inline-block me-1" /> الإنذارات: {warningCount}/3
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {warningCount < 3 && (
                        <button onClick={() => openSupervisorWarningModal(obs)} className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30">
                          <FaExclamationTriangle className="inline-block me-1" /> إنذار
                        </button>
                      )}
                      <button onClick={() => handleResetSupervisor(obs.id)} type="button" className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg hover:bg-indigo-500/30">
                        <FaEdit className="inline-block me-1" /> إعادة تعيين
                      </button>
                      <button onClick={() => handleDeleteSupervisor(obs.id)} type="button" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">
                        <FaTrashAlt className="inline-block me-1" /> حذف
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">لا يوجد مشرفين مسجلين.</p>
          )}
        </div>
      </div>

      {/* Modals */}
      <PrintStudentsModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} students={students} />
      {selectedStudentForReport && (
        <ReportModal isOpen={showReportModal} onClose={() => { setShowReportModal(false); setSelectedStudentForReport(null); }} student={selectedStudentForReport} />
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
                const classNames = s.classes?.map(c => c.name).filter(Boolean).join(', ') || 'لا توجد شعبة';
                const warningCount = (s.warnings || []).length;
                return (
                  <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.isFrozen ? 'bg-gray-800/60 border-gray-700 opacity-80' : 'bg-gray-800/30 border-gray-700'}`}>
                    <div className="flex items-center gap-3 flex-wrap flex-1">
                      <span className="text-white text-sm font-medium">{s.name || s.username}</span>
                      <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">
                        الشعب: {classNames}
                      </span>
                      {s.isFrozen && <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">⏳ مجمد</span>}
                      <span className="text-xs text-yellow-300 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">
                        الإنذارات: {warningCount}/3
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openWarningModal(s)} className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30">
                        إنذار
                      </button>
                      <button onClick={() => { setSelectedStudentForReport(s); setShowReportModal(true); }} className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">
                        بلاغ
                      </button>
                      <button onClick={() => { setSelectedStudentForMessage(s); setGeneralMessageSubject(''); setGeneralMessageText(''); setShowGeneralMessageModal(true); }} className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg hover:bg-green-500/30">
                        رسالة
                      </button>
                      <button onClick={() => handleResetStudent(s.id)} className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg hover:bg-indigo-500/30">
                        إعادة تعيين
                      </button>
                      <div className="flex items-center gap-2">
                        <div onClick={() => toggleFreezeStudent(s)} className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-300 ${s.isFrozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                          <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-300 ${s.isFrozen ? 'translate-x-0' : 'translate-x-5'}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Warning Modal */}
      {showWarningModal && selectedStudentForWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWarningModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4">
              <FaExclamationTriangle className="inline-block me-2" /> إصدار إنذار للطالب
            </h3>
            <p className="text-gray-300 text-sm mb-2">
              الطالب: <strong>{selectedStudentForWarning.name}</strong>
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block mb-1">سبب المخالفة</label>
                <textarea
                  className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white resize-none"
                  placeholder="اكتب وصف المخالفة..."
                  value={warningDescription}
                  onChange={(e) => setWarningDescription(e.target.value)}
                />
              </div>
              <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20 text-xs text-yellow-300">
                سيتم مراجعة طلبك من قبل لجنة الإشراف العام وسيتم اتخاذ القرار خلال ٤٨ ساعة بحد اقصى.
              </div>
              <div className="flex gap-3">
                <button onClick={confirmWarning} className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white">إرسال الإنذار</button>
                <button onClick={() => setShowWarningModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* General Message Modal */}
      {showGeneralMessageModal && selectedStudentForMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGeneralMessageModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4">
              <FaComment className="inline-block me-2" /> إرسال رسالة إلى {selectedStudentForMessage.name}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-300 block">الموضوع</label>
                <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={generalMessageSubject} onChange={(e) => setGeneralMessageSubject(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-gray-300 block">نص الرسالة</label>
                <textarea className="bg-gray-800 w-full h-32 text-right p-2 border border-gray-600 rounded-md text-white resize-none" value={generalMessageText} onChange={(e) => setGeneralMessageText(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => sendGeneralMessage(selectedStudentForMessage)} className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white">إرسال</button>
                <button onClick={() => setShowGeneralMessageModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ChoiceModal isOpen={showAssignmentChoice} onClose={() => { setShowAssignmentChoice(false); setSelectedAssignmentType(null); }} onSelect={(type) => { setSelectedAssignmentType(type); setShowAssignmentChoice(false); setShowAssignmentModal(true); }} title="اختر نوع الواجب" options={[{ value: 'now', label: 'نشر فوراً' }, { value: 'schedule', label: 'جدولة' }, { value: 'draft', label: 'حفظ كمسودة' }, { value: 'delay', label: 'نشر بعد وقت' }]} />
      <ChoiceModal isOpen={showLessonChoice} onClose={() => { setShowLessonChoice(false); setSelectedLessonType(null); }} onSelect={(type) => { setSelectedLessonType(type); setShowLessonChoice(false); setShowLessonModal(true); }} title="إدارة مواعيد الحصص" options={[{ value: 'manage', label: 'إضافة / تعديل المواعيد (حتى 6)' }]} />

      <AddAssignmentModal isOpen={showAssignmentModal} onClose={() => { setShowAssignmentModal(false); setSelectedAssignmentType(null); }} onSubmit={saveHomeworkFromModal} classesList={classes} initialMode={selectedAssignmentType || 'now'} />
      <AddLessonModal isOpen={showLessonModal} onClose={() => { setShowLessonModal(false); setSelectedLessonType(null); }} onSubmit={saveLessonTimesFromModal} initialTimes={lessonTimes} classesList={classes} />
    </div>
  );
};

export default TeacherPanel;