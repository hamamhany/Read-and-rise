import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaLayerGroup, FaGraduationCap, FaUsers,
  FaTrashAlt, FaFolder, FaFolderOpen, FaEdit, FaChevronLeft, FaHome,
  FaChalkboardTeacher, FaVenusMars, FaExchangeAlt, FaArrowRight,
  FaArrowLeft, FaTimesCircle, FaBroom
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, getDocs, query, where, doc, getDoc, getCountFromServer
} from 'firebase/firestore';
import {
  createSection, renameSection, getSectionPath,
  moveClassToSection, createClass, deleteClassById,
  getClassStudentCount, findTeacherBySerial, purgeClassesWithoutSection,
  getClassGenderLabel, getTeacherNameForViewer, changeClassTeacher, getClassWarningStats,
  deleteSectionMergingIntoParent, moveSectionContentToSection
} from '../../services/classes';
import { CLASS_GENDER } from '../../constants';
import { sanitizeInput, arabicToEnglishNumber, getNextLessonFromTimes } from '../../utils/helpers';
import { useConfirm, usePrompt } from '../common/ConfirmContext';

/**
 * ✅ إدارة الأقسام — تحميل كسول (Lazy Loading)
 *  - عند الفتح: الأقسام الرئيسية فقط.
 *  - عند الدخول لقسم: أقسامه الفرعية وشعبه فقط (ويُخزَّن مؤقتاً لحين الإغلاق).
 *  - لا تُقرأ ملفات الطلاب إلا عند فتح تفاصيل شعبة أو التحقق من حذفها.
 *  - رقم المعلم يُتحقَّق منه من السيرفر فقط عند الضغط على الزر (إنشاء / تغيير).
 *
 * mode = 'manager'    → صلاحيات كاملة
 * mode = 'supervisor' → إنشاء شعبة + تغيير معلم + تنقل + استعراض
 * mode = 'viewer'     → استعراض فقط
 */
