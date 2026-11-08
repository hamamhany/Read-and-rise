import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FaHeadset } from 'react-icons/fa';
import { createSupportTicket, getStudentOpenTicket } from '../../services/support';
import { sanitizeInput } from '../../utils/helpers';
import { SUPPORT_TICKET_STATUS } from '../../constants';
import SupportChat from './SupportChat';

const SupportButton = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [creating, setCreating] = useState(false);

  if (!user) return null;

  const openSupport = async () => {
    setChecking(true);
    try {
      const ticket = await getStudentOpenTicket(user.id);
      if (ticket) {
        setActiveTicketId(ticket.id);
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
      toast.success('✅ تم إرسال طلبك — بانتظار مشرف');
      setActiveTicketId(id);
      setShowNewForm(false);
      setNewMessage('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setActiveTicketId(null);
    setShowNewForm(false);
    setNewMessage('');
  };

  return (
    <>
      <button onClick={openSupport} disabled={checking} className="support-float-btn" title="الدعم الفني" aria-label="الدعم الفني">
        <FaHeadset size={26} />
      </button>

      {open && activeTicketId && (
        <SupportChat
          user={user}
          ticketId={activeTicketId}
          onClose={handleClose}
        />
      )}

      {open && showNewForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={handleClose}>
          <div className="bg-gray-900 p-6 rounded-3xl max-w-md w-full border border-blue-500/30" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-blue-300 flex items-center gap-2 mb-3"><FaHeadset /> طلب دعم جديد</h3>
            <p className="text-xs text-gray-400 mb-3">
              مرحباً {user.name || 'بك'}، اكتب استفسارك وسيتواصل معك أحد المشرفين.
            </p>
            <textarea
              className="w-full bg-gray-800 text-right p-3 border border-gray-600 rounded-lg text-white resize-none h-32"
              placeholder="اكتب استفسارك هنا..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              maxLength={2000}
            />
            <div className="flex gap-3 mt-3">
              <button onClick={handleCreate} disabled={creating} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:opacity-50 font-bold">
                {creating ? 'جاري الإرسال...' : 'إرسال'}
              </button>
              <button onClick={handleClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SupportButton;