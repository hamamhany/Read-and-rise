import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaVoteYea, FaTimes, FaCheckCircle, FaBan } from 'react-icons/fa';
import { subscribeReviewRequests, voteOnReview } from '../../services/reviewRequests';
import { REVIEW_REQUEST_STATUS, REVIEW_VOTE_OPTIONS } from '../../constants';

const ReviewVotingSection = ({ user }) => {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    const unsub = subscribeReviewRequests((list) => {
      const filtered = list.filter(r =>
        r.status === REVIEW_REQUEST_STATUS.PENDING_VOTES &&
        r.createdBy !== user.id
      );
      setRequests(filtered);
    });
    return () => unsub();
  }, [user.id]);

  const openModal = (r) => { setSelected(r); setShowModal(true); };

  const submitVote = async (vote) => {
    if (!selected) return;
    setIsVoting(true);
    try {
      const result = await voteOnReview(selected.id, user.id, user.name || user.username || 'مشرف', vote);
      toast.success(
        result.newStatus === REVIEW_REQUEST_STATUS.APPROVED_BY_SUPERVISORS
          ? '✅ تم تسجيل تصويتك — اكتملت الأصوات بالموافقة'
          : result.newStatus === REVIEW_REQUEST_STATUS.DISPUTED
            ? 'تم تسجيل تصويتك — سيُراجع مدير النظام'
            : 'تم تسجيل تصويتك بنجاح'
      );
      setShowModal(false);
      setSelected(null);
    } catch (e) { toast.error(e.message); }
    finally { setIsVoting(false); }
  };

  // ✅ إخفاء القسم بالكامل عند عدم وجود طلبات تصويت
  if (requests.length === 0) return null;

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-purple-500/20">
      <h3 className="text-xl font-semibold text-purple-300 flex items-center gap-2 mb-3">
        <FaVoteYea /> طلبات التصويت ({requests.length})
      </h3>
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {requests.map(r => (
          <div key={r.id} className="p-3 bg-black/30 rounded-xl border border-purple-500/20 flex justify-between items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm"><strong>ضد:</strong> {r.targetName}</p>
              <p className="text-xs text-red-300 mt-0.5 line-clamp-2"><strong>السبب:</strong> {r.reason}</p>
              <p className="text-xs text-gray-400 mt-0.5">مقدم من: {r.createdByName}</p>
              <p className="text-xs text-purple-300 mt-0.5">عدد الأصوات: {(r.votes || []).length}/4</p>
            </div>
            <button onClick={() => openModal(r)} className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg">
              عرض وتصويت
            </button>
          </div>
        ))}
      </div>

      {showModal && selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold text-purple-300">طلب إغلاق حساب</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-xl mb-4 space-y-1 text-sm">
              <p className="text-gray-300"><strong>الطالب:</strong> {selected.targetName}</p>
              <p className="text-gray-300"><strong>الشعبة:</strong> {selected.targetClass}</p>
              <p className="text-gray-300"><strong>مقدم الطلب:</strong> {selected.createdByName}</p>
              <p className="text-red-200"><strong>السبب:</strong> {selected.reason}</p>
            </div>
            <p className="text-xs text-gray-400 text-center mb-3">
              {(selected.votes || []).length} / 4 مشرفين صوّتوا
            </p>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => submitVote(REVIEW_VOTE_OPTIONS.AGREE)} disabled={isVoting}
                className="w-full p-3 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 rounded-xl text-green-200 text-sm font-medium">
                <FaCheckCircle className="inline me-2" /> أرى أن القرار صحيح
              </button>
              <button onClick={() => submitVote(REVIEW_VOTE_OPTIONS.EXAGGERATED)} disabled={isVoting}
                className="w-full p-3 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 rounded-xl text-orange-200 text-sm font-medium">
                <FaBan className="inline me-2" /> أرى أن القرار مبالغ به
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewVotingSection;