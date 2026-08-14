import React from 'react';
import { FaBan, FaWhatsapp } from 'react-icons/fa';

export const FrozenAccount = ({ user, onLogout }) => {
  const studentName = user?.name || user?.username || 'الطالب';
  const studentClass = user?.class_name || 'غير محدد';
  const studentUsername = user?.username || 'غير مسجل';
  const studentWhatsApp = user?.phone || 'غير مسجل';

  const waMessage = encodeURIComponent(
    `السلام عليكم ورحمة الله وبركاته\n` +
    `الموضوع: طلب فك تجميد حساب - [${studentName}]\n\n` +
    `مرحباً أستاذ همام هاني محمد ،\n` +
    `أرجو منكم التكرم بفك تجميد حسابي في التطبيق، حيث أنني حالياً لا أستطيع الوصول للمحتوى التعليمي.\n\n` +
    `بيانات الطالب:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `اسم المستخدم: ${studentUsername}\n` +
    `الشعبة: ${studentClass}\n` +
    `رقم واتساب: ${studentWhatsApp}\n\n` +
    `شاكراً لكم تعاونكم.`
  );

  return (
    <div className="container-center min-h-screen relative" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-700 text-center space-y-6">
          <div className="text-6xl mb-2"><FaBan className="inline-block" /></div>
          <h2 className="text-2xl font-bold text-red-400">
            <FaBan className="inline-block me-2" /> الحساب مجمد
          </h2>
          <p className="text-gray-300 leading-relaxed">
            يرجى التواصل مع <strong className="text-purple-300">رئيس قسم التكنولوجيا وإدارة المعلومات: همام هاني محمد</strong> عبر واتساب.
          </p>
          <a
            href={`https://wa.me/962786117388?text=${waMessage}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full py-4 text-lg bg-green-600 hover:bg-green-700 shadow-lg flex items-center justify-center gap-2"
          >
            <FaWhatsapp className="inline-block me-2" /> اضغط هنا للتواصل مع المشرف
          </a>
          <button
            onClick={onLogout}
            type="button"
            className="text-sm text-gray-400 hover:text-white transition-colors mt-4"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </div>
  );
};