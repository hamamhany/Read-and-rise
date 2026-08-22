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
  FaUsers,
  FaCommentDots,
  FaHandPeace,
  FaHandPaper,
  FaArrowLeft,
  FaUserPlus,
  FaCog,
  FaTimes,
  FaCheckCircle,
} from 'react-icons/fa';
import { getAgoraToken } from '../../services/agora';

// ============================================================
// 1. شاشة ما قبل الانضمام (Pre-Join)
// ============================================================
const PreJoinScreen = ({
  userName,
  setUserName,
  isCameraOn,
  setIsCameraOn,
  isMicOn,
  setIsMicOn,
  onJoin,
  localVideoRef,
  isLoading,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full border border-gray-700 shadow-2xl">
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          🎥 الانضمام إلى الحصة
        </h2>

        {/* معاينة الفيديو */}
        <div className="bg-black rounded-xl overflow-hidden aspect-video mb-4 flex items-center justify-center relative">
          <div ref={localVideoRef} className="w-full h-full" />
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
              <FaVideoSlash className="text-4xl text-gray-500" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/60 px-3 py-1 rounded-full text-xs text-white">
            {isCameraOn ? '📷 الكاميرا تعمل' : '📷 الكاميرا متوقفة'}
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

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                isCameraOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'
              } text-white`}
            >
              {isCameraOn ? <FaVideo /> : <FaVideoSlash />}
              {isCameraOn ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            </button>
            <button
              onClick={() => setIsMicOn(!isMicOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                isMicOn ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-500'
              } text-white`}
            >
              {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
              {isMicOn ? 'كتم الصوت' : 'تشغيل الصوت'}
            </button>
          </div>

          <button
            onClick={onJoin}
            disabled={!userName.trim() || isLoading}
            className={`w-full py-3 rounded-xl text-white font-bold transition ${
              !userName.trim() || isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isLoading ? <FaSpinner className="animate-spin inline-block me-2" /> : null}
            {isLoading ? 'جاري الانضمام...' : '🚀 انضم إلى الحصة'}
          </button>
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
  isHost = false, // هل هذا المستخدم هو المضيف؟
}) => {
  // ---- حالات شاشة ما قبل الانضمام ----
  const [isPreJoin, setIsPreJoin] = useState(true);
  const [userName, setUserName] = useState(initialUserName || 'مستخدم');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);

  // ---- حالات الحصة ----
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGalleryView, setIsGalleryView] = useState(false); // false = Active Speaker, true = Gallery
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, user: 'النظام', text: 'مرحباً بك في الحصة!', time: new Date() },
  ]);
  const [chatInput, setChatInput] = useState('');

  // ---- قائمة المشاركين الوهمية (للعرض) ----
  const [participants, setParticipants] = useState([
    { id: '1', name: 'همام هاني (المضيف)', isHost: true, isMuted: false, isVideoOn: true, handRaised: false },
    { id: '2', name: 'أحمد محمد', isHost: false, isMuted: true, isVideoOn: true, handRaised: true },
    { id: '3', name: 'سارة علي', isHost: false, isMuted: false, isVideoOn: false, handRaised: false },
  ]);

  // ---- Refs ----
  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);
  const preJoinVideoRef = useRef(null); // للمعاينة قبل الانضمام

  // ---- دوال التحكم ----
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

    // بدء مشاركة الشاشة
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

  // ---- الانضمام للغرفة ----
  const handleJoin = async () => {
    if (!userName.trim()) return;
    const channelName = meetingDetails?.channel_name;
    if (!channelName) {
      setErrorMessage('لا يوجد غرفة للانضمام.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const { token, appId, uid } = await getAgoraToken(channelName);
      if (!token || !appId) throw new Error('لم يتم استلام توكن صالح.');

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // أحداث المشاركين البعيدين
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
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
        if (mediaType === 'audio') remoteUser.audioTrack.play();
        // تحديث قائمة المشاركين (محاكاة)
        setParticipants((prev) => {
          if (!prev.find((p) => p.id === String(remoteUser.uid))) {
            return [
              ...prev,
              {
                id: String(remoteUser.uid),
                name: `مشارك ${remoteUser.uid}`,
                isHost: false,
                isMuted: false,
                isVideoOn: mediaType === 'video',
                handRaised: false,
              },
            ];
          }
          return prev;
        });
      });

      client.on('user-unpublished', (remoteUser) => {
        const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
        if (playerDiv) playerDiv.remove();
        setParticipants((prev) => prev.filter((p) => p.id !== String(remoteUser.uid)));
      });

      client.on('user-left', (remoteUser) => {
        const playerDiv = document.getElementById(`agora-remote-${remoteUser.uid}`);
        if (playerDiv) playerDiv.remove();
        setParticipants((prev) => prev.filter((p) => p.id !== String(remoteUser.uid)));
      });

      await client.join(appId, channelName, token, uid);

      // إنشاء المسارات المحلية
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

      // إضافة المستخدم المحلي إلى قائمة المشاركين
      setParticipants((prev) => {
        const exists = prev.find((p) => p.id === String(uid));
        if (!exists) {
          return [
            {
              id: String(uid),
              name: userName,
              isHost: isHost,
              isMuted: !isMicOn,
              isVideoOn: isCameraOn,
              handRaised: false,
            },
            ...prev,
          ];
        }
        return prev;
      });

      setIsPreJoin(false);
    } catch (err) {
      console.error('خطأ أثناء الانضمام:', err);
      setErrorMessage(err.message || 'حدث خطأ غير متوقع.');
    } finally {
      setIsLoading(false);
    }
  };

  // ---- معاينة الكاميرا في شاشة ما قبل الانضمام ----
  useEffect(() => {
    if (isPreJoin && isCameraOn) {
      const initPreview = async () => {
        try {
          const track = await AgoraRTC.createCameraVideoTrack();
          if (preJoinVideoRef.current) {
            track.play(preJoinVideoRef.current);
          }
          // تخزين المسار للتنظيف لاحقاً
          window.__previewTrack = track;
        } catch (e) {
          console.warn('فشل معاينة الكاميرا:', e);
        }
      };
      initPreview();
    }
    return () => {
      if (window.__previewTrack) {
        window.__previewTrack.close();
        window.__previewTrack = null;
      }
    };
  }, [isPreJoin, isCameraOn]);

  // ---- تنظيف عند الإغلاق ----
  useEffect(() => {
    if (!isOpen) {
      // إعادة تعيين الحالة
      setIsPreJoin(true);
      setIsLoading(false);
      setErrorMessage('');
      setIsAudioMuted(false);
      setIsVideoMuted(false);
      setIsScreenSharing(false);
      setShowParticipants(false);
      setShowChat(false);
      // تنظيف المسارات
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
      if (window.__previewTrack) {
        window.__previewTrack.close();
        window.__previewTrack = null;
      }
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

  // ============================================================
  // 3. واجهة الحصة الرئيسية (بعد الانضمام)
  // ============================================================
  const renderMainUI = () => (
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

      {!isLoading && !errorMessage && (
        <>
          {/* ===== منطقة العرض الرئيسية ===== */}
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
              {/* حاوية الفيديو البعيد (Gallery) */}
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

              {/* الفيديو المحلي (دائماً في الزاوية السفلية اليمنى) */}
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
              <button onClick={toggleAudio} className="control-btn" style={{ background: isAudioMuted ? '#ef4444' : '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isAudioMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
              </button>

              {/* كاميرا */}
              <button onClick={toggleVideo} className="control-btn" style={{ background: isVideoMuted ? '#ef4444' : '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isVideoMuted ? <FaVideoSlash /> : <FaVideo />}
              </button>

              {/* مشاركة الشاشة */}
              <button onClick={toggleScreenShare} className="control-btn" style={{ background: isScreenSharing ? '#3b82f6' : '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isScreenSharing ? <FaStop /> : <FaShareAlt />}
              </button>

              {/* تبديل العرض (Gallery / Active Speaker) */}
              <button onClick={() => setIsGalleryView(!isGalleryView)} className="control-btn" style={{ background: '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isGalleryView ? '⊞' : '⊟'}
              </button>

              {/* المشاركين */}
              <button onClick={() => setShowParticipants(!showParticipants)} className="control-btn" style={{ background: showParticipants ? '#3b82f6' : '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaUsers />
              </button>

              {/* الدردشة */}
              <button onClick={() => setShowChat(!showChat)} className="control-btn" style={{ background: showChat ? '#3b82f6' : '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaCommentDots />
              </button>

              {/* رفع اليد */}
              <button onClick={() => {
                setParticipants(prev => prev.map(p => p.id === '1' ? { ...p, handRaised: !p.handRaised } : p));
              }} className="control-btn" style={{ background: '#4b5563', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaHandPaper />
              </button>

              {/* خروج */}
              <button onClick={leaveCall} className="control-btn" style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 18, cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaPhoneSlash />
              </button>
            </div>
          </div>

          {/* ===== اللوحة الجانبية: المشاركين ===== */}
          {showParticipants && (
            <div className="side-panel" style={{ position: 'absolute', top: 0, right: 0, width: 320, height: '100%', background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 40, padding: '20px', overflowY: 'auto', direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white"><FaUsers className="inline-block me-2" /> المشاركين ({participants.length})</h3>
                <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
              </div>
              {isHost && (
                <button onClick={() => {
                  setParticipants(prev => prev.map(p => ({ ...p, isMuted: true })));
                  // تنبيه: في الواقع يجب استدعاء muteAll من الـ SDK
                }} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl mb-4 text-sm font-bold">
                  كتم صوت الجميع
                </button>
              )}
              <div className="space-y-2">
                {participants.map(p => (
                  <div key={p.id} className="bg-gray-800/60 p-3 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                      <span className="text-white text-sm">{p.name}</span>
                      {p.isHost && <span className="text-xs text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded mr-2">👑 مضيف</span>}
                      {p.handRaised && <span className="text-xs text-yellow-400 bg-yellow-950/40 px-2 py-0.5 rounded mr-2">✋ يد مرفوعة</span>}
                      <div className="flex gap-1 mt-1">
                        {p.isMuted ? <FaMicrophoneSlash className="text-red-400 text-xs" /> : <FaMicrophone className="text-green-400 text-xs" />}
                        {p.isVideoOn ? <FaVideo className="text-green-400 text-xs" /> : <FaVideoSlash className="text-red-400 text-xs" />}
                      </div>
                    </div>
                    {isHost && !p.isHost && (
                      <div className="flex gap-1">
                        <button onClick={() => setParticipants(prev => prev.map(pp => pp.id === p.id ? { ...pp, isMuted: !pp.isMuted } : pp))} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded">
                          {p.isMuted ? 'فك كتم' : 'كتم'}
                        </button>
                        <button onClick={() => setParticipants(prev => prev.filter(pp => pp.id !== p.id))} className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded">
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
            <div className="side-panel" style={{ position: 'absolute', top: 0, left: 0, width: 320, height: '100%', background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 40, padding: '20px', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white"><FaCommentDots className="inline-block me-2" /> الدردشة</h3>
                <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {chatMessages.map(msg => (
                  <div key={msg.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700">
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
                      setChatMessages([...chatMessages, { id: Date.now(), user: userName, text: chatInput, time: new Date() }]);
                      setChatInput('');
                    }
                  }}
                  className="flex-1 bg-gray-700 text-white p-3 rounded-xl border border-gray-600 focus:border-purple-500"
                  placeholder="اكتب رسالة..."
                />
                <button onClick={() => {
                  if (chatInput.trim()) {
                    setChatMessages([...chatMessages, { id: Date.now(), user: userName, text: chatInput, time: new Date() }]);
                    setChatInput('');
                  }
                }} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl">
                  إرسال
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ============================================================
  // 4. التصيير النهائي
  // ============================================================
  return createPortal(
    <>
      {isPreJoin ? (
        <div className="zoom-meeting-modal" dir="rtl">
          <PreJoinScreen
            userName={userName}
            setUserName={setUserName}
            isCameraOn={isCameraOn}
            setIsCameraOn={setIsCameraOn}
            isMicOn={isMicOn}
            setIsMicOn={setIsMicOn}
            onJoin={handleJoin}
            localVideoRef={preJoinVideoRef}
            isLoading={isLoading}
          />
        </div>
      ) : (
        renderMainUI()
      )}
    </>,
    document.body
  );
};