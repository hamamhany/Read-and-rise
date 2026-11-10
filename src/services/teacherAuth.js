import { secondaryAuth, db } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  doc, setDoc, collection, query, where, getDocs, limit, serverTimestamp
} from 'firebase/firestore';
import { generateId } from '../utils/helpers';

const generateUniqueUsername = async () => {
  for (let i = 0; i < 10; i++) {
    const candidate = `teacher${Math.floor(Math.random() * 900000) + 100000}`;
    const snap = await getDocs(
      query(collection(db, 'profiles'), where('username', '==', candidate), limit(1))
    );
    if (snap.empty) return candidate;
  }
  throw new Error('تعذر إيجاد اسم مستخدم فريد');
};

/**
 * ✅ إنشاء حساب معلم — بدون بلد (البلد يختاره المعلم عند إكمال حسابه)
 */
export const createTeacherAccount = async ({
  name,
  nickname,
  gender,
  age,
  phone,
  createdBy
}) => {
  if (!gender) throw new Error('الجنس مطلوب');
  if (gender === 'ذكر' && !name) throw new Error('اسم المعلم مطلوب');
  if (gender === 'أنثى' && !nickname) throw new Error('اسم الشهرة مطلوب للمعلمة');
  if (!age) throw new Error('العمر مطلوب');
  if (!phone) throw new Error('رقم الهاتف مطلوب');

  const username = await generateUniqueUsername();
  const tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const email = `${username}@readandrise.com`;

  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
  } catch (err) {
    throw new Error('فشل إنشاء حساب المعلم: ' + err.message);
  }

  const firebaseUser = userCredential.user;
  await signOut(secondaryAuth);

  const newId = generateId();

  await setDoc(doc(db, 'profiles', newId), {
    uid: firebaseUser.uid,
    email,
    username,
    name: name || '',
    nickname: gender === 'أنثى' ? (nickname || '') : '',
    gender,
    age: parseInt(age),
    phone,
    country: '', // ✅ يختاره المعلم عند إكمال الحساب
    role: 'teacher',
    isProfileComplete: false,
    infoVerified: false,
    tempPassword,
    classIds: [],
    createdBy: createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: newId, username, tempPassword, email };
};