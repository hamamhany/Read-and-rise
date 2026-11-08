import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaHeadset, FaUser, FaSpinner, FaLock, FaCheckCircle, FaEye
} from 'react-icons/fa';
import {
  subscribeToUnassignedTickets, subscribeToSupervisorTickets,
  claimTicket, requestTicketEnd
} from '../../services/support';
import { SUPPORT_TICKET_STATUS } from '../../constants';
import SupportChat from '../common/SupportChat';

const SupportTicketsSection = ({ user }) => {
  const [unassigned, setUnassigned] = useState([]);
  const [mine, setMine] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [claimingId, setClaimingId] = useState(null);

  useEffect(() => {
    const u1 = subscribeToUnassignedTickets(setUnassigned);
    const u2 = subscribeToSupervisorTickets(user.id, setMine);
    return () => { u1(); u2(); };
  }, [user.id]);

  const handleClaim = async (ticketId) => {
    setClaimingId(ticketId);
    try {
      await claimTicket(ticketId, user.id, user.name || user.username || 'مشرف');
      toast.success('✅ تم استلام التذكرة');
      setSelectedTicketId(ticketId);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setClaimingId(null);
    }
  };

  const handleRequestEnd = async (ticketId) => {
    if (!window.confirm('سيُطلب من الطالب تأكيد حل المشكلة. متابعة؟')) return;
    try {
      await requestTicketEnd(ticketId);
      toast.success('✅ تم إرسال طلب الإنهاء للطالب');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-cyan-500/20">
      <h3 className="text-xl font-semibold text-cyan-300 flex items-center gap-2 mb-4">
        <FaHeadset /> تذاكر الدعم الفني
      </h3>

      {/* My tickets */}
      <div className="mb-4">
        <p className="text-sm text-cyan-200 font-bold mb-2">تذاكري النشطة ({mine.length})</p>
        {mine.length === 0 ? (
          <p className="text-gray-400 text-xs text-center py-2">لا توجد تذاكر نشطة.</p>
        ) : (
          <div className="space-y-2">
            {mine.map(t => (
              <div key={t.id} className="p-3 bg-black/30 rounded-lg border border-gray-700 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {t.studentName}
                    {t.studentSerialNumber && <span className="text-xs text-gray-400 mx-1">({t.studentSerialNumber})</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {t.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED ? '⏳ بانتظار تأكيد الطالب' :
                     t.status === SUPPORT_TICKET_STATUS.AWAITING_RATING ? '⭐ بانتظار التقييم' :
                     '💬 جارية'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setSelectedTicketId(t.id)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                    <FaEye /> فتح
                  </button>
                  {t.status === SUPPORT_TICKET_STATUS.IN_PROGRESS && (
                    <button onClick={() => handleRequestEnd(t.id)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1.5 rounded-lg">
                      <FaCheckCircle /> إنهاء
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unassigned */}
      <div>
        <p className="text-sm text-cyan-200 font-bold mb-2">بانتظار الاستلام ({unassigned.length})</p>
        {unassigned.length === 0 ? (
          <p className="text-gray-400 text-xs text-center py-2">لا توجد تذاكر جديدة.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {unassigned.map(t => (
              <div key={t.id} className="p-3 bg-black/30 rounded-lg border border-cyan-500/20 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.studentName}</p>
                  <p className="text-xs text-gray-400 truncate">{t.messages?.[0]?.text}</p>
                </div>
                <button
                  onClick={() => handleClaim(t.id)}
                  disabled={claimingId === t.id}
                  className="text-xs bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {claimingId === t.id ? <FaSpinner className="animate-spin" /> : <><FaLock /> استلام</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTicketId && (
        <SupportChat
          user={user}
          ticketId={selectedTicketId}
          viewerMode="supervisor"
          onClose={() => setSelectedTicketId(null)}
        />
      )}
    </div>
  );
};

export default SupportTicketsSection;