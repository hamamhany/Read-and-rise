import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { getAgoraToken } from '../../services/agora';

// meetingDetails المتوقع: { channel_name, topic }
export const AgoraMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails,
  userName
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });

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
        // 1. جلب توكن دخول آمن من السيرفر الخلفي
        const { token, appId, uid } = await getAgoraToken(channelName);

        if (!token || !appId) {
          throw new Error('لم يتم استلام توكن صالح من الخادم.');
        }

        // 2. إنشاء عميل Agora والانضمام للغرفة
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        // عند نشر مستخدم آخر لصوته/فيديوه، نعرضه تلقائياً
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
          if (mediaType === 'audio') {
            remoteUser.audioTrack.play();
          }
        });

        // عند خروج مستخدم أو إيقافه للفيديو، نشيل مربعه من الشاشة
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

        // 3. تشغيل كاميرا وميكروفون المستخدم الحالي ونشرهم بالغرفة
        const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current = { audioTrack, videoTrack };

        if (isMounted && localVideoRef.current) {
          videoTrack.play(localVideoRef.current);
        }

        await client.publish([audioTrack, videoTrack]);

        if (isMounted) setIsLoading(false);
      } catch (err) {
        console.error('❌ خطأ أثناء الانضمام للحصة:', err);
        if (isMounted) {
          setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء الانضمام للحصة.');
          setIsLoading(false);
        }
      }
    };

    joinChannel();

    return () => {
      isMounted = false;

      const { audioTrack, videoTrack } = localTracksRef.current;
      try {
        audioTrack?.close();
        videoTrack?.close();
      } catch (e) {
        console.warn('تنظيف مسارات الصوت/الفيديو:', e);
      }
      localTracksRef.current = { audioTrack: null, videoTrack: null };

      if (clientRef.current) {
        try {
          clientRef.current.leave();
        } catch (e) {
          console.warn('إغلاق جلسة Agora:', e);
        }
        clientRef.current = null;
      }

      if (remoteContainerRef.current) {
        remoteContainerRef.current.innerHTML = '';
      }
    };
  }, [isOpen, meetingDetails]);

  // منع تمرير الصفحة أثناء وجود الحصة
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const meetingUI = (
    <div
      className="zoom-meeting-modal"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="حصة مباشرة"
    >
      <button
        type="button"
        onClick={onClose}
        className="zoom-floating-close"
        aria-label="إغلاق الحصة"
        title="إغلاق الحصة"
      >
        إغلاق
      </button>

      <div className="zoom-meeting-stage">
        {isLoading && (
          <div className="zoom-loading-overlay">
            <div className="zoom-loading-card">
              <div className="zoom-loading-spinner" />
              <div>جاري الانضمام إلى الحصة...</div>
            </div>
          </div>
        )}

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

        <div
          className="agora-embed-root"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            width: '100%',
            height: '100%',
            padding: '10px',
            boxSizing: 'border-box'
          }}
        >
          <div
            ref={localVideoRef}
            className="agora-local-video"
            style={{ width: 220, height: 165, background: '#111', borderRadius: 12, overflow: 'hidden' }}
          />
          <div
            ref={remoteContainerRef}
            className="agora-remote-container"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              flex: 1
            }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(meetingUI, document.body);
};