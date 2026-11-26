// api/jitsi-token.js
// نقطة واحدة تتولى كل ما يخص الحصص المباشرة (حتى لا نزيد عدد دوال Vercel):
//   action = "join"      → يعطي الطالب/المعلم تذكرة دخول (JWT) لغرفة الشعبة
//   action = "start"     → المعلم يفتح حصة لشعبته
//   action = "end"       → المعلم ينهي الحصة
//   action = "ping"      → نبضة المعلم
//   action = "heartbeat" → نبضة الطالب
//   action = "release"   → تحرير جهاز الطالب
//   action = "get-invite-code" → المعلم يجلب رقم الدعوة (6 أرقام)
//   action = "guest-request"   → ضيف يطلب الدخول برقم الحصة + اسمه (بدون توكن)
//   action = "guest-status"    → الضيف يتابع حالة طلبه (بدون توكن)
//   action = "guest-join"      → الضيف المقبول يستلم JWT مقيد (بدون توكن)
//   action = "guest-list"      → المعلم يستعلم عن طلبات الضيوف المعلقة
//   action = "guest-respond"   → المعلم يوافق أو يرفض طلب ضيف
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

// ============ إعدادات ============
const MODERATOR_ROLES = ['teacher'];
const VIEWER_ROLES = ['system_manager'];
const LIVE_COLLECTION = 'liveSessions';
const DEVICE_COLLECTION = 'deviceSessions';
const GUEST_COLLECTION = 'guestRequests';

const VISIBLE_STALE_MS = 5 * 60 * 1000;
const ABANDONED_MS = 15 * 60 * 1000;
const DEVICE_TTL_MS = 75 * 1000;
const JWT_LIFETIME_SEC = 60 * 60 * 6;

const AVATAR_FILES = {
  student: 'Image student.png',
  teacher: 'Image teacher.png',
  system_manager: 'Image boss.png'
};
const GUEST_AVATAR_FILE = 'Intruder.png';

const DEVICE_CONFLICT_MESSAGE =
  'لقد قمت بالانضمام من جهاز آخر. لا يُسمح بالانضمام من أكثر من جهاز لنفس الحساب، يجب الخروج أولاً من الحساب الآخر.';
// ==================================

