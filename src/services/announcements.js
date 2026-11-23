import { db } from '../firebase';
import {
  collection, collectionGroup, addDoc, doc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, getDoc, getDocs, query, where
} from 'firebase/firestore';
import { sanitizeInput } from '../utils/helpers';
import {
  ANNOUNCEMENT_AUDIENCE,
  ANNOUNCEMENT_AUDIENCE_LABELS
} from '../constants';
import {
  sendNotificationToAllStudents,
  sendNotificationToAllTeachers,
  sendNotificationToAllSupervisors,
  sendNotificationToStudents,
  sendNotificationToAllUsers,
  sendNotificationToTeacher,
  notifySystemManagers
} from '../utils/notifications';

/**
 * ✅ إنشاء إعلان عام (السلوك القديم محفوظ — بانتظار موافقة المدير)
 */
export const createGeneralAnnouncement = async (title, body, scheduledFor = null, requestedBy = '', requestedByName = '') => {
  try {
    const announcement = {
      title: sanitizeInput(title),
      body: sanitizeInput(body),
      createdAt: serverTimestamp(),
      scheduledFor: scheduledFor || null,
      status: 'pending_approval',
      requestedBy,
      requestedByName,
      approvedAt: null,
      approvedBy: null,
      approvedByName: null,
      updatedAt: serverTimestamp()
    };
    const docRef = await addDoc(collection(db, 'announcements'), announcement);
    return docRef.id;
  } catch (err) {
    console.error('Error creating announcement:', err);
    throw err;
  }
};

/**
 * ✅ فحص المحتوى عبر سند قبل الإرسال
 * يعيد { safe, reason, confidence, error? }
 * - إذا فشل الاتصال → error:true (يتحول للمراجعة اليدوية تلقائياً)
 */
export const moderateAnnouncementContent = async (title, body) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'moderation', title: title || '', body: body || '' })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || typeof data.safe !== 'boolean') {
      return { safe: false, reason: data?.error || 'تعذر الفحص التلقائي', confidence: 0, error: true };
    }
    return {
      safe: data.safe,
      reason: data.reason || '',
      confidence: Number(data.confidence) || 0
    };
  } catch (err) {
    console.warn('Sanad moderation failed:', err);
    return { safe: false, reason: 'تعذر الاتصال بسند، سيُراجع يدوياً', confidence: 0, error: true };
  }
};

/**
 * ✅ إنشاء إعلان مستهدف (جديد)
 */
export const createTargetedAnnouncement = async ({
  title,
  body,
  scheduledFor = null,
  requestedBy = '',
  requestedByName = '',
  requestedByRole = 'supervisor',
  audience: audienceInput = ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS,
  targetClassIds: targetClassIdsInput = [],
  moderationResult = { safe: false, reason: 'لم يتم الفحص', confidence: 0, error: true }
}) => {
  const cleanTitle = sanitizeInput(title);
  const cleanBody = sanitizeInput(body);
  if (!cleanTitle || !cleanBody) throw new Error('العنوان والمحتوى مطلوبان');

  let audience = audienceInput;
  let targetClassIds = targetClassIdsInput;

  // المعلم: دائماً لطلاب شعبه فقط، وتُحدَّد الشعب من قاعدة البيانات وليس من الواجهة
  if (requestedByRole === 'teacher') {
    const snap = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', requestedBy)));
    targetClassIds = snap.docs.map(d => d.id);
    if (targetClassIds.length === 0) throw new Error('لا توجد شعب مرتبطة بحسابك');
    audience = ANNOUNCEMENT_AUDIENCE.CLASSES;
  }

  if (audience === ANNOUNCEMENT_AUDIENCE.CLASSES && (!targetClassIds || targetClassIds.length === 0)) {
    throw new Error('اختر شعبة واحدة على الأقل');
  }
  if (audience === ANNOUNCEMENT_AUDIENCE.ALL_SYSTEM && requestedByRole !== 'system_manager') {
    throw new Error('فقط مدير النظام يمكنه إرسال إعلانات لجميع النظام');
  }

  const isAutoApproved = moderationResult.safe === true && !moderationResult.error;
  const isScheduled = !!scheduledFor;

  let status;
  if (isAutoApproved) {
    status = isScheduled ? 'scheduled' : 'active';
  } else {
    status = 'pending_approval';
  }

  const announcement = {
    title: cleanTitle,
    body: cleanBody,
    createdAt: serverTimestamp(),
    scheduledFor: scheduledFor || null,
    status,
    audience,
    audienceLabel: ANNOUNCEMENT_AUDIENCE_LABELS[audience] || audience,
    targetClassIds: audience === ANNOUNCEMENT_AUDIENCE.CLASSES ? targetClassIds : [],
    requestedBy,
    requestedByName,
    requestedByRole,
    moderation: {
      safe: moderationResult.safe === true,
      reason: moderationResult.reason || '',
      confidence: Number(moderationResult.confidence) || 0,
      hadError: !!moderationResult.error,
      checkedAt: serverTimestamp()
    },
    approvedAt: isAutoApproved ? serverTimestamp() : null,
    approvedBy: isAutoApproved ? 'auto-sand' : null,
    approvedByName: isAutoApproved ? 'المراجعة الآلية (سند)' : null,
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'announcements'), announcement);

  const audienceText = ANNOUNCEMENT_AUDIENCE_LABELS[audience] || audience;
  if (isAutoApproved) {
    await notifySystemManagers(
      '📢 إعلان جديد تم إرساله',
      `أرسل ${requestedByName} (${requestedByRole === 'teacher' ? 'معلم' : requestedByRole === 'supervisor' ? 'مشرف' : 'مدير'}) إعلاناً إلى: ${audienceText}\nالعنوان: ${cleanTitle}${isScheduled ? '\n(مجدول للنشر لاحقاً)' : ''}`,
      'announcement_sent',
      docRef.id
    );

    if (!isScheduled) {
      try {
        await publishAnnouncementToAudience(docRef.id, {
          title: cleanTitle,
          body: cleanBody,
          audience,
          targetClassIds
        });
      } catch (pubErr) {
        console.warn('Auto-publish failed, leaving as active:', pubErr);
      }
    }
  } else {
    await notifySystemManagers(
      '⚠️ إعلان بانتظار مراجعتك',
      `${requestedByName} يريد إرسال إعلان إلى: ${audienceText}\nالعنوان: ${cleanTitle}\nسبب الإيقاف: ${moderationResult.reason || 'اشتباه في المحتوى'}`,
      'announcement_pending_review',
      docRef.id
    );
  }

  return {
    id: docRef.id,
    status,
    publishedNow: isAutoApproved && !isScheduled
  };
};

