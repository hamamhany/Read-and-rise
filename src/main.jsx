import './index.css'
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

// ========== 2. مكون العداد التنازلي (مطور) ==========
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calculateTime = () => {
      const distance = new Date(targetDate).getTime() - new Date().getTime()
      if (distance < 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return true // انتهى الوقت
      }
      setTimeLeft({
        days: Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((distance % (1000 * 60)) / 1000)
      })
      return false
    };

    calculateTime();
    const interval = setInterval(() => {
      const isEnded = calculateTime();
      if (isEnded) clearInterval(interval);
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  // ترجمة المفاتيح للعربية للعرض المريح
  const labels = { days: 'أيام', hours: 'ساعات', minutes: 'دقائق', seconds: 'ثواني' };

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

// ========== 3. مكون تسجيل الدخول (تصميم زجاجي بالكامل) ==========
const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [role, setRole] = useState('student')

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { role } }
        })
        if (error) throw error
        const user = data.user
        if (!user) throw new Error('فشل إنشاء الحساب')

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{ id: user.id, email, role }])
        if (profileError) console.warn('profile insert error:', profileError)

        if (role === 'teacher') {
          const { error: teacherError } = await supabase
            .from('teachers')
            .insert([{ id: user.id, students: [] }])
          if (teacherError) console.warn('teacher insert error:', teacherError)
        }

        onLogin({ id: user.id, email: user.email, role })
        return
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        const user = data.user
        if (!user) throw new Error('فشل تسجيل الدخول')

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
        setError('⚠️ تجاوزت حد إرسال الرسائل. تأكد من إلغاء تفعيل "Confirm email" في إعدادات Supabase.')
      } else if (err.message.includes('User already registered')) {
        setError('هذا البريد مسجل مسبقاً، يرجى تسجيل الدخول.')
      } else if (err.message.includes('Invalid login credentials')) {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center relative min-h-screen overflow-hidden bg-gradient-programming">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-8 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl">
          <div className="flex justify-center mb-4">
            <img 
              src="/images/logo.png" 
              alt="شعار التطبيق" 
              className="w-20 h-20 rounded-2xl shadow-lg border-2 border-white/30 object-cover"
              onError={(e) => e.target.style.display = 'none'}
            />
          </div>
          
          <h2 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
            {isSignUp ? 'إنشاء حساب جديد' : 'مرحباً بك'}
          </h2>
          
          <form onSubmit={handleAuth} className="space-y-5">
            <input 
              type="email" 
              placeholder="البريد الإلكتروني" 
              className="input-glass w-full text-right" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
            />
            <input 
              type="password" 
              placeholder="كلمة المرور" 
              className="input-glass w-full text-right" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
            
            {isSignUp && (
              <div className="flex gap-6 items-center justify-center text-sm py-2 bg-white/5 rounded-xl border border-white/5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-gray-200">
                  <input type="radio" value="student" className="accent-purple-500" checked={role === 'student'} onChange={() => setRole('student')} /> طالب
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none text-gray-200">
                  <input type="radio" value="teacher" className="accent-purple-500" checked={role === 'teacher'} onChange={() => setRole('teacher')} /> معلم
                </label>
              </div>
            )}
            
            {error && <p className="text-red-400 text-sm text-center whitespace-pre-wrap">{error}</p>}
            
            <button 
              type="submit" 
              className="btn-primary w-full py-3 text-lg font-semibold tracking-wide"
              disabled={loading}
            >
              {loading ? 'جاري التحميل...' : isSignUp ? 'تسجيل الحساب' : 'تسجيل الدخول'}
            </button>
          </form>
          
          <p className="text-center text-sm text-gray-300 mt-6">
            {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب بعد؟'}
            <button 
              onClick={() => setIsSignUp(!isSignUp)} 
              className="text-purple-400 hover:underline mr-2 font-semibold"
            >
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
        if (data.students && data.students.length > 0) {
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
      alert('✅ تم تحديث موعد الحصة بنجاح!')
    } catch (err) {
      alert('❌ فشل التحديث: ' + err.message)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div className="container-center min-h-screen bg-gradient-programming p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-8 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">👨‍🏫 لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}
        
        <div className="glass-glow p-6 rounded-2xl border border-purple-500/20">
          <h3 className="text-xl font-semibold mb-4 text-purple-200">⏳ الوقت المتبقي لبدء الحصة</h3>
          {lessonTime ? <CountdownTimer targetDate={lessonTime} /> : <p className="text-gray-400 text-center">لم تقم بتحديد موعد حصة بعد</p>}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">📅 جدولة موعد حصة جديد</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <input 
              type="datetime-local" 
              className="input-glass flex-1 text-right" 
              value={newLessonTime} 
              onChange={(e) => setNewLessonTime(e.target.value)} 
            />
            <button onClick={updateLessonTime} className="btn-primary py-3 px-6 h-full">
              حفظ وتحديث التوقيت
            </button>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-xl font-semibold mb-4 text-purple-200">📋 قائمة الطلاب المسجلين بالصف ({students.length})</h3>
          {loading ? (
            <p className="text-gray-400 text-center py-4">جاري تحميل الطلاب...</p>
          ) : students.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {students.map(s => (
                <div key={s.id} className="bg-white/5 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                  <span className="text-gray-200 font-medium truncate ml-2">{s.email}</span>
                  <span className="text-xs bg-green-500/20 text-green-300 px-3 py-1 rounded-full border border-green-500/30 whitespace-nowrap">● نشط بالصف</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">لا يوجد طلاب منضمين إلى صفك حالياً.</p>
          )}
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
      setErrorMsg('فشل تحميل بيانات الحصة: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTeacherInfo() }, [])

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div className="container-center min-h-screen bg-gradient-programming p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-8 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">🧑‍🎓 لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}
        
        <div className="glass-glow p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">⏳ الوقت المتبقي لحصتك القادمة</h3>
          {loading ? (
            <p className="text-gray-400 text-center py-2">جاري التحقق من الموعد...</p>
          ) : teacherData?.lesson_time ? (
            <CountdownTimer targetDate={teacherData.lesson_time} />
          ) : (
            <p className="text-gray-400 text-center py-2">المعلم لم يقم بجدولة حصة قادمة حتى الآن 🕒</p>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-xl font-semibold mb-3 text-blue-200">📊 معلومات وتفاصيل الصف</h3>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5 inline-block">
            <p className="text-gray-300">
              إجمالي عدد زملائك الطلاب المتواجدين في الصف: <strong className="text-blue-300 text-lg mr-1">{teacherData?.students?.length || 0}</strong>
            </p>
          </div>
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
    // 1. التحقق من الجلسة الحالية عند الإقلاع
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
            setLoading(false)
          })
          .catch(() => {
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: session.user.user_metadata?.role || 'student'
            })
            setLoading(false)
          })
      } else {
        setLoading(false)
      }
    })

    // 2. الاستماع لتغيرات حالة المصادقة (دخول/خروج)
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

  if (loading) {
    return (
      <div className="container-center min-h-screen bg-gradient-programming text-white">
        <div className="glass p-8 rounded-2xl border border-white/10 shadow-xl animate-pulse">
          جاري تحميل واجهة الفرسان...
        </div>
      </div>
    )
  }

  if (!user) return <Login onLogin={setUser} />
  return user.role === 'teacher' ? <TeacherPanel user={user} /> : <StudentPanel user={user} />
}

// ========== 7. تشغيل التطبيق ==========
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)