import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaHeadset, FaSpinner, FaCheckCircle, FaArrowLeftCircle, FaEye } from 'react-icons/fa';
import { subscribeToUnassignedTickets, subscribeToSupervisorTickets, claimTicket } from '../../services/support';
import { SUPPORT_TICKET_STATUS } from '../../constants';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import SupportChat from '../common/SupportChat';

const SupportTicketsSection = ({ user }) => {
  const [unassigned, setUnassigned] = useState([]);
  const [mine, setMine] = useState([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  useEffect(() => {
    const u1 = subscribeToUnassignedTickets(setUnassigned);
    const u2 = subscribeToSupervisorTickets(user.id, setMine);
    return () => { u1(); u2(); };
  }, [user.id]);

  const handleLoadMore = () => {
    setVisibleCount(prev => Math.min(prev + 5, unassigned.length));
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) { toast.error('الحد الأقصى 5 تذاكر'); return prev; }
      return [...prev, id];
    });
  };

  const handleBatchAction = async (action) => {
    if (selectedIds.length === 0) return;
    setLoadingAction(true);
    try {
      if (action === 'claim') {
        for (const id of selectedIds) {
          await claimTicket(id, user.id, user.name || 'مشرف');
        }
        toast.success('تم استلام التذاكر المحددة');
      } else if (action === 'transfer') {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
          batch.update(doc(db, 'supportTickets', id), {
            status: SUPPORT_TICKET_STATUS.MANAGER_PENDING,
            transferredBy: user.name || 'مشرف',
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        toast.success('تم تحويل التذاكر للمدير');
      } else if (action === 'close') {
        const batch = writeBatch(db);
        selectedIds.forEach(id => {
          batch.update(doc(db, 'supportTickets', id), {
            status: SUPPORT_TICKET_STATUS.AUTO_CLOSED,
            closedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        toast.success('تم إغلاق التذاكر');
      }
      setSelectedIds([]);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-cyan-500/20">
      <h3 className="text-xl font-semibold text-cyan-300 flex items-center gap-2 mb-4">
        <FaHeadset /> تذاكر الدعم الفني
      </h3>

      {/* تذاكري */}
      <div className="mb-4">
        <p className="text-sm text-cyan-200 font-bold mb-2">تذاكري النشطة ({mine.length})</p>
        {mine.length === 0 ? <p className="text-gray-400 text-xs text-center py-2">لا توجد تذاكر نشطة.</p> : (
          <div className="space-y-2">
            {mine.map(t => (
              <div key={t.id} className="p-3 bg-black/30 rounded-lg border border-gray-700 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.studentName}</p>
                  <p className="text-xs text-gray-400">{t.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED ? '⏳ بانتظار تأكيد الطالب' : t.status === SUPPORT_TICKET_STATUS.AWAITING_RATING ? '⭐ بانتظار التقييم' : '💬 جارية'}</p>
                </div>
                <button onClick={() => setSelectedTicketId(t.id)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"><FaEye /> فتح</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* بانتظار الاستلام */}
      <div>
        <p className="text-sm text-cyan-200 font-bold mb-2">بانتظار الاستلام ({unassigned.length})</p>
        {unassigned.length === 0 ? <p className="text-gray-400 text-xs text-center py-2">لا توجد تذاكر جديدة.</p> : (
          <>
            {visibleCount === 0 ? (
              <button onClick={handleLoadMore} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-lg font-bold">استكشاف (تحميل 5)</button>
            ) : (
              <>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {unassigned.slice(0, visibleCount).map(t => (
                    <div key={t.id} className={`p-3 rounded-lg border flex justify-between items-center cursor-pointer ${selectedIds.includes(t.id) ? 'bg-cyan-900/40 border-cyan-500' : 'bg-black/30 border-gray-700'}`} onClick={() => toggleSelect(t.id)}>
                      <p className="text-white text-sm truncate">{t.studentName}</p>
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedIds.includes(t.id) ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-gray-500'}`}>{selectedIds.includes(t.id) && '✓'}</div>
                    </div>
                  ))}
                </div>
                {visibleCount < unassigned.length && <button onClick={handleLoadMore} className="w-full mt-2 text-cyan-400 text-sm hover:text-cyan-300">تحميل 5 أخرى</button>}
              </>
            )}
            
            {selectedIds.length > 0 && (
              <div className="mt-4 p-3 bg-slate-800 rounded-xl border border-slate-700 flex flex-wrap justify-between items-center gap-2">
                <span className="text-xs text-white">تم تحديد {selectedIds.length} تذكرة</span>
                <div className="flex gap-2">
                  <button onClick={() => handleBatchAction('claim')} disabled={loadingAction} className="bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold">استلام المحدد</button>
                  <button onClick={() => handleBatchAction('transfer')} disabled={loadingAction} className="bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold">تحويل للمدير</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedTicketId && (
        <SupportChat user={user} ticketId={selectedTicketId} viewerMode="supervisor" onClose={() => setSelectedTicketId(null)} />
      )}
    </div>
  );
};

export default SupportTicketsSection;