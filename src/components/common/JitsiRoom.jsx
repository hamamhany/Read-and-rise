import React, { useEffect, useRef, useState } from 'react';
import { FaTimes } from 'react-icons/fa';
import { getStoredTheme } from '../../utils/theme';
import { JITSI_DOMAIN } from '../../constants';

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

// يطلب ملء الشاشة — لازم يُستدعى مباشرة عند ضغطة الزر
export function enterFullscreen() {
  try {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req && !document.fullscreenElement) {
      const r = req.call(el);
      if (r && r.catch) r.catch(() => {});
    }
  } catch (e) { /* بعض الأجهزة (مثل iPhone) لا تدعمها، والغرفة تبقى تملأ الصفحة */ }
}

export function exitFullscreen() {
  try {
    if (document.fullscreenElement) {
      const r = document.exitFullscreen();
      if (r && r.catch) r.catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

// role: 'teacher' (رئيس الجلسة) أو 'student' (طالب عادي)
const JitsiRoom = ({ roomName, displayName, role = 'student', onClose }) => {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [theme, setThemeState] = useState(getStoredTheme());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // تتبّع تغيير الثيم (فاتح/غامق) من المنصة
  useEffect(() => {
    const handler = (e) => setThemeState(e.detail || getStoredTheme());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
  }, []);

  useEffect(() => {
    let disposed = false;
    const isTeacher = role === 'teacher';
    const lockedName = displayName || (isTeacher ? 'المعلم' : 'طالب');
    // أزرار أقل للطالب: بدون تسجيل أو بث أو دعوات
    const studentToolbar = [
      'microphone', 'camera', 'desktop', 'chat', 'raisehand',
      'tileview', 'fullscreen', 'hangup', 'settings', 'select-background'
    ];
    const teacherToolbar = [
      'microphone', 'camera', 'desktop', 'chat', 'raisehand', 'participants-pane',
      'tileview', 'fullscreen', 'recording', 'mute-everyone', 'mute-video-everyone',
      'security', 'hangup', 'settings', 'select-background'
    ];

    loadJitsiScript()
      .then(() => {
        if (disposed || !containerRef.current) return;
        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName: lockedName },
          configOverwrite: {
            prejoinConfig: { enabled: false },   // بدون شاشة "أدخل اسمك"
            prejoinPageEnabled: false,
            requireDisplayName: false,
            readOnlyName: true,                  // منع تعديل الاسم
            disableProfile: true,                // إخفاء إعدادات الملف الشخصي
            disableDeepLinking: true,
            defaultLanguage: 'ar',
            startWithAudioMuted: true
          },
          interfaceConfigOverwrite: {
            SETTINGS_SECTIONS: ['devices', 'language', 'moderator', 'sounds'], // بدون "profile"
            // منع الشعار من تحويل الطالب إلى موقع Jitsi
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            TOOLBAR_BUTTONS: isTeacher ? teacherToolbar : studentToolbar
          }
        });
        apiRef.current = api;

        api.addListener('videoConferenceJoined', () => {
          setLoading(false);
          api.executeCommand('displayName', lockedName);
        });
        // حماية إضافية: لو تغيّر الاسم بأي طريقة نرجّعه فوراً
        api.addListener('displayNameChange', (e) => {
          if (e && e.displayname !== lockedName) {
            api.executeCommand('displayName', lockedName);
          }
        });
        api.addListener('readyToClose', () => onClose && onClose());
        setTimeout(() => setLoading(false), 8000);
      })
      .catch((err) => {
        if (!disposed) { setError(err.message); setLoading(false); }
      });

    return () => {
      disposed = true;
      exitFullscreen();
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (e) { /* ignore */ }
        apiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName, role]);

  const isLight = theme === 'light';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col ${isLight ? 'bg-slate-100' : 'bg-gray-950'}`}
      dir="rtl"
    >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-gray-900 border-gray-700 text-gray-100'
      }`}>
        <div className="font-bold text-base">🎥 غرفة الصف — أقرأ وارتق</div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-bold"
        >
          <FaTimes /> مغادرة الغرفة
        </button>
      </div>

      <div className="relative flex-1">
        {loading && !error && (
          <div className={`absolute inset-0 flex items-center justify-center text-lg ${
            isLight ? 'text-slate-600' : 'text-gray-300'
          }`}>
            جاري الدخول إلى الغرفة...
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 text-lg p-6 text-center">
            {error}
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default JitsiRoom;