import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHeadset } from 'react-icons/fa';
import { getStudentOpenTicket } from '../../services/support';

const SupportButton = ({ user }) => {
  const navigate = useNavigate();
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

  // الدعم صار شاشة مستقلة على الرابط /support
  const openSupport = () => navigate('/support');

  return (
    <div className="fixed bottom-6 left-6 z-[60] flex flex-col items-start">
      {showBubble && (
        <div onClick={openSupport} className="mb-3 bg-white text-slate-800 p-3 rounded-2xl rounded-bl-none shadow-lg border border-slate-200 cursor-pointer animate-bubble flex items-center gap-2 text-sm font-bold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          تم إغلاق المحادثة. اضغط للمراجعة.
        </div>
      )}
      <button onClick={openSupport} className="relative w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
        <FaHeadset size={24} />
        {hasUnread && <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-red-dot"></span>}
      </button>
    </div>
  );
};

export default SupportButton;