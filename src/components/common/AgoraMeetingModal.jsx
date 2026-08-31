// src/components/common/AgoraMeetingModal.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  FaClock,
  FaChevronDown,
  FaDownload,
  FaTimes,
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
  isLoading,
  countdown,
  onSkipWait,
  errorMessage,
}) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full border border-gray-700 shadow-2xl relative">
        <div className="absolute top-4 left-4 bg-purple-600/30 text-purple-300 px-4 py-2 rounded-full flex items-center gap-2 text-lg font-bold border border-purple-500/30">
          <FaClock className="text-purple-400" />
          <span>{countdown}</span>
          <span className="text-sm font-normal text-gray-400">ثانية</span>
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-6 mt-2">
          🎥 الانضمام إلى الحصة
        </h2>

        <div className="bg-black/60 rounded-xl overflow-hidden aspect-video mb-4 flex items-center justify-center border border-gray-600">
          <div className="text-center text-gray-400">
            <FaVideo className="text-6xl mx-auto mb-2 opacity-30" />
            <p className="text-sm">سيتم تشغيل الكاميرا عند الانضمام</p>
          </div>
        </div>

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
            <button
              onClick={() => setIsCameraOn(!isCameraOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition ${
                isCameraOn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-500'
              } text-white`}
            >
              {isCameraOn ? <FaVideo /> : <FaVideoSlash />}
              {isCameraOn ? 'الكاميرا مفعلة' : 'الكاميرا مطفأة'}
            </button>

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

          <button
            onClick={onSkipWait}
            disabled={isLoading}
            className={`w-full py-3 rounded-xl text-white font-bold transition flex items-center justify-center gap-2 ${
              isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-700'
            }`}
          >
            {isLoading ? <FaSpinner className="animate-spin" /> : 'انضم الآن'}
            {isLoading ? 'جاري الانضمام...' : ''}
          </button>

          {errorMessage && (
            <div className="bg-red-500/20 text-red-300 p-3 rounded-xl border border-red-500/30 text-sm flex items-center justify-between">
              <span>{errorMessage}</span>
              <button onClick={onSkipWait} className="text-yellow-400 hover:text-yellow-300 text-xs">
                إعادة المحاولة
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
// 2. المكون الأساسي للاجتماع (بدون RTM، دردشة، لوحة بيضاء، استطلاعات)
// ============================================================
export const AgoraMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails,
  userName: initialUserName,
  isHost = false,
}) => {
  const AGORA_APP_ID = import.meta.env.VITE_AGORA_APP_ID;

  // ---- حالات ما قبل الانضمام ----
  const [isPreJoin, setIsPreJoin] = useState(true);
  const [userName, setUserName] = useState(initialUserName || 'مستخدم');
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // ---- حالات الحصة الأساسية ----
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGalleryView, setIsGalleryView] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const [toolbarTimeout, setToolbarTimeout] = useState(null);
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState(null);
  const [selectedVideoInput, setSelectedVideoInput] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState({ audio: false, video: false });

  // ---- حالات التسجيل ----
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingStream, setRecordingStream] = useState(null);

  // ---- Refs ----
  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const toolbarHideRef = useRef(null);

  // ---- دوال التحكم في الأجهزة ----
  const loadDevices = useCallback(async () => {
    try {
      const allDevices = await AgoraRTC.getDevices();
      const audioInputs = allDevices.filter(d => d.kind === 'audioinput');
      const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
      const audioOutputs = allDevices.filter(d => d.kind === 'audiooutput');
      setDevices({ audioInputs, videoInputs, audioOutputs });
      if (audioInputs.length && !selectedAudioInput) setSelectedAudioInput(audioInputs[0].deviceId);
      if (videoInputs.length && !selectedVideoInput) setSelectedVideoInput(videoInputs[0].deviceId);
    } catch (e) {
      console.warn('تعذر تحميل الأجهزة:', e);
    }
  }, [selectedAudioInput, selectedVideoInput]);

  useEffect(() => {
    if (isOpen && !isPreJoin) loadDevices();
  }, [isOpen, isPreJoin, loadDevices]);

  const switchAudioInput = async (deviceId) => {
    if (!clientRef.current) return;
    try {
      const audioTrack = localTracksRef.current.audioTrack;
      if (audioTrack) {
        await audioTrack.setDevice(deviceId);
        setSelectedAudioInput(deviceId);
        setShowDeviceMenu(prev => ({ ...prev, audio: false }));
      }
    } catch (e) {
      console.error('فشل تبديل الميكروفون:', e);
    }
  };

  const switchVideoInput = async (deviceId) => {
    if (!clientRef.current) return;
    try {
      const videoTrack = localTracksRef.current.videoTrack;
      if (videoTrack) {
        await videoTrack.setDevice(deviceId);
        setSelectedVideoInput(deviceId);
        setShowDeviceMenu(prev => ({ ...prev, video: false }));
      }
    } catch (e) {
      console.error('فشل تبديل الكاميرا:', e);
    }
  };

  // ---- دوال التحكم في الصوت والفيديو مع مزامنة المشاركين ----
  const toggleAudio = () => {
    const track = localTracksRef.current.audioTrack;
    if (!track) return;
    setIsAudioMuted(prev => {
      const newMuted = !prev;
      track.setEnabled(!newMuted); // إذا كان مكتوماً، فعّل الصوت (true) والعكس
      // تحديث حالة المستخدم المحلي داخل القائمة
      setParticipants(prevParticipants =>
        prevParticipants.map(p =>
          p.id === String(clientRef.current?.uid)
            ? { ...p, isMuted: newMuted }
            : p
        )
      );
      return newMuted;
    });
  };

  const toggleVideo = () => {
    const track = localTracksRef.current.videoTrack;
    if (!track) return;
    setIsVideoMuted(prev => {
      const newMuted = !prev;
      track.setEnabled(!newMuted); // إذا كانت الكاميرا مطفأة، شغلها (true) والعكس
      setParticipants(prevParticipants =>
        prevParticipants.map(p =>
          p.id === String(clientRef.current?.uid)
            ? { ...p, isVideoOn: !newMuted }
            : p
        )
      );
      return newMuted;
    });
  };

  // ---- مشاركة الشاشة ----
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

  // ---- التسجيل ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      setRecordingStream(stream);
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${Date.now()}.mp4`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error('فشل بدء التسجيل:', err);
      setErrorMessage('تعذر بدء التسجيل: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        setRecordingStream(null);
      }
    }
  };

  // ---- الخروج ----
  const leaveCall = async () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (toolbarHideRef.current) {
      clearTimeout(toolbarHideRef.current);
      toolbarHideRef.current = null;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
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
    } catch (e) { console.warn('خطأ أثناء الخروج من RTC:', e); }
    onClose();
  };

  // ---- دالة الانضمام الفعلية ----
  const handleJoin = async () => {
    if (isLoading) return;
    if (!userName.trim()) {
      setErrorMessage('يرجى إدخال اسمك.');
      return;
    }
    const channelName = meetingDetails?.channel_name;
    if (!channelName) {
      setErrorMessage('لا يوجد غرفة للانضمام.');
      return;
    }
    if (!AGORA_APP_ID) {
      setErrorMessage('App ID مفقود.');
      return;
    }

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const { token, appId, uid } = await getAgoraToken(channelName);
      if (!token || !appId) throw new Error('لم يتم استلام توكن صالح.');

      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      clientRef.current = client;

      // ---- أحداث RTC ----
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        setRemoteUsers(prev => {
          const exists = prev.find(u => u.uid === remoteUser.uid);
          if (exists) {
            return prev.map(u => {
              if (u.uid === remoteUser.uid) {
                if (mediaType === 'video') return { ...u, videoTrack: remoteUser.videoTrack };
                if (mediaType === 'audio') return { ...u, audioTrack: remoteUser.audioTrack };
              }
              return u;
            });
          } else {
            return [...prev, {
              uid: remoteUser.uid,
              videoTrack: mediaType === 'video' ? remoteUser.videoTrack : null,
              audioTrack: mediaType === 'audio' ? remoteUser.audioTrack : null,
            }];
          }
        });

        setParticipants(prev => {
          const existing = prev.find(p => p.id === String(remoteUser.uid));
          if (existing) {
            let updated = { ...existing };
            if (mediaType === 'video') updated.isVideoOn = true;
            if (mediaType === 'audio') updated.isMuted = false;
            return prev.map(p => p.id === String(remoteUser.uid) ? updated : p);
          } else {
            return [...prev, {
              id: String(remoteUser.uid),
              name: `مشارك ${remoteUser.uid}`,
              isHost: false,
              isMuted: mediaType !== 'audio',
              isVideoOn: mediaType === 'video',
            }];
          }
        });

        if (mediaType === 'audio') {
          remoteUser.audioTrack.play();
        }
      });

      client.on('user-unpublished', (remoteUser, mediaType) => {
        setRemoteUsers(prev => prev.map(u => {
          if (u.uid === remoteUser.uid) {
            if (mediaType === 'video') return { ...u, videoTrack: null };
            if (mediaType === 'audio') return { ...u, audioTrack: null };
          }
          return u;
        }));
        setParticipants(prev =>
          prev.map(p => {
            if (p.id === String(remoteUser.uid)) {
              let updated = { ...p };
              if (mediaType === 'video') updated.isVideoOn = false;
              if (mediaType === 'audio') updated.isMuted = true;
              return updated;
            }
            return p;
          })
        );
      });

      client.on('user-left', (remoteUser) => {
        setRemoteUsers(prev => prev.filter(u => u.uid !== remoteUser.uid));
        setParticipants(prev => prev.filter(p => p.id !== String(remoteUser.uid)));
      });

      client.on('active-speaker', (speakerUid) => {
        setActiveSpeakerId(speakerUid);
      });

      // الانضمام للقناة
      await client.join(appId, channelName, token, uid);

      // إنشاء المسارات المحلية
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current = { audioTrack, videoTrack };

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

      // إضافة المستخدم المحلي
      setParticipants([
        {
          id: String(uid),
          name: userName,
          isHost: isHost,
          isMuted: !isMicOn,
          isVideoOn: isCameraOn,
        },
      ]);

      setIsPreJoin(false);
    } catch (err) {
      console.error('❌ خطأ أثناء الانضمام:', err);
      setErrorMessage('فشل الانضمام: ' + (err.message || 'خطأ غير معروف'));
      setCountdown(30);
      startCountdown();
    } finally {
      setIsLoading(false);
    }
  };

  // ---- العد التنازلي ----
  const startCountdown = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setCountdown(30);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          handleJoin();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ---- تأثيرات ----
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

  // ---- تشغيل الفيديو البعيد عند تحديث remoteUsers ----
  useEffect(() => {
    remoteUsers.forEach(user => {
      if (user.videoTrack) {
        const element = document.getElementById(`agora-remote-${user.uid}`);
        if (element) {
          user.videoTrack.play(element);
        }
      }
    });
  }, [remoteUsers]);

  // ---- تنظيف عند الإغلاق ----
  useEffect(() => {
    if (!isOpen) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (toolbarHideRef.current) clearTimeout(toolbarHideRef.current);
      setIsPreJoin(true);
      setIsLoading(false);
      setErrorMessage('');
      setParticipants([]);
      setRemoteUsers([]);
      setCountdown(30);
      setActiveSpeakerId(null);
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecording();
      }
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

  // ---- إخفاء الشريط تلقائياً ----
  const handleMouseMove = useCallback(() => {
    setShowToolbar(true);
    if (toolbarHideRef.current) clearTimeout(toolbarHideRef.current);
    toolbarHideRef.current = setTimeout(() => {
      setShowToolbar(false);
    }, 5000);
  }, []);

  useEffect(() => {
    if (!isOpen || isPreJoin) return;
    window.addEventListener('mousemove', handleMouseMove);
    setShowToolbar(true);
    toolbarHideRef.current = setTimeout(() => setShowToolbar(false), 5000);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (toolbarHideRef.current) clearTimeout(toolbarHideRef.current);
    };
  }, [isOpen, isPreJoin, handleMouseMove]);

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
          onSkipWait={() => handleJoin()}
          errorMessage={errorMessage}
        />
      </div>,
      document.body
    );
  }

  // ---- واجهة الحصة الرئيسية ----
  return createPortal(
    <div className="zoom-meeting-modal" dir="rtl" onMouseMove={handleMouseMove}>
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
          <div className="zoom-meeting-stage" style={{ position: 'relative', width: '100%', height: '100vh', background: '#1a1a2e' }}>
            {/* حاوية الفيديوهات البعيدة */}
            <div
              ref={remoteContainerRef}
              className="agora-remote-container"
              style={{
                display: 'grid',
                gridTemplateColumns: isGalleryView
                  ? 'repeat(auto-fill, minmax(200px, 1fr))'
                  : '1fr',
                gap: '10px',
                width: '100%',
                height: '100%',
                padding: '10px',
                boxSizing: 'border-box',
              }}
            >
              {remoteUsers.map(user => {
                const isActive = activeSpeakerId === user.uid && !isGalleryView;
                return (
                  <div
                    key={user.uid}
                    className={`remote-video-wrapper ${isActive ? 'active-speaker' : ''}`}
                    style={{
                      position: 'relative',
                      background: '#111',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      gridColumn: isActive ? 'span 2' : 'span 1',
                      gridRow: isActive ? 'span 2' : 'span 1',
                      minHeight: '150px',
                    }}
                  >
                    {user.videoTrack ? (
                      <div id={`agora-remote-${user.uid}`} style={{ width: '100%', height: '100%' }} />
                    ) : (
                      <div className="no-video-placeholder" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
                        <FaUsers size={40} />
                      </div>
                    )}
                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '12px' }}>
                      {participants.find(p => p.id === String(user.uid))?.name || `مستخدم ${user.uid}`}
                      {activeSpeakerId === user.uid && !isGalleryView && ' 🗣️'}
                    </div>
                  </div>
                );
              })}
              {remoteUsers.length === 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '1.2rem' }}>
                  لا يوجد مشاركون آخرون
                </div>
              )}
            </div>

            {/* الفيديو المحلي (نافذة عائمة) */}
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
                transition: 'opacity 0.3s ease',
                opacity: showToolbar ? 1 : 0,
                pointerEvents: showToolbar ? 'auto' : 'none',
              }}
            >
              {/* ميكروفون مع قائمة */}
              <div style={{ position: 'relative' }}>
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
                <button
                  onClick={() => setShowDeviceMenu(prev => ({ ...prev, audio: !prev.audio }))}
                  style={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    background: '#333',
                    border: 'none',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <FaChevronDown />
                </button>
                {showDeviceMenu.audio && (
                  <div style={{ position: 'absolute', bottom: '50px', left: 0, background: '#1f2937', borderRadius: '8px', padding: '8px', minWidth: '160px', zIndex: 50 }}>
                    {devices.audioInputs.map(d => (
                      <button
                        key={d.deviceId}
                        onClick={() => switchAudioInput(d.deviceId)}
                        style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'transparent', border: 'none', color: 'white', textAlign: 'right', cursor: 'pointer', fontSize: '13px' }}
                      >
                        {d.label || d.deviceId}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* كاميرا مع قائمة */}
              <div style={{ position: 'relative' }}>
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
                <button
                  onClick={() => setShowDeviceMenu(prev => ({ ...prev, video: !prev.video }))}
                  style={{
                    position: 'absolute',
                    bottom: -6,
                    right: -6,
                    background: '#333',
                    border: 'none',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <FaChevronDown />
                </button>
                {showDeviceMenu.video && (
                  <div style={{ position: 'absolute', bottom: '50px', left: 0, background: '#1f2937', borderRadius: '8px', padding: '8px', minWidth: '160px', zIndex: 50 }}>
                    {devices.videoInputs.map(d => (
                      <button
                        key={d.deviceId}
                        onClick={() => switchVideoInput(d.deviceId)}
                        style={{ display: 'block', width: '100%', padding: '6px 12px', background: 'transparent', border: 'none', color: 'white', textAlign: 'right', cursor: 'pointer', fontSize: '13px' }}
                      >
                        {d.label || d.deviceId}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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

              {/* تسجيل */}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className="control-btn"
                style={{
                  background: isRecording ? '#ef4444' : '#4b5563',
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
                {isRecording ? <FaStop /> : <FaDownload />}
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

          {/* ===== لوحة المشاركين (بدون تفاعل) ===== */}
          {showParticipants && (
            <div className="side-panel" style={{ position: 'absolute', top: 0, right: 0, width: 320, height: '100%', background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 40, padding: '20px', overflowY: 'auto', direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white"><FaUsers className="inline-block me-2" /> المشاركين ({participants.length})</h3>
                <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
              </div>
              <div className="space-y-2">
                {participants.map((p) => (
                  <div key={p.id} className="bg-gray-800/60 p-3 rounded-xl border border-gray-700 flex justify-between items-center">
                    <div>
                      <span className="text-white text-sm">{p.name}</span>
                      {p.isHost && <span className="text-xs text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded mr-2">👑 مضيف</span>}
                      <div className="flex gap-1 mt-1">
                        {p.isMuted ? <FaMicrophoneSlash className="text-red-400 text-xs" /> : <FaMicrophone className="text-green-400 text-xs" />}
                        {p.isVideoOn ? <FaVideo className="text-green-400 text-xs" /> : <FaVideoSlash className="text-red-400 text-xs" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
};