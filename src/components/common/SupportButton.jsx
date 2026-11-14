import React, { useState, useEffect } from 'react';
import { FaHeadset } from 'react-icons/fa';
import { createSupportTicket, getStudentOpenTicket, markTicketAsRead, dismissClosedBubble } from '../../services/support';
import { sanitizeInput } from '../../utils/helpers';
import SupportChat from './SupportChat';
import { askAssistant } from '../../utils/askAssistant';
import toast from 'react-hot-toast';

const SupportButton = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [showBubble, setShowBubble] = useState(false);

  useEffect(() => {
    if (!user) return;
    const checkStatus = async () => {
      const ticket = await getStudentOpenTicket(user.id);
      if (ticket) {
        if (!ticket.isClosed) {
          setHasUnread(!!ticket.unreadForStudent);
          setShowBubble(false);
        } else {
          setHasUnread(false);
          setShowBubble(true);
        }
      } else {
        setHasUnread(false);
        setShowBubble(false);
      }
    };
    checkStatus();
    const int = setInterval(checkStatus, 10000);
    return () => clearInterval(int);
  }, [user]);

  if (!user) return null;

  const openSupport = async () => {
    setChecking(true);
    try {
      const ticket = await getStudentOpenTicket(user.id);
      if (ticket && !ticket.isClosed) {
        setActiveTicket(ticket);
        setShowNewForm(false);
        if (ticket.unreadForStudent) {
          await markTicketAsRead(ticket.id, 'student');
          setHasUnread(false);
        }
      } else if (ticket && ticket.isClosed) {
        setActiveTicket(ticket);
        setShowNewForm(false);
        setShowBubble(false);
        await dismissClosedBubble(ticket.id);
      } else {
        setShowNewForm(true);
      }
      setOpen(true);
    } catch (err) {
      toast.error('فشل فتح الدعم: ' + err.message);
    } finally {
      setChecking(false);
    }
  };

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
      setActiveTicket(newTicket);
      setShowNewForm(false);
      setNewMessage('');

      // المساعد الذكي يرد على الرسالة الأولى (بدون انتظار، عشان المحادثة تنفتح فوراً)
      askAssistant({ ticketId: newTicket?.id || id, message: text, history: [] })
        .catch((aiError) => {
          console.error('خطأ في المساعد الذكي:', aiError);
          toast.error('تعذر رد المساعد الذكي: ' + aiError.message);
        });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setActiveTicket(null);
    setShowNewForm(false);
    setNewMessage('');
  };

  return (
    <>
      <div className="fixed bottom-6 left-6 z-[60] flex flex-col items-start">
        {showBubble && (
          <div onClick={openSupport} className="mb-3 bg-white text-slate-800 p-3 rounded-2xl rounded-bl-none shadow-lg border border-slate-200 cursor-pointer animate-bubble flex items-center gap-2 text-sm font-bold">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            تم إغلاق المحادثة. اضغط للمراجعة.
          </div>
        )}
        <button onClick={openSupport} disabled={checking} className="relative w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
          <FaHeadset size={24} />
          {hasUnread && <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-red-dot"></span>}
        </button>
      </div>

      {open && activeTicket && (
        <SupportChat user={user} ticketId={activeTicket.id} viewerMode="student" onClose={handleClose} />
      )}

      {open && showNewForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={handleClose}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-blue-500/30" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-blue-300 flex items-center gap-2 mb-3"><FaHeadset /> طلب دعم جديد</h3>
            <textarea className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-32" placeholder="اكتب استفسارك هنا..." value={newMessage} onChange={e => setNewMessage(e.target.value)} maxLength={2000} />
            <div className="flex gap-3 mt-3">
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold">{creating ? 'جاري الإرسال...' : 'إرسال'}</button>
              <button onClick={handleClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SupportButton;