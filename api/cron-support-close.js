// api/cron-support-close.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) { console.error('Admin init failed:', e.message); }
}

const db = admin.firestore();

export default async function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not configured' });
  }

  const now = Date.now();
  const HOUR_24 = 24 * 60 * 60 * 1000;
  const results = {
    deleted_both_approved: 0,
    auto_cancelled_pending: 0,
    auto_deleted_expired: 0,
    old_ai_usage_deleted: 0,
    old_security_incidents_deleted: 0,
    errors: []
  };

  try {
    const ticketsRef = db.collection('supportTickets');

    // 1) شبكة أمان: حذف التذاكر العالقة في "both_approved"
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

    // 2) إلغاء طلبات الحذف المعلقة بعد 24 ساعة
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

    // 3) حذف نهائي للتذاكر المعلّقة في supervisor_ended بعد 24 ساعة
    const q3a = ticketsRef.where('status', '==', 'supervisor_ended');
    const snap3a = await q3a.get();
    for (const ticketDoc of snap3a.docs) {
      const data = ticketDoc.data();
      const endRequested = data.endRequestedAt?.toMillis?.()
        || (data.endRequestedAt?.seconds ? data.endRequestedAt.seconds * 1000 : 0);
      if (endRequested > 0 && (now - endRequested) >= HOUR_24) {
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
          results.auto_deleted_expired++;
        } catch (e) {
          results.errors.push({ ticketId: ticketDoc.id, error: e.message });
        }
      }
    }

    // 4) ✅ تنظيف سجلات استخدام AI القديمة (أقدم من 7 أيام)
    const cutoffUsage = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const oldUsage = await db.collection('aiUsage').where('date', '<', cutoffUsage).get();
      for (const d of oldUsage.docs) {
        await d.ref.delete();
        results.old_ai_usage_deleted++;
      }
    } catch (e) {
      results.errors.push({ cleanup: 'aiUsage', error: e.message });
    }

    // 5) ✅ تنظيف الحوادث الأمنية القديمة (أقدم من 30 يوم)
    try {
      const cutoffIncidents = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const oldIncidents = await db.collection('securityIncidents')
        .where('createdAt', '<', cutoffIncidents)
        .limit(100)
        .get();
      for (const d of oldIncidents.docs) {
        await d.ref.delete();
        results.old_security_incidents_deleted++;
      }
    } catch (e) {
      results.errors.push({ cleanup: 'securityIncidents', error: e.message });
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