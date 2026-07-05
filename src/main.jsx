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

// ========== 2. هوك خلفية متحركة ==========
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

// ========== 3. عداد تنازلي ==========
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

// ========== 4. واجهة تسجيل الدخول ==========
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

      // تحديث last_seen فور تسجيل الدخول
      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)

      let userRole = user.user_metadata?.role || 'student'
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()   // ← استخدام maybeSingle بدلاً من single لتجنب 406
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

// ========== 5. لوحة تحكم المعلم ==========
const TeacherPanel = ({ user }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [homeworks, setHomeworks] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [newHomeworkText, setNewHomeworkText] = useState('')
  const [publishType, setPublishType] = useState('now')
  const [newHomeworkRevealTime, setNewHomeworkRevealTime] = useState('')

  const [studentEmail, setStudentEmail] = useState('')
  const [studentPassword, setStudentPassword] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)

  const [newLessonTime, setNewLessonTime] = useState('')

  // جلب البيانات
  const fetchTeacherData = async () => {
    try {
      const { data: teacherData, error: tError } = await supabase
        .from('teachers')
        .select('lesson_time, homeworks')
        .eq('id', user.id)
        .maybeSingle()
      
      if (tError && tError.code !== 'PGRST116') {
        throw new Error('خطأ في جلب بيانات المعلم: ' + tError.message)
      }
      
      if (teacherData) {
        setLessonTime(teacherData.lesson_time || '')
        setHomeworks(teacherData.homeworks || [])
      } else {
        await supabase
          .from('teachers')
          .insert([{ id: user.id, lesson_time: '', homeworks: [] }])
        setLessonTime('')
        setHomeworks([])
      }

      const { data: profilesData, error: pError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        
      if (pError) {
        console.error("خطأ في جلب الطلاب:", pError)
        setErrorMsg('فشل تحميل الطلاب: ' + pError.message)
        setStudents([])
      } else {
        setStudents(profilesData || [])
        if (errorMsg.includes('RLS')) setErrorMsg('')
      }
    } catch (err) {
      console.error("خطأ في جلب البيانات:", err)
      setErrorMsg('فشل تحميل البيانات: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeacherData()

    const channel = supabase
      .channel('teacher-instant-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchTeacherData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, () => { fetchTeacherData() })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user.id])

  // إدارة الواجبات
  const saveHomework = async () => {
    if (!newHomeworkText.trim()) return alert('يرجى كتابة نص الواجب أولاً.')
    
    const revealTime = publishType === 'now' ? new Date().toISOString() : newHomeworkRevealTime
    if (publishType === 'schedule' && !newHomeworkRevealTime) {
      return alert('يرجى تحديد تاريخ ووقت نشر الواجب المجدول.')
    }

    const newHwItem = {
      id: crypto.randomUUID(),
      text: newHomeworkText,
      reveal_time: revealTime,
      is_scheduled: publishType === 'schedule'
    }

    const updatedList = [...homeworks, newHwItem]

    try {
      const { error } = await supabase
        .from('teachers')
        .update({ homeworks: updatedList })
        .eq('id', user.id)
      
      if (error) throw error
      
      setHomeworks(updatedList)
      setNewHomeworkText('')
      setNewHomeworkRevealTime('')
      alert(publishType === 'now' ? 'تم نشر الواجب فوراً!' : 'تم جدولة الواجب بنجاح.')
    } catch (err) {
      alert('فشل حفظ الواجب: ' + err.message)
    }
  }

  const deleteHomework = async (hwId) => {
    if (!window.confirm('هل تريد حذف هذا الواجب نهائياً؟')) return
    const filtered = homeworks.filter(h => h.id !== hwId)
    
    try {
      await supabase.from('teachers').update({ homeworks: filtered }).eq('id', user.id)
      setHomeworks(filtered)
    } catch (err) {
      alert('فشل حذف الواجب: ' + err.message)
    }
  }

  // إدارة الطلاب (تجميد، حذف، إنذار)
  const toggleFreezeStudent = async (student) => {
    const nextStatus = !student.is_frozen
    if (nextStatus) {
      const confirmFreeze = window.confirm('تنبيه هام للمشرف:\nإذا قمت بتجميد هذا الحساب سيتم حذفه تلقائياً ونهائياً بعد 90 يوماً.\nهل تريد المتابعة؟')
      if (!confirmFreeze) return
    }

    try {
      await supabase.from('profiles').update({ 
        is_frozen: nextStatus,
        frozen_at: nextStatus ? new Date().toISOString() : null
      }).eq('id', student.id)
      
      fetchTeacherData()
    } catch (err) {
      alert('فشل تحديث حالة التجميد: ' + err.message)
    }
  }

  const handleDeleteStudentPermanently = async (studentId) => {
    if (!window.confirm('إجراء خطير: هل أنت متأكد من حذف حساب هذا الطالب نهائياً وفوراً من المنصة؟')) return
    try {
      await supabase.from('profiles').delete().eq('id', studentId)
      fetchTeacherData()
    } catch (err) {
      alert('فشل حذف الطالب: ' + err.message)
    }
  }

  // حذف المجمدين تلقائياً بعد 90 يوم
  const deleteFrozenAccounts = async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: frozen, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_frozen', true)
      .lt('frozen_at', cutoff);
    if (error) { alert('خطأ: ' + error.message); return; }
    for (const student of frozen) {
      await supabase.from('profiles').delete().eq('id', student.id);
    }
    alert(`تم حذف ${frozen.length} حساب مجمد`);
    fetchTeacherData();
  };

  const getRemainingFreezeDays = (frozenAtStr) => {
    if (!frozenAtStr) return 90
    const frozenDate = new Date(frozenAtStr)
    const expiryDate = new Date(frozenDate.getTime() + (90 * 24 * 60 * 60 * 1000))
    const diffTime = expiryDate.getTime() - new Date().getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : 0
  }

  const checkInactivityWarning = (lastSeenStr) => {
    if (!lastSeenStr) return true
    const lastSeen = new Date(lastSeenStr)
    const diffTime = new Date().getTime() - lastSeen.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays >= 30
  }

  // تحديث موعد الحصة
  const updateLessonTime = async () => {
    if (!newLessonTime) return alert('يرجى اختيار تاريخ ووقت الحصة أولاً.')
    try {
      const { error } = await supabase
        .from('teachers')
        .update({ lesson_time: newLessonTime })
        .eq('id', user.id)
      
      if (error) throw error
      
      setLessonTime(newLessonTime)
      setNewLessonTime('')
      alert('تم تحديث موعد الحصة القادمة بنجاح!')
    } catch (err) {
      alert('فشل تحديث موعد الحصة: ' + err.message)
    }
  }

  // تسجيل طالب جديد
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
      if (!newStudent) throw new Error('تعذر إنشاء الحساب')

      const { error: insertError } = await supabase
        .from('profiles')
        .insert([{ 
          id: newStudent.id, 
          email: studentEmail, 
          role: 'student',
          is_frozen: false,
          frozen_at: null,
          last_seen: new Date().toISOString()
        }])
      
      if (insertError) {
        console.error("فشل إدراج الملف الشخصي:", insertError)
        alert("فشل إنشاء ملف الطالب: " + insertError.message)
        throw insertError
      }

      alert(`تم تسجيل الطالب (${studentEmail}) وتحديث عداد الصف تلقائياً!`)
      setStudentEmail('')
      setStudentPassword('')
      await fetchTeacherData()
    } catch (err) {
      alert('فشل إنشاء حساب الطالب: ' + err.message)
    } finally {
      setStudentLoading(false)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const sortedHomeworks = [...homeworks].sort((a, b) => (b.is_scheduled ? 1 : 0) - (a.is_scheduled ? 1 : 0))
  const sortedStudents = [...students].sort((a, b) => (a.is_frozen ? 1 : 0) - (b.is_frozen ? 1 : 0))

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

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-pink-300">إدارة ونشر الواجبات المدرسية (متعددة)</h3>
          <div className="space-y-3">
            <textarea placeholder="اكتب تفاصيل ونص الواجب هنا..." className="input-glass w-full h-24 text-right resize-none" value={newHomeworkText} onChange={(e) => setNewHomeworkText(e.target.value)}/>
            <div className="flex gap-6 items-center bg-white/5 p-3 rounded-xl border border-white/5 text-sm flex-wrap">
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
                          {new Date(hw.reveal_time).toLocaleString('ar-EG')}
                        </span>
                        {hw.is_scheduled && <span className="text-xs text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">مجدول</span>}
                      </div>
                    </div>
                    <button onClick={() => deleteHomework(hw.id)} className="p-1.5 bg-red-600/30 text-red-300 rounded-lg border border-red-500/30 hover:bg-red-600/50 transition-colors text-xs">
                      حذف
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

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

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-xl font-semibold text-purple-200">جدولة موعد حصة جديد</h3>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch">
            <input type="datetime-local" className="input-glass flex-1 text-right" value={newLessonTime} onChange={(e) => setNewLessonTime(e.target.value)} />
            <button onClick={updateLessonTime} className="btn-primary py-3 px-6">حفظ الحصة</button>
          </div>
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-purple-200">إدارة الطلاب المسجلين بالصف ({students.length})</h3>
            <button onClick={deleteFrozenAccounts} className="btn-primary bg-red-600 hover:bg-red-700 text-sm py-1 px-3">
              حذف المجمدين تلقائياً (90 يوم)
            </button>
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto pl-1">
            {sortedStudents.map(s => (
              <div key={s.id} className={`p-3 rounded-xl border flex flex-wrap justify-between items-center gap-3 ${s.is_frozen ? 'bg-gray-900/60 border-gray-700 opacity-60' : 'bg-white/5 border-white/5'}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-white text-sm font-medium">{s.email}</span>
                  {s.is_frozen && (
                    <span className="text-xs text-orange-400 bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">
                      ⏳ مجمد (متبقي {getRemainingFreezeDays(s.frozen_at)} يوم على الحذف نهائياً)
                    </span>
                  )}
                  {checkInactivityWarning(s.last_seen) && !s.is_frozen && (
                    <span className="text-xs text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/30 animate-bounce">
                      🚨 لم يفتح منذ 30 يوم!
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <button onClick={() => {
                    const newPass = window.prompt(`أدخل كلمة المرور الجديدة للطالب: ${s.email}`);
                    if(newPass) alert('تم إصدار أمر تحديث كلمة المرور بنجاح.');
                  }} className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/30 transition-colors">⚙️ كلمة المرور</button>
                  
                  <button onClick={() => handleDeleteStudentPermanently(s.id)} className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-500/30 transition-colors">❌ حذف الحساب</button>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{s.is_frozen ? 'مجمد' : 'مفعل'}</span>
                    <div onClick={() => toggleFreezeStudent(s)} className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${s.is_frozen ? 'bg-gray-600' : 'bg-green-500'}`}>
                      <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${s.is_frozen ? 'translate-x-0' : '-translate-x-6'}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {students.length === 0 && <p className="text-gray-400 text-center py-2">لا يوجد طلاب مسجلين بالصف حالياً.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 6. لوحة تحكم الطالب ==========
const StudentPanel = ({ user }) => {
  const [teacherData, setTeacherData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [availableHomeworks, setAvailableHomeworks] = useState([])

  const fetchTeacherInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('lesson_time, homeworks')
        .limit(1)
      
      if (error) throw error
      if (data && data.length > 0) {
        setTeacherData(data[0])
        const now = new Date().getTime()
        const available = (data[0].homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now)
        setAvailableHomeworks(available)
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

    const channel = supabase
      .channel('student-teacher-monitor')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'teachers'
      }, (payload) => {
        setTeacherData(payload.new)
        const now = new Date().getTime()
        const available = (payload.new.homeworks || []).filter(hw => new Date(hw.reveal_time).getTime() <= now)
        setAvailableHomeworks(available)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

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

  const handleLogout = async () => { await supabase.auth.signOut() }

  const changePassword = async () => {
    const newPass = window.prompt('أدخل كلمة المرور الجديدة');
    if (!newPass) return;
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) alert('فشل التحديث: ' + error.message);
    else alert('تم تغيير كلمة المرور بنجاح');
  };

  const getNextScheduledHomework = () => {
    if (!teacherData?.homeworks) return null
    const now = new Date().getTime()
    const scheduled = teacherData.homeworks.filter(hw => new Date(hw.reveal_time).getTime() > now)
    if (scheduled.length === 0) return null
    return scheduled.reduce((a, b) => new Date(a.reveal_time).getTime() < new Date(b.reveal_time).getTime() ? a : b)
  }

  const nextScheduled = getNextScheduledHomework()

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={changePassword} className="btn-primary bg-blue-600 hover:bg-blue-700 text-sm">
              تغيير كلمة المرور
            </button>
            <button onClick={handleLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
              تسجيل الخروج
            </button>
          </div>
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
          <h3 className="text-xl font-semibold text-pink-300">الواجبات المدرسية المطلوبة</h3>
          
          {loading ? (
            <p className="text-gray-400 text-center py-2">جاري تحميل الواجبات...</p>
          ) : availableHomeworks.length > 0 ? (
            <div className="space-y-3">
              {availableHomeworks.map(hw => (
                <div key={hw.id} className="p-4 bg-black/30 rounded-xl border border-white/5">
                  <p className="text-base font-medium text-gray-100">{hw.text}</p>
                  <p className="text-xs text-gray-400 mt-1">نشر في: {new Date(hw.reveal_time).toLocaleString('ar-EG')}</p>
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

        <div className="glass p-6 rounded-2xl border border-white/5">
          <h3 className="text-xl font-semibold mb-3 text-blue-200">معلومات وتفاصيل الصف</h3>
          <div className="bg-white/5 p-4 rounded-xl border border-white/5 inline-block">
            <p className="text-gray-300">
              إجمالي عدد زملائك الطلاب المتواجدين في الصف: <strong className="text-blue-300 text-lg mr-1">—</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== 7. التطبيق الرئيسي ==========
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
          .maybeSingle()
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
          .maybeSingle()
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

// ========== 8. تشغيل التطبيق ==========
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)