import './index.css'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'

// ========== 1. اتصال Supabase ==========
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('متغيرات Supabase غير محددة في ملف .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ========== 2. هوك مخصص لتغيير ألوان الخلفية وحركة الشعار الخلفي ==========
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

// ========== 3. مكون العداد التنازلي للحصة ==========
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

// ========== 4. مكون العداد النصي للواجب المجدول ==========
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
    <div className="text-sm font-semibold text-pink-300 mt-2 tracking-wide bg-pink-950/30 px-4 py-2 rounded-xl inline-block border border-pink-500/20 animate-pulse">
      متبقي على إظهار الواجب : {timeLeft.days} يوم :{timeLeft.hours} ساعة :{timeLeft.minutes} دقائق :{timeLeft.seconds} ثواني
    </div>
  )
}

// ========== 5. واجهة تسجيل الدخول (مغلقة وآمنة للمعلم وطلابه) ==========
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
                <input type="email" className="input-glass w-full text-right pr-24 pl-4 text-base bg-black/20" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

            <div className="pt-2 border-t border-white/10 text-center text-xs text-gray-400 w-full">
              <p>جميع الحقوق محفوظة © 2026 لصالح المبرمج همام هاني محمد علي</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 6. لوحة تحكم المعلم (مع الميزات الجديدة والعدادات المصلحة) ==========
