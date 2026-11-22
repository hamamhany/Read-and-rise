import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, getDoc
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
  notifySystemManagers
} from '../utils/notifications';

/**
 * ✅ إنشاء إعلان عام (السلوك القديم محفوظ — بانتظار موافقة المدير)
 * يُستخدم حالياً من المشرف
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
 * ✅ إنشاء إعلان مستهدف (جديد)
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {Date|null} opts.scheduledFor
 * @param {string} opts.requestedBy
 * @param {string} opts.requestedByName
 * @param {string} opts.requestedByRole  'system_manager' | 'supervisor' | 'teacher'
 * @param {string} opts.audience         ANNOUNCEMENT_AUDIENCE.*
 * @param {string[]} opts.targetClassIds شعب محددة (عندما audience='classes')
 * @param {{safe:boolean,reason:string,confidence:number,error?:boolean}} opts.moderationResult
 * @returns {Promise<{id:string,status:string,publishedNow:boolean}>}
 */
export const createTargetedAnnouncement = async ({
  title,
  body,
  scheduledFor = null,
  requestedBy = '',
  requestedByName = '',
  requestedByRole = 'supervisor',
  audience = ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS,
  targetClassIds = [],
  moderationResult = { safe: true, reason: '', confidence: 0 }
}) => {
  const cleanTitle = sanitizeInput(title);
  const cleanBody = sanitizeInput(body);

  if (!cleanTitle || !cleanBody) throw new Error('العنوان والمحتوى مطلوبان');
  if (audience === ANNOUNCEMENT_AUDIENCE.CLASSES && (!targetClassIds || targetClassIds.length === 0)) {
    throw new Error('اختر شعبة واحدة على الأقل');
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

  // ✅ إشعار المدير في كل الحالات
  const audienceText = ANNOUNCEMENT_AUDIENCE_LABELS[audience] || audience;
  if (isAutoApproved) {
    await notifySystemManagers(
      '📢 إعلان جديد تم إرساله',
      `أرسل ${requestedByName} (${requestedByRole === 'teacher' ? 'معلم' : requestedByRole === 'supervisor' ? 'مشرف' : 'مدير'}) إعلاناً إلى: ${audienceText}\nالعنوان: ${cleanTitle}${isScheduled ? '\n(مجدول للنشر لاحقاً)' : ''}`,
      'announcement_sent',
      docRef.id
    );

    // ✅ النشر الفوري (إن لم يكن مجدولاً)
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
 * ✅ نشر إعلان لجمهوره (يُستدعى فوراً عند المراجعة التلقائية،
 *    أو من المدير بعد الموافقة اليدوية)
 */
export const publishAnnouncementToAudience = async (announcementId, data) => {
  const { title, body, audience, targetClassIds } = data;

  try {
    if (audience === ANNOUNCEMENT_AUDIENCE.ALL_STUDENTS) {
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
 * - يغيّر الحالة إلى active أو scheduled
 * - ثم ينشره لجمهوره لو كان فورياً
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

  // ✅ النشر الفوري لجمهوره إن لم يكن مجدولاً
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
 * ✅ رفض الإعلان
 */
export const rejectAnnouncement = async (id, reason = '') => {
  await updateDoc(doc(db, 'announcements', id), {
    status: 'rejected',
    rejectionReason: reason,
    updatedAt: serverTimestamp()
  });
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

export const deleteAnnouncement = async (id) => {
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (err) {
    console.error('Error deleting announcement:', err);
    throw err;
  }
};
/**
 * ✅ فحص المحتوى عبر سند قبل الإرسال
 * يعيد { safe, reason, confidence, error? }
 * - إذا فشل الاتصال → error:true (يتحول للمراجعة اليدوية تلقائياً)
 */
export const moderateAnnouncementContent = async (title, body) => {
  const modPrompt = `قيّم المحتوى التالي من حيث الأمان واللائقية. أعد JSON فقط بهذا الشكل:\n{"safe": true/false, "reason": "سبب مختصر إن كان غير آمن", "confidence": 0.0-1.0}\n\nالعنوان: ${title}\n\nالمحتوى: ${body}`;

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: modPrompt,
        history: [],
        userRole: 'moderation',
        suppressEndTag: true,
        userName: '',
        userGender: ''
      })
    });

    if (!response.ok) {
      return { safe: false, reason: 'تعذر الفحص التلقائي', confidence: 0, error: true };
    }

    const data = await response.json();
    const text = data?.text || '';
    const match = text.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return {
          safe: parsed.safe === true,
          reason: parsed.reason || '',
          confidence: Number(parsed.confidence) || 0.8
        };
      } catch { /* fall through */ }
    }
    // سند رد بدون JSON → نعتبره آمن
    return { safe: true, reason: '', confidence: 0 };
  } catch (err) {
    console.warn('Sanad moderation failed:', err);
    return { safe: false, reason: 'تعذر الاتصال بسانـد — سيُراجع يدوياً', confidence: 0, error: true };
  }
};