/**
 * ✅ نشر إعلان لجمهوره
 */
export const publishAnnouncementToAudience = async (announcementId, data) => {
  const { title, body, audience, targetClassIds } = data;

  try {
    if (audience === ANNOUNCEMENT_AUDIENCE.ALL_SYSTEM) {
      await sendNotificationToAllUsers(title, body, 'general_announcement', announcementId);
    } else if (audience === ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS) {
      await sendNotificationToAllStudents(title, body, 'general_announcement', announcementId);
    } else if (audience === ANNOUNCEMENT_AUDIENCE.ALL_TEACHERS) {
      await sendNotificationToAllTeachers(title, body, 'general_announcement', announcementId);
    } else if (audience === ANNOUNCEMENT_AUDIENCE.ALL_SUPERVISORS) {
      await sendNotificationToAllSupervisors(title, body, 'general_announcement', announcementId);
    } else if (audience === ANNOUNCEMENT_AUDIENCE.CLASSES) {
      await sendNotificationToStudents(targetClassIds || [], title, body, 'general_announcement', announcementId);
    }
  } catch (err) {
    console.error('Error publishing announcement to audience:', err);
    throw err;
  }
};

/**
 * ✅ اعتماد الإعلان — يستدعى فقط من المدير
 */
export const approveAnnouncement = async (id, approvedBy, approvedByName) => {
  const ref = doc(db, 'announcements', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('الإعلان غير موجود');
  const data = snap.data();
  const newStatus = data.scheduledFor ? 'scheduled' : 'active';
  await updateDoc(ref, {
    status: newStatus,
    approvedAt: serverTimestamp(),
    approvedBy,
    approvedByName,
    updatedAt: serverTimestamp()
  });

  if (!data.scheduledFor) {
    try {
      await publishAnnouncementToAudience(id, {
        title: data.title,
        body: data.body,
        audience: data.audience || ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS,
        targetClassIds: data.targetClassIds || []
      });
      await notifySystemManagers(
        '📢 تم نشر إعلان بعد موافقتك',
        `تم نشر إعلان "${data.title}" إلى: ${data.audienceLabel || 'جميع الطلاب'}`,
        'announcement_published',
        id
      );
    } catch (e) {
      console.warn('publish after approval failed:', e);
    }
  }
};

/**
 * ✅ رفض الإعلان — يُبلَّغ صاحب الإعلان بالسبب ثم يُحذف الإعلان نهائياً من السيرفر (توفيراً للمساحة)
 */
export const rejectAnnouncement = async (id, reason = '') => {
  const ref = doc(db, 'announcements', id);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;

  if (data?.requestedBy) {
    await sendNotificationToTeacher(
      data.requestedBy,
      '❌ تم رفض إعلانك',
      `تم رفض الإعلان "${data.title || ''}".${reason ? `\nسبب الرفض: ${reason}` : ''}`,
      'announcement_rejected',
      null
    );
  }
  await deleteDoc(ref);
};

export const updateAnnouncement = async (id, data) => {
  try {
    await updateDoc(doc(db, 'announcements', id), {
      ...data,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.error('Error updating announcement:', err);
    throw err;
  }
};

// حذف نسخ الإشعار الشخصية (عند كل المستخدمين) المرتبطة بهذا الإعلان — محاولة إضافية لا توقف الحذف إن فشلت
const deleteAnnouncementNotificationCopies = async (announcementId) => {
  try {
    const snap = await getDocs(
      query(collectionGroup(db, 'userNotifications'), where('relatedId', '==', announcementId))
    );
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('تعذر حذف نسخ الإشعار الشخصية (قد يلزم فهرس أو صلاحية):', err.message);
  }
};

/**
 * ✅ حذف الإعلان نهائياً من السيرفر — يختفي عند الجميع
 */
export const deleteAnnouncement = async (id) => {
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (err) {
    console.error('Error deleting announcement:', err);
    throw err;
  }
  await deleteAnnouncementNotificationCopies(id);
};