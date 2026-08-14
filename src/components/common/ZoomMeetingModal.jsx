import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { FaVideo, FaWindowRestore } from 'react-icons/fa';
import { supabase } from '../../supabaseClient'; // تأكد من مسار ملف الـ supabaseClient حسب مكان ملفك

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail, userRole = 1 }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [actualName, setActualName] = useState(userName || "مستخدم");
  const [actualEmail, setActualEmail] = useState(userEmail || "user@readandrise.com");
  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  // جلب الاسم الحقيقي للمستخدم من Supabase إذا كان المُمرر "teacher" أو غير موجود
  useEffect(() => {
    const fetchRealUser = async () => {
      try {
        if (!userName || userName === 'teacher' || userName === 'المعلم') {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // محاولة البحث في جدول المستخدمين لديك (مثلاً users أو profiles)
            const { data: profile } = await supabase
              .from('users')
              .select('name, full_name, email')
              .eq('id', user.id)
              .maybeSingle();

            if (profile) {
              setActualName(profile.name || profile.full_name || user.email.split('@')[0]);
              setActualEmail(profile.email || user.email);
            } else if (user.user_metadata?.full_name) {
              setActualName(user.user_metadata.full_name);
              setActualEmail(user.email);
            } else {
              setActualName(user.email.split('@')[0]);
              setActualEmail(user.email);
            }
          } else {
            setActualName("مستخدم المنصة");
          }
        } else {
          setActualName(userName);
          setActualEmail(userEmail || `${userName}@readandrise.com`);
        }
      } catch (err) {
        console.error("خطأ في جلب بيانات المستخدم:", err);
        setActualName(userName !== 'teacher' ? userName : "مستخدم");
      }
    };

    if (isOpen) {
      fetchRealUser();
    }
  }, [isOpen, userName, userEmail]);

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
          userName: actualName,   // ✅ الاسم الحقيقي الذي تم جلبه
          userEmail: actualEmail, // ✅ البريد الحقيقي
          role: userRole,
          tk: "",
          userZak: "",
          leaveUrl: window.location.href
        });

        setIsLoading(false);
      } catch (err) {
        console.error("❌ خطأ أثناء الانضمام للاجتماع:", err);
        toast.error("فشل الانضمام للاجتماع: " + (err.reason || err.message || JSON.stringify(err)));
        setIsLoading(false);
      }
    };

    const timer = setTimeout(() => {
      if (actualName) {
        initializeMeeting();
      }
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

        <div className="flex-1 w-full relative bg-black overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70">
              <div className="text-white text-lg font-bold animate-pulse">جاري تسجيل الدخول باسم {actualName}...</div>
            </div>
          )}
          <div 
            ref={zoomContainerRef} 
            id="zoomEmbedContainer"
            className="w-full h-full absolute inset-0"
          ></div>
        </div>
      </div>
    </div>
  );
};