import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCopy, FaExpand } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { getStoredTheme } from '../../utils/theme';
import { JITSI_DOMAIN } from '../../constants';
import {
  getDeviceId, getFreshIdToken, callLiveApi, endLiveSession,
  releaseDeviceOnUnload, subscribeToLiveSession, DEVICE_CONFLICT_MESSAGE
} from '../../services/liveSessions';

const HEARTBEAT_MS = 30 * 1000;
const GUEST_POLL_MS = 4000;

const TOOLBAR_BUTTONS = [
  'camera', 'chat', 'closedcaptions', 'desktop', 'download', 'etherpad', 'feedback',
  'filmstrip', 'hangup', 'help', 'highlight', 'invite', 'linktosalesforce',
  'livestreaming', 'microphone', 'mute-everyone', 'mute-video-everyone',
  'noisesuppression', 'participants-pane', 'raisehand', 'reactions', 'recording',
  'select-background', 'settings', 'shareaudio', 'sharedvideo',
  'shortcuts', 'tileview', 'toggle-camera', 'videoquality', 'whiteboard'
];

const MODERATOR_ONLY_BUTTONS = ['invite', 'sharedvideo'];

function loadJitsiScript() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const existing = document.getElementById('jitsi-external-api');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('تعذر تحميل سكربت المحاضرة')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'jitsi-external-api';
    s.src = `https://${JITSI_DOMAIN}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('تعذر تحميل سكربت المحاضرة'));
    document.body.appendChild(s);
  });
}

const fullscreenSupported = () =>
  typeof document !== 'undefined' &&
  !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

const isFullscreenNow = () =>
  !!(document.fullscreenElement || document.webkitFullscreenElement);

export function enterFullscreen() {
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !isFullscreenNow()) {
      const r = req.call(el);
      if (r && r.catch) r.catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

export function exitFullscreen() {
  try {
    if (isFullscreenNow()) {
      const fn = document.exitFullscreen || document.webkitExitFullscreen;
      const r = fn && fn.call(document);
      if (r && r.catch) r.catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

const JitsiRoom = ({ classId, displayName, onClose, onJoined }) => {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const closingRef = useRef(false);
  const joinedCalledRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onJoinedRef = useRef(onJoined);
  onCloseRef.current = onClose;
  onJoinedRef.current = onJoined;

  const [theme, setThemeState] = useState(getStoredTheme());
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [askEnd, setAskEnd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteNumber, setInviteNumber] = useState('');
  const [fsLost, setFsLost] = useState(false);
  const [guestRequests, setGuestRequests] = useState([]);
  const [showGuestList, setShowGuestList] = useState(false);

  useEffect(() => {
    const handler = (e) => setThemeState(e.detail || getStoredTheme());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  useEffect(() => {
    document.body.dataset.inLessonRoom = '1';
    window.dispatchEvent(new CustomEvent('lesson-room-change', { detail: true }));
    return () => {
      delete document.body.dataset.inLessonRoom;
      window.dispatchEvent(new CustomEvent('lesson-room-change', { detail: false }));
    };
  }, []);

  useEffect(() => {
    const scrollY = window.scrollY || 0;
    const body = document.body;
    const html = document.documentElement;
    const prev = {
      bodyOverflow: body.style.overflow, bodyPosition: body.style.position,
      bodyTop: body.style.top, bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow, htmlOverscroll: html.style.overscrollBehavior
    };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (!fullscreenSupported()) return undefined;
    const startedAt = Date.now();
    const check = () => {
      if (isFullscreenNow()) setFsLost(false);
      else if (Date.now() - startedAt > 2500) setFsLost(true);
    };
    document.addEventListener('fullscreenchange', check);
    document.addEventListener('webkitfullscreenchange', check);
    const t1 = setTimeout(check, 2600);
    const t2 = setInterval(check, 2000);
    return () => {
      document.removeEventListener('fullscreenchange', check);
      document.removeEventListener('webkitfullscreenchange', check);
      clearTimeout(t1);
      clearInterval(t2);
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let heartbeatTimer = null;
    let loadingTimer = null;
    let unsubSession = null;
    let guestPollTimer = null;
    let cachedToken = '';
    let deviceTracked = false;
    const deviceId = getDeviceId();
    closingRef.current = false;
    setLoading(true);
    setError(null);
    setAskEnd(false);

    const shutdownApi = () => {
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (e) { /* ignore */ }
        apiRef.current = null;
      }
    };

    const closeRoom = (message) => {
      if (closingRef.current) return;
      closingRef.current = true;
      shutdownApi();
      if (message) toast(message, { icon: 'ℹ️', duration: 5000 });
      if (onCloseRef.current) onCloseRef.current();
    };

    const onPageHide = () => {
      if (deviceTracked) releaseDeviceOnUnload({ idToken: cachedToken, classId, deviceId });
    };

    (async () => {
      try {
        const [tokenData] = await Promise.all([
          callLiveApi('join', { classId, deviceId }),
          loadJitsiScript()
        ]);
        if (disposed || !containerRef.current) return;

        const moderator = !!tokenData.moderator;
        deviceTracked = !!tokenData.deviceTracked;
        setIsModerator(moderator);
        try { cachedToken = await getFreshIdToken(); } catch (e) { /* ignore */ }

        // ✅ جلب رقم الدعوة من الخادم للمعلم
        if (moderator) {
          try {
            const codeRes = await callLiveApi('get-invite-code', { classId });
            if (codeRes && codeRes.inviteCode) setInviteNumber(codeRes.inviteCode);
          } catch (e) { /* ignore */ }

          // ✅ استقبال طلبات الضيوف كل 4 ثوانٍ
          guestPollTimer = setInterval(async () => {
            try {
              const listRes = await callLiveApi('guest-list', { classId });
              if (listRes && Array.isArray(listRes.requests)) {
                setGuestRequests(listRes.requests);
              }
            } catch (e) { /* ignore */ }
          }, GUEST_POLL_MS);
        }

        const lockedName = tokenData.name || displayName || 'مشارك';
        const avatarUrl = tokenData.avatar || '';
        const sessionNumber = tokenData.sessionNumber;

        const options = {
          roomName: tokenData.roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          lang: 'ar',
          jwt: tokenData.jwt,
          userInfo: { displayName: lockedName },
          configOverwrite: {
            prejoinConfig: { enabled: false, hideDisplayName: true },
            securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
            prejoinPageEnabled: false,
            requireDisplayName: false,
            readOnlyName: true,
            disableProfile: true,
            disableDeepLinking: true,
            defaultLanguage: 'ar',
            startWithAudioMuted: true,
            subject: tokenData.className ? `حصة ${tokenData.className}` : 'الحصة المباشرة',
            toolbarButtons: moderator
              ? TOOLBAR_BUTTONS
              : TOOLBAR_BUTTONS.filter((b) => !MODERATOR_ONLY_BUTTONS.includes(b)),
            disableInviteFunctions: !moderator,
            buttonsWithNotifyClick: [
              { key: 'invite', preventExecution: true },
              { key: 'hangup', preventExecution: true },
              { key: 'hangup-menu', preventExecution: true },
              { key: 'end-meeting', preventExecution: true }
            ]
          },
          interfaceConfigOverwrite: {
            SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'sounds'],
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            SUPPORT_URL: ''
          }
        };

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        apiRef.current = api;

        api.addListener('videoConferenceJoined', () => {
          setLoading(false);
          api.executeCommand('displayName', lockedName);
          if (avatarUrl) {
            try { api.executeCommand('avatarUrl', avatarUrl); } catch (e) { /* ignore */ }
          }
          if (!joinedCalledRef.current) {
            joinedCalledRef.current = true;
            if (onJoinedRef.current) {
              try { onJoinedRef.current(); } catch (e) { console.warn('onJoined failed:', e); }
            }
          }
        });

        api.addListener('displayNameChange', (e) => {
          if (e && e.displayname && e.displayname !== lockedName) {
            api.executeCommand('displayName', lockedName);
          }
        });

        api.addListener('toolbarButtonClicked', (e) => {
          if (e && e.key === 'invite') {
            if (inviteNumber) {
              setShowInvite(true);
            } else {
              callLiveApi('get-invite-code', { classId })
                .then((r) => {
                  if (r && r.inviteCode) {
                    setInviteNumber(r.inviteCode);
                    setShowInvite(true);
                  }
                })
                .catch((err) => toast.error(err.message || 'تعذر جلب رقم الدعوة'));
            }
          }
          if (e && (e.key === 'hangup' || e.key === 'hangup-menu')) {
            if (moderator) setAskEnd(true);
            else closeRoom();
          }
        });

        api.addListener('readyToClose', () => closeRoom());

        unsubSession = subscribeToLiveSession(classId, (s) => {
          if (disposed || !s || closingRef.current) return;
          if (!s.active || (sessionNumber != null && s.sessionNumber !== sessionNumber)) {
            closeRoom(moderator ? '' : 'انتهت الحصة من قبل المعلم.');
          }
        });

        const beat = async () => {
          try {
            cachedToken = await getFreshIdToken();
            if (deviceTracked) await callLiveApi('heartbeat', { classId, deviceId });
            if (moderator) await callLiveApi('ping', { classId });
          } catch (e) {
            if (e && e.code === 'device-conflict' && !closingRef.current) {
              shutdownApi();
              setLoading(false);
              setError({ message: e.message || DEVICE_CONFLICT_MESSAGE });
            }
          }
        };
        heartbeatTimer = setInterval(beat, HEARTBEAT_MS);

        window.addEventListener('pagehide', onPageHide);
        loadingTimer = setTimeout(() => setLoading(false), 8000);
      } catch (err) {
        if (disposed) return;
        setLoading(false);
        if (err && err.code === 'device-conflict') {
          setError({ message: err.message || DEVICE_CONFLICT_MESSAGE });
        } else if (err && err.code === 'no-session') {
          setError({ message: 'لا توجد حصة مفتوحة لهذه الشعبة حالياً، أو انتهت الحصة.' });
        } else {
          setError({ message: err.message || 'تعذر فتح الغرفة' });
        }
      }
    })();

    return () => {
      disposed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (loadingTimer) clearTimeout(loadingTimer);
      if (guestPollTimer) clearInterval(guestPollTimer);
      if (unsubSession) unsubSession();
      window.removeEventListener('pagehide', onPageHide);
      exitFullscreen();
      shutdownApi();
      if (deviceTracked) {
        releaseDeviceOnUnload({ idToken: cachedToken, classId, deviceId });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const handleEndForAll = async () => {
    closingRef.current = true;
    try {
      await endLiveSession(classId);
      toast.success('✅ تم إنهاء الحصة.');
    } catch (e) {
      toast.error('تعذر إنهاء الحصة: ' + (e.message || ''));
    }
    if (onCloseRef.current) onCloseRef.current();
  };

  const handleLeaveOnly = () => {
    closingRef.current = true;
    if (onCloseRef.current) onCloseRef.current();
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteNumber);
      toast.success('تم نسخ الرقم.');
    } catch (e) {
      toast.error('تعذر النسخ، انسخ الرقم يدوياً.');
    }
  };

  const respondGuest = async (requestId, approve) => {
    try {
      await callLiveApi('guest-respond', { requestId, approve });
      setGuestRequests((prev) => prev.filter((r) => r.id !== requestId));
      toast.success(approve ? '✅ تم قبول الضيف — سيدخل خلال ثوانٍ' : 'تم رفض الطلب');
    } catch (e) {
      toast.error(e.message || 'فشل');
    }
  };

  const isLight = theme === 'light';

  return createPortal(
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-gray-950'}`}
      style={{ height: '100dvh', overscrollBehavior: 'none' }}
      dir="rtl"
    >
      {loading && !error && !askEnd && (
        <div className={`absolute inset-0 flex items-center justify-center text-lg ${
          isLight ? 'text-slate-600' : 'text-gray-300'
        }`}>
          جاري الدخول إلى الغرفة...
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 p-6 text-center">
          <p className="text-red-500 text-lg max-w-md leading-8">{error.message}</p>
          <button
            type="button"
            onClick={() => onCloseRef.current && onCloseRef.current()}
            className="bg-slate-700 hover:bg-slate-800 text-white px-8 py-3 rounded-xl font-bold"
          >
            إغلاق
          </button>
        </div>
      )}

      <div ref={containerRef} className="absolute inset-0" />

      {/* ✅ شارة طلبات الضيوف المعلقة (للمعلم فقط) */}
      {isModerator && guestRequests.length > 0 && (
        <button
          type="button"
          onClick={() => setShowGuestList(true)}
          className="absolute top-3 right-3 z-20 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 animate-pulse"
        >
          👤 {guestRequests.length} طلب ضيف
        </button>
      )}

      {/* نافذة المعلم عند الضغط على زر الخروج */}
      {askEnd && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white rounded-3xl p-6 max-w-md w-full space-y-3 border border-slate-200 dark:border-gray-700">
            <h3 className="text-xl font-bold text-center">خروج من الغرفة</h3>
            <p className="text-sm text-slate-600 dark:text-gray-300 text-center leading-7">
              هل تريد إنهاء الحصة للجميع، أم الخروج فقط وتبقى الحصة مفتوحة للطلاب؟
            </p>
            <button
              type="button"
              onClick={handleEndForAll}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold"
            >
              إنهاء الحصة للجميع
            </button>
            <button
              type="button"
              onClick={handleLeaveOnly}
              className="w-full bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-900 dark:text-white py-3 rounded-xl font-bold"
            >
              خروج فقط (تبقى الحصة مفتوحة)
            </button>
            <button
              type="button"
              onClick={() => setAskEnd(false)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold"
            >
              العودة إلى الغرفة
            </button>
          </div>
        </div>
      )}

      {/* نافذة رقم الدعوة */}
      {showInvite && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/70"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white rounded-3xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-center">🎥 دعوة ضيف</h3>
            <p className="text-sm text-slate-600 dark:text-gray-300 text-center leading-7">
              أعطِ هذا الرقم للضيف. سيُدخله في شاشة تسجيل الدخول عبر زر <b>«الدخول كضيف»</b>، ثم يكتب اسمه، وتوافق أنت على طلبه.
            </p>
            <p
              dir="ltr"
              className="text-center font-mono text-4xl tracking-[0.4em] bg-emerald-50 dark:bg-emerald-900/20 rounded-xl py-4 px-2 select-all text-emerald-700 dark:text-emerald-300 font-black"
            >
              {inviteNumber || '------'}
            </p>
            <div className="bg-amber-50 dark:bg-amber-500/10 p-2.5 rounded-lg text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
              ⚠️ الضيف يدخل بصورة <b>Intruder</b> بدون كاميرا/مايك/دردشة. لأقصى حماية اضغط زر <b>«mute-everyone»</b> من شريط الأدوات بعد دخوله.
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold"
              >
                <FaCopy className="inline-block me-2" /> نسخ الرقم
              </button>
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="flex-1 bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600 text-slate-900 dark:text-white py-3 rounded-xl font-bold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ قائمة طلبات الضيوف */}
      {showGuestList && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/70"
          onClick={() => setShowGuestList(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white rounded-3xl p-6 max-w-md w-full space-y-3 border border-slate-200 dark:border-gray-700 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">طلبات الضيوف ({guestRequests.length})</h3>
              <button onClick={() => setShowGuestList(false)} className="text-2xl">✕</button>
            </div>
            {guestRequests.length === 0 ? (
              <p className="text-center text-slate-500 dark:text-gray-400 py-6">لا توجد طلبات حالياً.</p>
            ) : (
              <div className="space-y-2">
                {guestRequests.map((r) => (
                  <div key={r.id} className="p-3 bg-slate-50 dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 flex justify-between items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{r.guestName}</p>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                        {new Date(r.createdAtMs).toLocaleTimeString('ar-EG')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => respondGuest(r.id, true)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold">قبول</button>
                      <button onClick={() => respondGuest(r.id, false)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm font-bold">رفض</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* الخروج من ملء الشاشة */}
      {fsLost && !loading && !error && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 p-6 text-center bg-black/85">
          <p className="text-white text-lg max-w-md leading-8">
            خرجت من وضع ملء الشاشة. للمتابعة في الحصة يجب العودة إلى ملء الشاشة.
          </p>
          <button
            type="button"
            onClick={() => { enterFullscreen(); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold"
          >
            <FaExpand className="inline-block me-2" /> العودة لملء الشاشة
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};

export default JitsiRoom;