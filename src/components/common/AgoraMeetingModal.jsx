// src/components/common/AgoraMeetingModal.jsx

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { createClient as createRtmClient } from 'agora-rtm-sdk';
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaShareAlt,
  FaStop,
  FaPhoneSlash,
  FaSpinner,
  FaUsers,
  FaCommentDots,
  FaHandPaper,
  FaTimes,
  FaClock,
  FaForward,
  FaRedo,
} from 'react-icons/fa';
import { getAgoraToken } from '../../services/agora';

// ============================================================
// 1. شاشة ما قبل الانضمام (Pre-Join) - بدون معاينة
// ============================================================
const PreJoinScreen = ({
  userName,
  setUserName,
  isCameraOn,
  setIsCameraOn,
  isMicOn,
  setIsMicOn,
  onJoin,
  isLoading,
  countdown,
  onSkipWait,
  errorMessage,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full border border-gray-700 shadow-2xl relative">
        {/* العداد التنازلي */}
        <div className="absolute top-4 left-4 bg-purple-600/30 text-purple-300 px-4 py-2 rounded-full flex items-center gap-2 text-lg font-bold border border-purple-500/30">
          <FaClock className="text-purple-400" />
          <span>{countdown}</span>
          <span className="text-sm font-normal text-gray-400">ثانية</span>
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-6 mt-2">
          🎥 الانضمام إلى الحصة
        </h2>

        {/* أيقونة توضيحية بدلاً من المعاينة */}
        <div className="bg-black/60 rounded-xl overflow-hidden aspect-video mb-4 flex items-center justify-center border border-gray-600">
          <div className="text-center text-gray-400">
            <FaVideo className="text-6xl mx-auto mb-2 opacity-30" />
            <p className="text-sm">سيتم تشغيل الكاميرا عند الانضمام</p>
          </div>
        </div>

        {/* حقول الإدخال */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">اسمك الكامل</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="w-full bg-gray-700 text-white p-3 rounded-xl border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30"
              placeholder="أدخل اسمك..."
              dir="rtl"
            />
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            {/* مفتاح الكاميرا (تبديل فقط، بدون طلب أذونات) */}
            <button
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                isCameraOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'
              } text-white`}
            >
              {isCameraOn ? <FaVideo /> : <FaVideoSlash />}
              {isCameraOn ? 'الكاميرا مفعلة' : 'الكاميرا مطفأة'}
            </button>

            {/* مفتاح الميكروفون (تبديل فقط) */}
            <button
              onClick={() => setIsMicOn(!isMicOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                isMicOn ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-500'
              } text-white`}
            >
              {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
              {isMicOn ? 'الصوت مفعل' : 'الصوت مطفأ'}
            </button>
          </div>

          {/* زر تجاوز الانتظار */}
          <button
            onClick={onSkipWait}
            disabled={isLoading}
            className={`w-full py-3 rounded-xl text-white font-bold transition flex items-center justify-center gap-2 ${
              isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-700'
            }`}
          >
            {isLoading ? <FaSpinner className="animate-spin" /> : <FaForward />}
            {isLoading ? 'جاري الانضمام...' : 'تجاوز الانتظار (انضم الآن)'}
          </button>

          {/* عرض رسالة الخطأ إن وجدت */}
          {errorMessage && (
            <div className="bg-red-500/20 text-red-300 p-3 rounded-xl border border-red-500/30 text-sm flex items-center justify-between">
              <span>{errorMessage}</span>
              <button onClick={onSkipWait} className="text-yellow-400 hover:text-yellow-300 text-xs flex items-center gap-1">
                <FaRedo /> إعادة المحاولة
              </button>
            </div>
          )}

          <div className="text-center text-xs text-gray-500 mt-2">
            سيتم الانضمام تلقائياً خلال {countdown} ثانية
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 2. المكون الأساسي للاجتماع
// ============================================================
export const AgoraMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails,
  userName: initialUserName,
  isHost = false,
}) => {
  const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID;

  // ---- حالات شاشة ما قبل الانضمام ----
  const [isPreJoin, setIsPreJoin] = useState(true);
  const [userName, setUserName] = useState(initialUserName || 'مستخدم');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ---- حالات الحصة ----
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGalleryView, setIsGalleryView] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [participants, setParticipants] = useState([]);

  // ---- Refs ----
  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);
  const rtmClientRef = useRef(null);
  const rtmChannelRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  // ---- دوال التحكم ----
  const toggleAudio = () => {
    const track = localTracksRef.current.audioTrack;
    if (!track) return;
    if (isAudioMuted) {
      track.setEnabled(true);
      setIsAudioMuted(false);
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === String(clientRef.current?.uid) ? { ...p, isMuted: false } : p
        )
      );
    } else {
      track.setEnabled(false);
      setIsAudioMuted(true);
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === String(clientRef.current?.uid) ? { ...p, isMuted: true } : p
        )
      );
    }
  };

  const toggleVideo = () => {
    const track = localTracksRef.current.videoTrack;
    if (!track) return;
    if (isVideoMuted) {
      track.setEnabled(true);
      setIsVideoMuted(false);
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === String(clientRef.current?.uid) ? { ...p, isVideoOn: true } : p
        )
      );
    } else {
      track.setEnabled(false);
      setIsVideoMuted(true);
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === String(clientRef.current?.uid) ? { ...p, isVideoOn: false } : p
        )
      );
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenTrackRef.current) {
        await clientRef.current.unpublish(screenTrackRef.current);
        screenTrackRef.current.close();
        screenTrackRef.current = null;
      }
      const videoTrack = localTracksRef.current.videoTrack;
      if (videoTrack && !isVideoMuted) {
        await videoTrack.setEnabled(true);
        await clientRef.current.publish(videoTrack);
        if (localVideoRef.current) videoTrack.play(localVideoRef.current);
      }
      setIsScreenSharing(false);
      return;
    }

    try {
      const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'auto');
      screenTrackRef.current = screenTrack;
      const videoTrack = localTracksRef.current.videoTrack;
      if (videoTrack) {
        await clientRef.current.unpublish(videoTrack);
        await videoTrack.setEnabled(false);
        videoTrack.stop();
      }
      await clientRef.current.publish(screenTrack);
      if (localVideoRef.current) screenTrack.play(localVideoRef.current);
      setIsScreenSharing(true);
    } catch (err) {
      console.error('فشل مشاركة الشاشة:', err);
      setErrorMessage('تعذر بدء مشاركة الشاشة: ' + err.message);
    }
  };

  const sendChatMessage = async (text) => {
    if (!text.trim()) return;
    const message = text.trim();
    try {
      if (rtmChannelRef.current) {
        await rtmChannelRef.current.sendMessage({ text: message });
      }
    } catch (err) {
      console.warn('فشل إرسال الرسالة عبر RTM:', err);
    }
    setChatMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        user: userName,
        text: message,
        time: new Date(),
        isLocal: true,
      },
    ]);
    setChatInput('');
  };

  const toggleHandRaise = () => {
    const uid = String(clientRef.current?.uid);
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === uid ? { ...p, handRaised: !p.handRaised } : p
      )
    );
  };

  const leaveCall = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    try {
      if (rtmChannelRef.current) {
        await rtmChannelRef.current.leave();
        rtmChannelRef.current = null;
      }
      if (rtmClientRef.current) {
        await rtmClientRef.current.logout();
        rtmClientRef.current = null;
      }
    } catch (e) {
      console.warn('تنظيف RTM:', e);
    }

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
      console.warn('خطأ أثناء الخروج من RTC:', e);
    }
    onClose();
  };

  // ---- دالة الانضمام الفعلية ----
  const handleJoin = async () => {
    console.log('🔄 [handleJoin] تم استدعاء الدالة');
    console.log('📋 قيمة VITE_AGORA_APP_ID من env =', import.meta.env.VITE_AGORA_APP_ID);

    if (isLoading) {
      console.log('⚠️ [handleJoin] جاري التحميل بالفعل، تم تجاهل الاستدعاء');
      return;
    }

    if (!userName.trim()) {
      setErrorMessage('يرجى إدخال اسمك.');
      return;
    }

    const channelName = meetingDetails?.channel_name;
    if (!channelName) {
      setErrorMessage('لا يوجد غرفة للانضمام. يرجى إنشاء حصة أولاً.');
      return;
    }

    if (!AGORA_APP_ID) {
      const msg = 'App ID مفقود. يرجى تعيين VITE_AGORA_APP_ID في ملف .env وإعادة تشغيل الخادم.';
      setErrorMessage(msg);
      console.error('❌', msg);
      return;
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      console.log('🔄 جاري الانضمام إلى القناة:', channelName);
      console.log('📱 App ID:', AGORA_APP_ID);
      const { token, appId, uid } = await getAgoraToken(channelName);
      console.log('✅ تم استلام التوكن:', { token: token?.slice(0, 20) + '...', appId, uid });

      if (!token || !appId) throw new Error('لم يتم استلام توكن صالح من الخادم.');

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // ---- أحداث RTC ----
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        setParticipants((prev) => {
          const existing = prev.find((p) => p.id === String(remoteUser.uid));
          if (existing) {
            let updated = { ...existing };
            if (mediaType === 'video') updated.isVideoOn = true;
            if (mediaType === 'audio') updated.isMuted = false;
            return prev.map((p) => (p.id === String(remoteUser.uid) ? updated : p));
          } else {
            const newParticipant = {
              id: String(remoteUser.uid),
              name: `مشارك ${remoteUser.uid}`,
              isHost: false,
              isMuted: mediaType !== 'audio',
              isVideoOn: mediaType === 'video',
              handRaised: false,
            };
            return [...prev, newParticipant];
          }
        });

        if (mediaType === 'video' && remoteContainerRef.current) {
          let playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
          if (!playerDiv) {
            playerDiv = document.createElement('div');
            playerDiv.id = `agora-remote-${remoteUser.uid}`;
            playerDiv.className = 'agora-remote-video';
            playerDiv.style.width = '100%';
            playerDiv.style.height = '100%';
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

      client.on('user-unpublished', (remoteUser, mediaType) => {
        setParticipants((prev) =>
          prev.map((p) => {
            if (p.id === String(remoteUser.uid)) {
              let updated = { ...p };
              if (mediaType === 'video') updated.isVideoOn = false;
              if (mediaType === 'audio') updated.isMuted = true;
              return updated;
            }
            return p;
          })
        );
        if (mediaType === 'video') {
          const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
          if (playerDiv) playerDiv.remove();
        }
      });

      client.on('user-left', (remoteUser) => {
        setParticipants((prev) => prev.filter((p) => p.id !== String(remoteUser.uid)));
        const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
        if (playerDiv) playerDiv.remove();
      });

      // 3. الانضمام للقناة
      await client.join(appId, channelName, token, uid);
      console.log('✅ تم الانضمام إلى القناة بنجاح');

      // 4. إنشاء المسارات المحلية (هنا تطلب الأذونات)
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current = { audioTrack, videoTrack };

      // تطبيق إعدادات ما قبل الانضمام
      if (!isMicOn) {
        audioTrack.setEnabled(false);
        setIsAudioMuted(true);
      }
      if (!isCameraOn) {
        videoTrack.setEnabled(false);
        setIsVideoMuted(true);
      }

      if (localVideoRef.current) {
        videoTrack.play(localVideoRef.current);
      }

      await client.publish([audioTrack, videoTrack]);
      console.log('✅ تم نشر المسارات المحلية');

      // ============================================================
      // 5. RTM (الدردشة) - مع try/catch لمنع تعطل الحصة
      // ============================================================
      try {
        const rtmClient = createRtmClient(appId);
        rtmClientRef.current = rtmClient;
        await rtmClient.login({ uid: String(uid) });

        const rtmChannel = rtmClient.createChannel(channelName);
        rtmChannelRef.current = rtmChannel;
        await rtmChannel.join();

        rtmChannel.on('ChannelMessage', (message, memberId) => {
          const text = message.text;
          if (text.startsWith('🆔')) {
            const name = text.replace('🆔 ', '');
            setParticipants((prev) =>
              prev.map((p) => (p.id === memberId ? { ...p, name: name } : p))
            );
            return;
          }
          setChatMessages((prev) => [
            ...prev,
            {
              id: Date.now() + Math.random(),
              user: memberId,
              text: text,
              time: new Date(),
              isLocal: false,
            },
          ]);
        });

        await rtmChannel.sendMessage({ text: `🆔 ${userName}` });
      } catch (rtmError) {
        console.error('❌ فشل تهيئة RTM (الدردشة غير متاحة):', rtmError);
        // نستمر بدون دردشة، لا نوقف الحصة
      }

      // إضافة المستخدم المحلي إلى قائمة المشاركين
      setParticipants([
        {
          id: String(uid),
          name: userName,
          isHost: isHost,
          isMuted: !isMicOn,
          isVideoOn: isCameraOn,
          handRaised: false,
        },
      ]);

      setIsPreJoin(false);
    } catch (err) {
      console.error('❌ خطأ أثناء الانضمام:', err);
      setErrorMessage('فشل الانضمام: ' + (err.message || 'خطأ غير معروف'));
      // إعادة تشغيل العداد بعد فشل الانضمام
      setCountdown(30);
      startCountdown();
    } finally {
      setIsLoading(false);
    }
  };

  // ---- دالة بدء العد التنازلي ----
  const startCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(30);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          console.log('⏰ انتهى العداد، ننضم الآن...');
          handleJoin();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ---- تأثيرات (useEffects) ----
  useEffect(() => {
    if (isOpen && isPreJoin) {
      startCountdown();
      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    }
  }, [isOpen, isPreJoin]);

  // ---- تنظيف عند إغلاق المودال ----
  useEffect(() => {
    if (!isOpen) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      setIsPreJoin(true);
      setIsLoading(false);
      setErrorMessage('');
      setChatMessages([]);
      setParticipants([]);
      setCountdown(30);

      const { audioTrack, videoTrack } = localTracksRef.current;
      try {
        audioTrack?.close();
        videoTrack?.close();
        screenTrackRef.current?.close();
        clientRef.current?.leave();
      } catch (e) {}
      localTracksRef.current = { audioTrack: null, videoTrack: null };
      screenTrackRef.current = null;
      if (remoteContainerRef.current) remoteContainerRef.current.innerHTML = '';
    }
  }, [isOpen]);

  // ---- منع تمرير الصفحة ----
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  // ---- التصيير ----
  if (isPreJoin) {
    return createPortal(
      <div className="zoom-meeting-modal" dir="rtl">
        <PreJoinScreen
          userName={userName}
          setUserName={setUserName}
          isCameraOn={isCameraOn}
          setIsCameraOn={setIsCameraOn}
          isMicOn={isMicOn}
          setIsMicOn={setIsMicOn}
          onJoin={handleJoin}
          isLoading={isLoading}
          countdown={countdown}
          onSkipWait={() => {
            console.log('⏩ تجاوز الانتظار يدوياً');
            handleJoin();
          }}
          errorMessage={errorMessage}
        />
      </div>,
      document.body
    );
  }

  // ---- واجهة الحصة الرئيسية ----
  return createPortal(
    <div className="zoom-meeting-modal" dir="rtl">
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

      {!isLoading && !errorMessage && (
        <>
          <div className="zoom-meeting-stage">
            <div
              className="agora-embed-root"
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                padding: '10px',
                boxSizing: 'border-box',
                gap: '10px',
              }}
            >
              <div
                ref={remoteContainerRef}
                className="agora-remote-container"
                style={{
                  display: 'grid',
                  gridTemplateColumns: isGalleryView ? 'repeat(auto-fill, minmax(200px, 1fr))' : '1fr',
                  gap: '10px',
                  flex: 1,
                  minHeight: 0,
                }}
              />
              <div
                ref={localVideoRef}
                className="agora-local-video"
                style={{
                  position: 'absolute',
                  bottom: 90,
                  right: 20,
                  width: 220,
                  height: 165,
                  background: '#111',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '2px solid #4b5563',
                  zIndex: 10,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                }}
              />
            </div>

            {/* ===== شريط التحكم السفلي ===== */}
            <div
              style={{
                position: 'absolute',
                bottom: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '8px',
                background: 'rgba(0,0,0,0.8)',
                padding: '10px 20px',
                borderRadius: 50,
                backdropFilter: 'blur(12px)',
                zIndex: 30,
                direction: 'ltr',
                flexWrap: 'wrap',
                justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {/* ميكروفون */}
              <button
                onClick={toggleAudio}
                className="control-btn"
                style={{
                  background: isAudioMuted ? '#ef4444' : '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isAudioMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
              </button>

              {/* كاميرا */}
              <button
                onClick={toggleVideo}
                className="control-btn"
                style={{
                  background: isVideoMuted ? '#ef4444' : '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isScreenSharing ? <FaStop /> : <FaShareAlt />}
              </button>

              {/* تبديل العرض */}
              <button
                onClick={() => setIsGalleryView(!isGalleryView)}
                className="control-btn"
                style={{
                  background: '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isGalleryView ? '⊞' : '⊟'}
              </button>

              {/* المشاركين */}
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="control-btn"
                style={{
                  background: showParticipants ? '#3b82f6' : '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaUsers />
              </button>

              {/* الدردشة */}
              <button
                onClick={() => setShowChat(!showChat)}
                className="control-btn"
                style={{
                  background: showChat ? '#3b82f6' : '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaCommentDots />
              </button>

              {/* رفع اليد */}
              <button
                onClick={toggleHandRaise}
                className="control-btn"
                style={{
                  background: '#4b5563',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaHandPaper />
              </button>

              {/* خروج */}
              <button
                onClick={leaveCall}
                className="control-btn"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: 18,
                  cursor: 'pointer',
                  transition: '0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaPhoneSlash />
              </button>
            </div>
          </div>

          {/* ===== اللوحة الجانبية: المشاركين ===== */}
          {showParticipants && (
            <div
              className="side-panel"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 320,
                height: '100%',
                background: 'rgba(17,24,39,0.95)',
                backdropFilter: 'blur(12px)',
                borderRight: '1px solid rgba(255,255,255,0.1)',
                zIndex: 40,
                padding: '20px',
                overflowY: 'auto',
                direction: 'rtl',
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  <FaUsers className="inline-block me-2" /> المشاركين ({participants.length})
                </h3>
                <button
                  onClick={() => setShowParticipants(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  <FaTimes />
                </button>
              </div>
              {isHost && (
                <button
                  onClick={() => {
                    setParticipants((prev) =>
                      prev.map((p) => ({ ...p, isMuted: true }))
                    );
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl mb-4 text-sm font-bold"
                >
                  كتم صوت الجميع
                </button>
              )}
              <div className="space-y-2">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="bg-gray-800/60 p-3 rounded-xl border border-gray-700 flex justify-between items-center"
                  >
                    <div>
                      <span className="text-white text-sm">{p.name}</span>
                      {p.isHost && (
                        <span className="text-xs text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded mr-2">
                          👑 مضيف
                        </span>
                      )}
                      {p.handRaised && (
                        <span className="text-xs text-yellow-400 bg-yellow-950/40 px-2 py-0.5 rounded mr-2">
                          ✋ يد مرفوعة
                        </span>
                      )}
                      <div className="flex gap-1 mt-1">
                        {p.isMuted ? (
                          <FaMicrophoneSlash className="text-red-400 text-xs" />
                        ) : (
                          <FaMicrophone className="text-green-400 text-xs" />
                        )}
                        {p.isVideoOn ? (
                          <FaVideo className="text-green-400 text-xs" />
                        ) : (
                          <FaVideoSlash className="text-red-400 text-xs" />
                        )}
                      </div>
                    </div>
                    {isHost && !p.isHost && (
                      <div className="flex gap-1">
                        <button
                          onClick={() =>
                            setParticipants((prev) =>
                              prev.map((pp) =>
                                pp.id === p.id ? { ...pp, isMuted: !pp.isMuted } : pp
                              )
                            )
                          }
                          className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded"
                        >
                          {p.isMuted ? 'فك كتم' : 'كتم'}
                        </button>
                        <button
                          onClick={() =>
                            setParticipants((prev) => prev.filter((pp) => pp.id !== p.id))
                          }
                          className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
                        >
                          إزالة
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== اللوحة الجانبية: الدردشة ===== */}
          {showChat && (
            <div
              className="side-panel"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 320,
                height: '100%',
                background: 'rgba(17,24,39,0.95)',
                backdropFilter: 'blur(12px)',
                borderLeft: '1px solid rgba(255,255,255,0.1)',
                zIndex: 40,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                direction: 'rtl',
              }}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  <FaCommentDots className="inline-block me-2" /> الدردشة
                </h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  <FaTimes />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-3 rounded-xl border ${
                      msg.isLocal
                        ? 'bg-purple-900/30 border-purple-500/30 mr-8'
                        : 'bg-gray-800 border-gray-700 ml-8'
                    }`}
                  >
                    <div className="flex justify-between text-xs text-gray-400">
                      <span className="font-bold text-white">{msg.user}</span>
                      <span>{msg.time.toLocaleTimeString('ar-EG')}</span>
                    </div>
                    <p className="text-white text-sm mt-1">{msg.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && chatInput.trim()) {
                      sendChatMessage(chatInput);
                    }
                  }}
                  className="flex-1 bg-gray-700 text-white p-3 rounded-xl border border-gray-600 focus:border-purple-500"
                  placeholder="اكتب رسالة..."
                />
                <button
                  onClick={() => sendChatMessage(chatInput)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl"
                >
                  إرسال
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
};