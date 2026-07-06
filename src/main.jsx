import './index.css'
import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('متغيرات Supabase غير محددة في ملف .env')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ========== هوك خلفية متحركة ==========
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

// ========== عداد تنازلي ==========
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

// ========== شاشة الحساب المجمد ==========
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
            className="text-sm text-gray-400 hover:text-white transition-colors mt-4"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== تسجيل الدخول لأول مرة ==========
const FirstTimeSignUp = ({ onSuccess, onCancel }) => {
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [gender, setGender] = useState('')
  const [age, setAge] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleVerify = async (e) => {
    e.preventDefault()
    if (!username || !phone || !gender || !age) {
      setError('جميع الحقول مطلوبة (*)')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data: profile, error: searchError } = await supabase
        .from('profiles')
        .select('id, name, gender, age, phone, username, class_id')
        .eq('username', username)
        .eq('phone', phone)
        .eq('gender', gender)
        .eq('age', parseInt(age))
        .maybeSingle()

      if (searchError) throw searchError
      if (!profile) {
        setError('البيانات غير صحيحة. تأكد من اسم المستخدم ورقم الهاتف والجنس والعمر.')
        setLoading(false)
        return
      }

      const fakeEmail = `${username}@school.temp`
      const tempPassword = Math.random().toString(36).slice(-8)

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: fakeEmail,
        password: tempPassword,
        options: { data: { role: 'student', username: username } }
      })

      if (signUpError) {
        if (signUpError.message.includes('User already registered')) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: fakeEmail,
            password: tempPassword
          })
          if (signInError) throw new Error('تعذر إنشاء الحساب. يرجى التواصل مع المدير.')
        } else {
          throw signUpError
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          is_frozen: false,
          info_verified: true,
          name: profile.name,
          gender: profile.gender,
          age: profile.age,
          phone: profile.phone,
          class_id: profile.class_id
        })
        .eq('id', profile.id)

      if (updateError) throw updateError

      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) throw new Error('فشل في استرجاع المستخدم')

      onSuccess({
        id: currentUser.id,
        email: currentUser.email,
        username: username,
        role: 'student',
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        class_id: profile.class_id,
        needsPasswordChange: true
      })

    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-6 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-2xl font-bold text-center text-purple-300">تسجيل الدخول لأول مرة</h2>
          <p className="text-gray-400 text-sm text-center">أدخل البيانات التي قمت بتسجيلها عن طريق الإستبيان</p>
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1">اسم المستخدم <span className="text-red-400">*</span></label>
              <input type="text" className="input-glass w-full text-right" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">رقم الهاتف <span className="text-red-400">*</span></label>
              <input type="text" className="input-glass w-full text-right" value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">الجنس <span className="text-red-400">*</span></label>
              <select className="input-glass w-full text-right" value={gender} onChange={e => setGender(e.target.value)} required>
                <option value="">اختر</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">العمر <span className="text-red-400">*</span></label>
              <input type="number" className="input-glass w-full text-right" value={age} onChange={e => setAge(e.target.value)} required />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'جاري التحقق...' : 'تحقق من البيانات'}
            </button>
          </form>
          <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white w-full text-center mt-2">رجوع</button>
        </div>
      </div>
    </div>
  )
}

