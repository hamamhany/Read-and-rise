import React, { useState, useEffect } from 'react';
import { FaVideo, FaExternalLinkAlt } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail }) => {
  const [actualName, setActualName] = useState("جاري التحميل...");
  const [roomUrl, setRoomUrl] = useState("");

  useEffect(() => {
    let isMounted = true;

    const initializeUserAndRoom = async () => {
      if (!isOpen || !meetingDetails) return;

      const rawMeetingNum = String(meetingDetails.meeting_number || meetingDetails.id || 'ReadAndRiseClass');
      const cleanRoom = `ReadAndRise_${rawMeetingNum.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      
      let resolvedName = (userName && userName !== 'teacher' && userName !== 'المعلم') ? userName : null;

      if (!resolvedName) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            if (user.user_metadata?.full_name) {
              resolvedName = user.user_metadata.full_name;
            } else if (user.user_metadata?.name) {
              resolvedName = user.user_metadata.name;
            } else {
              const { data: userRecord } = await supabase
                .from('users')
                .select('name, full_name, username')
                .eq('id', user.id)
                .maybeSingle();
              if (userRecord) {
                resolvedName = userRecord.full_name || userRecord.name || userRecord.username;
              } else {
                const { data: profileRecord } = await supabase
                  .from('profiles')
                  .select('full_name, name, username')
                  .eq('id', user.id)
                  .maybeSingle();
                if (profileRecord) {
                  resolvedName = profileRecord.full_name || profileRecord.name || profileRecord.username;
                }
              }
            }
            if (!resolvedName && user.email) {
              resolvedName = user.email.split('@')[0];
            }
          }
        } catch (e) {
          console.error("خطأ في جلب بيانات المستخدم:", e);
        }
      }

      if (!resolvedName) resolvedName = "مستخدم المنصة";
      
      if (isMounted) {
        setActualName(resolvedName);
        const finalUrl = `https://meet.jit.si/${cleanRoom}#userInfo.displayName="${encodeURIComponent(resolvedName)}"`;
        setRoomUrl(finalUrl);
      }
    };

    initializeUserAndRoom();

    return () => {
      isMounted = false;
    };
  }, [isOpen, meetingDetails, userName]);

  if (!isOpen) return null;

  const openMeetingInNewTab = () => {
    if (roomUrl) {
      window.open(roomUrl, '_blank');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" dir="rtl">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl text-white p-6 flex flex-col items-center text-center">
        
        <div className="w-16 h-16 bg-blue-600/25 text-blue-400 rounded-full flex items-center justify-center text-2xl mb-4 shadow-inner">
          <FaVideo />
        </div>

        <h3 className="text-xl font-bold mb-2">غرفة البث المباشر</h3>
        <p className="text-gray-400 text-sm mb-6">
          <span>جاهز للانضمام باسم: </span>
          <span className="text-white font-semibold">{actualName}</span>
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={openMeetingInNewTab}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
          >
            <FaExternalLinkAlt />
            <span>الانضمام إلى الغرفة الآن</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition font-medium cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};