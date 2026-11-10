// api/cron-annual-age.js
// - يعمل مرة واحدة كل 1 يناير (أو يومياً، والفحص الذاتي يمنع التكرار)
// - يزيد عمر كل طالب بمقدار 1 عند بداية السنة الجديدة

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
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not configured' });
  }

  const db = admin.firestore();
  const currentYear = new Date().getFullYear();
  const results = { checked: 0, incremented: 0, skipped: 0, errors: [] };

  try {
    const studentsSnap = await db.collection('profiles')
      .where('role', '==', 'student')
      .get();

    for (const studentDoc of studentsSnap.docs) {
      results.checked++;
      const data = studentDoc.data();
      const currentAge = Number(data.age) || 0;
      if (currentAge <= 0) { results.skipped++; continue; }

      const createdAt = data.createdAt?.toDate?.() || null;
      const creationYear = createdAt ? createdAt.getFullYear() : currentYear;

      // آخر سنة تمت زيادة العمر فيها (افتراضياً سنة الإنشاء)
      const lastYear = data.lastAgeIncrementYear || creationYear;

      // ما زاد في هذه السنة بعد → نزيد
      if (currentYear > lastYear) {
        try {
          await studentDoc.ref.update({
            age: currentAge + 1,
            lastAgeIncrementYear: currentYear,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          results.incremented++;
        } catch (e) {
          results.errors.push({ student: studentDoc.id, error: e.message });
        }
      } else {
        results.skipped++;
      }
    }

    return res.status(200).json({ success: true, currentYear, ...results });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message, results });
  }
}