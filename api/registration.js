// api/registration.js
// ============================================================
//  نظام التسجيل الفردي عبر الروابط — كل المنطق الحساس هنا (السيرفر)
//
//  عام (بدون تسجيل دخول):
//    action = 'info'    → جلب الشعب المتاحة لرابط معيّن
//    action = 'submit'  → تقديم طلب تسجيل
//
//  للمشرفين (Authorization: Bearer <idToken>):
//    action = 'list' | 'claim' | 'contacted' | 'decide' | 'noreply' | 'readd'
//
//  للتنظيف التلقائي (خدمة cron خارجية):
//    action = 'cron'   + ترويسة x-cron-secret
// ============================================================
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

const REQ = 'registrationRequests';
const LINKS = 'registrationLinks';
const MSG = 'messageRequests';

const MAX_OPEN = 10;                 // الحد الأقصى للطلبات المفتوحة لكل مشرفة/مشرف
const NO_REPLY_AFTER_MS = 48 * 3600 * 1000;      // زر "لا يوجد رد" بعد 48 ساعة من الرسالة
const SUSPENDED_TTL_MS = 15 * 24 * 3600 * 1000;  // المعلّقة 15 يوم ثم حذف
const CLAIM_IDLE_MS = 3 * 24 * 3600 * 1000;      // استلمت ولم تتواصل خلال 3 أيام → يرجع للجميع
const CONTACTED_IDLE_MS = 7 * 24 * 3600 * 1000;  // تواصلت ولم تقرر خلال 7 أيام → معلّقة
const RATE_MAX_PER_HOUR = 5;                     // أقصى عدد طلبات من نفس الجهاز بالساعة
const MAX_AGE_ALLOWED = 100;
const MIN_AGE_ALLOWED = 3;

const fail = (res, code, msg) => res.status(code).json({ error: msg });
const tsMs = (t) => (t && t.toMillis ? t.toMillis() : (t && t.seconds ? t.seconds * 1000 : 0));

const toLatinDigits = (s) =>
  String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

const cleanText = (s, max) =>
  String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

const normalizePhone = (raw) => {
  let c = toLatinDigits(raw).replace(/[^\d]/g, '');
  if (c.startsWith('00')) c = c.substring(2);
  if (!c || c.startsWith('0')) return null;
  if (c.length < 10 || c.length > 15) return null;
  return c;
};

// ---------- الأقسام (مع كاش قصير) ----------
let _secCache = null;
let _secAt = 0;
const loadSections = async (db) => {
  if (_secCache && Date.now() - _secAt < 60 * 1000) return _secCache;
  const snap = await db.collection('sections').get();
  _secCache = snap.docs.map(d => ({ id: d.id, name: d.data().name || '', parentId: d.data().parentId || null }));
  _secAt = Date.now();
  return _secCache;
};
const descendantIds = (sections, id) => {
  const out = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    sections.forEach(s => { if (s.parentId === cur) { out.push(s.id); stack.push(s.id); } });
  }
  return out;
};
const sectionPath = (sections, id) => {
  const parts = [];
  let cur = sections.find(s => s.id === id);
  let guard = 0;
  while (cur && guard < 30) {
    parts.unshift(cur.name);
    cur = cur.parentId ? sections.find(s => s.id === cur.parentId) : null;
    guard++;
  }
  return parts.join(' / ');
};

