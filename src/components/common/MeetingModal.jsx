import React, { useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import { supabase } from '../supabaseClient';

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
      
      const appID = "8ddf7e6e53d64f5ab890462f1ddbaf3a";
      const fullRoomName = `vpaas-magic-cookie-${appID}/${cleanRoom}`;
      
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

      // 1. طلب التوكن (JWT) من الدالة السحابية التي أنشأناها لتجاوز شاشة الانتظار
      let jitsiToken = null;
      try {
        const { data: funcData, error: funcError } = await supabase.functions.invoke('generate-jitsi-token', {
          body: { 
            userName: resolvedName, 
            userEmail: "teacher@readandrise.com",
            isModerator: true, 
            roomName: fullRoomName 
          }
        });
        if (!funcError && funcData?.token) {
          jitsiToken = funcData.token;
        }
      } catch (err) {
        console.error("خطأ في استدعاء توكن Jitsi:", err);
      }

      if (!isMounted) return;

      const init = () => {
        if (window.JitsiMeetExternalAPI && jitsiContainerRef.current) {
          if (jitsiApiRef.current) {
            jitsiApiRef.current.dispose();
          }

          const options = {
            roomName: fullRoomName,
            jwt: jitsiToken, // تمرير التوكن الأمني لفتح الغرفة فوراً كمضيف
            width: '100%',
            height: '100%',
            parentNode: jitsiContainerRef.current,
            userInfo: {
              displayName: resolvedName,
            },
            configOverwrite: {
              startWithAudioMuted: false,
              startWithVideoMuted: false,
              prejoinConfig: { enabled: false },
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

          jitsiApiRef.current = new window.JitsiMeetExternalAPI("8x8.vc", options);
          
          jitsiApiRef.current.addEventListeners({
            readyToClose: () => {
              handleClose();
            },
          });
        }
      };

      const scriptId = 'jitsi-external-api-script';
      let scriptTag = document.getElementById(scriptId);
      const expectedSrc = `https://8x8.vc/vpaas-magic-cookie-${appID}/external_api.js`;

      if (!window.JitsiMeetExternalAPI || (scriptTag && scriptTag.src !== expectedSrc)) {
        if (scriptTag) scriptTag.remove();
        
        scriptTag = document.createElement('script');
        scriptTag.id = scriptId;
        scriptTag.src = expectedSrc;
        scriptTag.async = true;
        scriptTag.onload = init;
        document.body.appendChild(scriptTag);
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