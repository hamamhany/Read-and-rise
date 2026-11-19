import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { auth } from './services/firebaseAuth';
import { db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, query, collection, where, updateDoc } from 'firebase/firestore';
import { fetchClassNames } from './utils/helpers';
import { useDynamicBackground } from './hooks/useDynamicBackground';
import { ConfirmProvider } from './components/common/ConfirmContext';
import Login from './components/auth/Login';
import CompleteProfile from './components/auth/CompleteProfile';
import FrozenAccount from './components/common/FrozenAccount';
import SupervisorPanel from './components/panels/SupervisorPanel';
import TeacherPanel from './components/panels/TeacherPanel';
import StudentPanel from './components/panels/StudentPanel';
import SystemManagerPanel from './components/panels/SystemManagerPanel';
import SupportButton from './components/common/SupportButton';
import SupportPage from './pages/SupportPage';
import {
  ExamCreatePage, ExamEditPage, ExamTakePage, ExamResultsPage, ExamAnswersPage
} from './pages/ExamPages';
// ☀️ الثيم
import { initTheme } from './utils/theme';
import ThemeToggle from './components/common/ThemeToggle';

const MainDashboard = ({ user, onLogout }) => {
  if (user.role === 'system_manager') return <SystemManagerPanel user={user} onLogout={onLogout} />;
  if (user.role === 'supervisor') return <SupervisorPanel user={user} onLogout={onLogout} />;
  if (user.role === 'teacher') return <TeacherPanel user={user} onLogout={onLogout} />;
  return <StudentPanel user={user} onLogout={onLogout} />;
};

// ✅ غلاف انتقال بين الشاشات (فقط بصري — لا يغيّر أي منطق)
const PageTransition = ({ children }) => (
  <div className="animate-panel-in">{children}</div>
);

// ✅ شاشة تحميل أولية أنيقة
const PremiumLoader = () => (
  <div className="container-center min-h-screen relative" dir="rtl">
    <div className="flex flex-col items-center gap-6 animate-panel-in">
      <div className="relative w-32 h-32 flex items-center justify-center">
        <img
          src="/images/logo.png"
          alt="logo"
          className="w-24 h-24 object-contain animate-logo-breathe select-none"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 border-r-purple-500 animate-spin" />
      </div>
      <p className="text-slate-600 dark:text-gray-300 text-sm font-medium tracking-wide animate-pulse">
        جاري التحميل...
      </p>
    </div>
  </div>
);

