import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSearch, FaTrashAlt, FaSpinner,
  FaUserShield, FaPhone, FaUser, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';
import { db } from '../../firebase';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, getCountFromServer
} from 'firebase/firestore';
import { createSupervisorAccount } from '../../services/supervisor';
import { deleteUserCompletely } from '../../services/accountDeletion';
import { sanitizeInput, arabicToEnglishNumber } from '../../utils/helpers';

const PAGE_SIZE = 20;

const SupervisorsManagerModal = ({ isOpen, onClose, user, onCountChange }) => {
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [page, setPage] = useState(0);
  const [pageDocs, setPageDocs] = useState([null]);
  const [hasMore, setHasMore] = useState(true);

  // Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCount();
      setPageDocs([null]);
      setPage(0);
      setHasMore(true);
      setSearchMode(false);
      setSearchTerm('');
      setShowAddForm(false);
      loadPage(0);
    }
    // eslint-disable-next-line
  }, [isOpen]);

  const loadCount = async () => {
    try {
      const snap = await getCountFromServer(
        query(collection(db, 'profiles'), where('role', '==', 'supervisor'))
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
            where('role', '==', 'supervisor'),
            orderBy('createdAt', 'desc'),
            startAfter(startAfterDoc),
            limit(PAGE_SIZE)
          )
        : query(
            collection(db, 'profiles'),
            where('role', '==', 'supervisor'),
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
          where('role', '==', 'supervisor'),
          where('name', '>=', term),
          where('name', '<=', term + '\uf8ff'),
          limit(20)
        )),
        getDocs(query(
          collection(db, 'profiles'),
          where('role', '==', 'supervisor'),
          where('username', '==', term.toLowerCase()),
          limit(5)
        ))
      ];
      if (isPhone) {
        promises.push(getDocs(query(
          collection(db, 'profiles'),
          where('role', '==', 'supervisor'),
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

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName || !newGender || !newAge || !newPhone) {
      toast.error('جميع الحقول مطلوبة');
      return;
    }
    const ageNum = parseInt(arabicToEnglishNumber(newAge));
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
      toast.error('العمر يجب أن يكون بين 1 و 99');
      return;
    }
    const phoneDigits = String(arabicToEnglishNumber(newPhone)).replace(/[^\d]/g, '');
    const normalizedPhone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;
    if (normalizedPhone.startsWith('0')) {
      toast.error('يرجى إدخال رقم الهاتف مع رمز الدولة بدون صفر بادئ');
      return;
    }
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
      toast.error('رقم الهاتف غير صالح (10-15 رقماً)');
      return;
    }

    setSubmitting(true);
    try {
      const result = await createSupervisorAccount(
        sanitizeInput(newName),
        sanitizeInput(newGender),
        ageNum,
        normalizedPhone,
        user.id,
        canPublish
      );
      toast.success(`✅ تم إضافة المشرف ${result.name}`);
      setNewName(''); setNewGender(''); setNewAge(''); setNewPhone(''); setCanPublish(false);
      setShowAddForm(false);
      await loadCount();
      setPageDocs([null]);
      loadPage(0);
    } catch (err) {
      toast.error('فشل: ' + err.message, { duration: 8000 });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (s) => {
    if (!window.confirm(`حذف المشرف "${s.name}" نهائياً؟`)) return;
    try {
      const tid = toast.loading('جاري الحذف...');
      await deleteUserCompletely(s.id);
      toast.success('✅ تم الحذف', { id: tid });
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
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-indigo-500/30" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <FaUserShield className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة المشرفين</h3>
              <p className="text-xs text-gray-400">إجمالي: {count} مشرف</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        {/* Toolbar */}
        <div className="p-5 border-b border-gray-700 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
            >
              <FaPlus /> {showAddForm ? 'إغلاق النموذج' : 'إضافة مشرف'}
            </button>
            <div className="flex-1 flex gap-2 min-w-[200px]">
              <input
                type="text"
                placeholder="ابحث بالاسم أو اسم المستخدم أو رقم الهاتف"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
                className="flex-1 bg-gray-800 text-right p-2 border border-gray-600 rounded-lg text-white text-sm"
              />
              <button onClick={doSearch} disabled={isSearching} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1">
                {isSearching ? <FaSpinner className="animate-spin" /> : <FaSearch />}
              </button>
              {searchMode && (
                <button onClick={resetSearch} className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm">إلغاء</button>
              )}
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleAdd} className="bg-gray-800/50 p-4 rounded-xl border border-indigo-500/20 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" placeholder="الاسم *" value={newName} onChange={e => setNewName(e.target.value)} className="bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600" required />
                <select value={newGender} onChange={e => setNewGender(e.target.value)} className="bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600" required>
                  <option value="">الجنس *</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
                <input type="text" inputMode="numeric" placeholder="العمر *" value={newAge} onChange={e => setNewAge(arabicToEnglishNumber(e.target.value))} className="bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600" required />
                <input type="text" inputMode="numeric" placeholder="رقم الهاتف * (مع رمز الدولة)" value={newPhone} onChange={e => setNewPhone(arabicToEnglishNumber(e.target.value))} className="bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600" required />
              </div>
              <div className="flex items-center gap-2 bg-gray-700/50 p-2 rounded-lg">
                <input type="checkbox" id="canPub" checked={canPublish} onChange={e => setCanPublish(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
                <label htmlFor="canPub" className="text-sm text-gray-300 cursor-pointer">صلاحية نشر الإشعارات العامة</label>
              </div>
              <button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold">
                {submitting ? 'جاري الإضافة...' : 'إضافة المشرف'}
              </button>
            </form>
          )}
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
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {s.isFrozen && <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">مجمد</span>}
                      {s.canPublishAnnouncements && <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">صلاحية إشعارات</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(s)}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg"
                  >
                    <FaTrashAlt /> حذف
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

export default SupervisorsManagerModal;