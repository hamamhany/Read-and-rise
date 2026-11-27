// src/components/panels/RegistrationRequestsSection.jsx
// المشرف: طلبات التسجيل الفردي — استلام، تواصل، موافقة، رفض، لا يوجد رد، المعلّقة
// لا يُحمَّل شيء حتى يضغط المشرف على "فتح"
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  FaUserPlus, FaSpinner, FaSyncAlt, FaSearch, FaWhatsapp, FaCheckCircle,
  FaTimesCircle, FaHourglassHalf, FaInbox, FaRedoAlt, FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { callRegistrationApi } from '../../services/registration';
import {
  sendRegistrationVoiceVerifyMessage, sendRegistrationParentMessage
} from '../../utils/whatsapp';
import { useConfirm } from '../common/ConfirmContext';

const REJECT_REASONS = [
  'بيانات غير صحيحة أو غير مطابقة',
  'الاسم غير مكتمل',
  'العمر غير مطابق لشروط الشعبة',
  'رقم الهاتف غير صحيح أو لا يخص الطالب',
  'لم يتم إثبات الجنس',
  'لم يلتزم ولي الأمر بالشروط المطلوبة',
  'أخرى'
];

const KIND_LABEL = {
  voice: '🎙️ تحقق صوتي (طالبة)',
  parent: '👩‍👦 موافقة الوالدة (شعبة مختلطة)',
  none: 'بدون تحقق إضافي'
};

const HOUR = 3600 * 1000;

