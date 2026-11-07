import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaSearch, FaTrashAlt, FaSpinner, FaBan,
  FaPhone, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, doc, deleteDoc, getCountFromServer
} from 'firebase/firestore';

const PAGE_SIZE = 20;

const BlacklistModal = ({ isOpen, onClose, onCountChange }) => {
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [page, setPage] = useState(0);
  const [pageDocs, setPageDocs] = useState([null]);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadCount();
      setPageDocs([null]);
      setPage(0);
      setHasMore(true);
      setSearchMode(false);
      setSearchTerm('');
      loadPage(0);
    }
    // eslint-disable-next-line
  }, [isOpen]);

  const loadCount = async () => {
    try {
      const snap = await getCountFromServer(collection(db, 'blacklist'));
      const c = snap.data().count;
      setCount(c);
      onCountChange?.(c);
    } catch (e) { console.warn(e); }
  };

  const loadPage = async (pageIndex) => {
    setLoading(true);
    try {
      const startAfterDoc = pageIndex > 0 ? pageDocs[pageIndex - 1] : null;
      const q = startAfterDoc
        ? query(collection(db, 'blacklist'), orderBy('addedAt', 'desc'), startAfter(startAfterDoc), limit(PAGE_SIZE))
        : query(collection(db, 'blacklist'), orderBy('addedAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setList(items);
      setHasMore(items.length === PAGE_SIZE);
      if (items.length > 0) {
        const newPageDocs = [...pageDocs];
        newPageDocs[pageIndex] = snap.docs[snap.docs.length - 1];
        setPageDocs(newPageDocs);
      }
      setPage(pageIndex);
      setSearchMode(false);
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const doSearch = async () => {
    const phoneDigits = searchTerm.replace(/[^\d]/g, '');
    if (!phoneDigits) {
      toast.error('يرجى إدخال رقم صالح');
      return;
    }
    setIsSearching(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'blacklist'), where('phone', '==', phoneDigits), limit(20))
      );
      setList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setHasMore(false);
      setSearchMode(true);
      setPage(0);
    } catch (e) {
      toast.error('فشل البحث: ' + e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const resetSearch = () => {
    setSearchTerm('');
    setPageDocs([null]);
    setHasMore(true);
    loadPage(0);
  };

  const handleRemove = async (item) => {
    if (!window.confirm(`إزالة الرقم ${item.phone} من القائمة السوداء؟`)) return;
    try {
      await deleteDoc(doc(db, 'blacklist', item.id));
      setList(prev => prev.filter(i => i.id !== item.id));
      const newCount = Math.max(0, count - 1);
      setCount(newCount);
      onCountChange?.(newCount);
      toast.success('تم إزالة الرقم من القائمة السوداء');
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-red-500/30" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
              <FaBan className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">القائمة السوداء</h3>
              <p className="text-xs text-gray-400">إجمالي: {count} رقم محظور</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        {/* Search */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              inputMode="numeric"
              placeholder="ابحث برقم الهاتف"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
              className="flex-1 min-w-[200px] bg-gray-800 text-right p-2 border border-gray-600 rounded-lg text-white text-sm"
            />
            <button onClick={doSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1">
              {isSearching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
            </button>
            {searchMode && (
              <button onClick={resetSearch} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">إلغاء</button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : list.length === 0 ? (
            <p className="text-gray-400 text-center py-8">لا توجد نتائج.</p>
          ) : (
            <div className="space-y-2">
              {list.map(item => (
                <div key={item.id} className="p-3 bg-black/30 rounded-xl border border-red-500/20 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-mono inline-flex items-center gap-1" dir="ltr">
                      <FaPhone className="text-gray-400" /> {item.phone}
                    </p>
                    <p className="text-xs text-red-200 mt-1"><strong>السبب:</strong> {item.reason}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      بواسطة: {item.addedByName || 'مدير النظام'} •{' '}
                      {item.addedAt?.toDate?.() ? new Date(item.addedAt.toDate()).toLocaleString('ar-EG') : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemove(item)}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg"
                  >
                    <FaTrashAlt /> إزالة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!searchMode && (
          <div className="p-4 border-t border-gray-700 flex justify-between items-center gap-2">
            <button
              onClick={() => loadPage(page - 1)}
              disabled={page === 0 || loading}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1"
            >
              <FaChevronRight /> السابق
            </button>
            <span className="text-gray-400 text-sm">صفحة {page + 1}</span>
            <button
              onClick={() => loadPage(page + 1)}
              disabled={!hasMore || loading}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-1"
            >
              التالي <FaChevronLeft />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlacklistModal;