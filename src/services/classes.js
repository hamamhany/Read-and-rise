import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, serverTimestamp, limit, writeBatch
} from 'firebase/firestore';
import {
  CLASS_GENDER, CLASS_GENDER_LABELS, CLASS_VISIBILITY, SECTIONS_COLLECTION
} from '../constants';

// =========================================================
// ✅ الأقسام — مثل المجلدات: قسم رئيسي، وبداخله أقسام فرعية وشعب
// كل شعبة يجب أن تكون داخل قسم (ينشئه المدير)
// القسم الرئيسي: parentId = null
// =========================================================

export const getSections = async () => {
  const snap = await getDocs(collection(db, SECTIONS_COLLECTION));
  return snap.docs
    .map(d => ({ id: d.id, parentId: null, ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
};

/** مسار القسم كاملاً: "الرئيسي / الفرعي / ..." */
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

/** كل الأقسام الموجودة تحت قسم معيّن (أبناء وأحفاد) */
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

/** قائمة الأقسام مرتّبة كشجرة مع العمق (للاختيار من قائمة) */
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

/**
 * حذف قسم مع كل ما بداخله (أقسام فرعية + شعب) — ممنوع إذا كان فيه طلاب
 */
export const deleteSection = async (sectionId) => {
  const all = await getSections();
  const ids = [sectionId, ...getDescendantSectionIds(all, sectionId)];

  const classDocs = [];
  for (const id of ids) {
    const snap = await getDocs(query(collection(db, 'classes'), where('sectionId', '==', id)));
    snap.docs.forEach(d => classDocs.push(d));
  }
  const counts = await getClassStudentCounts();
  if (classDocs.some(d => (counts[d.id] || 0) > 0)) {
    throw new Error('لا يمكن حذف قسم فيه شعب تحتوي على طلاب. انقل الطلاب أولاً.');
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

/** نقل شعبة من قسم إلى قسم آخر */
export const moveClassToSection = async (classId, sectionId) => {
  const sectionSnap = await getDoc(doc(db, SECTIONS_COLLECTION, sectionId));
  if (!sectionSnap.exists()) throw new Error('القسم غير موجود');
  await updateDoc(doc(db, 'classes', classId), {
    sectionId,
    updatedAt: serverTimestamp()
  });
};

/**
 * ✅ حذف فوري من السيرفر لأي شعبة بدون قسم (أو قسمها محذوف)
 * ويُزال معرّفها من حسابات الطلاب المرتبطين بها
 * cleanSections: (للمدير فقط) يحذف أيضاً أي قسم فرعي قسمه الأب محذوف
 */
export const purgeClassesWithoutSection = async ({ cleanSections = false } = {}) => {
  const [classesSnap, sectionsSnap] = await Promise.all([
    getDocs(collection(db, 'classes')),
    getDocs(collection(db, SECTIONS_COLLECTION))
  ]);

  let validSectionIds = new Set(sectionsSnap.docs.map(d => d.id));

  if (cleanSections) {
    // أقسام فرعية بلا أب موجود = يتيمة → تُحذف
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

export const createClass = async ({ name, teacherId, gender, sectionId }) => {
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
  return ref.id;
};

/**
 * ✅ تحديث جنس الشعبة — مباشر (يُستخدم من قبل المدير فقط بعد الموافقة)
 */
export const updateClassGender = async (classId, gender) => {
  await updateDoc(doc(db, 'classes', classId), {
    gender,
    updatedAt: serverTimestamp()
  });
};

export const deleteClassById = async (classId) => {
  await deleteDoc(doc(db, 'classes', classId));
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

/**
 * ✅ كشف الطلاب المتضررين من تغيير جنس الشعبة
 * يعيد قائمة الطلاب اللي ما يتوافقوا مع الجنس الجديد
 */
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

/**
 * ✅ نقل طالب من شعبة إلى أخرى — مباشر (يستخدمه المدير بعد الموافقة)
 */
export const moveStudentToClass = async (studentId, fromClassId, toClassId) => {
  const studentRef = doc(db, 'profiles', studentId);
  const snap = await getDoc(studentRef);
  if (!snap.exists()) throw new Error('الطالب غير موجود');
  const data = snap.data();
  const currentClassIds = data.classIds || [];
  const newClassIds = currentClassIds
    .filter(id => id !== fromClassId);
  if (!newClassIds.includes(toClassId)) {
    newClassIds.push(toClassId);
  }
  await updateDoc(studentRef, {
    classIds: newClassIds,
    updatedAt: serverTimestamp()
  });
};

/**
 * ✅ البحث عن الشعب المتوافقة مع طالب (لنقله)
 */
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