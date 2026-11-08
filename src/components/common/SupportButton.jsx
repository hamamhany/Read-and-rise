import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaHeadset, FaTimes, FaPaperPlane, FaCheckCircle } from 'react-icons/fa';
import { createSupportMessage } from '../../services/support';
import { sanitizeInput } from '../../utils/helpers';

const SupportButton = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  if (!user || !['student', 'teacher', 'supervisor'].includes(user.role)) return null;

  const handleSend = async () => {
    const text = sanitizeInput(message);
    if (!text.trim()) { toast.error('اكتب رسالتك أولاً'); return; }
    setSending(true);
    try {
      await createSupportMessage({
        senderId: user.id,
        senderName: user.name || user.username || 'مستخدم',
        senderRole: user.role,
        senderSerialNumber: user.serialNumber || '',
        senderPhone: user.phone || '',
        senderAge: user.age || null,
        senderGender: user.gender || '',
        senderClassIds: user.classIds || [],
        message: text
      });
      toast.success('✅ تم إرسال رسالتك إلى الدعم الفني');
      setMessage('');
      setSentCount(prev => prev + 1);
    } catch (err) {
      toast.error('فشل الإرسال: ' + err.message);
    } finally { setSending(false); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="support-float-btn"
        title="الدعم الفني"
        aria-label="الدعم الفني"
      >
        <FaHeadset size={26} />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={() => setOpen(false)}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-blue-500/30" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-blue-300 flex items-center gap-2"><FaHeadset /> الدعم الفني</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              مرحباً {user.name || 'بك'}، أرسل استفسارك وسيصلك ردّ من فريق المشرفين.
            </p>
            <textarea
              className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-32"
              placeholder="اكتب استفسارك هنا..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            {sentCount > 0 && (
              <p className="text-xs text-green-400 mt-2 flex items-center gap-1">
                <FaCheckCircle /> تم إرسال {sentCount} رسالة في هذه الجلسة
              </p>
            )}
            <div className="flex gap-3 mt-3">
              <button onClick={handleSend} disabled={sending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:opacity-50 font-bold">
                <FaPaperPlane className="inline me-2" /> {sending ? 'جاري الإرسال...' : 'إرسال'}
              </button>
              <button onClick={() => setOpen(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SupportButton;