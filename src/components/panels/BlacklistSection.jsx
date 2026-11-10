import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaBan, FaTrashAlt, FaSearch, FaDownload, FaSpinner } from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, doc, deleteDoc, getCountFromServer
} from 'firebase/firestore';
import { useConfirm } from '../common/ConfirmContext';

const PAGE_SIZE = 20;

const BlacklistSection = () => {
  const confirm = useConfirm();
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getCountFromServer(collection(db, 'blacklist'));
        setCount(snap.data().count);
      } catch (e) { console.warn(e); }
    })();
  }, []);

  const loadInitial = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, 'blacklist'), orderBy('addedAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setList(items);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(items.length === PAGE_SIZE);
      setHasLoaded(true);
      setSearchMode(false);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = async () => {
    if (!lastDoc) return;
    setIsLoading(true);
    try {
      const q = query(collection(db, 'blacklist'), orderBy('addedAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setList(prev => [...prev, ...items]);
      setLastDoc(snap.docs[snap.docs.length - 1] || null);
      setHasMore(items.length === PAGE_SIZE);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const doSearch = async () => {
    const normalized = searchQuery.replace(/[^\d]/g, '');
    if (!normalized) {
      toast.error('يرجى إدخال رقم صالح');
      return;
    }
    setIsSearching(true);
    try {
      const q = query(collection(db, 'blacklist'), where('phone', '==', normalized), limit(20));
      const snap = await getDocs(q);
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setHasMore(false);
      setSearchMode(true);
      setHasLoaded(true);
    } catch (e) {
      toast.error('فشل البحث: ' + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const resetSearch = () => {
    setSearchQuery('');
    setSearchMode(false);
    loadInitial();
  };

  const handleRemove = async (id, phone) => {
    const ok = await confirm('إزالة من القائمة السوداء', `إزالة الرقم ${phone} من القائمة السوداء؟`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'blacklist', id));
      setList(prev => prev.filter(i => i.id !== id));
      setCount(prev => Math.max(0, prev - 1));
      toast.success('تم إزالة الرقم من القائمة السوداء');
    } catch (e) { toast.error('فشل: ' + e.message); }
  };

  if (!hasLoaded) {
    return (
      <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 text-center">
        <h3 className="text-xl font-semibold text-red-300 flex items-center gap-2 mb-3 justify-center">
          <FaBan /> القائمة السوداء ({count})
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          يتم تحميل القائمة عند الطلب لتوفير موارد السيرفر.
        </p>
        <button onClick={loadInitial} disabled={isLoading} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl font-bold inline-flex items-center gap-2">
          {isLoading ? <FaSpinner className="animate-spin" /> : <FaDownload />}
          {isLoading ? 'جاري التحميل...' : 'تصفح القائمة'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700">
      <h3 className="text-xl font-semibold text-red-300 flex items-center gap-2 mb-3">
        <FaBan /> القائمة السوداء ({count})
      </h3>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          inputMode="numeric"
          placeholder="ادخل رقم الهاتف للبحث"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          className="flex-1 bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white min-w-[200px]"
        />
        <button onClick={doSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md inline-flex items-center gap-1">
          {isSearching ? <FaSpinner className="animate-spin" /> : <FaSearch />} بحث
        </button>
        {searchMode && (
          <button onClick={resetSearch} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md">إلغاء البحث</button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-3">لا توجد نتائج.</p>
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
              <button onClick={() => handleRemove(item.id, item.phone)} className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2 py-1 rounded-lg">
                <FaTrashAlt /> إزالة
              </button>
            </div>
          ))}
        </div>
      )}

      {!searchMode && hasMore && (
        <button onClick={loadMore} disabled={isLoading} className="w-full mt-3 py-2 text-blue-400 hover:text-blue-300 flex items-center justify-center gap-2">
          {isLoading ? <><FaSpinner className="animate-spin" /> جاري التحميل...</> : 'تحميل المزيد (20)'}
        </button>
      )}
    </div>
  );
};

export default BlacklistSection;