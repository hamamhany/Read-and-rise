// api/cron-absence.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (serviceAccount.project_id) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } catch (e) { console.error(e.message); }
}

const ABSENCE_WARNING_THRESHOLD = 10;
const ABSENCE_FREEZE_THRESHOLD = 13;
const DELETE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;       // 7 أيام
const BLACKLIST_MS = 180 * 24 * 60 * 60 * 1000;         // 6 أشهر
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function countLessonsBetween(startMs, endMs, lessonTimes) {
  if (!lessonTimes || lessonTimes.length === 0) return 0;
  if (endMs <= startMs) return 0;
  let count = 0;
  for (const lt of lessonTimes) {
    if (!lt || !lt.time) continue;
    if (lt.type === 'once') {
      const d = new Date(lt.date);
      if (isNaN(d.getTime())) continue;
      d.setHours(lt.time.hours, lt.time.minutes, 0, 0);
      if (d.getTime() > startMs && d.getTime() <= endMs) count++;
    } else if (lt.type === 'recurring') {
      const dayIndex = days.indexOf(lt.day);
      if (dayIndex === -1) continue;
      let cur = new Date(startMs);
      cur.setHours(0,0,0,0);
      const endDay = new Date(endMs);
      while (cur <= endDay) {
        if (cur.getDay() === dayIndex) {
          const t = new Date(cur);
          t.setHours(lt.time.hours, lt.time.minutes, 0, 0);
          if (t.getTime() > startMs && t.getTime() <= endMs) count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else if (lt.type === 'monthly') {
      const md = parseInt(lt.monthDay);
      if (!md) continue;
      let cur = new Date(startMs);
      cur.setDate(1);
      const endDay = new Date(endMs);
      while (cur <= endDay) {
        const t = new Date(cur.getFullYear(), cur.getMonth(), md, lt.time.hours, lt.time.minutes, 0, 0);
        if (t.getTime() > startMs && t.getTime() <= endMs) count++;
        cur.setMonth(cur.getMonth() + 1);
      }
    }
  }
  return count;
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Firebase Admin not configured' });
  }

  const db = admin.firestore();
  const results = { checked: 0, warned: 0, frozen: 0, deleted: 0, blacklistRemoved: 0, errors: [] };

  try {
    // 1. جلب كل مواعيد الحصص من كل المعلمين
    const teachersSnap = await db.collection('teachers').get();
    const allLessonTimes = [];
    teachersSnap.forEach(d => {
      (d.data().lessonTimes || []).forEach(t => allLessonTimes.push(t));
    });

    // 2. جلب أسماء الشعب
    const classesSnap = await db.collection('classes').get();
    const classMap = {};
    classesSnap.forEach(d => { classMap[d.id] = d.data().name; });

    const now = Date.now();

    // 3. تنظيف القائمة السوداء المنتهية
    const blacklistSnap = await db.collection('blacklist').get();
    const expiredRefs = [];
    blacklistSnap.forEach(d => {
      const data = d.data();
      if (data.expiresAt) {
        const exp = data.expiresAt.toDate?.() || new Date(data.expiresAt);
        if (exp.getTime() <= now) expiredRefs.push(d.ref);
      }
    });
    if (expiredRefs.length > 0) {
      const b = db.batch();
      expiredRefs.forEach(ref => b.delete(ref));
      await b.commit();
      results.blacklistRemoved = expiredRefs.length;
    }

    // 4. معالجة كل الطلاب
    const studentsSnap = await db.collection('profiles').where('role', '==', 'student').get();

    for (const studentDoc of studentsSnap.docs) {
      results.checked++;
      const data = studentDoc.data();
      const studentName = data.name || '';
      const studentPhone = data.phone || '';
      const studentClass = (data.classIds || []).map(id => classMap[id]).filter(Boolean).join(', ') || 'غير محدد';

      // 4a. الطلاب المجمدون — التحقق من مهلة الحذف
      if (data.isFrozen && data.frozenAt) {
        const frozenAt = data.frozenAt.toDate?.() || new Date(data.frozenAt);
        if (now - frozenAt.getTime() >= DELETE_AFTER_MS) {
          try {
            // رسالة الحذف
            await db.collection('messageRequests').add({
              type: 'auto_delete',
              targetType: 'student',
              targetId: studentDoc.id,
              targetName: studentName,
              targetPhone: studentPhone,
              targetClass: studentClass,
              requestedBy: 'system',
              requestedByName: 'النظام التلقائي',
              payload: { autoDelete: true },
              status: 'pending',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // إضافة للقائمة السوداء 6 أشهر
            if (studentPhone) {
              await db.collection('blacklist').add({
                phone: String(studentPhone).replace(/[^\d]/g, ''),
                reason: 'تجاوز 13 حصة غياب متتالية ولم يراجع الإدارة خلال 7 أيام',
                addedBy: 'system',
                addedByName: 'النظام التلقائي',
                addedAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromMillis(now + BLACKLIST_MS)
              });
            }

            // حذف الإشعارات
            const notifSnap = await studentDoc.ref.collection('userNotifications').get();
            const nb = db.batch();
            notifSnap.docs.forEach(d => nb.delete(d.ref));
            if (!notifSnap.empty) await nb.commit();

            // حذف الملف
            await studentDoc.ref.delete();

            // حذف Auth
            if (data.uid) {
              try { await admin.auth().deleteUser(data.uid); } catch (e) { /* ignore */ }
            }
            results.deleted++;
          } catch (e) {
            results.errors.push({ student: studentDoc.id, error: e.message });
          }
        }
        continue;
      }

      // 4b. الطلاب غير المجمدين — حساب الغياب
      const lastAtt = data.lastAttendanceAt?.toDate?.() || null;
      if (!lastAtt) {
        await studentDoc.ref.update({
          lastAttendanceAt: admin.firestore.FieldValue.serverTimestamp(),
          consecutiveAbsences: 0
        });
        continue;
      }

      const absences = countLessonsBetween(lastAtt.getTime(), now, allLessonTimes);
      const updates = { consecutiveAbsences: absences };

      if (absences >= ABSENCE_WARNING_THRESHOLD && !data.absenceWarningSent) {
        updates.absenceWarningSent = true;
        updates.absenceWarningAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('messageRequests').add({
          type: 'absence_warning',
          targetType: 'student',
          targetId: studentDoc.id,
          targetName: studentName,
          targetPhone: studentPhone,
          targetClass: studentClass,
          requestedBy: 'system',
          requestedByName: 'النظام التلقائي',
          payload: { absenceCount: absences },
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        results.warned++;
      }

      if (absences >= ABSENCE_FREEZE_THRESHOLD) {
        updates.isFrozen = true;
        updates.frozenAt = admin.firestore.FieldValue.serverTimestamp();
        updates.freezeReason = 'تجاوز 13 حصة غياب متتالية';
        await db.collection('messageRequests').add({
          type: 'auto_freeze',
          targetType: 'student',
          targetId: studentDoc.id,
          targetName: studentName,
          targetPhone: studentPhone,
          targetClass: studentClass,
          requestedBy: 'system',
          requestedByName: 'النظام التلقائي',
          payload: { autoFreeze: true, absenceCount: absences },
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        results.frozen++;
      }

      await studentDoc.ref.update(updates);
    }

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}