const RegistrationRequestsSection = ({ gender = '' }) => {
  const confirm = useConfirm();
  const isFemale = gender === 'أنثى';
  const isMale = gender === 'ذكر';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);          // طلباتي + المعلّقة
  const [avail, setAvail] = useState(null);          // المتاحة — null = لم تُحمَّل بعد
  const [availLoading, setAvailLoading] = useState(false);
  const [tab, setTab] = useState('open'); // open | available | suspended
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [detailId, setDetailId] = useState(null); // الطلب المفتوح في النافذة المنبثقة
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectCustom, setRejectCustom] = useState('');
  const [, forceTick] = useState(0);

  // طلباتي + المعلّقة (تُحمَّل عند فتح القسم)
  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      setData(await callRegistrationApi('list', { scope: 'mine' }, { authed: true }));
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // المتاحة — لا تُحمَّل إلا عند الضغط على زر "طلبات متاحة"
  const loadAvail = useCallback(async () => {
    setAvailLoading(true);
    try {
      const res = await callRegistrationApi('list', { scope: 'available' }, { authed: true });
      setAvail(res.available || []);
    } catch (e) {
      toast.error('فشل تحميل الطلبات المتاحة: ' + e.message);
    } finally {
      setAvailLoading(false);
    }
  }, []);

  // تحديث ما تم تحميله فقط
  const refresh = useCallback(async () => {
    await loadMine();
    if (avail !== null || tab === 'available') await loadAvail();
  }, [loadMine, loadAvail, avail, tab]);

  const openTab = (id) => {
    setTab(id);
    if (id === 'available' && avail === null && !availLoading) loadAvail();
  };

  useEffect(() => {
    if (open && !data) loadMine();
    // eslint-disable-next-line
  }, [open]);

  // تحديث العدّادات (الوقت المتبقي) كل دقيقة بدون أي طلب للسيرفر
  useEffect(() => {
    if (!open) return undefined;
    const t = setInterval(() => forceTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [open]);

  const act = async (id, action, extra = {}, okMsg = '') => {
    setBusyId(id);
    try {
      const res = await callRegistrationApi(action, { id, ...extra }, { authed: true });
      if (okMsg) toast.success(okMsg);
      await refresh();
      return res;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const handleClaim = (r) => act(r.id, 'claim', {}, '✅ تم استلام الطلب — يظهر الآن في "طلباتي"');

  const handleContact = async (r) => {
    const sent = r.kind === 'parent'
      ? sendRegistrationParentMessage(r.phone, r.requestNumber)
      : sendRegistrationVoiceVerifyMessage(r.phone, r.requestNumber);
    if (!sent) return;
    // نسجّل وقت الإرسال (يبدأ منه عدّاد 48 ساعة)
    await act(r.id, 'contacted');
  };

  const handleApprove = async (r) => {
    const ok = await confirm('الموافقة على الطلب', `سيتم إنشاء حساب للطالب "${r.name}" وإرسال الطلب للمدير لإبلاغه. متابعة؟`);
    if (!ok) return;
    const res = await act(r.id, 'decide', { decision: 'approve' });
    if (res) { toast.success(`✅ تمت الموافقة — الرقم التسلسلي: ${res.serialNumber}`); setDetailId(null); }
  };

  const submitReject = async () => {
    if (!rejectFor) return;
    const reason = rejectReason === 'أخرى' ? rejectCustom.trim() : rejectReason;
    if (!reason) return toast.error('اكتب سبب الرفض');
    const r = rejectFor;
    setRejectFor(null);
    const res = await act(r.id, 'decide', { decision: 'reject', reason });
    if (res) { toast.success('تم رفض الطلب وإرساله للمدير لإبلاغ الطالب'); setDetailId(null); }
  };

  const handleNoReply = async (r) => {
    const ok = await confirm('لا يوجد رد من الطالب', 'سينتقل الطلب إلى قائمة "المعلّقة" لمدة 15 يوماً، وبعدها يُحذف تلقائياً إن لم تعيديه. ويمكنك استلام طلب جديد الآن. متابعة؟');
    if (!ok) return;
    const res = await act(r.id, 'noreply', {}, 'انتقل الطلب إلى المعلّقة');
    if (res) setDetailId(null);
  };

  const handleReadd = async (r) => {
    const res = await act(r.id, 'readd', {}, 'أُعيد الطلب إلى طلباتك المفتوحة');
    if (res) setDetailId(null);
  };

  const q = search.trim();
  const match = (r) => !q || String(r.requestNumber).includes(q);

  const openList = (data?.open || []).filter(match);
  const availList = (avail || []).filter(match);
  const suspList = (data?.suspended || []).filter(match);

  const openCount = data?.open?.length || 0;
  const max = data?.max || 10;

  const timeLeftForNoReply = (r) => {
    if (!r.messageSentAt) return null;
    const left = r.messageSentAt + 48 * HOUR - Date.now();
    return left;
  };

  const fmtLeft = (ms) => {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / 60000);
    return `${h} ساعة و${m} دقيقة`;
  };

  const tabBtn = (id, label, n) => (
    <button
      onClick={() => openTab(id)}
      className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tab === id ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-200'}`}
    >
      {label} {n != null ? `(${n})` : ''}
    </button>
  );

  return (
    <div className="bg-teal-50 dark:bg-gray-800/60 rounded-2xl border border-teal-200 dark:border-teal-500/30 overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full p-6 flex justify-between items-center gap-3 text-right hover:bg-teal-100/50 dark:hover:bg-gray-700/30 transition">
        <div>
          <h3 className="text-xl font-semibold text-teal-800 dark:text-teal-200 flex items-center gap-2"><FaUserPlus /> طلبات التسجيل الفردي</h3>
          <p className="text-xs text-teal-700 dark:text-teal-400 mt-1">
            {data ? `طلباتي المفتوحة: ${openCount}/${max}` : 'اضغط للفتح (لا يتم تحميل شيء قبل الفتح)'}
          </p>
        </div>
        {open ? <FaChevronUp className="text-teal-600" /> : <FaChevronDown className="text-teal-600" />}
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabBtn('open', 'طلباتي', data ? openCount : null)}
            {tabBtn('available', 'طلبات متاحة', avail !== null ? avail.length : null)}
            {tabBtn('suspended', 'المعلّقة', data ? data.suspended.length : null)}
            <button onClick={refresh} disabled={loading || availLoading} className="mr-auto text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white" title="تحديث">
              <FaSyncAlt className={(loading || availLoading) ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="relative">
            <FaSearch className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
            <input
              value={search} onChange={e => setSearch(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="ابحث برقم الطلب (الرقم الذي أُرسل للطالب)"
              className="w-full bg-white dark:bg-gray-800 text-right pr-9 pl-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm" dir="rtl"
            />
          </div>

          {(tab === 'available' ? (availLoading && avail === null) : (loading && !data)) ? (
            <div className="text-center py-6 text-slate-400"><FaSpinner className="animate-spin text-2xl mx-auto mb-2" />جاري التحميل...</div>
          ) : (
            <>
              {/* ============ طلباتي ============ */}
              {tab === 'open' && (
                openList.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-gray-400 py-6"><FaInbox className="inline me-2" />{q ? 'لا يوجد طلب بهذا الرقم ضمن طلباتك.' : `لا توجد طلبات مفتوحة. ${isFemale ? 'استلمي' : 'استلم'} طلباً من "طلبات متاحة".`}</p>
                ) : (
                  <div className="space-y-2">
                    {openList.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setDetailId(r.id)}
                        className="w-full text-right p-3 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-500/60 flex items-center justify-between gap-3 transition"
                      >
                        <span className="font-bold text-slate-900 dark:text-white truncate">{r.name}</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0" dir="ltr">#{r.requestNumber}</span>
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* ============ المتاحة ============ */}
              {tab === 'available' && (
                <>
                  <p className="text-xs text-slate-500 dark:text-gray-400">
                    طلباتك المفتوحة: <strong>{openCount}/{max}</strong>. أول من يستلم الطلب يصبح له وحده. التفاصيل تظهر بعد الاستلام.
                  </p>
                  {isMale && <p className="text-xs text-blue-600 dark:text-blue-300">بصفتك مشرفاً (ذكر) تظهر لك طلبات شعب الذكور فقط.</p>}
                  {isFemale && <p className="text-xs text-pink-600 dark:text-pink-300">بصفتك مشرفة (أنثى) تظهر لك طلبات شعب الإناث والشعب المختلطة.</p>}
                  {!isMale && !isFemale && <p className="text-xs text-red-600 dark:text-red-300">جنس حسابك غير محدد، لذلك لن تظهر لك أي طلبات. تواصل مع المدير.</p>}
                  {availList.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-gray-400 py-6"><FaInbox className="inline me-2" />لا توجد طلبات متاحة الآن.</p>
                  ) : (
                    <div className="space-y-2">
                      {availList.map(r => (
                        <div key={r.id} className="p-3 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-gray-700 flex flex-wrap justify-between items-center gap-2">
                          <div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">الشعبة: {r.className}</p>
                            <p className="text-[11px] text-slate-500 dark:text-gray-400">{KIND_LABEL[r.kind]} • رقم الطلب <span className="font-mono" dir="ltr">{r.requestNumber}</span></p>
                          </div>
                          <button onClick={() => handleClaim(r)} disabled={busyId === r.id || openCount >= max} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-bold">
                            استلام الطلب
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ============ المعلّقة ============ */}
              {tab === 'suspended' && (
                suspList.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-gray-400 py-6"><FaInbox className="inline me-2" />لا توجد طلبات معلّقة.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-gray-400">الطلب المعلّق يبقى {data?.suspendedDays || 15} يوماً ثم يُحذف تلقائياً ويُرسل المدير إشعار الحذف للطالب. اضغط على الطلب لعرض تفاصيله أو إعادته.</p>
                    {suspList.map(r => (
                      <button
                        key={r.id}
                        onClick={() => setDetailId(r.id)}
                        className="w-full text-right p-3 rounded-xl bg-white dark:bg-black/30 border border-amber-300 dark:border-amber-500/30 hover:border-amber-500 flex items-center justify-between gap-3 transition"
                      >
                        <span className="font-bold text-slate-900 dark:text-white truncate">{r.name}</span>
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0" dir="ltr">#{r.requestNumber}</span>
                      </button>
                    ))}
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* نافذة تفاصيل الطلب */}
      {(() => {
        const r = [...(data?.open || []), ...(data?.suspended || [])].find(x => x.id === detailId);
        if (!r) return null;
        const isSusp = r.status === 'suspended';
        const left = timeLeftForNoReply(r);
        const needsContact = r.kind === 'voice' || r.kind === 'parent';
        const busy = busyId === r.id;
        const daysLeft = Math.max(0, Math.ceil((r.suspendedAt + (data?.suspendedDays || 15) * 24 * HOUR - Date.now()) / (24 * HOUR)));
        return (
          <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={() => setDetailId(null)} dir="rtl">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3 border border-teal-300 dark:border-teal-500/30" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{r.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">رقم الطلب: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-300" dir="ltr">{r.requestNumber}</span></p>
                </div>
                <button onClick={() => setDetailId(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-xl">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 dark:bg-black/30 rounded-lg p-2"><p className="text-[11px] text-slate-500 dark:text-gray-400">العمر</p><p className="text-slate-900 dark:text-white font-bold">{r.age}</p></div>
                <div className="bg-slate-50 dark:bg-black/30 rounded-lg p-2"><p className="text-[11px] text-slate-500 dark:text-gray-400">الجنس</p><p className="text-slate-900 dark:text-white font-bold">{r.gender}</p></div>
                <div className="bg-slate-50 dark:bg-black/30 rounded-lg p-2"><p className="text-[11px] text-slate-500 dark:text-gray-400">رقم الهاتف</p><p className="text-slate-900 dark:text-white font-bold" dir="ltr">{r.phone}</p></div>
                <div className="bg-slate-50 dark:bg-black/30 rounded-lg p-2"><p className="text-[11px] text-slate-500 dark:text-gray-400">الشعبة</p><p className="text-slate-900 dark:text-white font-bold">{r.className}</p></div>
              </div>

              <p className="text-xs text-slate-600 dark:text-gray-300">{KIND_LABEL[r.kind]}</p>

              {r.kind === 'voice' && (
                <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-300 dark:border-pink-500/30 rounded-lg p-2 text-xs text-pink-800 dark:text-pink-200">
                  تم اختيار الجنس <strong>أنثى</strong>، يرجى التأكد قبل الموافقة. استخدم زر "تواصل مع الطالب" لطلب رسالة صوتية بصوتها.
                </div>
              )}
              {r.kind === 'parent' && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-500/30 rounded-lg p-2 text-xs text-purple-800 dark:text-purple-200">
                  طالب <strong>ذكر</strong> في شعبة <strong>مختلطة</strong> (العمر {r.age}). يلزم رسالة من والدته تتضمن حضورها حصصه وعدم سماع أي ذكر فوق 12 سنة لأصوات المشرفات.
                </div>
              )}

              {isSusp ? (
                <>
                  <p className="text-sm text-red-600 dark:text-red-300">هذا الطلب معلّق، ويُحذف بعد {daysLeft} يوم إن لم تُعِده.</p>
                  <button onClick={() => handleReadd(r)} disabled={busy || openCount >= max} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-3 py-2.5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2">
                    <FaRedoAlt /> إعادة إضافة لطلباتي
                  </button>
                </>
              ) : (
                <>
                  {needsContact && (
                    <div className="text-xs">
                      {r.messageSentAt ? (
                        <p className="text-slate-600 dark:text-gray-300">
                          أُرسلت رسالة التواصل: {new Date(r.messageSentAt).toLocaleString('ar-EG')} •{' '}
                          {left > 0
                            ? <span className="text-amber-600 dark:text-amber-300">زر "لا يوجد رد" يتفعّل بعد {fmtLeft(left)}</span>
                            : <span className="text-green-600 dark:text-green-300">زر "لا يوجد رد" متاح الآن</span>}
                        </p>
                      ) : (
                        <p className="text-amber-600 dark:text-amber-300">لم تُرسَل رسالة التواصل بعد — مطلوبة قبل الموافقة.</p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {needsContact && (
                      <button onClick={() => handleContact(r)} disabled={busy} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2">
                        <FaWhatsapp /> {r.kind === 'parent' ? 'تواصل مع والدة الطالب' : 'تواصل مع الطالب'}
                      </button>
                    )}
                    <button onClick={() => handleApprove(r)} disabled={busy || (needsContact && !r.messageSentAt)} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2">
                      <FaCheckCircle /> موافقة
                    </button>
                    <button onClick={() => { setRejectFor(r); setRejectReason(REJECT_REASONS[0]); setRejectCustom(''); }} disabled={busy} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2">
                      <FaTimesCircle /> رفض
                    </button>
                    {needsContact && (
                      <button onClick={() => handleNoReply(r)} disabled={busy || !(left <= 0)} className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2">
                        <FaHourglassHalf /> لا يوجد رد من الطالب
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* نافذة سبب الرفض */}
      {rejectFor && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4" onClick={() => setRejectFor(null)} dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md p-5 space-y-3 border border-red-300 dark:border-red-500/30" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-600 dark:text-red-300">رفض الطلب #{rejectFor.requestNumber}</h3>
            <p className="text-sm text-slate-600 dark:text-gray-300">اختر سبب الرفض (إلزامي) — سيظهر في رسالة الطالب.</p>
            <select value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full bg-slate-50 dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm">
              {REJECT_REASONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            {rejectReason === 'أخرى' && (
              <textarea rows={3} maxLength={300} value={rejectCustom} onChange={e => setRejectCustom(e.target.value)} placeholder="اكتب السبب..." className="w-full bg-slate-50 dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-lg text-slate-900 dark:text-white text-sm" />
            )}
            <div className="flex gap-2">
              <button onClick={() => setRejectFor(null)} className="flex-1 bg-slate-200 dark:bg-gray-700 text-slate-800 dark:text-white py-2 rounded-lg text-sm">إلغاء</button>
              <button onClick={submitReject} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold">تأكيد الرفض</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistrationRequestsSection;