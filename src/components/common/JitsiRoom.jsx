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

const HEARTBEAT_MS = 30 * 1000; // نبضة الطالب/المعلم كل 30 ثانية

// الأزرار الظاهرة في شريط Jitsi.
// المحذوف عمداً: fullscreen (نتحكم به من المنصة) و stats (حالة المتحدث)
// و embedmeeting (ضمّن الملتقى) و profile (الاسم مقفل) و security (نافذة الأمان:
// نستبدلها بزر «غرفة الانتظار» الخاص بنا فقط).
// ملاحظة: زر noisesuppression (قمع الضوضاء) باقٍ ظاهراً.
const TOOLBAR_BUTTONS = [
  'camera', 'chat', 'closedcaptions', 'desktop', 'download', 'etherpad', 'feedback',
  'filmstrip', 'hangup', 'help', 'highlight', 'invite', 'linktosalesforce',
  'livestreaming', 'microphone', 'mute-everyone', 'mute-video-everyone',
  'noisesuppression', 'participants-pane', 'raisehand', 'reactions', 'recording',
  'select-background', 'settings', 'shareaudio', 'sharedvideo',
  'shortcuts', 'tileview', 'toggle-camera', 'videoquality', 'whiteboard'
];

// أزرار لا تظهر إلا لرئيس الجلسة (المعلم)
const MODERATOR_ONLY_BUTTONS = ['invite', 'sharedvideo'];

// تحميل سكربت Jitsi مرة واحدة فقط من سيرفرك
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

// يطلب ملء الشاشة — لازم يُستدعى مباشرة عند ضغطة الزر
export function enterFullscreen() {
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !isFullscreenNow()) {
      const r = req.call(el);
      if (r && r.catch) r.catch(() => {});
    }
  } catch (e) { /* بعض الأجهزة (مثل iPhone) لا تدعمها، والغرفة تبقى تملأ الصفحة */ }
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