// ---------- الشعب المتاحة لرابط ----------
const resolveLinkClasses = async (db, link) => {
  const ids = Array.isArray(link.targetIds) ? link.targetIds.slice(0, 200) : [];
  let classDocs = [];
  if (link.type === 'classes') {
    if (ids.length === 0) return [];
    const refs = ids.map(id => db.collection('classes').doc(id));
    const snaps = await db.getAll(...refs);
    classDocs = snaps.filter(s => s.exists);
  } else {
    const sections = await loadSections(db);
    const all = new Set();
    ids.forEach(id => { all.add(id); descendantIds(sections, id).forEach(x => all.add(x)); });
    const list = [...all];
    for (let i = 0; i < list.length; i += 30) {
      const chunk = list.slice(i, i + 30);
      const snap = await db.collection('classes').where('sectionId', 'in', chunk).get();
      classDocs.push(...snap.docs);
    }
  }
  const sections = await loadSections(db);
  return classDocs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.sectionId)
    .map(c => ({
      id: c.id,
      name: c.name || '',
      gender: c.gender || 'mixed',
      sectionId: c.sectionId,
      path: sectionPath(sections, c.sectionId)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
};

const getValidLink = async (db, token) => {
  if (typeof token !== 'string' || !/^[A-Za-z0-9]{24,64}$/.test(token)) return null;
  const snap = await db.collection(LINKS).doc(token).get();
  if (!snap.exists) return null;
  const link = snap.data();
  if (!link.active) return null;
  if (link.expiresAt && tsMs(link.expiresAt) <= Date.now()) return null;
  return { id: snap.id, ...link };
};

// ---------- الأهلية (نفس منطق التطبيق) ----------
const checkEligibility = (gender, age, classGender) => {
  if (classGender === 'male' && gender !== 'ذكر') return 'هذه الشعبة مخصصة للذكور فقط';
  if (classGender === 'female' && gender !== 'أنثى') return 'هذه الشعبة مخصصة للإناث فقط';
  if (classGender === 'mixed' && gender === 'ذكر' && age > 12) return 'الشعبة المختلطة لا تقبل الذكور فوق 12 عاماً';
  return null;
};

// ---------- المحدّد: لمن يذهب الطلب وهل يلزم تحقق؟ ----------
const routeFor = (gender, classGender) => {
  if (classGender === 'female') return { supervisorGender: 'أنثى', kind: 'voice' };
  if (classGender === 'male') return { supervisorGender: 'ذكر', kind: 'none' };
  // مختلطة: للمشرفات فقط
  return { supervisorGender: 'أنثى', kind: gender === 'ذكر' ? 'parent' : 'none' };
};

// ---------- حد الطلبات لكل جهاز ----------
const hitRateLimit = async (db, req) => {
  const fwd = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const salt = process.env.CRON_SECRET || 'rr';
  const h = crypto.createHash('sha256').update(fwd + salt).digest('hex').slice(0, 32);
  const hourKey = Math.floor(Date.now() / 3600000);
  const ref = db.collection('rateLimits').doc(`reg_${h}_${hourKey}`);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const n = s.exists ? (s.data().n || 0) : 0;
    if (n >= RATE_MAX_PER_HOUR) return true;
    tx.set(ref, { n: n + 1, expireAt: new Date(Date.now() + 3 * 3600000) });
    return false;
  });
};

const nextRequestNumber = async (db) => {
  const ref = db.collection('settings').doc('registrationCounter');
  let num = 100000;
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    num = s.exists ? (s.data().last || 100000) + 1 : 100001;
    tx.set(ref, { last: num }, { merge: true });
  });
  return String(num);
};

// ---------- هوية المشرف ----------
const authSupervisor = async (req) => {
  const idToken = String(req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!idToken) return null;
  const decoded = await admin.auth().verifyIdToken(idToken);
  const q = await admin.firestore().collection('profiles').where('uid', '==', decoded.uid).limit(1).get();
  if (q.empty) return null;
  const p = q.docs[0].data();
  if (p.role !== 'supervisor') return null;
  if (p.isFrozen) return null;
  return { id: q.docs[0].id, uid: decoded.uid, ...p };
};

const createMessageRequest = (db, data) =>
  db.collection(MSG).add({
    ...data,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    processedAt: null,
    processedBy: null,
    rejectionReason: null
  });

const publicReq = (id, r, withContact) => ({
  id,
  requestNumber: r.requestNumber,
  className: r.className,
  kind: r.kind,
  status: r.status,
  createdAt: tsMs(r.createdAt),
  claimedAt: tsMs(r.claimedAt),
  messageSentAt: tsMs(r.messageSentAt),
  suspendedAt: tsMs(r.suspendedAt),
  ...(withContact ? {
    name: r.name, age: r.age, gender: r.gender, phone: r.phone
  } : {})
});

