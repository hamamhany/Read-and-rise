import './index.css'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'

// Firebase imports
import { auth, db } from './firebase.js'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  updatePassword,
  signOut
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore'

// ========== Utility: generateId (unchanged) ==========
const generateId = () => {
  try {
    return crypto.randomUUID()
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }
}

// ========== Hook: dynamic background (unchanged) ==========
const useDynamicBackground = () => {
  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      @keyframes logoPulseSoft {
        0% { transform: scale(1); opacity: 0.12; }
        50% { transform: scale(1.04); opacity: 0.18; }
        100% { transform: scale(1); opacity: 0.12; }
      }
      .animate-logo-bg {
        animation: logoPulseSoft 6s ease-in-out infinite;
      }
    `
    document.head.appendChild(style)

    const bgGradients = [
      'linear-gradient(135deg, #0f172a, #1e1b4b, #311042)',
      'linear-gradient(135deg, #090d16, #111827, #1f2937)',
      'linear-gradient(135deg, #020617, #0f172a, #1e293b)',
      'linear-gradient(135deg, #070a13, #161224, #281432)'
    ]
    let currentIndex = 0

    document.body.style.background = bgGradients[currentIndex]
    document.body.style.transition = 'background 4s ease-in-out'

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % bgGradients.length
      document.body.style.background = bgGradients[currentIndex]
    }, 7000)

    return () => {
      clearInterval(interval)
      document.body.style.background = ''
      document.body.style.transition = ''
      document.head.removeChild(style)
    }
  }, [])
}

// ========== CountdownTimer (unchanged) ==========
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calculateTime = () => {
      const target = new Date(targetDate).getTime()
      const now = new Date().getTime()
      const distance = target - now
      if (distance < 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return true
      }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      })
      return false
    }

    calculateTime()
    const interval = setInterval(() => {
      const isEnded = calculateTime()
      if (isEnded) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  const labels = { days: 'أيام', hours: 'ساعات', minutes: 'دقائق', seconds: 'ثواني' }

  return (
    <div className="flex gap-4 text-center flex-wrap justify-center">
      {Object.entries(timeLeft).map(([unit, value]) => (
        <div key={unit} className="glass p-4 min-w-[85px] rounded-2xl border border-white/10 shadow-md">
          <div className="text-3xl font-bold text-purple-300 drop-shadow">{value}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400 mt-1">{labels[unit]}</div>
        </div>
      ))}
    </div>
  )
}

const HomeworkTextCountdown = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    const calculate = () => {
      const target = new Date(targetDate).getTime()
      const now = new Date().getTime()
      const distance = target - now
      if (distance <= 0) {
        setIsPast(true)
        return true
      }
      setIsPast(false)
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      })
      return false
    }

    calculate()
    const interval = setInterval(() => {
      const ended = calculate()
      if (ended) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  if (isPast) return null

  return (
    <div className="text-sm font-semibold text-pink-300 mt-2 tracking-wide bg-pink-950/30 px-4 py-2 rounded-xl inline-block border border-pink-500/20 animate-pulse">
      متبقي على إظهار الواجب : {timeLeft.days} يوم :{timeLeft.hours} ساعة :{timeLeft.minutes} دقائق :{timeLeft.seconds} ثواني
    </div>
  )
}

// ========== FrozenAccount (unchanged) ==========
const FrozenAccount = ({ user, onLogout }) => {
  const studentName = user?.name || user?.username || 'الطالب'
  const studentClass = user?.class_name || 'غير محدد'
  const studentPhone = user?.phone || 'غير مسجل'

  const waMessage = encodeURIComponent(
    `السلام عليكم ورحمة الله وبركاته\n` +
    `الموضوع: طلب فك تجميد حساب - [${studentName}]\n\n` +
    `مرحباً أستاذ همام هاني محمد ،\n` +
    `أرجو منكم التكرم بفك تجميد حسابي في التطبيق، حيث أنني حالياً لا أستطيع الوصول للمحتوى التعليمي.\n\n` +
    `بيانات الطالب:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `الشعبة: ${studentClass}\n` +
    `رقم الهاتف المسجل: ${studentPhone}\n\n` +
    `شاكراً لكم تعاونكم.`
  )

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-8 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl text-center space-y-6">
          <div className="text-6xl mb-2">🚫</div>
          <h2 className="text-2xl font-bold text-red-400">الحساب مجمد</h2>
          <p className="text-gray-300 leading-relaxed">
            يرجى التواصل مع <strong className="text-purple-300">رئيس قسم التكنولوجيا وإدارة المعلومات: همام هاني محمد</strong> عبر واتساب.
          </p>
          <a
            href={`https://wa.me/962786117388?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-4 text-lg bg-green-600 hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
          >
            <span>📱</span> اضغط هنا للتواصل مع المشرف
          </a>
          <button
            onClick={onLogout}
            type="button"
            className="text-sm text-gray-400 hover:text-white transition-colors mt-4"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== SignUp (converted to Firebase) ==========
const SignUp = ({ onSuccess, onCancel }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()

    const cleanUsername = username.trim().toLowerCase()
    const cleanPhone = phone.replace(/[^0-9]/g, '')

    if (!cleanUsername || cleanUsername.length < 3) {
      setError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل')
      return
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور غير متطابقة')
      return
    }

    setLoading(true)
    setError('')

    try {
      const email = `${cleanUsername}@readandrise.com`

      // 1. Create user with email/password
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const firebaseUser = userCredential.user

      // 2. Create profile document in Firestore
      const profileData = {
        email: firebaseUser.email,
        username: cleanUsername,
        phone: cleanPhone,
        whatsapp: cleanPhone,
        role: 'student',
        isFrozen: false,
        isProfileComplete: false,
        infoVerified: false,
        pendingChanges: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
      await setDoc(doc(db, 'profiles', firebaseUser.uid), profileData)

      // 3. Auto-login: the onAuthStateChanged will trigger
      // onSuccess will be called after state updates
      onSuccess()
    } catch (err) {
      console.error(err)
      if (err.code === 'auth/email-already-in-use') {
        setError('اسم المستخدم موجود بالفعل، اختر اسماً آخر')
      } else {
        setError(err.message || 'حدث خطأ غير متوقع.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-6 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-2xl font-bold text-center text-green-300">إنشاء حساب جديد</h2>
          <p className="text-gray-400 text-sm text-center">أدخل بياناتك لإنشاء حساب في المنصة</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1">اسم المستخدم <span className="text-red-400">*</span></label>
              <input
                type="text"
                className="input-glass w-full text-right"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                minLength={3}
              />
              <p className="text-xs text-gray-500 mt-1">سيتم استخدامه لتسجيل الدخول (مثل: student1)</p>
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">رقم الهاتف (واتساب) <span className="text-red-400">*</span></label>
              <input
                type="text"
                className="input-glass w-full text-right"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">كلمة المرور <span className="text-red-400">*</span></label>
              <input
                type="password"
                className="input-glass w-full text-right"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">تأكيد كلمة المرور <span className="text-red-400">*</span></label>
              <input
                type="password"
                className="input-glass w-full text-right"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700">
              {loading ? 'جاري التسجيل...' : 'إنشاء حساب'}
            </button>
          </form>
          <button onClick={onCancel} type="button" className="text-sm text-gray-400 hover:text-white w-full text-center mt-2">
            لديك حساب بالفعل؟ تسجيل الدخول
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== CompleteProfile (converted to Firebase) ==========
const CompleteProfile = ({ user, onSuccess, onCancel }) => {
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [phone, setPhone] = useState('')
  const [classId, setClassId] = useState('')
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const q = query(collection(db, 'classes'))
        const querySnapshot = await getDocs(q)
        const classesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        setClasses(classesList)
      } catch (err) {
        console.error('Error fetching classes:', err)
      }
    }
    fetchClasses()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const cleanName = name.trim()
    const cleanPhone = phone.replace(/[^0-9]/g, '')
    const cleanAge = parseInt(age, 10)

    if (!cleanName || !cleanPhone || isNaN(cleanAge) || cleanAge < 1) {
      setError('يرجى ملء جميع الحقول بشكل صحيح')
      return
    }

    setLoading(true)
    setError('')

    try {
      const userId = user.id

      const updates = {
        name: cleanName,
        gender: gender || null,
        age: cleanAge,
        phone: cleanPhone,
        classId: classId || null,
        isProfileComplete: true,
        infoVerified: true,
        updatedAt: serverTimestamp()
      }

      await updateDoc(doc(db, 'profiles', userId), updates)

      // Fetch updated profile
      const docSnap = await getDoc(doc(db, 'profiles', userId))
      const profileData = docSnap.data()

      onSuccess({ ...user, ...profileData })
    } catch (err) {
      console.error(err)
      setError(err.message || 'حدث خطأ غير متوقع.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-6 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-2xl font-bold text-center text-blue-300">إكمال البيانات الشخصية</h2>
          <p className="text-gray-400 text-sm text-center">يرجى إدخال معلوماتك الأساسية لإكمال التسجيل</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1">الاسم الكامل <span className="text-red-400">*</span></label>
              <input
                type="text"
                className="input-glass w-full text-right"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">الجنس</label>
              <select
                className="input-glass w-full text-right"
                value={gender}
                onChange={e => setGender(e.target.value)}
              >
                <option value="">اختر</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">العمر <span className="text-red-400">*</span></label>
              <input
                type="number"
                className="input-glass w-full text-right"
                value={age}
                onChange={e => setAge(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">رقم الهاتف <span className="text-red-400">*</span></label>
              <input
                type="text"
                className="input-glass w-full text-right"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">الشعبة</label>
              <select
                className="input-glass w-full text-right"
                value={classId}
                onChange={e => setClassId(e.target.value)}
              >
                <option value="">اختر الشعبة</option>
                {classes.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700">
              {loading ? 'جاري الحفظ...' : 'حفظ البيانات'}
            </button>
          </form>
          <button onClick={onCancel} type="button" className="text-sm text-gray-400 hover:text-white w-full text-center mt-2">تسجيل الخروج</button>
        </div>
      </div>
    </div>
  )
}

// ========== Login (converted to Firebase) ==========
const Login = ({ onLogin, onFrozen, onSignUp, onCompleteProfile }) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const cleanUsername = username.trim().toLowerCase()
      if (!cleanUsername) {
        setError('يرجى إدخال اسم المستخدم')
        setLoading(false)
        return
      }

      const email = `${cleanUsername}@readandrise.com`

      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const firebaseUser = userCredential.user

      // Profile will be loaded by onAuthStateChanged, but we need to process it here
      // We'll fetch profile manually because the state might not have updated yet
      const docSnap = await getDoc(doc(db, 'profiles', firebaseUser.uid))
      if (!docSnap.exists()) {
        // No profile, redirect to complete profile
        onCompleteProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: cleanUsername
        })
        setLoading(false)
        return
      }

      const profile = docSnap.data()

      if (profile.isFrozen) {
        onFrozen({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          class_name: 'غير محدد'
        })
        setLoading(false)
        return
      }

      if (!profile.isProfileComplete) {
        onCompleteProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || cleanUsername,
          ...profile
        })
        setLoading(false)
        return
      }

      onLogin({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        classId: profile.classId,
        needsPasswordChange: profile.infoVerified === false,
        isProfileComplete: true
      })
    } catch (err) {
      console.error(err)
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة')
      } else {
        setError(err.message || 'حدث خطأ غير متوقع.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center relative min-h-screen overflow-hidden" dir="rtl">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-6 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl flex flex-col items-center relative overflow-hidden min-h-[440px] justify-center">
          <div className="absolute inset-0 flex items-start justify-center pt-6 pointer-events-none z-0 overflow-hidden">
            <img
              src="/images/logo.png"
              alt=""
              className="w-96 h-96 md:w-[420px] md:h-[420px] object-contain opacity-15 animate-logo-bg select-none"
              onError={(e) => e.target.style.display = 'none'}
            />
          </div>
          <div className="w-full z-10 flex flex-col items-center space-y-4">
            <div className="text-center space-y-1 w-full">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
                الفرسان التقنيين - اقرآ وارتق
              </h2>
              <div className="w-full max-w-[310px] bg-black/50 border border-white/10 px-4 py-1.5 rounded-full mx-auto shadow-inner">
                <span className="text-sm font-semibold text-gray-200 tracking-wide">
                  المعلم المسؤول : Dev / همام هاني محمد
                </span>
              </div>
            </div>
            <form onSubmit={handleAuth} className="space-y-3.5 w-full">
              <div className="relative flex items-center">
                <span className="absolute right-4 text-gray-400 pointer-events-none text-sm font-medium">اسم المستخدم</span>
                <input type="text" className="input-glass w-full text-right pr-24 pl-4 text-base bg-black/20" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="relative flex items-center">
                <span className="absolute right-4 text-gray-400 pointer-events-none text-sm font-medium">كلمة المرور</span>
                <input type={showPassword ? "text" : "password"} className="input-glass w-full text-right pr-24 pl-12 text-base bg-black/20" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors focus:outline-none bg-white/5 px-2 py-1 rounded border border-white/10">
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
              {error && <p className="text-red-400 text-sm text-center whitespace-pre-wrap">{error}</p>}
              <button type="submit" className="btn-primary w-full py-2.5 text-lg font-semibold tracking-wide shadow-lg" disabled={loading}>
                {loading ? 'جاري التحميل...' : 'تسجيل الدخول'}
              </button>
            </form>
            <button
              onClick={onSignUp}
              type="button"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline-offset-2"
            >
              ليس لديك حساب؟ أنشئ حساباً جديداً
            </button>
            <div className="pt-2 border-t border-white/10 text-center text-xs text-gray-400 w-full">
              <p>جميع الحقوق محفوظة © 2026 لصالح المبرمج همام هاني محمد علي</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== TeacherPanel (converted to Firebase) ==========
const TeacherPanel = ({ user, onLogout }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [homeworks, setHomeworks] = useState([])
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [pendingReviews, setPendingReviews] = useState([])

  const [newHomeworkText, setNewHomeworkText] = useState('')
  const [publishType, setPublishType] = useState('now')
  const [newHomeworkRevealTime, setNewHomeworkRevealTime] = useState('')

  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentGender, setNewStudentGender] = useState('')
  const [newStudentAge, setNewStudentAge] = useState('')
  const [newStudentPhone, setNewStudentPhone] = useState('')
  const [newStudentClass, setNewStudentClass] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)

  const [newLessonTime, setNewLessonTime] = useState('')
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [showStudentsModal, setShowStudentsModal] = useState(false)

  const cleanPhoneNumber = (phone) => {
    if (!phone) return ''
    return phone.replace(/^0+/, '').replace(/[^0-9]/g, '')
  }

  // Helper: fetch class names for given ids
  const fetchClassNames = async (classIds) => {
    if (!classIds || classIds.length === 0) return {}
    const names = {}
    for (const id of classIds) {
      try {
        const docSnap = await getDoc(doc(db, 'classes', id))
        if (docSnap.exists()) {
          names[id] = docSnap.data().name
        }
      } catch (err) {
        console.error('Error fetching class name:', err)
      }
    }
    return names
  }

  // Fetch all teacher data
  const fetchTeacherData = async () => {
    try {
      const teacherId = user.id
      const teacherRef = doc(db, 'teachers', teacherId)
      let teacherDoc = await getDoc(teacherRef)

      if (!teacherDoc.exists()) {
        // Create default teacher document
        await setDoc(teacherRef, {
          lessonTime: null,
          homeworks: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })
        teacherDoc = await getDoc(teacherRef)
      }

      const teacherData = teacherDoc.data()
      setLessonTime(teacherData.lessonTime || '')
      setHomeworks(teacherData.homeworks || [])

      // Fetch students (role == 'student')
      const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'))
      const studentsSnapshot = await getDocs(studentsQuery)
      let studentsList = studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      // Enrich with class names
      const classIds = studentsList.map(s => s.classId).filter(Boolean)
      const classMap = await fetchClassNames(classIds)
      studentsList = studentsList.map(s => ({
        ...s,
        classes: s.classId ? { name: classMap[s.classId] || null } : null
      }))
      setStudents(studentsList)

      // Fetch classes for this teacher
      const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', teacherId))
      const classesSnapshot = await getDocs(classesQuery)
      let classesList = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      if (classesList.length === 0) {
        // Create default classes
        const defaultClasses = [
          { name: 'أساسيات البرمجة', teacherId: teacherId },
          { name: 'بايثون (Python)', teacherId: teacherId }
        ]
        const created = []
        for (const cls of defaultClasses) {
          const ref = doc(collection(db, 'classes'))
          await setDoc(ref, { ...cls, createdAt: serverTimestamp() })
          created.push({ id: ref.id, ...cls })
        }
        classesList = created
      }
      setClasses(classesList)

      // Fetch pending reviews (pendingChanges != null)
      const pendingQuery = query(
        collection(db, 'profiles'),
        where('role', '==', 'student'),
        where('pendingChanges', '!=', null)
      )
      const pendingSnapshot = await getDocs(pendingQuery)
      let pendingList = pendingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      // Enrich with class names
      const pendingClassIds = pendingList.map(s => s.classId).filter(Boolean)
      const pendingClassMap = await fetchClassNames(pendingClassIds)
      pendingList = pendingList.map(s => ({
        ...s,
        classes: s.classId ? { name: pendingClassMap[s.classId] || null } : null
      }))
      setPendingReviews(pendingList)

    } catch (err) {
      console.error('Error fetching teacher data:', err)
      setErrorMsg('فشل تحميل البيانات: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Real-time listeners
  useEffect(() => {
    fetchTeacherData()

    // Listen to teacher document changes
    const teacherRef = doc(db, 'teachers', user.id)
    const unsubscribeTeacher = onSnapshot(teacherRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        setLessonTime(data.lessonTime || '')
        setHomeworks(data.homeworks || [])
      }
    })

    // Listen to students changes
    const studentsQuery = query(collection(db, 'profiles'), where('role', '==', 'student'))
    const unsubscribeStudents = onSnapshot(studentsQuery, async (snapshot) => {
      let studentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const classIds = studentsList.map(s => s.classId).filter(Boolean)
      const classMap = await fetchClassNames(classIds)
      studentsList = studentsList.map(s => ({
        ...s,
        classes: s.classId ? { name: classMap[s.classId] || null } : null
      }))
      setStudents(studentsList)
    })

    // Listen to classes changes
    const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', user.id))
    const unsubscribeClasses = onSnapshot(classesQuery, (snapshot) => {
      const classesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setClasses(classesList)
    })

    // Listen to pending reviews
    const pendingQuery = query(
      collection(db, 'profiles'),
      where('role', '==', 'student'),
      where('pendingChanges', '!=', null)
    )
    const unsubscribePending = onSnapshot(pendingQuery, async (snapshot) => {
      let pendingList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      const classIds = pendingList.map(s => s.classId).filter(Boolean)
      const classMap = await fetchClassNames(classIds)
      pendingList = pendingList.map(s => ({
        ...s,
        classes: s.classId ? { name: classMap[s.classId] || null } : null
      }))
      setPendingReviews(pendingList)
    })

    return () => {
      unsubscribeTeacher()
      unsubscribeStudents()
      unsubscribeClasses()
      unsubscribePending()
    }
  }, [user.id])

  // Accept review
  const acceptReview = async (studentId) => {
    try {
      const docRef = doc(db, 'profiles', studentId)
      const docSnap = await getDoc(docRef)
      if (!docSnap.exists()) {
        alert('الطالب غير موجود.')
        return
      }
      const student = docSnap.data()
      if (!student.pendingChanges) {
        alert('لا توجد تغييرات معلقة لهذا الطالب.')
        return
      }

      const newData = {
        name: student.pendingChanges.name ?? student.name,
        gender: student.pendingChanges.gender ?? student.gender,
        age: student.pendingChanges.age != null ? Number(student.pendingChanges.age) : student.age,
        phone: student.pendingChanges.phone ?? student.phone,
        infoVerified: true,
        pendingChanges: null,
        updatedAt: serverTimestamp()
      }

      await updateDoc(docRef, newData)
      alert('تم قبول التغييرات وتحديث بيانات الطالب بنجاح.')
    } catch (err) {
      console.error('Error accepting review:', err)
      alert('فشل قبول المراجعة: ' + (err.message || 'خطأ غير معروف'))
    }
  }

  // Reject review
  const rejectReview = async (studentId) => {
    if (!window.confirm('هل أنت متأكد من رفض هذه التغييرات؟')) return
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        pendingChanges: null,
        updatedAt: serverTimestamp()
      })
      alert('تم رفض التغييرات.')
    } catch (err) {
      console.error('Error rejecting review:', err)
      alert('فشل رفض المراجعة: ' + (err.message || 'خطأ غير معروف'))
    }
  }

  // Save homework
  const saveHomework = async () => {
    if (!newHomeworkText.trim()) return alert('يرجى كتابة نص الواجب أولاً.')
    const revealTime = publishType === 'now' ? new Date().toISOString() : new Date(newHomeworkRevealTime).toISOString()
    if (publishType === 'schedule' && !newHomeworkRevealTime) {
      return alert('يرجى تحديد تاريخ ووقت نشر الواجب المجدول.')
    }
    const newHwItem = {
      id: generateId(),
      text: newHomeworkText,
      reveal_time: revealTime,
      is_scheduled: publishType === 'schedule'
    }
    try {
      const teacherRef = doc(db, 'teachers', user.id)
      await updateDoc(teacherRef, {
        homeworks: arrayUnion(newHwItem),
        updatedAt: serverTimestamp()
      })
      // Optimistically update local state? onSnapshot will update.
      setNewHomeworkText('')
      setNewHomeworkRevealTime('')
      alert(publishType === 'now' ? 'تم نشر الواجب فوراً!' : 'تم جدولة الواجب بنجاح.')
    } catch (err) {
      alert('فشل حفظ الواجب: ' + err.message)
    }
  }

  // Delete homework
  const deleteHomework = async (hwId) => {
    if (!window.confirm('هل تريد حذف هذا الواجب نهائياً؟')) return
    try {
      const teacherRef = doc(db, 'teachers', user.id)
      const docSnap = await getDoc(teacherRef)
      if (docSnap.exists()) {
        const currentHomeworks = docSnap.data().homeworks || []
        const filtered = currentHomeworks.filter(h => h.id !== hwId)
        await updateDoc(teacherRef, {
          homeworks: filtered,
          updatedAt: serverTimestamp()
        })
      }
    } catch (err) {
      alert('فشل حذف الواجب: ' + err.message)
    }
  }

  // Toggle freeze
  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.isFrozen
    if (nextStatus) {
      const confirmFreeze = window.confirm(
        'تنبيه هام:\nإذا قمت بتجميد هذا الحساب، سيبقى مجمداً حتى تقوم بفك التجميد يدوياً.\nهل تريد المتابعة؟'
      )
      if (!confirmFreeze) return
    }
    try {
      await updateDoc(doc(db, 'profiles', student.id), {
        isFrozen: nextStatus,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Error toggling freeze:', err)
      alert('فشل تحديث حالة التجميد: ' + (err.message || 'خطأ غير معروف'))
    }
  }

  // Delete all frozen accounts
  const deleteFrozenAccounts = async () => {
    try {
      const q = query(collection(db, 'profiles'), where('isFrozen', '==', true))
      const snapshot = await getDocs(q)
      if (snapshot.empty) {
        alert('لا يوجد حسابات مجمدة.')
        return
      }
      if (!window.confirm(`هل أنت متأكد من حذف ${snapshot.size} حساب مجمد نهائياً؟`)) return
      for (const docSnap of snapshot.docs) {
        await deleteDoc(doc(db, 'profiles', docSnap.id))
      }
      alert(`تم حذف ${snapshot.size} حساب مجمد.`)
    } catch (err) {
      alert('خطأ أثناء الحذف: ' + err.message)
    }
  }

  // Check inactivity (30 days)
  const checkInactivityWarning = (lastSeenStr) => {
    if (!lastSeenStr) return false
    const lastSeen = new Date(lastSeenStr)
    const diffTime = new Date().getTime() - lastSeen.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays >= 30
  }

  // Communicate with parent via WhatsApp
  const communicateWithParent = (student) => {
    const phone = student.phone || ''
    if (!phone) {
      alert('رقم الهاتف غير مسجل لهذا الطالب.')
      return
    }
    const cleanedPhone = cleanPhoneNumber(phone)
    if (!cleanedPhone) {
      alert('رقم الهاتف غير صالح.')
      return
    }
    const message = encodeURIComponent(
      `أهلاً بك،\n` +
      `معكم همام هاني محمد علي، معلم تطوير البرمجيات ورئيس قسم التكنولوجيا وأمن المعلومات.\n` +
      `أتواصل معك بخصوص [........].\n` +
      `بانتظار ردكم لمتابعة العمل.\n` +
      `تحياتي،`
    )
    window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank')
  }

  // Reset student (set infoVerified false, unfreeze, clear pending)
  const handleResetStudent = async (studentId) => {
    if (!window.confirm('سيتم إعادة تعيين هذا الحساب ليصبح كأنه جديد، وسيُطلب من الطالب تغيير كلمة المرور عند تسجيل الدخول. هل تريد المتابعة؟')) return
    try {
      await updateDoc(doc(db, 'profiles', studentId), {
        infoVerified: false,
        isFrozen: false,
        pendingChanges: null,
        updatedAt: serverTimestamp()
      })
      alert('تم إعادة تعيين الحساب بنجاح. سيتوجب على الطالب تغيير كلمة المرور عند تسجيل الدخول.')
    } catch (err) {
      alert('فشل إعادة التعيين: ' + (err.message || 'خطأ غير معروف'))
    }
  }

  // Delete student permanently
  const handleDeleteStudentPermanently = async (studentId) => {
    if (!window.confirm('إجراء خطير: هل أنت متأكد من حذف حساب هذا الطالب نهائياً وفوراً؟')) return
    try {
      await deleteDoc(doc(db, 'profiles', studentId))
      alert('تم حذف الطالب من النظام.')
    } catch (err) {
      alert('فشل حذف الطالب: ' + err.message)
    }
  }

  // Update lesson time
  const updateLessonTime = async () => {
    if (!newLessonTime) return alert('يرجى اختيار تاريخ ووقت الحصة أولاً.')
    try {
      const isoTime = new Date(newLessonTime).toISOString()
      await updateDoc(doc(db, 'teachers', user.id), {
        lessonTime: isoTime,
        updatedAt: serverTimestamp()
      })
      setNewLessonTime('')
      alert('تم تحديث موعد الحصة القادمة بنجاح!')
    } catch (err) {
      alert('فشل تحديث موعد الحصة: ' + err.message)
    }
  }

  // Add student
  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!newStudentName || !newStudentGender || !newStudentAge || !newStudentPhone || !newStudentClass) {
      alert('جميع الحقول مطلوبة')
      return
    }

    setStudentLoading(true)
    try {
      // Verify class exists
      const classRef = doc(db, 'classes', newStudentClass)
      const classSnap = await getDoc(classRef)
      if (!classSnap.exists()) {
        alert('الشعبة المختارة غير صالحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
        setStudentLoading(false)
        return
      }

      const newId = generateId()
      const tempEmail = `student_${newId}@temp.com`

      // Generate unique username
      const baseUsername = newStudentName.trim().replace(/\s+/g, '.').toLowerCase()
      let username = baseUsername
      let counter = 1
      let exists = true
      while (exists) {
        const q = query(collection(db, 'profiles'), where('username', '==', username))
        const querySnap = await getDocs(q)
        if (querySnap.empty) {
          exists = false
        } else {
          username = `${baseUsername}${counter}`
          counter++
        }
      }

      const cleanPhone = newStudentPhone.replace(/[^0-9]/g, '')
      const ageNum = parseInt(newStudentAge)
      if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
        alert('العمر يجب أن يكون رقماً بين 1 و 99.')
        setStudentLoading(false)
        return
      }

      if (!['ذكر', 'أنثى'].includes(newStudentGender)) {
        alert('الجنس يجب أن يكون ذكر أو أنثى.')
        setStudentLoading(false)
        return
      }

      // Create profile document
      await setDoc(doc(db, 'profiles', newId), {
        email: tempEmail,
        username: username,
        name: newStudentName.trim(),
        gender: newStudentGender,
        age: ageNum,
        phone: cleanPhone,
        classId: newStudentClass,
        role: 'student',
        isFrozen: false,
        infoVerified: false,
        isProfileComplete: false,
        pendingChanges: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      alert(`تم تسجيل الطالب ${newStudentName} بنجاح.\nاسم المستخدم المؤقت: ${username}\nسيتمكن الطالب من تعيين اسم مستخدم جديد عند تسجيل الدخول لأول مرة.`)
      setNewStudentName('')
      setNewStudentGender('')
      setNewStudentAge('')
      setNewStudentPhone('')
      setNewStudentClass('')
      setShowAddStudentModal(false)
    } catch (err) {
      console.error('Error adding student:', err)
      alert('فشل إضافة الطالب: ' + (err.message || 'خطأ غير معروف'))
    } finally {
      setStudentLoading(false)
    }
  }

  const sortedHomeworks = [...homeworks].sort((a, b) => (b.is_scheduled ? 1 : 0) - (a.is_scheduled ? 1 : 0))
  const sortedStudents = [...students].sort((a, b) => (a.isFrozen ? 1 : 0) - (b.isFrozen ? 1 : 0))

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.username || user.email}</p>
          </div>
          <button onClick={onLogout} type="button" className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-glow p-6 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-purple-200">عدد الطلاب</h3>
            <p className="text-4xl font-extrabold text-white mt-2 bg-purple-950/40 px-4 py-2 rounded-xl border border-purple-500/30 inline-block self-start">
              {students.length}
            </p>
          </div>
          <div className="glass p-6 rounded-2xl border border-white/5">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">الوقت المتبقي للحصة</h3>
            {lessonTime ? <CountdownTimer targetDate={lessonTime} /> : <p className="text-gray-400 text-center py-2">لم يتم تحديد موعد</p>}
          </div>
        </div>

        {pendingReviews.length > 0 && (
          <div className="glass p-6 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
            <h3 className="text-xl font-semibold text-yellow-300 mb-3">📋 مراجعات الملفات الشخصية</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {pendingReviews.map(student => (
                <div key={student.id} className="p-3 bg-black/30 rounded-xl border border-yellow-500/20">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <p className="text-white font-medium">{student.name || student.username}</p>
                      <p className="text-xs text-gray-400">اسم المستخدم: {student.username}</p>
                      {student.classes && <p className="text-xs text-blue-300">الشعبة: {student.classes.name}</p>}
                      <div className="mt-1 text-xs text-gray-300 bg-yellow-950/30 p-2 rounded border border-yellow-500/10">
                        <p className="font-semibold text-yellow-200">التغييرات المطلوبة:</p>
                        {student.pendingChanges?.name && <p>الاسم: {student.pendingChanges.name}</p>}
                        {student.pendingChanges?.gender && <p>الجنس: {student.pendingChanges.gender}</p>}
                        {student.pendingChanges?.age && <p>العمر: {student.pendingChanges.age}</p>}
                        {student.pendingChanges?.phone && <p>رقم الهاتف: {student.pendingChanges.phone}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => acceptReview(student.id)} type="button" className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg">قبول ✅</button>
                      <button onClick={() => rejectReview(student.id)} type="button" className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg">رفض ❌</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-pink-300">إدارة الواجبات</h3>
          <div className="space-y-3">
            <textarea placeholder="نص الواجب..." className="input-glass w-full h-24 text-right resize-none" value={newHomeworkText} onChange={(e) => setNewHomeworkText(e.target.value)} />
            <div className="flex gap-6 items-center bg-white/5 p-3 rounded-xl border border-white/5 text-sm flex-wrap">
              <span className="text-gray-300 font-medium">النشر:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
                <input type="radio" name="pubtype" value="now" checked={publishType === 'now'} onChange={() => setPublishType('now')} className="accent-pink-500" /> فوري
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-gray-200">
                <input type="radio" name="pubtype" value="schedule" checked={publishType === 'schedule'} onChange={() => setPublishType('schedule')} className="accent-pink-500" /> مجدول
              </label>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              {publishType === 'schedule' && (
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-xs text-gray-400 mr-2">تاريخ ووقت النشر:</span>
                  <input type="datetime-local" className="input-glass text-right" value={newHomeworkRevealTime} onChange={(e) => setNewHomeworkRevealTime(e.target.value)} />
                </div>
              )}
              <button onClick={saveHomework} type="button" className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-3.5 px-6 mr-auto sm:mr-0 self-end">
                نشر الواجب
              </button>
            </div>
          </div>
          {homeworks.length > 0 && (
            <div className="mt-4 space-y-3 max-h-60 overflow-y-auto">
              {sortedHomeworks.map(hw => {
                const isRevealed = new Date(hw.reveal_time).getTime() <= new Date().getTime()
                return (
                  <div key={hw.id} className="p-3 bg-black/30 rounded-xl border border-white/5 flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <p className="text-gray-100 text-sm">{hw.text}</p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${isRevealed ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                          {isRevealed ? '🟢 متاح' : '📅 مجدول'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteHomework(hw.id)} type="button" className="p-1.5 bg-red-600/30 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-600/50 text-xs">حذف</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-xl font-semibold text-blue-300">إدارة الطلاب</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddStudentModal(true)} type="button" className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-2 px-4 text-sm">+ إضافة طالب</button>
              <button onClick={deleteFrozenAccounts} type="button" className="btn-primary bg-red-600 hover:bg-red-700 py-2 px-4 text-sm">🗑️ حذف المجمدين</button>
              <button onClick={() => setShowStudentsModal(true)} type="button" className="btn-primary bg-purple-600 hover:bg-purple-700 py-2 px-4 text-sm">📋 عرض قوائم الطلبة</button>
            </div>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة موعد حصة</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch">
            <input type="datetime-local" className="input-glass flex-1 text-right" value={newLessonTime} onChange={(e) => setNewLessonTime(e.target.value)} />
            <button onClick={updateLessonTime} type="button" className="btn-primary py-3 px-6">حفظ الحصة</button>
          </div>
        </div>
      </div>

      {/* Modal: Students list */}
      {showStudentsModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowStudentsModal(false)}>
          <div className="glass p-6 rounded-3xl max-w-4xl w-full max-h-[80vh] overflow-y-auto border border-white/20" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-blue-300">قائمة الطلاب المسجلين ({students.length})</h3>
              <button onClick={() => setShowStudentsModal(false)} type="button" className="text-gray-400 hover:text-white text-2xl">✕</button>
            </div>
            <div className="space-y-3">
              {sortedStudents.map(s => (
                <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.isFrozen ? 'bg-gray-900/60 border-gray-700 opacity-60' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-white text-sm font-medium">{s.name || s.username}</span>
                    <span className="text-xs text-gray-400">({s.username})</span>
                    {s.classes && <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">{s.classes.name}</span>}
                    {s.phone && <span className="text-xs text-gray-400">📱 {s.phone}</span>}
                    {s.gender && <span className="text-xs text-gray-400">{s.gender}</span>}
                    {s.age && <span className="text-xs text-gray-400">عمر {s.age}</span>}
                    {s.isFrozen && <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">⏳ مجمد</span>}
                    {checkInactivityWarning(s.last_seen) && !s.isFrozen && (
                      <span className="text-xs text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/30 animate-bounce">🚨 لم يفتح منذ 30 يوم!</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <button onClick={() => communicateWithParent(s)} type="button" className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg hover:bg-green-500/30">📞 تواصل مع ولي الأمر</button>
                    <button onClick={() => handleResetStudent(s.id)} type="button" className="text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-1 rounded-lg hover:bg-yellow-500/30">🔄 إعادة تعيين</button>
                    <button onClick={() => handleDeleteStudentPermanently(s.id)} type="button" className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30">❌ حذف</button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{s.isFrozen ? 'مجمد' : 'مفعل'}</span>
                      <div onClick={() => toggleFreezeStudent(s)} className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${s.isFrozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${s.isFrozen ? 'translate-x-0' : '-translate-x-6'}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {students.length === 0 && <p className="text-gray-400 text-center py-2">لا يوجد طلاب مسجلين.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add student */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="glass p-6 rounded-3xl max-w-md w-full border border-white/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">إضافة طالب جديد</h3>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 block">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">الجنس <span className="text-red-400">*</span></label>
                <select className="input-glass w-full text-right" value={newStudentGender} onChange={e => setNewStudentGender(e.target.value)} required>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block">العمر <span className="text-red-400">*</span></label>
                <input type="number" className="input-glass w-full text-right" value={newStudentAge} onChange={e => setNewStudentAge(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={newStudentPhone} onChange={e => setNewStudentPhone(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-gray-400 block">الشعبة <span className="text-red-400">*</span></label>
                <select className="input-glass w-full text-right" value={newStudentClass} onChange={e => setNewStudentClass(e.target.value)} required>
                  <option value="">اختر الشعبة</option>
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={studentLoading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700">
                {studentLoading ? 'جاري الإضافة...' : 'إضافة الطالب'}
              </button>
              <button type="button" onClick={() => setShowAddStudentModal(false)} className="text-sm text-gray-400 hover:text-white w-full mt-2">إلغاء</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ========== StudentPanel (converted to Firebase) ==========
const StudentPanel = ({ user, onLogout }) => {
  const [teacherData, setTeacherData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [availableHomeworks, setAvailableHomeworks] = useState([])
  const [profile, setProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})

  const fetchTeacherInfo = async () => {
    try {
      // Fetch first teacher document (there should be one)
      const q = query(collection(db, 'teachers'))
      const querySnapshot = await getDocs(q)
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0]
        const data = docSnap.data()
        setTeacherData({ id: docSnap.id, ...data })
        const now = new Date().getTime()
        const available = (data.homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now)
        setAvailableHomeworks(available)
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('فشل تحميل بيانات الصف: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProfile = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'profiles', user.id))
      if (docSnap.exists()) {
        const data = docSnap.data()
        // Fetch class name if classId exists
        if (data.classId) {
          const classSnap = await getDoc(doc(db, 'classes', data.classId))
          if (classSnap.exists()) {
            data.classes = classSnap.data()
          }
        }
        setProfile(data)
        setEditData(data || {})
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchTeacherInfo()
    fetchProfile()

    // Listen to teacher changes
    const q = query(collection(db, 'teachers'))
    const unsubscribeTeacher = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0]
        const data = docSnap.data()
        setTeacherData({ id: docSnap.id, ...data })
        const now = new Date().getTime()
        const available = (data.homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now)
        setAvailableHomeworks(available)
      }
    })

    // Listen to own profile changes
    const unsubscribeProfile = onSnapshot(doc(db, 'profiles', user.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        // Re-fetch class name
        if (data.classId) {
          getDoc(doc(db, 'classes', data.classId)).then(classSnap => {
            if (classSnap.exists()) {
              data.classes = classSnap.data()
            }
            setProfile(data)
            setEditData(data || {})
          })
        } else {
          setProfile(data)
          setEditData(data || {})
        }
      }
    })

    return () => {
      unsubscribeTeacher()
      unsubscribeProfile()
    }
  }, [user.id])

  // Update available homeworks every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (teacherData?.homeworks) {
        const now = new Date().getTime()
        const available = teacherData.homeworks.filter(hw => new Date(hw.reveal_time).getTime() <= now)
        setAvailableHomeworks(available)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [teacherData?.homeworks])

  const changePassword = async () => {
    const newPass = window.prompt('أدخل كلمة المرور الجديدة')
    if (!newPass) return
    try {
      await updatePassword(auth.currentUser, newPass)
      alert('تم تغيير كلمة المرور بنجاح')
    } catch (err) {
      alert('فشل التحديث: ' + err.message)
    }
  }

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null
    const now = new Date().getTime()
    const scheduled = teacherData.homeworks.filter(hw => new Date(hw.reveal_time).getTime() > now)
    if (scheduled.length === 0) return null
    return scheduled.reduce((a, b) => new Date(a.reveal_time).getTime() < new Date(b.reveal_time).getTime() ? a : b)
  }

  const nextScheduled = getNextScheduledHomework()

  const startEditing = () => {
    setEditing(true)
    setEditData({
      name: profile?.name || '',
      gender: profile?.gender || '',
      age: profile?.age || '',
      phone: profile?.phone || ''
    })
  }

  const saveChanges = async () => {
    if (!editData.name || !editData.phone) {
      alert('الاسم ورقم الهاتف إلزاميان')
      return
    }
    try {
      const updates = {
        name: editData.name,
        gender: editData.gender,
        age: parseInt(editData.age) || null,
        phone: editData.phone,
        infoVerified: false,
        pendingChanges: {
          updated_at: new Date().toISOString(),
          name: editData.name,
          gender: editData.gender,
          age: parseInt(editData.age) || null,
          phone: editData.phone
        },
        updatedAt: serverTimestamp()
      }
      await updateDoc(doc(db, 'profiles', user.id), updates)
      alert('سيتم مراجعة البيانات خلال 48 ساعة.')
      setEditing(false)
      fetchProfile()
    } catch (err) {
      alert('فشل حفظ التغييرات: ' + err.message)
    }
  }

  if (loading) return <div className="text-center text-gray-400 p-8">جاري التحميل...</div>

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.username || user.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={changePassword} type="button" className="btn-primary bg-blue-600 hover:bg-blue-700 text-sm">تغيير كلمة المرور</button>
            <button onClick={onLogout} type="button" className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">تسجيل الخروج</button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}

        <div className="glass p-6 rounded-2xl border border-blue-500/20">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-blue-200">معلوماتي الشخصية</h3>
            {!editing && <button onClick={startEditing} type="button" className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"><span>✏️</span> تعديل</button>}
          </div>
          {editing ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-gray-300">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-gray-300">الجنس</label>
                <select className="input-glass w-full text-right" value={editData.gender} onChange={e => setEditData({ ...editData, gender: e.target.value })}>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">العمر</label>
                <input type="number" className="input-glass w-full text-right" value={editData.age} onChange={e => setEditData({ ...editData, age: e.target.value })} />
              </div>
              <div>
                <label className="text-sm text-gray-300">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveChanges} type="button" className="btn-primary bg-green-600 hover:bg-green-700">حفظ</button>
                <button onClick={() => setEditing(false)} type="button" className="btn-primary bg-gray-600 hover:bg-gray-700">إلغاء</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-400">الاسم:</span> {profile?.name || 'غير مسجل'}</p>
              <p><span className="text-gray-400">الجنس:</span> {profile?.gender || 'غير محدد'}</p>
              <p><span className="text-gray-400">العمر:</span> {profile?.age || 'غير محدد'}</p>
              <p><span className="text-gray-400">رقم الهاتف:</span> {profile?.phone || 'غير مسجل'}</p>
              <p className="col-span-2"><span className="text-gray-400">الشعبة:</span> {profile?.classes?.name || 'غير محددة'}</p>
              <p className="col-span-2"><span className="text-gray-400">حالة التحقق:</span> {profile?.infoVerified ? '✅ تم التحقق' : '⏳ قيد المراجعة'}</p>
            </div>
          )}
        </div>

        <div className="glass-glow p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          {teacherData?.lessonTime ? <CountdownTimer targetDate={teacherData.lessonTime} /> : <p className="text-gray-400 text-center py-2">لا توجد حصة مجدولة</p>}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-3">
          <h3 className="text-xl font-semibold text-pink-300">الواجبات المدرسية</h3>
          {availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-white/5">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    نشر في: {new Date(hw.reveal_time).toLocaleString('ar-EG', { timeZone: 'Asia/Amman' })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400">لا توجد واجبات متاحة حالياً.</p>
              {nextScheduled && (
                <div className="mt-2">
                  <HomeworkTextCountdown targetDate={nextScheduled.reveal_time} />
                  <p className="text-xs text-gray-500 mt-1">(الواجب القادم سيظهر تلقائياً)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ========== App (converted to Firebase) ==========
const App = () => {
  const [user, setUser] = useState(null)
  const [frozenUser, setFrozenUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showSignUp, setShowSignUp] = useState(false)
  const [pendingUserForComplete, setPendingUserForComplete] = useState(null)

  useDynamicBackground()

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
    setFrozenUser(null)
    setPendingUserForComplete(null)
    setShowSignUp(false)
  }

  const handleLogin = (userData) => {
    setUser(userData)
    setFrozenUser(null)
    setPendingUserForComplete(null)
    setShowSignUp(false)
  }

  const handleFrozen = (frozenData) => {
    setFrozenUser(frozenData)
    setUser(null)
    setPendingUserForComplete(null)
  }

  const handleCompleteProfile = (userData) => {
    setPendingUserForComplete(userData)
    setShowSignUp(false)
  }

  const handleCompleteProfileSuccess = (updatedUser) => {
    setUser(updatedUser)
    setPendingUserForComplete(null)
  }

  const handleSignUpSuccess = () => {
    setShowSignUp(false)
    // Auth state will trigger login
  }

  const checkSessionAndProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null)
      setFrozenUser(null)
      setPendingUserForComplete(null)
      setLoading(false)
      return
    }

    try {
      const docSnap = await getDoc(doc(db, 'profiles', firebaseUser.uid))
      if (!docSnap.exists()) {
        setPendingUserForComplete({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: firebaseUser.displayName || ''
        })
        setUser(null)
        setFrozenUser(null)
        setLoading(false)
        return
      }

      const profile = docSnap.data()

      if (profile.isFrozen) {
        setFrozenUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          class_name: 'غير محدد'
        })
        setUser(null)
        setPendingUserForComplete(null)
        setLoading(false)
        return
      }

      if (!profile.isProfileComplete) {
        setPendingUserForComplete({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || '',
          ...profile
        })
        setUser(null)
        setFrozenUser(null)
        setLoading(false)
        return
      }

      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email,
        role: profile.role,
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        classId: profile.classId,
        needsPasswordChange: profile.infoVerified === false,
        isProfileComplete: true
      })
      setFrozenUser(null)
      setPendingUserForComplete(null)
      setLoading(false)
    } catch (err) {
      console.error(err)
      setUser(null)
      setFrozenUser(null)
      setPendingUserForComplete(null)
      setLoading(false)
    }
  }

  useEffect(() => {
    // Check initial auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await checkSessionAndProfile(firebaseUser)
    })

    return () => unsubscribe()
  }, [])

  if (loading) return <div className="container-center min-h-screen text-white"><div className="glass p-8 rounded-2xl border border-white/10 shadow-xl animate-pulse">جاري التحميل...</div></div>

  if (pendingUserForComplete) {
    return (
      <CompleteProfile
        user={pendingUserForComplete}
        onSuccess={handleCompleteProfileSuccess}
        onCancel={handleLogout}
      />
    )
  }

  if (frozenUser) {
    return <FrozenAccount user={frozenUser} onLogout={handleLogout} />
  }

  if (showSignUp) {
    return <SignUp onSuccess={handleSignUpSuccess} onCancel={() => setShowSignUp(false)} />
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        onFrozen={handleFrozen}
        onSignUp={() => setShowSignUp(true)}
        onCompleteProfile={handleCompleteProfile}
      />
    )
  }

  return user.role === 'teacher' ? <TeacherPanel user={user} onLogout={handleLogout} /> : <StudentPanel user={user} onLogout={handleLogout} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)