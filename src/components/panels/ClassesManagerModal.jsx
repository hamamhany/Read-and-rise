import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaGraduationCap, FaUsers,
  FaChalkboardTeacher, FaTrashAlt, FaVenusMars
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, doc, getDoc
} from 'firebase/firestore';
import {
  createClass, deleteClassById, getClassStudentCounts,
  getClassGenderLabel, getTeacherDisplayName,
  filterClassesForSupervisor, getAllowedClassGenders
} from '../../services/classes';
import { CLASS_GENDER } from '../../constants';
import { useConfirm } from '../common/ConfirmContext';

const ClassesManagerModal = ({ isOpen, onClose, user }) => {
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [classVisibility, setClassVisibility] = useState('all');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newGender, setNewGender] = useState(CLASS_GENDER.MIXED);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) loadData();
    // eslint-disable-next-line
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // جلب classVisibility للمشرف
      let visibility = 'all';
      if (user?.id) {
        const userSnap = await getDoc(doc(db, 'profiles', user.id));
        if (userSnap.exists()) {
          visibility = userSnap.data().classVisibility || 'all';
        }
      }
      setClassVisibility(visibility);

      const [classesSnap, teachersSnap, counts] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
        getClassStudentCounts()
      ]);

      setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTeachers(teachersSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        nickname: d.data().nickname || '',
        gender: d.data().gender || '',
        username: d.data().username || ''
      })));
      setStudentCounts(counts);

      if (teachersSnap.docs.length > 0) {
        setNewTeacherId(prev => prev || teachersSnap.docs[0].id);
      }

      const allowedGenders = getAllowedClassGenders(user?.gender, visibility);
      if (!allowedGenders.includes(newGender)) {
        setNewGender(allowedGenders[0]);
      }
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return toast.error('اسم الشعبة مطلوب');
    if (!newTeacherId) return toast.error('اختر معلم الشعبة');

    setSubmitting(true);
    try {
      await createClass({
        name: newName,
        teacherId: newTeacherId,
        gender: newGender
      });
      toast.success('✅ تم إنشاء الشعبة');
      setNewName('');
      setNewGender(getAllowedClassGenders(user?.gender, classVisibility)[0]);
      setShowAddForm(false);
      await loadData();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (cls) => {
    const count = studentCounts[cls.id] || 0;
    if (count > 0) {
      toast.error('لا يمكن حذف شعبة تحتوي على طلاب. أفرغها أولاً.');
      return;
    }
    const ok = await confirm('حذف الشعبة', `حذف الشعبة "${cls.name}" نهائياً؟`);
    if (!ok) return;
    try {
      await deleteClassById(cls.id);
      toast.success('تم الحذف');
      await loadData();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const getTeacherById = (id) => teachers.find(t => t.id === id);

  const visibleClasses = filterClassesForSupervisor(classes, user?.gender, classVisibility);
  const allowedGenders = getAllowedClassGenders(user?.gender, classVisibility);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-indigo-500/30" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <FaGraduationCap className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الشعب</h3>
              <p className="text-xs text-gray-400">
                {classVisibility === 'all' ? 'تعرض جميع الشعب' : `تعرض شعب ${user?.gender === 'أنثى' ? 'الإناث' : 'الذكور'} والمختلطة`}
                {' • '}{visibleClasses.length} من {classes.length} شعبة
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="p-5 border-b border-gray-700">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
          >
            <FaPlus /> {showAddForm ? 'إغلاق النموذج' : 'إضافة شعبة جديدة'}
          </button>

          {showAddForm && (
            <form onSubmit={handleCreate} className="mt-4 bg-gray-800/50 p-4 rounded-xl border border-indigo-500/20 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">اسم الشعبة <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثال: علم التجويد المستوى الأول"
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">معلم الشعبة <span className="text-red-400">*</span></label>
                <select
                  value={newTeacherId}
                  onChange={e => setNewTeacherId(e.target.value)}
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                >
                  <option value="">اختر المعلم</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{getTeacherDisplayName(t)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">جنس الشعبة <span className="text-red-400">*</span></label>
                <select
                  value={newGender}
                  onChange={e => setNewGender(e.target.value)}
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                >
                  {allowedGenders.includes(CLASS_GENDER.MALE) && <option value={CLASS_GENDER.MALE}>ذكور فقط</option>}
                  {allowedGenders.includes(CLASS_GENDER.FEMALE) && <option value={CLASS_GENDER.FEMALE}>إناث فقط</option>}
                  {allowedGenders.includes(CLASS_GENDER.MIXED) && <option value={CLASS_GENDER.MIXED}>مختلطة</option>}
                </select>
                <p className="text-[10px] text-amber-300 mt-1">
                  ⚠️ {newGender === CLASS_GENDER.MALE ? 'لن يُقبل أي طالب غير ذكر'
                      : newGender === CLASS_GENDER.FEMALE ? 'لن تُقبل أي طالبة غير أنثى'
                      : 'المختلطة لا تقبل الذكور فوق 12 عام'}
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold"
              >
                {submitting ? 'جاري الإنشاء...' : 'إنشاء الشعبة'}
              </button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : visibleClasses.length === 0 ? (
            <p className="text-gray-400 text-center py-8">لا توجد شعب متاحة لعرضها.</p>
          ) : (
            <div className="space-y-2">
              {visibleClasses.map(cls => {
                const count = studentCounts[cls.id] || 0;
                const genderLabel = getClassGenderLabel(cls.gender);
                const teacher = getTeacherById(cls.teacherId);
                const teacherName = getTeacherDisplayName(teacher);
                const genderColor = cls.gender === CLASS_GENDER.MALE
                  ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
                  : cls.gender === CLASS_GENDER.FEMALE
                    ? 'text-pink-300 bg-pink-500/10 border-pink-500/30'
                    : 'text-purple-300 bg-purple-500/10 border-purple-500/30';

                return (
                  <div key={cls.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm">{cls.name}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <FaChalkboardTeacher /> {teacherName}
                        </span>
                        <span className="text-xs text-cyan-300 flex items-center gap-1">
                          <FaUsers /> {count} طالب
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${genderColor}`}>
                          <FaVenusMars className="inline me-1" /> {genderLabel}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(cls)}
                      className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                    >
                      <FaTrashAlt /> حذف
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassesManagerModal;