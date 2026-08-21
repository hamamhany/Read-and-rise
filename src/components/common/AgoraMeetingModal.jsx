import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaShareAlt,
  FaStop,
  FaPhoneSlash,
  FaSpinner,
} from 'react-icons/fa';
import { getAgoraToken } from '../../services/agora';

export const AgoraMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails,
  userName,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // حالات التحكم
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);

  // عند التبديل بين كتم الصوت والفيديو
  const toggleAudio = () => {
    const track = localTracksRef.current.audioTrack;
    if (!track) return;
    if (isAudioMuted) {
      track.setEnabled(true);
      setIsAudioMuted(false);
    } else {
      track.setEnabled(false);
      setIsAudioMuted(true);
    }
  };

  const toggleVideo = () => {
    const track = localTracksRef.current.videoTrack;
    if (!track) return;
    if (isVideoMuted) {
      track.setEnabled(true);
      setIsVideoMuted(false);
    } else {
      track.setEnabled(false);
      setIsVideoMuted(true);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // إيقاف مشاركة الشاشة
      if (screenTrackRef.current) {
        screenTrackRef.current.close();
        screenTrackRef.current = null;
        // إعادة تشغيل فيديو الكاميرا
        const videoTrack = localTracksRef.current.videoTrack;
        if (videoTrack) {
          await clientRef.current.publish(videoTrack);
          if (localVideoRef.current) videoTrack.play(localVideoRef.current);
        }
      }
      setIsScreenSharing(false);
      return;
    }

    // بدء مشاركة الشاشة
    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'auto');
      screenTrackRef.current = screenTrack;
      // إلغاء نشر فيديو الكاميرا الحالي مؤقتاً
      const videoTrack = localTracksRef.current.videoTrack;
      if (videoTrack) {
        await clientRef.current.unpublish(videoTrack);
        videoTrack.stop();
      }
      // نشر فيديو الشاشة
      await clientRef.current.publish(screenTrack);
      // عرض الشاشة في مكان الفيديو المحلي
      if (localVideoRef.current) {
        screenTrack.play(localVideoRef.current);
      }
      setIsScreenSharing(true);
    } catch (err) {
      console.error('فشل مشاركة الشاشة:', err);
      setErrorMessage('تعذر بدء مشاركة الشاشة: ' + err.message);
    }
  };

  const leaveCall = async () => {
    // تنظيف المسارات
    const { audioTrack, videoTrack } = localTracksRef.current;
    try {
      if (audioTrack) {
        await clientRef.current.unpublish(audioTrack);
        audioTrack.close();
      }
      if (videoTrack) {
        await clientRef.current.unpublish(videoTrack);
        videoTrack.close();
      }
      if (screenTrackRef.current) {
        await clientRef.current.unpublish(screenTrackRef.current);
        screenTrackRef.current.close();
      }
      await clientRef.current.leave();
    } catch (e) {
      console.warn('خطأ أثناء الخروج:', e);
    }
    onClose();
  };

  useEffect(() => {
    let isMounted = true;

    const joinChannel = async () => {
      const channelName = meetingDetails?.channel_name;
      if (!isOpen || !channelName) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        const { token, appId, uid } = await getAgoraToken(channelName);
        if (!token || !appId) throw new Error('لم يتم استلام توكن صالح من الخادم.');

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        // إدارة المستخدمين البعيدين
        client.on('user-published', async (remoteUser, mediaType) => {
          await client.subscribe(remoteUser, mediaType);
          if (mediaType === 'video' && remoteContainerRef.current) {
            let playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
            if (!playerDiv) {
              playerDiv = document.createElement('div');
              playerDiv.id = `agora-remote-${remoteUser.uid}`;
              playerDiv.className = 'agora-remote-video';
              playerDiv.style.width = '220px';
              playerDiv.style.height = '165px';
              playerDiv.style.background = '#111';
              playerDiv.style.borderRadius = '12px';
              playerDiv.style.overflow = 'hidden';
              remoteContainerRef.current.appendChild(playerDiv);
            }
            remoteUser.videoTrack.play(playerDiv);
          }
          if (mediaType === 'audio') remoteUser.audioTrack.play();
        });

        client.on('user-unpublished', (remoteUser, mediaType) => {
          if (mediaType === 'video') {
            const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
            if (playerDiv) playerDiv.remove();
          }
        });

        client.on('user-left', (remoteUser) => {
          const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
          if (playerDiv) playerDiv.remove();
        });

        await client.join(appId, channelName, token, uid);

        // تشغيل الكاميرا والميكروفون
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = { audioTrack, videoTrack };

        if (isMounted && localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }

        await client.publish([audioTrack, videoTrack]);

        if (isMounted) setIsLoading(false);
      } catch (err) {
        console.error('خطأ أثناء الانضمام:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'حدث خطأ غير متوقع.');
          setIsLoading(false);
        }
      }
    };

    joinChannel();

    return () => {
      isMounted = false;
      // تنظيف عند إغلاق المودال
      const { audioTrack, videoTrack } = localTracksRef.current;
      try {
        audioTrack?.close();
        videoTrack?.close();
        screenTrackRef.current?.close();
        clientRef.current?.leave();
      } catch (e) {
        console.warn('تنظيف:', e);
      }
      localTracksRef.current = { audioTrack: null, videoTrack: null };
      screenTrackRef.current = null;
      if (remoteContainerRef.current) remoteContainerRef.current.innerHTML = '';
    };
  }, [isOpen, meetingDetails]);

  // منع تمرير الصفحة
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="zoom-meeting-modal" dir="rtl">
      {/* خلفية التحميل */}
      {isLoading && (
        <div className="zoom-loading-overlay">
          <div className="zoom-loading-card">
            <div className="zoom-loading-spinner" />
            <div>جاري الانضمام إلى الحصة...</div>
          </div>
        </div>
      )}

      {/* خطأ */}
      {!isLoading && errorMessage && (
        <div className="zoom-error-overlay">
          <div className="zoom-error-card">
            <div className="zoom-error-title">⚠️ حدث خطأ</div>
            <div className="zoom-error-message">{errorMessage}</div>
            <button type="button" onClick={onClose} className="zoom-error-button">
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* منطقة الفيديو */}
      <div className="zoom-meeting-stage">
        <div
          className="agora-embed-root"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            width: '100%',
            height: '100%',
            padding: '10px',
            boxSizing: 'border-box',
          }}
        >
          <div
            ref={localVideoRef}
            className="agora-local-video"
            style={{
              width: 220,
              height: 165,
              background: '#111',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          />
          <div
            ref={remoteContainerRef}
            className="agora-remote-container"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              flex: 1,
            }}
          />
        </div>
      </div>

      {/* شريط الأزرار السفلي */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '16px',
          background: 'rgba(0,0,0,0.7)',
          padding: '12px 24px',
          borderRadius: 50,
          backdropFilter: 'blur(8px)',
          zIndex: 30,
          direction: 'ltr', // الأيقونات اتجاهها عربي
        }}
      >
        {/* كتم الصوت */}
        <button
          onClick={toggleAudio}
          className="control-btn"
          style={{
            background: isAudioMuted ? '#ef4444' : '#4b5563',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 48,
            height: 48,
            fontSize: 20,
            cursor: 'pointer',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isAudioMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
        >
          {isAudioMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        </button>

        {/* إيقاف الكاميرا */}
        <button
          onClick={toggleVideo}
          className="control-btn"
          style={{
            background: isVideoMuted ? '#ef4444' : '#4b5563',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 48,
            height: 48,
            fontSize: 20,
            cursor: 'pointer',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isVideoMuted ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
        >
          {isVideoMuted ? <FaVideoSlash /> : <FaVideo />}
        </button>

        {/* مشاركة الشاشة */}
        <button
          onClick={toggleScreenShare}
          className="control-btn"
          style={{
            background: isScreenSharing ? '#3b82f6' : '#4b5563',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 48,
            height: 48,
            fontSize: 20,
            cursor: 'pointer',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isScreenSharing ? 'إيقاف مشاركة الشاشة' : 'مشاركة الشاشة'}
        >
          {isScreenSharing ? <FaStop /> : <FaShareAlt />}
        </button>

        {/* إنهاء المكالمة */}
        <button
          onClick={leaveCall}
          className="control-btn"
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: 48,
            height: 48,
            fontSize: 20,
            cursor: 'pointer',
            transition: '0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="إنهاء المكالمة"
        >
          <FaPhoneSlash />
        </button>
      </div>
    </div>,
    document.body
  );
};