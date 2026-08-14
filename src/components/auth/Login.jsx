import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FaUnlockAlt } from 'react-icons/fa';
import { auth } from '../../services/firebaseAuth';
import { db } from '../../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { sanitizeInput, arabicToEnglishNumber } from '../../utils/helpers';
import { sendWhatsAppToTeacher } from '../../utils/whatsapp';

const Login = ({ onLogin, onFrozen, onCompleteProfile }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetName, setResetName] = useState('');
  const [resetGender, setResetGender] = useState('');
  const [resetAge, setResetAge] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanUsername = username.trim().toLowerCase();
      if (!cleanUsername) {
        setError('يرجى إدخال اسم المستخدم');
        setLoading(false);
        return;
      }

      const email = `${cleanUsername}@readandrise.com`;
      let firebaseUser = null;
      let docId = null;
      let profile = null;

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;

      const q = query(collection(db, 'profiles'), where('username', '==', cleanUsername));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError('بيانات الحساب غير موجودة في قاعدة البيانات. يرجى التواصل مع المعلم.');
        setLoading(false);
        return;
      }
      docId = querySnapshot.docs[0].id;
      profile = querySnapshot.docs[0].data();

      if (!profile.uid || profile.uid !== firebaseUser.uid) {
        await updateDoc(doc(db, 'profiles', docId), { uid: firebaseUser.uid });
      }

      if (profile.isFrozen) {
        onFrozen({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          classIds: profile.classIds || []
        });
        setLoading(false);
        return;
      }

      if (profile.role === 'supervisor') {
        if (!profile.isProfileComplete) {
          onCompleteProfile({
            id: docId,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: profile.username || cleanUsername,
            ...profile
          });
          setLoading(false);
          return;
        }
        onLogin({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          role: profile.role,
          username: profile.username,
          name: profile.name,
          gender: profile.gender,
          age: profile.age,
          phone: profile.phone,
          classIds: [],
          isProfileComplete: true
        });
        setLoading(false);
        return;
      }

      // Student
      if (!profile.isProfileComplete) {
        onCompleteProfile({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || cleanUsername,
          ...profile
        });
        setLoading(false);
        return;
      }

      onLogin({
        id: docId,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        classIds: profile.classIds || [],
        isProfileComplete: true
      });

    } catch (err) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        setError('كلمة المرور غير صحيحة');
      } else if (err.code === 'auth/user-not-found') {
        setError('الحساب غير موجود. يرجى التواصل مع المعلم لتفعيل الحساب.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('تم حظر الحساب مؤقتاً بسبب كثرة المحاولات، حاول لاحقاً');
      } else {
        setError(err.message || 'حدث خطأ غير متوقع.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = () => {
    setResetError('');
    const name = sanitizeInput(resetName.trim());
    const gender = sanitizeInput(resetGender.trim());
    const age = sanitizeInput(arabicToEnglishNumber(resetAge.trim()));
    const phone = sanitizeInput(arabicToEnglishNumber(resetPhone.trim()));

    if (!name || !gender || !age || !phone) {
      setResetError('جميع الحقول مطلوبة.');
      return;
    }

    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
      setResetError('العمر يجب أن يكون رقماً بين 1 و 99.');
      return;
    }

    const message =
      `الموضوع: طلب إعادة تعيين بيانات تسجيل الدخول - ${name}\n\n` +
      `إلى إدارة الأكاديمية الموقرة،\n` +
      `تحية طيبة وبعد،،\n` +
      `أود إبلاغكم بأنني أواجه مشكلة في الوصول إلى حسابي الشخصي في نظام الأكاديمية نتيجة [نسيان كلمة المرور / نسيان اسم المستخدم].\n` +
      `أرجو منكم التكرم بمساعدتي في استعادة الوصول إلى الحساب، وفيما يلي بياناتي للتحقق:\n` +
      `الاسم الكامل: ${name}\n` +
      `رقم الهاتف : ${phone}\n` +
      `الجنس : ${gender}\n` +
      `العمر : ${age}\n` +
      `أقر بأنني صاحب هذا الحساب، وأنتظر تزويدي بالتعليمات اللازمة لإعادة التعيين. شاكراً لكم تعاونكم.\n\n` +
      `مع التحية،\n` +
      `${name}`;

    sendWhatsAppToTeacher(message);
    toast.success('تم إرسال طلب إعادة التعيين إلى المعلم.');
    setShowResetModal(false);
    setResetName('');
    setResetGender('');
    setResetAge('');
    setResetPhone('');
  };

  return (
    <div className="container-center relative min-h-screen overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-6 rounded-3xl shadow-2xl border border-gray-700 flex flex-col items-center relative overflow-hidden min-h-[440px] justify-center">
          <div className="absolute inset-0 flex items-start justify-center pt-6 pointer-events-none z-0 overflow-hidden">
            <img src="/images/logo.png" alt="" className="w-96 h-96 md:w-[420px] md:h-[420px] object-contain opacity-15 animate-logo-bg select-none" onError={(e) => e.target.style.display = 'none'} />
          </div>
          <div className="w-full z-10 flex flex-col items-center space-y-4">
            <div className="text-center space-y-1 w-full">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
                الفرسان التقنيين - اقرآ وارتق
              </h2>
              <div className="w-full max-w-[310px] bg-black/50 border border-gray-700 px-4 py-1.5 rounded-full mx-auto shadow-inner">
                <span className="text-sm font-semibold text-gray-200 tracking-wide">
                  المعلم المسؤول : Dev / همام هاني محمد
                </span>
              </div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4 w-full">
              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium transition-colors group-focus-within:text-purple-400 pointer-events-none">
                  اسم المستخدم
                </span>
                <input
                  type="text"
                  className="w-full bg-gray-800/80 text-right pr-24 pl-4 py-3 text-base border-2 border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition-all duration-200 outline-none"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div className="relative group">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium transition-colors group-focus-within:text-purple-400 pointer-events-none">
                  كلمة المرور
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full bg-gray-800/80 text-right pr-24 pl-12 py-3 text-base border-2 border-gray-600 rounded-xl text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition-all duration-200 outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-gray-600 hover:border-purple-400/50"
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 px-3 rounded-lg border border-red-500/20">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 text-lg font-semibold tracking-wide shadow-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <span className="animate-pulse">جاري التحميل...</span>
                ) : (
                  <>
                    <FaUnlockAlt className="inline-block" /> تسجيل الدخول
                  </>
                )}
              </button>
            </form>

            <button
              onClick={() => setShowResetModal(true)}
              className="text-sm text-gray-400 hover:text-purple-300 transition-colors mt-1 underline decoration-dotted underline-offset-2"
            >
              نسيت كلمة المرور أو اسم المستخدم؟
            </button>

            <div className="pt-2 border-t border-gray-700 text-center text-xs text-gray-400 w-full">
              <p>جميع الحقوق محفوظة © 2026 لصالح المبرمج همام هاني محمد علي</p>
            </div>
          </div>
        </div>
      </div>

      {showResetModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="bg-gray-900 p-6 rounded-3xl max-w-lg w-full border border-purple-500/30 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-2xl font-bold text-center text-purple-300 mb-2">
              <FaUnlockAlt className="inline-block me-2" /> استعادة كلمة المرور
            </h3>
            <p className="text-gray-300 text-sm text-center mb-4">
              يرجى إدخال بياناتك للتحقق من هويتك، وسيتم إرسال طلب إعادة التعيين إلى المعلم.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">الاسم الكامل <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition"
                  value={resetName}
                  onChange={(e) => setResetName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">الجنس <span className="text-red-400">*</span></label>
                <select
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition"
                  value={resetGender}
                  onChange={(e) => setResetGender(e.target.value)}
                  required
                >
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">العمر <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition"
                  value={resetAge}
                  onChange={(e) => setResetAge(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">رقم الهاتف <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full bg-gray-800 text-right p-2 border border-gray-600 rounded-md text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition"
                  value={resetPhone}
                  onChange={(e) => setResetPhone(e.target.value)}
                  required
                />
              </div>
              {resetError && (
                <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 px-3 rounded-lg border border-red-500/20">
                  {resetError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-white text-sm transition"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleResetRequest}
                  className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-xl text-white text-sm font-semibold transition"
                >
                  إرسال الطلب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;