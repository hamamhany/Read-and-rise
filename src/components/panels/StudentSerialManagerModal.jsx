import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  FaSearch, FaTimes, FaSpinner, FaUserCog, FaKey, FaGraduationCap,
  FaCheckSquare, FaSquare, FaChevronLeft
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, doc, getDoc, updateDoc,
  serverTimestamp, limit
} from 'firebase/firestore';
import { useConfirm } from '../common/ConfirmContext';
import { fetchClassNames } from '../../utils/helpers';
import { validateStudentEligibility, getClassGenderLabel } from '../../services/classes';
import { createMessageRequest } from '../../services/messageRequests';
import { createPasswordResetRequest, approvePasswordReset } from '../../services/passwordReset';
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

  const [showManageClasses, setShowManageClasses] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [saving, setSaving] = useState(false);
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
      const items = snap.docs.map(d => ({ id: d.id, serialNumber: d.data().serialNumber }));
      setResults(items);
      setHasSearched(true);
      if (items.length === 0) {
        toast('لا توجد نتائج مطابقة', { icon: 'ℹ️' });
      }
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

  const openManageClasses = async () => {
    const snap = await getDocs(collection(db, 'classes'));
    setAllClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setSelectedClassIds([...studentClasses]);
    setShowManageClasses(true);
  };

  const toggleClass = (classId) => {
    if (selectedClassIds.includes(classId)) {
      setSelectedClassIds(prev => prev.filter(id => id !== classId));
      return;
    }

    const classData = allClasses.find(c => c.id === classId);
    if (!classData) return;

    const result = validateStudentEligibility(internalStudent, classData);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }

    setSelectedClassIds(prev => [...prev, classId]);
  };

  const saveClasses = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'profiles', selectedStudentId), {
        classIds: selectedClassIds,
        updatedAt: serverTimestamp()
      });
      setStudentClasses(selectedClassIds);
      const names = selectedClassIds.length > 0 ? await fetchClassNames(selectedClassIds) : {};
      setClassNamesMap(names);
      toast.success('✅ تم حفظ التعديلات');
      setShowManageClasses(false);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetInfo = async () => {
    const ok = await confirm(
      'إعادة تعيين معلومات الطالب',
      'سيتم تغيير اسم المستخدم وكلمة المرور وإرسالها للمدير لإرسالها عبر واتساب. سيحتاج الطالب لتسجيل الدخول بالبيانات الجديدة ثم إكمال ملفه كتسجيل لأول مرة. متابعة؟'
    );
    if (!ok) return;

    setResetting(true);
    try {
      const student = internalStudent;
      const newUsername = `knight${Math.floor(Math.random() * 900000) + 100000}`;
      const newPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');

      let authUpdated = false;
      try {
        const requestId = await createPasswordResetRequest({
          submittedName: student.name || '',
          submittedGender: student.gender || '',
          submittedAge: student.age || 0,
          submittedPhone: student.phone || '',
          submittedSerialNumber: student.serialNumber || ''
        });

        await approvePasswordReset({
          requestId,
          resolvedUser: student,
          newUsername,
          newPassword,
          supervisorId: user.id,
          supervisorName: user.name || user.username || 'مشرف'
        });

        authUpdated = true;
      } catch (apiErr) {
        console.warn('Auth reset failed, using fallback:', apiErr);
        await updateDoc(doc(db, 'profiles', student.id), {
          isProfileComplete: false,
          infoVerified: false,
          tempPassword: newPassword,
          updatedAt: serverTimestamp()
        });
      }

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

      toast.success(
        authUpdated
          ? '✅ تم تحديث البيانات وإرسال الطلب للمدير.'
          : '✅ تم إرسال الطلب للمدير. سيحتاج الطالب لتحديث بياناته عند الدخول.'
      );

      backToList();
      setResults([]);
      setSerialInput('');
      setHasSearched(false);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-cyan-500/30" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <FaUserCog className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الطلاب بالرقم التسلسلي</h3>
              <p className="text-xs text-gray-400">بحث بالرقم التسلسلي فقط</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
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
                  {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
                  بحث
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
                      className="w-full p-4 bg-black/30 rounded-xl border border-cyan-500/20 hover:border-cyan-400/50 hover:bg-cyan-500/5 transition text-center"
                    >
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
                  <div className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                    <p className="text-xs text-gray-400 mb-2">الشعب المسجل بها الطالب:</p>
                    {studentClasses.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-2">لا توجد شعب</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {studentClasses.map(cid => (
                          <span key={cid} className="text-xs bg-cyan-500/10 text-cyan-200 px-3 py-1 rounded-full border border-cyan-500/30">
                            {classNamesMap[cid] || 'شعبة محذوفة'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={openManageClasses}
                      className="w-full p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 rounded-xl text-blue-200 font-bold flex items-center justify-center gap-2"
                    >
                      <FaGraduationCap /> إدارة شعب الطالب
                    </button>
                    <button
                      onClick={handleResetInfo}
                      disabled={resetting}
                      className="w-full p-4 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 rounded-xl text-amber-200 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {resetting ? <FaSpinner className="animate-spin" /> : <FaKey />}
                      {resetting ? 'جاري المعالجة...' : 'إعادة تعيين معلومات الطالب'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {showManageClasses && (
          <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4">
            <div className="bg-gray-900 p-6 rounded-2xl max-w-lg w-full border border-blue-500/30 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-blue-300">إدارة شعب الطالب</h3>
                <button onClick={() => setShowManageClasses(false)} className="text-gray-400 hover:text-white"><FaTimes /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                {allClasses.length === 0 ? (
                  <p className="text-gray-400 text-center py-4">لا توجد شعب متاحة.</p>
                ) : (
                  allClasses.map(cls => {
                    const isSelected = selectedClassIds.includes(cls.id);
                    const genderLabel = getClassGenderLabel(cls.gender);
                    return (
                      <div
                        key={cls.id}
                        onClick={() => toggleClass(cls.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center gap-3 ${
                          isSelected
                            ? 'bg-blue-900/30 border-blue-500'
                            : 'bg-black/30 border-gray-700 hover:border-gray-500'
                        }`}
                      >
                        <span className={`text-xl ${isSelected ? 'text-blue-400' : 'text-gray-500'}`}>
                          {isSelected ? <FaCheckSquare /> : <FaSquare />}
                        </span>
                        <div className="flex-1">
                          <p className="text-white text-sm font-medium">{cls.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{genderLabel}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setShowManageClasses(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
                >
                  إلغاء
                </button>
                <button
                  onClick={saveClasses}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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