const TeacherPanel = ({ user }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [homeworkText, setHomeworkText] = useState('')
  const [homeworkRevealTime, setHomeworkRevealTime] = useState('')
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  
  // مدخلات الإدارة
  const [newLessonTime, setNewLessonTime] = useState('')
  const [newHomeworkText, setNewHomeworkText] = useState('')
  const [publishType, setPublishType] = useState('now') // 'now' أو 'schedule'
  const [newHomeworkRevealTime, setNewHomeworkRevealTime] = useState('')
  
  // وضع تعديل تاريخ الواجب الحالي فقط (التقويم المباشر)
  const [isEditingTime, setIsEditingTime] = useState(false)
  const [editRevealTime, setEditRevealTime] = useState('')

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
            .insert([{ id: user.id, students: [], homework_text: '', homework_reveal_time: null }])
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
        
        // إصلاح وجلب تفاصيل الطلاب المسجلين بالصف بالكامل وبدقة
        if (data.students && data.students.length > 0) {
          const { data: profilesData, error: profError } = await supabase
            .from('profiles')
            .select('id, email')
            .in('id', data.students)
          if (profError) throw profError
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
    if (!newHomeworkText) {
      alert('يرجى كتابة نص الواجب أولاً.')
      return
    }

    // إذا اخترنا نشر الآن، يكون الموعد عبارة عن تاريخ قديم أو فارغ ليظهر فوراً، والأنسب هو توقيت اللحظة الحالية
    const finalRevealTime = publishType === 'now' ? new Date().toISOString() : newHomeworkRevealTime

    if (publishType === 'schedule' && !newHomeworkRevealTime) {
      alert('يرجى تحديد موعد إظهار الواجب المجدول.')
      return
    }

    try {
      const { error } = await supabase
        .from('teachers')
        .update({ 
          homework_text: newHomeworkText, 
          homework_reveal_time: finalRevealTime 
        })
        .eq('id', user.id)
      if (error) throw error
      
      setHomeworkText(newHomeworkText)
      setHomeworkRevealTime(finalRevealTime)
      setNewHomeworkText('')
      setNewHomeworkRevealTime('')
      alert(publishType === 'now' ? 'تم نشر الواجب للطلاب فوراً!' : 'تم جدولة الواجب بنجاح')
    } catch (err) {
      alert('فشل حفظ الواجب: ' + err.message)
    }
  }

  // ميزة تعديل موعد النشر بالتقويم مباشرة للواجب الحالي دون مسحه
  const handleUpdateRevealTimeOnly = async () => {
    if (!editRevealTime) return
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ homework_reveal_time: editRevealTime })
        .eq('id', user.id)
      if (error) throw error
      setHomeworkRevealTime(editRevealTime)
      setIsEditingTime(false)
      alert('تم تحديث تاريخ ووقت نشر الواجب بنجاح')
    } catch (err) {
      alert('فشل تعديل التوقيت: ' + err.message)
    }
  }

  // ميزة حذف الواجب النشط الحالي تماماً
  const handleDeleteHomework = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف الواجب الحالي تماماً من عند الطلاب؟')) return
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ homework_text: '', homework_reveal_time: null })
        .eq('id', user.id)
      if (error) throw error
      setHomeworkText('')
      setHomeworkRevealTime(null)
      alert('تم حذف وتصفير الواجب بنجاح.')
    } catch (err) {
      alert('فشل حذف الواجب: ' + err.message)
    }
  }

  const handleCreateStudent = async (e) => {
    e.preventDefault()
    if (!studentEmail || !studentPassword) return
    setStudentLoading(true)
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: studentEmail,
        password: studentPassword,
        options: { data: { role: 'student' } }
      })
      if (signUpError) throw signUpError
      const newStudent = signUpData.user
      if (!newStudent) throw new Error('تعذر إتمام العملية')

      await supabase.from('profiles').insert([{ id: newStudent.id, email: studentEmail, role: 'student' }])

      // تحديث مصفوفة الطلاب بدقة
      const currentStudentIds = students.map(s => s.id)
      const updatedIds = [...currentStudentIds, newStudent.id]

      const { error: updateClassError } = await supabase
        .from('teachers')
        .update({ students: updatedIds })
        .eq('id', user.id)
      
      if (updateClassError) throw updateClassError

      alert(`تم تسجيل الطالب (${studentEmail}) وتحديث عداد الصف تلقائياً!`)
      setStudentEmail('')
      setStudentPassword('')
      fetchTeacherData() // تحديث فوري للعداد وللقائمة
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
        
        {/* إجمالي الطلاب والعداد الحقيقي */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-glow p-6 rounded-2xl border border-purple-500/20 flex flex-col justify-center">
            <h3 className="text-lg font-semibold text-purple-200">العداد الفعلي للطلاب بالمنصة</h3>
            <p className="text-4xl font-extrabold text-white mt-2 bg-purple-950/40 px-4 py-2 rounded-xl border border-purple-500/30 inline-block self-start">
              {students.length} <span className="text-sm font-normal text-gray-400">طلاب منضمين</span>
            </p>
          </div>

          <div className="glass p-6 rounded-2xl border border-white/5">
            <h3 className="text-lg font-semibold text-purple-200 mb-2">الوقت المتبقي لبدء الحصة</h3>
            {lessonTime ? <CountdownTimer targetDate={lessonTime} /> : <p className="text-gray-400 text-center py-2">لم يتم تحديد موعد حصة بعد</p>}
          </div>
        </div>

        {/* قسم إدارة وإعداد الواجبات الاحترافي الجديد */}
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-pink-300">إدارة ونشر الواجبات المدرسية</h3>
          <div className="space-y-3">
            <textarea placeholder="اكتب تفاصيل ونص الواجب هنا..." className="input-glass w-full h-24 text-right resize-none" value={newHomeworkText} onChange={(e) => setNewHomeworkText(e.target.value)}/>
            
            {/* خيار النشر الآن أو الجدولة بالوقت */}
            <div className="flex gap-6 items-center bg-white/5 p-3 rounded-xl border border-white/5 text-sm">
              <span className="text-gray-300 font-medium">آلية النشر المعتمدة:</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-200">
                <input type="radio" name="pubtype" value="now" checked={publishType === 'now'} onChange={() => setPublishType('now')} className="accent-pink-500" /> نشر الآن للجميع
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none text-gray-200">
                <input type="radio" name="pubtype" value="schedule" checked={publishType === 'schedule'} onChange={() => setPublishType('schedule')} className="accent-pink-500" /> جدولة لوقت لاحق
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              {publishType === 'schedule' && (
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-xs text-gray-400 mr-2">تاريخ ووقت إظهار الواجب تلقائياً:</span>
                  <input type="datetime-local" className="input-glass text-right" value={newHomeworkRevealTime} onChange={(e) => setNewHomeworkRevealTime(e.target.value)} />
                </div>
              )}
              <button onClick={saveHomework} className="btn-primary bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 py-3.5 px-6 mr-auto sm:mr-0 self-end">
                تأكيد ونشر الواجب
              </button>
            </div>
          </div>

          {/* عرض الواجب النشط مع خيارات التعديل بالتقويم والحذف فوراً */}
          {homeworkText && (
            <div className="mt-4 p-4 bg-pink-950/20 rounded-2xl border border-pink-500/20 space-y-3">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <strong className="text-pink-300 text-sm">الواجب المعتمد حالياً بالمنصة:</strong>
                  <p className="text-gray-100 text-base mt-1">{homeworkText}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    حالة النشر: {new Date(homeworkRevealTime).getTime() <= new Date().getTime() ? '🟢 متاح الآن للطلاب' : `📅 مجدول للظهور في: ${new Date(homeworkRevealTime).toLocaleString('ar-EG')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {/* زر التقويم لتغيير موعد النشر مباشرة */}
                  <button onClick={() => { setIsEditingTime(!isEditingTime); setEditRevealTime(homeworkRevealTime || '') }} className="p-2 bg-blue-600/30 text-blue-300 rounded-xl border border-blue-500/40 text-xs hover:bg-blue-600/50 transition-colors" title="تعديل موعد النشر (التقويم)">
                    📅 تعديل الموعد
                  </button>
                  {/* زر حذف الواجب تماماً */}
                  <button onClick={handleDeleteHomework} className="p-2 bg-red-600/30 text-red-300 rounded-xl border border-red-500/40 text-xs hover:bg-red-600/50 transition-colors">
                    🗑️ حذف الواجب
                  </button>
                </div>
              </div>

              {/* واجهة منبثقة بسيطة لتحديث التقويم مباشرة */}
              {isEditingTime && (
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1 w-full">
                    <span className="text-xs text-gray-400 block mb-1">اختر الموعد الجديد من التقويم:</span>
                    <input type="datetime-local" className="input-glass text-sm text-right" value={editRevealTime} onChange={e => setEditRevealTime(e.target.value)} />
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={handleUpdateRevealTimeOnly} className="btn-primary py-2 px-4 text-xs bg-green-600 hover:bg-green-700 whitespace-nowrap">حفظ التوقيت</button>
                    <button onClick={() => setIsEditingTime(false)} className="btn-primary py-2 px-4 text-xs bg-gray-600 hover:bg-gray-700 whitespace-nowrap">إلغاء</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* لوحة تسجيل وإضافة الطلاب الجدد بالصف الواحد */}
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-blue-300">لوحة تسجيل الطلاب الجدد</h3>
          <form onSubmit={handleCreateStudent} className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 w-full space-y-1">
              <span className="text-xs text-gray-400 mr-1">بريد الطالب الإلكتروني:</span>
              <input type="email" className="input-glass w-full text-right" placeholder="student@example.com" value={studentEmail} onChange={e => setStudentEmail(e.target.value)} required />
            </div>
            <div className="flex-1 w-full space-y-1">
              <span className="text-xs text-gray-400 mr-1">تعيين كلمة المرور:</span>
              <input type="text" className="input-glass w-full text-right" placeholder="كلمة مرور الدخول" value={studentPassword} onChange={e => setStudentPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={studentLoading} className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-3.5 px-6 w-full md:w-auto whitespace-nowrap">
              {studentLoading ? 'جاري التسجيل...' : 'تسجيل وإضافة الطالب'}
            </button>
          </form>
        </div>

        {/* قسم جدولة موعد حصة جديد */}
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة موعد حصة جديد</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch">
            <input type="datetime-local" className="input-glass flex-1 text-right" value={newLessonTime} onChange={(e) => setNewLessonTime(e.target.value)} />
            <button onClick={updateLessonTime} className="btn-primary py-3 px-6">حفظ الحصة</button>
          </div>
        </div>

        {/* قائمة الطلاب المنضمين الفعليين */}
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
            <p className="text-gray-400 text-center py-4">لا يوجد طلاب مسجلين بالصف حالياً.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ========== 7. لوحة تحكم الطالب (تعرض وتخفي البيانات فورياً ومتزامنة) ==========
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
        } else {
          setIsHomeworkLocked(true)
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
                    🔒 مغلق ومجدول
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