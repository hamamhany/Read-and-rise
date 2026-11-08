import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaHeadset, FaTimes, FaUser, FaTrashAlt, FaSpinner } from 'react-icons/fa';
import { subscribeSupportMessages, markSupportAsRead, deleteSupportMessage } from '../../services/support';
import { fetchClassNames } from '../../utils/helpers';

const SupportMessagesSection = () => {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    const unsub = subscribeSupportMessages(setMessages);
    return () => unsub();
  }, []);

  const openMessage = async (msg) => {
    setSelected(msg);
    setSelectedDetails(null);
    setLoadingDetails(true);
    try {
      if (msg.status === 'new') await markSupportAsRead(msg.id);
      let classNames = [];
      if (msg.senderClassIds?.length) {
        const map = await fetchClassNames(msg.senderClassIds);
        classNames = msg.senderClassIds.map(id => map[id]).filter(Boolean);
      }
      setSelectedDetails({ ...msg, classNameList: classNames });
    } catch (e) {
      console.warn(e);
    } finally { setLoadingDetails(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('حذف هذه الرسالة نهائياً؟')) return;
    try {
      await deleteSupportMessage(id);
      toast.success('تم الحذف');
      setSelected(null); setSelectedDetails(null);
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  if (messages.length === 0) {
    return (
      <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
        <h3 className="text-xl font-semibold text-blue-300 flex items-center gap-2 mb-2"><FaHeadset /> رسائل الدعم الفني</h3>
        <p className="text-gray-400 text-sm text-center py-3">لا توجد رسائل دعم حالياً.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-blue-500/20">
      <h3 className="text-xl font-semibold text-blue-300 flex items-center gap-2 mb-4"><FaHeadset /> رسائل الدعم الفني ({messages.length})</h3>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {messages.map(m => (
          <div key={m.id} className={`p-3 rounded-xl border flex justify-between items-start gap-2 flex-wrap ${m.status === 'new' ? 'bg-blue-500/5 border-blue-500/30' : 'bg-black/20 border-gray-700'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm">
                <button onClick={() => openMessage(m)} className="text-blue-300 hover:text-blue-200 font-bold underline">
                  {m.senderName} <span className="text-xs text-gray-400">({m.senderRole === 'student' ? 'طالب' : m.senderRole === 'teacher' ? 'معلم' : 'مشرف'})</span>
                </button>
                {m.status === 'new' && <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded mr-2">جديد</span>}
              </p>
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">{m.message}</p>
              <p className="text-[10px] text-gray-500 mt-1">{m.createdAt?.toDate?.() ? new Date(m.createdAt.toDate()).toLocaleString('ar-EG') : ''}</p>
            </div>
            <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-300 px-2 py-1"><FaTrashAlt /></button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelected(null); setSelectedDetails(null); }}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-blue-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-blue-300"><FaHeadset /> رسالة دعم</h3>
              <button onClick={() => { setSelected(null); setSelectedDetails(null); }} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>

            {loadingDetails ? (
              <p className="text-center text-gray-400 py-4"><FaSpinner className="animate-spin inline me-2" /> جاري التحميل...</p>
            ) : selectedDetails && (
              <div className="space-y-3">
                <div className="bg-gray-800/60 p-4 rounded-xl">
                  <p className="text-blue-200 font-bold mb-2">👤 بيانات المُرسل:</p>
                  <p className="text-sm text-gray-300"><strong>الاسم:</strong> {selectedDetails.senderName}</p>
                  <p className="text-sm text-gray-300"><strong>الرقم التسلسلي:</strong> {selectedDetails.senderSerialNumber || 'غير مسجل'}</p>
                  <p className="text-sm text-gray-300"><strong>الجنس:</strong> {selectedDetails.senderGender || 'غير مسجل'}</p>
                  <p className="text-sm text-gray-300"><strong>العمر:</strong> {selectedDetails.senderAge || 'غير مسجل'}</p>
                  <p className="text-sm text-gray-300"><strong>الهاتف:</strong> <span dir="ltr">{selectedDetails.senderPhone || 'غير مسجل'}</span></p>
                  <p className="text-sm text-gray-300"><strong>الشعب:</strong> {selectedDetails.classNameList?.join(', ') || 'غير محدد'}</p>
                </div>
                <div className="bg-gray-800/60 p-4 rounded-xl">
                  <p className="text-blue-200 font-bold mb-2">💬 نص الرسالة:</p>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap">{selectedDetails.message}</p>
                </div>
                <button onClick={() => handleDelete(selectedDetails.id)} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-sm">
                  <FaTrashAlt className="inline me-2" /> حذف الرسالة
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportMessagesSection;