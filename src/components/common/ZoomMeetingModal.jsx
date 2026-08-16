import React, { useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName }) => {
  const jitsiContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    const startJitsiSession = async () => {
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

      if (!isMounted) return;

      const init = () => {
        if (window.JitsiMeetExternalAPI && jitsiContainerRef.current) {
          if (jitsiApiRef.current) {
            jitsiApiRef.current.dispose();
          }

          const options = {
            roomName: cleanRoom,
            width: '100%',
            height: '100%',
            parentNode: jitsiContainerRef.current,
            userInfo: {
              displayName: resolvedName,
            },
            configOverwrite: {
              startWithAudioMuted: false,
              startWithVideoMuted: false,
              prejoinPageEnabled: false,
              enableWelcomePage: false,
              disableDeepLinking: true,
            },
            interfaceConfigOverwrite: {
              SHOW_JITSI_WATERMARK: false,
              SHOW_WATERMARK_FOR_GUESTS: false,
              SHOW_BRAND_WATERMARK: false,
              DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            }
          };

          // استخدام meet.jit.si كدومين للغرفة بشكل طبيعي
          jitsiApiRef.current = new window.JitsiMeetExternalAPI("meet.jit.si", options);
          
          jitsiApiRef.current.addEventListeners({
            readyToClose: () => {
              handleClose();
            },
          });
        }
      };

      // التحقق من وجود السكريبت أو تحميله من رابط 8x8 الآمن لتجاوز مشكلة CORS
      let scriptTag = document.getElementById('jitsi-external-api-script');
      if (!window.JitsiMeetExternalAPI) {
        if (!scriptTag) {
          scriptTag = document.createElement('script');
          scriptTag.id = 'jitsi-external-api-script';
          scriptTag.src = 'https://8x8.vc/v1/external_api.js'; // تم التعديل لتجاوز حظر CORS
          scriptTag.async = true;
          scriptTag.onload = init;
          document.body.appendChild(scriptTag);
        } else {
          scriptTag.onload = init;
        }
      } else {
        init();
      }
    };

    startJitsiSession();

    return () => {
      isMounted = false;
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }
    };
  }, [isOpen, meetingDetails, userName]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-0 md:p-4" dir="rtl">
      <div className="w-full h-full md:w-[95vw] md:h-[94vh] bg-gray-950 md:rounded-2xl border border-gray-800 flex flex-col overflow-hidden shadow-2xl">
        <div className="bg-gray-900 px-4 py-2.5 flex justify-between items-center text-white shrink-0 border-b border-gray-800">
          <div className="flex items-center gap-2 font-bold text-sm md:text-base">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
            <span>غرفة البث المباشر</span>
          </div>
          <button
            onClick={handleClose}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs md:text-sm transition font-bold flex items-center gap-1 cursor-pointer"
          >
            <FaTimes />
            <span>إغلاق</span>
          </button>
        </div>
        <div className="flex-1 w-full relative bg-black">
          <div ref={jitsiContainerRef} className="w-full h-full absolute inset-0" />
        </div>
      </div>
    </div>
  );
};