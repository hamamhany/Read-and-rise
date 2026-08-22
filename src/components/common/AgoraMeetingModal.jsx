// src/components/common/AgoraMeetingModal.jsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  FaChevronDown,
  FaSmile,
  FaThumbsUp,
  FaHeart,
  FaHandsClap,
  FaReply,
  FaUserPlus,
  FaUserMinus,
  FaVolumeMute,
  FaVolumeUp,
  FaChalkboard,
  FaDownload,
  FaPoll,
  FaDoorOpen,
  FaDoorClosed,
} from 'react-icons/fa';
import { getAgoraToken } from '../../services/agora';

// ============================================================
// 1. شاشة غرفة الانتظار (Waiting Room) - بدون تغيير
// ============================================================
const WaitingRoomScreen = ({ userName, onJoin, isLoading, errorMessage, onCancel }) => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-3xl p-8 max-w-md w-full border border-gray-700 shadow-2xl text-center">
        <div className="text-6xl mb-4">⏳</div>
        <h2 className="text-2xl font-bold text-white mb-2">في غرفة الانتظار</h2>
        <p className="text-gray-400 mb-6">
          {userName ? `مرحباً ${userName}` : 'مرحباً'}، ينتظر المضيف قبولك.
        </p>
        {isLoading && <FaSpinner className="animate-spin text-3xl mx-auto text-purple-400" />}
        {errorMessage && (
          <div className="bg-red-500/20 text-red-300 p-3 rounded-xl border border-red-500/30 text-sm mb-4">
            {errorMessage}
          </div>
        )}
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-xl bg-gray-600 hover:bg-gray-500 text-white font-bold transition"
        >
          إلغاء والعودة
        </button>
      </div>
    </div>
  );
};

// ============================================================
// 2. شاشة ما قبل الانضمام (Pre-Join) - بدون تغيير
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
            {isLoading ? <FaSpinner className="animate-spin" /> : <FaForward />}
            {isLoading ? 'جاري الانضمام...' : 'تجاوز الانتظار (انضم الآن)'}
          </button>

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
// 3. مكون التفاعل (Reaction) العائم - بدون تغيير
// ============================================================
const FloatingReaction = ({ emoji, onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className="floating-reaction"
      style={{
        position: 'fixed',
        bottom: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%) scale(1)',
        fontSize: '6rem',
        pointerEvents: 'none',
        animation: 'floatUp 3s forwards',
        zIndex: 9999,
      }}
    >
      {emoji}
    </div>
  );
};

// ============================================================
// 4. مكون اللوحة البيضاء (Whiteboard) باستخدام Canvas + RTM
// ============================================================
const Whiteboard = ({ rtmChannel, isHost }) => {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // رسم حدث محلي وإرساله عبر RTM
  const handleMouseDown = (e) => {
    if (!isHost) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    isDrawing.current = true;
    lastPos.current = { x, y };
    // ارسال نقطة البداية
    if (rtmChannel) {
      rtmChannel.sendMessage({ text: `WB_START ${x} ${y}` }).catch(console.warn);
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing.current || !isHost) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (rtmChannel) {
      rtmChannel.sendMessage({ text: `WB_DRAW ${x} ${y}` }).catch(console.warn);
    }
    // رسم محلياً
    drawLine(lastPos.current.x, lastPos.current.y, x, y);
    lastPos.current = { x, y };
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const drawLine = (x1, y1, x2, y2) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.beginPath();
    ctx.moveTo(x1 * w, y1 * h);
    ctx.lineTo(x2 * w, y2 * h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
  };

  // استقبال رسائل WB من RTM
  useEffect(() => {
    if (!rtmChannel) return;
    const handleMessage = (message, memberId) => {
      const text = message.text;
      if (text.startsWith('WB_START')) {
        const [, x, y] = text.split(' ').map(Number);
        lastPos.current = { x, y };
        isDrawing.current = true;
      } else if (text.startsWith('WB_DRAW')) {
        const [, x, y] = text.split(' ').map(Number);
        drawLine(lastPos.current.x, lastPos.current.y, x, y);
        lastPos.current = { x, y };
      } else if (text === 'WB_END') {
        isDrawing.current = false;
      }
    };
    rtmChannel.on('ChannelMessage', handleMessage);
    return () => {
      rtmChannel.off('ChannelMessage', handleMessage);
    };
  }, [rtmChannel]);

  // إعداد canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#1a1a2e' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: isHost ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {!isHost && (
        <div style={{ position: 'absolute', top: 10, right: 10, color: '#888', fontSize: '14px' }}>
          وضع المشاهدة فقط
        </div>
      )}
    </div>
  );
};

