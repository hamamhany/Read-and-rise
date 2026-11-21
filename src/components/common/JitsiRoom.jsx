import React, { useEffect, useRef, useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { getStoredTheme } from '../../utils/theme';
import { auth } from '../../services/firebaseAuth';
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

// يطلب "تذكرة دخول" من خادم المنصة: الخادم هو من يحدد الاسم ومن هو رئيس الجلسة
async function fetchJitsiToken(roomName) {
  const user = auth.currentUser;
  if (!user) throw new Error('لم يتم العثور على حساب مسجّل الدخول، أعد تسجيل الدخول.');
  const idToken = await user.getIdToken();
  let res;
  try {
    res = await fetch('/api/jitsi-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ roomName })
    });
  } catch (e) {
    throw new Error('تعذر الاتصال بخادم المنصة (api/jitsi-token).');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok || !data || !data.jwt) {
    const reason = (data && data.error) ? data.error : `رمز الخطأ ${res.status}`;
    throw new Error('تعذر الحصول على تصريح الدخول: ' + reason);
  }
  return data; // { jwt, name, moderator }
}

const JitsiRoom = ({ roomName, displayName, onClose }) => {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [theme, setThemeState] = useState(getStoredTheme());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filmstripVisible, setFilmstripVisible] = useState(true);

  // تتبّع تغيير الثيم (فاتح/غامق) من المنصة
  useEffect(() => {
    const handler = (e) => setThemeState(e.detail || getStoredTheme());
    window.addEventListener('theme-change', handler);
    return () => window.removeEventListener('theme-change', handler);
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

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const [tokenData] = await Promise.all([fetchJitsiToken(roomName), loadJitsiScript()]);
        if (disposed || !containerRef.current) return;

        // الاسم يأتي من الخادم إن توفّر، وإلا من المنصة
        const lockedName = (tokenData && tokenData.name) || displayName || 'مشارك';

        const options = {
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
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: ''
          }
        };
        if (tokenData && tokenData.jwt) options.jwt = tokenData.jwt;

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        apiRef.current = api;

        api.addListener('videoConferenceJoined', () => {
          setLoading(false);
          api.executeCommand('displayName', lockedName);
        });
        // حماية إضافية: لو تغيّر الاسم بأي طريقة نرجّعه فوراً
        api.addListener('displayNameChange', (e) => {
          if (e && e.displayname && e.displayname !== lockedName) {
            api.executeCommand('displayName', lockedName);
          }
        });
        api.addListener('filmstripDisplayChanged', (e) => {
          if (e && typeof e.visible === 'boolean') setFilmstripVisible(e.visible);
        });
        // زر الإغلاق/المغادرة الموجود داخل Jitsi
        api.addListener('readyToClose', () => onClose && onClose());
        setTimeout(() => setLoading(false), 8000);
      } catch (err) {
        if (!disposed) { setError(err.message || 'تعذر فتح الغرفة'); setLoading(false); }
      }
    })();

    return () => {
      disposed = true;
      exitFullscreen();
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (e) { /* ignore */ }
        apiRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName]);

  const toggleFilmstrip = () => {
    if (apiRef.current) {
      try { apiRef.current.executeCommand('toggleFilmStrip'); } catch (e) { /* ignore */ }
    }
  };

  const isLight = theme === 'light';

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-gray-950'}`}
      style={{ height: '100dvh', overscrollBehavior: 'none' }}
      dir="rtl"
    >
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

      <div ref={containerRef} className="absolute inset-0" />

      {/* سهم لإظهار/إخفاء عمود الأعضاء (مناسب للهواتف والأيباد) */}
      {!loading && !error && (
        <button
          type="button"
          onClick={toggleFilmstrip}
          aria-label={filmstripVisible ? 'إخفاء قائمة الأعضاء' : 'إظهار قائمة الأعضاء'}
          style={{ right: 0, top: '45%' }}
          className="absolute z-10 w-9 h-16 flex items-center justify-center rounded-s-2xl bg-black/60 hover:bg-black/80 text-white shadow-lg backdrop-blur-sm"
        >
          {filmstripVisible ? <FaChevronRight /> : <FaChevronLeft />}
        </button>
      )}
    </div>
  );
};

export default JitsiRoom;