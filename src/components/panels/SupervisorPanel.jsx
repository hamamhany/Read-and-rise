import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaBell, FaSignOutAlt, FaBullhorn, FaPlus, FaEdit, FaTrashAlt,
  FaSpinner, FaUpload, FaClock, FaUsers, FaGraduationCap, FaUserCog,
  FaChalkboardTeacher, FaLayerGroup, FaFolder, FaFolderOpen, FaChevronLeft,
  FaHome, FaTimes, FaCheckSquare, FaSquare, FaCheckCircle, FaTimesCircle,
  FaClipboardCheck, FaArrowLeft, FaUserGraduate, FaUserTie,
  FaLayerGroup as FaLayers
} from 'react-icons/fa';
import { db, secondaryAuth, messaging } from '../../firebase';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
  serverTimestamp, writeBatch, getDocs, where, setDoc, arrayUnion,
  runTransaction, getDoc
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getToken, onMessage } from 'firebase/messaging';
import {
  createGeneralAnnouncement, updateAnnouncement, deleteAnnouncement,
  createTargetedAnnouncement, moderateAnnouncementContent
} from '../../services/announcements';
import { createMessageRequest } from '../../services/messageRequests';
import {
  validateStudentEligibility, filterClassesForSupervisor, getClassGenderLabel,
  purgeClassesWithoutSection, getAllowedClassGenders
} from '../../services/classes';
import {
  subscribeToPendingStudentChanges, approveStudentChanges, rejectStudentChanges
} from '../../services/supervisor';
import {
  ANNOUNCEMENTS_LIMIT, MESSAGE_REQUEST_TYPES, PENDING_FIELD_LABELS,
  ANNOUNCEMENT_AUDIENCE, ANNOUNCEMENT_AUDIENCE_LABELS
} from '../../constants';
import {
  sanitizeInput, arabicToEnglishNumber, generateId, fetchClassNames,
  formatSerial, generateNextSerialNumber
} from '../../utils/helpers';
import ReportsReviewSection from './ReportsReviewSection';
import ReviewVotingSection from './ReviewVotingSection';
import ResetRequestsSection from './ResetRequestsSection';
import SupportTicketsSection from './SupportTicketsSection';
import SectionsManagerModal from './SectionsManagerModal';
import StudentSerialManagerModal from './StudentSerialManagerModal';
import TeachersManagerModal from './TeachersManagerModal';
import { useConfirm, usePrompt } from '../common/ConfirmContext';

