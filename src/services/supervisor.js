import toast from 'react-hot-toast';
import { db, secondaryAuth } from '../firebase';
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateId, sanitizeInput } from '../utils/helpers';
import { sendNotificationToTeacher } from '../utils/notifications';
import { sendSupervisorActivationMessage } from '../utils/whatsapp';
import { MAX_SUPERVISORS } from '../constants';

export const createSupervisorAccount = async (name, gender, age, phone, teacherId, permissions = { reports: true, resets: true, support: true }) => {
  try {
    const phoneDigits = String(phone || '').replace(/[^\d]/g, '');
    const normalizedPhone = phoneDigits.startsWith('00') ? phoneDigits.substring(2) : phoneDigits;

    if (!normalizedPhone) throw new Error('رقم الهاتف مطلوب.');
    if (normalizedPhone.startsWith('0')) throw new Error('يرجى إدخال رقم الهاتف مع رمز الدولة بدون صفر بادئ.');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 15) throw new Error('رقم الهاتف غير صالح.');

    const q = query(collection(db, 'profiles'), where('role', '==', 'supervisor'));
    const snapshot = await getDocs(q);
    if (snapshot.size >= MAX_SUPERVISORS) throw new Error(`لا يمكن إضافة أكثر من ${MAX_SUPERVISORS} مشرف.`);

    let username = '';
    let exists = true;
    let attempts = 0;
    while (exists && attempts < 20) {
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      username = `supervisor${randomNum}`;
      const q2 = query(collection(db, 'profiles'), where('username', '==', username));
      const snap = await getDocs(q2);
      if (snap.empty) exists = false;
      attempts++;
    }
    if (exists) throw new Error('تعذر إنشاء اسم مستخدم فريد.');

    const tempPassword = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const email = `${username}@readandrise.com`;

    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
    } catch (authError) {
      if (authError.code === 'auth/email-already-in-use') throw new Error('البريد الإلكتروني مستخدم بالفعل.');
      throw new Error('فشل إنشاء حساب المصادقة: ' + authError.message);
    }
    const firebaseUser = userCredential.user;
    await signOut(secondaryAuth);

    const newId = generateId();
    const ageNum = parseInt(age);

    await setDoc(doc(db, 'profiles', newId), {
      email, username, name: sanitizeInput(name), gender: sanitizeInput(gender),
      age: ageNum, phone: normalizedPhone, role: 'supervisor',
      isFrozen: false, infoVerified: false, isProfileComplete: false,
      permissions, // ✅ حفظ الصلاحيات
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      uid: firebaseUser.uid, warnings: []
    });

    await sendNotificationToTeacher(teacherId, '✅ تم إنشاء حساب مشرف جديد', `تم إنشاء حساب المشرف ${sanitizeInput(name)}.`, 'add_supervisor', newId);

    const supervisorObj = { name: sanitizeInput(name), phone: normalizedPhone };
    const waOpened = sendSupervisorActivationMessage(supervisorObj, username, tempPassword);

    if (!waOpened) {
      toast.error(`⚠️ تم إنشاء الحساب. اسم المستخدم: ${username} - كلمة المرور: ${tempPassword}`, { duration: 12000 });
    }

    return { id: newId, username, password: tempPassword, name: sanitizeInput(name) };
  } catch (err) {
    console.error('Error creating supervisor:', err);
    throw err;
  }
};