// رقم عشوائي من 30 خانة (أرقام فقط) — بلا وظيفة فعلية حالياً
function generateInviteNumber() {
  const arr = new Uint32Array(30);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, (v) => String(v % 10)).join('');
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
  const [error, setError] = useState(null);       // { message }
  const [loading, setLoading] = useState(true);
  const [isModerator, setIsModerator] = useState(false);
  const [askEnd, setAskEnd] = useState(false);    // نافذة المعلم عند الضغط على زر الخروج
  const [showInvite, setShowInvite] = useState(false);
  const [inviteNumber, setInviteNumber] = useState('');
  const [fsLost, setFsLost] = useState(false);

  // تتبّع تغيير الثيم (فاتح/غامق) من المنصة
  useEffect(() => {
    const handler = (e) => setThemeState(e.detail || getStoredTheme());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  // إعلام بقية المنصة أننا داخل الغرفة (لإخفاء زر الدعم الفني العائم)
  useEffect(() => {
    document.body.dataset.inLessonRoom = '1';
    window.dispatchEvent(new CustomEvent('lesson-room-change', { detail: true }));
    return () => {
      delete document.body.dataset.inLessonRoom;
      window.dispatchEvent(new CustomEvent('lesson-room-change', { detail: false }));
    };
  }, []);

  // قفل تمرير الصفحة الخلفية أثناء وجود الغرفة (يشمل الآيفون والأيباد)
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

  // مراقبة ملء الشاشة: إذا خرج المستخدم منه تظهر رسالة وزر للعودة
  useEffect(() => {
    if (!fullscreenSupported()) return undefined;
    const startedAt = Date.now();
    const check = () => {
      if (isFullscreenNow()) setFsLost(false);
      else if (Date.now() - startedAt > 2500) setFsLost(true); // مهلة قصيرة عند الدخول
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

  // الدخول إلى الغرفة
  useEffect(() => {
    let disposed = false;
    let heartbeatTimer = null;
    let loadingTimer = null;
    let unsubSession = null;
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

        const lockedName = tokenData.name || displayName || 'مشارك';
        const avatarUrl = tokenData.avatar || '';
        const sessionNumber = tokenData.sessionNumber;

        const options = {
          roomName: tokenData.roomName,          // الاسم يحدده الخادم (أحرف صغيرة)
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          lang: 'ar',
          jwt: tokenData.jwt,
          userInfo: { displayName: lockedName },
          configOverwrite: {
            prejoinConfig: { enabled: false, hideDisplayName: true }, // بدون شاشة "أدخل اسمك" وبدون حقل الاسم
            // غرفة الانتظار ملغاة نهائياً: إخفاء زرها وخيار كلمة المرور
            securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
            prejoinPageEnabled: false,
            requireDisplayName: false,
            readOnlyName: true,                  // منع تعديل الاسم
            disableProfile: true,                // إخفاء إعدادات الملف الشخصي
            disableDeepLinking: true,
            defaultLanguage: 'ar',
            startWithAudioMuted: true,
            subject: tokenData.className ? `حصة ${tokenData.className}` : 'الحصة المباشرة', // عنوان الاجتماع بدل اسم الغرفة التقني
            // أزرار للمعلم فقط (الطالب لا يراها): الدعوة ومشاركة فيديو يوتيوب
            toolbarButtons: moderator
              ? TOOLBAR_BUTTONS
              : TOOLBAR_BUTTONS.filter((b) => !MODERATOR_ONLY_BUTTONS.includes(b)),
            disableInviteFunctions: !moderator,
            // زر "ادعُ أحداً": نلتقط الضغطة ونعرض رقماً من 30 خانة بدل الرابط
            buttonsWithNotifyClick: [
              { key: 'invite', preventExecution: true },
              // زر الخروج: نمنع قائمة Jitsi («إنهاء الاجتماع للجميع / اترك الاجتماع») ونخرج مباشرة
              { key: 'hangup', preventExecution: true },
              { key: 'hangup-menu', preventExecution: true },
              { key: 'end-meeting', preventExecution: true }
            ]
          },
          interfaceConfigOverwrite: {
            SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'sounds'], // بدون "profile"
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            SUPPORT_URL: ''                      // إخفاء زر "اتصل بالدعم"
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

        // حماية إضافية: لو تغيّر الاسم بأي طريقة نرجّعه فوراً
        api.addListener('displayNameChange', (e) => {
          if (e && e.displayname && e.displayname !== lockedName) {
            api.executeCommand('displayName', lockedName);
          }
        });

        // زر "ادعُ أحداً"
        api.addListener('toolbarButtonClicked', (e) => {
          if (e && e.key === 'invite') {
            setInviteNumber((prev) => prev || generateInviteNumber());
            setShowInvite(true);
          }
          if (e && (e.key === 'hangup' || e.key === 'hangup-menu')) {
            // المعلم: نافذتنا (إنهاء للجميع / خروج فقط) بدل قائمة Jitsi. الطالب: خروج مباشر
            if (moderator) setAskEnd(true);
            else closeRoom();
          }
        });

        // احتياط: إن أُغلقت المكالمة من داخل Jitsi بطريقة أخرى نخرج مباشرة
        api.addListener('readyToClose', () => closeRoom());

        // متابعة الحصة: إذا أنهاها المعلم (أو بدأت حصة جديدة) يخرج الجميع
        unsubSession = subscribeToLiveSession(classId, (s) => {
          if (disposed || !s || closingRef.current) return;
          if (!s.active || (sessionNumber != null && s.sessionNumber !== sessionNumber)) {
            closeRoom(moderator ? '' : 'انتهت الحصة من قبل المعلم.');
          }
        });

        // نبضات: الطالب (جهاز واحد) / المعلم (إبقاء الحصة ظاهرة)
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
            // أي خطأ آخر (انقطاع شبكة مؤقت) نتجاهله وننتظر النبضة التالية
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

  const isLight = theme === 'light';
  const inviteFormatted = inviteNumber.replace(/(.{5})/g, '$1 ').trim();

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

      {/* نافذة رقم الدعوة (30 خانة) */}
      {showInvite && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/70"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 text-slate-900 dark:text-white rounded-3xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-center">ادعُ أحداً</h3>
            <p className="text-sm text-slate-600 dark:text-gray-300 text-center">رقم الدعوة:</p>
            <p
              dir="ltr"
              className="text-center font-mono text-xl tracking-widest bg-slate-100 dark:bg-gray-800 rounded-xl py-3 px-2 break-all select-all"
            >
              {inviteFormatted}
            </p>
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