const SectionsManagerModal = ({ isOpen, onClose, user, onCountChange, mode = 'manager' }) => {
  const confirm = useConfirm();
  const prompt = usePrompt();

  const isManager = mode === 'manager';
  const canCreateClass = mode === 'manager' || mode === 'supervisor';
  const canChangeTeacher = mode === 'manager' || mode === 'supervisor';
  const canDeleteClass = mode === 'manager';
  const canMoveClass = mode === 'manager';

  // الأقسام الرئيسية
  const [rootSections, setRootSections] = useState([]);
  const [rootLoaded, setRootLoaded] = useState(false);
  // كاش الأقسام المفتوحة: { [sectionId]: { sections: [], classes: [] } }
  const [cache, setCache] = useState({});
  // كاش المعلمين: { [teacherId]: {...} }
  const [teacherCache, setTeacherCache] = useState({});
  const teacherCacheRef = useRef({});
  const [loading, setLoading] = useState(false);

  // مسار التنقل (مصفوفة أقسام). فارغ = الرئيسية
  const [path, setPath] = useState([]);
  const current = path.length ? path[path.length - 1] : null;
  const currentId = current ? current.id : null;

  // نموذج إضافة شعبة
  const [showClassForm, setShowClassForm] = useState(false);
  const [className, setClassName] = useState('');
  const [teacherSerial, setTeacherSerial] = useState('');
  const [classGender, setClassGender] = useState(CLASS_GENDER.MIXED);
  const [submitting, setSubmitting] = useState(false);

  // وضع النقل (مدير فقط)
  const [moveMode, setMoveMode] = useState(null);

  // تفاصيل الشعبة
  const [detailsClass, setDetailsClass] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // نافذة تغيير المعلم
  const [changeFor, setChangeFor] = useState(null);
  const [changeSerial, setChangeSerial] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [changing, setChanging] = useState(false);

  const viewerGender = isManager ? null : user?.gender;
  const teacherLabel = (t) => getTeacherNameForViewer(t, viewerGender);

  // ---------------- التحميل ----------------
  const loadRoot = async () => {
    const snap = await getDocs(query(collection(db, 'sections'), where('parentId', '==', null)));
    let list = snap.docs.map(d => ({ id: d.id, parentId: null, ...d.data() }));
    if (list.length === 0) {
      // احتياط لأقسام قديمة بدون حقل parentId
      const all = await getDocs(collection(db, 'sections'));
      list = all.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.parentId);
    }
    list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    setRootSections(list);
    setRootLoaded(true);
  };

  const fetchTeachers = async (classList) => {
    const missing = [...new Set(classList.map(c => c.teacherId).filter(Boolean))]
      .filter(id => !teacherCacheRef.current[id]);
    if (missing.length === 0) return;
    const fetched = await Promise.all(missing.map(async (id) => {
      try {
        const s = await getDoc(doc(db, 'profiles', id));
        if (!s.exists()) return [id, { id, name: '', missing: true }];
        const d = s.data();
        return [id, {
          id, name: d.name || '', nickname: d.nickname || '', gender: d.gender || '',
          username: d.username || '', serialNumber: d.serialNumber || ''
        }];
      } catch (e) {
        return [id, { id, name: '', missing: true }];
      }
    }));
    const next = { ...teacherCacheRef.current };
    fetched.forEach(([id, t]) => { next[id] = t; });
    teacherCacheRef.current = next;
    setTeacherCache(next);
  };

  const loadSection = async (sectionId, { force = false } = {}) => {
    if (!force && cache[sectionId]) return;
    const [subSnap, clsSnap] = await Promise.all([
      getDocs(query(collection(db, 'sections'), where('parentId', '==', sectionId))),
      getDocs(query(collection(db, 'classes'), where('sectionId', '==', sectionId)))
    ]);
    const sections = subSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    const classes = clsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
    await fetchTeachers(classes);
    setCache(prev => ({ ...prev, [sectionId]: { sections, classes } }));
  };

  const refreshCount = async () => {
    try {
      const c = await getCountFromServer(collection(db, 'sections'));
      if (onCountChange) onCountChange(c.data().count);
    } catch (e) { /* ignore */ }
  };

  // إعادة تحميل العرض الحالي فقط (بعد أي تعديل)
  const reloadView = async () => {
    setLoading(true);
    try {
      setCache({});
      await loadRoot();
      if (currentId) await loadSection(currentId, { force: true });
      await refreshCount();
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setPath([]);
    setShowClassForm(false);
    setMoveMode(null);
    setTeacherSerial('');
    setCache({});
    setRootLoaded(false);
    teacherCacheRef.current = {};
    setTeacherCache({});
    setLoading(true);
    loadRoot()
      .catch(e => toast.error('فشل التحميل: ' + e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [isOpen]);

  // ---------------- التنقل ----------------
  const enterSection = async (sec) => {
    setShowClassForm(false);
    setPath(prev => [...prev, sec]);
    if (!cache[sec.id]) {
      setLoading(true);
      try { await loadSection(sec.id); }
      catch (e) { toast.error('فشل التحميل: ' + e.message); }
      finally { setLoading(false); }
    }
  };

  const goToIndex = async (idx) => {
    // idx = -1 → الرئيسية
    const next = idx < 0 ? [] : path.slice(0, idx + 1);
    setPath(next);
    setShowClassForm(false);
    const target = next.length ? next[next.length - 1] : null;
    if (target && !cache[target.id]) {
      setLoading(true);
      try { await loadSection(target.id); }
      catch (e) { toast.error('فشل التحميل: ' + e.message); }
      finally { setLoading(false); }
    }
  };

  const goUp = () => goToIndex(path.length - 2);

  const view = currentId ? cache[currentId] : null;
  const subSections = currentId ? (view?.sections || []) : rootSections;
  const currentClasses = currentId ? (view?.classes || []) : [];
  const viewReady = currentId ? !!view : rootLoaded;

  const getTeacherById = (id) => teacherCache[id];

  // ---------------- إضافة قسم (مدير) ----------------
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
      await reloadView();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------------- تعديل اسم القسم (مدير) ----------------
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
      setPath(prev => prev.map(s => s.id === current.id ? { ...s, name: clean } : s));
      await reloadView();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------------- حذف القسم الحالي (مدير) ----------------
  const handleDeleteCurrent = async () => {
    if (!isManager || !current) return;
    if (!current.parentId) {
      toast.error('لا يمكنك حذف قسم رئيسي يجب نقل الشعب إلى مكان اخر', { duration: 6000 });
      return;
    }
    const subCount = view?.sections?.length || 0;
    const classCount = view?.classes?.length || 0;
    const parentName = path.length > 1 ? path[path.length - 2].name : 'الأب';
    const msg = (subCount > 0 || classCount > 0)
      ? `سيتم نقل ${classCount} شعبة و ${subCount} قسم فرعي إلى القسم الأب "${parentName}"، ثم حذف القسم "${current.name}". متابعة؟`
      : `حذف القسم "${current.name}" نهائياً؟`;
    const ok = await confirm('حذف القسم', msg);
    if (!ok) return;
    try {
      await deleteSectionMergingIntoParent(current.id);
      toast.success('✅ تم حذف القسم ونقل محتواه إلى القسم الأب');
      setPath(prev => prev.slice(0, -1));
      setCache({});
      setLoading(true);
      await loadRoot();
      const parent = path.length > 1 ? path[path.length - 2] : null;
      if (parent) await loadSection(parent.id, { force: true });
      await refreshCount();
      setLoading(false);
    } catch (err) {
      setLoading(false);
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------------- إضافة شعبة ----------------
  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!currentId) return;
    if (!className.trim()) return toast.error('اسم الشعبة مطلوب');
    const serial = arabicToEnglishNumber(teacherSerial).trim();
    if (!serial) return toast.error('أدخل الرقم التسلسلي للمعلم');
    setSubmitting(true);
    try {
      // التحقق من السيرفر فقط الآن (عند الضغط على إنشاء)
      const teacher = await findTeacherBySerial(serial);
      if (!teacher) {
        toast.error('الرقم التسلسلي للمعلم غير صحيح');
        return;
      }
      await createClass({
        name: sanitizeInput(className),
        teacherId: teacher.id,
        gender: classGender,
        sectionId: currentId,
        createdBy: user?.id || '',
        createdByName: user?.name || user?.username || ''
      });
      toast.success(`✅ تم إنشاء الشعبة — المعلم: ${teacherLabel(teacher)}`);
      setClassName('');
      setTeacherSerial('');
      setShowClassForm(false);
      await loadSection(currentId, { force: true });
    } catch (err) {
      toast.error('فشل: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------- حذف شعبة (مدير) ----------------
  const handleDeleteClass = async (cls) => {
    if (!canDeleteClass) return;
    try {
      const n = await getClassStudentCount(cls.id);
      if (n > 0) {
        toast.error('لا يمكن حذف شعبة تحتوي على طلاب. أفرغها أولاً.');
        return;
      }
    } catch (e) {
      return toast.error('فشل التحقق من عدد الطلاب: ' + e.message);
    }
    const ok = await confirm('حذف الشعبة', `حذف الشعبة "${cls.name}" نهائياً؟`);
    if (!ok) return;
    try {
      await deleteClassById(cls.id);
      toast.success('تم حذف الشعبة');
      await loadSection(currentId, { force: true });
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  // ---------------- النقل (مدير) ----------------
  const handleStartMoveClass = (cls) => {
    if (!canMoveClass) return;
    setMoveMode({ type: 'class', item: cls });
    setShowClassForm(false);
    setPath([]);
  };

  const handleStartMoveContent = (sec) => {
    if (!isManager) return;
    setMoveMode({ type: 'content', sectionId: sec.id, sectionName: sec.name });
    setShowClassForm(false);
    setPath([]);
  };

  const cancelMove = () => setMoveMode(null);

  const handleTransferTo = async (targetSectionId, targetName = '') => {
    if (!moveMode) return;
    if (!targetSectionId) {
      toast.error('لا يمكن النقل إلى الصفحة الرئيسية. اختر قسماً.');
      return;
    }
    try {
      if (moveMode.type === 'class') {
        if (targetSectionId === moveMode.item.sectionId) {
          return toast.error('الشعبة موجودة في هذا القسم أصلاً');
        }
        await moveClassToSection(moveMode.item.id, targetSectionId);
        toast.success(`✅ تم نقل الشعبة إلى: ${targetName}`);
      } else {
        if (targetSectionId === moveMode.sectionId) {
          return toast.error('لا يمكن النقل إلى نفس القسم');
        }
        if (path.some(s => s.id === moveMode.sectionId)) {
          return toast.error('لا يمكن نقل المحتوى إلى قسم يقع داخل نفس القسم');
        }
        await moveSectionContentToSection(moveMode.sectionId, targetSectionId);
        toast.success(`✅ تم نقل محتوى القسم إلى: ${targetName}`);
      }
      setMoveMode(null);
      await reloadView();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  const handleTransferHere = () => handleTransferTo(currentId, current?.name || '');

  // ---------------- تفاصيل الشعبة ----------------
  const openDetails = async (cls) => {
    setDetailsClass(cls);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const [stats, teacherLessonsSnap] = await Promise.all([
        getClassWarningStats(cls.id),
        cls.teacherId ? getDoc(doc(db, 'teachers', cls.teacherId)).catch(() => null) : Promise.resolve(null)
      ]);
      const lessonTimes = teacherLessonsSnap?.exists?.() ? (teacherLessonsSnap.data().lessonTimes || []) : [];
      setDetails({ ...stats, nextLesson: getNextLessonFromTimes(lessonTimes) });
    } catch (e) {
      toast.error('فشل تحميل تفاصيل الشعبة: ' + e.message);
      setDetails({ studentsCount: 0, studentsWithWarnings: 0, totalWarnings: 0, nextLesson: null });
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => { setDetailsClass(null); setDetails(null); };

  // ---------------- تغيير المعلم (مشرف + مدير) ----------------
  const openChangeTeacher = (cls) => {
    setChangeFor(cls);
    setChangeSerial('');
    setChangeReason('');
  };

  const handleChangeTeacher = async () => {
    if (!canChangeTeacher || !changeFor) return;
    const serial = arabicToEnglishNumber(changeSerial).trim();
    if (!serial) return toast.error('أدخل الرقم التسلسلي للمعلم الجديد');
    setChanging(true);
    try {
      const teacher = await findTeacherBySerial(serial);
      if (!teacher) {
        toast.error('الرقم التسلسلي للمعلم غير صحيح');
        return;
      }
      if (teacher.id === changeFor.teacherId) {
        toast.error('هذا المعلم هو معلم الشعبة بالفعل');
        return;
      }
      const ok = await confirm(
        'تغيير المعلم',
        `سيصبح معلم الشعبة "${changeFor.name}": ${teacherLabel(teacher)} (#${teacher.serialNumber}). متابعة؟`
      );
      if (!ok) return;
      await changeClassTeacher(changeFor.id, teacher.id, {
        byId: user?.id || '',
        byName: user?.name || user?.username || '',
        reason: sanitizeInput(changeReason)
      });
      toast.success('✅ تم تغيير المعلم وإبلاغ المدير لإرسال الإشعارات');
      setChangeFor(null);
      closeDetails();
      await loadSection(currentId, { force: true });
    } catch (err) {
      toast.error('فشل: ' + err.message);
    } finally {
      setChanging(false);
    }
  };

  // ---------------- تنظيف يدوي (مدير) ----------------
  const handleManualPurge = async () => {
    if (!isManager) return;
    const ok = await confirm('تنظيف الشعب اليتيمة', 'سيتم فحص كل الشعب والأقسام وحذف الشعب التي لا تتبع أي قسم (عملية تقرأ كل البيانات). متابعة؟');
    if (!ok) return;
    try {
      const removed = await purgeClassesWithoutSection({ cleanSections: true });
      toast.success(removed > 0 ? `تم حذف ${removed} شعبة يتيمة` : 'لا توجد شعب يتيمة');
      await reloadView();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  if (!isOpen) return null;

  const isTransferDisabled = (() => {
    if (!moveMode) return true;
    if (!currentId) return true;
    if (moveMode.type === 'class') return currentId === moveMode.item.sectionId;
    if (moveMode.type === 'content') {
      if (currentId === moveMode.sectionId) return true;
      if (path.some(s => s.id === moveMode.sectionId)) return true;
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
                  ? 'أقسام داخل أقسام — مثل المجلدات (يُحمَّل كل قسم عند فتحه فقط)'
                  : mode === 'supervisor'
                    ? 'تنقّل بين الأقسام — يُحمَّل كل قسم عند فتحه فقط'
                    : 'استعراض الأقسام'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isManager && (
              <button onClick={handleManualPurge} title="تنظيف الشعب اليتيمة" className="text-gray-400 hover:text-amber-300 text-lg"><FaBroom /></button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
          </div>
        </div>

        {/* مسار التنقل */}
        <div className="px-5 py-3 border-b border-gray-700 flex flex-wrap items-center gap-1 text-sm">
          {current ? (
            <>
              <button onClick={() => goToIndex(-1)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-gray-300 hover:bg-gray-800">
                <FaHome /> الرئيسية
              </button>
              {path.map((node, i) => (
                <React.Fragment key={node.id}>
                  <FaChevronLeft className="text-gray-600 text-xs" />
                  <button
                    onClick={() => goToIndex(i)}
                    className={`px-2 py-1 rounded-lg ${i === path.length - 1 ? 'text-teal-300 font-bold' : 'text-gray-300 hover:bg-gray-800'}`}
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
              <button onClick={cancelMove} className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                <FaTimesCircle /> إلغاء النقل
              </button>
            </div>
          </div>
        )}

        {/* أزرار القسم الحالي */}
        {!moveMode && (
          <div className="px-5 py-3 border-b border-gray-700 flex flex-wrap gap-2">
            {current && (
              <button onClick={goUp} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                <FaArrowRight /> رجوع
              </button>
            )}
            {isManager && (
              <button onClick={handleAddSection} className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold">
                <FaPlus /> {current ? 'إضافة قسم داخله' : 'إضافة قسم رئيسي'}
              </button>
            )}
            {current && canCreateClass && (
              <button onClick={() => setShowClassForm(v => !v)} className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold">
                <FaGraduationCap /> {showClassForm ? 'إغلاق نموذج الشعبة' : 'إضافة شعبة'}
              </button>
            )}
            {current && isManager && (
              <>
                <button onClick={handleRename} className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                  <FaEdit /> تعديل الاسم
                </button>
                <button onClick={() => handleStartMoveContent(current)} className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                  <FaExchangeAlt /> نقل محتوى هذا القسم
                </button>
                <button onClick={handleDeleteCurrent} className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
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
                إضافة شعبة داخل: <strong className="text-teal-300">{path.map(p => p.name).join(' / ')}</strong>
              </p>
              <div>
                <label className="block text-xs text-gray-400 mb-1">اسم الشعبة <span className="text-red-400">*</span></label>
                <input
                  type="text" value={className} onChange={e => setClassName(e.target.value)}
                  placeholder="مثال: علم التجويد المستوى الأول"
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600" required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">الرقم التسلسلي للمعلم <span className="text-red-400">*</span></label>
                  <input
                    type="text" inputMode="numeric" dir="ltr"
                    value={teacherSerial} onChange={e => setTeacherSerial(arabicToEnglishNumber(e.target.value))}
                    placeholder="اكتب الرقم التسلسلي للمعلم"
                    className="w-full bg-gray-700 text-center p-2 rounded-lg text-white text-sm border border-gray-600 font-mono tracking-widest"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">يتم التحقق من الرقم عند الضغط على "إنشاء الشعبة".</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">جنس الشعبة <span className="text-red-400">*</span></label>
                  <select
                    value={classGender} onChange={e => setClassGender(e.target.value)}
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  >
                    <option value={CLASS_GENDER.MALE}>ذكور فقط</option>
                    <option value={CLASS_GENDER.FEMALE}>إناث فقط</option>
                    <option value={CLASS_GENDER.MIXED}>مختلطة</option>
                  </select>
                </div>
              </div>
              <button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold">
                {submitting ? 'جاري التحقق والإنشاء...' : 'إنشاء الشعبة'}
              </button>
            </form>
          )}

          {(loading || !viewReady) ? (
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
                    {subSections.map(sec => (
                      <div key={sec.id} className="p-3 bg-black/30 rounded-xl border border-gray-700 hover:border-teal-500/50 transition flex items-center gap-2">
                        <button onClick={() => enterSection(sec)} className="flex-1 text-right flex items-center gap-3 min-w-0">
                          <FaFolder className="text-amber-400 text-3xl flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm truncate">{sec.name}</p>
                            <p className="text-[11px] text-gray-500 mt-1">اضغط للفتح</p>
                          </div>
                          <FaChevronLeft className="text-gray-500 flex-shrink-0" />
                        </button>
                        {isManager && !moveMode && (
                          <button onClick={() => handleStartMoveContent(sec)} className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 p-2 rounded-lg inline-flex items-center flex-shrink-0" title="نقل محتوى القسم">
                            <FaExchangeAlt />
                          </button>
                        )}
                        {moveMode && (
                          <button onClick={() => handleTransferTo(sec.id, sec.name)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg inline-flex items-center gap-1 flex-shrink-0 font-bold" title="نقل هنا">
                            <FaArrowLeft />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* الشعب داخل القسم */}
              {current && currentClasses.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">الشعب ({currentClasses.length})</p>
                  <div className="space-y-2">
                    {currentClasses.map(cls => {
                      const teacherName = teacherLabel(getTeacherById(cls.teacherId));
                      const genderColor = cls.gender === CLASS_GENDER.MALE
                        ? 'text-blue-300 bg-blue-500/10 border-blue-500/30'
                        : cls.gender === CLASS_GENDER.FEMALE
                          ? 'text-pink-300 bg-pink-500/10 border-pink-500/30'
                          : 'text-purple-300 bg-purple-500/10 border-purple-500/30';
                      return (
                        <div
                          key={cls.id}
                          onClick={() => !moveMode && openDetails(cls)}
                          className={`p-4 bg-black/30 rounded-xl border border-gray-700 flex flex-wrap justify-between items-center gap-3 ${moveMode ? '' : 'cursor-pointer hover:border-indigo-500/50 transition'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-sm flex items-center gap-2">
                              <FaGraduationCap className="text-indigo-300" /> {cls.name}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="text-xs text-gray-400 flex items-center gap-1"><FaChalkboardTeacher /> {teacherName}</span>
                              <span className={`text-xs px-2 py-0.5 rounded border ${genderColor}`}>
                                <FaVenusMars className="inline me-1" /> {getClassGenderLabel(cls.gender)}
                              </span>
                            </div>
                          </div>
                          {!moveMode && (canMoveClass || canDeleteClass || canChangeTeacher) && (
                            <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                              {canMoveClass && (
                                <button onClick={() => handleStartMoveClass(cls)} className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                                  <FaExchangeAlt /> نقل
                                </button>
                              )}
                              {canDeleteClass && (
                                <button onClick={() => handleDeleteClass(cls)} className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                                  <FaTrashAlt /> حذف
                                </button>
                              )}
                              {/* أقصى اليسار: تغيير المعلم */}
                              {canChangeTeacher && (
                                <button onClick={() => openChangeTeacher(cls)} className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1 font-bold">
                                  <FaChalkboardTeacher /> تغيير معلم
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

      {/* نافذة تفاصيل الشعبة */}
      {detailsClass && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); closeDetails(); }} dir="rtl">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto border border-indigo-500/40 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4 gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FaGraduationCap className="text-indigo-300" /> {detailsClass.name}
                </h3>
                {path.length > 0 && <p className="text-xs text-gray-400 mt-1">{path.map(p => p.name).join(' / ')}</p>}
              </div>
              <button onClick={closeDetails} className="text-gray-400 hover:text-white text-xl"><FaTimes /></button>
            </div>

            {detailsLoading || !details ? (
              <div className="text-center py-8 text-gray-400">
                <FaSpinner className="animate-spin text-2xl mx-auto mb-2" /> جاري التحميل...
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 flex items-center gap-2"><FaUsers /> عدد الطلاب</span>
                  <span className="text-cyan-300 font-bold">{details.studentsCount}</span>
                </div>
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400">الحصة القادمة</span>
                  <span className="text-white font-bold" dir="ltr">
                    {details.nextLesson
                      ? details.nextLesson.toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
                      : 'غير محددة'}
                  </span>
                </div>
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 flex items-center gap-2"><FaChalkboardTeacher /> المعلم</span>
                  <span className="text-white font-bold">{teacherLabel(getTeacherById(detailsClass.teacherId))}</span>
                </div>
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400 flex items-center gap-2"><FaVenusMars /> جنس الشعبة</span>
                  <span className="text-white font-bold">{getClassGenderLabel(detailsClass.gender)}</span>
                </div>
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400">الطلاب أصحاب الإنذارات</span>
                  <span className="text-amber-300 font-bold">{details.studentsWithWarnings}</span>
                </div>
                <div className="flex justify-between bg-black/30 p-3 rounded-lg border border-gray-700">
                  <span className="text-gray-400">مجموع الإنذارات داخل الشعبة</span>
                  <span className="text-red-300 font-bold">{details.totalWarnings}</span>
                </div>
                {canChangeTeacher && (
                  <button
                    onClick={() => { const c = detailsClass; closeDetails(); openChangeTeacher(c); }}
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <FaChalkboardTeacher /> تغيير معلم الشعبة
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* نافذة تغيير المعلم */}
      {changeFor && (
        <div className="fixed inset-0 bg-black/70 z-[90] flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); if (!changing) setChangeFor(null); }} dir="rtl">
          <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-emerald-500/40 p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><FaChalkboardTeacher className="text-emerald-300" /> تغيير معلم الشعبة</h3>
                <p className="text-xs text-gray-400 mt-1">الشعبة: {changeFor.name} — المعلم الحالي: {teacherLabel(getTeacherById(changeFor.teacherId))}</p>
              </div>
              <button onClick={() => setChangeFor(null)} disabled={changing} className="text-gray-400 hover:text-white text-xl"><FaTimes /></button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">الرقم التسلسلي للمعلم الجديد <span className="text-red-400">*</span></label>
              <input
                type="text" inputMode="numeric" dir="ltr" autoFocus
                value={changeSerial} onChange={e => setChangeSerial(arabicToEnglishNumber(e.target.value))}
                placeholder="مثال: 20260001"
                className="w-full bg-gray-700 text-center p-2 rounded-lg text-white text-sm border border-gray-600 font-mono tracking-widest"
              />
              <p className="text-[11px] text-gray-500 mt-1">يتم التحقق من الرقم عند الضغط على "تغيير".</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">سبب إعفاء المعلم السابق (اختياري — يظهر في رسالته)</label>
              <textarea
                rows={2} maxLength={200} value={changeReason} onChange={e => setChangeReason(e.target.value)}
                className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
              />
            </div>
            <button
              onClick={handleChangeTeacher}
              disabled={changing || !changeSerial.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold"
            >
              {changing ? 'جاري التحقق والتغيير...' : 'تغيير المعلم'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionsManagerModal;
