// api/delete-user.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!admin.apps.length) {
      return res.status(500).json({ error: 'Firebase Admin غير مهيأ في السيرفر' });
    }

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'غير مصرح' });

    // التحقق من هوية الطالب
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const requesterUid = decodedToken.uid;

    // التحقق من الصلاحيات
    const requesterQuery = await admin.firestore()
      .collection('profiles')
      .where('uid', '==', requesterUid)
      .limit(1)
      .get();

    if (requesterQuery.empty) return res.status(403).json({ error: 'الملف الشخصي غير موجود' });
    const requesterProfile = requesterQuery.docs[0].data();
    if (!['supervisor', 'system_manager'].includes(requesterProfile.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية حذف الحسابات' });
    }

    const { userId, targetUid, targetPhone, blacklistReason } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId مطلوب' });

    // جلب ملف المستخدم المستهدف
    const targetRef = admin.firestore().collection('profiles').doc(userId);
    const targetSnap = await targetRef.get();
    if (!targetSnap.exists) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const targetData = targetSnap.data();

    const uid = targetUid || targetData.uid;
    const phone = targetPhone || targetData.phone;

    // 1. حذف الإشعارات
    const notifRef = targetRef.collection('userNotifications');
    const notifSnap = await notifRef.get();
    const batch = admin.firestore().batch();
    notifSnap.docs.forEach(d => batch.delete(d.ref));
    if (!notifSnap.empty) await batch.commit();

    // 2. حذف الملف الشخصي
    await targetRef.delete();

    // 3. حذف من Authentication
    if (uid) {
      try {
        await admin.auth().deleteUser(uid);
      } catch (e) {
        console.warn('Auth delete warning:', e.message);
      }
    }

    // 4. ✅ إضافة للقائمة السوداء — حظر دائم (بدون expiresAt)
    // لا يُرفع إلا يدوياً من لوحة المدير عبر زر الإزالة
    if (blacklistReason && phone) {
      await admin.firestore().collection('blacklist').add({
        phone: String(phone).replace(/[^\d]/g, ''),
        reason: blacklistReason,
        addedBy: requesterUid,
        addedByName: requesterProfile.name || '',
        addedAt: admin.firestore.FieldValue.serverTimestamp()
        // ⚠️ لا expiresAt — حظر دائم
      });
    }

    return res.status(200).json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (err) {
    console.error('delete-user error:', err);
    return res.status(500).json({ error: err.message || 'خطأ غير معروف' });
  }
}