// ============================================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!admin.apps.length) return fail(res, 500, 'الخادم غير مهيأ');

  const db = admin.firestore();
  const FV = admin.firestore.FieldValue;
  const body = (req.method === 'POST' ? req.body : req.query) || {};
  const action = String(body.action || '');

  try {
    // ================= التنظيف التلقائي =================
    if (action === 'cron') {
      const secret = req.headers['x-cron-secret'];
      if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return fail(res, 401, 'Unauthorized');

      const now = Date.now();
      const out = { deleted: 0, released: 0, suspended: 0 };

      const susp = await db.collection(REQ).where('status', '==', 'suspended').get();
      for (const d of susp.docs) {
        const r = d.data();
        if (now - tsMs(r.suspendedAt) < SUSPENDED_TTL_MS) continue;
        await createMessageRequest(db, {
          type: 'registration_deleted',
          targetType: 'student', targetId: '',
          targetName: r.name || '', targetPhone: r.phone || '', targetClass: r.className || '',
          requestedBy: r.claimedBy || '', requestedByName: r.claimedByName || 'مشرف',
          payload: { requestNumber: r.requestNumber, supervisorPhone: r.claimedByPhone || '' }
        });
        await d.ref.delete();
        out.deleted++;
      }

      const claimed = await db.collection(REQ).where('status', '==', 'claimed').get();
      for (const d of claimed.docs) {
        const r = d.data();
        if (!r.messageSentAt) {
          if (now - tsMs(r.claimedAt) >= CLAIM_IDLE_MS) {
            await d.ref.update({ status: 'pending', claimedBy: null, claimedByName: null, claimedByPhone: null, claimedAt: null });
            out.released++;
          }
        } else if (now - tsMs(r.messageSentAt) >= CONTACTED_IDLE_MS) {
          await d.ref.update({ status: 'suspended', suspendedAt: FV.serverTimestamp() });
          out.suspended++;
        }
      }

      // تعطيل الروابط المنتهية
      const links = await db.collection(LINKS).where('active', '==', true).get();
      for (const d of links.docs) {
        const l = d.data();
        if (l.expiresAt && tsMs(l.expiresAt) <= now) await d.ref.update({ active: false });
      }

      // حذف سجلات حد الطلبات القديمة
      const old = await db.collection('rateLimits').where('expireAt', '<=', new Date()).limit(300).get();
      if (!old.empty) {
        const b = db.batch();
        old.docs.forEach(x => b.delete(x.ref));
        await b.commit();
      }
      return res.status(200).json({ ok: true, ...out });
    }

    if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

    // ================= عام: معلومات الرابط =================
    if (action === 'info') {
      const link = await getValidLink(db, body.token);
      if (!link) return fail(res, 404, 'الرابط غير صالح أو منتهي الصلاحية');
      const classes = await resolveLinkClasses(db, link);
      if (classes.length === 0) return fail(res, 404, 'لا توجد شعب متاحة في هذا الرابط حالياً');
      return res.status(200).json({
        ok: true,
        classes: classes.map(c => ({ id: c.id, name: c.name, gender: c.gender, path: c.path }))
      });
    }

    // ================= عام: تقديم طلب =================
    if (action === 'submit') {
      // فخ للروبوتات: حقل مخفي يجب أن يبقى فارغاً
      if (body.website) return res.status(200).json({ ok: true, requestNumber: '000000' });

      const link = await getValidLink(db, body.token);
      if (!link) return fail(res, 404, 'الرابط غير صالح أو منتهي الصلاحية');

      const name = cleanText(body.name, 60);
      const gender = body.gender === 'ذكر' || body.gender === 'أنثى' ? body.gender : '';
      const age = parseInt(toLatinDigits(body.age), 10);
      const phone = normalizePhone(body.phone);
      const classId = String(body.classId || '');

      if (name.length < 3 || name.split(' ').length < 2) return fail(res, 400, 'يرجى كتابة الاسم الكامل (اسمان على الأقل)');
      if (!gender) return fail(res, 400, 'يرجى اختيار الجنس');
      if (!Number.isFinite(age) || age < MIN_AGE_ALLOWED || age > MAX_AGE_ALLOWED) return fail(res, 400, 'العمر غير صحيح');
      if (!phone) return fail(res, 400, 'أدخل رقم الهاتف مع رمز الدولة بدون صفر بادئ (10 إلى 15 رقماً)');

      const classes = await resolveLinkClasses(db, link);
      const cls = classes.find(c => c.id === classId);
      if (!cls) return fail(res, 400, 'الشعبة المختارة غير متاحة في هذا الرابط');

      const eligErr = checkEligibility(gender, age, cls.gender);
      if (eligErr) return fail(res, 400, eligErr);

      // القائمة السوداء (رسالة عامة بدون كشف التفاصيل)
      const bl = await db.collection('blacklist').where('phone', '==', phone).get();
      const blocked = bl.docs.some(d => {
        const e = d.data().expiresAt;
        return !e || tsMs(e) > Date.now();
      });
      if (blocked) return fail(res, 403, 'تعذّر قبول الطلب. للاستفسار تواصل على رقم الإبلاغ: +962 7 8611 7388');

      // منع التكرار
      const dup = await db.collection(REQ).where('phone', '==', phone).limit(1).get();
      if (!dup.empty) return fail(res, 409, 'يوجد طلب سابق بنفس رقم الهاتف قيد المراجعة. يرجى الانتظار.');

      if (await hitRateLimit(db, req)) return fail(res, 429, 'محاولات كثيرة. يرجى المحاولة لاحقاً.');

      const route = routeFor(gender, cls.gender);
      const requestNumber = await nextRequestNumber(db);

      await db.collection(REQ).add({
        requestNumber,
        name, age, gender, phone,
        classId: cls.id,
        className: cls.name,
        classGender: cls.gender,
        linkId: link.id,
        kind: route.kind,
        supervisorGender: route.supervisorGender,
        status: 'pending',
        claimedBy: null, claimedByName: null, claimedByPhone: null, claimedAt: null,
        messageSentAt: null, suspendedAt: null,
        createdAt: FV.serverTimestamp()
      });
      return res.status(200).json({ ok: true, requestNumber });
    }

    // ================= المشرفون =================
    const sup = await authSupervisor(req);
    if (!sup) return fail(res, 403, 'غير مصرح');

    if (action === 'list') {
      const [mineSnap, availSnap] = await Promise.all([
        db.collection(REQ).where('claimedBy', '==', sup.id).get(),
        db.collection(REQ).where('status', '==', 'pending').where('supervisorGender', '==', sup.gender || '').limit(100).get()
      ]);
      const mine = mineSnap.docs.map(d => publicReq(d.id, d.data(), true));
      const open = mine.filter(r => r.status === 'claimed').sort((a, b) => a.claimedAt - b.claimedAt);
      const suspended = mine.filter(r => r.status === 'suspended').sort((a, b) => a.suspendedAt - b.suspendedAt);
      const available = availSnap.docs
        .map(d => publicReq(d.id, d.data(), false))
        .sort((a, b) => a.createdAt - b.createdAt);
      return res.status(200).json({ ok: true, open, suspended, available, max: MAX_OPEN, suspendedDays: 15, noReplyHours: 48 });
    }

    const id = String(body.id || '');
    if (!id) return fail(res, 400, 'id مطلوب');
    const ref = db.collection(REQ).doc(id);

    if (action === 'claim') {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('الطلب غير موجود أو تم استلامه من مشرفة أخرى');
        const r = snap.data();
        if (r.status !== 'pending') throw new Error('تم استلام هذا الطلب من مشرف آخر');
        if (r.supervisorGender !== sup.gender) throw new Error('هذا الطلب غير متاح لك');
        const openSnap = await tx.get(db.collection(REQ).where('claimedBy', '==', sup.id).where('status', '==', 'claimed'));
        if (openSnap.size >= MAX_OPEN) throw new Error(`وصلت للحد الأقصى (${MAX_OPEN} طلبات مفتوحة). أنهِ بعضها أولاً.`);
        tx.update(ref, {
          status: 'claimed',
          claimedBy: sup.id,
          claimedByName: sup.name || sup.username || 'مشرف',
          claimedByPhone: sup.phone || '',
          claimedAt: FV.serverTimestamp(),
          messageSentAt: null
        });
      });
      return res.status(200).json({ ok: true });
    }

    // باقي الإجراءات تتطلب أن الطلب لهذا المشرف
    const snap = await ref.get();
    if (!snap.exists) return fail(res, 404, 'الطلب غير موجود');
    const r = snap.data();
    if (r.claimedBy !== sup.id) return fail(res, 403, 'هذا الطلب ليس لك');

    if (action === 'contacted') {
      if (r.status !== 'claimed') return fail(res, 400, 'حالة الطلب لا تسمح');
      if (!r.messageSentAt) await ref.update({ messageSentAt: FV.serverTimestamp() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'noreply') {
      if (r.status !== 'claimed') return fail(res, 400, 'حالة الطلب لا تسمح');
      if (!r.messageSentAt) return fail(res, 400, 'لم تُرسَل رسالة تواصل بعد');
      if (Date.now() - tsMs(r.messageSentAt) < NO_REPLY_AFTER_MS) {
        return fail(res, 400, 'الزر يتفعّل بعد 48 ساعة من إرسال الرسالة');
      }
      await ref.update({ status: 'suspended', suspendedAt: FV.serverTimestamp() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'readd') {
      if (r.status !== 'suspended') return fail(res, 400, 'الطلب ليس في المعلّقة');
      await db.runTransaction(async (tx) => {
        const openSnap = await tx.get(db.collection(REQ).where('claimedBy', '==', sup.id).where('status', '==', 'claimed'));
        if (openSnap.size >= MAX_OPEN) throw new Error(`وصلت للحد الأقصى (${MAX_OPEN} طلبات مفتوحة).`);
        tx.update(ref, { status: 'claimed', claimedAt: FV.serverTimestamp(), messageSentAt: null, suspendedAt: null });
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'decide') {
      if (r.status !== 'claimed') return fail(res, 400, 'حالة الطلب لا تسمح');
      const decision = body.decision;

      // ---------- رفض ----------
      if (decision === 'reject') {
        const reason = cleanText(body.reason, 300);
        if (!reason) return fail(res, 400, 'سبب الرفض مطلوب');
        await createMessageRequest(db, {
          type: 'registration_rejected',
          targetType: 'student', targetId: '',
          targetName: r.name, targetPhone: r.phone, targetClass: r.className,
          requestedBy: sup.id, requestedByName: sup.name || sup.username || 'مشرف',
          payload: { requestNumber: r.requestNumber, reason, age: r.age, gender: r.gender }
        });
        await ref.delete();
        return res.status(200).json({ ok: true });
      }

      // ---------- موافقة ----------
      if (decision !== 'approve') return fail(res, 400, 'قرار غير معروف');
      if ((r.kind === 'voice' || r.kind === 'parent') && !r.messageSentAt) {
        return fail(res, 400, 'يجب التواصل مع الطالب أولاً (زر تواصل مع الطالب) قبل الموافقة');
      }

      const classSnap = await db.collection('classes').doc(r.classId).get();
      if (!classSnap.exists) return fail(res, 400, 'الشعبة لم تعد موجودة. ارفض الطلب مع ذكر السبب.');
      const eligErr = checkEligibility(r.gender, r.age, classSnap.data().gender || 'mixed');
      if (eligErr) return fail(res, 400, eligErr + ' (تغيّرت إعدادات الشعبة). ارفض الطلب.');

      const bl = await db.collection('blacklist').where('phone', '==', r.phone).get();
      if (bl.docs.some(d => !d.data().expiresAt || tsMs(d.data().expiresAt) > Date.now())) {
        return fail(res, 403, 'رقم الهاتف في القائمة السوداء. ارفض الطلب.');
      }

      // أرقام التسلسل
      let startNum = 1;
      await db.runTransaction(async (tx) => {
        const c = db.collection('settings').doc('userCounter');
        const s = await tx.get(c);
        startNum = s.exists ? (s.data().lastStudentNumber || 0) + 1 : 1;
        tx.set(c, { lastStudentNumber: startNum }, { merge: true });
      });
      let serialNum = 1;
      await db.runTransaction(async (tx) => {
        const c = db.collection('settings').doc('studentSerialCounter');
        const s = await tx.get(c);
        serialNum = s.exists ? (s.data().lastSerial || 0) + 1 : 1;
        tx.set(c, { lastSerial: serialNum }, { merge: true });
      });
      const serialNumber = serialNum < 1000000 ? String(serialNum).padStart(6, '0') : String(serialNum);

      const password = String(crypto.randomInt(0, 1000000000)).padStart(9, '0');
      let num = startNum;
      let username = `knight${num}`;
      let email = `${username}@readandrise.com`;
      let userRecord = null;
      for (let i = 0; i < 10 && !userRecord; i++) {
        try {
          userRecord = await admin.auth().createUser({ email, password });
        } catch (e) {
          if (e.code === 'auth/email-already-exists') {
            num++;
            username = `knight${num}`;
            email = `${username}@readandrise.com`;
          } else throw e;
        }
      }
      if (!userRecord) return fail(res, 500, 'تعذر إيجاد اسم مستخدم فريد');

      const profileId = crypto.randomUUID();
      try {
        await db.collection('profiles').doc(profileId).set({
          email, username, name: r.name, gender: r.gender, age: r.age, phone: r.phone,
          classIds: [r.classId], role: 'student', serialNumber, country: '',
          isFrozen: false, infoVerified: false, isProfileComplete: false,
          pendingChanges: null, pendingChangesStatus: null,
          reviewResult: null, reviewExpiry: null, warnings: [],
          registeredVia: 'link',
          createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
          uid: userRecord.uid
        });
        await createMessageRequest(db, {
          type: 'registration_approved',
          targetType: 'student', targetId: profileId,
          targetName: r.name, targetPhone: r.phone, targetClass: r.className,
          requestedBy: sup.id, requestedByName: sup.name || sup.username || 'مشرف',
          payload: {
            requestNumber: r.requestNumber, username, password, serialNumber,
            age: r.age, gender: r.gender
          }
        });
      } catch (e) {
        // تراجع: لا نترك حساباً يتيماً
        try { await admin.auth().deleteUser(userRecord.uid); } catch (_) { /* ignore */ }
        try { await db.collection('profiles').doc(profileId).delete(); } catch (_) { /* ignore */ }
        throw e;
      }
      await ref.delete();
      return res.status(200).json({ ok: true, serialNumber });
    }

    return fail(res, 400, 'إجراء غير معروف');
  } catch (err) {
    console.error('registration error:', err);
    return fail(res, 500, err.message || 'خطأ غير معروف');
  }
}