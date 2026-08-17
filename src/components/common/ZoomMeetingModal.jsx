import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { FaVideo, FaWindowRestore, FaTimes } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail, userRole = 1 }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actualName, setActualName] = useState("جاري التحميل...");
  
  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    let client = null;
    let isMounted = true;

    const initializeMeetingAndUser = async () => {
      if (!isOpen || !meetingDetails || !zoomContainerRef.current) {
        setIsLoading(false);
        return;
      }

      // التحقق من وجود رقم الاجتماع
      const cleanMeetingNumber = String(meetingDetails.meeting_number || '').replace(/\s+/g, '');
      if (!cleanMeetingNumber) {
        setErrorMessage('رقم الاجتماع غير موجود أو غير صالح.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        // 1. تحديد الاسم
        let resolvedName = (userName && userName !== 'teacher' && userName !== 'المعلم') ? userName : null;
        let resolvedEmail = userEmail || "teacher@readandrise.com";

        if (!resolvedName) {
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
            if (user.email) {
              resolvedEmail = user.email;
              if (!resolvedName) resolvedName = user.email.split('@')[0];
            }
          }
        }

        if (!resolvedName) resolvedName = "المعلم";
        if (isMounted) setActualName(resolvedName);

        // 2. جلب التوقيع من الخادم
        const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';
        
        const response = await fetch(`${endpoint}/api/generate-signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            meetingNumber: cleanMeetingNumber, 
            role: userRole 
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `فشل جلب التوقيع (HTTP ${response.status})`);
        }
        
        const data = await response.json();
        if (!data.signature) {
          throw new Error('لم يتم استلام توقيع صالح من الخادم.');
        }

        if (!isMounted) return;

        // 3. تهيئة وبدء اجتماع Zoom
        client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        await client.init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: true
        });

        await client.join({
          signature: data.signature,
          meetingNumber: cleanMeetingNumber,
          password: meetingDetails.password || "",
          userName: resolvedName,
          userEmail: resolvedEmail,
          role: userRole,
          tk: "",
          userZak: "",
          leaveUrl: window.location.href
        });

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("❌ خطأ أثناء الانضمام للاجتماع:", err);
        if (isMounted) {
          let msg = err.reason || err.message || JSON.stringify(err);
          if (err.errorCode === 3000 || (err.reason && err.reason.includes("Already has other meetings in progress"))) {
            msg = "⚠️ يوجد اجتماع زوم مفتوح بالفعل بنفس الحساب. يرجى إغلاق أي نافذة سابقة.";
          }
          setErrorMessage(msg);
          setIsLoading(false);
        }
      }
    };

    if (isOpen && meetingDetails) {
      initializeMeetingAndUser();
    } else {
      // إذا أغلق المودال، نوقف التحميل ونمسح الأخطاء
      setIsLoading(false);
      setErrorMessage('');
    }

    return () => {
      isMounted = false;
      if (clientRef.current) {
        try {
          if (typeof clientRef.current.leaveMeeting === 'function') {
            clientRef.current.leaveMeeting();
          } else if (typeof clientRef.current.leave === 'function') {
            clientRef.current.leave();
          }
        } catch (e) {
          console.warn("إغلاق الجلسة:", e);
        }
      }
    };
  }, [isOpen, meetingDetails, userRole, userName, userEmail]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 md:p-4">
      <style>{`
        #zoomEmbedContainer {
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          overflow: hidden !important;
          background-color: #000 !important;
        }
        #zoomEmbedContainer > div,
        #zoomEmbedContainer .wal-layout-container,
        #zoomEmbedContainer .zm-client-container,
        #zoomEmbedContainer .meeting-client {
          width: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
        }
      `}</style>

      <div className={`bg-gray-950 flex flex-col overflow-hidden shadow-2xl ${
        isMaximized ? "w-screen h-screen" : "w-full md:w-[90vw] h-full md:h-[90vh] md:rounded-2xl border border-gray-800"
      }`}>
        <div className="bg-gray-900 px-4 py-3 flex justify-between items-center text-white shrink-0">
          <div className="flex items-center gap-2 font-bold">
            <FaVideo className="text-blue-400" />
            <span>اجتماع Zoom المباشر ({actualName})</span>
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
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition font-bold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>

        <div className="flex-1 w-full relative bg-black overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-950">
              <div className="text-white font-bold animate-pulse text-lg">
                جاري الانضمام للاجتماع...
              </div>
            </div>
          )}
          {!isLoading && errorMessage && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-950 p-4">
              <div className="text-red-400 text-center max-w-md">
                <p className="text-xl font-bold mb-2">⚠️ حدث خطأ</p>
                <p className="text-sm">{errorMessage}</p>
                <button
                  onClick={onClose}
                  className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}
          <div ref={zoomContainerRef} id="zoomEmbedContainer" className="w-full h-full block"></div>
        </div>
      </div>
    </div>
  );
};