import React, { useState } from 'react';
import { FaHeadset, FaWhatsapp, FaTimes } from 'react-icons/fa';
import { TEACHER_PHONE } from '../../constants';

const LoginSupportButton = () => {
  const [showModal, setShowModal] = useState(false);

  const openWhatsApp = () => {
    const message = encodeURIComponent(
      `السلام عليكم ورحمة الله وبركاته،\n\n` +
      `أحتاج إلى مساعدة، هل يمكنكم مساعدتي؟\n\n` +
      `(أنا لا أستطيع تقديم طلب دعم فني عبر المنصة قبل تسجيل الدخول، لذا أتواصل معكم عبر واتساب.)\n\n` +
      `شاكراً لكم تعاونكم.`
    );
    const url = `https://wa.me/${TEACHER_PHONE}?text=${message}`;
    window.open(url, '_blank');
    setShowModal(false);
  };

  return (
    <>
      {/* زر الدعم العائم */}
      <div className="fixed bottom-6 left-6 z-[60]">
        <button
          onClick={() => setShowModal(true)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
          title="الدعم الفني"
        >
          <FaHeadset size={22} />
        </button>
      </div>

      {/* المودال */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-slate-500/30 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                <FaHeadset /> الدعم الفني
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                <FaTimes />
              </button>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl mb-4">
              <p className="text-amber-200 text-sm leading-relaxed">
                ⚠️ لا يمكن تقديم طلب دعم فني عبر المنصة قبل تسجيل الدخول.
              </p>
              <p className="text-gray-300 text-sm mt-2 leading-relaxed">
                يمكنك التواصل معنا مباشرةً عبر رقم الواتساب لتسهيل التواصل.
              </p>
            </div>

            <div className="space-y-2">
              <a
                href={`https://wa.me/${TEACHER_PHONE}?text=${encodeURIComponent(
                  `السلام عليكم ورحمة الله وبركاته،\n\nأحتاج إلى مساعدة، هل يمكنكم مساعدتي؟\n\n(أنا لا أستطيع تقديم طلب دعم فني عبر المنصة قبل تسجيل الدخول، لذا أتواصل معكم عبر واتساب.)\n\nشاكراً لكم تعاونكم.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowModal(false)}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition"
              >
                <FaWhatsapp size={20} /> تواصل عبر واتساب
              </a>

              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 rounded-xl text-sm transition"
              >
                إغلاق
              </button>
            </div>

            <p className="text-[10px] text-gray-500 text-center mt-3 leading-relaxed">
              💡 إذا كان لديك حساب، يرجى تسجيل الدخول أولاً للحصول على الدعم الفني الكامل.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default LoginSupportButton;