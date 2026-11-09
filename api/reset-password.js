// api/reset-password.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) { console.error('Admin init failed:', e.message); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!admin.apps.length) {
      return res.status(500).json({ error: 'Firebase Admin غير مهيأ' });
    }

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'غير مصرح' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decoded.uid;

    const reqSnap = await admin.firestore().collection('profiles')
      .where('uid', '==', requesterUid).limit(1).get();
    if (reqSnap.empty) return res.status(403).json({ error: 'الملف الشخصي غير موجود' });
    const requesterProfile = reqSnap.docs[0].data();
    const requesterRole = requesterProfile.role;

    const { action, userId, newUsername, newPassword } = req.body || {};
    if (!userId || !newUsername || !newPassword) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }

    const targetRef = admin.firestore().collection('profiles').doc(userId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const target = targetSnap.data();
    if (!target.uid) return res.status(400).json({ error: 'لا يوجد UID' });

    // =========================================================
    // ✅ تحديد الصلاحيات والسلوك حسب نوع العملية
    // =========================================================
    const isCompleteProfile = action === 'complete_profile';
    const isSelf = target.uid === requesterUid;
    const isPrivileged = ['supervisor', 'system_manager'].includes(requesterRole);

    if (isCompleteProfile) {
      // المستخدم يكمل ملفه بنفسه فقط
      if (!isSelf) {
        return res.status(403).json({ error: 'غير مصرح — يمكنك إكمال ملفك الشخصي فقط' });
      }
    } else {
      // إعادة تعيين كلمة المرور — تتطلب صلاحيات مشرف
      if (!isPrivileged) {
        return res.status(403).json({ error: 'ليس لديك صلاحية' });
      }
    }

    // التحقق من توفر اسم المستخدم
    const newEmail = `${String(newUsername).toLowerCase()}@readandrise.com`;
    try {
      const existing = await admin.auth().getUserByEmail(newEmail);
      if (existing.uid !== target.uid) {
        return res.status(400).json({ error: 'اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار آخر' });
      }
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw err;
    }

    // 1. تحديث Firebase Auth — الإيميل والباسورد (يتجاوز شرط التحقق)
    await admin.auth().updateUser(target.uid, {
      email: newEmail,
      password: String(newPassword),
      emailVerified: true
    });

    // 2. تحديث الملف الشخصي حسب نوع العملية
    const profileUpdate = {
      username: String(newUsername).toLowerCase(),
      email: newEmail,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (isCompleteProfile) {
      // ✅ المستخدم أكمل ملفه — يصبح مكتملاً
      profileUpdate.isProfileComplete = true;
      profileUpdate.infoVerified = true;
      profileUpdate.tempPassword = null;
    } else {
      // ✅ إعادة تعيين — يحتاج المستخدم لإكمال الملف من جديد
      profileUpdate.isProfileComplete = false;
      profileUpdate.infoVerified = false;
      profileUpdate.pendingChanges = null;
      profileUpdate.reviewResult = null;
      profileUpdate.reviewExpiry = null;
      profileUpdate.tempPassword = String(newPassword);
    }

    await targetRef.update(profileUpdate);

    return res.status(200).json({
      success: true,
      newUsername: profileUpdate.username,
      action: isCompleteProfile ? 'complete_profile' : 'reset_password'
    });
  } catch (err) {
    console.error('reset-password error:', err);
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'اسم المستخدم هذا مستخدم بالفعل' });
    }
    if (err.code === 'auth/invalid-password') {
      return res.status(400).json({ error: 'كلمة المرور ضعيفة جداً' });
    }
    if (err.code === 'auth/uid-not-found' || err.code === 'auth/user-not-found') {
      return res.status(404).json({ error: 'حساب المصادقة غير موجود' });
    }
    return res.status(500).json({ error: err.message || 'خطأ غير معروف' });
  }
}