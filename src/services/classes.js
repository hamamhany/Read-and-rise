import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, getDoc, getDocs,
  query, where, serverTimestamp, limit
} from 'firebase/firestore';
import {
  CLASS_GENDER, CLASS_GENDER_LABELS, CLASS_VISIBILITY
} from '../constants';

export const createClass = async ({ name, teacherId, gender }) => {
  if (!name || !name.trim()) throw new Error('اسم الشعبة مطلوب');
  if (!teacherId) throw new Error('معلم الشعبة مطلوب');

  const ref = await addDoc(collection(db, 'classes'), {
    name: name.trim(),
    teacherId,
    gender: gender || CLASS_GENDER.MIXED,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
};

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

// ✅ اسم المعلم المعروض (للمعلمات: اسم الشهرة فقط)
export const getTeacherDisplayName = (teacher) => {
  if (!teacher) return 'غير محدد';
  if (teacher.gender === 'أنثى') {
    return teacher.nickname || 'معلمة';
  }
  return teacher.name || teacher.username || 'معلم';
};

// ✅ فلترة الشعب حسب وضع رؤية المشرف
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

// ✅ جنس الشعبة المسموح بإنشائه للمشرف حسب وضعه
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