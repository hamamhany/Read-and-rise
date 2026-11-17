import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, serverTimestamp, limit
} from 'firebase/firestore';
import {
  CLASS_GENDER, CLASS_GENDER_LABELS, CLASS_VISIBILITY
} from '../constants';

// =========================================================
// ✅ الأقسام (Sections) — الحاوية الخارجية للشعب
// =========================================================

/**
 * إنشاء قسم جديد (المدير فقط)
 */
export const createSection = async ({ name, createdBy }) => {
  if (!name || !name.trim()) throw new Error('اسم القسم مطلوب');
  const ref = await addDoc(collection(db, 'sections'), {
    name: name.trim(),
    createdBy: createdBy || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
};

/**
 * تعديل اسم قسم
 */
export const updateSection = async (sectionId, { name }) => {
  if (!name || !name.trim()) throw new Error('اسم القسم مطلوب');
  await updateDoc(doc(db, 'sections', sectionId), {
    name: name.trim(),
    updatedAt: serverTimestamp()
  });
};

/**
 * حذف قسم — فقط إذا كان فارغاً من الشعب
 */
export const deleteSection = async (sectionId) => {
  const snap = await getDocs(
    query(collection(db, 'classes'), where('sectionId', '==', sectionId))
  );
  if (!snap.empty) {
    throw new Error('لا يمكن حذف قسم يحتوي على شعب — احذف الشعب أولاً');
  }
  await deleteDoc(doc(db, 'sections', sectionId));
};

/**
 * جلب كل الأقسام
 */
export const getAllSections = async () => {
  const snap = await getDocs(collection(db, 'sections'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

/**
 * نقل شعبة إلى قسم آخر
 */
export const moveClassToSection = async (classId, sectionId) => {
  if (!sectionId) throw new Error('القسم مطلوب');
  await updateDoc(doc(db, 'classes', classId), {
    sectionId,
    updatedAt: serverTimestamp()
  });
};

/**
 * ✅ حذف الشعب القديمة التي لا تنتمي لأي قسم صالح
 * (يُستدعى تلقائياً من لوحة المدير عند فتح إدارة الشعب)
 * يرجع عدد الشعب المحذوفة
 */
export const purgeOrphanClasses = async () => {
  try {
    const [classesSnap, sectionsSnap] = await Promise.all([
      getDocs(collection(db, 'classes')),
      getDocs(collection(db, 'sections'))
    ]);
    const validIds = new Set(sectionsSnap.docs.map(d => d.id));
    const orphans = classesSnap.docs.filter(d => {
      const sid = d.data().sectionId;
      return !sid || !validIds.has(sid);
    });
    if (orphans.length === 0) return 0;
    await Promise.all(orphans.map(d => deleteDoc(doc(db, 'classes', d.id))));
    return orphans.length;
  } catch (err) {
    console.warn('فشل حذف الشعب القديمة:', err);
    return 0;
  }
};

// =========================================================
// ✅ الشعب (Classes) — الآن كل شعبة يجب أن تنتمي لقسم
// =========================================================

export const createClass = async ({ name, teacherId, gender, sectionId }) => {
  if (!name || !name.trim()) throw new Error('اسم الشعبة مطلوب');
  if (!teacherId) throw new Error('معلم الشعبة مطلوب');
  if (!sectionId) throw new Error('القسم مطلوب — يجب اختيار قسم لكل شعبة');

  const ref = await addDoc(collection(db, 'classes'), {
    name: name.trim(),
    teacherId,
    gender: gender || CLASS_GENDER.MIXED,
    sectionId,
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