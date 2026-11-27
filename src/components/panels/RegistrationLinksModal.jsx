// src/components/panels/RegistrationLinksModal.jsx
// المدير: إنشاء وإدارة روابط التسجيل الفردي — يُحمَّل كل شيء عند الفتح فقط
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaLink, FaCopy, FaTrashAlt, FaPause, FaPlay,
  FaSearch, FaLayerGroup, FaGraduationCap, FaArrowRight
} from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { flattenSectionTree, getSectionPath, getClassGenderLabel } from '../../services/classes';
import {
  listRegistrationLinks, createRegistrationLink, setRegistrationLinkActive,
  deleteRegistrationLink, buildLinkUrl
} from '../../services/registration';
import { useConfirm } from '../common/ConfirmContext';

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('✅ تم نسخ الرابط');
  } catch {
    window.prompt('انسخ الرابط:', text);
  }
};

const fmtDate = (t) => {
  const ms = t?.seconds ? t.seconds * 1000 : (t?.toDate ? t.toDate().getTime() : 0);
  return ms ? new Date(ms).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
};

const RegistrationLinksModal = ({ isOpen, onClose, user }) => {
  const confirm = useConfirm();

  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);

  // معالج إنشاء رابط
  const [wizard, setWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [type, setType] = useState('');
  const [pickLoading, setPickLoading] = useState(false);
  const [items, setItems] = useState([]); // {id, name, path, gender?}
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [expires, setExpires] = useState('0');
  const [creating, setCreating] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  const loadLinks = async () => {
    setLoading(true);
    try {
      setLinks(await listRegistrationLinks());
    } catch (e) {
      toast.error('فشل تحميل الروابط: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setWizard(false);
    setDuplicate(null);
    loadLinks();
    // eslint-disable-next-line
  }, [isOpen]);

  const startWizard = () => {
    setWizard(true);
    setStep(1);
    setType('');
    setItems([]);
    setSelected([]);
    setSearch('');
    setExpires('0');
    setDuplicate(null);
  };

  const chooseType = async (t) => {
    setType(t);
    setStep(2);
    setPickLoading(true);
    setSelected([]);
    setSearch('');
    try {
      const secSnap = await getDocs(collection(db, 'sections'));
      const sections = secSnap.docs.map(d => ({ id: d.id, parentId: null, ...d.data() }));
      if (t === 'sections') {
        setItems(flattenSectionTree(sections).map(s => ({ id: s.id, name: s.name, path: s.path, depth: s.depth })));
      } else {
        const clsSnap = await getDocs(collection(db, 'classes'));
        const list = clsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.sectionId)
          .map(c => ({
            id: c.id, name: c.name || '', gender: c.gender,
            path: getSectionPath(sections, c.sectionId)
          }))
          .sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name, 'ar'));
        setItems(list);
      }
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
      setStep(1);
    } finally {
      setPickLoading(false);
    }
  };

  const toggle = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleCreate = async () => {
    if (selected.length === 0) return toast.error('اختر عنصراً واحداً على الأقل');
    setCreating(true);
    setDuplicate(null);
    try {
      const names = items.filter(i => selected.includes(i.id)).map(i => i.path && type === 'classes' ? `${i.name} (${i.path})` : (i.path || i.name));
      const { id } = await createRegistrationLink({
        type, targetIds: selected, targetNames: names,
        createdBy: user?.id || '', expiresInDays: Number(expires)
      });
      toast.success('✅ تم إنشاء الرابط');
      setWizard(false);
      await loadLinks();
      copyText(buildLinkUrl(id));
    } catch (e) {
      if (e.existing) {
        setDuplicate(e.existing);
        toast.error('يوجد رابط بالفعل لنفس الاختيار — انسخه من الأسفل');
      } else {
        toast.error('فشل: ' + e.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (l) => {
    try {
      await setRegistrationLinkActive(l.id, !l.active);
      setLinks(prev => prev.map(x => x.id === l.id ? { ...x, active: !l.active } : x));
      toast.success(l.active ? 'تم إيقاف الرابط' : 'تم تفعيل الرابط');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  const removeLink = async (l) => {
    const ok = await confirm('حذف الرابط', 'سيتوقف الرابط عن العمل نهائياً. الطلبات المقدمة عبره لا تتأثر. متابعة؟');
    if (!ok) return;
    try {
      await deleteRegistrationLink(l.id);
      setLinks(prev => prev.filter(x => x.id !== l.id));
      toast.success('تم حذف الرابط');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  if (!isOpen) return null;

  const filteredItems = items.filter(i => {
    const q = search.trim();
    if (!q) return true;
    return (i.name || '').includes(q) || (i.path || '').includes(q);
  });

  const isExpired = (l) => {
    const ms = l.expiresAt?.seconds ? l.expiresAt.seconds * 1000 : 0;
    return ms && ms <= Date.now();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-violet-300 dark:border-violet-500/30" onClick={e => e.stopPropagation()} dir="rtl">

        <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center"><FaLink className="text-white" /></div>
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">إضافة طلاب بالتسجيل الفردي</h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">روابط عامة يسجّل منها الطالب بنفسه، ثم يراجعها المشرف</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:text-gray-400 dark:hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!wizard ? (
            <>
              <button onClick={startWizard} className="w-full bg-violet-600 hover:bg-violet-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                <FaPlus /> إنشاء رابط جديد
              </button>

              {loading ? (
                <div className="text-center py-8 text-slate-400"><FaSpinner className="animate-spin text-2xl mx-auto mb-2" />جاري التحميل...</div>
              ) : links.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-gray-400 py-8">لا توجد روابط بعد.</p>
              ) : (
                <div className="space-y-3">
                  {links.map(l => {
                    const url = buildLinkUrl(l.id);
                    const expired = isExpired(l);
                    const live = l.active && !expired;
                    return (
                      <div key={l.id} className={`p-4 rounded-xl border ${live ? 'border-violet-200 dark:border-violet-500/30 bg-slate-50 dark:bg-black/30' : 'border-slate-200 dark:border-gray-700 bg-slate-100 dark:bg-black/20 opacity-80'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300">
                              {l.type === 'sections' ? <><FaLayerGroup className="inline me-1" />أقسام</> : <><FaGraduationCap className="inline me-1" />شعب</>}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${live ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>
                              {expired ? 'منتهي' : l.active ? 'فعّال' : 'موقوف'}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-gray-400">أُنشئ: {fmtDate(l.createdAt)} • ينتهي: {l.expiresAt ? fmtDate(l.expiresAt) : 'بدون'}</span>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => copyText(url)} className="text-xs bg-blue-500/15 hover:bg-blue-500/25 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><FaCopy /> نسخ</button>
                            <button onClick={() => toggleActive(l)} className="text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                              {l.active ? <><FaPause /> إيقاف</> : <><FaPlay /> تفعيل</>}
                            </button>
                            <button onClick={() => removeLink(l)} className="text-xs bg-red-500/15 hover:bg-red-500/25 text-red-700 dark:text-red-300 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><FaTrashAlt /></button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-gray-300 mt-2 leading-relaxed">
                          {(l.targetNames || []).slice(0, 6).join(' • ')}{(l.targetNames || []).length > 6 ? ` … (+${l.targetNames.length - 6})` : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-1 break-all" dir="ltr">{url}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <button onClick={() => (step === 2 ? setStep(1) : setWizard(false))} className="text-xs bg-slate-200 dark:bg-gray-700 text-slate-800 dark:text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1">
                <FaArrowRight /> رجوع
              </button>

              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700 dark:text-gray-300 font-bold">اختر نوع الرابط:</p>
                  <button onClick={() => chooseType('sections')} className="w-full text-right p-4 rounded-xl border border-violet-300 dark:border-violet-500/30 hover:border-violet-500 bg-slate-50 dark:bg-black/30">
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><FaLayerGroup className="text-amber-500" /> أقسام فقط</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">يختار الطالب أي شعبة داخل الأقسام المحددة (بما فيها الأقسام الفرعية).</p>
                  </button>
                  <button onClick={() => chooseType('classes')} className="w-full text-right p-4 rounded-xl border border-violet-300 dark:border-violet-500/30 hover:border-violet-500 bg-slate-50 dark:bg-black/30">
                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><FaGraduationCap className="text-indigo-500" /> شعب فقط</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">شعبة واحدة (تبقى ثابتة) أو عدة شعب من أقسام مختلفة يختار الطالب منها.</p>
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm font-bold text-slate-700 dark:text-gray-300">
                    {type === 'sections' ? 'اختر الأقسام' : 'اختر الشعب'} ({selected.length} مختار)
                  </p>
                  <div className="relative">
                    <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="w-full bg-slate-50 dark:bg-gray-800 text-right pr-9 pl-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm" />
                  </div>

                  {pickLoading ? (
                    <div className="text-center py-6 text-slate-400"><FaSpinner className="animate-spin text-2xl mx-auto mb-2" />جاري التحميل...</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-200 dark:border-gray-700 rounded-xl p-2">
                      {filteredItems.length === 0 ? (
                        <p className="text-center text-slate-400 py-4 text-sm">لا توجد نتائج</p>
                      ) : filteredItems.map(i => {
                        const on = selected.includes(i.id);
                        return (
                          <button key={i.id} onClick={() => toggle(i.id)} className={`w-full p-2.5 rounded-lg border flex items-center gap-3 text-right transition ${on ? 'bg-violet-500/15 border-violet-500' : 'bg-slate-50 dark:bg-gray-800/60 border-slate-200 dark:border-gray-700 hover:border-violet-400/50'}`}>
                            <input type="checkbox" checked={on} readOnly className="accent-violet-500 pointer-events-none" />
                            <div className="flex-1 min-w-0" style={type === 'sections' ? { paddingRight: (i.depth || 0) * 14 } : undefined}>
                              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{i.name}</p>
                              {type === 'classes' && <p className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{i.path} • {getClassGenderLabel(i.gender)}</p>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-500 dark:text-gray-400 mb-1">صلاحية الرابط</label>
                    <select value={expires} onChange={e => setExpires(e.target.value)} className="w-full bg-slate-50 dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm">
                      <option value="0">بدون انتهاء (يمكنك إيقافه متى شئت)</option>
                      <option value="7">ينتهي بعد 7 أيام</option>
                      <option value="30">ينتهي بعد 30 يوماً</option>
                    </select>
                  </div>

                  {duplicate && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/40 rounded-xl p-3 space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-200 font-bold">هناك رابط موجود بالفعل لنفس الاختيار:</p>
                      <p className="text-[11px] text-slate-600 dark:text-gray-300 break-all" dir="ltr">{buildLinkUrl(duplicate.id)}</p>
                      <button onClick={() => copyText(buildLinkUrl(duplicate.id))} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><FaCopy /> نسخ الرابط الموجود</button>
                    </div>
                  )}

                  <button onClick={handleCreate} disabled={creating || selected.length === 0} className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 rounded-xl font-bold">
                    {creating ? 'جاري الإنشاء...' : 'إنشاء الرابط ونسخه'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegistrationLinksModal;
