import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaLayerGroup, FaGraduationCap, FaUsers,
  FaTrashAlt, FaFolder, FaFolderOpen, FaEdit, FaChevronLeft, FaHome,
  FaChalkboardTeacher, FaVenusMars, FaExchangeAlt, FaArrowRight,
  FaSearch, FaArrowLeft, FaTimesCircle
} from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  getSections, createSection, renameSection,
  getDescendantSectionIds, getSectionPath,
  moveClassToSection, createClass, deleteClassById,
  getClassStudentCounts, purgeClassesWithoutSection,
  getClassGenderLabel, getTeacherDisplayName,
  deleteSectionMergingIntoParent, moveSectionContentToSection
} from '../../services/classes';
import { CLASS_GENDER } from '../../constants';
import { sanitizeInput } from '../../utils/helpers';
import { useConfirm, usePrompt } from '../common/ConfirmContext';

/**
 * ✅ إدارة الأقسام
 * mode = 'manager'    → صلاحيات كاملة (كل شيء)
 * mode = 'supervisor' → إنشاء شعبة فقط + تنقل + استعراض (بدون حذف/نقل/إدارة أقسام)
 * mode = 'viewer'     → استعراض فقط
 */
const SectionsManagerModal = ({ isOpen, onClose, user, onCountChange, mode = 'manager' }) => {
  const confirm = useConfirm();
  const prompt = usePrompt();

  const isManager = mode === 'manager';
  // ✅ المشرف يقدر ينشئ شعبة فقط
  const canCreateClass = mode === 'manager' || mode === 'supervisor';
  // ✅ الحذف والنقل للمدير فقط
  const canDeleteClass = mode === 'manager';
  const canMoveClass = mode === 'manager';

  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(false);

  // null = الصفحة الرئيسية (الأقسام الرئيسية)
  const [currentId, setCurrentId] = useState(null);

  // نموذج إضافة شعبة
  const [showClassForm, setShowClassForm] = useState(false);
  const [className, setClassName] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');
  const [classGender, setClassGender] = useState(CLASS_GENDER.MIXED);
  const [submitting, setSubmitting] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  // وضع النقل (مدير فقط)
  const [moveMode, setMoveMode] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentId(null);
      setShowClassForm(false);
      setMoveMode(null);
      setTeacherSearch('');
      loadData();
    }
    // eslint-disable-next-line
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // ✅ حذف فوري لأي شعبة قديمة بدون قسم (+ أقسام يتيمة للمدير فقط)
      const removed = await purgeClassesWithoutSection({ cleanSections: isManager });
      if (removed > 0) toast.success(`تم حذف ${removed} شعبة قديمة بدون قسم`);

      const [secs, classesSnap, teachersSnap, counts] = await Promise.all([
        getSections(),
        getDocs(collection(db, 'classes')),
        getDocs(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
        getClassStudentCounts()
      ]);
      setSections(secs);
      setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const teachersList = teachersSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
        nickname: d.data().nickname || '',
        gender: d.data().gender || '',
        username: d.data().username || '',
        serialNumber: d.data().serialNumber || d.data().serial || ''
      }));
      setTeachers(teachersList);
      setClassTeacherId(prev => prev || teachersList[0]?.id || '');
      setStudentCounts(counts);
      if (onCountChange) onCountChange(secs.length);

      // إذا القسم المفتوح انحذف نرجع للرئيسية
      setCurrentId(prev => (prev && !secs.some(s => s.id === prev)) ? null : prev);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const current = sections.find(s => s.id === currentId) || null;
  const subSections = sections.filter(s => (s.parentId || null) === currentId);
  const currentClasses = currentId ? classes.filter(c => c.sectionId === currentId) : [];

  // مسار التنقل (breadcrumb)
  const breadcrumb = [];
  {
    let node = current;
    let guard = 0;
    while (node && guard < 30) {
      breadcrumb.unshift(node);
      const parentId = node.parentId;
      node = parentId ? sections.find(s => s.id === parentId) : null;
      guard++;
    }
  }

  // عدد الطلاب والشعب داخل قسم (يشمل الأقسام الفرعية)
  const getSectionStats = (sectionId) => {
    const ids = [sectionId, ...getDescendantSectionIds(sections, sectionId)];
    const secClasses = classes.filter(c => ids.includes(c.sectionId));
    const students = secClasses.reduce((sum, c) => sum + (studentCounts[c.id] || 0), 0);
    return { subCount: ids.length - 1, classCount: secClasses.length, students };
  };

  const getTeacherById = (id) => teachers.find(t => t.id === id);

  // ---------- إضافة قسم (مدير فقط) ----------
  const handleAddSection = async () => {
    if (!isManager) return;
    const value = await prompt(
      current ? `إضافة قسم داخل "${current.name}"` : 'إضافة قسم رئيسي',
      'اكتب اسم القسم',
      ''
    );
    if (value === null) return;
    const clean = sanitizeInput(value);
    if (!clean) return toast.error('اسم القسم مطلوب');
    try {
      await createSection({ name: clean, createdBy: user?.id, parentId: currentId });
      toast.success('✅ تم إنشاء القسم');
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------- تعديل اسم القسم (مدير فقط) ----------
  const handleRename = async () => {
    if (!isManager || !current) return;
    const value = await prompt('تعديل اسم القسم', 'اكتب الاسم الجديد', current.name);
    if (value === null) return;
    const clean = sanitizeInput(value);
    if (!clean) return toast.error('اسم القسم مطلوب');
    if (clean === current.name) return;
    try {
      await renameSection(current.id, clean);
      toast.success('✅ تم تعديل الاسم');
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------- حذف القسم الحالي (مدير فقط) ----------
  const handleDeleteCurrent = async () => {
    if (!isManager || !current) return;

    const isRoot = !current.parentId;
    if (isRoot) {
      toast.error('لا يمكنك حذف قسم رئيسي يجب نقل الشعب إلى مكان اخر', { duration: 6000 });
      return;
    }

    const stats = getSectionStats(current.id);
    const parentName = sections.find(s => s.id === current.parentId)?.name || 'الأب';
    const msg = (stats.subCount > 0 || stats.classCount > 0)
      ? `سيتم نقل ${stats.classCount} شعبة و ${stats.subCount} قسم فرعي إلى القسم الأب "${parentName}"، ثم حذف القسم "${current.name}". متابعة؟`
      : `حذف القسم "${current.name}" نهائياً؟`;
    const ok = await confirm('حذف القسم', msg);
    if (!ok) return;
    try {
      const parent = current.parentId;
      await deleteSectionMergingIntoParent(current.id);
      toast.success('✅ تم حذف القسم ونقل محتواه إلى القسم الأب');
      setCurrentId(parent);
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------- إضافة شعبة داخل القسم الحالي ----------
  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!currentId) return;
    if (!className.trim()) return toast.error('اسم الشعبة مطلوب');
    if (!classTeacherId) return toast.error('اختر معلم الشعبة');
    setSubmitting(true);
    try {
      await createClass({
        name: sanitizeInput(className),
        teacherId: classTeacherId,
        gender: classGender,
        sectionId: currentId
      });
      toast.success('✅ تم إنشاء الشعبة');
      setClassName('');
      setTeacherSearch('');
      setShowClassForm(false);
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- حذف شعبة (مدير فقط) ----------
  const handleDeleteClass = async (cls) => {
    if (!canDeleteClass) return;
    if ((studentCounts[cls.id] || 0) > 0) {
      toast.error('لا يمكن حذف شعبة تحتوي على طلاب. أفرغها أولاً.');
      return;
    }
    const ok = await confirm('حذف الشعبة', `حذف الشعبة "${cls.name}" نهائياً؟`);
    if (!ok) return;
    try {
      await deleteClassById(cls.id);
      toast.success('تم حذف الشعبة');
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------- بدء وضع نقل شعبة (مدير فقط) ----------
  const handleStartMoveClass = (cls) => {
    if (!canMoveClass) return;
    setMoveMode({ type: 'class', item: cls });
    setShowClassForm(false);
    setCurrentId(null);
  };

  // ---------- بدء وضع نقل محتوى قسم (مدير فقط) ----------
  const handleStartMoveContent = (sec) => {
    if (!isManager) return;
    const stats = getSectionStats(sec.id);
    if (stats.subCount === 0 && stats.classCount === 0) {
      toast.error('هذا القسم لا يحتوي على أي محتوى لنقله');
      return;
    }
    setMoveMode({ type: 'content', sectionId: sec.id, sectionName: sec.name });
    setShowClassForm(false);
    setCurrentId(null);
  };

  const cancelMove = () => setMoveMode(null);

  const handleTransferTo = async (targetSectionId) => {
    if (!moveMode) return;

    if (moveMode.type === 'class') {
      if (targetSectionId === moveMode.item.sectionId) {
        toast.error('الشعبة موجودة في هذا القسم أصلاً');
        return;
      }
      if (!targetSectionId) {
        toast.error('لا يمكن نقل الشعبة إلى الصفحة الرئيسية. اختر قسماً.');
        return;
      }
      try {
        await moveClassToSection(moveMode.item.id, targetSectionId);
        const targetName = sections.find(s => s.id === targetSectionId)?.name || '';
        toast.success(`✅ تم نقل الشعبة إلى: ${targetName}`);
        setMoveMode(null);
        await loadData();
      } catch (err) {
        toast.error('فشل: ' + err.message);
      }
      return;
    }

    if (moveMode.type === 'content') {
      if (!targetSectionId) {
        toast.error('لا يمكن نقل المحتوى إلى الصفحة الرئيسية. اختر قسماً.');
        return;
      }
      if (targetSectionId === moveMode.sectionId) {
        toast.error('لا يمكن النقل إلى نفس القسم');
        return;
      }
      const descendants = getDescendantSectionIds(sections, moveMode.sectionId);
      if (descendants.includes(targetSectionId)) {
        toast.error('لا يمكن نقل المحتوى إلى قسم يقع داخل نفس القسم');
        return;
      }
      try {
        await moveSectionContentToSection(moveMode.sectionId, targetSectionId);
        const targetName = sections.find(s => s.id === targetSectionId)?.name || '';
        toast.success(`✅ تم نقل محتوى القسم إلى: ${targetName}`);
        setMoveMode(null);
        await loadData();
      } catch (err) {
        toast.error('فشل: ' + err.message);
      }
    }
  };

  const handleTransferHere = () => handleTransferTo(currentId);
  const goUp = () => setCurrentId(current?.parentId || null);

  // فلترة المعلمين حسب البحث
  const filteredTeachers = teachers.filter(t => {
    const q = teacherSearch.trim();
    if (!q) return true;
    return (
      (t.serialNumber || '').includes(q) ||
      (t.name || '').includes(q) ||
      (t.nickname || '').includes(q) ||
      (t.username || '').includes(q)
    );
  });

  if (!isOpen) return null;

  const isTransferDisabled = (() => {
    if (!moveMode) return true;
    if (!currentId) return true;
    if (moveMode.type === 'class') return currentId === moveMode.item.sectionId;
    if (moveMode.type === 'content') {
      if (currentId === moveMode.sectionId) return true;
      const desc = getDescendantSectionIds(sections, moveMode.sectionId);
      if (desc.includes(currentId)) return true;
      return false;
    }
    return true;
  })();

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-teal-500/30" onClick={e => e.stopPropagation()} dir="rtl">

        {/* الرأس */}
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
              <FaLayerGroup className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-white">إدارة الأقسام</h3>
              <p className="text-xs text-gray-400">
                {isManager
                  ? 'أقسام داخل أقسام — مثل المجلدات'
                  : mode === 'supervisor'
                    ? 'إضافة شعب داخل الأقسام — تنقّل ثم اضغط "إضافة شعبة"'
                    : 'استعراض الأقسام'} • {sections.length} قسم
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl flex-shrink-0"><FaTimes /></button>
        </div>

        {/* مسار التنقل — زر الرئيسية يظهر فقط لما تكون داخل قسم */}
        <div className="px-5 py-3 border-b border-gray-700 flex flex-wrap items-center gap-1 text-sm">
          {current ? (
            <>
              <button
                onClick={() => setCurrentId(null)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-gray-300 hover:bg-gray-800"
              >
                <FaHome /> الرئيسية
              </button>
              {breadcrumb.map((node, i) => (
                <React.Fragment key={node.id}>
                  <FaChevronLeft className="text-gray-600 text-xs" />
                  <button
                    onClick={() => setCurrentId(node.id)}
                    className={`px-2 py-1 rounded-lg ${i === breadcrumb.length - 1 ? 'text-teal-300 font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
                  >
                    {node.name}
                  </button>
                </React.Fragment>
              ))}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-teal-300 font-bold">
              <FaHome /> الرئيسية
            </span>
          )}
        </div>

        {/* شريط وضع النقل */}
        {moveMode && (
          <div className="px-5 py-3 border-b border-gray-700 bg-blue-900/30 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-blue-200 min-w-0">
              {moveMode.type === 'class' ? (
                <>📦 وضع نقل الشعبة: <strong className="text-blue-100">"{moveMode.item.name}"</strong> — تنقّل للقسم المطلوب ثم اضغط "نقل هنا"</>
              ) : (
                <>📂 وضع نقل محتوى القسم: <strong className="text-blue-100">"{moveMode.sectionName}"</strong> — تنقّل للقسم المطلوب ثم اضغط "نقل هنا"</>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleTransferHere}
                disabled={isTransferDisabled}
                className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold"
              >
                <FaArrowLeft /> نقل هنا
              </button>
              <button
                onClick={cancelMove}
                className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
              >
                <FaTimesCircle /> إلغاء النقل
              </button>
            </div>
          </div>
        )}

        {/* أزرار القسم الحالي */}
        {!moveMode && (
          <div className="px-5 py-3 border-b border-gray-700 flex flex-wrap gap-2">
            {current && (
              <button
                onClick={goUp}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
              >
                <FaArrowRight /> رجوع
              </button>
            )}
            {/* إضافة قسم — مدير فقط */}
            {isManager && (
              <button
                onClick={handleAddSection}
                className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold"
              >
                <FaPlus /> {current ? 'إضافة قسم داخله' : 'إضافة قسم رئيسي'}
              </button>
            )}
            {/* إضافة شعبة — مدير + مشرف (لكن لازم يكون داخل قسم) */}
            {current && canCreateClass && (
              <button
                onClick={() => setShowClassForm(v => !v)}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold"
              >
                <FaGraduationCap /> {showClassForm ? 'إغلاق نموذج الشعبة' : 'إضافة شعبة'}
              </button>
            )}
            {/* أدوات القسم — مدير فقط */}
            {current && isManager && (
              <>
                <button
                  onClick={handleRename}
                  className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                >
                  <FaEdit /> تعديل الاسم
                </button>
                <button
                  onClick={() => handleStartMoveContent(current)}
                  className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                >
                  <FaExchangeAlt /> نقل محتوى هذا القسم
                </button>
                <button
                  onClick={handleDeleteCurrent}
                  className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                >
                  <FaTrashAlt /> حذف القسم
                </button>
              </>
            )}
          </div>
        )}

        {/* المحتوى */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {showClassForm && current && canCreateClass && (
            <form onSubmit={handleAddClass} className="bg-gray-800/50 p-4 rounded-xl border border-indigo-500/20 space-y-3">
              <p className="text-xs text-gray-400">
                إضافة شعبة داخل: <strong className="text-teal-300">{getSectionPath(sections, current.id)}</strong>
              </p>
              <div>
                <label className="block text-xs text-gray-400 mb-1">اسم الشعبة <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={className}
                  onChange={e => setClassName(e.target.value)}
                  placeholder="مثال: علم التجويد المستوى الأول"
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">معلم الشعبة <span className="text-red-400">*</span></label>
                  <div className="relative mb-1">
                    <FaSearch className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs" />
                    <input
                      type="text"
                      value={teacherSearch}
                      onChange={e => setTeacherSearch(e.target.value)}
                      placeholder="ابحث بالرقم التسلسلي أو الاسم"
                      className="w-full bg-gray-700 text-right p-2 pr-7 rounded-lg text-white text-xs border border-gray-600"
                    />
                  </div>
                  <select
                    value={classTeacherId}
                    onChange={e => setClassTeacherId(e.target.value)}
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                    required
                  >
                    <option value="">اختر المعلم</option>
                    {filteredTeachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {getTeacherDisplayName(t)}
                        {t.serialNumber ? ` — #${t.serialNumber}` : (t.username ? ` — ${t.username}` : '')}
                      </option>
                    ))}
                  </select>
                  {filteredTeachers.length === 0 && teacherSearch && (
                    <p className="text-[11px] text-red-400 mt-1">لا يوجد معلم مطابق للبحث</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">جنس الشعبة <span className="text-red-400">*</span></label>
                  <select
                    value={classGender}
                    onChange={e => setClassGender(e.target.value)}
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  >
                    <option value={CLASS_GENDER.MALE}>ذكور فقط</option>
                    <option value={CLASS_GENDER.FEMALE}>إناث فقط</option>
                    <option value={CLASS_GENDER.MIXED}>مختلطة</option>
                  </select>
                </div>
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

          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : (
            <>
              {/* الأقسام الفرعية */}
              {subSections.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">{current ? 'الأقسام الفرعية' : 'الأقسام الرئيسية'} ({subSections.length})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {subSections.map(sec => {
                      const stats = getSectionStats(sec.id);
                      return (
                        <div
                          key={sec.id}
                          className="p-3 bg-black/30 rounded-xl border border-gray-700 hover:border-teal-500/50 transition flex items-center gap-2"
                        >
                          <button
                            onClick={() => { setCurrentId(sec.id); setShowClassForm(false); }}
                            className="flex-1 text-right flex items-center gap-3 min-w-0"
                          >
                            <FaFolder className="text-amber-400 text-3xl flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold text-sm truncate">{sec.name}</p>
                              <p className="text-[11px] text-gray-400 mt-1">
                                {stats.subCount} قسم • {stats.classCount} شعبة • {stats.students} طالب
                              </p>
                            </div>
                            <FaChevronLeft className="text-gray-500 flex-shrink-0" />
                          </button>
                          {isManager && !moveMode && (
                            <button
                              onClick={() => handleStartMoveContent(sec)}
                              className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 p-2 rounded-lg inline-flex items-center flex-shrink-0"
                              title="نقل محتوى القسم"
                            >
                              <FaExchangeAlt />
                            </button>
                          )}
                          {moveMode && (
                            <button
                              onClick={() => handleTransferTo(sec.id)}
                              className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg inline-flex items-center gap-1 flex-shrink-0 font-bold"
                              title="نقل هنا"
                            >
                              <FaArrowLeft />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* الشعب داخل القسم */}
              {current && currentClasses.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">الشعب ({currentClasses.length})</p>
                  <div className="space-y-2">
                    {currentClasses.map(cls => {
                      const teacherName = getTeacherDisplayName(getTeacherById(cls.teacherId));
                      const genderColor = cls.gender === CLASS_GENDER.MALE
                        ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
                        : cls.gender === CLASS_GENDER.FEMALE
                          ? 'text-pink-300 bg-pink-500/10 border-pink-500/30'
                          : 'text-purple-300 bg-purple-500/10 border-purple-500/30';
                      return (
                        <div key={cls.id} className="p-4 bg-black/30 rounded-xl border border-gray-700 flex flex-wrap justify-between items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm flex items-center gap-2">
                              <FaGraduationCap className="text-indigo-300" /> {cls.name}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="text-xs text-gray-400 flex items-center gap-1"><FaChalkboardTeacher /> {teacherName}</span>
                              <span className="text-xs text-cyan-300 flex items-center gap-1"><FaUsers /> {studentCounts[cls.id] || 0} طالب</span>
                              <span className={`text-xs px-2 py-0.5 rounded border ${genderColor}`}>
                                <FaVenusMars className="inline me-1" /> {getClassGenderLabel(cls.gender)}
                              </span>
                            </div>
                          </div>
                          {/* ✅ أزرار النقل والحذف — تظهر فقط للمدير */}
                          {!moveMode && (canMoveClass || canDeleteClass) && (
                            <div className="flex gap-2 flex-wrap">
                              {canMoveClass && (
                                <button
                                  onClick={() => handleStartMoveClass(cls)}
                                  className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                                >
                                  <FaExchangeAlt /> نقل
                                </button>
                              )}
                              {canDeleteClass && (
                                <button
                                  onClick={() => handleDeleteClass(cls)}
                                  className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                                >
                                  <FaTrashAlt /> حذف
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* حالة فارغة */}
              {subSections.length === 0 && (!current || currentClasses.length === 0) && !showClassForm && !moveMode && (
                <div className="text-center py-10 text-gray-400">
                  <FaFolderOpen className="text-5xl mx-auto mb-3 text-gray-600" />
                  {current
                    ? <p>هذا القسم فارغ.{canCreateClass ? ' اضغط "إضافة شعبة" لإنشاء شعبة هنا.' : ''}</p>
                    : <p>{isManager ? 'لا توجد أقسام بعد. اضغط "إضافة قسم رئيسي" للبدء.' : 'لا توجد أقسام بعد.'}</p>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SectionsManagerModal;