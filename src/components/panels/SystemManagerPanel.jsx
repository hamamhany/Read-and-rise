import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { 
  FaSignOutAlt, FaUserShield, FaExclamationTriangle, FaWhatsapp, 
  FaTimesCircle, FaUsers, FaTrashAlt 
} from 'react-icons/fa';
import { db } from '../../firebase';
import { 
  collection, query, onSnapshot, doc, deleteDoc, 
  serverTimestamp, orderBy, where, updateDoc 
} from 'firebase/firestore';
import { createSupervisorAccount } from '../../services/supervisor';
import { sendWarningMessage } from '../../utils/whatsapp';

const SystemManagerPanel = ({ user, onLogout }) => {
  const [reports, setReports] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [newSupervisorGender, setNewSupervisorGender] = useState('');
  const [newSupervisorAge, setNewSupervisorAge] = useState('');
  const [newSupervisorPhone, setNewSupervisorPhone] = useState('');
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  useEffect(() => {
    const qReports = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

    return () => { unsubReports(); unsubSupervisors(); unsubStudents(); };
  }, []);

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

  const handleDeleteReport = async (reportId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا البلاغ؟')) return;
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      toast.success('تم حذف البلاغ.');
    } catch (err) {
      toast.error('فشل حذف البلاغ: ' + err.message);
    }
  };

  const handleSendReportWhatsApp = (report) => {
    const student = students.find(s => s.id === report.studentId);
    if (!student || !student.phone) {
      toast.error('رقم هاتف الطالب غير مسجل.');
      return;
    }
    const message = `الموضوع: بلاغ ضد الطالب ${report.studentName}\n\nالسبب: ${report.reason}\nالشعبة: ${report.studentClass}\n\nيرجى التواصل مع الإدارة.`;
    window.open(`https://wa.me/${student.phone.replace(/^0+/, '')}?text=${encodeURIComponent(message)}`, '_blank');
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
          <button onClick={onLogout} className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full text-2xl transition shadow-lg" title="تسجيل الخروج">
            <FaSignOutAlt />
          </button>
        </div>

        {/* Reports Section */}
        <div className="bg-gray-800/60 p-6 rounded-2xl border border-red-500/20">
          <h3 className="text-xl font-semibold text-red-300 mb-4 flex items-center gap-2">
            <FaExclamationTriangle /> البلاغات والإنذارات ({reports.length})
          </h3>
          {reports.length === 0 ? (
            <p className="text-gray-400">لا توجد بلاغات حالياً.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {reports.map(report => (
                <div key={report.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 flex flex-wrap justify-between items-start gap-3">
                  <div>
                    <p className="text-white font-medium">{report.studentName} <span className="text-xs text-gray-400">({report.studentClass})</span></p>
                    <p className="text-sm text-red-300 mt-1">السبب: {report.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {report.createdAt?.toDate?.() ? new Date(report.createdAt.toDate()).toLocaleString('ar-EG') : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSendReportWhatsApp(report)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg flex items-center gap-1">
                      <FaWhatsapp /> إرسال واتساب
                    </button>
                    <button onClick={() => handleDeleteReport(report.id)} className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-lg">
                      <FaTimesCircle /> حذف
                    </button>
                  </div>
                </div>
              ))}
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

        {/* Students Management Section */}
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