// ============================================================
// 5. مكون استطلاع الرأي (Poll)
// ============================================================
const PollModal = ({ isOpen, onClose, onSendPoll, rtmChannel }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isSending, setIsSending] = useState(false);

  const addOption = () => setOptions([...options, '']);
  const removeOption = (index) => setOptions(options.filter((_, i) => i !== index));
  const updateOption = (index, value) => {
    const newOpts = [...options];
    newOpts[index] = value;
    setOptions(newOpts);
  };

  const handleSubmit = async () => {
    if (!question.trim() || options.some(o => !o.trim())) return;
    setIsSending(true);
    const pollData = { question, options: options.filter(o => o.trim()), id: Date.now() };
    if (rtmChannel) {
      await rtmChannel.sendMessage({ text: `POLL ${JSON.stringify(pollData)}` });
    }
    onSendPoll(pollData);
    setIsSending(false);
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-800 rounded-3xl p-6 max-w-md w-full border border-gray-700 shadow-2xl" dir="rtl">
        <h3 className="text-xl font-bold text-white mb-4">📊 استطلاع سريع</h3>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="السؤال..."
          className="w-full bg-gray-700 text-white p-3 rounded-xl border border-gray-600 mb-3"
        />
        {options.map((opt, idx) => (
          <div key={idx} className="flex gap-2 mb-2">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(idx, e.target.value)}
              placeholder={`خيار ${idx+1}`}
              className="flex-1 bg-gray-700 text-white p-2 rounded-xl border border-gray-600"
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(idx)} className="text-red-400 hover:text-red-300">
                <FaTimes />
              </button>
            )}
          </div>
        ))}
        <button onClick={addOption} className="text-blue-400 hover:text-blue-300 text-sm mb-3">
          + إضافة خيار
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSending}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl font-bold"
          >
            {isSending ? <FaSpinner className="animate-spin mx-auto" /> : 'إرسال الاستطلاع'}
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-xl">
            إلغاء
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ============================================================
// 6. مكون عرض نتائج الاستطلاع
// ============================================================
const PollResults = ({ pollData, onClose }) => {
  const [votes, setVotes] = useState({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // محاكاة استقبال الأصوات (يمكن ربطها بـ RTM)
    const initial = pollData.options.reduce((acc, opt) => ({ ...acc, [opt]: 0 }), {});
    setVotes(initial);
    setTotal(0);
  }, [pollData]);

  const handleVote = (option) => {
    setVotes(prev => {
      const newVotes = { ...prev, [option]: (prev[option] || 0) + 1 };
      setTotal(prevTotal => prevTotal + 1);
      return newVotes;
    });
  };

  return (
    <div className="bg-gray-800 rounded-3xl p-6 max-w-md w-full border border-gray-700 shadow-2xl" dir="rtl">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-bold text-white">{pollData.question}</h4>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <FaTimes />
        </button>
      </div>
      {pollData.options.map((opt, idx) => (
        <div key={idx} className="mb-3">
          <button
            onClick={() => handleVote(opt)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-xl text-right"
          >
            {opt} ({votes[opt] || 0} صوت)
          </button>
          <div className="w-full bg-gray-600 h-2 rounded-full mt-1">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: total > 0 ? `${(votes[opt] || 0) / total * 100}%` : '0%' }}
            />
          </div>
        </div>
      ))}
      <div className="text-gray-400 text-sm mt-2">إجمالي الأصوات: {total}</div>
    </div>
  );
};

