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
          role: userRole
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
      if (!isOpen || !meetingDetails || !zoomContainerRef.current || !isMounted) {
        setIsLoading(false);
        return;
      }

      if (!meetingDetails.meeting_number) {
        toast.error('⚠️ رقم الاجتماع غير موجود.');
        setIsLoading(false);
        return;
      }

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

        console.log('🔍 جاري الانضمام للاجتماع:', {
          meetingNumber: cleanMeetingNumber,
          role: userRole,
          signature: liveSignature.substring(0, 50) + '...'
        });

        await client.init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: true
        });

        const displayName = userName || 'مستخدم';
        const email = userEmail || `${displayName}@readandrise.com`;

        await client.join({
          signature: liveSignature,
          meetingNumber: cleanMeetingNumber,
          password: meetingDetails.password || "",
          userName: displayName,
          userEmail: email,
          role: userRole,
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
        {/* رأس النافذة */}
        <div className="bg-gray-800 px-4 py-3 border-b border-gray-700 flex justify-between items-center text-white flex-shrink-0">
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

        {/* حاوية Zoom مع منع الفائض والتمركز */}
        <div className="flex-1 w-full h-full bg-black relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
              <div className="text-white text-lg">جاري تحميل الاجتماع...</div>
            </div>
          )}
          <div 
            ref={zoomContainerRef} 
            id="zoomEmbedContainer" 
            className="w-full h-full"
            style={{ width: '100%', height: '100%', position: 'relative' }}
          />
        </div>
      </div>
    </div>
  );
};