import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '../../services/firebaseAuth';
import { db } from '../../firebase';
import { signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { sanitizeInput } from '../../utils/helpers';
import { COUNTRIES } from '../../utils/countries';

const CompleteProfile = ({ user, onSuccess, onCancel }) => {
  const isFemaleTeacher = user.role === 'teacher' && user.gender === 'أنثى';

  // ✅ البلد إجباري لكل المستخدمين (طالب، معلم، مشرف)
  const requiresCountry = ['student', 'teacher', 'supervisor'].includes(user.role);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newName, setNewName] = useState(user.name || '');
  const [newNickname, setNewNickname] = useState(user.nickname || '');
  const [newCountry, setNewCountry] = useState(user.country || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const usernameRegex = /^[a-zA-Z0-9@._-]+$/;
    const cleanUsername = sanitizeInput(newUsername).toLowerCase();

    if (!cleanUsername) { setError('يرجى إدخال اسم المستخدم'); return; }
    if (!usernameRegex.test(cleanUsername)) { setError('اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط'); return; }
    if (!newPassword) { setError('يرجى إدخال كلمة المرور'); return; }
    if (!usernameRegex.test(newPassword)) { setError('كلمة المرور يجب أن تحتوي على أحرف إنجليزية وأرقام والرموز (@ . _ -) فقط'); return; }
    if (newPassword !== confirmPassword) { setError('كلمة المرور غير متطابقة مع تأكيدها'); return; }
    if (newPassword.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (isFemaleTeacher && !newNickname.trim()) { setError('اسم الشهرة مطلوب'); return; }
    // ✅ البلد إجباري
    if (requiresCountry && !newCountry) { setError('يرجى اختيار البلد'); return; }

    const email = `${cleanUsername}@readandrise.com`;

    try {
      const q = query(collection(db, 'profiles'), where('username', '==', cleanUsername));
      const querySnap = await getDocs(q);
      let exists = false;
      querySnap.forEach(doc => { if (doc.id !== user.id) exists = true; });
      if (exists) { setError('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار آخر'); return; }
    } catch (err) {
      console.warn('خطأ في التحقق:', err);
      setError('حدث خطأ أثناء التحقق، حاول مرة أخرى.');
      return;
    }

    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى');

      const idToken = await currentUser.getIdToken();

      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'complete_profile',
          userId: user.id,
          newUsername: cleanUsername,
          newPassword: newPassword
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'فشل تحديث بيانات الدخول');
      }

      const updateData = {
        username: cleanUsername,
        email: email,
        uid: user.uid,
        isProfileComplete: true,
        infoVerified: true,
        tempPassword: null,
        updatedAt: serverTimestamp()
      };

      // ✅ حفظ البلد (إجباري)
      if (requiresCountry) {
        updateData.country = newCountry;
      }

      if (isFemaleTeacher) {
        updateData.nickname = sanitizeInput(newNickname);
        updateData.name = sanitizeInput(newName) || '';
      }

      await setDoc(doc(db, 'profiles', user.id), updateData, { merge: true });

      try {
        await signOut(auth);
        await signInWithEmailAndPassword(auth, email, newPassword);
      } catch (reloginErr) {
        console.warn('Auto re-login failed:', reloginErr);
      }

      const updatedDocSnap = await getDoc(doc(db, 'profiles', user.id));
      let updatedProfile = {};
      if (updatedDocSnap.exists()) updatedProfile = updatedDocSnap.data();

      toast.success('تم تفعيل حسابك بنجاح! يمكنك الآن استخدام اسم المستخدم الجديد وكلمة المرور.');
      onSuccess({
        ...user,
        username: cleanUsername,
        email: email,
        isProfileComplete: true,
        infoVerified: true,
        ...updatedProfile
      });
    } catch (err) {
      console.error('خطأ في التفعيل:', err);

      const msg = String(err.message || '');
      if (msg.includes('already in use') || msg.includes('مستخدم بالفعل') || msg.includes('email-already-exists')) {
        setError('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار آخر');
      } else if (msg.includes('weak') || msg.includes('ضعيفة') || msg.includes('invalid-password')) {
        setError('كلمة المرور ضعيفة — استخدم 6 أحرف على الأقل');
      } else if (msg.includes('غير مصرح') || msg.includes('Unauthorized') || msg.includes('انتهت الجلسة')) {
        setError('انتهت الجلسة — يرجى تسجيل الدخول من جديد');
        setTimeout(() => onCancel(), 2500);
      } else {
        setError('فشل التفعيل: ' + (err.message || 'خطأ غير معروف'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-6 rounded-3xl shadow-2xl border border-gray-700 flex flex-col items-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-green-400 to-blue-400 text-transparent bg-clip-text mb-4">
            إكمال تفعيل الحساب
          </h2>
          <p className="text-gray-300 text-sm text-center mb-4">
            مرحباً {user.name || user.nickname || 'المستخدم'}، يرجى اختيار اسم مستخدم وكلمة مرور جديدين لتأكيد حسابك.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4 w-full">
            <div>
              <label className="text-sm text-gray-300 block mb-1">اسم المستخدم الجديد (أحرف إنجليزية وأرقام والرموز @ . _ -)</label>
              <input
                type="text"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                pattern="[a-zA-Z0-9@._-]+"
                title="أحرف إنجليزية وأرقام والرموز @ . _ -"
              />
            </div>

            {isFemaleTeacher && (
              <>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">اسم الشهرة (مطلوب)</label>
                  <input
                    type="text"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    placeholder="مثال: أم محمد"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-300 block mb-1">الاسم الحقيقي (اختياري)</label>
                  <input
                    type="text"
                    className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="الاسم الحقيقي (لن يظهر للمشرفين)"
                  />
                </div>
              </>
            )}

            {/* ✅ اختيار البلد — إجباري للطالب والمعلم والمشرف */}
            {requiresCountry && (
              <div>
                <label className="text-sm text-gray-300 block mb-1">البلد <span className="text-red-400">*</span></label>
                <select
                  className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                  value={newCountry}
                  onChange={(e) => setNewCountry(e.target.value)}
                  required
                >
                  <option value="">اختر البلد</option>
                  {COUNTRIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">لا يمكن تغيير البلد لاحقاً</p>
              </div>
            )}

            <div>
              <label className="text-sm text-gray-300 block mb-1">كلمة المرور الجديدة (6 أحرف على الأقل)</label>
              <input
                type="password"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength="6"
                pattern="[a-zA-Z0-9@._-]+"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">تأكيد كلمة المرور</label>
              <input
                type="password"
                className="bg-gray-800 w-full text-right p-2 border border-gray-600 rounded-md text-white"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm text-center bg-red-500/10 py-2 px-3 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-md disabled:opacity-60"
            >
              {loading ? 'جاري التفعيل...' : 'تفعيل الحساب'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-white w-full text-center mt-2"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfile;