import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { JITSI_DOMAIN } from '../../constants';
import { callGuestApi } from '../../services/liveSessions';

const GUEST_STATUS_POLL_MS = 5000;

function loadJitsiScript() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve();
    const existing = document.getElementById('jitsi-external-api');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('تعذر تحميل المحاضرة')));
      return;
    }
    const s = document.createElement('script');
    s.id = 'jitsi-external-api';
    s.src = `https://${JITSI_DOMAIN}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('تعذر تحميل المحاضرة'));
    document.body.appendChild(s);
  });
}

const GuestRoom = ({ data, onClose }) => {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;
    let statusTimer = null;
    let loadingTimer = null;

    const shutdown = () => {
      if (apiRef.current) {
        try { apiRef.current.dispose(); } catch (e) { /* ignore */ }
        apiRef.current = null;
      }
    };

    const closeRoom = (msg) => {
      if (closingRef.current) return;
      closingRef.current = true;
      if (statusTimer) clearInterval(statusTimer);
      shutdown();
      if (msg) toast(msg, { icon: 'ℹ️', duration: 5000 });
      if (onCloseRef.current) onCloseRef.current();
    };

    (async () => {
      try {
        await loadJitsiScript();
        if (disposed || !containerRef.current) return;

        const options = {
          roomName: data.roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          lang: 'ar',
          jwt: data.jwt,
          userInfo: { displayName: data.name },
          configOverwrite: {
            prejoinConfig: { enabled: false, hideDisplayName: true },
            prejoinPageEnabled: false,
            requireDisplayName: false,
            readOnlyName: true,
            disableProfile: true,
            disableDeepLinking: true,
            defaultLanguage: 'ar',
            startWithAudioMuted: true,
            startWithVideoMuted: true,
            disableInitialGUM: true,
            disableChat: true,
            disableChatPanel: true,
            disableInviteFunctions: true,
            disableRemoteMute: false,
            fileRecordingsEnabled: false,
            liveStreamingEnabled: false,
            securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
            toolbarButtons: ['hangup'],
            buttonsWithNotifyClick: [
              { key: 'hangup', preventExecution: true },
              { key: 'hangup-menu', preventExecution: true },
              { key: 'end-meeting', preventExecution: true }
            ],
            subject: data.className ? `حصة ${data.className}` : 'حصة مباشرة',
            notifications: []
          },
          interfaceConfigOverwrite: {
            SETTINGS_SECTIONS: [],
            TOOLBAR_BUTTONS: ['hangup'],
            JITSI_WATERMARK_LINK: '',
            BRAND_WATERMARK_LINK: '',
            SUPPORT_URL: ''
          }
        };

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, options);
        apiRef.current = api;

        api.addListener('videoConferenceJoined', () => {
          setLoading(false);
          try { api.executeCommand('displayName', data.name); } catch (e) {}
          if (data.avatar) {
            try { api.executeCommand('avatarUrl', data.avatar); } catch (e) {}
          }
        });

        api.addListener('toolbarButtonClicked', (e) => {
          if (e && (e.key === 'hangup' || e.key === 'hangup-menu' || e.key === 'end-meeting')) {
            closeRoom();
          }
        });

        api.addListener('readyToClose', () => closeRoom());
        // إذا أُغلق الاجتماع أو أُخرج الضيف من Jitsi نفسه
        api.addListener('videoConferenceLeft', () => closeRoom('انتهت الحصة.'));
        api.addListener('participantKickedOut', (e) => {
          if (e && e.kicked && e.kicked.local) closeRoom('تم إخراجك من الحصة.');
        });

        loadingTimer = setTimeout(() => setLoading(false), 8000);

        // ✅ متابعة حالة الطلب كل 15 ثانية — لو الحصة انتهت يخرج تلقائياً
        statusTimer = setInterval(async () => {
          try {
            const st = await callGuestApi('guest-status', {
              requestId: data.requestId,
              pollToken: data.pollToken
            });
            if (!st.active || st.status !== 'approved') {
              closeRoom('انتهت الحصة.');
            }
          } catch (e) {
            // الطلب محذوف (الحصة انتهت وتم تنظيف الطلبات) → نخرج
            if (e && (e.status === 404 || e.code === 'not-found')) {
              closeRoom('انتهت الحصة.');
            }
            // غير ذلك: خطأ مؤقت في الشبكة، نتجاهله
          }
        }, GUEST_STATUS_POLL_MS);
      } catch (e) {
        if (!disposed) {
          setError(e.message || 'تعذر فتح الغرفة');
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      if (statusTimer) clearInterval(statusTimer);
      if (loadingTimer) clearTimeout(loadingTimer);
      shutdown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-gray-950" dir="rtl">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-lg">
          جاري الدخول كضيف...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 p-6 text-center">
          <p className="text-red-500 text-lg max-w-md leading-8">{error}</p>
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
      {!loading && !error && (
        <div className="absolute top-3 left-3 z-10 text-xs bg-black/60 text-white px-3 py-1.5 rounded-full border border-white/20">
          👤 وضع الضيف — بدون مايك / كاميرا / دردشة
        </div>
      )}
    </div>,
    document.body
  );
};

export default GuestRoom;