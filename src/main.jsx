import './index.css'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'

// ========== 1. اتصال Supabase ==========
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('متغيرات Supabase غير مححدد في ملف .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ========== 2. هوك مخصص لتغيير ألوان الخلفية تلقائياً وحركة الشعار الخلفي ==========
const useDynamicBackground = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes logoPulseSoft {
        0% { transform: scale(1); opacity: 0.12; }
        50% { transform: scale(1.04); opacity: 0.18; }
        100% { transform: scale(1); opacity: 0.12; }
      }
      .animate-logo-bg {
        animation: logoPulseSoft 6s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);

    const bgGradients = [
      'linear-gradient(135deg, #0f172a, #1e1b4b, #311042)', 
      'linear-gradient(135deg, #090d16, #111827, #1f2937)', 
      'linear-gradient(135deg, #020617, #0f172a, #1e293b)', 
      'linear-gradient(135deg, #070a13, #161224, #281432)'  
    ];
    let currentIndex = 0;

    document.body.style.background = bgGradients[currentIndex];
    document.body.style.transition = 'background 4s ease-in-out';

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % bgGradients.length;
      document.body.style.background = bgGradients[currentIndex];
    }, 7000);

    return () => {
      clearInterval(interval);
      document.body.style.background = '';
      document.body.style.transition = '';
      document.head.removeChild(style);
    };
  }, []);
};

// ========== 3. مكون العداد التنازلي للحصة (مربعات زجاجية) ==========
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const calculateTime = () => {
      const distance = new Date(targetDate).getTime() - new Date().getTime()
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
    };

    calculateTime();
    const interval = setInterval(() => {
      const isEnded = calculateTime();
      if (isEnded) clearInterval(interval);
    }, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

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

// ========== 4. مكون العداد النصي الصافي البسيط للواجب ==========
const HomeworkTextCountdown = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    const calculate = () => {
      const distance = new Date(targetDate).getTime() - new Date().getTime()
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
    <div className="text-sm font-semibold text-pink-300 mt-2 tracking-wide bg-pink-950/30 px-4 py-2 rounded-xl inline-block border border-pink-500/20">
      متبقي على إظهار الواجب : {timeLeft.days} يوم :{timeLeft.hours} ساعة :{timeLeft.minutes} دقائق :{timeLeft.seconds} ثواني
    </div>
  )
}