const ClassTreePickerModal = ({ isOpen, onClose, sections, classes, selectedIds, onConfirm, allowedGenders }) => {
  const [currentId, setCurrentId] = useState(null);
  const [tempSelected, setTempSelected] = useState(selectedIds);

  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedIds || []);
      setCurrentId(null);
    }
    // eslint-disable-next-line
  }, [isOpen]);

  if (!isOpen) return null;

  const current = sections.find(s => s.id === currentId) || null;
  const subSections = sections.filter(s => (s.parentId || null) === currentId);
  const currentClasses = currentId
    ? classes.filter(c =>
        c.sectionId === currentId &&
        (!allowedGenders || !c.gender || allowedGenders.includes(c.gender))
      )
    : [];

  const breadcrumb = [];
  {
    let node = current;
    let guard = 0;
    while (node && guard < 30) {
      breadcrumb.unshift(node);
      const pid = node.parentId;
      node = pid ? sections.find(s => s.id === pid) : null;
      guard++;
    }
  }

  const toggleClass = (id) => {
    setTempSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectedInfo = tempSelected.map(id => classes.find(c => c.id === id)).filter(Boolean);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
              <FaGraduationCap className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-white">اختيار الشعب</h3>
              <p className="text-xs text-gray-400">{tempSelected.length} شعبة مختارة</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl flex-shrink-0"><FaTimes /></button>
        </div>

        <div className="px-5 py-3 border-b border-gray-700 flex flex-wrap items-center gap-1 text-sm">
          {current ? (
            <>
              <button onClick={() => setCurrentId(null)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-gray-300 hover:bg-gray-800">
                <FaHome /> الرئيسية
              </button>
              {breadcrumb.map((node, i) => (
                <React.Fragment key={node.id}>
                  <FaChevronLeft className="text-gray-600 text-xs" />
                  <button onClick={() => setCurrentId(node.id)}
                    className={`px-2 py-1 rounded-lg ${i === breadcrumb.length - 1 ? 'text-blue-300 font-bold' : 'text-gray-300 hover:bg-gray-800'}`}>
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-blue-300 font-bold"><FaHome /> الرئيسية</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {subSections.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">{current ? 'الأقسام الفرعية' : 'الأقسام الرئيسية'} ({subSections.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {subSections.map(sec => (
                  <button key={sec.id} onClick={() => setCurrentId(sec.id)}
                    className="text-right p-3 bg-black/30 hover:bg-black/50 rounded-xl border border-gray-700 hover:border-blue-500/50 transition flex items-center gap-3">
                    <FaFolder className="text-amber-400 text-2xl flex-shrink-0" />
                    <span className="flex-1 text-white text-sm truncate">{sec.name}</span>
                    <FaChevronLeft className="text-gray-500 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {current && currentClasses.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">الشعب ({currentClasses.length})</p>
              <div className="space-y-2">
                {currentClasses.map(cls => {
                  const isSelected = tempSelected.includes(cls.id);
                  return (
                    <button key={cls.id} onClick={() => toggleClass(cls.id)}
                      className={`w-full p-3 rounded-xl border flex items-center gap-3 transition ${
                        isSelected ? 'bg-blue-500/20 border-blue-500' : 'bg-black/30 border-gray-700 hover:border-blue-500/40'
                      }`}>
                      {isSelected
                        ? <FaCheckSquare className="text-blue-400 text-xl flex-shrink-0" />
                        : <FaSquare className="text-gray-500 text-xl flex-shrink-0" />}
                      <div className="flex-1 text-right min-w-0">
                        <p className="text-white text-sm font-bold truncate">{cls.name}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{getClassGenderLabel(cls.gender)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {subSections.length === 0 && (!current || currentClasses.length === 0) && (
            <div className="text-center py-10 text-gray-400">
              <FaFolderOpen className="text-5xl mx-auto mb-3 text-gray-600" />
              <p>{current ? 'لا توجد شعب في هذا القسم' : 'لا توجد أقسام'}</p>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-700 space-y-3">
          {selectedInfo.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">الشعب المختارة ({selectedInfo.length}):</p>
              <div className="flex flex-wrap gap-1">
                {selectedInfo.map(c => (
                  <span key={c.id} className="text-xs bg-blue-500/20 text-blue-200 px-2 py-1 rounded border border-blue-500/30">{c.name}</span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm">إلغاء</button>
            <button onClick={() => { onConfirm(tempSelected); onClose(); }} disabled={tempSelected.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold">
              تأكيد ({tempSelected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SupervisorPanel = ({ user, onLogout }) => {
  const confirm = useConfirm();
  const prompt = usePrompt();

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(ANNOUNCEMENTS_LIMIT);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationIdsAtOpen, setNotificationIdsAtOpen] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [charCount, setCharCount] = useState(0);
  const [publishType, setPublishType] = useState('now');
  const [delayHours, setDelayHours] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [delayError, setDelayError] = useState('');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);

  const [announcementAudience, setAnnouncementAudience] = useState(ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS);
  const [announcementTargetClasses, setAnnouncementTargetClasses] = useState([]);
  const [showAnnouncementClassPicker, setShowAnnouncementClassPicker] = useState(false);
  const [moderating, setModerating] = useState(false);

  const [classes, setClasses] = useState([]);
  const [classVisibility, setClassVisibility] = useState('all');
  const [sections, setSections] = useState([]);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGender, setNewStudentGender] = useState('');
  const [newStudentAge, setNewStudentAge] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentClassIds, setNewStudentClassIds] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [showClassPicker, setShowClassPicker] = useState(false);

  const [pendingChanges, setPendingChanges] = useState([]);
  const [showPendingChangesModal, setShowPendingChangesModal] = useState(false);
  const [selectedPendingChange, setSelectedPendingChange] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingChange, setProcessingChange] = useState(false);

  const [showClassesManager, setShowClassesManager] = useState(false);
  const [showSerialManager, setShowSerialManager] = useState(false);
  const [showTeachersManager, setShowTeachersManager] = useState(false);

  const [permissions, setPermissions] = useState({ reports: true, resets: true, support: true });
  const [counts, setCounts] = useState({ reports: 0, resets: 0, support: 0 });
  const [hasReportsForMe, setHasReportsForMe] = useState(false);

  useEffect(() => {
    const fetchPerms = async () => {
      const snap = await getDoc(doc(db, 'profiles', user.id));
      if (snap.exists()) {
        const data = snap.data();
        if (data.permissions) setPermissions(data.permissions);
        setClassVisibility(data.classVisibility || 'all');
      }
    };
    fetchPerms();
  }, [user.id]);

  useEffect(() => {
    if (!permissions.support) return;
    const q = query(collection(db, 'supportTickets'), where('status', '==', 'open'));
    const unsub = onSnapshot(q, (snap) => setCounts(prev => ({ ...prev, support: snap.size })));
    return () => unsub();
  }, [permissions.support]);

  useEffect(() => {
    if (!permissions.reports) return;
    const q = query(collection(db, 'messageRequests'), where('type', '==', 'report'));
    const unsub = onSnapshot(q, (snap) => {
      const CLAIM_MS = 10 * 60 * 1000;
      const now = Date.now();
      const pending = snap.docs.filter(d => {
        const data = d.data();
        const status = data.reportStatus || data.status || 'pending';
        return status === 'pending';
      });
      const mine = pending.filter(d => {
        const data = d.data();
        if (!data.claimedBy || data.claimedBy === user.id) return true;
        const claimedMs = data.claimedAt?.toMillis?.() || 0;
        return !claimedMs || now - claimedMs >= CLAIM_MS;
      });
      setCounts(prev => ({ ...prev, reports: pending.length }));
      setHasReportsForMe(mine.length > 0);
    });
    return () => unsub();
  }, [permissions.reports, user.id]);

  useEffect(() => {
    if (!permissions.resets) return;
    const q = query(collection(db, 'passwordResetRequests'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snap) => setCounts(prev => ({ ...prev, resets: snap.size })));
    return () => unsub();
  }, [permissions.resets]);

  useEffect(() => {
    const unsub = subscribeToPendingStudentChanges(setPendingChanges);
    return () => unsub();
  }, []);

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
      if (permission === 'denied') { toast.error('الإشعارات محظورة من إعدادات المتصفح'); return false; }
      if (permission === 'default') { permission = await Notification.requestPermission(); }
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
      } catch (e) { return true; }
      if (token) {
        try { await updateDoc(doc(db, 'profiles', user.id), { fcmTokens: arrayUnion(token) }); }
        catch (e) { console.warn('Save token failed:', e.message); }
      }
      return true;
    } catch (err) { console.error('Notification error:', err); return false; }
  };

  useEffect(() => {
    if (!messaging) return;
    try {
      const unsubscribe = onMessage(messaging, (payload) => {
        toast.custom(() => (
          <div className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white p-4 rounded-xl border border-purple-300 dark:border-purple-500 shadow-xl max-w-sm mx-auto">
            <strong className="block text-lg">{payload.notification?.title}</strong>
            <p className="text-sm text-slate-700 dark:text-gray-200">{payload.notification?.body}</p>
          </div>
        ), { duration: 5000 });
      });
      return () => unsubscribe();
    } catch (err) { console.warn('onMessage setup failed:', err); }
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = new Date();
      const filtered = list.filter(item => {
        if (item.status === 'rejected') return false;
        if (item.status === 'scheduled') {
          if (!item.scheduledFor) return false;
          const scheduled = new Date(item.scheduledFor.seconds * 1000);
          return scheduled > now;
        }
        return true;
      });
      setAnnouncements(filtered);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    purgeClassesWithoutSection().catch(e => console.warn('purge classes failed:', e));
    const qClasses = query(collection(db, 'classes'));
    const unsubClasses = onSnapshot(qClasses, (snapshot) => {
      setClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(c => c.sectionId));
    });
    const unsubSections = onSnapshot(collection(db, 'sections'), (snapshot) => {
      setSections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')));
    });
    return () => { unsubClasses(); unsubSections(); };
  }, []);

  useEffect(() => {
    if (!user) return;
    const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
    const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
    const unsubscribeNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });
    return () => unsubscribeNotif();
  }, [user]);

  const handleCreateAnnouncement = async () => {
    const title = sanitizeInput(announcementTitle);
    const body = sanitizeInput(announcementBody);
    if (!title || !body) { toast.error('يرجى إدخال العنوان والمحتوى.'); return; }
    if (body.length > 10000) { toast.error('نص الإشعار طويل جداً (الحد الأقصى 10000 حرف).'); return; }

    if (!editingAnnouncementId && announcementAudience === ANNOUNCEMENT_AUDIENCE.CLASSES && announcementTargetClasses.length === 0) {
      toast.error('اختر شعبة واحدة على الأقل للجمهور "شعب محددة"');
      return;
    }

    let scheduledFor = null;
    if (publishType === 'schedule') {
      const hoursNum = parseInt(arabicToEnglishNumber(delayHours));
      const minutesNum = parseInt(arabicToEnglishNumber(delayMinutes));
      if (isNaN(hoursNum) || hoursNum < 0 || isNaN(minutesNum) || minutesNum < 0 || minutesNum > 59) {
        setDelayError('يرجى إدخال عدد ساعات صحيح (0-24) ودقائق بين 0 و 59');
        return;
      }
      if (hoursNum === 0 && minutesNum === 0) { setDelayError('يرجى إدخال وقت أكبر من صفر'); return; }
      if (hoursNum > 24) { setDelayError('الحد الأقصى للتأخير هو 24 ساعة.'); return; }
      setDelayError('');
      scheduledFor = new Date(Date.now() + hoursNum * 3600000 + minutesNum * 60000);
    }

    setModerating(true);
    try {
      if (editingAnnouncementId) {
        const updates = {
          title, body, scheduledFor: scheduledFor || null,
          status: 'pending_approval', updatedAt: serverTimestamp()
        };
        await updateAnnouncement(editingAnnouncementId, updates);
        toast.success('تم تحديث الإعلان. سيراجعه المدير قبل النشر.');
      } else {
        toast.loading('جاري فحص المحتوى بواسطة سند...', { id: 'sanad' });
        const moderationResult = await moderateAnnouncementContent(title, body);
        toast.dismiss('sanad');

        await createTargetedAnnouncement({
          title, body, scheduledFor,
          requestedBy: user.id,
          requestedByName: user.name || user.username || 'مشرف',
          requestedByRole: 'supervisor',
          audience: announcementAudience,
          targetClassIds: announcementAudience === ANNOUNCEMENT_AUDIENCE.CLASSES ? announcementTargetClasses : [],
          moderationResult
        });

        if (moderationResult.safe && !moderationResult.error) {
          toast.success(scheduledFor
            ? '✅ المحتوى آمن — سيُنشر في الموعد المحدد'
            : '✅ المحتوى آمن — تم النشر');
        } else {
          toast.success('✅ تم إرسال الإعلان للمدير للمراجعة');
        }
      }
      setAnnouncementTitle(''); setAnnouncementBody(''); setCharCount(0);
      setPublishType('now'); setDelayHours(''); setDelayMinutes('');
      setDelayError(''); setEditingAnnouncementId(null); setShowAnnouncementModal(false);
      setAnnouncementAudience(ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS);
      setAnnouncementTargetClasses([]);
    } catch (err) {
      toast.dismiss('sanad');
      toast.error('فشل حفظ الإعلان: ' + err.message);
    } finally {
      setModerating(false);
    }
  };

  const handleEditAnnouncement = (item) => {
    setEditingAnnouncementId(item.id);
    setAnnouncementTitle(item.title);
    setAnnouncementBody(item.body);
    setCharCount(item.body.length);
    setAnnouncementAudience(item.audience || ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS);
    setAnnouncementTargetClasses(item.targetClassIds || []);
    if (item.status === 'scheduled' && item.scheduledFor) {
      setPublishType('schedule');
      const scheduled = new Date(item.scheduledFor.seconds * 1000);
      const diff = (scheduled - new Date()) / 60000;
      setDelayHours(Math.floor(diff / 60).toString());
      setDelayMinutes(Math.floor(diff % 60).toString());
    } else {
      setPublishType('now'); setDelayHours(''); setDelayMinutes('');
    }
    setShowAnnouncementModal(true);
  };

  const handleDeleteAnnouncement = async (id) => {
    const ok = await confirm('حذف الإعلان', 'هل أنت متأكد من حذف هذا الإعلان نهائياً؟');
    if (!ok) return;
    try { await deleteAnnouncement(id); toast.success('تم حذف الإعلان.'); }
    catch (err) { toast.error('فشل حذف الإعلان: ' + err.message); }
  };

  const handleLoadMore = () => {
    setIsLoadingMore(true);
    setTimeout(() => { setDisplayCount(prev => prev + ANNOUNCEMENTS_LIMIT); setIsLoadingMore(false); }, 800);
  };

  const handleAnnouncementClick = (item) => { setSelectedAnnouncement(item); setShowDetailsModal(true); };

  const handleOpenNotifications = () => {
    setNotificationIdsAtOpen(notifications.map(n => n.id));
    setShowNotificationsModal(true);
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      requestNotificationPermission().catch(err => console.warn('Notification request failed:', err));
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
    } catch (err) { console.warn('فشل حذف الإشعارات:', err); }
    setNotificationIdsAtOpen([]);
  };

  const handleApproveChanges = async () => {
    if (!selectedPendingChange) return;
    const ok = await confirm('الموافقة على التعديلات', `سيتم تطبيق تعديلات الطالب "${selectedPendingChange.name}" على ملفه. متابعة؟`);
    if (!ok) return;
    setProcessingChange(true);
    try {
      await approveStudentChanges(selectedPendingChange.id, user.id, user.name || user.username || 'مشرف');
      toast.success('✅ تم اعتماد التعديلات وتطبيقها');
      setSelectedPendingChange(null);
      setRejectionReason('');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setProcessingChange(false);
    }
  };

  const handleRejectChanges = async () => {
    if (!selectedPendingChange) return;
    setProcessingChange(true);
    try {
      await rejectStudentChanges(selectedPendingChange.id, rejectionReason.trim(), user.id, user.name || user.username || 'مشرف');
      toast.success('تم رفض التعديلات وإبلاغ الطالب');
      setSelectedPendingChange(null);
      setRejectionReason('');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setProcessingChange(false);
    }
  };

  const generateNextUsernameNumber = async () => {
    const counterRef = doc(db, 'settings', 'userCounter');
    try {
      let nextNumber = 1;
      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        if (!counterSnap.exists()) {
          transaction.set(counterRef, { lastStudentNumber: 1 });
          nextNumber = 1;
        } else {
          const current = counterSnap.data().lastStudentNumber || 0;
          nextNumber = current + 1;
          transaction.update(counterRef, { lastStudentNumber: nextNumber });
        }
      });
      return nextNumber;
    } catch (error) {
      console.error("Counter transaction failed: ", error);
      throw new Error('فشل في توليد رقم مستخدم جديد، يرجى المحاولة مرة أخرى');
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (newStudentClassIds.length === 0) return toast.error('يرجى اختيار شعبة واحدة على الأقل.');

    const sanitizedName = sanitizeInput(newStudentName);
    const sanitizedGender = sanitizeInput(newStudentGender);
    const sanitizedAge = sanitizeInput(arabicToEnglishNumber(newStudentAge));
    const sanitizedPhone = sanitizeInput(arabicToEnglishNumber(newStudentPhone));

    if (!sanitizedName || !sanitizedGender || !sanitizedAge || !sanitizedPhone) {
      return toast.error('جميع الحقول المطلوبة يجب تعبئتها.');
    }

    const phoneDigits = sanitizedPhone.replace(/[^\d]/g, '');
    const normalizedPhone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;
    if (normalizedPhone.startsWith('0')) {
      return toast.error('يرجى إدخال رقم الهاتف مع رمز الدولة بدون صفر بادئ.', { duration: 7000 });
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      return toast.error('رقم الهاتف غير صالح. يرجى إدخال الرقم مع رمز الدولة (10 إلى 15 رقماً).', { duration: 7000 });
    }

    setStudentLoading(true);
    try {
      const classDocs = await Promise.all(newStudentClassIds.map(id => getDoc(doc(db, 'classes', id))));
      for (const classDoc of classDocs) {
        if (!classDoc.exists()) continue;
        const classData = classDoc.data();
        const result = validateStudentEligibility({ gender: sanitizedGender, age: parseInt(sanitizedAge) }, classData);
        if (!result.ok) {
          toast.error(`الشعبة "${classData.name}": ${result.reason}`, { duration: 8000 });
          setStudentLoading(false);
          return;
        }
      }

      const startNumber = await generateNextUsernameNumber();
      const nextSerial = await generateNextSerialNumber();
      const serialNumber = formatSerial(nextSerial);

      let currentNum = startNumber;
      let newUsername = `knight${currentNum}`;
      let tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      let email = `${newUsername}@readandrise.com`;
      let userCredential = null;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
          break;
        } catch (error) {
          if (error.code === 'auth/email-already-in-use') {
            currentNum++;
            newUsername = `knight${currentNum}`;
            email = `${newUsername}@readandrise.com`;
            attempts++;
          } else { throw error; }
        }
      }
      if (!userCredential) throw new Error('تعذر إيجاد اسم مستخدم فريد.');

      const firebaseUser = userCredential.user;
      await signOut(secondaryAuth);
      const newId = generateId();
      const ageNum = parseInt(sanitizedAge);

      await setDoc(doc(db, 'profiles', newId), {
        email, username: newUsername, name: sanitizedName, gender: sanitizedGender,
        age: ageNum, phone: normalizedPhone, classIds: newStudentClassIds, role: 'student',
        serialNumber, country: '',
        isFrozen: false, infoVerified: false, isProfileComplete: false,
        pendingChanges: null, pendingChangesStatus: null,
        reviewResult: null, reviewExpiry: null,
        warnings: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        uid: firebaseUser.uid
      });

      const classMap = await fetchClassNames(newStudentClassIds);
      const classNames = newStudentClassIds.map(id => classMap[id] || null).filter(Boolean);

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.ACTIVATION,
        targetType: 'student',
        targetId: newId,
        targetName: sanitizedName,
        targetPhone: normalizedPhone,
        targetClass: classNames.join(', ') || 'غير محدد',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: { username: newUsername, password: tempPassword, age: ageNum, gender: sanitizedGender, serialNumber }
      });

      toast.success(`✅ تم إنشاء حساب الطالب باسم: ${newUsername} — التسلسلي: ${serialNumber}`);
      setNewStudentName(''); setNewStudentGender(''); setNewStudentAge('');
      setNewStudentPhone(''); setNewStudentClassIds([]);
      setShowAddStudentModal(false);
    } catch (err) {
      toast.error('فشل إضافة الطالب: ' + (err.message || 'خطأ غير معروف'));
    } finally {
      setStudentLoading(false);
    }
  };

  if (loading) return <div className="text-center text-slate-500 dark:text-gray-400 p-8">جاري التحميل...</div>;

  const visibleAnnouncements = announcements.slice(0, displayCount);
  const hasMore = displayCount < announcements.length;
  const canPublish = user.canPublishAnnouncements !== false;

  const availableClasses = filterClassesForSupervisor(classes, user.gender, classVisibility);
  const allowedGenders = getAllowedClassGenders(user.gender, classVisibility);

  const selectedClassesNames = newStudentClassIds
    .map(id => classes.find(c => c.id === id)?.name)
    .filter(Boolean);

  const getAudienceBadge = (item) => {
    const aud = item.audience || 'all_students';
    const label = item.audienceLabel || ANNOUNCEMENT_AUDIENCE_LABELS[aud] || 'الجميع';
    const icons = {
      all_system: '🌐',
      all_students: '👥',
      all_teachers: '🎓',
      all_supervisors: '🛡️',
      classes: '🏫'
    };
    const colors = {
      all_system: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40',
      all_students: 'text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40',
      all_teachers: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40',
      all_supervisors: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40',
      classes: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40'
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[aud] || colors.all_students}`}>
        {icons[aud] || '📢'} {label}
        {aud === 'classes' && item.targetClassIds?.length > 0 && ` (${item.targetClassIds.length})`}
      </span>
    );
  };

  const getAnnouncementStatusBadge = (item) => {
    if (item.status === 'pending_approval') {
      return <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">⏳ بانتظار موافقة المدير</span>;
    }
    if (item.status === 'scheduled') {
      return <span className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/40 px-2 py-0.5 rounded-full">📅 مجدول</span>;
    }
    if (item.status === 'active') {
      return <span className="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded-full">✅ منشور</span>;
    }
    return null;
  };

  const renderPendingFields = (student) => {
    if (!student?.pendingChanges) return null;
    const entries = Object.entries(student.pendingChanges).filter(
      ([k]) => !['submittedAt', 'submittedBy', 'submittedByName'].includes(k)
    );
    return entries.map(([field, val]) => (
      <div key={field} className="bg-slate-50 dark:bg-gray-800/60 p-3 rounded-lg border border-slate-200 dark:border-gray-700">
        <p className="text-xs text-slate-500 dark:text-gray-400 mb-1 font-bold">{PENDING_FIELD_LABELS[field] || field}</p>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-1 rounded border border-red-300 dark:border-red-500/30">
            {val.from || '(فارغ)'}
          </span>
          <FaArrowLeft className="text-slate-400 dark:text-gray-500 text-xs" />
          <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded border border-green-300 dark:border-green-500/30 font-bold">
            {val.to || '(فارغ)'}
          </span>
        </div>
      </div>
    ));
  };

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-white/90 dark:bg-gray-900/80 p-8 max-w-4xl w-full space-y-6 z-10 border border-slate-200 dark:border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-200 dark:border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-green-700 dark:text-green-300">لوحة المشرف</h2>
            <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username || user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleOpenNotifications} className="relative bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-900 dark:text-white p-2 rounded-full text-2xl transition shadow-lg" title="الإشعارات">
              <FaBell />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{unreadCount}</span>}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {pendingChanges.length > 0 && (
          <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 p-6 rounded-2xl border-2 border-amber-400 dark:border-amber-500/40">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <FaClipboardCheck /> تعديلات بانتظار موافقتك ({pendingChanges.length})
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">طلاب عدّلوا بياناتهم وينتظرون قرارك</p>
              </div>
              <button onClick={() => setShowPendingChangesModal(true)} className="bg-amber-600 hover:bg-amber-700 text-white py-2 px-5 rounded-lg font-bold flex items-center gap-2">
                مراجعة التعديلات
              </button>
            </div>
          </div>
        )}

        <div className="bg-slate-50 dark:bg-gray-800/60 p-6 rounded-2xl border border-blue-300 dark:border-blue-500/20 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-xl font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <FaUsers /> إدارة الطلاب
            </h3>
            <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">يمكنك إضافة حسابات الطلاب الجدد من هنا.</p>
          </div>
          <button onClick={() => setShowAddStudentModal(true)} className="btn-primary bg-blue-600 hover:bg-blue-700 py-2 px-6 rounded-md text-white font-bold">
            <FaPlus className="inline-block me-2" /> إضافة طالب جديد
          </button>
        </div>

        <div className="bg-slate-50 dark:bg-gray-800/60 p-6 rounded-2xl border border-indigo-300 dark:border-indigo-500/20">
          <h3 className="text-xl font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 mb-3">
            <FaGraduationCap /> الشعب والمعلمين
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button onClick={() => setShowClassesManager(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
              <FaLayerGroup /> إدارة الشعب والأقسام
            </button>
            <button onClick={() => setShowTeachersManager(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
              <FaChalkboardTeacher /> إضافة معلم جديد
            </button>
            <button onClick={() => setShowSerialManager(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
              <FaUserCog /> إدارة الطلاب بالرقم التسلسلي
            </button>
          </div>
        </div>

        {permissions.reports && hasReportsForMe && <ReportsReviewSection user={user} />}
        <ReviewVotingSection user={user} />
        {permissions.resets && counts.resets > 0 && <ResetRequestsSection user={user} />}
        {permissions.support && <SupportTicketsSection user={user} />}

        {canPublish && (
          <div className="bg-slate-50 dark:bg-gray-800/60 p-6 rounded-2xl border border-blue-300 dark:border-blue-500/20">
            <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
              <h3 className="text-xl font-semibold text-blue-800 dark:text-blue-200">
                <FaBullhorn className="inline-block me-2" /> الإشعارات العامة
              </h3>
              <button
                onClick={() => {
                  setEditingAnnouncementId(null); setAnnouncementTitle(''); setAnnouncementBody('');
                  setCharCount(0); setPublishType('now'); setDelayHours(''); setDelayMinutes('');
                  setDelayError('');
                  setAnnouncementAudience(ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS);
                  setAnnouncementTargetClasses([]);
                  setShowAnnouncementModal(true);
                }}
                className="btn-primary bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm"
              >
                <FaPlus className="inline-block me-2" /> إشعار جديد
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 rounded-lg p-2 text-xs text-amber-800 dark:text-amber-200 mb-3">
              ℹ️ يتم فحص المحتوى تلقائياً بواسطة <strong>سند</strong>. إن كان آمناً يُنشر فوراً، وإلا يُرسل للمدير.
            </div>
            {announcements.length === 0 ? (
              <p className="text-slate-500 dark:text-gray-400 text-center py-4">لا توجد إشعارات حالياً.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {visibleAnnouncements.map((item) => (
                  <div key={item.id} className="p-4 bg-white dark:bg-black/30 rounded-xl border border-slate-200 dark:border-gray-700 cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-700/40 transition flex justify-between items-start" onClick={() => handleAnnouncementClick(item)}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-900 dark:text-white font-medium">{item.title}</span>
                        {getAudienceBadge(item)}
                        {getAnnouncementStatusBadge(item)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                        {item.createdAt?.toDate?.() ? new Date(item.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}
                      </div>
                    </div>
                    <div className="flex gap-1 mr-2">
                      <button onClick={(e) => { e.stopPropagation(); handleEditAnnouncement(item); }} className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 text-sm px-2 py-1"><FaEdit /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAnnouncement(item.id); }} className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 text-sm px-2 py-1"><FaTrashAlt /></button>
                    </div>
                  </div>
                ))}
                {hasMore && (
                  <button onClick={handleLoadMore} disabled={isLoadingMore} className="w-full py-2 text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition flex items-center justify-center gap-2">
                    {isLoadingMore ? <><FaSpinner className="animate-spin" /> جاري التحميل...</> : 'تحميل المزيد'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showPendingChangesModal && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowPendingChangesModal(false); setSelectedPendingChange(null); setRejectionReason(''); }}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-2xl w-full border border-amber-300 dark:border-amber-500/30 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <FaClipboardCheck /> مراجعة التعديلات
              </h3>
              <button onClick={() => { setShowPendingChangesModal(false); setSelectedPendingChange(null); setRejectionReason(''); }} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white text-2xl"><FaTimes /></button>
            </div>
            {!selectedPendingChange ? (
              <div className="space-y-3">
                {pendingChanges.length === 0 ? (
                  <p className="text-slate-500 dark:text-gray-400 text-center py-6">لا توجد تعديلات معلقة.</p>
                ) : pendingChanges.map(s => (
                  <button key={s.id} onClick={() => setSelectedPendingChange(s)} className="w-full p-4 bg-slate-50 dark:bg-black/30 rounded-xl border border-slate-200 dark:border-gray-700 hover:bg-slate-100 dark:hover:bg-gray-800/60 transition text-right flex justify-between items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 dark:text-white font-bold text-sm">{s.name || 'بدون اسم'}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">الرقم التسلسلي: <span dir="ltr">{s.serialNumber || '—'}</span></p>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                        {Object.keys(s.pendingChanges || {}).filter(k => !['submittedAt', 'submittedBy', 'submittedByName'].includes(k)).length} تعديل
                      </p>
                    </div>
                    <FaChevronLeft className="text-slate-400 dark:text-gray-500" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <button onClick={() => { setSelectedPendingChange(null); setRejectionReason(''); }} className="text-sm text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1">
                  <FaArrowLeft className="rotate-180" /> رجوع للقائمة
                </button>
                <div className="bg-slate-50 dark:bg-gray-800/60 p-4 rounded-xl border border-slate-200 dark:border-gray-700">
                  <p className="text-slate-900 dark:text-white font-bold mb-1">{selectedPendingChange.name || 'بدون اسم'}</p>
                  <p className="text-xs text-slate-500 dark:text-gray-400">الرقم التسلسلي: <span dir="ltr">{selectedPendingChange.serialNumber || '—'}</span></p>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">الجنس: {selectedPendingChange.gender || '—'} • العمر: {selectedPendingChange.age || '—'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-2">التعديلات المطلوبة:</h4>
                  <div className="space-y-2">{renderPendingFields(selectedPendingChange)}</div>
                </div>
                <div>
                  <label className="text-sm text-slate-700 dark:text-gray-300 block mb-1">سبب الرفض (اختياري):</label>
                  <textarea className="w-full bg-white dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white resize-none h-20 text-sm" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="اتركه فارغاً للموافقة..." />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleApproveChanges} disabled={processingChange} className="flex-1 min-w-[150px] bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
                    <FaCheckCircle /> {processingChange ? '...' : 'الموافقة وتطبيق'}
                  </button>
                  <button onClick={handleRejectChanges} disabled={processingChange} className="flex-1 min-w-[150px] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
                    <FaTimesCircle /> {processingChange ? '...' : 'رفض التعديلات'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-blue-300 dark:border-blue-500/30 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-700 dark:text-blue-300 mb-4"><FaPlus className="inline-block me-2" /> إضافة طالب جديد</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <input type="text" placeholder="الاسم الكامل *" className="bg-white dark:bg-gray-800 w-full text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required />
              <select className="bg-white dark:bg-gray-800 w-full text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={newStudentGender} onChange={e => setNewStudentGender(e.target.value)} required>
                <option value="">الجنس *</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
              <input type="text" inputMode="numeric" placeholder="العمر *" className="bg-white dark:bg-gray-800 w-full text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={newStudentAge} onChange={e => setNewStudentAge(arabicToEnglishNumber(e.target.value))} required />
              <input type="text" inputMode="numeric" placeholder="رقم الهاتف * (مع رمز الدولة بدون +)" className="bg-white dark:bg-gray-800 w-full text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={newStudentPhone} onChange={e => setNewStudentPhone(arabicToEnglishNumber(e.target.value))} required />

              <div>
                <label className="text-xs text-slate-500 dark:text-gray-400 mb-1 block">الشعب الدراسية *</label>
                <button
                  type="button"
                  onClick={() => setShowClassPicker(true)}
                  className="w-full py-2.5 rounded-md font-bold flex items-center justify-center gap-2 border-2 border-dashed border-indigo-400 dark:border-indigo-500/60 text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-500/5 hover:bg-indigo-100/70 dark:hover:bg-indigo-500/15 transition"
                >
                  <FaFolderOpen /> اختيار الشعب
                  {newStudentClassIds.length > 0 && (
                    <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px]">{newStudentClassIds.length}</span>
                  )}
                </button>
                {selectedClassesNames.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedClassesNames.map((name, i) => (
                      <span key={i} className="text-xs bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded border border-indigo-500/30">{name}</span>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={studentLoading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-md text-white">
                {studentLoading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showDetailsModal && selectedAnnouncement && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-300 dark:border-purple-500/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-purple-700 dark:text-purple-300">{selectedAnnouncement.title}</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white text-2xl">✕</button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {getAudienceBadge(selectedAnnouncement)}
              {getAnnouncementStatusBadge(selectedAnnouncement)}
            </div>
            <div className="text-slate-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">{selectedAnnouncement.body}</div>
          </div>
        </div>
      )}

      {showAnnouncementModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAnnouncementModal(false)}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-2xl w-full border border-yellow-300 dark:border-yellow-500/30 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-yellow-700 dark:text-yellow-300 mb-4">
              <FaBullhorn className="inline-block me-2" /> {editingAnnouncementId ? 'تعديل الإعلان' : 'إشعار جديد'}
            </h3>

            <div className="bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 rounded-lg p-2 text-xs text-amber-800 dark:text-amber-200 mb-3">
              ℹ️ يتم فحص المحتوى تلقائياً بواسطة <strong>سند</strong> قبل الإرسال.
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 dark:text-gray-300 mb-1">العنوان <span className="text-red-700 dark:text-red-400">*</span></label>
                <input type="text" className="w-full bg-white dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} required />
              </div>

              <div>
                <label className="block text-sm text-slate-700 dark:text-gray-300 mb-1">المحتوى <span className="text-red-700 dark:text-red-400">*</span></label>
                <textarea className="w-full bg-white dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white resize-none h-32" value={announcementBody} onChange={(e) => { if (e.target.value.length <= 10000) { setAnnouncementBody(e.target.value); setCharCount(e.target.value.length); } else { toast.error('الحد الأقصى 10000 حرف'); } }} required />
                <div className="text-xs text-slate-500 dark:text-gray-400 mt-1 text-left">{charCount} / 10000</div>
              </div>

              <div>
                <label className="block text-sm text-slate-700 dark:text-gray-300 mb-2">الجمهور المستهدف</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS, icon: FaUserGraduate, label: 'جميع الطلاب' },
                    { value: ANNOUNCEMENT_AUDIENCE.ALL_TEACHERS, icon: FaChalkboardTeacher, label: 'جميع المعلمين' },
                    { value: ANNOUNCEMENT_AUDIENCE.ALL_SUPERVISORS, icon: FaUserTie, label: 'جميع المشرفين' },
                    { value: ANNOUNCEMENT_AUDIENCE.CLASSES, icon: FaLayers, label: 'شعب محددة' }
                  ].map(opt => {
                    const Icon = opt.icon;
                    const selected = announcementAudience === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAnnouncementAudience(opt.value)}
                        className={`p-3 rounded-lg border-2 transition flex items-center gap-2 text-sm font-bold ${
                          selected
                            ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                            : 'border-slate-200 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:border-amber-400/50'
                        }`}
                      >
                        <Icon /> {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {announcementAudience === ANNOUNCEMENT_AUDIENCE.CLASSES && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAnnouncementClassPicker(true)}
                    className="w-full py-2.5 rounded-md font-bold flex items-center justify-center gap-2 border-2 border-dashed border-purple-400 dark:border-purple-500/60 text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-500/5 hover:bg-purple-100/70 dark:hover:bg-purple-500/15 transition"
                  >
                    <FaFolderOpen /> اختيار الشعب
                    {announcementTargetClasses.length > 0 && (
                      <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[22px]">{announcementTargetClasses.length}</span>
                    )}
                  </button>
                  {announcementTargetClasses.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {announcementTargetClasses.map(id => {
                        const cls = classes.find(c => c.id === id);
                        return cls ? <span key={id} className="text-xs bg-purple-500/15 text-purple-700 dark:text-purple-300 px-2 py-1 rounded border border-purple-500/30">{cls.name}</span> : null;
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-slate-700 dark:text-gray-300">
                  <input type="radio" value="now" checked={publishType === 'now'} onChange={() => setPublishType('now')} className="accent-yellow-500" />
                  <FaUpload className="inline-block me-1" /> نشر فوراً (بعد فحص سند)
                </label>
                <label className="flex items-center gap-2 text-slate-700 dark:text-gray-300">
                  <input type="radio" value="schedule" checked={publishType === 'schedule'} onChange={() => setPublishType('schedule')} className="accent-yellow-500" />
                  <FaClock className="inline-block me-1" /> نشر مجدول
                </label>
              </div>

              {publishType === 'schedule' && (
                <div className="flex flex-wrap gap-4 items-center">
                  <div><label className="block text-sm text-slate-700 dark:text-gray-300">ساعات</label><input type="text" inputMode="numeric" className="w-20 bg-white dark:bg-gray-800 text-center p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={delayHours} onChange={(e) => setDelayHours(arabicToEnglishNumber(e.target.value))} placeholder="0" /></div>
                  <div><label className="block text-sm text-slate-700 dark:text-gray-300">دقائق</label><input type="text" inputMode="numeric" className="w-20 bg-white dark:bg-gray-800 text-center p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white" value={delayMinutes} onChange={(e) => setDelayMinutes(arabicToEnglishNumber(e.target.value))} placeholder="0" /></div>
                  {delayError && <p className="text-red-700 dark:text-red-400 text-xs">{delayError}</p>}
                  <p className="text-xs text-slate-500 dark:text-gray-400">(الحد الأقصى 24 ساعة)</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleCreateAnnouncement}
                  disabled={moderating}
                  className="btn-primary bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 px-6 py-2 rounded-md text-white flex items-center gap-2"
                >
                  {moderating ? <><FaSpinner className="animate-spin" /> جاري الفحص...</> : (editingAnnouncementId ? 'إرسال للمراجعة' : 'فحص وإرسال')}
                </button>
                <button onClick={() => { setShowAnnouncementModal(false); setEditingAnnouncementId(null); setAnnouncementTitle(''); setAnnouncementBody(''); setCharCount(0); setPublishType('now'); setDelayHours(''); setDelayMinutes(''); setDelayError(''); setAnnouncementAudience(ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS); setAnnouncementTargetClasses([]); }} className="btn-primary bg-slate-200 dark:bg-gray-600 hover:bg-slate-300 dark:hover:bg-gray-700 px-6 py-2 rounded-md text-slate-900 dark:text-white">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNotificationsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleCloseNotifications}>
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-slate-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-purple-700 dark:text-purple-300"><FaBell className="inline-block me-2" /> الإشعارات</h3>
              <button onClick={handleCloseNotifications} className="text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white text-2xl">✕</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-gray-500 mb-3">📌 ستُحذف تلقائياً عند الإغلاق.</p>
            {notifications.length === 0 ? (
              <p className="text-slate-500 dark:text-gray-400 text-center py-4">لا توجد إشعارات</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3 rounded-xl border bg-slate-50 dark:bg-gray-800/60 border-blue-300 dark:border-blue-500/40">
                    <div className="flex justify-between items-start">
                      <h4 className="text-slate-900 dark:text-white font-medium">{n.title}</h4>
                      <span className="text-xs text-slate-500 dark:text-gray-400">{n.createdAt?.toDate?.() ? new Date(n.createdAt.toDate()).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' }) : ''}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-gray-300 mt-1">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <ClassTreePickerModal
        isOpen={showClassPicker}
        onClose={() => setShowClassPicker(false)}
        sections={sections}
        classes={availableClasses}
        selectedIds={newStudentClassIds}
        onConfirm={(ids) => setNewStudentClassIds(ids)}
        allowedGenders={allowedGenders}
      />

      <ClassTreePickerModal
        isOpen={showAnnouncementClassPicker}
        onClose={() => setShowAnnouncementClassPicker(false)}
        sections={sections}
        classes={availableClasses}
        selectedIds={announcementTargetClasses}
        onConfirm={(ids) => setAnnouncementTargetClasses(ids)}
        allowedGenders={allowedGenders}
      />

      <SectionsManagerModal isOpen={showClassesManager} onClose={() => setShowClassesManager(false)} user={user} mode="supervisor" />
      <StudentSerialManagerModal isOpen={showSerialManager} onClose={() => setShowSerialManager(false)} user={user} />
      <TeachersManagerModal isOpen={showTeachersManager} onClose={() => setShowTeachersManager(false)} user={user} />
    </div>
  );
};

export default SupervisorPanel;