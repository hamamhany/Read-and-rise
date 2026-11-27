import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, serverTimestamp, limit, writeBatch, setDoc, getCountFromServer
} from 'firebase/firestore';
import { createMessageRequest } from './messageRequests';
import { logTeacherEvent } from './teacherHistory';
import {
  CLASS_GENDER, CLASS_GENDER_LABELS, CLASS_VISIBILITY, SECTIONS_COLLECTION
} from '../constants';

// =========================================================
// ✅ الأقسام
// =========================================================

export const getSections = async () => {
  const snap = await getDocs(collection(db, SECTIONS_COLLECTION));
  return snap.docs
    .map(d => ({ id: d.id, parentId: null, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
};

export const getSectionPath = (sections, sectionId) => {
  const parts = [];
  let current = sections.find(s => s.id === sectionId);
  let guard = 0;
  while (current && guard < 30) {
    parts.unshift(current.name);
    current = current.parentId ? sections.find(s => s.id === current.parentId) : null;
    guard++;
  }
  return parts.join(' / ');
};

export const getDescendantSectionIds = (sections, sectionId) => {
  const result = [];
  const stack = [sectionId];
  while (stack.length) {
    const id = stack.pop();
    sections.forEach(s => {
      if (s.parentId === id) {
        result.push(s.id);
        stack.push(s.id);
      }
    });
  }
  return result;
};

export const flattenSectionTree = (sections) => {
  const out = [];
  const walk = (parentId, depth) => {
    sections
      .filter(s => (s.parentId || null) === parentId)
      .forEach(s => {
        out.push({ ...s, depth, path: getSectionPath(sections, s.id) });
        walk(s.id, depth + 1);
      });
  };
  walk(null, 0);
  return out;
};

export const createSection = async ({ name, createdBy, parentId = null }) => {
  const clean = (name || '').trim();
  if (!clean) throw new Error('اسم القسم مطلوب');
  const existing = await getSections();
  if (parentId && !existing.some(s => s.id === parentId)) {
    throw new Error('القسم الأب غير موجود');
  }
  if (existing.some(s => (s.parentId || null) === (parentId || null) && (s.name || '').trim() === clean)) {
    throw new Error('يوجد قسم بنفس الاسم في هذا المكان');
  }
  const ref = await addDoc(collection(db, SECTIONS_COLLECTION), {
    name: clean,
    parentId: parentId || null,
    createdBy: createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
};

export const renameSection = async (sectionId, name) => {
  const clean = (name || '').trim();
  if (!clean) throw new Error('اسم القسم مطلوب');
  const all = await getSections();
  const current = all.find(s => s.id === sectionId);
  if (!current) throw new Error('القسم غير موجود');
  if (all.some(s => s.id !== sectionId && (s.parentId || null) === (current.parentId || null) && (s.name || '').trim() === clean)) {
    throw new Error('يوجد قسم بنفس الاسم في هذا المكان');
  }
  await updateDoc(doc(db, SECTIONS_COLLECTION, sectionId), {
    name: clean,
    updatedAt: serverTimestamp()
  });
};

export const deleteSection = async (sectionId) => {
  const all = await getSections();
  const ids = [sectionId, ...getDescendantSectionIds(all, sectionId)];

  const classDocs = [];
  for (const id of ids) {
    const snap = await getDocs(query(collection(db, 'classes'), where('sectionId', '==', id)));
    snap.docs.forEach(d => classDocs.push(d));
  }
  for (const d of classDocs) {
    if ((await getClassStudentCount(d.id)) > 0) {
      throw new Error('لا يمكن حذف قسم فيه شعب تحتوي على طلاب. انقل الطلاب أولاً.');
    }
  }

  const refs = [
    ...classDocs.map(d => d.ref),
    ...ids.map(id => doc(db, SECTIONS_COLLECTION, id))
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => batch.delete(r));
    await batch.commit();
  }
};

export const deleteSectionMergingIntoParent = async (sectionId) => {
  const all = await getSections();
  const current = all.find(s => s.id === sectionId);
  if (!current) throw new Error('القسم غير موجود');

  if (!current.parentId) {
    throw new Error('لا يمكنك حذف قسم رئيسي يجب نقل الشعب إلى مكان اخر');
  }
  const parentId = current.parentId;

  const classesSnap = await getDocs(query(collection(db, 'classes'), where('sectionId', '==', sectionId)));
  for (const clsDoc of classesSnap.docs) {
    await updateDoc(clsDoc.ref, { sectionId: parentId, updatedAt: serverTimestamp() });
  }

  const directSubs = all.filter(s => s.parentId === sectionId);
  for (const sub of directSubs) {
    await updateDoc(doc(db, SECTIONS_COLLECTION, sub.id), {
      parentId,
      updatedAt: serverTimestamp()
    });
  }

  await deleteDoc(doc(db, SECTIONS_COLLECTION, sectionId));
};

export const moveSectionContentToSection = async (fromSectionId, toSectionId) => {
  if (fromSectionId === toSectionId) throw new Error('لا يمكن النقل إلى نفس القسم');
  const all = await getSections();
  const from = all.find(s => s.id === fromSectionId);
  const to = all.find(s => s.id === toSectionId);
  if (!from) throw new Error('القسم المصدر غير موجود');
  if (!to) throw new Error('القسم الهدف غير موجود');

  const descendants = getDescendantSectionIds(all, fromSectionId);
  if (descendants.includes(toSectionId)) {
    throw new Error('لا يمكن نقل المحتوى إلى قسم يقع داخل نفس القسم');
  }

  const classesSnap = await getDocs(query(collection(db, 'classes'), where('sectionId', '==', fromSectionId)));
  for (const clsDoc of classesSnap.docs) {
    await updateDoc(clsDoc.ref, { sectionId: toSectionId, updatedAt: serverTimestamp() });
  }

  const directSubs = all.filter(s => s.parentId === fromSectionId);
  for (const sub of directSubs) {
    await updateDoc(doc(db, SECTIONS_COLLECTION, sub.id), {
      parentId: toSectionId,
      updatedAt: serverTimestamp()
    });
  }
};

export const moveClassToSection = async (classId, sectionId) => {
  const sectionSnap = await getDoc(doc(db, SECTIONS_COLLECTION, sectionId));
  if (!sectionSnap.exists()) throw new Error('القسم غير موجود');
  await updateDoc(doc(db, 'classes', classId), {
    sectionId,
    updatedAt: serverTimestamp()
  });
};

export const purgeClassesWithoutSection = async ({ cleanSections = false } = {}) => {
  const [classesSnap, sectionsSnap] = await Promise.all([
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, SECTIONS_COLLECTION))
  ]);

  let validSectionIds = new Set(sectionsSnap.docs.map(d => d.id));

  if (cleanSections) {
    let changed = true;
    let remaining = sectionsSnap.docs;
    while (changed) {
      changed = false;
      const ids = new Set(remaining.map(d => d.id));
      const orphanSecs = remaining.filter(d => {
        const pid = d.data().parentId;
        return pid && !ids.has(pid);
      });
      if (orphanSecs.length > 0) {
        for (const o of orphanSecs) {
          try { await deleteDoc(o.ref); } catch (e) { console.warn('orphan section delete failed:', e); }
        }
        remaining = remaining.filter(d => !orphanSecs.includes(d));
        changed = true;
      }
    }
    validSectionIds = new Set(remaining.map(d => d.id));
  }

  const orphans = classesSnap.docs.filter(d => {
    const sid = d.data().sectionId;
    return !sid || !validSectionIds.has(sid);
  });

  for (const orphan of orphans) {
    try {
      const studentsSnap = await getDocs(query(
        collection(db, 'profiles'),
        where('classIds', 'array-contains', orphan.id)
      ));
      for (const s of studentsSnap.docs) {
        const newIds = (s.data().classIds || []).filter(id => id !== orphan.id);
        await updateDoc(s.ref, { classIds: newIds, updatedAt: serverTimestamp() });
      }
    } catch (e) {
      console.warn('تنظيف الطلاب فشل:', e);
    }
    await deleteDoc(orphan.ref);
  }
  return orphans.length;
};

export const createClass = async ({ name, teacherId, gender, sectionId, createdBy = '', createdByName = '' }) => {
  if (!name || !name.trim()) throw new Error('اسم الشعبة مطلوب');
  if (!teacherId) throw new Error('معلم الشعبة مطلوب');
  if (!sectionId) throw new Error('يجب اختيار القسم');
  const sectionSnap = await getDoc(doc(db, SECTIONS_COLLECTION, sectionId));
  if (!sectionSnap.exists()) throw new Error('القسم غير موجود');

  const ref = await addDoc(collection(db, 'classes'), {
    name: name.trim(),
    teacherId,
    sectionId,
    gender: gender || CLASS_GENDER.MIXED,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logTeacherEvent({ teacherId, type: 'assigned', classId: ref.id, className: name.trim(), byId: createdBy, byName: createdByName, reason: '' });
  return ref.id;
};

export const updateClassGender = async (classId, gender) => {
  await updateDoc(doc(db, 'classes', classId), {
    gender,
    updatedAt: serverTimestamp()
  });
};

export const deleteClassById = async (classId) => {
  let snap = null;
  try { snap = await getDoc(doc(db, 'classes', classId)); } catch (e) { /* ignore */ }
  await deleteDoc(doc(db, 'classes', classId));
  if (snap && snap.exists() && snap.data().teacherId) {
    await logTeacherEvent({
      teacherId: snap.data().teacherId, type: 'relieved',
      classId, className: snap.data().name || '', reason: 'حذف الشعبة'
    });
  }
};

// عدد طلاب شعبة واحدة (استعلام عدّ رخيص — لا يقرأ ملفات الطلاب)
export const getClassStudentCount = async (classId) => {
  const snap = await getCountFromServer(query(
    collection(db, 'profiles'),
    where('classIds', 'array-contains', classId)
  ));
  return snap.data().count;
};

// البحث عن معلم بالرقم التسلسلي — يُستدعى فقط عند الضغط على الزر
export const findTeacherBySerial = async (serial) => {
  const clean = String(serial || '').trim();
  if (!clean) return null;
  const snap = await getDocs(query(
    collection(db, 'profiles'),
    where('role', '==', 'teacher'),
    where('serialNumber', '==', clean),
    limit(1)
  ));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
};

export const getClassStudentCounts = async () => {
  const snap = await getDocs(query(
    collection(db, 'profiles'),
    where('role', '==', 'student')
  ));
  const counts = {};
  snap.docs.forEach(d => {
    const ids = d.data().classIds || [];
    ids.forEach(cid => {
      counts[cid] = (counts[cid] || 0) + 1;
    });
  });
  return counts;
};

export const validateStudentEligibility = (student, classData) => {
  const studentGender = student?.gender || '';
  const studentAge = Number(student?.age) || 0;
  const classGender = classData?.gender || CLASS_GENDER.MIXED;

  if (classGender === CLASS_GENDER.MALE && studentGender !== 'ذكر') {
    return { ok: false, reason: 'هذه الشعبة مخصصة للذكور فقط' };
  }
  if (classGender === CLASS_GENDER.FEMALE && studentGender !== 'أنثى') {
    return { ok: false, reason: 'هذه الشعبة مخصصة للإناث فقط' };
  }
  if (classGender === CLASS_GENDER.MIXED && studentGender === 'ذكر' && studentAge > 12) {
    return { ok: false, reason: 'الشعبة المختلطة لا تقبل الذكور فوق 12 عام' };
  }
  return { ok: true };
};

export const getClassGenderLabel = (gender) => {
  return CLASS_GENDER_LABELS[gender] || 'مختلطة';
};

export const getTeacherDisplayName = (teacher) => {
  if (!teacher) return 'غير محدد';
  if (teacher.gender === 'أنثى') {
    return teacher.nickname || 'معلمة';
  }
  return teacher.name || teacher.username || 'معلم';
};

export const getTeacherNameForViewer = (teacher, viewerGender) => {
  if (!teacher) return 'غير محدد';
  if (viewerGender === 'ذكر' && teacher.gender === 'أنثى') {
    return (teacher.nickname && teacher.nickname.trim()) || '********';
  }
  return getTeacherDisplayName(teacher);
};

export const changeClassTeacher = async (classId, teacherId, { byId = '', byName = '', reason = '' } = {}) => {
  if (!teacherId) throw new Error('اختر المعلم');
  const [teacherSnap, classSnap] = await Promise.all([
    getDoc(doc(db, 'profiles', teacherId)),
    getDoc(doc(db, 'classes', classId))
  ]);
  if (!teacherSnap.exists() || teacherSnap.data().role !== 'teacher') {
    throw new Error('المعلم غير موجود');
  }
  if (!classSnap.exists()) throw new Error('الشعبة غير موجودة');
  const cls = classSnap.data();
  const oldTeacherId = cls.teacherId || '';
  if (oldTeacherId === teacherId) throw new Error('هذا المعلم هو معلم الشعبة بالفعل');

  await updateDoc(doc(db, 'classes', classId), { teacherId, updatedAt: serverTimestamp() });

  const cleanReason = (reason || '').trim();
  const newT = teacherSnap.data();

  // سجل المعلمين
  await logTeacherEvent({ teacherId, type: 'assigned', classId, className: cls.name, byId, byName, reason: '' });
  let oldT = null;
  if (oldTeacherId) {
    await logTeacherEvent({ teacherId: oldTeacherId, type: 'relieved', classId, className: cls.name, byId, byName, reason: cleanReason });
    try {
      const oldSnap = await getDoc(doc(db, 'profiles', oldTeacherId));
      if (oldSnap.exists()) oldT = oldSnap.data();
    } catch (e) { /* ignore */ }
  }

  // رسائل للمدير (يرسلها واتساب فقط)
  try {
    await createMessageRequest({
      type: 'teacher_assignment', targetType: 'teacher', targetId: teacherId,
      targetName: newT.name || newT.username || '', targetPhone: newT.phone || '', targetClass: cls.name || '',
      requestedBy: byId, requestedByName: byName || 'مشرف',
      payload: { className: cls.name || '' }
    });
    if (oldT) {
      await createMessageRequest({
        type: 'teacher_relief', targetType: 'teacher', targetId: oldTeacherId,
        targetName: oldT.name || oldT.username || '', targetPhone: oldT.phone || '', targetClass: cls.name || '',
        requestedBy: byId, requestedByName: byName || 'مشرف',
        payload: { className: cls.name || '', reason: cleanReason }
      });
    }
  } catch (e) {
    console.warn('teacher change message requests failed:', e);
  }
  return { teacherName: newT.name || newT.username || '' };
};

export const getClassWarningStats = async (classId) => {
  const snap = await getDocs(query(
    collection(db, 'profiles'),
    where('classIds', 'array-contains', classId)
  ));
  const now = Date.now();
  let studentsCount = 0, studentsWithWarnings = 0, totalWarnings = 0;
  snap.docs.forEach(d => {
    if (d.data().role !== 'student') return;
    studentsCount++;
    const active = (d.data().warnings || []).filter(w => {
      const exp = w.expiresAt ? new Date(w.expiresAt).getTime() : Infinity;
      return exp > now;
    });
    if (active.length > 0) studentsWithWarnings++;
    totalWarnings += active.length;
  });
  return { studentsCount, studentsWithWarnings, totalWarnings };
};

export const setStudentClasses = async (studentId, classIds) => {
  const clean = [...new Set((classIds || []).filter(Boolean))];
  if (clean.length === 0) throw new Error('لا يمكن ترك الطالب بدون شعبة');
  await updateDoc(doc(db, 'profiles', studentId), {
    classIds: clean,
    updatedAt: serverTimestamp()
  });
};

export const filterClassesForSupervisor = (classes, supervisorGender, visibilityMode) => {
  if (visibilityMode === CLASS_VISIBILITY.ALL || !visibilityMode) return classes;
  if (!supervisorGender) return classes;

  if (supervisorGender === 'ذكر') {
    return classes.filter(c =>
      c.gender === CLASS_GENDER.MALE || c.gender === CLASS_GENDER.MIXED || !c.gender
    );
  }
  if (supervisorGender === 'أنثى') {
    return classes.filter(c =>
      c.gender === CLASS_GENDER.FEMALE || c.gender === CLASS_GENDER.MIXED || !c.gender
    );
  }
  return classes;
};

export const getAllowedClassGenders = (supervisorGender, visibilityMode) => {
  if (visibilityMode === CLASS_VISIBILITY.ALL || !visibilityMode) {
    return [CLASS_GENDER.MALE, CLASS_GENDER.FEMALE, CLASS_GENDER.MIXED];
  }
  if (supervisorGender === 'ذكر') {
    return [CLASS_GENDER.MALE, CLASS_GENDER.MIXED];
  }
  if (supervisorGender === 'أنثى') {
    return [CLASS_GENDER.FEMALE, CLASS_GENDER.MIXED];
  }
  return [CLASS_GENDER.MALE, CLASS_GENDER.FEMALE, CLASS_GENDER.MIXED];
};

export const findAffectedStudents = async (classId, newGender) => {
  const classDoc = await getDoc(doc(db, 'classes', classId));
  if (!classDoc.exists()) throw new Error('الشعبة غير موجودة');
  const classData = classDoc.data();

  const studentsSnap = await getDocs(query(
    collection(db, 'profiles'),
    where('role', '==', 'student')
  ));

  const affected = [];
  studentsSnap.docs.forEach(d => {
    const data = d.data();
    const classIds = data.classIds || [];
    if (!classIds.includes(classId)) return;
    const result = validateStudentEligibility(data, { ...classData, gender: newGender });
    if (!result.ok) {
      affected.push({ id: d.id, ...data, reason: result.reason });
    }
  });
  return affected;
};

export const moveStudentToClass = async (studentId, fromClassId, toClassId) => {
  const studentRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) throw new Error('الطالب غير موجود');
  const data = snap.data();
  const currentClassIds = data.classIds || [];
  const newClassIds = currentClassIds
    .filter(id => id !== fromClassId);
  if (toClassId && !newClassIds.includes(toClassId)) {
    newClassIds.push(toClassId);
  }
  await updateDoc(studentRef, {
    classIds: newClassIds,
    updatedAt: serverTimestamp()
  });
};

export const getEligibleClassesForStudent = async (student, excludeClassId = null) => {
  const snap = await getDocs(collection(db, 'classes'));
  const eligible = [];
  snap.docs.forEach(d => {
    if (d.id === excludeClassId) return;
    const classData = { id: d.id, ...d.data() };
    const result = validateStudentEligibility(student, classData);
    if (result.ok) eligible.push(classData);
  });
  return eligible;
};

// =========================================================
// ✅ طلبات تعديل الشعب — موافقة الطالب (بدل موافقة المدير)
// =========================================================

export const PENDING_CLASS_CHANGE_STATUS = {
  PENDING: 'pending_student_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

/**
 * ينشئ طلب تعديل شعب للطالب — يظهر له modal في لوحته للموافقة/الرفض
 */
export const createStudentClassChangeRequest = async ({
  studentId,
  fromClassIds,
  toClassIds,
  requestedBy,
  requestedByName
}) => {
  const clean = [...new Set((toClassIds || []).filter(Boolean))];
  if (clean.length === 0) {
    throw new Error('يجب أن يبقى للطالب شعبة واحدة على الأقل');
  }

  const snap = await getDoc(doc(db, 'profiles', studentId));
  if (!snap.exists()) throw new Error('الطالب غير موجود');
  const data = snap.data();
  if (data.pendingClassChangeStatus === PENDING_CLASS_CHANGE_STATUS.PENDING) {
    throw new Error('يوجد طلب تعديل شعب معلّق بالفعل لهذا الطالب');
  }

  await updateDoc(doc(db, 'profiles', studentId), {
    pendingClassChange: {
      fromClassIds: fromClassIds || [],
      toClassIds: clean,
      requestedBy: requestedBy || '',
      requestedByName: requestedByName || 'مشرف',
      requestedAt: new Date().toISOString()
    },
    pendingClassChangeStatus: PENDING_CLASS_CHANGE_STATUS.PENDING,
    updatedAt: serverTimestamp()
  });
};

/**
 * يوافق الطالب على تعديل الشعب → يطبّق الشعب الجديدة ويُشعر المشرف/المدير
 */
export const approveStudentClassChange = async (studentId) => {
  const snap = await getDoc(doc(db, 'profiles', studentId));
  if (!snap.exists()) throw new Error('الملف غير موجود');
  const data = snap.data();
  if (data.pendingClassChangeStatus !== PENDING_CLASS_CHANGE_STATUS.PENDING) {
    throw new Error('لا يوجد طلب معلّق');
  }
  const pending = data.pendingClassChange || {};
  const newClassIds = [...new Set((pending.toClassIds || []).filter(Boolean))];
  if (newClassIds.length === 0) throw new Error('لا توجد شعب جديدة');

  await updateDoc(doc(db, 'profiles', studentId), {
    classIds: newClassIds,
    pendingClassChange: null,
    pendingClassChangeStatus: PENDING_CLASS_CHANGE_STATUS.APPROVED,
    updatedAt: serverTimestamp()
  });

  if (pending.requestedBy) {
    try {
      await setDoc(doc(collection(db, 'notifications', pending.requestedBy, 'userNotifications')), {
        title: '✅ وافق الطالب على تعديل شعبته',
        body: `وافق الطالب ${data.name || ''} على تعديل شعبته. تم التطبيق.`,
        type: 'class_change_approved',
        createdAt: serverTimestamp(),
        read: false
      });
    } catch (e) { console.warn('notify requester failed:', e); }
  }
};

/**
 * يرفض الطالب تعديل الشعب → لا يُطبَّق شيء ويُشعر المشرف/المدير
 */
export const rejectStudentClassChange = async (studentId) => {
  const snap = await getDoc(doc(db, 'profiles', studentId));
  if (!snap.exists()) throw new Error('الملف غير موجود');
  const data = snap.data();
  if (data.pendingClassChangeStatus !== PENDING_CLASS_CHANGE_STATUS.PENDING) {
    throw new Error('لا يوجد طلب معلّق');
  }
  const pending = data.pendingClassChange || {};

  await updateDoc(doc(db, 'profiles', studentId), {
    pendingClassChange: null,
    pendingClassChangeStatus: PENDING_CLASS_CHANGE_STATUS.REJECTED,
    updatedAt: serverTimestamp()
  });

  if (pending.requestedBy) {
    try {
      await setDoc(doc(collection(db, 'notifications', pending.requestedBy, 'userNotifications')), {
        title: '❌ رفض الطالب تعديل شعبته',
        body: `رفض الطالب ${data.name || ''} تعديل شعبته. لم يتم تطبيق أي تغيير.`,
        type: 'class_change_rejected',
        createdAt: serverTimestamp(),
        read: false
      });
    } catch (e) { console.warn('notify requester failed:', e); }
  }
};