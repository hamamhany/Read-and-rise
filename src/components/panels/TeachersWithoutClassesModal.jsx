// src/components/panels/TeachersWithoutClassesModal.jsx
// المدير: المعلمون الذين لا توجد لهم شعب — مع التفاصيل ومنذ متى وسجل التعديلات
// التحميل كسول: لا شيء يُقرأ إلا عند فتح النافذة، والسجل يُقرأ عند الضغط على "عرض السجل" فقط
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaSpinner, FaUserClock, FaSearch, FaSyncAlt, FaPhone, FaHistory,
  FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getTeacherHistory, getLastReliefMap, TEACHER_EVENT_LABELS } from '../../services/teacherHistory';

const toMs = (t) => (t?.seconds ? t.seconds * 1000 : (t?.toDate ? t.toDate().getTime() : 0));
const fmtDateTime = (ms) =>
  ms ? new Date(ms).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const durationLabel = (ms) => {
  if (!ms) return 'غير معروف';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'منذ يوم';
  if (days < 30) return `منذ ${days} يوماً`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهراً${days % 30 ? ` و${days % 30} يوماً` : ''}`;
  const years = Math.floor(months / 12);
  return `منذ ${years} سنة${months % 12 ? ` و${months % 12} شهراً` : ''}`;
};

const TeachersWithoutClassesModal = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [historyMap, setHistoryMap] = useState({});     // { teacherId: [events] }
  const [historyLoading, setHistoryLoading] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [teachersSnap, classesSnap] = await Promise.all([
        getDocs(query(collection(db, 'profiles'), where('role', '==', 'teacher'))),
        getDocs(collection(db, 'classes'))
      ]);
      const busy = new Set(classesSnap.docs.map(d => d.data().teacherId).filter(Boolean));
      const idle = teachersSnap.docs
        .filter(d => !busy.has(d.id))
        .map(d => ({ id: d.id, ...d.data() }));

      const lastRelief = idle.length ? await getLastReliefMap(idle.map(t => t.id)) : {};
      const list = idle.map(t => {
        const relief = lastRelief[t.id];
        const sinceMs = relief ? toMs(relief.at) : toMs(t.createdAt);
        return {
          ...t,
          sinceMs,
          sinceLabel: relief ? `آخر إعفاء: ${relief.className || 'شعبة'}` : 'منذ إنشاء الحساب (لم يُكلَّف بشعبة بعد)'
        };
      }).sort((a, b) => (a.sinceMs || 0) - (b.sinceMs || 0));
      setRows(list);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setOpenId(null);
    setHistoryMap({});
    load();
    // eslint-disable-next-line
  }, [isOpen]);

  const toggleHistory = async (t) => {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    if (historyMap[t.id]) return;
    setHistoryLoading(t.id);
    try {
      const h = await getTeacherHistory(t.id);
      setHistoryMap(prev => ({ ...prev, [t.id]: h }));
    } catch (e) {
      toast.error('فشل تحميل السجل: ' + e.message);
    } finally {
      setHistoryLoading(null);
    }
  };

  if (!isOpen) return null;

  const q = search.trim();
  const filtered = rows.filter(t => {
    if (!q) return true;
    return (t.name || '').includes(q) || (t.serialNumber || '').includes(q) || (t.phone || '').includes(q) || (t.username || '').includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-emerald-300 dark:border-emerald-500/30" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center"><FaUserClock className="text-white" /></div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">المعلمون بدون شعب</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">{loading ? 'جاري التحميل...' : `${rows.length} معلم بلا شعب حالياً`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} title="تحديث" className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><FaSyncAlt className={loading ? 'animate-spin' : ''} /></button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-2xl"><FaTimes /></button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-200 dark:border-gray-700">
          <div className="relative">
            <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو الرقم التسلسلي أو الهاتف..." className="w-full bg-slate-50 dark:bg-gray-800 text-right pr-9 pl-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-slate-400"><FaSpinner className="animate-spin text-3xl mx-auto mb-2" />جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-gray-400 py-10">لا يوجد معلمون بدون شعب 🎉</p>
          ) : filtered.map(t => {
            const history = historyMap[t.id];
            return (
              <div key={t.id} className="p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-black/30">
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white">{t.name || t.username}</p>
                    <div className="text-xs text-slate-500 dark:text-gray-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>الرقم التسلسلي: <strong className="font-mono text-slate-800 dark:text-gray-200">{t.serialNumber || '—'}</strong></span>
                      <span>الجنس: {t.gender || '—'}</span>
                      {t.age ? <span>العمر: {t.age}</span> : null}
                      {t.phone && <span dir="ltr"><FaPhone className="inline me-1" />{t.phone}</span>}
                      {t.username && <span>المستخدم: {t.username}</span>}
                      {t.country && <span>الدولة: {t.country}</span>}
                      {t.nickname && <span>اللقب: {t.nickname}</span>}
                      <span>الحساب: {t.isProfileComplete ? 'مفعّل' : 'غير مفعّل'}{t.isFrozen ? ' • مجمّد' : ''}</span>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-300">{durationLabel(t.sinceMs)}</p>
                    <p className="text-[11px] text-slate-500 dark:text-gray-400">{fmtDateTime(t.sinceMs)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-2">{t.sinceLabel}</p>

                <button onClick={() => toggleHistory(t)} className="mt-3 text-xs bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                  <FaHistory /> سجل التعديلات {openId === t.id ? <FaChevronUp /> : <FaChevronDown />}
                </button>

                {openId === t.id && (
                  <div className="mt-3 border-t border-slate-200 dark:border-gray-700 pt-3">
                    {historyLoading === t.id ? (
                      <p className="text-sm text-slate-400"><FaSpinner className="animate-spin inline me-2" />جاري تحميل السجل...</p>
                    ) : !history || history.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-gray-400">لا توجد تعديلات مسجّلة على هذا الحساب.</p>
                    ) : (
                      <ol className="space-y-2">
                        {history.map(ev => (
                          <li key={ev.id} className="text-sm flex flex-wrap gap-x-3 gap-y-1 items-baseline">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${ev.type === 'assigned' ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>
                              {TEACHER_EVENT_LABELS[ev.type] || ev.type}
                            </span>
                            <span className="text-slate-800 dark:text-gray-200 font-medium">{ev.className || 'شعبة'}</span>
                            <span className="text-[11px] text-slate-500 dark:text-gray-400">{fmtDateTime(toMs(ev.at))}</span>
                            {ev.byName && <span className="text-[11px] text-slate-500 dark:text-gray-400">بواسطة: {ev.byName}</span>}
                            {ev.reason && <span className="text-[11px] text-amber-600 dark:text-amber-300">السبب: {ev.reason}</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeachersWithoutClassesModal;
