// api/check-blacklist.js
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const normalized = String(phone).replace(/[^\d]/g, '');
    const snap = await admin.firestore()
      .collection('blacklist')
      .where('phone', '==', normalized)
      .limit(1)
      .get();
    if (snap.empty) return res.status(200).json({ blacklisted: false });
    return res.status(200).json({ blacklisted: true, record: snap.docs[0].data() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}