// ========== تغيير كلمة المرور الإجبارية ==========
const ForcePasswordChange = ({ user, onPasswordSet }) => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
      return
    }
    if (password !== confirm) {
      setError('كلمة المرور غير متطابقة')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      onPasswordSet(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="glass p-6 rounded-3xl shadow-2xl border border-white/20 bg-white/10 backdrop-blur-xl space-y-4">
          <h2 className="text-2xl font-bold text-center text-blue-300">تعيين كلمة مرور جديدة</h2>
          <p className="text-gray-400 text-sm text-center">لتفعيل حسابك، يجب تعيين كلمة مرور جديدة</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-1">كلمة المرور الجديدة <span className="text-red-400">*</span></label>
              <input type="password" className="input-glass w-full text-right" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <div>
              <label className="text-sm text-gray-300 block mb-1">تأكيد كلمة المرور <span className="text-red-400">*</span></label>
              <input type="password" className="input-glass w-full text-right" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 bg-blue-600 hover:bg-blue-700">
              {loading ? 'جاري التحديث...' : 'تعيين كلمة المرور'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ========== واجهة تسجيل الدخول الرئيسية ==========
const Login = ({ onLogin, onFrozen, onFirstTime }) => {
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
      const { data: email, error: fetchError } = await supabase
        .rpc('get_email_by_username', { username_input: username })

      if (fetchError) {
        console.error('خطأ في RPC:', fetchError)
        throw new Error('خطأ في البحث عن المستخدم: ' + fetchError.message)
      }
      if (!email) throw new Error('اسم المستخدم غير موجود')

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      })

      if (authError) throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة')

      const user = authData.user
      if (!user) throw new Error('فشل تسجيل الدخول')

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_frozen, username, name, gender, age, phone, class_id, info_verified')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) throw new Error('خطأ في التحقق من الملف الشخصي')
      if (!profile) throw new Error('لا يوجد ملف شخصي لهذا الحساب، يرجى التواصل مع المدير')
      
      if (profile.is_frozen) {
        onFrozen({ 
          id: user.id, 
          email: user.email, 
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          class_name: 'غير محدد'
        })
        return
      }

      if (profile.info_verified === false && profile.is_frozen === false) {
        onLogin({ 
          id: user.id, 
          email: user.email, 
          role: profile.role, 
          username: profile.username,
          name: profile.name,
          gender: profile.gender,
          age: profile.age,
          phone: profile.phone,
          class_id: profile.class_id,
          needsPasswordChange: true
        })
        return
      }

      await supabase
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', user.id)

      onLogin({ 
        id: user.id, 
        email: user.email, 
        role: profile.role, 
        username: profile.username,
        name: profile.name,
        gender: profile.gender,
        age: profile.age,
        phone: profile.phone,
        class_id: profile.class_id,
        needsPasswordChange: false
      })
    } catch (err) {
      console.error(err)
      setError(err.message)
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
              onClick={onFirstTime}
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline-offset-2"
            >
              تسجيل الدخول لأول مرة (ليس لديك كلمة مرور؟)
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

// ========== لوحة تحكم المعلم ==========
const TeacherPanel = ({ user, onLogout }) => {
  const [lessonTime, setLessonTime] = useState('')
  const [homeworks, setHomeworks] = useState([])
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [newHomeworkText, setNewHomeworkText] = useState('')
  const [publishType, setPublishType] = useState('now')
  const [newHomeworkRevealTime, setNewHomeworkRevealTime] = useState('')

  // حقول إضافة الطالب الجديد
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentGender, setNewStudentGender] = useState('')
  const [newStudentAge, setNewStudentAge] = useState('')
  const [newStudentPhone, setNewStudentPhone] = useState('')
  const [newStudentClass, setNewStudentClass] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)

  const [newLessonTime, setNewLessonTime] = useState('')
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)

  // جلب البيانات
  const fetchTeacherData = async () => {
    try {
      // 1. التأكد من وجود سجل المعلم في جدول teachers
      let teacherRecord;
      const { data: existingTeacher, error: teacherFetchError } = await supabase
        .from('teachers')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (teacherFetchError && teacherFetchError.code !== 'PGRST116') {
        throw new Error('خطأ في جلب بيانات المعلم: ' + teacherFetchError.message);
      }

      if (!existingTeacher) {
        // إنشاء سجل معلم جديد
        const { data: newTeacher, error: insertTeacherError } = await supabase
          .from('teachers')
          .insert([{ id: user.id, lesson_time: '', homeworks: [] }])
          .select()
          .single();

        if (insertTeacherError) {
          console.error('فشل إنشاء سجل المعلم:', insertTeacherError);
          setLessonTime('');
          setHomeworks([]);
          teacherRecord = null;
        } else {
          teacherRecord = newTeacher;
          setLessonTime(newTeacher.lesson_time || '');
          setHomeworks(newTeacher.homeworks || []);
        }
      } else {
        teacherRecord = existingTeacher;
        setLessonTime(existingTeacher.lesson_time || '');
        setHomeworks(existingTeacher.homeworks || []);
      }

      // 2. جلب الطلاب
      const { data: profilesData, error: pError } = await supabase
        .from('profiles')
        .select('*, classes(name)')
        .eq('role', 'student');

      if (pError) {
        console.error("خطأ في جلب الطلاب:", pError);
        setErrorMsg('فشل تحميل الطلاب: ' + pError.message);
        setStudents([]);
      } else {
        setStudents(profilesData || []);
      }

      // 3. جلب الشعب الخاصة بهذا المعلم
      const { data: classesData, error: cError } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user.id);

      if (cError) {
        console.error("خطأ في جلب الشعب:", cError);
        setClasses([]);
      } else {
        // إذا لم توجد شعب، ننشئها فقط إذا كان لدينا سجل معلم (teacherRecord)
        if ((!classesData || classesData.length === 0) && teacherRecord) {
          const defaultClasses = [
            { name: 'أساسيات البرمجة', teacher_id: user.id },
            { name: 'بايثون (Python)', teacher_id: user.id }
          ];
          const { data: newClasses, error: insertError } = await supabase
            .from('classes')
            .insert(defaultClasses)
            .select();

          if (insertError) {
            console.error("فشل إنشاء الشعب الافتراضية:", insertError);
            // نترك المصفوفة فارغة
            setClasses([]);
          } else {
            setClasses(newClasses || []);
          }
        } else {
          setClasses(classesData || []);
        }
      }
    } catch (err) {
      console.error("خطأ في جلب البيانات:", err);
      setErrorMsg('فشل تحميل البيانات: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTeacherData()

    const channel = supabase
      .channel('teacher-instant-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchTeacherData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teachers' }, () => { fetchTeacherData() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, () => { fetchTeacherData() })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user.id])

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
      const { error } = await supabase.from('profiles').delete().eq('id', studentId)
      if (error) throw error
      alert('تم حذف الطالب من النظام، ولن يتمكن من تسجيل الدخول.')
      fetchTeacherData()
    } catch (err) {
      alert('فشل حذف الطالب: ' + err.message)
    }
  }

  const deleteFrozenAccounts = async () => {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: frozen, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_frozen', true)
      .lt('frozen_at', cutoff);
    if (error) { alert('خطأ: ' + error.message); return; }
    if (frozen.length === 0) { alert('لا يوجد حسابات مجمدة تجاوزت 90 يوماً.'); return; }
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

  // إضافة طالب جديد (بدون حساب auth)
  const handleAddStudent = async (e) => {
    e.preventDefault()
    if (!newStudentName || !newStudentGender || !newStudentAge || !newStudentPhone || !newStudentClass) {
      alert('جميع الحقول مطلوبة (الاسم، الجنس، العمر، رقم الهاتف، الشعبة)')
      return
    }
    setStudentLoading(true)
    try {
      const baseUsername = newStudentName.trim().replace(/\s+/g, '.').toLowerCase()
      let username = baseUsername
      let counter = 1
      let exists = true
      while (exists) {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username)
          .maybeSingle()
        if (error) throw error
        if (!data) {
          exists = false
        } else {
          username = `${baseUsername}${counter}`
          counter++
        }
      }

      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert([{
          username: username,
          name: newStudentName,
          gender: newStudentGender,
          age: parseInt(newStudentAge),
          phone: newStudentPhone,
          class_id: newStudentClass,
          role: 'student',
          is_frozen: true,
          info_verified: false,
          frozen_at: new Date().toISOString()
        }])
        .select()
      
      if (insertError) throw insertError

      alert(`تم تسجيل الطالب ${newStudentName} بنجاح.\nاسم المستخدم الخاص به هو: ${username}\nيرجى إبلاغ الطالب بهذا الاسم ليستخدمه في تسجيل الدخول لأول مرة.`)

      setNewStudentName('')
      setNewStudentGender('')
      setNewStudentAge('')
      setNewStudentPhone('')
      setNewStudentClass('')
      setShowAddStudentModal(false)
      await fetchTeacherData()
    } catch (err) {
      alert('فشل إضافة الطالب: ' + err.message)
    } finally {
      setStudentLoading(false)
    }
  }

  const updateWhatsapp = async (studentId, currentWhatsapp) => {
    const newWhatsapp = window.prompt('أدخل رقم واتساب الجديد للطالب:', currentWhatsapp || '');
    if (newWhatsapp === null) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ phone: newWhatsapp })
        .eq('id', studentId)
      if (error) throw error
      alert('تم تحديث رقم الهاتف بنجاح.')
      fetchTeacherData()
    } catch (err) {
      alert('فشل التحديث: ' + err.message)
    }
  }

  const sortedHomeworks = [...homeworks].sort((a, b) => (b.is_scheduled ? 1 : 0) - (a.is_scheduled ? 1 : 0))
  const sortedStudents = [...students].sort((a, b) => (a.is_frozen ? 1 : 0) - (b.is_frozen ? 1 : 0))

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-purple-300">لوحة تحكم المعلم</h2>
            <p className="text-gray-400 text-sm mt-1">مرحباً بك: {user.username || user.email}</p>
          </div>
          <button onClick={onLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
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

        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-blue-300">إدارة الطلاب</h3>
            <button 
              onClick={() => setShowAddStudentModal(true)}
              className="btn-primary bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 py-2 px-4 text-sm"
            >
              + إضافة طالب جديد
            </button>
          </div>
          <p className="text-sm text-gray-400 mt-2">يجب أن يكون الطالب قد ملأ الاستبيان المطلوب قبل إضافته</p>
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
                  <span className="text-white text-sm font-medium">{s.name || s.username}</span>
                  <span className="text-xs text-gray-400">({s.username})</span>
                  {s.classes && <span className="text-xs text-blue-300 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">{s.classes.name}</span>}
                  {s.phone && <span className="text-xs text-gray-400">📱 {s.phone}</span>}
                  {s.gender && <span className="text-xs text-gray-400">{s.gender}</span>}
                  {s.age && <span className="text-xs text-gray-400">عمر {s.age}</span>}
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
                  <button onClick={() => updateWhatsapp(s.id, s.phone)} className="text-xs bg-green-500/20 text-green-300 border border-green-500/30 px-2 py-1 rounded-lg hover:bg-green-500/30 transition-colors">
                    📞 تحديث الهاتف
                  </button>
                  <button onClick={() => alert('لا يمكن تغيير كلمة المرور من هنا. يمكن للطالب تغييرها من لوحته.')} className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg hover:bg-blue-500/30 transition-colors">⚙️ كلمة المرور</button>
                  
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

      {/* مودال إضافة طالب */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddStudentModal(false)}>
          <div className="glass p-6 rounded-3xl max-w-md w-full border border-white/20" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-semibold text-blue-300 mb-4">إضافة طالب جديد</h3>
            <p className="text-sm text-gray-400 mb-4">يجب أن يكون الطالب قد ملأ الاستبيان المطلوب</p>
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
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
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

// ========== لوحة تحكم الطالب ==========
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

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, classes(name)')
        .eq('id', user.id)
        .maybeSingle()
      if (error) throw error
      setProfile(data)
      setEditData(data || {})
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchTeacherInfo()
    fetchProfile()

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
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${user.id}`
      }, () => { fetchProfile() })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user.id])

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
      alert('الاسم ورقم الهاتف حقول إلزامية')
      return
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          name: editData.name,
          gender: editData.gender,
          age: parseInt(editData.age) || null,
          phone: editData.phone,
          info_verified: false,
          pending_changes: { 
            updated_at: new Date().toISOString(),
            old_data: {
              name: profile?.name,
              gender: profile?.gender,
              age: profile?.age,
              phone: profile?.phone
            }
          }
        })
        .eq('id', user.id)
      if (error) throw error
      alert('سيتم تحليل هذه المعلومات للتأكد من صحتها، وسيتم تعديلها إن كانت صحيحة خلال 48 ساعة.')
      setEditing(false)
      fetchProfile()
    } catch (err) {
      alert('فشل حفظ التغييرات: ' + err.message)
    }
  }

  if (loading) return <div className="text-center text-gray-400">جاري التحميل...</div>

  return (
    <div className="container-center min-h-screen p-4 relative" dir="rtl">
      <div className="glass p-8 max-w-4xl w-full space-y-6 z-10 border border-white/10">
        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-3xl font-bold text-blue-300">لوحة تحكم الطالب</h2>
            <p className="text-gray-400 text-sm mt-1">أهلاً بك: {user.username || user.email}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={changePassword} className="btn-primary bg-blue-600 hover:bg-blue-700 text-sm">
              تغيير كلمة المرور
            </button>
            <button onClick={onLogout} className="btn-primary bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 shadow-lg text-sm">
              تسجيل الخروج
            </button>
          </div>
        </div>

        {errorMsg && <p className="text-red-400 text-sm bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</p>}
        
        <div className="glass p-6 rounded-2xl border border-blue-500/20">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-semibold text-blue-200">معلوماتي الشخصية</h3>
            {!editing && (
              <button onClick={startEditing} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <span>✏️</span> تعديل
              </button>
            )}
          </div>
          {editing ? (
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm text-gray-300">الاسم الكامل <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} />
              </div>
              <div>
                <label className="text-sm text-gray-300">الجنس</label>
                <select className="input-glass w-full text-right" value={editData.gender} onChange={e => setEditData({...editData, gender: e.target.value})}>
                  <option value="">اختر</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-300">العمر</label>
                <input type="number" className="input-glass w-full text-right" value={editData.age} onChange={e => setEditData({...editData, age: e.target.value})} />
              </div>
              <div>
                <label className="text-sm text-gray-300">رقم الهاتف <span className="text-red-400">*</span></label>
                <input type="text" className="input-glass w-full text-right" value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} />
              </div>
              <div className="flex gap-3">
                <button onClick={saveChanges} className="btn-primary bg-green-600 hover:bg-green-700">حفظ التغييرات</button>
                <button onClick={() => setEditing(false)} className="btn-primary bg-gray-600 hover:bg-gray-700">إلغاء</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-gray-400">الاسم:</span> {profile?.name || 'غير مسجل'}</p>
              <p><span className="text-gray-400">الجنس:</span> {profile?.gender || 'غير محدد'}</p>
              <p><span className="text-gray-400">العمر:</span> {profile?.age || 'غير محدد'}</p>
              <p><span className="text-gray-400">رقم الهاتف:</span> {profile?.phone || 'غير مسجل'}</p>
              <p className="col-span-2"><span className="text-gray-400">الشعبة:</span> {profile?.classes?.name || 'غير محددة'}</p>
              <p className="col-span-2"><span className="text-gray-400">حالة التحقق:</span> {profile?.info_verified ? '✅ تم التحقق' : '⏳ قيد المراجعة'}</p>
            </div>
          )}
        </div>

        <div className="glass-glow p-6 rounded-2xl border border-blue-500/20">
          <h3 className="text-xl font-semibold mb-4 text-blue-200">الوقت المتبقي لحصتك القادمة</h3>
          {teacherData?.lesson_time ? (
            <CountdownTimer targetDate={teacherData.lesson_time} />
          ) : (
            <p className="text-gray-400 text-center py-2">المعلم لم يقم بجدولة حصة قادمة حتى الآن</p>
          )}
        </div>

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-3 relative overflow-hidden">
          <h3 className="text-xl font-semibold text-pink-300">الواجبات المدرسية المطلوبة</h3>
          
          {availableHomeworks.length > 0 ? (
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
      </div>
    </div>
  )
}

// ========== التطبيق الرئيسي ==========
const App = () => {
  const [user, setUser] = useState(null)
  const [frozenUser, setFrozenUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showFirstTime, setShowFirstTime] = useState(false)
  const [pendingUser, setPendingUser] = useState(null)

  useDynamicBackground();

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setFrozenUser(null)
    setPendingUser(null)
    setShowFirstTime(false)
  }

  const handleFirstTimeSuccess = (userData) => {
    setPendingUser(userData)
    setShowFirstTime(false)
  }

  const handlePasswordSet = (userData) => {
    setUser({ ...userData, needsPasswordChange: false })
    setPendingUser(null)
  }

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('role, is_frozen, username, name, gender, age, phone, class_id, info_verified')
            .eq('id', session.user.id)
            .maybeSingle()

          if (error) {
            console.error('خطأ في جلب الملف الشخصي:', error)
            await supabase.auth.signOut()
            setUser(null)
            setFrozenUser(null)
            setLoading(false)
            return
          }

          if (!profile) {
            await supabase.auth.signOut()
            setUser(null)
            setFrozenUser(null)
            setLoading(false)
            return
          }

          if (profile.is_frozen) {
            setFrozenUser({
              id: session.user.id,
              email: session.user.email,
              username: profile.username,
              role: profile.role,
              name: profile.name,
              phone: profile.phone,
              class_name: 'غير محدد'
            })
            setUser(null)
          } else {
            const needsPassChange = profile.info_verified === false
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: profile.role,
              username: profile.username,
              name: profile.name,
              gender: profile.gender,
              age: profile.age,
              phone: profile.phone,
              class_id: profile.class_id,
              needsPasswordChange: needsPassChange
            })
            setFrozenUser(null)
            if (needsPassChange) {
              setPendingUser(user)
            }
          }
        } catch (err) {
          console.error('خطأ في التحقق من الجلسة:', err)
          await supabase.auth.signOut()
          setUser(null)
          setFrozenUser(null)
        }
      } else {
        setUser(null)
        setFrozenUser(null)
      }
      setLoading(false)
    }

    checkSession()

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('role, is_frozen, username, name, gender, age, phone, class_id, info_verified')
            .eq('id', session.user.id)
            .maybeSingle()

          if (error) {
            console.error('خطأ في تغيير حالة المصادقة:', error)
            await supabase.auth.signOut()
            setUser(null)
            setFrozenUser(null)
            return
          }

          if (!profile) {
            await supabase.auth.signOut()
            setUser(null)
            setFrozenUser(null)
            return
          }

          if (profile.is_frozen) {
            setFrozenUser({
              id: session.user.id,
              email: session.user.email,
              username: profile.username,
              role: profile.role,
              name: profile.name,
              phone: profile.phone,
              class_name: 'غير محدد'
            })
            setUser(null)
          } else {
            const needsPassChange = profile.info_verified === false
            setUser({
              id: session.user.id,
              email: session.user.email,
              role: profile.role,
              username: profile.username,
              name: profile.name,
              gender: profile.gender,
              age: profile.age,
              phone: profile.phone,
              class_id: profile.class_id,
              needsPasswordChange: needsPassChange
            })
            setFrozenUser(null)
            if (needsPassChange) {
              setPendingUser(user)
            }
          }
        } catch (err) {
          console.error('خطأ في تغيير حالة المصادقة:', err)
          await supabase.auth.signOut()
          setUser(null)
          setFrozenUser(null)
        }
      } else {
        setUser(null)
        setFrozenUser(null)
        setPendingUser(null)
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

  if (pendingUser && pendingUser.needsPasswordChange) {
    return <ForcePasswordChange user={pendingUser} onPasswordSet={handlePasswordSet} />
  }

  if (frozenUser) {
    return <FrozenAccount user={frozenUser} onLogout={handleLogout} />
  }

  if (showFirstTime) {
    return <FirstTimeSignUp onSuccess={handleFirstTimeSuccess} onCancel={() => setShowFirstTime(false)} />
  }

  if (!user) return <Login onLogin={setUser} onFrozen={setFrozenUser} onFirstTime={() => setShowFirstTime(true)} />

  return user.role === 'teacher' 
    ? <TeacherPanel user={user} onLogout={handleLogout} />
    : <StudentPanel user={user} onLogout={handleLogout} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)