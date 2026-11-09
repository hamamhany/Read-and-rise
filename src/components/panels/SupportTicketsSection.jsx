import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaHeadset, FaSpinner, FaEye, FaChevronDown, FaArrowLeftCircle, FaCheckCircle, FaCheckSquare, FaSquare } from 'react-icons/fa';
import { subscribeToUnassignedTickets, subscribeToSupervisorTickets } from '../../services/support';
import { SUPPORT_TICKET_STATUS } from '../../constants';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import SupportChat from '../common/SupportChat';

const SupportTicketsSection = ({ user }) => {
  const [unassigned, setUnassigned] = useState([]);
  const [mine, setMine] = useState([]);
  const [showExplorer, setShowExplorer] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(5);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // ✅ خصائص التحديد الجماعي
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    const u1 = subscribeToUnassignedTickets(setUnassigned);
    const u2 = subscribeToSupervisorTickets(user.id, setMine);
    return () => { u1(); u2(); };
  }, [user.id]);

  const handleOpenExplorer = () => {
    setDisplayedCount(5);
    setSelectedIds([]); // تصفير التحديد عند الفتح
    setShowExplorer(true);
  };

  const loadMore = () => {
    setDisplayedCount(prev => prev + 5);
  };

  // ✅ دالة تحديد التذاكر (بحد أقصى 5)
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) {
        toast.error('الحد الأقصى لتحديد التذاكر هو 5 في المرة الواحدة');
        return prev;
      }
      return [...prev, id];
    });
  };

  // ✅ دالة تنفيذ الإجراءات الجماعية
  const handleBatchAction = async (action) => {
    if (selectedIds.length === 0) return;
    setLoadingAction(true);
    try {
      const batch = writeBatch(db);
      
      selectedIds.forEach(id => {
        const ref = doc(db, 'supportTickets', id);
        if (action === 'claim') {
          // للاستلام، نحتاج لتحديث حالة التذكرة وتعيينها للمشرف
          batch.update(ref, {
            assignedSupervisorId: user.id,
            assignedSupervisorName: user.name || user.username || 'مشرف',
            assignedAt: serverTimestamp(),
            status: SUPPORT_TICKET_STATUS.IN_PROGRESS,
            updatedAt: serverTimestamp(),
            unreadForSupervisor: false
          });
        } else if (action === 'transfer') {
          batch.update(ref, {
            status: SUPPORT_TICKET_STATUS.MANAGER_PENDING,
            transferredBy: user.name || user.username || 'مشرف',
            updatedAt: serverTimestamp()
          });
        } else if (action === 'close') {
          batch.update(ref, {
            status: SUPPORT_TICKET_STATUS.AUTO_CLOSED,
            closedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      });

      await batch.commit();

      if (action === 'claim') toast.success('✅ تم استلام التذاكر المحددة');
      if (action === 'transfer') toast.success('✅ تم تحويل التذاكر للمدير');
      if (action === 'close') toast.success('✅ تم إغلاق التذاكر');
      
      setSelectedIds([]); // تصفير التحديد بعد النجاح
      setShowExplorer(false); // إغلاق النافذة بعد الإجراء
    } catch (error) {
      toast.error('فشل تنفيذ الإجراء: ' + error.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const displayedTickets = unassigned.slice(0, displayedCount);
  const hasMore = displayedCount < unassigned.length;

  // إخفاء القسم بالكامل إذا لم يوجد أي شيء
  if (unassigned.length === 0 && mine.length === 0) return null;

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-cyan-500/20">
      <h3 className="text-xl font-semibold text-cyan-300 flex items-center gap-2 mb-4">
        <FaHeadset /> تذاكر الدعم الفني
      </h3>

      {/* تذاكري النشطة */}
      {mine.length > 0 && (
        <div className="mb-4">
          <p className="text-sm text-cyan-200 font-bold mb-2">تذاكري النشطة ({mine.length})</p>
          <div className="space-y-2">
            {mine.map(t => (
              <div key={t.id} className="p-3 bg-black/30 rounded-lg border border-gray-700 flex justify-between items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.studentName}</p>
                  <p className="text-xs text-gray-400">{t.status === SUPPORT_TICKET_STATUS.SUPERVISOR_ENDED ? '⏳ بانتظار تأكيد الطالب' : t.status === SUPPORT_TICKET_STATUS.AWAITING_RATING ? '⭐ بانتظار التقييم' : '💬 جارية'}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setSelectedTicketId(t.id)} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg"><FaEye /> فتح</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* زر استكشاف التذاكر الجديدة */}
      {unassigned.length > 0 && (
        <div className="mt-4 text-center">
          <button
            onClick={handleOpenExplorer}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg font-bold w-full"
          >
            استكشاف التذاكر الجديدة ({unassigned.length})
          </button>
        </div>
      )}

      {/* نافذة الاستكشاف المنبثقة */}
      {showExplorer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setShowExplorer(false)}>
          <div className="bg-gray-900 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-cyan-500/30" onClick={e => e.stopPropagation()}>
            
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-lg font-bold text-cyan-300">التذاكر غير المحجوزة ({unassigned.length})</h3>
              <button onClick={() => setShowExplorer(false)} className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-xs text-gray-400 mb-2">💡 اضغط على المربع لتحديد التذاكر (بحد أقصى 5)، أو اضغط على التذكرة لفتحها وقراءتها.</p>
              
              {displayedTickets.map(t => {
                const isSelected = selectedIds.includes(t.id);
                return (
                  <div 
                    key={t.id} 
                    className={`p-3 rounded-xl border flex items-center gap-3 transition-colors cursor-pointer ${isSelected ? 'bg-cyan-900/30 border-cyan-500' : 'bg-black/30 border-gray-700 hover:border-gray-500'}`}
                    onClick={() => setSelectedTicketId(t.id)}
                  >
                    {/* Checkbox */}
                    <div 
                      onClick={(e) => toggleSelect(t.id, e)} 
                      className="text-2xl text-cyan-400 hover:scale-110 transition-transform p-1"
                    >
                      {isSelected ? <FaCheckSquare /> : <FaSquare className="text-gray-500" />}
                    </div>

                    {/* تفاصيل التذكرة */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{t.studentName}</p>
                      <p className="text-xs text-gray-400 truncate">{t.messages?.[0]?.text}</p>
                    </div>

                    {/* زر الفتح */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedTicketId(t.id); setShowExplorer(false); }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"
                    >
                      <FaEye /> فتح
                    </button>
                  </div>
                );
              })}
              
              {hasMore && (
                <button
                  onClick={loadMore}
                  className="w-full py-2 text-cyan-400 hover:text-cyan-300 text-sm font-bold flex items-center justify-center gap-1 mt-2"
                >
                  <FaChevronDown /> تحميل 5 المزيد
                </button>
              )}
              {!hasMore && unassigned.length > 0 && (
                <p className="text-center text-gray-500 text-xs py-2">لقد وصلت إلى نهاية القائمة</p>
              )}
            </div>

            {/* ✅ شريط الإجراءات الجماعية */}
            {selectedIds.length > 0 && (
              <div className="p-4 border-t border-gray-700 bg-gray-800 flex flex-wrap justify-between items-center gap-2">
                <span className="text-sm font-bold text-cyan-200">
                  تم تحديد {selectedIds.length} تذكرة
                </span>
                <div className="flex gap-2 flex-wrap">
                  <button 
                    onClick={() => handleBatchAction('claim')} 
                    disabled={loadingAction}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <FaCheckCircle /> استلام
                  </button>
                  <button 
                    onClick={() => handleBatchAction('transfer')} 
                    disabled={loadingAction}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
                  >
                    <FaArrowLeftCircle /> تحويل للمدير
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* نافذة المحادثة */}
      {selectedTicketId && (
        <SupportChat user={user} ticketId={selectedTicketId} viewerMode="supervisor" onClose={() => setSelectedTicketId(null)} />
      )}
    </div>
  );
};

export default SupportTicketsSection;