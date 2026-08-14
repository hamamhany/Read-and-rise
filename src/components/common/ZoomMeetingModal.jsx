import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { FaVideo, FaWindowRestore } from 'react-icons/fa';

export const ZoomMeetingModal = ({ isOpen, onClose, meetingDetails, userName, userEmail }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    let client = null;

    if (isOpen && meetingDetails && zoomContainerRef.current) {
      client = ZoomMtgEmbedded.createClient();
      clientRef.current = client;

      const cleanMeetingNumber = String(meetingDetails.meeting_number).replace(/\s+/g, '');

      client
        .init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: true
        })
        .then(() => {
          return client.join({
            clientId: import.meta.env.VITE_ZOOM_SDK_KEY || "PBgN3JSjQKFXka6N4_Zng",
            signature: meetingDetails.signature,
            meetingNumber: cleanMeetingNumber,
            password: meetingDetails.password || "",
            userName: userName || "مستخدم",
            userEmail: userEmail || `${userName || 'user'}@readandrise.com`,
            tk: "",
            userZak: ""
          });
        })
        .then(() => {
          console.log("تم الانضمام للاجتماع بنجاح داخل النافذة المنبثقة");
        })
        .catch((err) => {
          console.error("خطأ أثناء التهيئة أو الانضمام للاجتماع:", err);
          toast.error("فشل الانضمام للاجتماع: " + (err.reason || err.message || JSON.stringify(err)));
        });
    }

    return () => {
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
  }, [isOpen, meetingDetails, userName, userEmail]);

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
          <div ref={zoomContainerRef} className="w-full h-full" id="zoomEmbedContainer"></div>
        </div>
      </div>
    </div>
  );
};