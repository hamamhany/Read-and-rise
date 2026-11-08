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
    const requesterRole = reqSnap.docs[0].data().role;
    if (!['supervisor', 'system_manager'].includes(requesterRole)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية' });
    }

    const { userId, newUsername, newPassword } = req.body || {};
    if (!userId || !newUsername || !newPassword) {
      return res.status(400).json({ error: 'بيانات ناقصة' });
    }

    const targetRef = admin.firestore().collection('profiles').doc(userId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const target = targetSnap.data();
    if (!target.uid) return res.status(400).json({ error: 'لا يوجد UID' });

    // 1. تحديث Firebase Auth — الإيميل والباسورد
    const newEmail = `${newUsername}@readandrise.com`;
    await admin.auth().updateUser(target.uid, {
      email: newEmail,
      password: newPassword,
      emailVerified: true
    });

    // 2. تحديث الملف الشخصي
    await targetRef.update({
      username: newUsername,
      email: newEmail,
      isProfileComplete: false,
      infoVerified: false,
      pendingChanges: null,
      reviewResult: null,
      reviewExpiry: null,
      tempPassword: newPassword,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ success: true, newUsername });
  } catch (err) {
    console.error('reset-password error:', err);
    return res.status(500).json({ error: err.message || 'خطأ غير معروف' });
  }
}