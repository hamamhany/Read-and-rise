// src/utils/avatars.js
// صورة ثابتة لكل نوع حساب، موجودة في public/images/
// (أسماء الملفات تُطابق تماماً ما في api/jitsi-token.js — الحروف الكبيرة والصغيرة مهمة)
const AVATAR_FILES = {
  student: 'Image student.png',
  teacher: 'Image teacher.png',
  system_manager: 'Image boss.png'
};

export const getRoleAvatarUrl = (role) => {
  const file = AVATAR_FILES[role];
  return file ? `/images/${encodeURIComponent(file)}` : null;
};