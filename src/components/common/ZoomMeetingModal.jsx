import React, { useState, useEffect, useRef } from 'react';
import { FaVideo, FaWindowRestore, FaTimes } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [actualName, setActualName] = useState("جاري التحميل...");
  const [roomName, setRoomName] = useState("");
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    const initializeUserAndRoom = async () => {
      if (!isOpen || !meetingDetails) return;

      const rawMeetingNum = String(meetingDetails.meeting_number || meetingDetails.id || 'ReadAndRiseClass');
      const cleanRoom = `ReadAndRise_${rawMeetingNum.replace(/[^a-zA-Z0-9_-]/g, '')}`;
      if (isMounted) setRoomName(cleanRoom);

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

  // تحميل وتشغيل واجهة Jitsi رسمياً داخل المنصة
  useEffect(() => {
    if (!isOpen || !roomName || actualName === "جاري التحميل...") return;

    let scriptTag = document.getElementById('jitsi-external-api-script');

    const initJitsi = () => {
      if (window.JitsiMeetExternalAPI && jitsiContainerRef.current) {
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
        }

        const domain = "meet.jit.si";
        const options = {
          roomName: roomName,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainerRef.current,
          userInfo: {
            displayName: actualName,
            email: userEmail || ''
          },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
          }
        };

        jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);

        jitsiApiRef.current.addEventListeners({
          readyToClose: () => {
            handleClose();
          },
        });
      }
    };

    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.id = 'jitsi-external-api-script';
      scriptTag.src = 'https://meet.jit.si/external_api.js';
      scriptTag.async = true;
      scriptTag.onload = initJitsi;
      document.body.appendChild(scriptTag);
    } else {
      initJitsi();
    }

    return () => {
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [isOpen, roomName, actualName, userEmail]);

  const handleClose = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.dispose();
      jitsiApiRef.current = null;
    }
    document.body.style.overflow = 'auto';
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 md:p-4" dir="rtl">
      <div className={`bg-gray-950 flex flex-col overflow-hidden shadow-2xl transition-all duration-300 ${
        isMaximized ? "w-screen h-screen md:rounded-none" : "w-full md:w-[92vw] h-full md:h-[92vh] md:rounded-2xl border border-gray-800"
      }`}>
        {/* شريط العنوان العلوي */}
        <div className="bg-gray-900 px-4 py-3 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2 font-bold">
            <FaVideo className="text-blue-400" />
            <span>غرفة البث المباشر ({actualName})</span>
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
              onClick={handleClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition font-bold flex items-center gap-1 cursor-pointer"
            >
              <FaTimes />
              <span>إغلاق</span>
            </button>
          </div>
        </div>

        {/* الحاوية الداخلية التي سيظهر فيها الاجتماع مباشرة داخل موقعك */}
        <div className="flex-1 w-full relative bg-black overflow-hidden">
          <div ref={jitsiContainerRef} className="w-full h-full" />
          {(!roomName || actualName === "جاري التحميل...") && (
            <div className="absolute inset-0 flex items-center justify-center text-white font-bold animate-pulse bg-gray-950">
              جاري تجهيز الغرفة داخل المنصة...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};