import React, { useState, useEffect } from 'react';
import { FaVideo, FaWindowRestore, FaTimes } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [actualName, setActualName] = useState("جاري التحميل...");
  const [roomName, setRoomName] = useState("");

  useEffect(() => {
    let isMounted = true;

    const initializeUserAndRoom = async () => {
      if (!isOpen || !meetingDetails) return;

      // 1. تنظيف وتجهيز اسم الغرفة بناءً على رقم الاجتماع أو العنوان
      const rawMeetingNum = String(meetingDetails.meeting_number || meetingDetails.id || 'ReadAndRiseClass');
      const cleanRoom = `ReadAndRise_${rawMeetingNum.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      if (isMounted) setRoomName(cleanRoom);

      // 2. جلب اسم المستخدم الفعلي
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
      if (isMounted) setActualName(resolvedName);
    };

    initializeUserAndRoom();

    return () => {
      isMounted = false;
    };
  }, [isOpen, meetingDetails, userName]);

  if (!isOpen) return null;

  // رابط Jitsi الجاهز مع تمرير اسم المستخدم تلقائياً
  const jitsiUrl = `https://meet.jit.si/${roomName}#userInfo.displayName="${encodeURIComponent(actualName)}"` +
    (userEmail ? `&userInfo.email="${encodeURIComponent(userEmail)}"` : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 md:p-4">
      <div className={`bg-gray-950 flex flex-col overflow-hidden shadow-2xl transition-all duration-300 ${
        isMaximized ? "w-screen h-screen md:rounded-none" : "w-full md:w-[90vw] h-full md:h-[90vh] md:rounded-2xl border border-gray-800"
      }`}>
        {/* شريط العنوان العلوي */}
        <div className="bg-gray-900 px-4 py-3 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2 font-bold">
            <FaVideo className="text-blue-400" />
            <span>البث المباشر ({actualName})</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition flex items-center gap-1 cursor-pointer"
            >
              <FaWindowRestore />
              <span>{isMaximized ? "استعادة" : "تكبير"}</span>
            </button>

            <button
              onClick={onClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition font-bold flex items-center gap-1 cursor-pointer"
            >
              <FaTimes />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        {/* حاوية الاجتماع (Iframe خفيف وسريع) */}
        <div className="flex-1 w-full relative bg-black overflow-hidden">
          {roomName ? (
            <iframe
              src={jitsiUrl}
              allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-read; clipboard-write"
              style={{ width: '100%', height: '100%', border: '0' }}
              title="Jitsi Meeting Room"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold animate-pulse">
              جاري تجهيز الغرفة...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};