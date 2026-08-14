import toast from 'react-hot-toast';
import { db, secondaryAuth } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateId, sanitizeInput } from '../utils/helpers';
import { sendNotificationToTeacher } from '../utils/notifications';
import { sendSupervisorActivationMessage } from '../utils/whatsapp';
import { MAX_SUPERVISORS } from '../constants';

export const createSupervisorAccount = async (name, gender, age, phone, teacherId) => {
  try {
    const q = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
    const snapshot = await getDocs(q);
    if (snapshot.size >= MAX_SUPERVISORS) {
      throw new Error(`لا يمكن إضافة أكثر من ${MAX_SUPERVISORS} مشرف.`);
    }

    let username = '';
    let exists = true;
    let attempts = 0;
    while (exists && attempts < 20) {
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      username = `supervisor${randomNum}`;
      const q2 = query(collection(db, 'profiles'), where('username', '==', username));
      const snap = await getDocs(q2);
      if (snap.empty) {
        exists = false;
      }
      attempts++;
    }
    if (exists) {
      throw new Error('تعذر إنشاء اسم مستخدم فريد، حاول مرة أخرى.');
    }

    const tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const email = `${username}@readandrise.com`;

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    } catch (authError) {
      console.error('Auth creation error (secondary):', authError);
      if (authError.code === 'auth/email-already-in-use') {
        throw new Error('البريد الإلكتروني مستخدم بالفعل. حاول مرة أخرى.');
      }
      throw new Error('فشل إنشاء حساب المصادقة: ' + authError.message);
    }
    const firebaseUser = userCredential.user;
    await signOut(secondaryAuth);

    const newId = generateId();
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 99) {
      throw new Error('العمر يجب أن يكون رقماً بين 1 و 99.');
    }

    await setDoc(doc(db, 'profiles', newId), {
      email,
      username,
      name: sanitizeInput(name),
      gender: sanitizeInput(gender),
      age: ageNum,
      phone: cleanPhone,
      role: 'supervisor',
      isFrozen: false,
      infoVerified: false,
      isProfileComplete: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      uid: firebaseUser.uid,
      warnings: []
    });

    await sendNotificationToTeacher(
      teacherId,
      '👁️ إضافة مشرف جديد',
      `تم إضافة المشرف ${name} (اسم المستخدم: ${username})`,
      'add_supervisor',
      newId
    );

    const supervisorObj = { name, phone: cleanPhone };
    const sent = sendSupervisorActivationMessage(supervisorObj, username, tempPassword);
    if (!sent) {
      toast.warn('لم يتم إرسال رسالة واتساب للمشرف بسبب خطأ في رقم الهاتف، ولكن تم إنشاء الحساب بنجاح.');
    }

    return { id: newId, username, password: tempPassword, name };
  } catch (err) {
    console.error('Error creating supervisor:', err);
    throw err;
  }
};