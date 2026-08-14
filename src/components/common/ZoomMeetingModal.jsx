import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { FaVideo, FaWindowRestore } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail, userRole = 1 }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // البدء بالاسم المُمرر أو كقيمة افتراضية فورية لعدم التعليق
  const [actualName, setActualName] = useState(
    (userName && userName !== 'teacher') ? userName : "المعلم"
  );
  const [actualEmail, setActualEmail] = useState(userEmail || "teacher@readandrise.com");
  
  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  // جلب الاسم الحقيقي والدقيق من قاعدة البيانات في الخلفية
  useEffect(() => {
    const fetchRealUser = async () => {
      try {
        if (userName && userName !== 'teacher' && userName !== 'المعلم' && userName !== 'مستخدم المنصة') {
          setActualName(userName);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let resolvedName = null;

          if (user.user_metadata?.full_name) {
            resolvedName = user.user_metadata.full_name;
          } else if (user.user_metadata?.name) {
            resolvedName = user.user_metadata.name;
          }

          if (!resolvedName) {
            const { data: userRecord } = await supabase
              .from('users')
              .select('name, full_name, username')
              .eq('id', user.id)
              .maybeSingle();

            if (userRecord) {
              resolvedName = userRecord.full_name || userRecord.name || userRecord.username;
            }
          }

          if (!resolvedName) {
            const { data: profileRecord } = await supabase
              .from('profiles')
              .select('full_name, name, username')
              .eq('id', user.id)
              .maybeSingle();

            if (profileRecord) {
              resolvedName = profileRecord.full_name || profileRecord.name || profileRecord.username;
            }
          }

          if (!resolvedName && user.email) {
            resolvedName = user.email.split('@')[0];
          }

          if (resolvedName) {
            setActualName(resolvedName);
            setActualEmail(user.email);
          }
        }
      } catch (err) {
        console.error("خطأ في جلب بيانات المستخدم:", err);
      }
    };

    if (isOpen) {
      fetchRealUser();
    }
  }, [isOpen, userName]);

  useEffect(() => {
    let client = null;
    let isMounted = true;

    const getLiveSignature = async () => {
      try {
        const cleanMeetingNumber = String(meetingDetails.meeting_number).replace(/\s+/g, '');
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
          throw new Error(errorData.error || 'فشل جلب التوقيع');
        }
        
        const data = await response.json();
        return data.signature;
      } catch (err) {
        console.error('❌ فشل جلب التوقيع اللحظي:', err);
        throw err;
      }
    };

    const initializeMeeting = async () => {
      if (!isOpen || !meetingDetails || !zoomContainerRef.current || !isMounted) return;

      setIsLoading(true);

      try {
        const liveSignature = await getLiveSignature();
        
        if (!liveSignature) {
          toast.error('⚠️ فشل الحصول على توقيع صالح للاجتماع.');
          setIsLoading(false);
          return;
        }

        client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        const cleanMeetingNumber = String(meetingDetails.meeting_number).replace(/\s+/g, '');

        await client.init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: true
        });

        await client.join({
          signature: liveSignature,
          meetingNumber: cleanMeetingNumber,
          password: meetingDetails.password || "",
          userName: actualName,
          userEmail: actualEmail,
          role: userRole,
          tk: "",
          userZak: "",
          leaveUrl: window.location.href
        });

        setIsLoading(false);
      } catch (err) {
        console.error("❌ خطأ أثناء الانضمام للاجتماع:", err);
        
        if (err.errorCode === 3000 || (err.reason && err.reason.includes("Already has other meetings in progress"))) {
          toast.error("⚠️ يوجد اجتماع زوم مفتوح بالفعل بنفس الحساب. يرجى إغلاق أي نافذة سابقة.");
        } else {
          toast.error("فشل الانضمام للاجتماع: " + (err.reason || err.message || JSON.stringify(err)));
        }
        
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      initializeMeeting();
    }, 150);

    return () => {
      clearTimeout(timer);
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
  }, [isOpen, meetingDetails, actualName, actualEmail, userRole]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 md:p-4">
      <div 
        className={`bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
          isMaximized ? "w-full h-full rounded-none" : "w-[95%] max-w-6xl h-[85vh]"
        }`}
      >
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center text-white shrink-0">
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

        <div className="flex-1 w-full relative bg-black overflow-hidden min-h-0 flex flex-col">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70">
              <div className="text-white text-lg font-bold animate-pulse text-center px-4">
                جاري الانضمام للاجتماع باسم {actualName}...
              </div>
            </div>
          )}
          <div 
            ref={zoomContainerRef} 
            id="zoomEmbedContainer"
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
            className="w-full h-full absolute inset-0 !absolute !inset-0"
          ></div>
        </div>
      </div>
    </div>
  );
};