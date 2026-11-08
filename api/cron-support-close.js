// api/cron-support-close.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) { console.error(e.message); }
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!admin.apps.length) return res.status(500).json({ error: 'Admin not configured' });

  const db = admin.firestore();
  const now = Date.now();
  const results = { checked: 0, autoClosed: 0, decremented: 0, errors: [] };

  try {
    const snap = await db.collection('supportTickets')
      .where('status', '==', 'supervisor_ended')
      .get();

    for (const ticketDoc of snap.docs) {
      results.checked++;
      const data = ticketDoc.data();
      const expiresAt = data.endRequestExpiresAt?.toMillis?.() ||
        (data.endRequestExpiresAt?.seconds ? data.endRequestExpiresAt.seconds * 1000 : 0);

      if (!expiresAt || expiresAt > now) continue;

      try {
        // إغلاق تلقائي
        await ticketDoc.ref.update({
          status: 'auto_closed',
          closedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // إنقاص عدد التذاكر النشطة من المشرف
        if (data.assignedSupervisorId) {
          try {
            const supRef = db.collection('profiles').doc(data.assignedSupervisorId);
            const supSnap = await supRef.get();
            if (supSnap.exists) {
              const cur = supSnap.data().activeTicketCount || 0;
              await supRef.update({ activeTicketCount: Math.max(0, cur - 1) });
              results.decremented++;
            }
          } catch (e) { console.warn('decrement failed:', e.message); }
        }

        // حذف التذكرة بعد الإغلاق مباشرة
        await ticketDoc.ref.delete();
        results.autoClosed++;
      } catch (e) {
        results.errors.push({ ticketId: ticketDoc.id, error: e.message });
      }
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}