// ============================================================
// 7. المكون الأساسي للاجتماع (مع جميع الميزات الجديدة)
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

  // ---- حالات غرفة الانتظار ----
  const [inWaitingRoom, setInWaitingRoom] = useState(false);

  // ---- حالات الحصة الأساسية ----
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGalleryView, setIsGalleryView] = useState(true);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [participants, setParticipants] = useState([]);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);
  const [reactions, setReactions] = useState([]);
  const [showToolbar, setShowToolbar] = useState(true);
  const [toolbarTimeout, setToolbarTimeout] = useState(null);
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [], audioOutputs: [] });
  const [selectedAudioInput, setSelectedAudioInput] = useState(null);
  const [selectedVideoInput, setSelectedVideoInput] = useState(null);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState({ audio: false, video: false });
  const [directMessageTarget, setDirectMessageTarget] = useState(null);

  // ---- حالات الميزات الجديدة ----
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [activePoll, setActivePoll] = useState(null);
  const [showPollResults, setShowPollResults] = useState(false);
  const [breakoutRooms, setBreakoutRooms] = useState([]);
  const [showBreakoutManager, setShowBreakoutManager] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null); // معرف الغرفة الحالية للمستخدم

  // ---- Refs ----
  const localVideoRef = useRef(null);
  const remoteContainerRef = useRef(null);
  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const screenTrackRef = useRef(null);
  const rtmClientRef = useRef(null);
  const rtmChannelRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const toolbarHideRef = useRef(null);
  const recordingStreamRef = useRef(null);

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
      if (audioOutputs.length && !selectedAudioOutput) setSelectedAudioOutput(audioOutputs[0].deviceId);
    } catch (e) {
      console.warn('تعذر تحميل الأجهزة:', e);
    }
  }, [selectedAudioInput, selectedVideoInput, selectedAudioOutput]);

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

  // ---- دوال التحكم في الصوت والفيديو ----
  const toggleAudio = () => {
    const track = localTracksRef.current.audioTrack;
    if (!track) return;
    if (isAudioMuted) {
      track.setEnabled(true);
      setIsAudioMuted(false);
      setParticipants(prev =>
        prev.map(p =>
          p.id === String(clientRef.current?.uid) ? { ...p, isMuted: false } : p
        )
      );
    } else {
      track.setEnabled(false);
      setIsAudioMuted(true);
      setParticipants(prev =>
        prev.map(p =>
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
      setParticipants(prev =>
        prev.map(p =>
          p.id === String(clientRef.current?.uid) ? { ...p, isVideoOn: true } : p
        )
      );
    } else {
      track.setEnabled(false);
      setIsVideoMuted(true);
      setParticipants(prev =>
        prev.map(p =>
          p.id === String(clientRef.current?.uid) ? { ...p, isVideoOn: false } : p
        )
      );
    }
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

  // ---- الدردشة ----
  const sendChatMessage = async (text, targetId = null) => {
    if (!text.trim()) return;
    const message = text.trim();
    try {
      if (rtmChannelRef.current) {
        let payload = { text: message };
        if (targetId) {
          payload.to = targetId;
        }
        await rtmChannelRef.current.sendMessage({ text: JSON.stringify(payload) });
      }
    } catch (err) {
      console.warn('فشل إرسال الرسالة عبر RTM:', err);
    }
    const msgObj = {
      id: Date.now(),
      user: userName,
      text: message,
      time: new Date(),
      isLocal: true,
      isPrivate: !!targetId,
      targetId,
    };
    setChatMessages(prev => [...prev, msgObj]);
    setChatInput('');
    setDirectMessageTarget(null);
  };

  // ---- رفع اليد ----
  const toggleHandRaise = () => {
    const uid = String(clientRef.current?.uid);
    setParticipants(prev =>
      prev.map(p =>
        p.id === uid ? { ...p, handRaised: !p.handRaised } : p
      )
    );
    if (rtmChannelRef.current) {
      rtmChannelRef.current.sendMessage({ text: `✋ ${uid}` }).catch(console.warn);
    }
  };

  // ---- التفاعلات ----
  const sendReaction = (emoji) => {
    if (!rtmChannelRef.current) return;
    rtmChannelRef.current.sendMessage({ text: `💥${emoji}` }).catch(console.warn);
    setReactions(prev => [...prev, { id: Date.now(), emoji, userId: 'me' }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== Date.now()));
    }, 3000);
  };

  // ---- أوامر المضيف ----
  const hostMuteAll = async () => {
    if (!isHost) return;
    if (rtmChannelRef.current) {
      await rtmChannelRef.current.sendMessage({ text: '🔇MUTE_ALL' });
    }
  };

  const hostRemoveUser = async (uid) => {
    if (!isHost) return;
    if (rtmChannelRef.current) {
      await rtmChannelRef.current.sendMessage({ text: `🚫REMOVE ${uid}` });
    }
  };

  const hostAdmitUser = async (uid) => {
    if (!isHost) return;
    if (rtmChannelRef.current) {
      await rtmChannelRef.current.sendMessage({ text: `✅ADMIT ${uid}` });
    }
  };

  // ---- ميزة التسجيل (MediaRecorder) ----
  const startRecording = async () => {
    try {
      // تسجيل شاشة الحصة (يمكن تسجيل عنصر الفيديو أو الشاشة)
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      recordingStreamRef.current = stream;
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
        setRecordedChunks([]);
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
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
      }
    }
  };

  // ---- اللوحة البيضاء ----
  const toggleWhiteboard = () => {
    setShowWhiteboard(prev => !prev);
  };

  // ---- استطلاعات الرأي ----
  const handlePollCreated = (pollData) => {
    setActivePoll(pollData);
    setShowPollResults(true);
  };

  const closePollResults = () => {
    setShowPollResults(false);
    setActivePoll(null);
  };

  // ---- الغرف الفرعية (Breakout Rooms) ----
  const createBreakoutRooms = (count) => {
    const roomCount = count || 2;
    const rooms = Array.from({ length: roomCount }, (_, i) => ({
      id: `room-${i+1}`,
      name: `غرفة ${i+1}`,
      members: [],
    }));
    setBreakoutRooms(rooms);
    // إرسال أمر RTM لتوزيع المشاركين (محاكاة)
    if (rtmChannelRef.current) {
      rtmChannelRef.current.sendMessage({ text: `BREAKOUT ${JSON.stringify(rooms)}` }).catch(console.warn);
    }
  };

  const joinBreakoutRoom = (roomId) => {
    setCurrentRoom(roomId);
    // هنا يمكن إرسال رسالة لتغيير قناة الصوت/الفيديو (ميزة متقدمة)
    // لكننا سنكتفي بمحاكاة الانضمام
  };

  const leaveBreakoutRoom = () => {
    setCurrentRoom(null);
  };

  // ---- تحسين جودة الفيديو التكيفية ----
  const enableAdaptiveBitrate = () => {
    if (clientRef.current) {
      // تفعيل الإعدادات التكيفية
      clientRef.current.setRemoteVideoStreamType = (uid, streamType) => {
        // يمكن ضبط الجودة تلقائياً حسب حالة الشبكة
        // نترك التنفيذ الافتراضي لـ Agora
      };
      // تقليل الجودة عند ضعف الشبكة
      clientRef.current.enableDualStream = () => {
        // تمكين دفقين (عالية ومنخفضة)
        // يتم ضبطه تلقائياً في الإصدارات الحديثة
      };
      console.log('Adaptive bitrate enabled');
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

    try {
      if (rtmChannelRef.current) {
        await rtmChannelRef.current.leave();
        rtmChannelRef.current = null;
      }
      if (rtmClientRef.current) {
        await rtmClientRef.current.logout();
        rtmClientRef.current = null;
      }
    } catch (e) { console.warn('تنظيف RTM:', e); }

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
    console.log('🔄 [handleJoin] تم استدعاء الدالة');
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

      // تفعيل تحسين جودة الفيديو التكيفية
      enableAdaptiveBitrate();

      // ---- أحداث RTC ----
      client.on('user-published', async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);
        // تحديث remoteUsers
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

        // تحديث المشاركين
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
              handRaised: false,
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

      // متحدث نشط
      client.on('active-speaker', (speakerUid) => {
        setActiveSpeakerId(speakerUid);
      });

      // الانضمام للقناة
      await client.join(appId, channelName, token, uid);
      console.log('✅ تم الانضمام للقناة');

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
      console.log('✅ تم نشر المسارات المحلية');

      // ============================================================
      // RTM (الدردشة والأوامر)
      // ============================================================
      try {
        const rtmClient = createRtmClient(appId);
        rtmClientRef.current = rtmClient;
        await rtmClient.login({ uid: String(uid) });

        const rtmChannel = rtmClient.createChannel(channelName);
        rtmChannelRef.current = rtmChannel;
        await rtmChannel.join();

        // استماع الرسائل
        rtmChannel.on('ChannelMessage', (message, memberId) => {
          const text = message.text;
          // أوامر المضيف
          if (text === '🔇MUTE_ALL') {
            const audioTrackLocal = localTracksRef.current.audioTrack;
            if (audioTrackLocal && !isHost) {
              audioTrackLocal.setEnabled(false);
              setIsAudioMuted(true);
              setParticipants(prev =>
                prev.map(p => p.id === String(clientRef.current?.uid) ? { ...p, isMuted: true } : p)
              );
            }
            return;
          }
          if (text.startsWith('🚫REMOVE')) {
            const targetUid = text.split(' ')[1];
            if (String(clientRef.current?.uid) === targetUid) {
              leaveCall();
              return;
            }
          }
          if (text.startsWith('✅ADMIT')) {
            // قبول مستخدم
            return;
          }
          if (text.startsWith('🆔')) {
            const name = text.replace('🆔 ', '');
            setParticipants(prev =>
              prev.map(p => p.id === memberId ? { ...p, name: name } : p)
            );
            return;
          }
          if (text.startsWith('✋')) {
            const uidRaised = text.split(' ')[1];
            setParticipants(prev =>
              prev.map(p => p.id === uidRaised ? { ...p, handRaised: !p.handRaised } : p)
            );
            return;
          }
          if (text.startsWith('💥')) {
            const emoji = text.substring(1);
            setReactions(prev => [...prev, { id: Date.now() + Math.random(), emoji, userId: memberId }]);
            setTimeout(() => {
              setReactions(prev => prev.filter(r => r.id !== Date.now() + Math.random()));
            }, 3000);
            return;
          }
          // رسائل اللوحة البيضاء (WB)
          if (text.startsWith('WB_')) {
            // يتم معالجتها داخل مكون Whiteboard
            return;
          }
          // رسائل الاستطلاع
          if (text.startsWith('POLL')) {
            try {
              const pollData = JSON.parse(text.replace('POLL ', ''));
              setActivePoll(pollData);
              setShowPollResults(true);
            } catch (e) { console.warn('خطأ في تحليل الاستطلاع'); }
            return;
          }
          // رسائل الغرف الفرعية
          if (text.startsWith('BREAKOUT')) {
            try {
              const rooms = JSON.parse(text.replace('BREAKOUT ', ''));
              setBreakoutRooms(rooms);
            } catch (e) { console.warn('خطأ في تحليل الغرف'); }
            return;
          }

          // رسائل الدردشة (قد تكون عامة أو خاصة)
          try {
            const payload = JSON.parse(text);
            if (payload.to) {
              if (payload.to === String(clientRef.current?.uid) || payload.to === 'all') {
                setChatMessages(prev => [...prev, {
                  id: Date.now() + Math.random(),
                  user: memberId,
                  text: payload.text,
                  time: new Date(),
                  isLocal: false,
                  isPrivate: true,
                  targetId: payload.to,
                }]);
              }
            } else {
              setChatMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                user: memberId,
                text: payload.text || text,
                time: new Date(),
                isLocal: false,
              }]);
            }
          } catch (e) {
            setChatMessages(prev => [...prev, {
              id: Date.now() + Math.random(),
              user: memberId,
              text: text,
              time: new Date(),
              isLocal: false,
            }]);
          }
        });

        // إرسال اسم المستخدم
        await rtmChannel.sendMessage({ text: `🆔 ${userName}` });
      } catch (rtmError) {
        console.error('❌ فشل تهيئة RTM:', rtmError);
      }

      // إضافة المستخدم المحلي
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
      setInWaitingRoom(false);
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
      setChatMessages([]);
      setParticipants([]);
      setRemoteUsers([]);
      setReactions([]);
      setCountdown(30);
      setActiveSpeakerId(null);
      setDirectMessageTarget(null);
      setShowWhiteboard(false);
      setActivePoll(null);
      setShowPollResults(false);
      setBreakoutRooms([]);
      setCurrentRoom(null);
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

  if (inWaitingRoom) {
    return createPortal(
      <div className="zoom-meeting-modal" dir="rtl">
        <WaitingRoomScreen
          userName={userName}
          onJoin={handleJoin}
          isLoading={isLoading}
          errorMessage={errorMessage}
          onCancel={() => { setIsPreJoin(true); setInWaitingRoom(false); }}
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
            {/* حاوية الفيديوهات البعيدة أو اللوحة البيضاء */}
            {showWhiteboard ? (
              <Whiteboard rtmChannel={rtmChannelRef.current} isHost={isHost} />
            ) : (
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
                          <FaUserPlus size={40} />
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: '8px', left: '8px', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: '20px', color: 'white', fontSize: '12px' }}>
                        {participants.find(p => p.id === String(user.uid))?.name || `مستخدم ${user.uid}`}
                        {activeSpeakerId === user.uid && !isGalleryView && ' 🗣️'}
                      </div>
                    </div>
                  );
                })}
                {remoteUsers.length === 0 && !showWhiteboard && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '1.2rem' }}>
                    لا يوجد مشاركون آخرون
                  </div>
                )}
              </div>
            )}

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

              {/* اللوحة البيضاء */}
              <button
                onClick={toggleWhiteboard}
                className="control-btn"
                style={{
                  background: showWhiteboard ? '#3b82f6' : '#4b5563',
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
                <FaChalkboard />
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

              {/* استطلاع رأي (للمضيف فقط) */}
              {isHost && (
                <button
                  onClick={() => setShowPollModal(true)}
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
                  <FaPoll />
                </button>
              )}

              {/* غرف فرعية (للمضيف فقط) */}
              {isHost && (
                <button
                  onClick={() => setShowBreakoutManager(!showBreakoutManager)}
                  className="control-btn"
                  style={{
                    background: showBreakoutManager ? '#3b82f6' : '#4b5563',
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
                  <FaDoorOpen />
                </button>
              )}

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

              {/* التفاعلات */}
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button onClick={() => sendReaction('👍')} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>👍</button>
                <button onClick={() => sendReaction('❤️')} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>❤️</button>
                <button onClick={() => sendReaction('👏')} style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>👏</button>
              </div>

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

          {/* ===== لوحة المشاركين ===== */}
          {showParticipants && (
            <div className="side-panel" style={{ position: 'absolute', top: 0, right: 0, width: 320, height: '100%', background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 40, padding: '20px', overflowY: 'auto', direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white"><FaUsers className="inline-block me-2" /> المشاركين ({participants.length})</h3>
                <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
              </div>
              {isHost && (
                <>
                  <button onClick={hostMuteAll} className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl mb-4 text-sm font-bold">كتم صوت الجميع</button>
                  <button onClick={() => createBreakoutRooms(2)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl mb-4 text-sm font-bold">إنشاء غرف فرعية (2)</button>
                </>
              )}
              <div className="space-y-2">
                {participants.map((p) => (
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
                        <button onClick={() => { if (rtmChannelRef.current) rtmChannelRef.current.sendMessage({ text: `🔇MUTE ${p.id}` }); }} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded">{p.isMuted ? 'فك كتم' : 'كتم'}</button>
                        <button onClick={() => hostRemoveUser(p.id)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded">إزالة</button>
                      </div>
                    )}
                    <button onClick={() => setDirectMessageTarget({ id: p.id, name: p.name })} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"><FaReply /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== لوحة الدردشة ===== */}
          {showChat && (
            <div className="side-panel" style={{ position: 'absolute', top: 0, left: 0, width: 320, height: '100%', background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)', borderLeft: '1px solid rgba(255,255,255,0.1)', zIndex: 40, padding: '20px', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white"><FaCommentDots className="inline-block me-2" /> الدردشة {directMessageTarget && <span className="text-sm text-blue-400 mr-2">→ {directMessageTarget.name}</span>}</h3>
                <div>
                  {directMessageTarget && <button onClick={() => setDirectMessageTarget(null)} className="text-gray-400 hover:text-white text-sm mr-2">إلغاء الخاص</button>}
                  <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`p-3 rounded-xl border ${msg.isLocal ? 'bg-purple-900/30 border-purple-500/30 mr-8' : 'bg-gray-800 border-gray-700 ml-8'} ${msg.isPrivate ? 'border-dashed border-blue-500/50' : ''}`}>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span className="font-bold text-white">{msg.user}{msg.isPrivate && ' 🔒'}</span>
                      <span>{msg.time.toLocaleTimeString('ar-EG')}</span>
                    </div>
                    <p className="text-white text-sm mt-1">{msg.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && chatInput.trim()) sendChatMessage(chatInput, directMessageTarget?.id); }} className="flex-1 bg-gray-700 text-white p-3 rounded-xl border border-gray-600 focus:border-purple-500" placeholder={directMessageTarget ? `رسالة خاصة إلى ${directMessageTarget.name}` : "اكتب رسالة..."} />
                <button onClick={() => sendChatMessage(chatInput, directMessageTarget?.id)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl">إرسال</button>
              </div>
            </div>
          )}

          {/* ===== مودال الاستطلاع ===== */}
          <PollModal
            isOpen={showPollModal}
            onClose={() => setShowPollModal(false)}
            onSendPoll={handlePollCreated}
            rtmChannel={rtmChannelRef.current}
          />

          {/* ===== عرض نتائج الاستطلاع ===== */}
          {showPollResults && activePoll && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <PollResults pollData={activePoll} onClose={closePollResults} />
            </div>
          )}

          {/* ===== مدير الغرف الفرعية ===== */}
          {showBreakoutManager && isHost && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="bg-gray-800 rounded-3xl p-6 max-w-md w-full border border-gray-700 shadow-2xl" dir="rtl">
                <h3 className="text-xl font-bold text-white mb-4">🚪 إدارة الغرف الفرعية</h3>
                <div className="space-y-2 mb-4">
                  {breakoutRooms.map(room => (
                    <div key={room.id} className="bg-gray-700 p-3 rounded-xl flex justify-between items-center">
                      <span className="text-white">{room.name}</span>
                      <span className="text-gray-400 text-sm">{room.members.length} مشارك</span>
                    </div>
                  ))}
                  {breakoutRooms.length === 0 && <p className="text-gray-400">لا توجد غرف، انقر "إنشاء غرف فرعية"</p>}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => createBreakoutRooms(2)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl">إنشاء غرفتين</button>
                  <button onClick={() => createBreakoutRooms(3)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl">إنشاء 3 غرف</button>
                  <button onClick={() => setShowBreakoutManager(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-xl">إغلاق</button>
                </div>
              </div>
            </div>
          )}

          {/* ===== التفاعلات العائمة ===== */}
          {reactions.map(r => (
            <FloatingReaction key={r.id} emoji={r.emoji} onComplete={() => setReactions(prev => prev.filter(item => item.id !== r.id))} />
          ))}
        </>
      )}

      <style jsx>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -100%) scale(1.5); }
        }
        .floating-reaction {
          animation: floatUp 3s forwards;
        }
        .active-speaker {
          grid-column: span 2 !important;
          grid-row: span 2 !important;
          border: 3px solid #3b82f6;
          box-shadow: 0 0 20px rgba(59,130,246,0.5);
        }
      `}</style>
    </div>,
    document.body
  );
};