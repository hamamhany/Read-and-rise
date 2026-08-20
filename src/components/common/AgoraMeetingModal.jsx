import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { joinAgoraRoom, leaveAgoraRoom } from '../services/agora'; // استيراد دوال أجورا

export const AgoraMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    const startMeeting = async () => {
      if (!isOpen || !meetingDetails) return;

      setIsLoading(true);
      try {
        // نستخدم رقم الاجتماع كاسم للقناة في أجورا
        const channelName = String(meetingDetails.meeting_number || 'default-channel');
        
        // الانضمام باستخدام دوال أجورا التي أنشأناها
        await joinAgoraRoom(channelName, 'local-video-container', 'remote-video-container');
        
        if (isMounted) setIsLoading(false);
      } catch (err) {
        console.error('خطأ في الاتصال:', err);
        if (isMounted) {
          setErrorMessage('فشل الاتصال بغرفة الفيديو.');
          setIsLoading(false);
        }
      }
    };

    if (isOpen) {
      startMeeting();
    }

    return () => {
      isMounted = false;
      leaveAgoraRoom(); // مغادرة الغرفة عند إغلاق النافذة
    };
  }, [isOpen, meetingDetails]);

  if (!isOpen) return null;

  const meetingUI = (
    <div className="agora-meeting-modal" dir="rtl">
      <button onClick={onClose} className="agora-floating-close">إغلاق</button>

      <div className="agora-meeting-stage" style={{ display: 'flex', gap: '10px' }}>
        {isLoading && <div>جاري الاتصال...</div>}
        
        {/* مكان فيديو المستخدم المحلي */}
        <div id="local-video-container" style={{ width: '300px', height: '200px', background: '#000' }}></div>
        
        {/* مكان فيديوهات الآخرين */}
        <div id="remote-video-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}></div>
      </div>
    </div>
  );

  return createPortal(meetingUI, document.body);
};