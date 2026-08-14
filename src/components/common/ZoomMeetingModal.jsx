import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { FaVideo, FaWindowRestore } from 'react-icons/fa';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail, userRole = 1 }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    let client = null;
    let isMounted = true;

    const getLiveSignature = async () => {
      try {
        const cleanMeetingNumber = String(meetingDetails.meeting_number).replace(/\s+/g, '');
        const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';
        
        console.log('🔍 جاري طلب توقيع لحظي:', {
          meetingNumber: cleanMeetingNumber,
          role: userRole // 1 للمضيف، 0 للمشارك
        });
        
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
        // 1. جلب توقيع طازج (جديد) من السيرفر
        const liveSignature = await getLiveSignature();
        
        if (!liveSignature) {
          toast.error('⚠️ فشل الحصول على توقيع صالح للاجتماع.');
          setIsLoading(false);
          return;
        }

        // 2. إنشاء عميل Zoom
        client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        const cleanMeetingNumber = String(meetingDetails.meeting_number).replace(/\s+/g, '');

        console.log('🔍 جاري الانضمام للاجتماع:', {
          meetingNumber: cleanMeetingNumber,
          role: userRole,
          signature: liveSignature.substring(0, 50) + '...'
        });

        // 3. تهيئة وبدء الاجتماع
        await client.init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: true
        });

        await client.join({
          signature: liveSignature, // ✅ استخدام التوقيع اللحظي (غير المخزن)
          meetingNumber: cleanMeetingNumber,
          password: meetingDetails.password || "",
          userName: userName || "مستخدم",
          userEmail: userEmail || `${userName || 'user'}@readandrise.com`,
          role: userRole, // 1 = مضيف، 0 = مشارك
          tk: "",
          userZak: "",
          leaveUrl: window.location.href
        });

        console.log("✅ تم الانضمام للاجتماع بنجاح داخل النافذة المنبثقة");
        setIsLoading(false);
      } catch (err) {
        console.error("❌ خطأ أثناء الانضمام للاجتماع:", err);
        toast.error("فشل الانضمام للاجتماع: " + (err.reason || err.message || JSON.stringify(err)));
        setIsLoading(false);
      }
    };

    initializeMeeting();

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
  }, [isOpen, meetingDetails, userName, userEmail, userRole]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div 
        className={`bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 overflow-hidden ${
          isMaximized ? "w-full h-full rounded-none" : "w-[90%] max-w-4xl h-[80vh]"
        }`}
      >
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center text-white">
          <div className="flex items-center gap-2 font-bold">
            <FaVideo className="text-blue-400" />
            <span>اجتماع Zoom المباشر</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition flex items-center gap-1"
            >
              <FaWindowRestore />
              <span>{isMaximized ? "استعادة" : "تكبير"}</span>
            </button>

            <button
              onClick={onClose}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition font-bold"
            >
              إغلاق
            </button>
          </div>
        </div>

        <div className="flex-1 w-full h-full bg-black relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
              <div className="text-white text-lg">جاري تحميل الاجتماع...</div>
            </div>
          )}
          <div ref={zoomContainerRef} className="w-full h-full" id="zoomEmbedContainer"></div>
        </div>
      </div>
    </div>
  );
};