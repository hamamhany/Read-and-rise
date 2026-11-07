import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaBan, FaTrashAlt } from 'react-icons/fa';
import { subscribeBlacklist, removeFromBlacklist } from '../../services/blacklist';

const BlacklistSection = () => {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeBlacklist((items) => {
      setList(items);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleRemove = async (id, phone) => {
    if (!window.confirm(`إزالة الرقم ${phone} من القائمة السوداء؟`)) return;
    try {
      await removeFromBlacklist(id);
      toast.success('تم إزالة الرقم من القائمة السوداء');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
      <h3 className="text-xl font-semibold text-red-300 flex items-center gap-2 mb-3">
        <FaBan /> القائمة السوداء ({list.length})
      </h3>
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-3">جاري التحميل...</p>
      ) : list.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-3">لا توجد أرقام محظورة.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {list.map(item => (
            <div key={item.id} className="p-3 bg-black/30 rounded-xl border border-red-500/20 flex justify-between items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-mono" dir="ltr">📱 {item.phone}</p>
                <p className="text-xs text-red-200 mt-0.5"><strong>السبب:</strong> {item.reason}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  بواسطة: {item.addedByName || 'مدير النظام'} •{' '}
                  {item.addedAt?.toDate?.() ? new Date(item.addedAt.toDate()).toLocaleString('ar-EG') : ''}
                </p>
              </div>
              <button onClick={() => handleRemove(item.id, item.phone)}
                className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-1 rounded-lg">
                <FaTrashAlt /> إزالة
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BlacklistSection;