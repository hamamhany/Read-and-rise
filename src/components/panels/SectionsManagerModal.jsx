import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaLayerGroup, FaGraduationCap, FaUsers, FaTrashAlt
} from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  getSections, createSection, deleteSection,
  getClassStudentCounts, purgeClassesWithoutSection
} from '../../services/classes';
import { sanitizeInput } from '../../utils/helpers';
import { useConfirm } from '../common/ConfirmContext';

/**
 * ✅ إدارة الأقسام — خاصة بالمدير فقط
 * كل شعبة يجب أن تكون داخل قسم
 */
const SectionsManagerModal = ({ isOpen, onClose, user, onCountChange }) => {
  const confirm = useConfirm();
  const [sections, setSections] = useState([]);
  const [classes, setClasses] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) loadData();
    // eslint-disable-next-line
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      // ✅ حذف فوري لأي شعبة قديمة بدون قسم
      const removed = await purgeClassesWithoutSection();
      if (removed > 0) toast.success(`تم حذف ${removed} شعبة قديمة بدون قسم`);

      const [secs, classesSnap, counts] = await Promise.all([
        getSections(),
        getDocs(collection(db, 'classes')),
        getClassStudentCounts()
      ]);
      setSections(secs);
      setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setStudentCounts(counts);
      if (onCountChange) onCountChange(secs.length);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const clean = sanitizeInput(newName);
    if (!clean) return toast.error('اسم القسم مطلوب');
    setSubmitting(true);
    try {
      await createSection({ name: clean, createdBy: user?.id });
      toast.success('✅ تم إنشاء القسم');
      setNewName('');
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (section) => {
    const sectionClasses = classes.filter(c => c.sectionId === section.id);
    const studentsTotal = sectionClasses.reduce((sum, c) => sum + (studentCounts[c.id] || 0), 0);
    if (studentsTotal > 0) {
      toast.error('لا يمكن حذف قسم فيه طلاب. انقل الطلاب أولاً.');
      return;
    }
    const msg = sectionClasses.length > 0
      ? `حذف القسم "${section.name}" سيحذف أيضاً ${sectionClasses.length} شعبة بداخله نهائياً. متابعة؟`
      : `حذف القسم "${section.name}" نهائياً؟`;
    const ok = await confirm('حذف القسم', msg);
    if (!ok) return;
    try {
      await deleteSection(section.id);
      toast.success('تم حذف القسم');
      await loadData();
    } catch (err) {
      toast.error('فشل: ' + err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-teal-500/30" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
              <FaLayerGroup className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الأقسام</h3>
              <p className="text-xs text-gray-400">كل شعبة يجب أن تكون داخل قسم • {sections.length} قسم</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <form onSubmit={handleCreate} className="p-5 border-b border-gray-700 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="اسم القسم الجديد (مثال: قسم القرآن الكريم)"
            className="flex-1 bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
          >
            <FaPlus /> {submitting ? 'جاري...' : 'إضافة قسم'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : sections.length === 0 ? (
            <p className="text-gray-400 text-center py-8">لا توجد أقسام بعد. أنشئ قسماً ليتمكن المشرفون من إضافة الشعب.</p>
          ) : (
            <div className="space-y-2">
              {sections.map(section => {
                const sectionClasses = classes.filter(c => c.sectionId === section.id);
                const studentsTotal = sectionClasses.reduce((sum, c) => sum + (studentCounts[c.id] || 0), 0);
                return (
                  <div key={section.id} className="p-4 bg-black/30 rounded-xl border border-gray-700">
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm">{section.name}</p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          <span className="text-xs text-indigo-300 flex items-center gap-1">
                            <FaGraduationCap /> {sectionClasses.length} شعبة
                          </span>
                          <span className="text-xs text-cyan-300 flex items-center gap-1">
                            <FaUsers /> {studentsTotal} طالب
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(section)}
                        className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
                      >
                        <FaTrashAlt /> حذف
                      </button>
                    </div>
                    {sectionClasses.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {sectionClasses.map(c => (
                          <span key={c.id} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
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

export default SectionsManagerModal;