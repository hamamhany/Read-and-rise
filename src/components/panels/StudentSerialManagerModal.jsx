import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  FaSearch, FaTimes, FaSpinner, FaUserCog, FaKey, FaGraduationCap,
  FaCheckSquare, FaSquare, FaChevronLeft, FaExchangeAlt, FaVenusMars
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, doc, getDoc, limit
} from 'firebase/firestore';
import { useConfirm } from '../common/ConfirmContext';
import { fetchClassNames } from '../../utils/helpers';
import {
  getClassGenderLabel, filterClassesForSupervisor, getTeacherDisplayName,
  getEligibleClassesForStudent
} from '../../services/classes';
import { createMessageRequest } from '../../services/messageRequests';
import { MESSAGE_REQUEST_TYPES } from '../../constants';

const StudentSerialManagerModal = ({ isOpen, onClose, user }) => {
  const confirm = useConfirm();
  const [serialInput, setSerialInput] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [internalStudent, setInternalStudent] = useState(null);
  const [studentClasses, setStudentClasses] = useState([]);
  const [classNamesMap, setClassNamesMap] = useState({});
  const [loadingStudent, setLoadingStudent] = useState(false);

  // ✅ نقل طالب من شعبة
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFromClassId, setTransferFromClassId] = useState(null);
  const [eligibleClassesForTransfer, setEligibleClassesForTransfer] = useState([]);
  const [selectedNewClassId, setSelectedNewClassId] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  const [resetting, setResetting] = useState(false);

  const searchStudents = async () => {
    const term = serialInput.trim();
    if (!term) return toast.error('أدخل الرقم التسلسلي');

    setSearching(true);
    setHasSearched(false);
    try {
      const q = query(
        collection(db, 'profiles'),
        where('role', '==', 'student'),
        where('serialNumber', '>=', term),
        where('serialNumber', '<=', term + '\uf8ff'),
        limit(5)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setResults(items);
      setHasSearched(true);
      if (items.length === 0) toast('لا توجد نتائج مطابقة', { icon: 'ℹ️' });
    } catch (e) {
      toast.error('فشل البحث: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const openStudent = async (studentId) => {
    setLoadingStudent(true);
    try {
      const snap = await getDoc(doc(db, 'profiles', studentId));
      if (!snap.exists()) return;
      const data = snap.data();

      setInternalStudent({ id: studentId, ...data });
      const classes = data.classIds || [];
      setStudentClasses(classes);
      if (classes.length > 0) {
        const names = await fetchClassNames(classes);
        setClassNamesMap(names);
      } else {
        setClassNamesMap({});
      }
      setSelectedStudentId(studentId);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setLoadingStudent(false);
    }
  };

  const backToList = () => {
    setSelectedStudentId(null);
    setInternalStudent(null);
    setStudentClasses([]);
    setClassNamesMap({});
  };

  // ✅ فتح مودال النقل
  const openTransferModal = async (fromClassId) => {
    setTransferFromClassId(fromClassId);
    setSelectedNewClassId('');
    try {
      const eligible = await getEligibleClassesForStudent(internalStudent, fromClassId);
      // تطبيق فلترة رؤية المشرف
      const userSnap = await getDoc(doc(db, 'profiles', user.id));
      const visibility = userSnap.exists() ? (userSnap.data().classVisibility || 'all') : 'all';
      const filtered = filterClassesForSupervisor(eligible, user.gender, visibility);
      setEligibleClassesForTransfer(filtered);
      setShowTransferModal(true);
      if (filtered.length === 0) {
        toast('لا توجد شعب متوافقة متاحة للنقل', { icon: '⚠️' });
      }
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    }
  };

  // ✅ إرسال طلب النقل للمدير
  const submitTransfer = async () => {
    if (!selectedNewClassId) return toast.error('اختر الشعبة الجديدة');
    const fromClassName = classNamesMap[transferFromClassId] || 'غير محدد';
    const toClass = eligibleClassesForTransfer.find(c => c.id === selectedNewClassId);
    if (!toClass) return toast.error('الشعبة غير موجودة');

    setSubmittingTransfer(true);
    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.STUDENT_CLASS_TRANSFER,
        targetType: 'student',
        targetId: internalStudent.id,
        targetName: internalStudent.name || '',
        targetPhone: internalStudent.phone || '',
        targetClass: fromClassName,
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: {
          studentId: internalStudent.id,
          studentName: internalStudent.name,
          serialNumber: internalStudent.serialNumber || '',
          fromClassId: transferFromClassId,
          fromClassName,
          toClassId: selectedNewClassId,
          toClassName: toClass.name
        }
      });
      toast.success('✅ تم إرسال طلب النقل للمدير للموافقة');
      setShowTransferModal(false);
      setTransferFromClassId(null);
      setSelectedNewClassId('');
      setEligibleClassesForTransfer([]);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setSubmittingTransfer(false);
    }
  };

  // ✅ إعادة تعيين — إنشاء طلب فقط (بدون تنفيذ فوري)
  const handleResetInfo = async () => {
    const ok = await confirm(
      'إعادة تعيين معلومات الطالب',
      'سيتم إنشاء طلب للمدير لإعادة تعيين بيانات الدخول. لن يتم تحديث Firebase Auth حتى يوافق المدير ويضغط "تم الإرسال". متابعة؟'
    );
    if (!ok) return;

    setResetting(true);
    try {
      const student = internalStudent;
      const newUsername = `knight${Math.floor(Math.random() * 900000) + 100000}`;
      const newPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');

      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.PASSWORD_RESET_APPROVAL,
        targetType: 'student',
        targetId: student.id,
        targetName: student.name || '',
        targetPhone: student.phone || '',
        targetClass: '',
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: {
          username: newUsername,
          password: newPassword,
          serialNumber: student.serialNumber || ''
        }
      });

      toast.success('✅ تم إرسال طلب إعادة التعيين للمدير للموافقة');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  const handleClose = () => {
    backToList();
    setResults([]);
    setSerialInput('');
    setHasSearched(false);
    setShowTransferModal(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={handleClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-cyan-500/30" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <FaUserCog className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الطلاب بالرقم التسلسلي</h3>
              <p className="text-xs text-gray-400">بحث بالرقم التسلسلي — جميع الإجراءات تحتاج موافقة المدير</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        {!selectedStudentId && (
          <>
            <div className="p-5 border-b border-gray-700">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="أدخل الرقم التسلسلي..."
                  value={serialInput}
                  onChange={e => setSerialInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !searching) searchStudents(); }}
                  className="flex-1 min-w-[200px] bg-gray-800 text-center p-3 border border-gray-600 rounded-lg text-white font-mono text-lg tracking-wider"
                  dir="ltr"
                />
                <button
                  onClick={searchStudents}
                  disabled={searching}
                  className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white px-5 rounded-lg inline-flex items-center gap-2 font-bold"
                >
                  {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />} بحث
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {!hasSearched ? (
                <div className="text-center py-8">
                  <FaUserCog className="text-4xl text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">أدخل الرقم التسلسلي واضغط "بحث"</p>
                  <p className="text-gray-500 text-xs mt-2">تظهر النتائج حتى 5 طلاب</p>
                </div>
              ) : results.length === 0 ? (
                <p className="text-gray-400 text-center py-8">لا توجد نتائج مطابقة.</p>
              ) : (
                <div className="space-y-2">
                  {results.map(r => (
                    <button
                      key={r.id}
                      onClick={() => openStudent(r.id)}
                      className="w-full p-4 bg-black/30 rounded-xl border border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/5 transition flex flex-wrap justify-between items-center gap-2"
                    >
                      <div className="text-right flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{r.name || 'بدون اسم'}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-gray-400 mt-1">
                          <span className={`px-2 py-0.5 rounded border ${r.gender === 'أنثى' ? 'text-pink-300 bg-pink-500/10 border-pink-500/30' : 'text-blue-300 bg-blue-500/10 border-blue-500/30'}`}>
                            <FaVenusMars className="inline me-1" />{r.gender || 'غير محدد'}
                          </span>
                          <span>{r.age || '?'} سنة</span>
                        </div>
                      </div>
                      <span className="font-mono text-lg text-cyan-200 tracking-widest" dir="ltr">
                        {r.serialNumber}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {selectedStudentId && internalStudent && (
          <>
            <div className="p-5 border-b border-gray-700">
              <button
                onClick={backToList}
                className="text-gray-400 hover:text-white text-sm inline-flex items-center gap-1"
              >
                <FaChevronLeft /> رجوع للبحث
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loadingStudent ? (
                <div className="text-center py-8">
                  <FaSpinner className="animate-spin text-3xl text-gray-400" />
                </div>
              ) : (
                <>
                  {/* ✅ معلومات الطالب */}
                  <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                    <p className="text-sm text-white font-bold mb-2">{internalStudent.name || 'بدون اسم'}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">الرقم التسلسلي</p>
                        <p className="text-cyan-200 font-mono" dir="ltr">{internalStudent.serialNumber || '—'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">الجنس</p>
                        <p className={internalStudent.gender === 'أنثى' ? 'text-pink-300' : 'text-blue-300'}>
                          {internalStudent.gender || 'غير محدد'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">العمر</p>
                        <p className="text-gray-200">{internalStudent.age || '—'} سنة</p>
                      </div>
                      <div>
                        <p className="text-gray-400">البلد</p>
                        <p className="text-gray-200">{internalStudent.country || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* ✅ الشعب + زر نقل لكل شعبة */}
                  <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                    <p className="text-xs text-gray-400 mb-2">الشعب المسجل بها الطالب:</p>
                    {studentClasses.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-2">لا توجد شعب</p>
                    ) : (
                      <div className="space-y-2">
                        {studentClasses.map(cid => (
                          <div key={cid} className="flex items-center justify-between gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2">
                            <span className="text-xs text-cyan-200 flex-1 truncate">
                              {classNamesMap[cid] || 'شعبة محذوفة'}
                            </span>
                            <button
                              onClick={() => openTransferModal(cid)}
                              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 px-2 py-1 rounded whitespace-nowrap flex items-center gap-1"
                            >
                              <FaExchangeAlt /> نقل
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={handleResetInfo}
                      disabled={resetting}
                      className="w-full p-4 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetting ? <FaSpinner className="animate-spin" /> : <FaKey />}
                      {resetting ? 'جاري الإرسال...' : 'إعادة تعيين معلومات الطالب (طلب للمدير)'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ✅ مودال نقل الطالب */}
        {showTransferModal && transferFromClassId && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4">
            <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-amber-500/30 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-amber-300">نقل الطالب من شعبة</h3>
                <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-white"><FaTimes /></button>
              </div>

              <p className="text-sm text-gray-300 mb-2">
                <strong>من:</strong> {classNamesMap[transferFromClassId] || '—'}
              </p>
              <p className="text-sm text-gray-300 mb-3">
                <strong>الطالب:</strong> {internalStudent.name} <span className="text-xs text-gray-500" dir="ltr">({internalStudent.serialNumber})</span>
              </p>

              <label className="block text-sm text-gray-300 mb-1">اختر الشعبة الجديدة المتوافقة</label>
              <div className="flex-1 overflow-y-auto space-y-1 mb-3 max-h-60">
                {eligibleClassesForTransfer.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">لا توجد شعب متوافقة</p>
                ) : (
                  eligibleClassesForTransfer.map(c => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition ${
                        selectedNewClassId === c.id
                          ? 'bg-amber-900/30 border-amber-500'
                          : 'bg-black/30 border-gray-700 hover:border-amber-500/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="transferClass"
                        value={c.id}
                        checked={selectedNewClassId === c.id}
                        onChange={() => setSelectedNewClassId(c.id)}
                        className="accent-amber-500"
                      />
                      <div className="flex-1">
                        <p className="text-white text-sm">{c.name}</p>
                        <p className="text-xs text-gray-400">{getClassGenderLabel(c.gender)}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-xs text-blue-200 mb-3">
                ℹ️ سيُرسل الطلب للمدير. عند الموافقة، يُنقل الطالب ويصل إشعار في مركز إشعاراته.
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
                >
                  إلغاء
                </button>
                <button
                  onClick={submitTransfer}
                  disabled={submittingTransfer || !selectedNewClassId}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                >
                  {submittingTransfer ? 'جاري الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentSerialManagerModal;