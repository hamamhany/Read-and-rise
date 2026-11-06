import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaSignOutAlt, FaUserShield, FaExclamationTriangle, FaWhatsapp, 
  FaTimesCircle, FaUsers, FaTrashAlt, FaBell, FaPaperPlane, FaCheckCircle
} from 'react-icons/fa';
import { db } from '../../firebase';
import { 
  collection, query, onSnapshot, doc, deleteDoc, 
  serverTimestamp, orderBy, where, updateDoc
} from 'firebase/firestore';
import { createSupervisorAccount } from '../../services/supervisor';
import { requestNotificationPermission, setupOnMessageListener } from '../../utils/pushNotifications';
import { messaging } from '../../firebase';
import {
  MESSAGE_REQUEST_TYPE_LABELS,
  MESSAGE_REQUEST_STATUS
} from '../../constants';
import {
  updateMessageRequestStatus,
  deleteMessageRequest
} from '../../services/messageRequests';
import {
  sendWarningMessage,
  sendActivationMessage,
  sendFreezeMessage,
  sendResetPasswordMessage,
  sendDataUpdateApprovalMessage,
  sendDataUpdateRejectionMessage,
  sendGeneralMessageToStudent,
  sendReportMessage
} from '../../utils/whatsapp';

const SystemManagerPanel = ({ user, onLogout }) => {
  const [messageRequests, setMessageRequests] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && !!messaging
  );

  const [requestFilter, setRequestFilter] = useState('pending'); // all | pending | approved | rejected
  
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [newSupervisorGender, setNewSupervisorGender] = useState('');
  const [newSupervisorAge, setNewSupervisorAge] = useState('');
  const [newSupervisorPhone, setNewSupervisorPhone] = useState('');
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  useEffect(() => {
    const unsub = setupOnMessageListener((payload) => {
      toast.custom(() => (
        <div className="bg-gray-800 text-white p-4 rounded-xl border border-amber-500 shadow-xl max-w-sm mx-auto">
          <strong className="block text-lg">{payload.notification?.title}</strong>
          <p className="text-sm text-gray-200">{payload.notification?.body}</p>
        </div>
      ), { duration: 5000 });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const qRequests = query(
      collection(db, 'messageRequests'),
      orderBy('createdAt', 'desc')
    );
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setMessageRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qSupervisors = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
    const unsubSupervisors = onSnapshot(qSupervisors, (snapshot) => {
      setSupervisors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const qStudents = query(collection(db, 'profiles'), where('role', '==', 'student'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const notifRef = collection(db, 'notifications', user.id, 'userNotifications');
    const qNotif = query(notifRef, orderBy('createdAt', 'desc'));
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    });

    return () => { unsubRequests(); unsubSupervisors(); unsubStudents(); unsubNotif(); };
  }, [user.id]);

  const handleOpenNotifications = async () => {
    const ok = await requestNotificationPermission(user.id);
    setNotificationsActive(ok);
    setShowNotificationsModal(true);
  };

  const handleAddSupervisor = async (e) => {
    e.preventDefault();
    if (!newSupervisorName || !newSupervisorGender || !newSupervisorAge || !newSupervisorPhone) {
      toast.error('جميع الحقول مطلوبة.');
      return;
    }
    setSupervisorLoading(true);
    try {
      const result = await createSupervisorAccount(newSupervisorName, newSupervisorGender, newSupervisorAge, newSupervisorPhone, user.id);
      toast.success(`تم إضافة المشرف ${result.name}`);
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

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من حذف الطالب نهائياً؟')) return;
    try {
      await deleteDoc(doc(db, 'profiles', studentId));
      toast.success('تم حذف الطالب.');
    } catch (err) {
      toast.error('فشل حذف الطالب: ' + err.message);
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
      toast.success(nextStatus ? 'تم تجميد الطالب.' : 'تم فك التجميد.');
    } catch (err) {
      toast.error('فشل تحديث الحالة: ' + err.message);
    }
  };

  // ✅ إرسال الطلب عبر واتساب (خاص بمدير النظام فقط)
  const handleSendRequest = async (request) => {
    try {
      const studentObj = {
        name: request.targetName || '',
        phone: request.targetPhone || '',
        classes: request.targetClass
          ? request.targetClass.split(', ').map(n => ({ name: n }))
          : [],
        age: request.payload?.age,
        gender: request.payload?.gender,
        username: request.payload?.username || ''
      };

      switch (request.type) {
        case 'warning':
          sendWarningMessage(studentObj, request.payload.warningNumber, request.payload.description);
          break;
        case 'general':
          sendGeneralMessageToStudent(studentObj, request.payload.subject, request.payload.body);
          break;
        case 'report':
          sendReportMessage(studentObj, request.payload.reason, request.targetClass);
          break;
        case 'freeze':
          sendFreezeMessage(studentObj);
          break;
        case 'reset_password':
          sendResetPasswordMessage(studentObj, request.payload.newPassword);
          break;
        case 'activation':
          sendActivationMessage(studentObj, request.payload.username, request.payload.password);
          break;
        case 'data_update_approval':
          sendDataUpdateApprovalMessage(studentObj, {});
          break;
        case 'data_update_rejection':
          sendDataUpdateRejectionMessage(studentObj, request.payload?.reason);
          break;
        case 'delete':
          // في حال تفعيلها مستقبلاً
          break;
        default:
          toast.error('نوع طلب غير معروف.');
          return;
      }

      await updateMessageRequestStatus(request.id, MESSAGE_REQUEST_STATUS.APPROVED, user.id);
      toast.success('✅ تم الإرسال واعتماد الطلب.');
    } catch (err) {
      toast.error('فشل إرسال الطلب: ' + err.message);
    }
  };

  const handleRejectRequest = async (requestId) => {
    const reason = window.prompt('سبب الرفض (اختياري):', '') || '';
    try {
      await updateMessageRequestStatus(requestId, MESSAGE_REQUEST_STATUS.REJECTED, user.id, reason);
      toast.success('تم رفض الطلب.');
    } catch (err) {
      toast.error('فشل الرفض: ' + err.message);
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟')) return;
    try {
      await deleteMessageRequest(requestId);
      toast.success('تم حذف الطلب.');
    } catch (err) {
      toast.error('فشل الحذف: ' + err.message);
    }
  };

  const filteredRequests = messageRequests.filter(r => {
    if (requestFilter === 'all') return true;
    return r.status === requestFilter;
  });

  const pendingCount = messageRequests.filter(r => r.status === 'pending').length;

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>;

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="bg-gray-900/80 p-8 max-w-5xl w-full space-y-6 z-10 border border-gray-700 rounded-3xl backdrop-blur-sm">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-gray-700 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-amber-400 flex items-center gap-2">
              <FaUserShield /> لوحة مدير النظام
            </h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.name || user.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenNotifications}
              className="relative bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-full text-2xl transition shadow-lg"
              title={notificationsActive ? 'الإشعارات مفعلة' : 'تفعيل الإشعارات'}
            >
              <FaBell />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
              {notificationsActive && (
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900 animate-pulse" />
              )}
            </button>
            <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
              <FaSignOutAlt />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-red-900/50 to-red-900/20 p-6 rounded-2xl border border-red-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
                <FaExclamationTriangle className="text-white text-xl" />
              </div>
              <div>
                <p className="text-xs text-red-300 uppercase tracking-widest font-semibold">طلبات معلّقة</p>
                <h3 className="text-sm font-bold text-red-100">قيد المراجعة</h3>
              </div>
            </div>
            <p className="text-4xl font-black text-white">{pendingCount}</p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900/50 to-indigo-900/20 p-6 rounded-2xl border border-indigo-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
                <FaUserShield className="text-white text-xl" />
              </div>
              <div>
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-semibold">المشرفين</p>
                <h3 className="text-sm font-bold text-indigo-100">الحسابات النشطة</h3>
              </div>
            </div>
            <p className="text-4xl font-black text-white">{supervisors.length}</p>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900/50 to-emerald-900/20 p-6 rounded-2xl border border-emerald-500/30 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg">
                <FaUsers className="text-white text-xl" />
              </div>
              <div>
                <p className="text-xs text-emerald-300 uppercase tracking-widest font-semibold">الطلاب</p>
                <h3 className="text-sm font-bold text-emerald-100">إجمالي المسجلين</h3>
              </div>
            </div>
            <p className="text-4xl font-black text-white">{students.length}</p>
          </div>
        </div>

        {/* ✨ قسم طلبات الرسائل والتواصل مع الطلاب */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-amber-500/30">
          <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
            <h3 className="text-xl font-semibold text-amber-300 flex items-center gap-2">
              <FaPaperPlane /> طلبات الرسائل والتواصل مع الطلاب ({messageRequests.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setRequestFilter('pending')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'pending' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-300'}`}>قيد المراجعة ({pendingCount})</button>
              <button onClick={() => setRequestFilter('approved')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'approved' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'}`}>تم الإرسال</button>
              <button onClick={() => setRequestFilter('rejected')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300'}`}>مرفوضة</button>
              <button onClick={() => setRequestFilter('all')} className={`px-3 py-1 rounded-lg text-xs ${requestFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>الكل</button>
            </div>
          </div>

          {filteredRequests.length === 0 ? (
            <p className="text-gray-400 text-center py-6">لا توجد طلبات في هذا التصنيف.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredRequests.map(request => {
                const isPending = request.status === 'pending';
                const isApproved = request.status === 'approved';
                const isRejected = request.status === 'rejected';
                const statusBadge = isPending ? (
                  <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">⏳ قيد المراجعة</span>
                ) : isApproved ? (
                  <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">✅ تم الإرسال</span>
                ) : (
                  <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full">❌ مرفوض</span>
                );

                return (
                  <div key={request.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 space-y-2">
                    <div className="flex flex-wrap justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-amber-300 font-bold text-sm">{MESSAGE_REQUEST_TYPE_LABELS[request.type] || request.type}</span>
                          {statusBadge}
                        </div>
                        <p className="text-white text-sm mt-1">
                          <strong>{request.targetName}</strong>
                          {request.targetClass && <span className="text-gray-400 text-xs mr-2">({request.targetClass})</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">مقدم من: {request.requestedByName || 'معلم'}</p>

                        {request.type === 'warning' && (
                          <p className="text-xs text-yellow-200 mt-1">إنذار رقم {request.payload?.warningNumber} — {request.payload?.description}</p>
                        )}
                        {request.type === 'general' && (
                          <div className="mt-1 text-xs text-gray-300">
                            <p><strong>الموضوع:</strong> {request.payload?.subject}</p>
                            <p className="line-clamp-2"><strong>النص:</strong> {request.payload?.body}</p>
                          </div>
                        )}
                        {request.type === 'report' && (
                          <p className="text-xs text-red-200 mt-1">السبب: {request.payload?.reason}</p>
                        )}
                        {request.type === 'activation' && (
                          <p className="text-xs text-green-200 mt-1">اسم المستخدم: {request.payload?.username}</p>
                        )}
                        {request.type === 'reset_password' && (
                          <p className="text-xs text-indigo-200 mt-1">اسم المستخدم: {request.payload?.username}</p>
                        )}
                        {request.type === 'data_update_rejection' && request.payload?.reason && (
                          <p className="text-xs text-red-200 mt-1">سبب الرفض: {request.payload.reason}</p>
                        )}

                        {request.rejectionReason && (
                          <p className="text-xs text-red-300 mt-1">سبب الرفض (من المدير): {request.rejectionReason}</p>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">
                          {request.createdAt?.toDate?.() ? new Date(request.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleSendRequest(request)}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
                            >
                              <FaWhatsapp /> إرسال واتساب
                            </button>
                            <button
                              onClick={() => handleRejectRequest(request.id)}
                              className="text-xs bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
                            >
                              <FaTimesCircle /> رفض
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteRequest(request.id)}
                          className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1"
                        >
                          <FaTrashAlt /> حذف
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Supervisors Section */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-indigo-500/20">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-indigo-300 flex items-center gap-2">
              <FaUserShield /> المشرفين ({supervisors.length})
            </h3>
            <button onClick={() => setShowSupervisorModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm">
              إضافة مشرف
            </button>
          </div>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {supervisors.map(s => (
              <div key={s.id} className="p-3 bg-black/30 rounded-xl border border-gray-700 flex justify-between items-center">
                <div>
                  <span className="text-white text-sm">{s.name}</span>
                  <span className="text-xs text-gray-400 mr-2">({s.username})</span>
                  {s.isFrozen && <span className="text-xs text-orange-400 mr-2">(مجمد)</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => deleteDoc(doc(db, 'profiles', s.id))} className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/30">
                    <FaTrashAlt /> حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Students Section */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
          <h3 className="text-xl font-semibold text-blue-300 mb-4 flex items-center gap-2">
            <FaUsers /> إدارة الطلاب
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {students.map(s => (
              <div key={s.id} className="p-3 bg-black/30 rounded-xl border border-gray-700 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="text-white text-sm">{s.name}</span>
                  <span className="text-xs text-gray-400 mr-2">({s.username})</span>
                  {s.phone && <span className="text-xs text-gray-400 mr-2">📱 {s.phone}</span>}
                  {s.isFrozen && <span className="text-xs text-red-400 mr-2">(مجمد)</span>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleFreezeStudent(s)} className={`text-xs px-2 py-1 rounded-lg ${s.isFrozen ? 'bg-green-500/20 text-green-300' : 'bg-orange-500/20 text-orange-300'}`}>
                    {s.isFrozen ? 'فك التجميد' : 'تجميد'}
                  </button>
                  <button onClick={() => handleDeleteStudent(s.id)} className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/30">
                    <FaTrashAlt /> حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications Modal */}
        {showNotificationsModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNotificationsModal(false)}>
            <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[70vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-amber-300">
                  <FaBell className="inline-block me-2" /> الإشعارات
                </h3>
                <button onClick={() => setShowNotificationsModal(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
              </div>
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
                    <div key={n.id} className={`p-3 rounded-xl border ${n.read ? 'bg-gray-800/30 border-gray-600' : 'bg-gray-800/60 border-blue-500/40'}`}>
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

        {/* Add Supervisor Modal */}
        {showSupervisorModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSupervisorModal(false)}>
            <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-indigo-500/30" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-semibold text-indigo-300 mb-4">إضافة مشرف جديد</h3>
              <form onSubmit={handleAddSupervisor} className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block">الاسم</label>
                  <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorName} onChange={e => setNewSupervisorName(e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">الجنس</label>
                  <select className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorGender} onChange={e => setNewSupervisorGender(e.target.value)} required>
                    <option value="">اختر</option>
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">العمر</label>
                  <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorAge} onChange={e => setNewSupervisorAge(e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block">رقم الهاتف</label>
                  <input type="text" className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white" value={newSupervisorPhone} onChange={e => setNewSupervisorPhone(e.target.value)} required />
                </div>
                <button type="submit" disabled={supervisorLoading} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md text-white">
                  {supervisorLoading ? 'جاري الإضافة...' : 'إضافة'}
                </button>
                <button type="button" onClick={() => setShowSupervisorModal(false)} className="w-full py-2 bg-gray-600 hover:bg-gray-700 rounded-md text-white">إلغاء</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemManagerPanel;