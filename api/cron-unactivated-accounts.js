// api/cron-unactivated-accounts.js
// - يفحص الطلاب الذين لم يفعّلوا حساباتهم (isProfileComplete = false)
// - بعد 21 يوم من الإنشاء → ينشئ طلب تنبيه للمدير (يُرسل واتساب)
// - بعد 7 أيام من إنشاء التنبيه → يحذف الحساب + بلاك ليست + ينشئ طلب إشعار حذف

import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) { console.error('Admin init failed:', e.message); }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = 21;
const DELETE_AFTER_REMINDER_DAYS = 7;

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not configured' });
  }

  const db = admin.firestore();
  const results = { checked: 0, reminded: 0, deleted: 0, errors: [] };
  const now = Date.now();

  try {
    // جلب أسماء الشعب
    const classesSnap = await db.collection('classes').get();
    const classMap = {};
    classesSnap.forEach(d => { classMap[d.id] = d.data().name; });

    const studentsSnap = await db.collection('profiles')
      .where('role', '==', 'student')
      .get();

    for (const studentDoc of studentsSnap.docs) {
      results.checked++;
      const data = studentDoc.data();
      if (data.isProfileComplete === true) continue;

      const studentName = data.name || '';
      const studentPhone = data.phone || '';
      const studentSerial = data.serialNumber || '';
      const studentUsername = data.username || '';
      const studentTempPass = data.tempPassword || '';
      const studentClass = (data.classIds || []).map(id => classMap[id]).filter(Boolean).join(', ') || 'غير محدد';

      const createdAt = data.createdAt?.toDate?.() || null;
      if (!createdAt) continue;

      const reminderCreatedAt = data.unactivatedReminderCreatedAt?.toDate?.() || null;

      // 1. لم يُنشأ تنبيه بعد، ومضى 21 يوم من الإنشاء → إنشاء تنبيه
      if (!reminderCreatedAt) {
        if (now - createdAt.getTime() >= REMINDER_DAYS * DAY_MS) {
          try {
            await db.collection('messageRequests').add({
              type: 'unactivated_account_reminder',
              targetType: 'student',
              targetId: studentDoc.id,
              targetName: studentName,
              targetPhone: studentPhone,
              targetClass: studentClass,
              requestedBy: 'system',
              requestedByName: 'النظام التلقائي',
              payload: {
                serialNumber: studentSerial,
                username: studentUsername,
                password: studentTempPass,
                age: data.age || null,
                gender: data.gender || ''
              },
              status: 'pending',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            await studentDoc.ref.update({
              unactivatedReminderCreatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            results.reminded++;
          } catch (e) {
            results.errors.push({ student: studentDoc.id, error: e.message });
          }
        }
        continue;
      }

      // 2. يوجد تنبيه، مضى 7 أيام عليه → حذف الحساب + بلاك ليست + إشعار
      if (now - reminderCreatedAt.getTime() >= DELETE_AFTER_REMINDER_DAYS * DAY_MS) {
        try {
          // إنشاء طلب إشعار الحذف (قبل الحذف عشان نحفظ البيانات)
          await db.collection('messageRequests').add({
            type: 'unactivated_account_deleted',
            targetType: 'student',
            targetId: studentDoc.id,
            targetName: studentName,
            targetPhone: studentPhone,
            targetClass: studentClass,
            requestedBy: 'system',
            requestedByName: 'النظام التلقائي',
            payload: {
              serialNumber: studentSerial,
              autoDelete: true
            },
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });

          // إضافة للقائمة السوداء (دائمة - بدون expiresAt)
          if (studentPhone) {
            await db.collection('blacklist').add({
              phone: String(studentPhone).replace(/[^\d]/g, ''),
              reason: 'عدم تفعيل الحساب خلال 3 أسابيع + 7 أيام من التنبيه',
              addedBy: 'system',
              addedByName: 'النظام التلقائي',
              addedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }

          // حذف الإشعارات
          const notifSnap = await studentDoc.ref.collection('userNotifications').get();
          const nb = db.batch();
          notifSnap.docs.forEach(d => nb.delete(d.ref));
          if (!notifSnap.empty) await nb.commit();

          // حذف Auth
          if (data.uid) {
            try { await admin.auth().deleteUser(data.uid); } catch (e) { /* ignore */ }
          }

          // حذف الملف
          await studentDoc.ref.delete();
          results.deleted++;
        } catch (e) {
          results.errors.push({ student: studentDoc.id, error: e.message });
        }
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message, results });
  }
}