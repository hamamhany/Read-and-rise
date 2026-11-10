import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaClipboardList, FaCheckCircle, FaBan, FaSpinner } from 'react-icons/fa';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { subscribeReviewRequests } from '../../services/reviewRequests';
import { deleteUserCompletely } from '../../services/accountDeletion';
import { sendPermanentBanMessage } from '../../utils/whatsapp';
import { REVIEW_REQUEST_STATUS } from '../../constants';
import { useConfirm } from '../common/ConfirmContext';

const SystemManagerReviewsSection = ({ user }) => {
  const confirm = useConfirm();
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unsub = subscribeReviewRequests((list) => {
      const filtered = list.filter(r =>
        r.status === REVIEW_REQUEST_STATUS.APPROVED_BY_SUPERVISORS ||
        r.status === REVIEW_REQUEST_STATUS.DISPUTED
      );
      setReviews(filtered);
    });
    return () => unsub();
  }, []);

  const openModal = (r) => { setSelected(r); setShowModal(true); };

  const handleApprove = async () => {
    if (!selected) return;
    const ok = await confirm('حظر الطالب نهائياً', 'هذا سيؤدي إلى حظر الطالب ورقمه نهائياً. متأكد؟');
    if (!ok) return;
    setProcessing(true);
    try {
      const studentObj = {
        name: selected.targetName,
        phone: selected.targetPhone,
        classes: selected.targetClass ? [{ name: selected.targetClass }] : []
      };
      const opened = sendPermanentBanMessage(studentObj, selected.reason);
      if (!opened) {
        toast.error('لم يتم فتح واتساب — لم يُحظر الطالب');
        setProcessing(false);
        return;
      }
      await deleteUserCompletely(selected.targetId, { blacklistReason: selected.reason });
      await deleteDoc(doc(db, 'reviewRequests', selected.id));
      toast.success('✅ تم حظر الطالب وحذف حسابه ومسح الطلب من السجلات');
      setShowModal(false);
      setSelected(null);
    } catch (e) {
      console.error(e);
      toast.error('فشل: ' + e.message);
    } finally { setProcessing(false); }
  };

  const handleReject = async () => {
    if (!selected) return;
    const ok = await confirm('رفض القرار', 'رفض هذا القرار وإلغاء حظر الطالب؟');
    if (!ok) return;
    setProcessing(true);
    try {
      await deleteDoc(doc(db, 'reviewRequests', selected.id));
      toast.success('تم رفض القرار ومسح الطلب من السجلات');
      setShowModal(false);
      setSelected(null);
    } catch (e) { toast.error('فشل: ' + e.message); }
    finally { setProcessing(false); }
  };

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-amber-500/20">
      <h3 className="text-xl font-semibold text-amber-300 flex items-center gap-2 mb-3">
        <FaClipboardList /> قرارات تحتاج تدخلك ({reviews.length})
      </h3>

      {reviews.length === 0 ? (
        <div className="bg-black/20 p-4 rounded-xl border border-gray-700 text-center">
          <p className="text-green-300 text-sm">✅ لا توجد قرارات معلّقة تحتاج تدخلك حالياً.</p>
          <p className="text-gray-500 text-xs mt-1">ستظهر هنا طلبات إغلاق الحسابات التي تحتاج قرارك النهائي.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {reviews.map(r => {
            const agreeCount = (r.votes || []).filter(v => v.vote === 'agree').length;
            const exCount = (r.votes || []).filter(v => v.vote === 'exaggerated').length;
            const isApproved = r.status === REVIEW_REQUEST_STATUS.APPROVED_BY_SUPERVISORS;
            return (
              <div key={r.id} className={`p-4 rounded-xl border ${isApproved ? 'bg-green-900/20 border-green-500/30' : 'bg-orange-900/20 border-orange-500/30'}`}>
                <div className="flex justify-between items-start gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm"><strong>ضد:</strong> {r.targetName}</p>
                    <p className="text-xs text-red-200 mt-1 line-clamp-2"><strong>السبب:</strong> {r.reason}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      مقدم من: {r.createdByName} • موافق: <span className="text-green-300">{agreeCount}</span> • مبالغ: <span className="text-orange-300">{exCount}</span>
                    </p>
                    <p className="text-xs mt-1">
                      <span className={isApproved ? 'text-green-400' : 'text-orange-400'}>
                        {isApproved ? '✅ موافقة جماعية (4/4) — جاهز للتنفيذ' : '⚠️ تعارض أصوات (يحتاج قرارك)'}
                      </span>
                    </p>
                  </div>
                  <button onClick={() => openModal(r)} className="text-xs bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg">
                    اتخاذ القرار
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-amber-500/30" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-amber-300 mb-3">اتخاذ القرار النهائي</h3>
            <div className="bg-gray-800/50 p-4 rounded-xl mb-4 space-y-1 text-sm">
              <p className="text-gray-300"><strong>الطالب:</strong> {selected.targetName}</p>
              <p className="text-gray-300"><strong>الهاتف:</strong> {selected.targetPhone}</p>
              <p className="text-red-200"><strong>السبب:</strong> {selected.reason}</p>
            </div>
            <div className="bg-gray-800/30 p-3 rounded-lg mb-4">
              <p className="text-xs text-gray-400 mb-1">تصويت المشرفين:</p>
              {(selected.votes || []).map((v, i) => (
                <p key={i} className="text-xs text-gray-300">
                  {v.supervisorName}: <span className={v.vote === 'agree' ? 'text-green-400' : 'text-orange-400'}>
                    {v.vote === 'agree' ? 'موافق' : 'مبالغ به'}
                  </span>
                </p>
              ))}
            </div>
            <div className="space-y-2">
              <button onClick={handleApprove} disabled={processing} className="w-full p-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                {processing ? <FaSpinner className="animate-spin inline me-2" /> : <FaBan className="inline me-2" />}
                تأكيد الحظر النهائي ومسح الطلب
              </button>
              <button onClick={handleReject} disabled={processing} className="w-full p-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">
                <FaCheckCircle className="inline me-2" /> رفض القرار ومسح الطلب
              </button>
              <button onClick={() => setShowModal(false)} className="w-full p-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-gray-300 text-xs">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemManagerReviewsSection;