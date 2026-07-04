import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'

// ========== 1. اتصال Supabase ==========
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('⚠️ متغيرات Supabase غير محددة في ملف .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ========== 2. مكون العداد التنازلي ==========
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      const distance = new Date(targetDate).getTime() - new Date().getTime()
      if (distance < 0) { clearInterval(interval); return }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  return (
    <div className="flex gap-4 text-center flex-wrap justify-center">
      {Object.entries(timeLeft).map(([unit, value]) => (
        <div key={unit} className="glass p-4 min-w-[70px]">
          <div className="text-3xl font-bold text-purple-300">{value}</div>
          <div className="text-xs uppercase tracking-wider text-gray-400">{unit}</div>
        </div>
      ))}
    </div>
  )
}

// ========== 3. مكون تسجيل الدخول ==========
const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [role, setRole] = useState('student')
  const [bgImage, setBgImage] = useState('')

  useEffect(() => {
    const randomNum = Math.floor(Math.random() * 12) + 1
    setBgImage(`/images/background-${randomNum}.jpg`)
  }, [])

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isSignUp) {
        // 1. التسجيل
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { role } }
        })
        if (error) throw error
        const user = data.user
        if (!user) throw new Error('فشل إنشاء الحساب')

        // 2. إنشاء الملف الشخصي
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: user.id, email, role }])
        if (profileError) console.warn('profile insert error:', profileError)

        // 3. إنشاء صف المعلم إن كان معلم
        if (role === 'teacher') {
          const { error: teacherError } = await supabase
            .from('teachers')
            .insert([{ id: user.id, students: [] }])
          if (teacherError) console.warn('teacher insert error:', teacherError)
        }

        // 4. تسجيل الدخول التلقائي
        onLogin({ id: user.id, email: user.email, role })
        return
      } else {
        // تسجيل الدخول
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        const user = data.user
        if (!user) throw new Error('فشل تسجيل الدخول')

        // جلب الدور من profiles
        let userRole = user.user_metadata?.role || 'student'
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        if (profileData) userRole = profileData.role

        onLogin({ id: user.id, email: user.email, role: userRole })
        return
      }
    } catch (err) {
      console.error(err)
      if (err.message.includes('rate limit')) {
        setError('⚠️ تجاوزت حد إرسال رسائل التأكيد. تأكد من إلغاء تفعيل "Confirm email" في إعدادات Supabase.')
      } else if (err.message.includes('User already registered')) {
        setError('هذا البريد مسجل مسبقاً، يرجى تسجيل الدخول.')
      } else if (err.message.includes('Invalid login credentials')) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.')
      } else if (err.message.includes('permission denied')) {
        setError('⚠️ مشكلة في صلاحيات الوصول. تأكد من تنفيذ SQL المطلوب في قاعدة البيانات.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000" 
           style={{ backgroundImage: `url(${bgImage})`, filter: 'blur(6px) scale(1.1)' }} />
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md">
        <div className="glass p-8 rounded-2xl shadow-2xl border border-white/10">
          <img 
            src="/images/logo.png" 
            alt="شعار التطبيق" 
            className="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-lg border-2 border-white/20 object-cover"
            onError={(e) => e.target.style.display = 'none'}
          />
          <h2 className="text-3xl font-bold text-center mb-2 bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
            {isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول'}
          </h2>
          <form onSubmit={handleAuth} className="space-y-5">
            <input type="email" placeholder="البريد الإلكتروني" className="input-glass" 
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input type="password" placeholder="كلمة المرور" className="input-glass" 
                   value={password} onChange={(e) => setPassword(e.target.value)} required />
            {isSignUp && (
              <div className="flex gap-4 items-center justify-center">
                <label className="flex items-center gap-2"><input type="radio" value="student" checked={role === 'student'} onChange={() => setRole('student')} /> طالب</label>
                <label className="flex items-center gap-2"><input type="radio" value="teacher" checked={role === 'teacher'} onChange={() => setRole('teacher')} /> معلم</label>
              </div>
            )}
            {error && <p className="text-red-400 text-sm text-center whitespace-pre-wrap">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'جاري...' : isSignUp ? 'تسجيل' : 'دخول'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-300 mt-6">
            {isSignUp ? 'لديك حساب؟' : 'ليس لديك حساب؟'}
            <button onClick={() => setIsSignUp(!isSignUp)} className="text-purple-400 hover:underline mr-2">
              {isSignUp ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ========== 4. لوحة المعلم ==========
const TeacherPanel = ({ user }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [newLessonTime, setNewLessonTime] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchTeacherData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('lesson_time, students')
        .eq('id', user.id)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          // الصف غير موجود، نقوم بإنشائه
          const { error: insertError } = await supabase
            .from('teachers')
            .insert([{ id: user.id, students: [] }])
          if (insertError) throw insertError
          setLessonTime('')
          setStudents([])
        } else {
          throw error
        }
      } else {
        setLessonTime(data.lesson_time || '')
        if (data.students?.length) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', data.students)
          setStudents(profilesData || [])
        } else {
          setStudents([])
        }
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('فشل تحميل البيانات: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTeacherData() }, [])

  const updateLessonTime = async () => {
    if (!newLessonTime) return
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ lesson_time: newLessonTime })
        .eq('id', user.id)
      if (error) throw error
      setLessonTime(newLessonTime)
      setNewLessonTime('')
      alert('✅ تم تحديث موعد الحصة!')
    } catch (err) {
      alert('❌ فشل التحديث: ' + err.message)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut() }
  const handleDeleteAccount = async () => {
    if (!confirm('⚠️ هل أنت متأكد؟ هذا الإجراء سيحذف حسابك وجميع بياناتك نهائياً.')) return
    try {
      const { error } = await supabase.rpc('delete_my_user')
      if (error) throw error
      await supabase.auth.signOut()
      alert('✅ تم حذف حسابك بنجاح.')
    } catch (err) {
      alert('❌ فشل حذف الحساب: ' + err.message)
    }
  }

  return (
    <div className="container-center min-h-screen">
      <div className="glass p-8 max-w-4xl w-full space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-3xl font-bold text-purple-300">👨‍🏫 لوحة المعلم</h2>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="btn-primary bg-gray-600 hover:bg-gray-700 text-sm">تسجيل الخروج</button>
            <button onClick={handleDeleteAccount} className="btn-primary bg-red-600 hover:bg-red-700 text-sm">حذف الحساب</button>
          </div>
        </div>
        <p className="text-gray-300">مرحباً أستاذ {user.email}</p>
        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
        <div className="glass-glow p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">⏳ الوقت المتبقي للحصة</h3>
          {lessonTime ? <CountdownTimer targetDate={lessonTime} /> : <p className="text-gray-400">لم تحدد موعداً بعد</p>}
        </div>
        <div className="glass p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">📅 تحديد موعد جديد</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <input type="datetime-local" className="input-glass flex-1" value={newLessonTime} onChange={(e) => setNewLessonTime(e.target.value)} />
            <button onClick={updateLessonTime} className="btn-primary">تحديث التوقيت</button>
          </div>
        </div>
        <div className="glass p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">📋 قائمة الطلاب المسجلين ({students.length})</h3>
          {loading ? <p>جاري التحميل...</p> : students.length > 0 ? 
            students.map(s => <div key={s.id} className="bg-white/5 p-3 rounded-lg mb-2 flex justify-between"><span>{s.email}</span><span className="text-green-400">● نشط</span></div>) : 
            <p className="text-gray-400">لا يوجد طلاب مسجلين حتى الآن</p>}
        </div>
      </div>
    </div>
  )
}

// ========== 5. لوحة الطالب ==========
const StudentPanel = ({ user }) => {
  const [teacherData, setTeacherData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const fetchTeacherInfo = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('lesson_time, students')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      setTeacherData(data)
    } catch (err) {
      console.error(err)
      setErrorMsg('فشل تحميل بيانات المعلم: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTeacherInfo() }, [])

  const handleLogout = async () => { await supabase.auth.signOut() }
  const handleDeleteAccount = async () => {
    if (!confirm('⚠️ هل أنت متأكد؟ هذا الإجراء سيحذف حسابك وجميع بياناتك نهائياً.')) return
    try {
      const { error } = await supabase.rpc('delete_my_user')
      if (error) throw error
      await supabase.auth.signOut()
      alert('✅ تم حذف حسابك بنجاح.')
    } catch (err) {
      alert('❌ فشل حذف الحساب: ' + err.message)
    }
  }

  return (
    <div className="container-center min-h-screen">
      <div className="glass p-8 max-w-4xl w-full space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-3xl font-bold text-blue-300">🧑‍🎓 لوحة الطالب</h2>
          <div className="flex gap-2">
            <button onClick={handleLogout} className="btn-primary bg-gray-600 hover:bg-gray-700 text-sm">تسجيل الخروج</button>
            <button onClick={handleDeleteAccount} className="btn-primary bg-red-600 hover:bg-red-700 text-sm">حذف الحساب</button>
          </div>
        </div>
        <p className="text-gray-300">مرحباً {user.email}</p>
        {errorMsg && <p className="text-red-400 text-sm">{errorMsg}</p>}
        <div className="glass-glow p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">⏳ الوقت المتبقي لحصتك القادمة</h3>
          {loading ? <p>جاري التحميل...</p> : teacherData?.lesson_time ? 
            <CountdownTimer targetDate={teacherData.lesson_time} /> : 
            <p className="text-gray-400">المعلم لم يحدد موعداً بعد 🕒</p>}
        </div>
        <div className="glass p-6 rounded-xl">
          <h3 className="text-xl font-semibold mb-3">👨‍🏫 معلومات الصف</h3>
          <p>عدد الطلاب في الصف: <strong>{teacherData?.students?.length || 0}</strong></p>
        </div>
      </div>
    </div>
  )
}

// ========== 6. التطبيق الرئيسي ==========
const App = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            const role = data?.role || session.user.user_metadata?.role || 'student'
            setUser({ id: session.user.id, email: session.user.email, role })
          })
          .catch(() => {
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: session.user.user_metadata?.role || 'student'
            })
          })
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => {
            const role = data?.role || session.user.user_metadata?.role || 'student'
            setUser({ id: session.user.id, email: session.user.email, role })
          })
          .catch(() => {
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: session.user.user_metadata?.role || 'student'
            })
          })
      } else {
        setUser(null)
      }
    })

    return () => listener?.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="container-center min-h-screen"><div className="glass p-8">جاري التحميل...</div></div>
  if (!user) return <Login onLogin={setUser} />
  return user.role === 'teacher' ? <TeacherPanel user={user} /> : <StudentPanel user={user} />
}

// ========== 7. تشغيل التطبيق ==========
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)