// api/cron-support-close.js
// - يحذف فقط التذاكر التي وافق الطرفان على حذفها وانقضت 24 ساعة
// - يلغي طلبات الحذف المعلقة بعد 24 ساعة بدون اكتمال (لا حذف)
// - يغلق تلقائياً التذاكر المعلّقة (فقط تغيير حالة، لا حذف)

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const HOUR_24 = 24 * 60 * 60 * 1000;
  const results = {
    deleted_both_approved: 0,
    auto_cancelled_pending: 0,
    auto_closed_expired: 0,
    errors: []
  };

  try {
    const ticketsRef = db.collection('supportTickets');

    // =========================================
    // 1) حذف التذاكر التي وافق الطرفان وانقضت 24 ساعة
    // ⚠️ فقط عند موافقة الاثنين (both_approved) + انقضاء 24 ساعة
    // =========================================
    const q1 = ticketsRef.where('deleteRequest.status', '==', 'both_approved');
    const snap1 = await q1.get();

    for (const ticketDoc of snap1.docs) {
      const data = ticketDoc.data();
      const scheduledAt = data.deleteRequest?.scheduledDeleteAt;
      let scheduledMs = 0;
      if (scheduledAt) {
        scheduledMs = typeof scheduledAt === 'string'
          ? new Date(scheduledAt).getTime()
          : (scheduledAt.toMillis ? scheduledAt.toMillis() : 0);
      }

      // تحقق مزدوج: يجب أن يكون الطرفان قد وافقا فعلاً
      const bothApproved =
        data.deleteRequest?.supervisorApproved === true &&
        data.deleteRequest?.studentApproved === true;

      if (bothApproved && scheduledMs > 0 && scheduledMs <= now) {
        try {
          if (data.assignedSupervisorId) {
            const supRef = db.collection('profiles').doc(data.assignedSupervisorId);
            const supSnap = await supRef.get();
            if (supSnap.exists) {
              const current = supSnap.data().activeTicketCount || 0;
              await supRef.update({ activeTicketCount: Math.max(0, current - 1) });
            }
          }
          await ticketDoc.ref.delete();
          results.deleted_both_approved++;
        } catch (e) {
          results.errors.push({ ticketId: ticketDoc.id, error: e.message });
        }
      }
    }

    // =========================================
    // 2) إلغاء طلبات الحذف المعلقة بعد 24 ساعة بدون اكتمال
    // ⚠️ لا حذف — فقط إلغاء الطلب
    // =========================================
    const q2 = ticketsRef.where('deleteRequest.status', '==', 'pending');
    const snap2 = await q2.get();

    for (const ticketDoc of snap2.docs) {
      const data = ticketDoc.data();
      const requestedAt = data.deleteRequest?.requestedAt?.toMillis?.()
        || (data.deleteRequest?.requestedAt?.seconds
          ? data.deleteRequest.requestedAt.seconds * 1000
          : 0);

      if (requestedAt > 0 && (now - requestedAt) >= HOUR_24) {
        try {
          await ticketDoc.ref.update({
            'deleteRequest.status': 'cancelled',
            'deleteRequest.cancelledAt': admin.firestore.FieldValue.serverTimestamp(),
            'deleteRequest.cancelledReason': 'انتهت مهلة الموافقة (24 ساعة)',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.auto_cancelled_pending++;
        } catch (e) {
          results.errors.push({ ticketId: ticketDoc.id, error: e.message });
        }
      }
    }

    // =========================================
    // 3) إغلاق تلقائي للتذاكر المعلّقة (فقط تغيير حالة، لا حذف)
    // =========================================
    const q3a = ticketsRef.where('status', '==', 'supervisor_ended');
    const snap3a = await q3a.get();
    for (const ticketDoc of snap3a.docs) {
      const data = ticketDoc.data();
      const endRequested = data.endRequestedAt?.toMillis?.() || 0;
      if (endRequested > 0 && (now - endRequested) >= HOUR_24) {
        try {
          await ticketDoc.ref.update({
            status: 'auto_closed',
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.auto_closed_expired++;
        } catch (e) {
          results.errors.push({ ticketId: ticketDoc.id, error: e.message });
        }
      }
    }

    // ⚠️ تم إزالة الجزء القديم الذي كان يحذف التذاكر المغلقة بعد 7 أيام
    // الحذف الآن فقط عند موافقة الاثنين + 24 ساعة

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results
    });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({
      success: false,
      error: err.message,
      results
    });
  }
}