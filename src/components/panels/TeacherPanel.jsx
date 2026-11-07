import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaPen, FaClock, FaClipboardList, FaUser, FaBell, FaSignOutAlt,
  FaExclamationTriangle, FaCheckCircle, FaTimesCircle, FaEye,
  FaPlus, FaVideo, FaUsers, FaTrashAlt, FaPrint, FaPaperPlane
} from 'react-icons/fa';
import { db, messaging } from '../../firebase';
import { auth, secondaryAuth } from '../../services/firebaseAuth';
import { 
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query,
  where, getDocs, onSnapshot, serverTimestamp, arrayUnion, orderBy, writeBatch
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
  fetchClassNames 
} from '../../utils/helpers';
import { createMessageRequest } from '../../services/messageRequests';
import {
  MESSAGE_REQUEST_TYPES
} from '../../constants';

const TeacherPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const [lessonTimes, setLessonTimes] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingReviews, setPendingReviews] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [notificationsActive, setNotificationsActive] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!messaging
  );

  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [showAssignmentChoice, setShowAssignmentChoice] = useState(false);
  const [showLessonChoice, setShowLessonChoice] = useState(false);
  const [selectedAssignmentType, setSelectedAssignmentType] = useState(null);
  const [selectedLessonType, setSelectedLessonType] = useState(null);
  const [showGeneralMessageModal, setShowGeneralMessageModal] = useState(false);
  const [generalMessageSubject, setGeneralMessageSubject] = useState('');
  const [generalMessageText, setGeneralMessageText] = useState('');
  const [selectedStudentForMessage, setSelectedStudentForMessage] = useState(null);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGender, setNewStudentGender] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentClassIds, setNewStudentClassIds] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showAddNotificationModal, setShowAddNotificationModal] = useState(false);
  const [newlyAddedStudent, setNewlyAddedStudent] = useState(null);
  const [showClassSelectionModal, setShowClassSelectionModal] = useState(false);
  const [selectedStudentForClass, setSelectedStudentForClass] = useState(null);
  const [tempClassIds, setTempClassIds] = useState([]);
  const [selectedClassForLesson, setSelectedClassForLesson] = useState('');
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [selectedStudentForWarning, setSelectedStudentForWarning] = useState(null);
  const [warningDescription, setWarningDescription] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewStudent, setSelectedReviewStudent] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedStudentForReport, setSelectedStudentForReport] = useState(null);

  const requestNotificationPermission = async () => {
    try {
      if (!('Notification' in window)) return false;
      if ('serviceWorker' in navigator) {
        try {
          await Promise.race([
            navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('SW timeout')), 5000))
          ]);
        } catch (e) { console.warn('SW register skipped:', e.message); }
      }
      let permission = Notification.permission;
      if (permission === 'denied') {
        toast.error('الإشعارات محظورة من إعدادات المتصفح');
        return false;
      }
      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return false;
      if (!messaging) return true;
      const vapidKey = import.meta.env.VITE_VAPID_KEY;
      if (!vapidKey) return true;
      let token = null;
      try {
        token = await Promise.race([
          getToken(messaging, { vapidKey }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('getToken timeout')), 10000))
        ]);
      } catch (e) {
        console.warn('FCM token fetch failed:', e.message);
        return true;
      }
      if (token) {
        try {
          await updateDoc(doc(db, 'profiles', user.id), {
            fcmTokens: arrayUnion(token)
          });
        } catch (e) { console.warn('Save token failed:', e.message); }
      }
      return true;
    } catch (err) {
      console.error('Notification error:', err);
      return false;
    }
  };

  useEffect(() => {
    if (!messaging) return;
    try {
      const unsub = onMessage(messaging, (payload) => {
        toast.custom(() => (
          <div className="bg-gray-800 text-white p-4 rounded-xl border border-purple-500 shadow-xl max-w-sm mx-auto">
            <strong className="block text-lg">{payload.notification?.title}</strong>
            <p className="text-sm text-gray-200">{payload.notification?.body}</p>
          </div>
        ), { duration: 5000 });
      });
      return () => unsub();
    } catch (err) {
      console.warn('onMessage setup failed:', err);
    }
  }, []);

  const handleOpenNotifications = () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      requestNotificationPermission()
        .then(ok => setNotificationsActive(ok))
        .catch(err => console.warn('Notification request failed:', err));
    }
  };

  const handleCloseNotifications = async () => {
    setShowNotificationsModal(false);
    try {
      if (notificationIdsAtOpen.length > 0) {
        const batch = writeBatch(db);
        notificationIdsAtOpen.forEach(id => {
          batch.delete(doc(db, 'notifications', user.id, 'userNotifications', id));
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn('فشل حذف الإشعارات:', err);
    }
    setNotificationIdsAtOpen([]);
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (newStudentClassIds.length === 0) return toast.error('يرجى اختيار شعبة واحدة على الأقل.');
    const sanitizedName = sanitizeInput(newStudentName);
    const sanitizedGender = sanitizeInput(newStudentGender);
    const sanitizedAge = sanitizeInput(arabicToEnglishNumber(newStudentAge));
    const sanitizedPhone = sanitizeInput(arabicToEnglishNumber(newStudentPhone));
    if (!sanitizedName || !sanitizedGender || !sanitizedAge || !sanitizedPhone) return toast.error('جميع الحقول مطلوبة.');
    setStudentLoading(true);
    try {
      let maxNum = 0;
      const q = query(collection(db, 'profiles'), where('username', '>=', 'knight'), where('username', '<', 'knight\uF7FF'));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        const uname = doc.data().username;
        if (uname && uname.startsWith('knight')) {
          const num = parseInt(uname.substring(6), 10);
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
        return toast.error('فشل إنشاء حساب المصادقة: ' + authError.message);
      }
      const firebaseUser = userCredential.user;
      await signOut(secondaryAuth);
      await setDoc(doc(db, 'profiles', newId), {
        email, username: newUsername, name: sanitizedName, gender: sanitizedGender,
        age: ageNum, phone: cleanPhone, classIds: newStudentClassIds, role: 'student',
        isFrozen: false, infoVerified: false, isProfileComplete: false,
        pendingChanges: null, reviewResult: null, reviewExpiry: null,
        warnings: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        uid: firebaseUser.uid
      });
      const classMap = await fetchClassNames(newStudentClassIds);
      const classNames = newStudentClassIds.map(id => classMap[id] || null).filter(Boolean);
      setNewlyAddedStudent({
        id: newId,
        name: sanitizedName, gender: sanitizedGender, age: ageNum, phone: cleanPhone,
        classIds: newStudentClassIds,
        classes: classNames.map(n => ({ name: n })),
        username: newUsername, password: tempPassword
      });
      setShowAddNotificationModal(true);
      setNewStudentName(''); setNewStudentGender(''); setNewStudentAge('');
      setNewStudentPhone(''); setNewStudentClassIds([]); setShowAddStudentModal(false);
    } catch (err) {
      toast.error('فشل إضافة الطالب: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setStudentLoading(false);
    }
  };

  const openWarningModal = (s) => { setSelectedStudentForWarning(s); setWarningDescription(''); setShowWarningModal(true); };

  const confirmWarning = async () => {
    if (!selectedStudentForWarning) return;
    const desc = sanitizeInput(warningDescription);
    if (!desc.trim()) return toast.error('يرجى كتابة وصف المخالفة.');
    const student = selectedStudentForWarning;
    const currentWarnings = student.warnings || [];
    const newWarningNumber = currentWarnings.length + 1;
    if (newWarningNumber > 3) return toast.error('تم تجاوز عدد الإنذارات المسموح به.');

    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.WARNING,
        targetType: 'student',
        targetId: student.id,
        targetName: student.name,
        targetPhone: student.phone || '',
        targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {
          warningNumber: newWarningNumber,
          description: desc.trim()
        }
      });

      const studentRef = doc(db, 'profiles', student.id);
      await updateDoc(studentRef, {
        warnings: arrayUnion({
          id: generateId(),
          issuedAt: new Date().toISOString(),
          type: newWarningNumber,
          description: desc.trim()
        }),
        updatedAt: serverTimestamp()
      });
      if (newWarningNumber === 3) {
        await updateDoc(studentRef, {
          isFrozen: true,
          frozenAt: serverTimestamp(),
          freezeReason: 'تجاوز عدد الإنذارات'
        });
      }

      toast.success(`✅ تم حفظ طلب الإنذار رقم ${newWarningNumber}. سيتم إرساله بعد تدقيق مدير النظام.`);
      setShowWarningModal(false);
      setSelectedStudentForWarning(null);
    } catch (err) {
      toast.error('فشل حفظ طلب الإنذار: ' + err.message);
    }
  };

  const handleResetStudent = async (studentId) => {
    const ok = await confirm('إعادة تعيين الحساب', 'هل تريد المتابعة؟');
    if (!ok) return;
    try {
      const docSnap = await getDoc(doc(db, 'profiles', studentId));
      if (!docSnap.exists()) return;
      const student = docSnap.data();
      const newPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      await updateDoc(doc(db, 'profiles', studentId), {
        infoVerified: false, isFrozen: false, isProfileComplete: false,
        pendingChanges: null, reviewResult: null, reviewExpiry: null,
        tempPassword: newPassword, updatedAt: serverTimestamp()
      });

      const classMap = student.classIds ? await fetchClassNames(student.classIds) : {};
      const classNames = (student.classIds || []).map(id => classMap[id]).filter(Boolean).join(', ');
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.RESET_PASSWORD,
        targetType: 'student',
        targetId: studentId,
        targetName: student.name || '',
        targetPhone: student.phone || '',
        targetClass: classNames || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {
          username: student.username || '',
          newPassword: newPassword
        }
      });

      toast.success('✅ تم إعادة تعيين الحساب وحفظ طلب إرسال البيانات. سيتم الإرسال بعد تدقيق مدير النظام.');
    } catch (err) {
      toast.error('فشل إعادة التعيين: ' + err.message);
    }
  };

  const handleDeleteStudentPermanently = async (student) => {
    const ok = await confirm(
      'حذف دائم',
      `سيتم حذف الملف الشخصي للطالب "${student.name}" نهائياً من النظام. هل تريد المتابعة؟`
    );
    if (!ok) return;

    const notifyParent = await confirm(
      'إخطار ولي الأمر بالحذف',
      'هل تريد إرسال إشعار حذف الحساب لولي الأمر؟\n\n📨 سيُحفظ كطلب ويُرسل رسمياً بعد تدقيق مدير النظام.'
    );

    try {
      if (notifyParent) {
        await createMessageRequest({
          type: MESSAGE_REQUEST_TYPES.DELETE,
          targetType: 'student',
          targetId: student.id,
          targetName: student.name || '',
          targetPhone: student.phone || '',
          targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
          requestedBy: user.id,
          requestedByName: user.name || user.username || 'معلم',
          payload: {}
        });
      }

      await deleteDoc(doc(db, 'profiles', student.id));
      toast.success(notifyParent
        ? '✅ تم حذف الطالب وحفظ طلب إشعار ولي الأمر.'
        : '✅ تم حذف الطالب.');
    } catch (err) {
      toast.error('فشل الحذف: ' + err.message);
    }
  };

  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.isFrozen;
    try {
      await updateDoc(doc(db, 'profiles', student.id), {
        isFrozen: nextStatus,
        frozenAt: nextStatus ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });

      if (nextStatus) {
        const notifyParent = await confirm(
          'إخطار ولي الأمر بالتجميد',
          `تم تجميد حساب الطالب "${student.name}".\n\nهل تريد إرسال إشعار تجميد لولي الأمر؟\n\n📨 سيُحفظ كطلب ويُرسل رسمياً بعد تدقيق مدير النظام.`
        );
        if (notifyParent) {
          await createMessageRequest({
            type: MESSAGE_REQUEST_TYPES.FREEZE,
            targetType: 'student',
            targetId: student.id,
            targetName: student.name || '',
            targetPhone: student.phone || '',
            targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
            requestedBy: user.id,
            requestedByName: user.name || user.username || 'معلم',
            payload: {}
          });
          toast.success('⏳ تم تجميد الطالب وحفظ طلب إشعار ولي الأمر.');
        } else {
          toast.success('تم تجميد الطالب.');
        }
      } else {
        toast.success('تم فك التجميد.');
      }
    } catch (err) {
      toast.error('فشل التحديث: ' + err.message);
    }
  };

  const openClassSelection = (s) => { setSelectedStudentForClass(s); setTempClassIds(s.classIds || []); setShowClassSelectionModal(true); };
  const saveClassSelection = async () => {
    if (!selectedStudentForClass) return;
    try {
      await updateDoc(doc(db, 'profiles', selectedStudentForClass.id), { classIds: tempClassIds, updatedAt: serverTimestamp() });
      toast.success('تم تحديث الشعبة');
      setShowClassSelectionModal(false);
    } catch (err) { toast.error('فشل التحديث: ' + err.message); }
  };

  const openReviewModal = (s) => { setSelectedReviewStudent(s); setShowReviewModal(true); };

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
        infoVerified: true, pendingChanges: null, reviewResult: 'approved',
        reviewExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updatedAt: serverTimestamp()
      };
      await updateDoc(docRef, newData);

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.DATA_UPDATE_APPROVAL,
        targetType: 'student',
        targetId: studentId,
        targetName: newData.name || student.name || '',
        targetPhone: newData.phone || student.phone || '',
        targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {}
      });

      toast.success('✅ تم قبول التغييرات وحفظ طلب إشعار الموافقة. سيُرسل بعد تدقيق مدير النظام.');
      setShowReviewModal(false);
    } catch (err) { toast.error('فشل القبول: ' + err.message); }
  };

  const rejectReview = async (studentId) => {
    const ok = await confirm('رفض التغييرات', 'هل أنت متأكد؟');
    if (!ok) return;
    try {
      const docRef = doc(db, 'profiles', studentId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return;
      const student = docSnap.data();
      await updateDoc(docRef, {
        pendingChanges: null, reviewResult: 'rejected',
        reviewExpiry: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        infoVerified: true, updatedAt: serverTimestamp()
      });

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.DATA_UPDATE_REJECTION,
        targetType: 'student',
        targetId: studentId,
        targetName: student.name || '',
        targetPhone: student.phone || '',
        targetClass: student.classes?.map(c => c.name).join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {
          reason: 'عدم مطابقة الوثائق الرسمية / الحاجة لتقديم إثبات رسمي آخر / عدم استيفاء الشروط المطلوبة'
        }
      });

      toast.success('✅ تم رفض التغييرات وحفظ طلب إشعار الرفض. سيُرسل بعد تدقيق مدير النظام.');
      setShowReviewModal(false);
    } catch (err) { toast.error('فشل الرفض: ' + err.message); }
  };

  const saveHomeworkFromModal = async (data) => {
    const { date, time, section, text, is_draft } = data;
    let revealTime = null;
    if (!is_draft) {
      const combined = new Date(date);
      combined.setHours(time.hours, time.minutes, 0, 0);
      revealTime = combined.toISOString();
    }
    const newHwItem = {
      id: generateId(), text, section, reveal_time: revealTime,
      is_scheduled: !is_draft, is_draft: is_draft || false,
      created_at: new Date().toISOString()
    };
    try {
      await updateDoc(doc(db, 'teachers', user.id), {
        homeworks: arrayUnion(newHwItem), updatedAt: serverTimestamp()
      });
      toast.success(is_draft ? '💾 تم حفظ المسودة!' : '✅ تم نشر الواجب!');
      setShowAssignmentModal(false);
      setSelectedAssignmentType(null);
    } catch (err) { toast.error('فشل الحفظ: ' + err.message); }
  };

  const saveLessonTimesFromModal = async (times) => {
    try {
      const timesWithId = times.map(t => ({ ...t, id: generateId() }));
      await updateDoc(doc(db, 'teachers', user.id), {
        lessonTimes: timesWithId, updatedAt: serverTimestamp()
      });
      toast.success('✅ تم تحديث المواعيد!');
      setShowLessonModal(false);
      setSelectedLessonType(null);
    } catch (err) { toast.error('فشل التحديث: ' + err.message); }
  };

  const deleteHomework = async (hwId) => {
    const ok = await confirm('حذف الواجب', 'حذف نهائي؟');
    if (!ok) return;
    try {
      const teacherRef = doc(db, 'teachers', user.id);
      const docSnap = await getDoc(teacherRef);
      if (docSnap.exists()) {
        const filtered = (docSnap.data().homeworks || []).filter(h => h.id !== hwId);
        await updateDoc(teacherRef, { homeworks: filtered, updatedAt: serverTimestamp() });
        toast.success('تم الحذف.');
      }
    } catch (err) { toast.error('فشل: ' + err.message); }
  };

  const handleSaveGeneralMessage = async () => {
    if (!selectedStudentForMessage) return;
    if (!generalMessageText.trim()) {
      toast.error('يرجى كتابة نص الرسالة.');
      return;
    }
    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.GENERAL,
        targetType: 'student',
        targetId: selectedStudentForMessage.id,
        targetName: selectedStudentForMessage.name || '',
        targetPhone: selectedStudentForMessage.phone || '',
        targetClass: selectedStudentForMessage.classes?.map(c => c.name).join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {
          subject: sanitizeInput(generalMessageSubject) || 'إشعار رسمي',
          body: sanitizeInput(generalMessageText)
        }
      });
      toast.success('✅ تم حفظ الرسالة كطلب معلّق. سيتم إرسالها بعد تدقيق مدير النظام.');
      setShowGeneralMessageModal(false);
      setGeneralMessageSubject('');
      setGeneralMessageText('');
      setSelectedStudentForMessage(null);
    } catch (err) {
      toast.error('فشل حفظ الرسالة: ' + err.message);
    }
  };

  const handleSaveActivationRequest = async () => {
    if (!newlyAddedStudent) return;
    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.ACTIVATION,
        targetType: 'student',
        targetId: newlyAddedStudent.id || '',
        targetName: newlyAddedStudent.name,
        targetPhone: newlyAddedStudent.phone,
        targetClass: newlyAddedStudent.classes?.map(c => c.name).join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'معلم',
        payload: {
          username: newlyAddedStudent.username,
          password: newlyAddedStudent.password,
          age: newlyAddedStudent.age,
          gender: newlyAddedStudent.gender
        }
      });
      toast.success('✅ تم حفظ طلب إرسال بيانات التفعيل. سيُرسل بعد تدقيق مدير النظام.');
      setShowAddNotificationModal(false);
      setNewlyAddedStudent(null);
    } catch (err) {
      toast.error('فشل حفظ الطلب: ' + err.message);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const teacherRef = doc(db, 'teachers', user.id);
        let teacherDoc = await getDoc(teacherRef);
        if (!teacherDoc.exists()) {
          await setDoc(teacherRef, { lessonTimes: [], homeworks: [], createdAt: serverTimestamp() });
        }
        const studentsSnapshot = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'student')));
        let studentsList = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allClassIds = studentsList.flatMap(s => s.classIds || []);
        const classMap = await fetchClassNames(allClassIds);
        studentsList = studentsList.map(s => ({
          ...s, warnings: s.warnings || [],
          classes: (s.classIds || []).map(id => ({ id, name: classMap[id] || null })).filter(c => c.name)
        }));
        setStudents(studentsList);

        const classesSnapshot = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.id)));
        let classesList = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (classesList.length === 0) {
          const defaults = [{ name: 'أساسيات البرمجة', teacherId: user.id }, { name: 'بايثون (Python)', teacherId: user.id }];
          const created = [];
          for (const cls of defaults) {
            const ref = doc(collection(db, 'classes'));
            await setDoc(ref, { ...cls, createdAt: serverTimestamp() });
            created.push({ id: ref.id, ...cls });
          }
          classesList = created;
        }
        setClasses(classesList);
        if (classesList.length > 0) setSelectedClassForLesson(classesList[0].id);

        const pendingSnapshot = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'student'), where('pendingChanges', '!=', null)));
        let pendingList = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const pendingClassMap = await fetchClassNames(pendingList.flatMap(s => s.classIds || []));
        pendingList = pendingList.map(s => ({
          ...s, classes: (s.classIds || []).map(id => ({ id, name: pendingClassMap[id] || null })).filter(c => c.name)
        }));
        setPendingReviews(pendingList);
      } catch (err) { setErrorMsg('فشل التحميل: ' + err.message); }
      finally { setLoading(false); }
    };

    fetchData();

    const teacherRef = doc(db, 'teachers', user.id);
    const unsubTeacher = onSnapshot(teacherRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLessonTimes(data.lessonTimes || []);
        setHomeworks(data.homeworks || []);
      }
    });

    const unsubStudents = onSnapshot(query(collection(db, 'profiles'), where('role', '==', 'student')), async (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const classMap = await fetchClassNames(list.flatMap(s => s.classIds || []));
      list = list.map(s => ({
        ...s, warnings: s.warnings || [],
        classes: (s.classIds || []).map(id => ({ id, name: classMap[id] || null })).filter(c => c.name)
      }));
      setStudents(list);
    });

    const unsubClasses = onSnapshot(query(collection(db, 'classes'), where('teacherId', '==', user.id)), (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubPending = onSnapshot(query(collection(db, 'profiles'), where('role', '==', 'student'), where('pendingChanges', '!=', null)), async (snapshot) => {
      let list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const classMap = await fetchClassNames(list.flatMap(s => s.classIds || []));
      list = list.map(s => ({ ...s, classes: (s.classIds || []).map(id => ({ id, name: classMap[id] || null })).filter(c => c.name) }));
      setPendingReviews(list);
    });

    const unsubNotif = onSnapshot(query(collection(db, 'notifications', user.id, 'userNotifications'), orderBy('createdAt', 'desc')), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });

    return () => { unsubTeacher(); unsubStudents(); unsubClasses(); unsubPending(); unsubNotif(); };
  }, [user.id]);

  const getNextLessonTime = (classId) => {
    if (!lessonTimes || lessonTimes.length === 0) return null;
    const now = new Date();
    let nearest = null;
    for (const lt of lessonTimes) {
      if (classId && lt.classId && lt.classId !== classId) continue;
      if (!lt.time) continue;

      if (lt.type === 'once') {
        const d = new Date(lt.date);
        if (!isNaN(d.getTime()) && d > now && (!nearest || d < new Date(nearest.date))) {
          nearest = { ...lt, date: d.toISOString() };
        }
      } else if (lt.type === 'recurring') {
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayIndex = days.indexOf(lt.day);
        if (dayIndex === -1) continue;
        let diff = dayIndex - now.getDay();
        if (diff < 0) diff += 7;
        if (diff === 0) {
          const t = new Date(now); t.setHours(lt.time.hours, lt.time.minutes, 0, 0);
          if (t <= now) diff = 7;
        }
        const next = new Date(now);
        next.setDate(now.getDate() + diff);
        next.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (!nearest || next < new Date(nearest.date)) nearest = { ...lt, date: next.toISOString() };
      } else if (lt.type === 'monthly') {
        const md = parseInt(lt.monthDay);
        if (!md) continue;
        let next = new Date(now.getFullYear(), now.getMonth(), md);
        next.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        if (next <= now) {
          next = new Date(now.getFullYear(), now.getMonth() + 1, md);
          next.setHours(lt.time.hours, lt.time.minutes, 0, 0);
        }
        if (!nearest || next < new Date(nearest.date)) nearest = { ...lt, date: next.toISOString() };
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
            <p className="text-gray-400 text-sm mt-1">مرحباً: {user.name || user.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNotifications} className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg" title={notificationsActive ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}>
              <FaBell />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
              {notificationsActive && <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg"><FaSignOutAlt /></button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        {pendingReviews.length > 0 && (
          <div className="bg-yellow-900/30 p-6 rounded-2xl border border-yellow-500/40 shadow-lg">
            <h3 className="text-xl font-semibold text-yellow-300 mb-3 flex items-center gap-2">
              <FaClipboardList /> طلبات تعديل البيانات ({pendingReviews.length})
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {pendingReviews.map(student => (
                <div key={student.id} className="bg-black/30 p-4 rounded-xl border border-yellow-500/20 flex justify-between items-center gap-3">
                  <div>
                    <span className="text-white font-medium">{student.name || student.username}</span>
                    <span className="text-xs text-gray-400 mr-2">({student.username})</span>
                  </div>
                  <button onClick={() => openReviewModal(student)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"><FaEye className="inline-block me-1" /> مراجعة</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ✅ التعديل: عمودين، العمود الأول يحتوي على بطاقتين (طلاب + شعب) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* العمود الأيسر: بطاقة الطلاب (أعلى) + بطاقة الشعب (أسفل) */}
          <div className="flex flex-col gap-4">
            
            {/* بطاقة الطلاب - تم إرجاع الشريط وإضافة مسافات متناسقة */}
            <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-purple-900/20 p-4 rounded-2xl border border-purple-500/30 shadow-xl group hover:shadow-purple-500/20 hover:border-purple-400/50 transition-all duration-300">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/20 transition" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                      <FaUsers className="text-white text-lg" />
                    </div>
                    <div>
                      <p className="text-xs text-purple-300 uppercase tracking-widest font-semibold">الإجمالي</p>
                      <h3 className="text-sm font-bold text-purple-100">عدد الطلاب</h3>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black bg-gradient-to-r from-white via-purple-100 to-purple-200 bg-clip-text text-transparent">{students.length}</p>
                    <span className="text-purple-300 text-sm font-medium">طالب</span>
                  </div>
                </div>
                {/* ✅ الشريط الجميل عاد هنا */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-purple-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 rounded-full transition-all" style={{ width: `${Math.min(students.length * 5, 100)}%` }} />
                  </div>
                  <span className="text-xs text-purple-400">نشط</span>
                </div>
              </div>
            </div>

            {/* بطاقة الشعب الدراسية - جديدة أسفل الطلاب */}
            <div className="flex-1 relative overflow-hidden bg-gradient-to-br from-pink-900/60 via-fuchsia-900/40 to-fuchsia-900/20 p-4 rounded-2xl border border-pink-500/30 shadow-xl group hover:shadow-pink-500/20 hover:border-pink-400/50 transition-all duration-300 flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-pink-500/20 transition" />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-pink-500/30">
                    <FaClipboardList className="text-white text-lg" />
                  </div>
                  <div>
                    <p className="text-xs text-pink-300 uppercase tracking-widest font-semibold">الإجمالي</p>
                    <h3 className="text-sm font-bold text-pink-100">الشعب الدراسية</h3>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-4xl font-black bg-gradient-to-r from-white via-pink-100 to-pink-200 bg-clip-text text-transparent">{classes.length}</p>
                  <span className="text-pink-300 text-sm font-medium">شعبة</span>
                </div>
              </div>
            </div>

          </div>

          {/* العمود الأيمن: العد التنازلي */}
          <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold text-purple-200">الوقت المتبقي للحصة القادمة</h3>
              {classes.length > 0 && (
                <select value={selectedClassForLesson} onChange={(e) => setSelectedClassForLesson(e.target.value)} className="bg-gray-700 text-white rounded-md px-3 py-1 text-sm border border-gray-600">
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              )}
            </div>
            <CountdownTimer targetDate={nextLesson ? nextLesson.date : null} />
            {nextLesson && (
              <button onClick={() => toast.success(' تم إنشاء الحصة!')} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl text-lg font-bold shadow-lg w-full mt-2">
                <FaVideo className="inline-block me-2" /> إنشاء غرفة للحصة
              </button>
            )}
          </div>

        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-pink-300"><FaPen className="inline-block me-2" /> إدارة الواجبات</h3>
            <button onClick={() => setShowAssignmentChoice(true)} className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 py-2 px-4 text-sm rounded-md text-white"><FaPen className="inline-block me-2" /> إضافة واجب</button>
          </div>
          {homeworks.length > 0 ? (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {homeworks.map(hw => (
                <div key={hw.id} className="p-3 rounded-xl border border-gray-700 bg-black/30 flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="text-gray-100 text-sm">{hw.text}</p>
                    {hw.is_draft && <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-full mr-2">💾 مسودة</span>}
                  </div>
                  <button onClick={() => deleteHomework(hw.id)} className="p-1.5 bg-red-600/30 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-600/50 text-xs"><FaTrashAlt /></button>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-400 text-center py-4">لا توجد واجبات.</p>}
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-xl font-semibold text-blue-300"><FaUser className="inline-block me-2" /> إدارة الطلاب</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddStudentModal(true)} className="btn-primary bg-blue-600 hover:bg-blue-700 py-2 px-4 text-sm rounded-md text-white"><FaPlus className="inline-block me-2" /> إضافة طالب</button>
              <button onClick={() => setShowStudentsModal(true)} className="btn-primary bg-purple-600 hover:bg-purple-700 py-2 px-4 text-sm rounded-md text-white"><FaClipboardList className="inline-block me-2" /> عرض الطلبة</button>
              <button onClick={() => setShowPrintModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700 py-2 px-4 text-sm rounded-md text-white"><FaPrint className="inline-block me-2" /> طباعة الجدول</button>
            </div>
          </div>
        </div>

        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200"><FaClock className="inline-block me-2" /> جدولة المواعيد</h3>
          <button onClick={() => setShowLessonChoice(true)} className="btn-primary bg-gradient-to-r from-indigo-500 to-blue-600 py-3 px-6 rounded-md text-white"><FaClock className="inline-block me-2" /> إدارة المواعيد </button>
        </div>
      </div>

      <PrintStudentsModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} students={students} />
      {selectedStudentForReport && (
        <ReportModal
          isOpen={showReportModal}
          onClose={() => { setShowReportModal(false); setSelectedStudentForReport(null); }}
          student={selectedStudentForReport}
          requesterId={user.id}
          requesterName={user.name || user.username || 'معلم'}
        />
      )}

      {showStudentsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowStudentsModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-4xl w-full max-h-[80vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-300">قائمة الطلاب ({students.length})</h3>
              <button onClick={() => setShowStudentsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {students.map(s => {
                const classNames = s.classes?.map(c => c.name).filter(Boolean).join(', ') || 'لا توجد شعبة';
                const warningCount = (s.warnings || []).length;
                return (
                  <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.isFrozen ? 'bg-gray-800/60 border-gray-700 opacity-80' : 'bg-gray-800/30 border-gray-700'}`}>
                    <div className="flex items-center gap-3 flex-wrap flex-1">
                      <span className="text-white text-sm font-medium">{s.name || s.username}</span>
                      <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">الشعب: {classNames}</span>
                      {s.isFrozen && <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded">⏳ مجمد</span>}
                      <span className="text-xs text-yellow-300 bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">الإنذارات: {warningCount}/3</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openWarningModal(s)} className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg">إنذار</button>
                      <button onClick={() => { setSelectedStudentForReport(s); setShowReportModal(true); }} className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg">بلاغ</button>
                      <button onClick={() => { setSelectedStudentForMessage(s); setShowGeneralMessageModal(true); }} className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg">رسالة</button>
                      <button onClick={() => openClassSelection(s)} className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg">الشعبة</button>
                      <button onClick={() => handleResetStudent(s.id)} className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded-lg">إعادة تعيين</button>
                      <button onClick={() => handleDeleteStudentPermanently(s)} className="text-xs bg-red-600/30 text-red-200 border border-red-500/40 px-2 py-1 rounded-lg">حذف</button>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{s.isFrozen ? 'مجمد' : 'مفعل'}</span>
                        <div onClick={() => toggleFreezeStudent(s)} className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${s.isFrozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                          <div className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${s.isFrozen ? 'translate-x-0' : 'translate-x-5'}`} />
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

      {showWarningModal && selectedStudentForWarning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowWarningModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-yellow-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-300 mb-4"><FaExclamationTriangle className="inline-block me-2" /> إصدار إنذار</h3>
            <p className="text-gray-300 text-sm mb-2">الطالب: <strong>{selectedStudentForWarning.name}</strong></p>
            <div className="space-y-4">
              <textarea className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white resize-none" placeholder="اكتب وصف المخالفة..." value={warningDescription} onChange={(e) => setWarningDescription(e.target.value)} />
              <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/20 text-xs text-yellow-300">
                سيتم حفظ طلب الإنذار وإرساله رسمياً إلى ولي الأمر بعد مراجعة واعتماد <strong>مدير النظام</strong>.
              </div>
              <div className="flex gap-3">
                <button onClick={confirmWarning} className="btn-primary bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-md text-white">حفظ الطلب</button>
                <button onClick={() => setShowWarningModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4"><FaPlus className="inline-block me-2" /> إضافة طالب</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <input type="text" placeholder="الاسم الكامل *" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required />
              <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentGender} onChange={e => setNewStudentGender(e.target.value)} required>
                <option value="">الجنس *</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
              <input type="text" placeholder="العمر *" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentAge} onChange={e => setNewStudentAge(e.target.value)} required />
              <input type="text" placeholder="رقم الهاتف *" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentPhone} onChange={e => setNewStudentPhone(e.target.value)} required />
              <select multiple className="bg-gray-800 w-full h-24 text-right p-2 border border-gray-600 rounded-md text-white" value={newStudentClassIds} onChange={(e) => setNewStudentClassIds(Array.from(e.target.selectedOptions).map(o => o.value))} required>
                {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
              </select>
              <p className="text-xs text-gray-400">اضغط Ctrl لاختيار عدة شعب</p>
              <button type="submit" disabled={studentLoading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-md text-white">
                {studentLoading ? 'جاري...' : 'إضافة'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showGeneralMessageModal && selectedStudentForMessage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGeneralMessageModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-green-300 mb-4"><FaPaperPlane className="inline-block me-2" /> رسالة إلى {selectedStudentForMessage.name}</h3>
            <div className="space-y-3">
              <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" placeholder="الموضوع" value={generalMessageSubject} onChange={(e) => setGeneralMessageSubject(e.target.value)} />
              <textarea className="bg-gray-800 w-full h-32 text-right p-2 border border-gray-600 rounded-md text-white resize-none" placeholder="نص الرسالة..." value={generalMessageText} onChange={(e) => setGeneralMessageText(e.target.value)} />
              <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-xs text-blue-200">
                📨 سيتم حفظ الرسالة كطلب معلّق، ولن تُرسل إلى ولي الأمر إلا بعد اعتماد <strong>مدير النظام</strong>.
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveGeneralMessage} className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-2 rounded-md text-white"><FaPaperPlane className="inline-block me-2" /> حفظ الطلب</button>
                <button onClick={() => setShowGeneralMessageModal(false)} className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-2 rounded-md text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showClassSelectionModal && selectedStudentForClass && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowClassSelectionModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">تحديد شعبة الطالب</h3>
            <p className="text-gray-300 text-sm mb-3">{selectedStudentForClass.name}</p>
            {classes.map(cls => (
              <label key={cls.id} className="flex items-center gap-2 text-gray-200 mb-2">
                <input type="checkbox" checked={tempClassIds.includes(cls.id)} onChange={(e) => {
                  if (e.target.checked) setTempClassIds([...tempClassIds, cls.id]);
                  else setTempClassIds(tempClassIds.filter(id => id !== cls.id));
                }} />
                {cls.name}
              </label>
            ))}
            <div className="flex gap-3 mt-4">
              <button onClick={saveClassSelection} className="btn-primary bg-green-600 px-4 py-2 rounded-md text-white">حفظ</button>
              <button onClick={() => setShowClassSelectionModal(false)} className="btn-primary bg-gray-600 px-4 py-2 rounded-md text-white">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && selectedReviewStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowReviewModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-blue-500/30" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4"><FaClipboardList className="inline-block me-2" /> مراجعة طلب التعديل</h3>
            <p className="text-gray-300 text-sm mb-3">الطالب: <strong>{selectedReviewStudent.name}</strong></p>
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 text-xs text-amber-200 mb-3">
              ⚠️ إشعار الموافقة/الرفض سيُرسل لولي الأمر بعد اعتماد <strong>مدير النظام</strong>.
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => acceptReview(selectedReviewStudent.id)} className="btn-primary bg-green-600 px-6 py-2 rounded-md text-white"><FaCheckCircle className="inline-block me-2" /> قبول</button>
              <button onClick={() => rejectReview(selectedReviewStudent.id)} className="btn-primary bg-red-600 px-6 py-2 rounded-md text-white"><FaTimesCircle className="inline-block me-2" /> رفض</button>
              <button onClick={() => setShowReviewModal(false)} className="btn-primary bg-gray-600 px-6 py-2 rounded-md text-white">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {showAddNotificationModal && newlyAddedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-green-500/30">
            <h3 className="text-xl font-semibold text-green-300 mb-2 text-center"><FaCheckCircle className="inline-block me-2" /> تم تسجيل الطالب</h3>
            <p className="text-gray-300 text-center mb-4">تم إضافة {newlyAddedStudent.name} بنجاح.</p>
            <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 text-xs text-amber-200 mb-3">
              📨 سيتم حفظ طلب إرسال بيانات التفعيل لولي الأمر، ولن يُرسل إلا بعد اعتماد <strong>مدير النظام</strong>.
            </div>
            <button onClick={handleSaveActivationRequest} className="btn-primary bg-green-600 hover:bg-green-700 w-full py-3 rounded-md text-white">
              <FaPaperPlane className="inline-block me-2" /> حفظ طلب إرسال بيانات التفعيل
            </button>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-300"><FaBell className="inline-block me-2" /> الإشعارات</h3>
              <button onClick={handleCloseNotifications} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <p className="text-xs text-gray-500 mb-3">📌 ستُحذف هذه الإشعارات تلقائياً عند إغلاق النافذة.</p>
            {!notificationsActive && (
              <div className="mb-4 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-200 text-sm">
                ⚠️ الإشعارات غير مفعلة. اضغط على زر الجرس لتفعيلها.
              </div>
            )}
            {notifications.length === 0 ? (
              <p className="text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl border bg-gray-800/60 border-blue-500/40">
                    <div className="flex justify-between items-start">
                      <h4 className="text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-gray-400">
                        {n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 mt-1">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ChoiceModal isOpen={showAssignmentChoice} onClose={() => { setShowAssignmentChoice(false); setSelectedAssignmentType(null); }} onSelect={(type) => { setSelectedAssignmentType(type); setShowAssignmentChoice(false); setShowAssignmentModal(true); }} title="نوع الواجب" options={[{ value: 'now', label: 'نشر فوراً' }, { value: 'schedule', label: 'جدولة' }, { value: 'draft', label: 'حفظ كمسودة' }, { value: 'delay', label: 'نشر بعد وقت' }]} />
      <ChoiceModal isOpen={showLessonChoice} onClose={() => { setShowLessonChoice(false); setSelectedLessonType(null); }} onSelect={(type) => { setSelectedLessonType(type); setShowLessonChoice(false); setShowLessonModal(true); }} title="إدارة المواعيد" options={[{ value: 'manage', label: 'إضافة / تعديل المواعيد ' }]} />

      <AddAssignmentModal isOpen={showAssignmentModal} onClose={() => { setShowAssignmentModal(false); setSelectedAssignmentType(null); }} onSubmit={saveHomeworkFromModal} classesList={classes} initialMode={selectedAssignmentType || 'now'} />
      <AddLessonModal isOpen={showLessonModal} onClose={() => { setShowLessonModal(false); setSelectedLessonType(null); }} onSubmit={saveLessonTimesFromModal} initialTimes={lessonTimes} classesList={classes} />
    </div>
  );
};

export default TeacherPanel;