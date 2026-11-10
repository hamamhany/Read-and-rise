import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaSearch, FaTrashAlt, FaSpinner, FaUsers,
  FaPhone, FaUser, FaChevronLeft, FaChevronRight, FaSnowflake, FaFire
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, getCountFromServer, doc, updateDoc, serverTimestamp
} from 'firebase/firestore';
import { deleteUserCompletely } from '../../services/accountDeletion';
import { createMessageRequest } from '../../services/messageRequests';
import { MESSAGE_REQUEST_TYPES } from '../../constants';
import { fetchClassNames } from '../../utils/helpers';

const PAGE_SIZE = 20;

const StudentsManagerModal = ({ isOpen, onClose, user, onCountChange }) => {
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
      const snap = await getCountFromServer(
        query(collection(db, 'profiles'), where('role', '==', 'student'))
      );
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
        ? query(
            collection(db, 'profiles'),
            where('role', '==', 'student'),
            orderBy('createdAt', 'desc'),
            startAfter(startAfterDoc),
            limit(PAGE_SIZE)
          )
        : query(
            collection(db, 'profiles'),
            where('role', '==', 'student'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          );
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
    const term = searchTerm.trim();
    if (!term) {
      setPageDocs([null]);
      loadPage(0);
      return;
    }
    setIsSearching(true);
    try {
      const phoneDigits = term.replace(/[^\d]/g, '');
      const isPhone = phoneDigits.length >= 6 && phoneDigits === term;

      const promises = [
        getDocs(query(
          collection(db, 'profiles'),
          where('role', '==', 'student'),
          where('name', '>=', term),
          where('name', '<=', term + '\uf8ff'),
          limit(20)
        )),
        getDocs(query(
          collection(db, 'profiles'),
          where('role', '==', 'student'),
          where('username', '==', term.toLowerCase()),
          limit(5)
        ))
      ];
      if (isPhone) {
        promises.push(getDocs(query(
          collection(db, 'profiles'),
          where('role', '==', 'student'),
          where('phone', '==', phoneDigits),
          limit(5)
        )));
      }
      const results = await Promise.all(promises);
      const map = new Map();
      results.forEach(snap => snap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() })));
      setList(Array.from(map.values()));
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

  // ✅ تحديث: عند التجميد → إنشاء طلب إشعار تلقائياً
  const toggleFreeze = async (s) => {
    const next = !s.isFrozen;
    try {
      await updateDoc(doc(db, 'profiles', s.id), {
        isFrozen: next,
        frozenAt: next ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
      setList(prev => prev.map(x => x.id === s.id ? { ...x, isFrozen: next } : x));

      if (next) {
        // ✅ إنشاء طلب إشعار لولي الأمر
        try {
          const classMap = s.classIds?.length ? await fetchClassNames(s.classIds) : {};
          const classNames = (s.classIds || []).map(id => classMap[id]).filter(Boolean).join(', ');

          await createMessageRequest({
            type: MESSAGE_REQUEST_TYPES.FREEZE,
            targetType: 'student',
            targetId: s.id,
            targetName: s.name || '',
            targetPhone: s.phone || '',
            targetClass: classNames || 'غير محدد',
            requestedBy: user?.id || 'system_manager',
            requestedByName: user?.name || user?.username || 'مدير النظام',
            payload: { serialNumber: s.serialNumber || '' }
          });
          toast.success('✅ تم تجميد الطالب وحفظ طلب الإشعار في "طلبات التواصل".');
        } catch (e) {
          console.warn('createMessageRequest failed:', e);
          toast.success('تم تجميد الطالب. (تعذّر إنشاء طلب الإشعار)');
        }
      } else {
        toast.success('تم فك التجميد.');
      }
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`حذف الطالب "${s.name}" نهائياً من Auth + Firestore؟`)) return;
    try {
      const tid = toast.loading('جاري الحذف...');
      await deleteUserCompletely(s.id);
      toast.success('✅ تم الحذف نهائياً', { id: tid });
      const newList = list.filter(x => x.id !== s.id);
      setList(newList);
      const newCount = Math.max(0, count - 1);
      setCount(newCount);
      onCountChange?.(newCount);
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-blue-500/30" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <FaUsers className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة الطلاب</h3>
              <p className="text-xs text-gray-400">إجمالي: {count} طالب</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        {/* Search */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="ابحث بالاسم أو اسم المستخدم أو رقم الهاتف"
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
              {list.map(s => (
                <div key={s.id} className="p-3 bg-black/30 rounded-xl border border-gray-700 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{s.name}</p>
                    <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-3">
                      <span><FaUser className="inline me-1" />{s.username}</span>
                      {s.phone && <span dir="ltr"><FaPhone className="inline me-1" />{s.phone}</span>}
                    </div>
                    {s.isFrozen && <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded mt-1 inline-block">مجمد</span>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => toggleFreeze(s)}
                      className={`inline-flex items-center gap-1 whitespace-nowrap text-xs px-3 py-1.5 rounded-lg ${
                        s.isFrozen
                          ? 'bg-green-500/20 hover:bg-green-500/30 text-green-300'
                          : 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-300'
                      }`}
                    >
                      {s.isFrozen ? <><FaFire /> فك التجميد</> : <><FaSnowflake /> تجميد</>}
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg"
                    >
                      <FaTrashAlt /> حذف
                    </button>
                  </div>
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

export default StudentsManagerModal;