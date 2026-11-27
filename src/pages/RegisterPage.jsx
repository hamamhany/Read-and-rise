// src/pages/RegisterPage.jsx
// صفحة تسجيل الطالب العامة — مستقلة تماماً عن بقية الموقع (لا تسجيل دخول، لا قراءة مباشرة من Firestore)
import React, { useEffect, useState } from 'react';
import { callRegistrationApi } from '../services/registration';

const toLatin = (s) =>
  String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

const GENDER_LABEL = { male: 'ذكور فقط', female: 'إناث فقط', mixed: 'مختلطة' };

const inputCls =
  'w-full bg-white dark:bg-gray-800 text-slate-900 dark:text-white text-right p-3 rounded-xl border border-slate-300 dark:border-gray-600 focus:outline-none focus:border-indigo-500';

const Shell = ({ children }) => (
  <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
    <div className="w-full max-w-lg bg-white/95 dark:bg-gray-900/90 backdrop-blur rounded-3xl shadow-2xl border border-indigo-200 dark:border-indigo-500/30 p-6">
      <div className="text-center mb-5">
        <img src="/images/logo.png" alt="" className="h-16 mx-auto mb-2" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">منصة أقرأ وارتق</h1>
        <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">طلب تسجيل حساب جديد</p>
      </div>
      {children}
    </div>
  </div>
);

const RegisterPage = () => {
  const token = new URLSearchParams(window.location.search).get('t') || '';

  const [state, setState] = useState('loading'); // loading | invalid | form | done
  const [errorMsg, setErrorMsg] = useState('');
  const [classes, setClasses] = useState([]);

  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [classId, setClassId] = useState('');
  const [website, setWebsite] = useState(''); // فخ الروبوتات (مخفي)
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [requestNumber, setRequestNumber] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await callRegistrationApi('info', { token });
        if (cancelled) return;
        setClasses(data.classes || []);
        if ((data.classes || []).length === 1) setClassId(data.classes[0].id);
        setState('form');
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e.message || 'الرابط غير صالح');
        setState('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const selectedClass = classes.find(c => c.id === classId);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!classId) return setFormError('يرجى اختيار الشعبة');
    setSubmitting(true);
    try {
      const data = await callRegistrationApi('submit', {
        token, name, gender, age: toLatin(age), phone: toLatin(phone), classId, website
      });
      setRequestNumber(data.requestNumber);
      setState('done');
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return <Shell><p className="text-center text-slate-500 dark:text-gray-400 py-8">جاري التحميل...</p></Shell>;
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <div className="text-center py-6">
          <div className="text-5xl mb-3">⚠️</div>
          <p className="text-red-600 dark:text-red-300 font-bold">{errorMsg}</p>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-2">تأكد من الرابط أو تواصل مع الجهة التي أرسلته لك.</p>
        </div>
      </Shell>
    );
  }

  if (state === 'done') {
    return (
      <Shell>
        <div className="text-center py-4 space-y-3">
          <div className="text-5xl">✅</div>
          <p className="text-green-600 dark:text-green-300 font-bold text-lg">تم استلام طلبك بنجاح</p>
          <div className="bg-slate-100 dark:bg-gray-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 dark:text-gray-400">رقم طلبك (احتفظ به)</p>
            <p className="text-3xl font-mono font-bold text-indigo-600 dark:text-indigo-300 tracking-widest mt-1" dir="ltr">{requestNumber}</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
            سيتم مراجعة طلبك من قبل المشرفين. قد يتواصل معك أحد المشرفين عبر واتساب على الرقم الذي أدخلته للتحقق من البيانات،
            وبعد الموافقة ستصلك رسالة تحتوي على بيانات الدخول.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-300 mb-1">الاسم الكامل <span className="text-red-500">*</span></label>
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="الاسم الأول والأخير على الأقل" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-slate-600 dark:text-gray-300 mb-1">الجنس <span className="text-red-500">*</span></label>
            <select className={inputCls} value={gender} onChange={e => setGender(e.target.value)} required>
              <option value="">اختر</option>
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-gray-300 mb-1">العمر <span className="text-red-500">*</span></label>
            <input className={inputCls} inputMode="numeric" value={age} onChange={e => setAge(e.target.value)} maxLength={3} required />
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-300 mb-1">رقم الواتساب مع رمز الدولة (بدون صفر) <span className="text-red-500">*</span></label>
          <input className={inputCls} dir="ltr" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value)} placeholder="مثال: 962791234567" maxLength={20} required />
        </div>

        <div>
          <label className="block text-sm text-slate-600 dark:text-gray-300 mb-1">الشعبة <span className="text-red-500">*</span></label>
          {classes.length === 1 ? (
            <div className="bg-slate-100 dark:bg-gray-800 rounded-xl p-3 text-slate-900 dark:text-white font-bold">
              {classes[0].name}
              <span className="text-xs font-normal text-slate-500 dark:text-gray-400 mr-2">({GENDER_LABEL[classes[0].gender] || 'مختلطة'})</span>
            </div>
          ) : (
            <select className={inputCls} value={classId} onChange={e => setClassId(e.target.value)} required>
              <option value="">اختر الشعبة</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {GENDER_LABEL[c.gender] || 'مختلطة'}{c.path ? ` (${c.path})` : ''}
                </option>
              ))}
            </select>
          )}
          {selectedClass?.gender === 'mixed' && gender === 'ذكر' && (
            <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">الشعب المختلطة تقبل الذكور حتى عمر 12 سنة فقط.</p>
          )}
        </div>

        {/* فخ الروبوتات: لا يراه المستخدم */}
        <input
          type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={website} onChange={e => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        {formError && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-200 text-sm rounded-xl p-3">
            {formError}
          </div>
        )}

        <button type="submit" disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3 rounded-xl font-bold">
          {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
        </button>
        <p className="text-[11px] text-center text-slate-400 dark:text-gray-500">بياناتك تُستخدم لأغراض التسجيل في المنصة فقط.</p>
      </form>
    </Shell>
  );
};

export default RegisterPage;
