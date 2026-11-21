// api/jitsi-token.js
// يولّد "تذكرة دخول" (JWT) لغرفة Jitsi: الخادم يحدد الاسم ومن هو رئيس الجلسة
import admin from 'firebase-admin';
import crypto from 'crypto';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
  }
}

// الأدوار التي تكون "رئيس جلسة" (المعلم فقط). عدّلها إذا لزم.
const MODERATOR_ROLES = ['teacher'];

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!admin.apps.length) return res.status(500).json({ error: 'Firebase Admin غير مهيأ في السيرفر' });

    const appId = process.env.JITSI_APP_ID;
    const appSecret = process.env.JITSI_APP_SECRET;
    const domain = process.env.JITSI_DOMAIN || 'meet.194.146.38.131.sslip.io';
    if (!appId || !appSecret) return res.status(500).json({ error: 'إعدادات Jitsi غير مكتملة' });

    const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
    if (!idToken) return res.status(401).json({ error: 'غير مصرح' });

    const decoded = await admin.auth().verifyIdToken(idToken);

    const q = await admin.firestore()
      .collection('profiles').where('uid', '==', decoded.uid).limit(1).get();
    if (q.empty) return res.status(403).json({ error: 'الملف الشخصي غير موجود' });

    const profileDoc = q.docs[0];
    const profile = profileDoc.data();

    const { roomName } = req.body || {};
    if (!roomName || typeof roomName !== 'string') return res.status(400).json({ error: 'roomName مطلوب' });

    const name = profile.name || profile.username || 'مشارك';
    const moderator = MODERATOR_ROLES.includes(profile.role);
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      aud: appId,
      iss: appId,
      sub: domain,
      room: roomName.toLowerCase(),
      nbf: now - 10,
      exp: now + 60 * 60 * 6, // صالحة 6 ساعات
      context: {
        user: {
          id: profileDoc.id,
          name,
          moderator,
          affiliation: moderator ? 'owner' : 'member'
        }
      }
    };

    return res.status(200).json({ jwt: signJwt(payload, appSecret), name, moderator });
  } catch (err) {
    console.error('jitsi-token error:', err);
    return res.status(500).json({ error: err.message || 'خطأ غير معروف' });
  }
}