const App = () => {
  const [user, setUser] = useState(null);
  const [frozenUser, setFrozenUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingUserForComplete, setPendingUserForComplete] = useState(null);

  useDynamicBackground();

  // ☀️ تهيئة الثيم من localStorage قبل أي شيء
  useEffect(() => {
    initTheme();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setFrozenUser(null);
    setPendingUserForComplete(null);
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setFrozenUser(null);
    setPendingUserForComplete(null);
  };

  const handleFrozen = async (frozenData) => {
    let classNames = [];
    if (frozenData.classIds) {
      const classMap = await fetchClassNames(frozenData.classIds);
      classNames = frozenData.classIds.map(id => classMap[id] || null).filter(Boolean);
    }
    setFrozenUser({ ...frozenData, class_name: classNames.join(', ') || 'غير محدد' });
    setUser(null);
    setPendingUserForComplete(null);
  };

  const handleCompleteProfileSuccess = (updatedUser) => {
    setUser(updatedUser);
    setPendingUserForComplete(null);
  };

  const handleCompleteProfile = (userData) => {
    setPendingUserForComplete(userData);
  };

  const checkSessionAndProfile = async (firebaseUser) => {
    if (!firebaseUser) {
      setUser(null); setFrozenUser(null); setPendingUserForComplete(null);
      setLoading(false);
      return;
    }

    try {
      let q = query(collection(db, 'profiles'), where('uid', '==', firebaseUser.uid));
      let querySnapshot = await getDocs(q);
      let docSnap = null;
      let docId = null;
      let profile = null;

      if (!querySnapshot.empty) {
        docSnap = querySnapshot.docs[0];
        docId = docSnap.id;
        profile = docSnap.data();
      } else {
        q = query(collection(db, 'profiles'), where('email', '==', firebaseUser.email));
        querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          docSnap = querySnapshot.docs[0];
          docId = docSnap.id;
          profile = docSnap.data();
          await updateDoc(doc(db, 'profiles', docId), { uid: firebaseUser.uid });
          const updatedDocSnap = await getDoc(doc(db, 'profiles', docId));
          if (updatedDocSnap.exists()) {
            profile = updatedDocSnap.data();
          }
        } else {
          setPendingUserForComplete({
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: firebaseUser.displayName || ''
          });
          setUser(null); setFrozenUser(null); setLoading(false);
          return;
        }
      }

      if (profile.isFrozen) {
        let classNames = [];
        if (profile.classIds) {
          const classMap = await fetchClassNames(profile.classIds);
          classNames = profile.classIds.map(id => classMap[id] || null).filter(Boolean);
        }
        setFrozenUser({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username,
          role: profile.role,
          name: profile.name,
          phone: profile.phone,
          class_name: classNames.join(', ') || 'غير محدد'
        });
        setUser(null); setPendingUserForComplete(null); setLoading(false);
        return;
      }

      if (profile.role === 'supervisor' || profile.role === 'system_manager') {
        if (!profile.isProfileComplete) {
          setPendingUserForComplete({
            id: docId,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: profile.username || '',
            ...profile
          });
          setUser(null); setFrozenUser(null); setLoading(false);
          return;
        }
        setUser({
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
          isProfileComplete: true,
          canPublishAnnouncements: profile.canPublishAnnouncements !== false,
          serialNumber: profile.serialNumber || ''
        });
        setFrozenUser(null); setPendingUserForComplete(null); setLoading(false);
        return;
      }

      if (!profile.isProfileComplete) {
        setPendingUserForComplete({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || '',
          ...profile
        });
        setUser(null); setFrozenUser(null); setLoading(false);
        return;
      }

      setUser({
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
        isProfileComplete: true,
        serialNumber: profile.serialNumber || ''
      });
      setFrozenUser(null); setPendingUserForComplete(null); setLoading(false);
    } catch (err) {
      console.error(err);
      setUser(null); setFrozenUser(null); setPendingUserForComplete(null); setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await checkSessionAndProfile(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // ☀️ محتوى الشاشة
  const renderContent = () => {
    if (loading) {
      return <PremiumLoader />;
    }

    if (pendingUserForComplete) {
      return (
        <PageTransition key="complete-profile">
          <CompleteProfile
            user={pendingUserForComplete}
            onSuccess={handleCompleteProfileSuccess}
            onCancel={handleLogout}
          />
        </PageTransition>
      );
    }

    if (frozenUser) {
      return (
        <PageTransition key="frozen">
          <FrozenAccount user={frozenUser} onLogout={handleLogout} />
        </PageTransition>
      );
    }

    if (!user) {
      return (
        <PageTransition key="login">
          <Login
            onLogin={handleLogin}
            onFrozen={handleFrozen}
            onCompleteProfile={handleCompleteProfile}
          />
        </PageTransition>
      );
    }

    return (
      <Routes>
        <Route
          path="/"
          element={
            <PageTransition key={`dash-${user.id}`}>
              <MainDashboard user={user} onLogout={handleLogout} />
              <SupportButton user={user} />
            </PageTransition>
          }
        />
        <Route path="/support" element={<SupportPage user={user} />} />
        <Route
          path="/exams/new"
          element={user.role === 'teacher' ? <ExamCreatePage user={user} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/exams/:examId/edit"
          element={user.role === 'teacher' ? <ExamEditPage user={user} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/exams/:examId/take"
          element={user.role === 'student' ? <ExamTakePage user={user} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/exams/:examId/results"
          element={user.role === 'teacher' ? <ExamResultsPage user={user} /> : <Navigate to="/" replace />}
        />
        <Route path="/exams/:examId/answers/:resultId" element={<ExamAnswersPage user={user} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  };

  // ☀️ زر الثيم يظهر دائماً (حتى قبل تسجيل الدخول)
  return (
    <>
      <ThemeToggle />
      {renderContent()}
    </>
  );
};

const Root = () => (
  <BrowserRouter>
    <ConfirmProvider>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#fff',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            borderRadius: '16px',
            padding: '16px',
            direction: 'rtl',
            boxShadow: '0 14px 40px -12px rgba(99, 102, 241, 0.45), 0 6px 18px -6px rgba(139, 92, 246, 0.3)',
            animation: 'modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both'
          },
          success: {
            style: {
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
              border: '1px solid rgba(34, 197, 94, 0.45)',
            }
          },
          error: {
            style: {
              background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
            }
          }
        }}
      />
      <App />
    </ConfirmProvider>
  </BrowserRouter>
);

export default Root;