// api/cron-support-close.js
// يُشغّل تلقائياً كل ساعة (Vercel Cron)
// 1) يحذف التذاكر التي وافق الطرفان على حذفها وانقضت 24 ساعة
// 2) يُغلق تلقائياً التذاكر المعلّقة (SUPERVISOR_ENDED/AWAITING_RATING) بعد 24 ساعة بدون رد
// 3) يحذف التذاكر المُغلقة نهائياً بعد 7 أيام (تنظيف دوري)

import admin from 'firebase-admin';

// التهيئة
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
  // حماية: يسمح فقط لـ Vercel Cron أو بمفتاح سري
  const authHeader = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const results = {
    deleted_both_approved: 0,
    auto_closed_expired: 0,
    cleaned_old: 0,
    errors: []
  };

  try {
    const ticketsRef = db.collection('supportTickets');

    // =========================================
    // 1) حذف التذاكر التي وافق الطرفان وانقضت 24 ساعة
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

      if (scheduledMs > 0 && scheduledMs <= now) {
        try {
          // تصفير عداد المشرف
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
    // 2) إغلاق تلقائي للتذاكر المعلّقة
    // =========================================
    const TIMEOUT_MS = 24 * 60 * 60 * 1000;

    const q2a = ticketsRef.where('status', '==', 'supervisor_ended');
    const snap2a = await q2a.get();
    for (const ticketDoc of snap2a.docs) {
      const data = ticketDoc.data();
      const endRequested = data.endRequestedAt?.toMillis?.() || 0;
      if (endRequested > 0 && (now - endRequested) >= TIMEOUT_MS) {
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

    const q2b = ticketsRef.where('status', '==', 'awaiting_rating');
    const snap2b = await q2b.get();
    for (const ticketDoc of snap2b.docs) {
      const data = ticketDoc.data();
      const ratedAt = data.endRequestedAt?.toMillis?.() || data.updatedAt?.toMillis?.() || 0;
      if (ratedAt > 0 && (now - ratedAt) >= TIMEOUT_MS) {
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

    // =========================================
    // 3) حذف التذاكر المُغلقة نهائياً بعد 7 أيام
    // =========================================
    const CLEANUP_MS = 7 * 24 * 60 * 60 * 1000;
    const cleanupStatuses = ['auto_closed', 'rated_full', 'manager_apologized', 'manager_rejected'];

    for (const status of cleanupStatuses) {
      const q3 = ticketsRef.where('status', '==', status);
      const snap3 = await q3.get();
      for (const ticketDoc of snap3.docs) {
        const data = ticketDoc.data();
        const closedAt = data.closedAt?.toMillis?.() || data.updatedAt?.toMillis?.() || 0;
        if (closedAt > 0 && (now - closedAt) >= CLEANUP_MS) {
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
            results.cleaned_old++;
          } catch (e) {
            results.errors.push({ ticketId: ticketDoc.id, error: e.message });
          }
        }
      }
    }

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