// ========== 5. واجهة تسجيل الدخول (تسجيل دخول فقط - تم إلغاء SignUp العام) ==========
const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAuth = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
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
    } catch (err) {
      console.error(err)
      if (err.message.includes('Invalid login credentials')) {
        setError('اسم المستخدم أو كلمة المرور غير صحيحة.')
      } else {
        setError(err.message)
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
                <input 
                  type="email" 
                  className="input-glass w-full text-right pr-24 pl-4 text-base bg-black/20" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                />
              </div>

              <div className="relative flex items-center">
                <span className="absolute right-4 text-gray-400 pointer-events-none text-sm font-medium">كلمة المرور</span>
                <input 
                  type={showPassword ? "text" : "password"} 
                  className="input-glass w-full text-right pr-24 pl-12 text-base bg-black/20" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-4 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors focus:outline-none bg-white/5 px-2 py-1 rounded border border-white/10"
                >
                  {showPassword ? "إخفاء" : "إظهار"}
                </button>
              </div>
              
              {error && <p className="text-red-400 text-sm text-center whitespace-pre-wrap">{error}</p>}
              
              <button 
                type="submit" 
                className="btn-primary w-full py-2.5 text-lg font-semibold tracking-wide shadow-lg"
                disabled={loading}
              >
                {loading ? 'جاري التحميل...' : 'تسجيل الدخول'}
              </button>
            </form>

            <div className="pt-2 border-t border-white/10 text-center text-xs text-gray-400 w-full">
              <p>جميع الحقوق محفوظة © 2026 لصالح المبرمج همام هاني محمد علي</p>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 6. لوحة التحكم للمعلم مع ميزة إضافة حسابات الطلاب بنفسه ==========
const TeacherPanel = ({ user }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [homeworkText, setHomeworkText] = useState('')
  const [homeworkRevealTime, setHomeworkRevealTime] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  
  // مدخلات الأقسام
  const [newLessonTime, setNewLessonTime] = useState('')
  const [newHomeworkText, setNewHomeworkText] = useState('')
  const [newHomeworkRevealTime, setNewHomeworkRevealTime] = useState('')
  
  // مدخلات الطالب الجديد
  const [studentEmail, setStudentEmail] = useState('')
  const [studentPassword, setStudentPassword] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)
  
  const [errorMsg, setErrorMsg] = useState('')

  const fetchTeacherData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('lesson_time, students, homework_text, homework_reveal_time')
        .eq('id', user.id)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          await supabase
            .from('teachers')
            .insert([{ id: user.id, students: [], homework_text: '', homework_reveal_time: '' }])
          setLessonTime('')
          setHomeworkText('')
          setHomeworkRevealTime('')
          setStudents([])
        } else {
          throw error
        }
      } else {
        setLessonTime(data.lesson_time || '')
        setHomeworkText(data.homework_text || '')
        setHomeworkRevealTime(data.homework_reveal_time || '')
        
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
      alert('تم تحديث موعد الحصة بنجاح')
    } catch (err) {
      alert('فشل التحديث: ' + err.message)
    }
  }

  const saveHomework = async () => {
    if (!newHomeworkText || !newHomeworkRevealTime) {
      alert('يرجى كتابة نص الواجب وتحديد موعد إظهاره أولاً.')
      return
    }
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ 
          homework_text: newHomeworkText, 
          homework_reveal_time: newHomeworkRevealTime 
        })
        .eq('id', user.id)
      if (error) throw error
      setHomeworkText(newHomeworkText)
      setHomeworkRevealTime(newHomeworkRevealTime)
      setNewHomeworkText('')
      setNewHomeworkRevealTime('')
      alert('تم حفظ الواجب وجدولة موعد الإظهار بنجاح')
    } catch (err) {
      alert('فشل الحفظ: ' + err.message)
    }
  }

  // دالة مخصصة لإنشاء حساب الطالب الجديد وإضافته للصف فوراً
  const handleCreateStudent = async (e) => {
    e.preventDefault()
    if (!studentEmail || !studentPassword) return
    setStudentLoading(true)
    try {
      // إنشاء الحساب في السوبابيز
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: studentEmail,
        password: studentPassword,
        options: { data: { role: 'student' } }
      })
      if (signUpError) throw signUpError
      const newStudent = signUpData.user
      if (!newStudent) throw new Error('تعذر إتمام العملية')

      // إضافة بروفايل الطالب
      await supabase.from('profiles').insert([{ id: newStudent.id, email: studentEmail, role: 'student' }])

      // تحديث مصفوفة الطلاب الحالية للمعلم
      const currentStudentIds = students.map(s => s.id)
      const updatedIds = [...currentStudentIds, newStudent.id]

      const { error: updateClassError } = await supabase
        .from('teachers')
        .update({ students: updatedIds })
        .eq('id', user.id)
      
      if (updateClassError) throw updateClassError

      alert(`تم إنشاء حساب الطالب (${studentEmail}) بنجاح وضمه للمنصة!`)
      setStudentEmail('')
      setStudentPassword('')
      fetchTeacherData() // تحديث القائمة والعداد
    } catch (err) {
      alert('فشل إنشاء حساب الطالب: ' + err.message)
    } finally {
      setStudentLoading(false)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}
        
        <div className="glass-glow p-6 rounded-2xl border border-purple-500/20">
          <h3 className="text-xl font-semibold mb-4 text-purple-200">الوقت المتبقي لبدء الحصة</h3>
          {lessonTime ? <CountdownTimer targetDate={lessonTime} /> : <p className="text-gray-400 text-center">لم تقم بتحديد موعد حصة بعد</p>}
        </div>

        {/* قسم إنشاء حسابات الطلاب الجديد بدلاً من التسجيل المفتوح */}
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-blue-300">لوحة تسجيل الطلاب الجدد</h3>
          <form onSubmit={handleCreateStudent} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full space-y-1">
              <span className="text-xs text-gray-400 mr-1">بريد الطالب الإلكتروني:</span>
              <input type="email" className="input-glass w-full text-right" placeholder="student@example.com" value={studentEmail} onChange={e => setStudentEmail(e.target.value)} required />
            </div>
            <div className="flex-1 w-full space-y-1">
              <span className="text-xs text-gray-400 mr-1">تعيين كلمة المرور:</span>
              <input type="text" className="input-glass w-full text-right" placeholder="كلمة مرور قوية" value={studentPassword} onChange={e => setStudentPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={studentLoading} className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-3.5 px-6 w-full md:w-auto whitespace-nowrap">
              {studentLoading ? 'جاري التسجيل...' : 'تسجيل وإضافة الطالب'}
            </button>
          </form>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة موعد حصة جديد</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch">
            <input type="datetime-local" className="input-glass flex-1 text-right" value={newLessonTime} onChange={(e) => setNewLessonTime(e.target.value)} />
            <button onClick={updateLessonTime} className="btn-primary py-3 px-6">حفظ الحصة</button>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-pink-300">قسم إدارة الواجبات المجدولة</h3>
          <div className="space-y-3">
            <textarea placeholder="اكتب تفاصيل ونص الواجب المدرسي هنا..." className="input-glass w-full h-24 text-right resize-none" value={newHomeworkText} onChange={(e) => setNewHomeworkText(e.target.value)}/>
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <div className="flex-1 flex flex-col gap-1">
                <span className="text-xs text-gray-400 mr-2">تاريخ ووقت إظهار الواجب تلقائياً للطلاب:</span>
                <input type="datetime-local" className="input-glass text-right" value={newHomeworkRevealTime} onChange={(e) => setNewHomeworkRevealTime(e.target.value)} />
              </div>
              <button onClick={saveHomework} className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-3.5 px-6 self-end sm:self-auto">نشر وجدولة الواجب</button>
            </div>
          </div>
          {homeworkText && (
            <div className="mt-2 p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-gray-300">
              <strong>الواجب النشط الحالي:</strong> {homeworkText} <br/>
              <strong>موعد الإظهار المتفق عليه:</strong> {new Date(homeworkRevealTime).toLocaleString('ar-EG')}
            </div>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-xl font-semibold mb-4 text-purple-200">قائمة الطلاب المسجلين بالصف ({students.length})</h3>
          {loading ? (
            <p className="text-gray-400 text-center py-4">جاري تحميل الطلاب...</p>
          ) : students.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-40 overflow-y-auto pr-1">
              {students.map(s => (
                <div key={s.id} className="bg-white/5 p-3 rounded-xl border border-white/5 flex justify-between items-center">
                  <span className="text-gray-200 font-medium truncate ml-2">{s.email}</span>
                  <span className="text-xs bg-green-500/20 text-green-300 px-3 py-1 rounded-full border border-green-500/30 whitespace-nowrap">نشط بالصف</span>
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

// ========== 7. لوحة الطالب (تستعلم مباشرة من أول معلم متاح في النظام) ==========
const StudentPanel = ({ user }) => {
  const [teacherData, setTeacherData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [isHomeworkLocked, setIsHomeworkLocked] = useState(true)

  const fetchTeacherInfo = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('lesson_time, students, homework_text, homework_reveal_time')
        .limit(1)
      
      if (error) throw error
      if (data && data.length > 0) {
        setTeacherData(data[0])
        if (data[0].homework_reveal_time) {
          const isPast = new Date(data[0].homework_reveal_time).getTime() - new Date().getTime() <= 0
          setIsHomeworkLocked(!isPast)
        }
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('فشل تحميل بيانات الصف: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeacherInfo()
    const checkInterval = setInterval(() => {
      if (teacherData?.homework_reveal_time) {
        const isPast = new Date(teacherData.homework_reveal_time).getTime() - new Date().getTime() <= 0
        setIsHomeworkLocked(!isPast)
      }
    }, 1000)
    return () => clearInterval(checkInterval)
  }, [teacherData?.homework_reveal_time])

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.email}</p>
          </div>
          <button onClick={handleLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
            تسجيل الخروج
          </button>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}
        
        <div className="glass-glow p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          {loading ? (
            <p className="text-gray-400 text-center py-2">جاري التحقق من الموعد...</p>
          ) : teacherData?.lesson_time ? (
            <CountdownTimer targetDate={teacherData.lesson_time} />
          ) : (
            <p className="text-gray-400 text-center py-2">المعلم لم يقم بجدولة حصة قادمة حتى الآن</p>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
          <h3 className="text-xl font-semibold text-pink-300">الواجب المدرسي المطلوب</h3>
          
          {loading ? (
            <p className="text-gray-400 text-center py-2">جاري تحميل تفاصيل الواجب...</p>
          ) : teacherData?.homework_text ? (
            <div className="flex flex-col items-center justify-center w-full text-center">
              
              <div className="relative w-full p-4 bg-black/30 rounded-xl border border-white/5 min-h-[60px] flex items-center justify-center">
                {isHomeworkLocked && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center text-xl font-bold text-pink-400 bg-black/10 select-none tracking-wider animate-pulse">
                    🔒 مغلق
                  </div>
                )}
                <p className={`text-base font-medium text-gray-100 transition-all duration-700 w-full select-none ${isHomeworkLocked ? 'blur-md pointer-events-none opacity-40' : ''}`}>
                  {teacherData.homework_text}
                </p>
              </div>

              {isHomeworkLocked && teacherData.homework_reveal_time && (
                <HomeworkTextCountdown targetDate={teacherData.homework_reveal_time} />
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-2">لا يوجد واجبات منزلية مسجلة حالياً.</p>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-xl font-semibold mb-3 text-blue-200">معلومات وتفاصيل الصف</h3>
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

// ========== 8. التطبيق الرئيسي ==========
const App = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useDynamicBackground();

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
      <div className="container-center min-h-screen text-white">
        <div className="glass p-8 rounded-2xl border border-white/10 shadow-xl animate-pulse">
          جاري تحميل واجهة الفرسان...
        </div>
      </div>
    )
  }

  if (!user) return <Login onLogin={setUser} />
  return user.role === 'teacher' ? <TeacherPanel user={user} /> : <StudentPanel user={user} />
}

// ========== 9. تشغيل التطبيق ==========
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)