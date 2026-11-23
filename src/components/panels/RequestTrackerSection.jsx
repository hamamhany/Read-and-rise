import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FaSearch, FaSpinner, FaArrowLeft, FaCheckCircle, FaTimesCircle, FaRoute } from 'react-icons/fa';
import { findChangeRequestsByCode, normalizeRequestCode } from '../../services/requestCodes';
import { approveStudentChanges, rejectStudentChanges } from '../../services/supervisor';
import { PENDING_FIELD_LABELS } from '../../constants';
import { useConfirm } from '../common/ConfirmContext';

const STATUS_UI = {
  pending: { label: '⏳ بانتظار القرار', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200 border-yellow-300 dark:border-yellow-500/30' },
  approved: { label: '✅ تمت الموافقة', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200 border-green-300 dark:border-green-500/30' },
  rejected: { label: '❌ تم الرفض', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 border-red-300 dark:border-red-500/30' }
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ar-EG');
};

// 🔎 متابعة سير الطلبات: بحث برمز الطلب (REQ-1001) ثم الموافقة/الرفض كما يفعل المشرف
const RequestTrackerSection = ({ user }) => {
  const confirm = useConfirm();
  const [code, setCode] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const search = async (rawCode = code) => {
    const normalized = normalizeRequestCode(rawCode);
    if (!normalized) return toast.error('اكتب رمز الطلب أولاً');
    setSearching(true);
    try {
      const list = await findChangeRequestsByCode(normalized);
      setResults(list);
      if (list.length === 0) toast.error('لم يتم العثور على طلب بهذا الرمز');
    } catch (e) {
      toast.error('فشل البحث: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  const actorName = user.name || user.username || 'المدير';

  const approve = async (student, request) => {
    const ok = await confirm('الموافقة على التعديلات', `سيتم تطبيق تعديلات الطالب "${student.name}" (طلب ${request.code}). متابعة؟`);
    if (!ok) return;
    setProcessing(true);
    try {
      await approveStudentChanges(student.id, user.id, actorName);
      toast.success('✅ تم اعتماد التعديلات وتطبيقها');
      setRejectionReason('');
      await search(request.code);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  const reject = async (student, request) => {
    setProcessing(true);
    try {
      await rejectStudentChanges(student.id, rejectionReason.trim(), user.id, actorName);
      toast.success('تم رفض التعديلات وإبلاغ الطالب');
      setRejectionReason('');
      await search(request.code);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  return (
    <div className="bg-slate-50 dark:bg-gray-800/60 p-6 rounded-2xl border border-indigo-300 dark:border-indigo-500/30">
      <h3 className="text-xl font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-2 mb-1">
        <FaRoute /> متابعة سير الطلبات
      </h3>
      <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">اكتب رمز طلب تعديل البيانات (مثال: REQ-1001) لعرض تفاصيله واتخاذ قرار.</p>

      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          dir="ltr"
          placeholder="REQ-1001"
          className="flex-1 bg-white dark:bg-gray-900 text-slate-900 dark:text-white p-2 rounded-lg border border-slate-300 dark:border-gray-600 font-mono"
        />
        <button onClick={() => search()} disabled={searching} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 rounded-lg font-bold flex items-center gap-2">
          {searching ? <FaSpinner className="animate-spin" /> : <FaSearch />} بحث
        </button>
      </div>

      {results && results.length > 0 && (
        <div className="mt-4 space-y-4">
          {results.map(({ student, request }) => {
            const ui = STATUS_UI[request.status] || STATUS_UI.pending;
            const isPending = request.status === 'pending';
            const entries = Object.entries(request.changes || {});
            return (
              <div key={student.id + request.code} className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-slate-200 dark:border-gray-700 space-y-3">
                <div className="flex justify-between items-start gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{student.name || 'بدون اسم'}</p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">الرقم التسلسلي للطالب: <span dir="ltr">{student.serialNumber || '—'}</span></p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">رقم الطلب: <span dir="ltr" className="font-mono font-bold">{request.code}</span></p>
                    <p className="text-xs text-slate-500 dark:text-gray-400">تاريخ التقديم: {fmtDate(request.submittedAt)}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full border ${ui.cls}`}>{ui.label}</span>
                </div>

                {request.accelerated && isPending && (
                  <p className="text-xs text-orange-700 dark:text-orange-300">⚡ الطالب أرسل طلب تسريع لهذا الطلب.</p>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-gray-300">التعديلات المطلوبة:</h4>
                  {entries.length === 0 && <p className="text-xs text-slate-500 dark:text-gray-400">لا تتوفر تفاصيل التعديلات.</p>}
                  {entries.map(([field, val]) => (
                    <div key={field} className="bg-slate-50 dark:bg-gray-800/60 p-3 rounded-lg border border-slate-200 dark:border-gray-700">
                      <p className="text-xs text-slate-500 dark:text-gray-400 mb-1 font-bold">{PENDING_FIELD_LABELS[field] || field}</p>
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-1 rounded border border-red-300 dark:border-red-500/30">{val?.from || '(فارغ)'}</span>
                        <FaArrowLeft className="text-slate-400 dark:text-gray-500 text-xs" />
                        <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 px-2 py-1 rounded border border-green-300 dark:border-green-500/30 font-bold">{val?.to || '(فارغ)'}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {!isPending && (
                  <div className="text-xs text-slate-600 dark:text-gray-300 space-y-1">
                    <p>تم القرار بواسطة: {request.decidedByName || '—'} • {fmtDate(request.decidedAt)}</p>
                    {request.status === 'rejected' && request.rejectionReason && <p>سبب الرفض: {request.rejectionReason}</p>}
                  </div>
                )}

                {isPending && (
                  <div className="space-y-2">
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="سبب الرفض (اختياري)..."
                      className="w-full bg-white dark:bg-gray-800 text-right p-2 border border-slate-200 dark:border-gray-600 rounded-md text-slate-900 dark:text-white resize-none h-16 text-sm"
                    />
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => approve(student, request)} disabled={processing} className="flex-1 min-w-[140px] bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
                        <FaCheckCircle /> الموافقة وتطبيق
                      </button>
                      <button onClick={() => reject(student, request)} disabled={processing} className="flex-1 min-w-[140px] bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
                        <FaTimesCircle /> رفض التعديلات
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RequestTrackerSection;