const fail = (status, code, message) => {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
};

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${sig}`;
}

const validClassId = (id) =>
  typeof id === 'string' && id.length > 0 && id.length <= 128 && !id.includes('/');

const validDeviceId = (id) =>
  typeof id === 'string' && id.length >= 8 && id.length <= 100;

function getOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function getAvatarUrl(req, role) {
  const file = AVATAR_FILES[role];
  const origin = getOrigin(req);
  if (!file || !origin) return '';
  return `${origin}/images/${encodeURIComponent(file)}`;
}

async function getCaller(db, req, { needProfile = true } = {}) {
  const idToken = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) throw fail(401, 'unauthorized', 'غير مصرح');
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    throw fail(401, 'unauthorized', 'انتهت صلاحية الجلسة، أعد تسجيل الدخول.');
  }
  if (!needProfile) return { decoded };

  const q = await db.collection('profiles').where('uid', '==', decoded.uid).limit(1).get();
  if (q.empty) throw fail(403, 'no-profile', 'الملف الشخصي غير موجود');
  const profileDoc = q.docs[0];
  return { decoded, profileDoc, profile: profileDoc.data() };
}

async function cleanupDevices(db, classId) {
  try {
    const snap = await db.collection(DEVICE_COLLECTION).where('classId', '==', classId).get();
    if (snap.empty) return;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    console.warn('cleanupDevices failed:', e.message);
  }
}

async function cleanupGuestRequests(db, classId) {
  try {
    const snap = await db.collection(GUEST_COLLECTION).where('classId', '==', classId).get();
    if (snap.empty) return;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (e) {
    console.warn('cleanupGuestRequests failed:', e.message);
  }
}

// ======================= الإجراءات =======================

async function actionStart(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'فتح الحصة للمعلم فقط.');
  const { classId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const classSnap = await db.collection('classes').doc(classId).get();
  if (!classSnap.exists) throw fail(404, 'no-class', 'الشعبة غير موجودة.');
  const cls = classSnap.data();
  if (cls.teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذه الشعبة ليست من شعبك.');

  const sessionRef = db.collection(LIVE_COLLECTION).doc(classId);
  let startedNew = false;
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const now = Date.now();
    const old = snap.exists ? snap.data() : null;

    if (old && old.active && old.teacherId === profileDoc.id && now - (old.lastPingMs || 0) < ABANDONED_MS) {
      tx.update(sessionRef, { lastPingMs: now });
      return { ...old, lastPingMs: now };
    }

    startedNew = true;
    const sessionNumber = ((old && old.sessionNumber) || 0) + 1;
    const roomName = `rr-${classId.toLowerCase()}-s${sessionNumber}`;
    const data = {
      classId,
      className: cls.name || '',
      active: true,
      sessionNumber,
      roomName,
      teacherId: profileDoc.id,
      teacherName: profile.name || profile.username || '',
      startedAtMs: now,
      lastPingMs: now,
      endedAtMs: null,
      inviteCode: null,
      joinCounter: 0,
      joinOrder: {},
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    tx.set(sessionRef, data);
    return data;
  });

  if (startedNew) {
    await cleanupDevices(db, classId);
    await cleanupGuestRequests(db, classId);
  }
  return { ok: true, sessionNumber: result.sessionNumber, roomName: result.roomName };
}

async function actionEnd(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'إنهاء الحصة للمعلم فقط.');
  const { classId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const sessionRef = db.collection(LIVE_COLLECTION).doc(classId);
  const snap = await sessionRef.get();
  if (!snap.exists) return { ok: true, ended: false };
  if (snap.data().teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذه الحصة ليست حصتك.');

  await sessionRef.update({
    active: false,
    endedAtMs: Date.now(),
    endedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await cleanupDevices(db, classId);
  await cleanupGuestRequests(db, classId);
  return { ok: true, ended: true };
}

async function actionPing(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'غير مسموح');
  const { classId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const sessionRef = db.collection(LIVE_COLLECTION).doc(classId);
  const snap = await sessionRef.get();
  if (!snap.exists) return { ok: true, active: false };
  const s = snap.data();
  if (s.teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذه الحصة ليست حصتك.');
  if (!s.active) return { ok: true, active: false };
  await sessionRef.update({ lastPingMs: Date.now() });
  return { ok: true, active: true, sessionNumber: s.sessionNumber };
}

async function actionHeartbeat(db, req, body) {
  const { decoded } = await getCaller(db, req, { needProfile: false });
  const { classId, deviceId } = body;
  if (!validDeviceId(deviceId)) throw fail(400, 'bad-request', 'deviceId مطلوب');

  const devRef = db.collection(DEVICE_COLLECTION).doc(decoded.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(devRef);
    const now = Date.now();
    if (snap.exists) {
      const d = snap.data();
      if (d.deviceId !== deviceId && now - (d.lastSeenMs || 0) < DEVICE_TTL_MS) {
        throw fail(409, 'device-conflict', DEVICE_CONFLICT_MESSAGE);
      }
      tx.update(devRef, { deviceId, lastSeenMs: now });
    } else {
      tx.set(devRef, {
        deviceId,
        classId: validClassId(classId) ? classId : '',
        lastSeenMs: now,
        role: 'student'
      });
    }
  });
  return { ok: true };
}

async function actionRelease(db, req, body) {
  const { decoded } = await getCaller(db, req, { needProfile: false });
  const { deviceId } = body;
  if (!validDeviceId(deviceId)) return { ok: true };
  const devRef = db.collection(DEVICE_COLLECTION).doc(decoded.uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(devRef);
    if (snap.exists && snap.data().deviceId === deviceId) tx.delete(devRef);
  });
  return { ok: true };
}

async function actionJoin(db, req, body) {
  const appId = process.env.JITSI_APP_ID;
  const appSecret = process.env.JITSI_APP_SECRET;
  const domain = process.env.JITSI_DOMAIN || 'meet.194.146.38.131.sslip.io';
  if (!appId || !appSecret) throw fail(500, 'config', 'إعدادات Jitsi غير مكتملة');

  const { decoded, profileDoc, profile } = await getCaller(db, req);
  const { classId, deviceId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const sessionSnap = await db.collection(LIVE_COLLECTION).doc(classId).get();
  const session = sessionSnap.exists ? sessionSnap.data() : null;
  if (!session || !session.active) {
    throw fail(409, 'no-session', 'لا توجد حصة مفتوحة لهذه الشعبة حالياً.');
  }

  const role = profile.role;
  const isModerator = MODERATOR_ROLES.includes(role);
  const isStudent = role === 'student';

  if (isModerator) {
    if (session.teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذه الحصة ليست حصتك.');
  } else if (isStudent) {
    if (profile.isFrozen) throw fail(403, 'frozen', 'حسابك مجمّد، لا يمكنك دخول الحصة.');
    if (!Array.isArray(profile.classIds) || !profile.classIds.includes(classId)) {
      throw fail(403, 'not-in-class', 'أنت غير مسجّل في هذه الشعبة.');
    }
    if (Date.now() - (session.lastPingMs || 0) > VISIBLE_STALE_MS) {
      throw fail(409, 'no-session', 'لا توجد حصة مفتوحة لهذه الشعبة حالياً.');
    }
  } else if (!VIEWER_ROLES.includes(role)) {
    throw fail(403, 'forbidden', 'غير مسموح لهذا الحساب بدخول الحصة.');
  }

  let deviceTracked = false;
  {
    if (!validDeviceId(deviceId)) throw fail(400, 'bad-request', 'deviceId مطلوب');
    const devRef = db.collection(DEVICE_COLLECTION).doc(decoded.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(devRef);
      const now = Date.now();
      if (snap.exists) {
        const d = snap.data();
        if (d.deviceId !== deviceId && now - (d.lastSeenMs || 0) < DEVICE_TTL_MS) {
          throw fail(409, 'device-conflict', DEVICE_CONFLICT_MESSAGE);
        }
      }
      tx.set(devRef, {
        deviceId,
        classId,
        profileId: profileDoc.id,
        role,
        lastSeenMs: now
      });
    });
    deviceTracked = true;
  }

  // ترتيب الدخول داخل هذه الحصة: الأول يأخذ 1، ومن يعيد الدخول يحتفظ برقمه
  // المدير (VIEWER_ROLES) لا يُرقَّم ولا يستهلك رقماً
  const numbered = !VIEWER_ROLES.includes(role);
  const sessionRef = db.collection(LIVE_COLLECTION).doc(classId);
  const joinNumber = !numbered ? null : await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const d = snap.exists ? snap.data() : {};
    const existing = d.joinOrder && d.joinOrder[profileDoc.id];
    if (existing) return existing;
    const n = (d.joinCounter || 0) + 1;
    tx.update(
      sessionRef,
      'joinCounter', n,
      new admin.firestore.FieldPath('joinOrder', profileDoc.id), n
    );
    return n;
  });

  const baseName = profile.name || profile.username || 'مشارك';
  // الرقم في بداية الاسم (بخانتين) ليظهر بجانب الاسم ويرتّب القوائم حسب الدخول
  const name = numbered ? `${String(joinNumber).padStart(2, '0')} - ${baseName}` : baseName;
  const roomName = String(session.roomName || '').toLowerCase();
  const avatar = getAvatarUrl(req, role);
  const nowSec = Math.floor(Date.now() / 1000);

  const user = {
    id: profileDoc.id,
    name,
    moderator: isModerator,
    affiliation: isModerator ? 'owner' : 'member'
  };
  if (avatar) user.avatar = avatar;

  const payload = {
    aud: appId,
    iss: appId,
    sub: domain,
    room: roomName,
    nbf: nowSec - 10,
    exp: nowSec + JWT_LIFETIME_SEC,
    context: { user }
  };

  return {
    jwt: signJwt(payload, appSecret),
    name,
    moderator: isModerator,
    roomName,
    avatar,
    className: session.className || '',
    sessionNumber: session.sessionNumber,
    joinNumber,
    deviceTracked
  };
}

// ======================= الضيوف =======================

function generateInviteCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function generateUniqueInviteCode(db) {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const existing = await db.collection(LIVE_COLLECTION)
      .where('inviteCode', '==', code).limit(5).get();
    const hasActive = existing.docs.some((d) => d.data().active === true);
    if (!hasActive) return code;
  }
  throw fail(500, 'server-error', 'تعذر توليد رقم الدعوة، حاول مرة أخرى.');
}

async function actionGetInviteCode(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'غير مسموح');
  const { classId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const ref = db.collection(LIVE_COLLECTION).doc(classId);
  const snap = await ref.get();
  if (!snap.exists || !snap.data().active) throw fail(409, 'no-session', 'لا توجد حصة مفتوحة');
  if (snap.data().teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذه الحصة ليست حصتك');

  if (snap.data().inviteCode) return { ok: true, inviteCode: snap.data().inviteCode };
  const code = await generateUniqueInviteCode(db);
  await ref.update({ inviteCode: code });
  return { ok: true, inviteCode: code };
}

async function actionGuestRequest(db, req, body) {
  const inviteCode = String(body.inviteCode || '').trim();
  const rawName = String(body.name || '').trim();
  if (!inviteCode || inviteCode.length < 4 || inviteCode.length > 20) {
    throw fail(400, 'bad-request', 'رقم الحصة مطلوب');
  }
  if (!rawName || rawName.length < 2 || rawName.length > 50) {
    throw fail(400, 'bad-request', 'الاسم مطلوب (حرفان على الأقل)');
  }

  const sessionSnap = await db.collection(LIVE_COLLECTION)
    .where('inviteCode', '==', inviteCode).limit(5).get();
  const activeDocs = sessionSnap.docs.filter((d) => d.data().active === true);
  if (activeDocs.length === 0) throw fail(404, 'no-session', 'رقم الحصة غير صحيح أو انتهت الحصة');
  const sessionDoc = activeDocs[0];
  const session = sessionDoc.data();
  if (Date.now() - (session.lastPingMs || 0) > VISIBLE_STALE_MS) {
    throw fail(409, 'no-session', 'الحصة غير متاحة حالياً');
  }

  const pollToken = crypto.randomBytes(24).toString('hex');
  const ref = db.collection(GUEST_COLLECTION).doc();
  await ref.set({
    classId: session.classId,
    className: session.className || '',
    sessionNumber: session.sessionNumber,
    roomName: session.roomName,
    inviteCode,
    guestName: rawName.slice(0, 50),
    status: 'pending',
    pollToken,
    teacherId: session.teacherId,
    createdAtMs: Date.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    respondedAtMs: null
  });
  return { ok: true, requestId: ref.id, pollToken, className: session.className || '' };
}

async function actionGuestStatus(db, req, body) {
  const { requestId, pollToken } = body;
  if (!requestId || !pollToken) throw fail(400, 'bad-request', 'مطلوب');
  const snap = await db.collection(GUEST_COLLECTION).doc(requestId).get();
  if (!snap.exists) throw fail(404, 'not-found', 'الطلب غير موجود');
  const d = snap.data();
  if (d.pollToken !== pollToken) throw fail(403, 'forbidden', 'غير مصرح');
  const sessionSnap = await db.collection(LIVE_COLLECTION).doc(d.classId).get();
  const active = !!(sessionSnap.exists && sessionSnap.data().active
    && sessionSnap.data().sessionNumber === d.sessionNumber);
  return { ok: true, status: d.status, active };
}

async function actionGuestJoin(db, req, body) {
  const appId = process.env.JITSI_APP_ID;
  const appSecret = process.env.JITSI_APP_SECRET;
  const domain = process.env.JITSI_DOMAIN || 'meet.194.146.38.131.sslip.io';
  if (!appId || !appSecret) throw fail(500, 'config', 'إعدادات Jitsi غير مكتملة');

  const { requestId, pollToken } = body;
  const snap = await db.collection(GUEST_COLLECTION).doc(requestId).get();
  if (!snap.exists) throw fail(404, 'not-found', 'الطلب غير موجود');
  const g = snap.data();
  if (g.pollToken !== pollToken) throw fail(403, 'forbidden', 'غير مصرح');
  if (g.status !== 'approved') throw fail(409, 'not-approved', 'لم تتم الموافقة بعد');

  const sessionSnap = await db.collection(LIVE_COLLECTION).doc(g.classId).get();
  if (!sessionSnap.exists) throw fail(409, 'no-session', 'انتهت الحصة');
  const s = sessionSnap.data();
  if (!s.active || s.sessionNumber !== g.sessionNumber) throw fail(409, 'no-session', 'انتهت الحصة');
  if (Date.now() - (s.lastPingMs || 0) > VISIBLE_STALE_MS) throw fail(409, 'no-session', 'الحصة غير متاحة');

  const origin = getOrigin(req);
  const avatar = origin ? `${origin}/images/${encodeURIComponent(GUEST_AVATAR_FILE)}` : '';
  const nowSec = Math.floor(Date.now() / 1000);

  const user = {
    id: `guest-${requestId.slice(0, 12)}`,
    name: g.guestName,
    moderator: false,
    affiliation: 'member'
  };
  if (avatar) user.avatar = avatar;

  const payload = {
    aud: appId, iss: appId, sub: domain,
    room: String(s.roomName || '').toLowerCase(),
    nbf: nowSec - 10, exp: nowSec + JWT_LIFETIME_SEC,
    context: { user }
  };

  return {
    ok: true,
    jwt: signJwt(payload, appSecret),
    name: g.guestName,
    roomName: s.roomName,
    avatar,
    className: s.className || '',
    sessionNumber: s.sessionNumber,
    isGuest: true
  };
}

async function actionGuestList(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'غير مسموح');
  const { classId } = body;
  if (!validClassId(classId)) throw fail(400, 'bad-request', 'classId مطلوب');

  const snap = await db.collection(GUEST_COLLECTION).where('classId', '==', classId).get();
  const requests = snap.docs
    .filter((d) => d.data().status === 'pending' && d.data().teacherId === profileDoc.id)
    .map((d) => ({ id: d.id, guestName: d.data().guestName, createdAtMs: d.data().createdAtMs }))
    .filter((r) => r.createdAtMs && Date.now() - r.createdAtMs < 10 * 60 * 1000)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  return { ok: true, requests };
}

async function actionGuestRespond(db, req, body) {
  const { profileDoc, profile } = await getCaller(db, req);
  if (profile.role !== 'teacher') throw fail(403, 'forbidden', 'غير مسموح');
  const { requestId, approve } = body;
  if (!requestId) throw fail(400, 'bad-request', 'requestId مطلوب');
  const ref = db.collection(GUEST_COLLECTION).doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw fail(404, 'not-found', 'الطلب غير موجود');
  const d = snap.data();
  if (d.teacherId !== profileDoc.id) throw fail(403, 'forbidden', 'هذا الطلب ليس لشعبتك');
  if (d.status !== 'pending') return { ok: true, status: d.status };
  const status = approve ? 'approved' : 'rejected';
  await ref.update({
    status,
    respondedAtMs: Date.now(),
    respondedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, status };
}

// ======================= Handler =======================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!admin.apps.length) return res.status(500).json({ error: 'Firebase Admin غير مهيأ في السيرفر' });
    const db = admin.firestore();
    const body = req.body || {};
    const action = body.action || 'join';

    let result;
    switch (action) {
      case 'join': result = await actionJoin(db, req, body); break;
      case 'start': result = await actionStart(db, req, body); break;
      case 'end': result = await actionEnd(db, req, body); break;
      case 'ping': result = await actionPing(db, req, body); break;
      case 'heartbeat': result = await actionHeartbeat(db, req, body); break;
      case 'release': result = await actionRelease(db, req, body); break;
      case 'get-invite-code': result = await actionGetInviteCode(db, req, body); break;
      case 'guest-request': result = await actionGuestRequest(db, req, body); break;
      case 'guest-status': result = await actionGuestStatus(db, req, body); break;
      case 'guest-join': result = await actionGuestJoin(db, req, body); break;
      case 'guest-list': result = await actionGuestList(db, req, body); break;
      case 'guest-respond': result = await actionGuestRespond(db, req, body); break;
      default: throw fail(400, 'bad-action', 'إجراء غير معروف');
    }
    return res.status(200).json(result);
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('jitsi-token error:', err);
    return res.status(500).json({ error: err.message || 'خطأ غير معروف', code: 'server-error' });
  }
}