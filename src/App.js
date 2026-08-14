import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { auth } from './services/firebaseAuth';
import { db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, query, collection, where, updateDoc } from 'firebase/firestore';
import { fetchClassNames } from './utils/helpers';
import { useDynamicBackground } from './hooks/useDynamicBackground';
import { ConfirmProvider } from './components/common/ConfirmContext';
import { Login } from './components/auth/Login';
import { CompleteProfile } from './components/auth/CompleteProfile';
import { FrozenAccount } from './components/common/FrozenAccount';
import { SupervisorPanel } from './components/panels/SupervisorPanel';
import { TeacherPanel } from './components/panels/TeacherPanel';
import { StudentPanel } from './components/panels/StudentPanel';

const App = () => {
  const [user, setUser] = useState(null);
  const [frozenUser, setFrozenUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingUserForComplete, setPendingUserForComplete] = useState(null);

  useDynamicBackground();

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
    setFrozenUser({
      ...frozenData,
      class_name: classNames.join(', ') || 'غير محدد'
    });
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
      setUser(null);
      setFrozenUser(null);
      setPendingUserForComplete(null);
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
          setUser(null);
          setFrozenUser(null);
          setLoading(false);
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
        setUser(null);
        setPendingUserForComplete(null);
        setLoading(false);
        return;
      }

      if (profile.role === 'supervisor') {
        if (!profile.isProfileComplete) {
          setPendingUserForComplete({
            id: docId,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            username: profile.username || '',
            ...profile
          });
          setUser(null);
          setFrozenUser(null);
          setLoading(false);
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
          isProfileComplete: true
        });
        setFrozenUser(null);
        setPendingUserForComplete(null);
        setLoading(false);
        return;
      }

      // Student
      if (!profile.isProfileComplete) {
        setPendingUserForComplete({
          id: docId,
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          username: profile.username || '',
          ...profile
        });
        setUser(null);
        setFrozenUser(null);
        setLoading(false);
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
        isProfileComplete: true
      });
      setFrozenUser(null);
      setPendingUserForComplete(null);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setUser(null);
      setFrozenUser(null);
      setPendingUserForComplete(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await checkSessionAndProfile(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="container-center min-h-screen text-white"><div className="bg-gray-900 p-8 rounded-2xl border border-gray-700 shadow-xl animate-pulse">جاري التحميل...</div></div>;

  if (pendingUserForComplete) {
    return (
      <CompleteProfile
        user={pendingUserForComplete}
        onSuccess={handleCompleteProfileSuccess}
        onCancel={handleLogout}
      />
    );
  }

  if (frozenUser) {
    return <FrozenAccount user={frozenUser} onLogout={handleLogout} />;
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        onFrozen={handleFrozen}
        onCompleteProfile={handleCompleteProfile}
      />
    );
  }

  if (user.role === 'supervisor') {
    return <SupervisorPanel user={user} onLogout={handleLogout} />;
  }

  return user.role === 'teacher' ? <TeacherPanel user={user} onLogout={handleLogout} /> : <StudentPanel user={user} onLogout={handleLogout} />;
};

const Root = () => (
  <ConfirmProvider>
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: '#1e293b',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '16px',
          padding: '16px',
          direction: 'rtl'
        }
      }}
    />
    <App />
  </ConfirmProvider>
);

export default Root;