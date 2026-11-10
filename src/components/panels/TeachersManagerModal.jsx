import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaPlus, FaSpinner, FaChalkboardTeacher, FaPhone,
  FaUser, FaVenusMars, FaCopy, FaCheckCircle
} from 'react-icons/fa';
import { db } from '../../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { createTeacherAccount } from '../../services/teacherAuth';
import { getTeacherDisplayName } from '../../services/classes';
import { createMessageRequest } from '../../services/messageRequests';
import { MESSAGE_REQUEST_TYPES } from '../../constants';
import { sanitizeInput, arabicToEnglishNumber } from '../../utils/helpers';
import { COUNTRIES } from '../../utils/countries';

const TeachersManagerModal = ({ isOpen, onClose, user }) => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [newName, setNewName] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newGender, setNewGender] = useState('');
  const [newAge, setNewAge] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [createdCredentials, setCreatedCredentials] = useState(null);

  useEffect(() => {
    if (isOpen) loadTeachers();
    // eslint-disable-next-line
  }, [isOpen]);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'profiles'), where('role', '==', 'teacher')));
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error('فشل التحميل: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewNickname('');
    setNewGender('');
    setNewAge('');
    setNewPhone('');
    setNewCountry('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!newGender) return toast.error('الجنس مطلوب');
    if (newGender === 'ذكر' && !newName.trim()) return toast.error('الاسم مطلوب');
    if (newGender === 'أنثى' && !newNickname.trim()) return toast.error('اسم الشهرة مطلوب للمعلمة');
    if (!newAge) return toast.error('العمر مطلوب');
    if (!newPhone) return toast.error('رقم الهاتف مطلوب');
    if (!newCountry) return toast.error('البلد مطلوب');

    const phoneDigits = String(arabicToEnglishNumber(newPhone)).replace(/[^\d]/g, '');
    const normalizedPhone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;
    if (normalizedPhone.startsWith('0')) return toast.error('أدخل رقم الهاتف مع رمز الدولة بدون صفر بادئ');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) return toast.error('رقم الهاتف غير صالح (10-15 رقماً)');

    const ageNum = parseInt(arabicToEnglishNumber(newAge));
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) return toast.error('العمر بين 1 و 99');

    setSubmitting(true);
    try {
      const result = await createTeacherAccount({
        name: sanitizeInput(newName),
        nickname: sanitizeInput(newNickname),
        gender: newGender,
        age: ageNum,
        phone: normalizedPhone,
        country: newCountry,
        createdBy: user.id
      });

      // إنشاء طلب إشعار للمدير لإرسال بيانات الدخول
      try {
        await createMessageRequest({
          type: MESSAGE_REQUEST_TYPES.ACTIVATION,
          targetType: 'teacher',
          targetId: result.id,
          targetName: newGender === 'ذكر' ? sanitizeInput(newName) : sanitizeInput(newNickname),
          targetPhone: normalizedPhone,
          targetClass: '',
          requestedBy: user.id,
          requestedByName: user.name || user.username || 'مشرف',
          payload: {
            username: result.username,
            password: result.tempPassword,
            gender: newGender,
            age: ageNum
          }
        });
      } catch (err) {
        console.warn('createMessageRequest failed:', err);
      }

      setCreatedCredentials({
        username: result.username,
        password: result.tempPassword,
        displayName: newGender === 'ذكر' ? sanitizeInput(newName) : sanitizeInput(newNickname)
      });

      resetForm();
      setShowAddForm(false);
      await loadTeachers();
    } catch (e) {
      toast.error('فشل: ' + e.message, { duration: 8000 });
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('تم النسخ'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-emerald-500/30" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <FaChalkboardTeacher className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">إدارة المعلمين</h3>
              <p className="text-xs text-gray-400">إجمالي: {teachers.length} معلم</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="p-5 border-b border-gray-700">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2"
          >
            <FaPlus /> {showAddForm ? 'إغلاق النموذج' : 'إضافة معلم جديد'}
          </button>

          {showAddForm && (
            <form onSubmit={handleSubmit} className="mt-4 bg-gray-800/50 p-4 rounded-xl border border-emerald-500/20 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">الجنس <span className="text-red-400">*</span></label>
                <select
                  value={newGender}
                  onChange={e => setNewGender(e.target.value)}
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                >
                  <option value="">اختر الجنس</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>

              {newGender === 'ذكر' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">الاسم الكامل <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="مثال: محمد أحمد"
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                    required
                  />
                </div>
              )}

              {newGender === 'أنثى' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">اسم الشهرة <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={newNickname}
                      onChange={e => setNewNickname(e.target.value)}
                      placeholder="مثال: أم محمد"
                      className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                      required
                    />
                    <p className="text-[10px] text-cyan-300 mt-1">سيظهر هذا الاسم للمشرفين بدلاً من اسمها الحقيقي</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">الاسم الحقيقي (اختياري)</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="الاسم الحقيقي (اختياري - لن يظهر للمشرفين)"
                      className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">العمر <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newAge}
                    onChange={e => setNewAge(arabicToEnglishNumber(e.target.value))}
                    placeholder="مثال: 30"
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">رقم الهاتف <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPhone}
                    onChange={e => setNewPhone(arabicToEnglishNumber(e.target.value))}
                    placeholder="9627XXXXXXXX"
                    className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">البلد <span className="text-red-400">*</span></label>
                <select
                  value={newCountry}
                  onChange={e => setNewCountry(e.target.value)}
                  className="w-full bg-gray-700 text-right p-2 rounded-lg text-white text-sm border border-gray-600"
                  required
                >
                  <option value="">اختر البلد</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-bold"
              >
                {submitting ? 'جاري الإنشاء...' : 'إنشاء حساب المعلم'}
              </button>
            </form>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <FaSpinner className="animate-spin text-3xl mx-auto mb-2" />
              جاري التحميل...
            </div>
          ) : teachers.length === 0 ? (
            <p className="text-gray-400 text-center py-8">لا يوجد معلمون.</p>
          ) : (
            <div className="space-y-2">
              {teachers.map(t => (
                <div key={t.id} className="p-3 bg-black/30 rounded-xl border border-gray-700">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">
                        {getTeacherDisplayName(t)}
                        {t.gender === 'أنثى' && t.name && (
                          <span className="text-xs text-gray-500 mr-2">({t.name})</span>
                        )}
                      </p>
                      <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-3">
                        <span><FaUser className="inline me-1" />{t.username}</span>
                        {t.phone && <span dir="ltr"><FaPhone className="inline me-1" />{t.phone}</span>}
                        <span className={t.gender === 'أنثى' ? 'text-pink-400' : 'text-blue-400'}>
                          <FaVenusMars className="inline me-1" />{t.gender}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* مودال عرض بيانات الدخول */}
      {createdCredentials && (
        <div className="fixed inset-0 bg-black/90 z-[80] flex items-center justify-center p-4">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-emerald-500/40">
            <div className="text-center mb-4">
              <FaCheckCircle className="text-emerald-400 text-5xl mx-auto mb-2" />
              <h3 className="text-lg font-bold text-emerald-300">تم إنشاء الحساب بنجاح</h3>
              <p className="text-xs text-gray-400 mt-1">تم إرسال طلب للمدير لإرسال البيانات عبر واتساب</p>
            </div>

            <div className="bg-gray-800 p-4 rounded-xl space-y-3">
              <div>
                <label className="text-xs text-gray-400">المعلم</label>
                <p className="text-white font-bold">{createdCredentials.displayName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400">اسم المستخدم</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-black/40 px-3 py-2 rounded text-cyan-300 font-mono text-sm" dir="ltr">
                    {createdCredentials.username}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdCredentials.username)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white p-2 rounded"
                  >
                    <FaCopy />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">كلمة المرور المؤقتة</label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 bg-black/40 px-3 py-2 rounded text-cyan-300 font-mono text-sm" dir="ltr">
                    {createdCredentials.password}
                  </code>
                  <button
                    onClick={() => copyToClipboard(createdCredentials.password)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white p-2 rounded"
                  >
                    <FaCopy />
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCreatedCredentials(null)}
              className="w-full mt-4 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeachersManagerModal;