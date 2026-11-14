import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FaHeadset, FaArrowRight, FaSpinner } from 'react-icons/fa';
import {
  createSupportTicket, getStudentOpenTicket, dismissClosedBubble
} from '../services/support';
import { sanitizeInput } from '../utils/helpers';
import { askAssistant } from '../utils/askAssistant';
import SupportChat from '../components/common/SupportChat';
import { BotAvatar, ChatComposer } from '../components/common/ChatParts';

const SupportPage = ({ user }) => {
  const navigate = useNavigate();
  const goHome = useCallback(() => navigate('/'), [navigate]);

  const [loading, setLoading] = useState(true);
  const [ticketId, setTicketId] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ticket = await getStudentOpenTicket(user.id);
        if (cancelled) return;
        if (ticket) {
          setTicketId(ticket.id);
          if (ticket.isClosed) dismissClosedBubble(ticket.id).catch(() => {});
        }
      } catch (err) {
        toast.error('فشل فتح الدعم: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  const handleCreate = async () => {
    const text = sanitizeInput(newMessage);
    if (!text.trim()) { toast.error('اكتب رسالتك أولاً'); return; }
    setCreating(true);
    try {
      const id = await createSupportTicket({
        studentId: user.id,
        studentName: user.name || user.username || 'مستخدم',
        studentRole: user.role,
        studentSerialNumber: user.serialNumber || '',
        studentPhone: user.phone || '',
        studentAge: user.age || null,
        studentGender: user.gender || '',
        studentClassIds: user.classIds || [],
        initialMessage: text
      });
      const targetRole = (user.role === 'supervisor' || user.role === 'system_manager')
        ? 'مدير النظام'
        : 'مشرف';
      toast.success(`✅ تم إرسال طلبك — بانتظار ${targetRole}`);

      const newTicket = await getStudentOpenTicket(user.id);
      const newId = newTicket?.id || id;

      // المساعد الذكي يرد على الرسالة الأولى (بدون انتظار)
      askAssistant({ ticketId: newId, message: text, history: [] })
        .catch((aiError) => {
          console.error('خطأ في المساعد الذكي:', aiError);
          toast.error('تعذر رد المساعد الذكي: ' + aiError.message);
        });

      setTicketId(newId);
      setNewMessage('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="fixed inset-0 bg-gray-950 z-[70] flex items-center justify-center text-gray-300">
        <FaSpinner className="animate-spin me-2" /> جاري التحميل...
      </div>
    );
  }

  if (ticketId) {
    return (
      <SupportChat
        user={user}
        ticketId={ticketId}
        viewerMode="student"
        fullPage
        onClose={goHome}
      />
    );
  }

  return (
    <div dir="rtl" className="fixed inset-0 bg-gray-950 z-[70] flex flex-col">
      <div className="border-b border-gray-800 bg-gray-900/90 backdrop-blur flex-shrink-0">
        <div className="max-w-3xl mx-auto w-full flex items-center gap-2 p-3">
          <button onClick={goHome} className="text-gray-300 hover:text-white text-lg flex-shrink-0" title="رجوع">
            <FaArrowRight />
          </button>
          <BotAvatar size={38} />
          <div className="leading-tight">
            <p className="text-white font-bold text-sm">طلب دعم جديد</p>
            <p className="text-[11px] text-gray-400">المساعد الذكي وفريق الدعم</p>
          </div>
        </div>
      </div>

      <div className="chat-scroll flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center px-6 gap-3">
        <BotAvatar size={80} />
        <p className="text-white font-bold text-lg">كيف يمكننا مساعدتك؟</p>
        <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
          اكتب استفسارك في الأسفل. سيساعدك المساعد الذكي أولاً، ويتابع معك أحد المشرفين عند الحاجة.
        </p>
      </div>

      <ChatComposer
        value={newMessage}
        onChange={setNewMessage}
        onSend={handleCreate}
        sending={creating}
        placeholder="اكتب استفسارك هنا..."
        autoFocus
      />
    </div>
  );
};

export default SupportPage;