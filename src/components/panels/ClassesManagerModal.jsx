import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaGraduationCap, FaUsers,
  FaChalkboardTeacher, FaTrashAlt, FaVenusMars, FaExchangeAlt,
  FaLayerGroup, FaFolderOpen, FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, getDocs, doc, getDoc
} from 'firebase/firestore';
import {
  createClass, deleteClassById, getClassStudentCounts,
  getClassGenderLabel, getTeacherDisplayName,
  filterClassesForSupervisor, getAllowedClassGenders,
  findAffectedStudents, getEligibleClassesForStudent,
  createSection, deleteSection, getAllSections, updateSection,
  purgeOrphanClasses, moveClassToSection
} from '../../services/classes';
import { createMessageRequest } from '../../services/messageRequests';
import { CLASS_GENDER, MESSAGE_REQUEST_TYPES } from '../../constants';
import { fetchClassNames } from '../../utils/helpers';
import { useConfirm } from '../common/ConfirmContext';

const ClassesManagerModal = ({ isOpen, onClose, user }) => {
  const confirm = useConfirm();

  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [classVisibility, setClassVisibility] = useState('all');

  // نموذج إضافة شعبة
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newGender, setNewGender] = useState(CLASS_GENDER.MIXED);
  const [newSectionId, setNewSectionId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // نموذج إضافة قسم (المدير فقط)
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [submittingSection, setSubmittingSection] = useState(false);

  // أقسام مفتوحة/مغلقة
  const [collapsed, setCollapsed] = useState({});

  // ✅ حالات تغيير جنس الشعبة
  const [showGenderChangeModal, setShowGenderChangeModal] = useState(false);
  const [genderChangeClass, setGenderChangeClass] = useState(null);
  const [newGenderForChange, setNewGenderForChange] = useState('');
  const [affectedStudents, setAffectedStudents] = useState([]);
  const [checkingAffected, setCheckingAffected] = useState(false);

  // ✅ نقل شعبة بين الأقسام
  const [showMoveClassModal, setShowMoveClassModal] = useState(false);
  const [movingClass, setMovingClass] = useState(null);
  const [targetSectionId, setTargetSectionId] = useState('');

  const isManager = user?.role === 'system_manager';

  useEffect(() => {
    if (isOpen) loadData();
    // eslint-disable-next-line
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      let visibility = 'all';
      if (user?.id) {
        const userSnap = await getDoc(doc(db, 'profiles', user.id));
        if (userSnap.exists()) visibility = userSnap.data().classVisibility || 'all';
      }
      setClassVisibility(visibility);

      // ✅ المدير: احذف الشعب القديمة التي بلا قسم قبل التحميل
      if (isManager) {
        const deleted = await purgeOrphanClasses();
        if (deleted > 0) {
          toast.success(`🧹 تم حذف ${deleted} شعبة قديمة (غير مرتبطة بأي قسم)`);
        }
      }

      const [classesSnap, teachersSnap, counts, sectionsList] = await Promise.all([
        getDocs(collection(db, 'classes')),
        getDocs(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
        getClassStudentCounts(),
        getAllSections()
      ]);

      // ترتيب الأقسام أبجدياً
      sectionsList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

      setSections(sectionsList);
      setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTeachers(teachersSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        nickname: d.data().nickname || '',
        gender: d.data().gender || '',
        username: d.data().username || ''
      })));
      setStudentCounts(counts);

      if (teachersSnap.docs.length > 0) setNewTeacherId(prev => prev || teachersSnap.docs[0].id);
      if (sectionsList.length > 0) setNewSectionId(prev => prev || sectionsList[0].id);

      const allowedGenders = getAllowedClassGenders(user?.gender, visibility);
      if (!allowedGenders.includes(newGender)) setNewGender(allowedGenders[0]);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ إضافة قسم جديد (المدير فقط)
  const handleCreateSection = async (e) => {
    e.preventDefault();
    if (!newSectionName.trim()) return toast.error('اسم القسم مطلوب');
    setSubmittingSection(true);
    try {
      await createSection({ name: newSectionName, createdBy: user.id });
      toast.success('✅ تم إنشاء القسم');
      setNewSectionName('');
      setShowAddSection(false);
      await loadData();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    } finally {
      setSubmittingSection(false);
    }
  };

  // ✅ حذف قسم (فقط إذا فارغ)
  const handleDeleteSection = async (section) => {
    const count = classes.filter(c => c.sectionId === section.id).length;
    if (count > 0) {
      toast.error(`لا يمكن حذف القسم — يحتوي على ${count} شعبة. انقلها أو احذفها أولاً.`);
      return;
    }
    const ok = await confirm('حذف القسم', `حذف القسم "${section.name}" نهائياً؟`);
    if (!ok) return;
    try {
      await deleteSection(section.id);
      toast.success('✅ تم حذف القسم');
      await loadData();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  // ✅ إضافة شعبة داخل قسم
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return toast.error('اسم الشعبة مطلوب');
    if (!newTeacherId) return toast.error('اختر معلم الشعبة');
    if (!newSectionId) return toast.error('اختر القسم — كل شعبة يجب أن تنتمي لقسم');

    setSubmitting(true);
    try {
      await createClass({
        name: newName,
        teacherId: newTeacherId,
        gender: newGender,
        sectionId: newSectionId
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
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.CLASS_DELETE,
        targetType: 'class',
        targetId: cls.id,
        targetName: cls.name,
        targetPhone: '',
        targetClass: cls.name,
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: { className: cls.name, classId: cls.id }
      });
      toast.success('✅ تم إرسال طلب الحذف للمدير للموافقة');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  // ✅ فتح مودال النقل بين الأقسام
  const openMoveClass = (cls) => {
    setMovingClass(cls);
    setTargetSectionId(cls.sectionId || '');
    setShowMoveClassModal(true);
  };

  const handleMoveClassSubmit = async () => {
    if (!targetSectionId) return toast.error('اختر القسم');
    if (targetSectionId === movingClass.sectionId) return toast.error('اختر قسماً مختلفاً');
    try {
      await moveClassToSection(movingClass.id, targetSectionId);
      toast.success('✅ تم نقل الشعبة');
      setShowMoveClassModal(false);
      setMovingClass(null);
      await loadData();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const openGenderChange = (cls) => {
    setGenderChangeClass(cls);
    setNewGenderForChange(cls.gender || CLASS_GENDER.MIXED);
    setAffectedStudents([]);
    setShowGenderChangeModal(true);
  };

  const handleGenderChange = async () => {
    if (!genderChangeClass) return;
    if (newGenderForChange === genderChangeClass.gender) {
      toast.error('اختر جنساً مختلفاً');
      return;
    }
    setCheckingAffected(true);
    try {
      const affected = await findAffectedStudents(genderChangeClass.id, newGenderForChange);
      setAffectedStudents(affected);
      if (affected.length === 0) {
        await submitGenderChangeRequest([]);
      }
    } catch (e) {
      toast.error('فشل الفحص: ' + e.message);
    } finally {
      setCheckingAffected(false);
    }
  };

  const submitGenderChangeRequest = async (transfers) => {
    try {
      await createMessageRequest({
        type: MESSAGE_REQUEST_TYPES.CLASS_GENDER_CHANGE,
        targetType: 'class',
        targetId: genderChangeClass.id,
        targetName: genderChangeClass.name,
        targetPhone: '',
        targetClass: genderChangeClass.name,
        requestedBy: user.id,
        requestedByName: user.name || user.username || 'مشرف',
        payload: {
          classId: genderChangeClass.id,
          className: genderChangeClass.name,
          oldGender: genderChangeClass.gender || CLASS_GENDER.MIXED,
          newGender: newGenderForChange,
          transfers
        }
      });
      toast.success('✅ تم إرسال طلب التغيير للمدير للموافقة');
      setShowGenderChangeModal(false);
      setGenderChangeClass(null);
      setAffectedStudents([]);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const getTeacherById = (id) => teachers.find(t => t.id === id);

  // ✅ فلترة الشعب: فقط التي لها قسم صالح
  const validSectionIds = new Set(sections.map(s => s.id));
  const validClasses = classes.filter(c => c.sectionId && validSectionIds.has(c.sectionId));
  const visibleClasses = filterClassesForSupervisor(validClasses, user?.gender, classVisibility);
  const allowedGenders = getAllowedClassGenders(user?.gender, classVisibility);

  // ✅ تجميع الشعب حسب القسم
  const grouped = sections.map(sec => ({
    section: sec,
    classes: visibleClasses.filter(c => c.sectionId === sec.id)
  }));

  const toggleCollapse = (secId) => {
    setCollapsed(prev => ({ ...prev, [secId]: !prev[secId] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-indigo-500/30" onClick={e => e.stopPropagation()}>

        {/* الرأس */}
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <FaLayerGroup className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الأقسام والشعب</h3>
              <p className="text-xs text-gray-400">
                {sections.length} قسم • {validClasses.length} شعبة
                {classVisibility !== 'all' && ` • تعرض شعب ${user?.gender === 'أنثى' ? 'الإناث' : 'الذكور'} والمختلطة`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        {/* شريط الأزرار */}
        <div className="p-5 border-b border-gray-700 flex flex-wrap gap-2">
          {isManager && (
            <button
              onClick={() => setShowAddSection(!showAddSection)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
            >
              <FaFolderOpen /> {showAddSection ? 'إغلاق نموذج القسم' : 'إضافة قسم جديد'}
            </button>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={sections.length === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
            title={sections.length === 0 ? 'أنشئ قسماً أولاً' : ''}
          >
            <FaPlus /> {showAddForm ? 'إغلاق النموذج' : 'إضافة شعبة جديدة'}
          </button>
          {sections.length === 0 && isManager && (
            <p className="text-xs text-amber-300 self-center">⚠️ يجب إنشاء قسم أولاً قبل إضافة الشعب</p>
          )}
        </div>

        {/* نموذج إضافة قسم */}
        {showAddSection && isManager && (
          <form onSubmit={handleCreateSection} className="mx-5 mt-4 bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/30 space-y-3">
            <label className="block text-xs text-emerald-300 mb-1">اسم القسم <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              placeholder="مثال: قسم التجويد / قسم اللغة العربية"
              className="w-full bg-gray-800 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
              required
            />
            <button
              type="submit"
              disabled={submittingSection}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold"
            >
              {submittingSection ? 'جاري الإنشاء...' : 'إنشاء القسم'}
            </button>
          </form>
        )}

        {/* نموذج إضافة شعبة */}
        {showAddForm && (
          <form onSubmit={handleCreate} className="mx-5 mt-4 bg-gray-800/50 p-4 rounded-xl border border-indigo-500/20 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">القسم <span className="text-red-400">*</span></label>
              <select
                value={newSectionId}
                onChange={e => setNewSectionId(e.target.value)}
                className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                required
              >
                <option value="">اختر القسم</option>
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">اسم الشعبة <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="مثال: المستوى الأول - شعبة أ"
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

        {/* محتوى الأقسام والشعب */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FaFolderOpen className="text-5xl mx-auto mb-3 opacity-30" />
              <p className="font-bold mb-1">لا توجد أقسام بعد</p>
              <p className="text-sm">ابدأ بإنشاء قسم أولاً (يستطيع المدير فقط).</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ section, classes: sectionClasses }) => {
                const isCollapsed = collapsed[section.id];
                const totalStudents = sectionClasses.reduce((sum, c) => sum + (studentCounts[c.id] || 0), 0);
                return (
                  <div key={section.id} className="bg-black/30 rounded-2xl border border-indigo-500/20 overflow-hidden">
                    {/* رأس القسم */}
                    <div className="flex items-center justify-between p-4 bg-indigo-900/20 border-b border-indigo-500/20">
                      <button
                        onClick={() => toggleCollapse(section.id)}
                        className="flex items-center gap-3 flex-1 text-right"
                      >
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                          <FaFolderOpen className="text-white text-sm" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold">{section.name}</p>
                          <p className="text-xs text-indigo-300">
                            {sectionClasses.length} شعبة • {totalStudents} طالب
                          </p>
                        </div>
                        {isCollapsed ? <FaChevronDown className="text-indigo-400" /> : <FaChevronUp className="text-indigo-400" />}
                      </button>
                      {isManager && (
                        <button
                          onClick={() => handleDeleteSection(section)}
                          className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1.5 rounded-lg ms-2 inline-flex items-center gap-1"
                          title="حذف القسم"
                        >
                          <FaTrashAlt />
                        </button>
                      )}
                    </div>

                    {/* شعب القسم */}
                    {!isCollapsed && (
                      <div className="p-3 space-y-2">
                        {sectionClasses.length === 0 ? (
                          <p className="text-gray-500 text-sm text-center py-4">لا توجد شعب في هذا القسم.</p>
                        ) : (
                          sectionClasses.map(cls => {
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
                              <div key={cls.id} className="p-3 bg-black/40 rounded-xl border border-gray-700 flex flex-wrap justify-between items-center gap-2">
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
                                <div className="flex gap-1.5 flex-wrap">
                                  <button
                                    onClick={() => openMoveClass(cls)}
                                    className="text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1"
                                    title="نقل لقسم آخر"
                                  >
                                    <FaFolderOpen /> نقل
                                  </button>
                                  <button
                                    onClick={() => openGenderChange(cls)}
                                    className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1"
                                  >
                                    <FaExchangeAlt /> تغيير الجنس
                                  </button>
                                  <button
                                    onClick={() => handleDelete(cls)}
                                    className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1"
                                  >
                                    <FaTrashAlt />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ✅ مودال نقل شعبة بين الأقسام */}
      {showMoveClassModal && movingClass && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={() => setShowMoveClassModal(false)}>
          <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-indigo-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-indigo-300">نقل الشعبة إلى قسم آخر</h3>
              <button onClick={() => setShowMoveClassModal(false)} className="text-gray-400 hover:text-white"><FaTimes /></button>
            </div>
            <p className="text-sm text-gray-300 mb-3">الشعبة: <strong>{movingClass.name}</strong></p>
            <label className="block text-sm text-gray-300 mb-1">القسم الجديد</label>
            <select
              value={targetSectionId}
              onChange={e => setTargetSectionId(e.target.value)}
              className="w-full bg-gray-800 text-right p-2 rounded-lg text-white border border-gray-600 mb-3"
            >
              <option value="">اختر القسم</option>
              {sections.filter(s => s.id !== movingClass.sectionId).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={handleMoveClassSubmit}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-bold"
            >
              نقل
            </button>
          </div>
        </div>
      )}

      {/* ✅ مودال تغيير جنس الشعبة */}
      {showGenderChangeModal && genderChangeClass && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4" onClick={() => !checkingAffected && setShowGenderChangeModal(false)}>
          <div className="bg-gray-900 p-6 rounded-2xl max-w-lg w-full border border-purple-500/30 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-purple-300">تغيير جنس الشعبة</h3>
              <button onClick={() => setShowGenderChangeModal(false)} className="text-gray-400 hover:text-white"><FaTimes /></button>
            </div>
            <p className="text-sm text-gray-300 mb-3">الشعبة: <strong>{genderChangeClass.name}</strong></p>
            <label className="block text-sm text-gray-300 mb-1">الجنس الجديد</label>
            <select
              value={newGenderForChange}
              onChange={e => setNewGenderForChange(e.target.value)}
              className="w-full bg-gray-800 text-right p-2 rounded-lg text-white border border-gray-600 mb-3"
            >
              <option value={CLASS_GENDER.MALE}>ذكور فقط</option>
              <option value={CLASS_GENDER.FEMALE}>إناث فقط</option>
              <option value={CLASS_GENDER.MIXED}>مختلطة</option>
            </select>

            {affectedStudents.length === 0 ? (
              <button
                onClick={handleGenderChange}
                disabled={checkingAffected}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded-lg font-bold"
              >
                {checkingAffected ? 'جاري الفحص...' : 'فحص وإرسال الطلب للمدير'}
              </button>
            ) : (
              <div>
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl mb-3">
                  <p className="text-amber-200 text-sm font-bold mb-2">⚠️ طلاب متضررين ({affectedStudents.length}):</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {affectedStudents.map(s => (
                      <p key={s.id} className="text-xs text-gray-200">• {s.name} — {s.reason}</p>
                    ))}
                  </div>
                  <p className="text-xs text-amber-300 mt-2">سيُطلب منك نقلهم لشعب متوافقة قبل إتمام التغيير.</p>
                </div>
                <button
                  onClick={() => submitGenderChangeRequest(affectedStudents.map(s => ({ studentId: s.id, studentName: s.name })))}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg font-bold"
                >
                  إرسال طلب التغيير للمدير (مع النقل التلقائي)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassesManagerModal;