import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { supabase } from '../../supabaseClient';

export const ZoomMeetingModal = ({
  isOpen,
  onClose,
  meetingDetails,
  userName,
  userEmail,
  userRole = 1
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actualName, setActualName] = useState('جاري التحميل...');

  const zoomContainerRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    let client = null;

    const initializeMeetingAndUser = async () => {
      if (!isOpen || !meetingDetails || !zoomContainerRef.current) {
        setIsLoading(false);
        return;
      }

      const cleanMeetingNumber = String(meetingDetails.meeting_number || '').replace(/\s+/g, '');

      if (!cleanMeetingNumber) {
        setErrorMessage('رقم الاجتماع غير موجود أو غير صالح.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage('');

      try {
        // 1. تحديد اسم المستخدم
        let resolvedName = (
          userName &&
          userName !== 'teacher' &&
          userName !== 'المعلم'
        ) ? userName : null;

        let resolvedEmail = userEmail || 'teacher@readandrise.com';

        if (!resolvedName) {
          const { data: { user } } = await supabase.auth.getUser();

          if (user) {
            if (user.user_metadata?.full_name) {
              resolvedName = user.user_metadata.full_name;
            } else if (user.user_metadata?.name) {
              resolvedName = user.user_metadata.name;
            } else {
              const { data: userRecord } = await supabase
                .from('users')
                .select('name, full_name, username')
                .eq('id', user.id)
                .maybeSingle();

              if (userRecord) {
                resolvedName = userRecord.full_name || userRecord.name || userRecord.username;
              } else {
                const { data: profileRecord } = await supabase
                  .from('profiles')
                  .select('full_name, name, username')
                  .eq('id', user.id)
                  .maybeSingle();

                if (profileRecord) {
                  resolvedName = profileRecord.full_name || profileRecord.name || profileRecord.username;
                }
              }
            }

            if (user.email) {
              resolvedEmail = user.email;
              if (!resolvedName) resolvedName = user.email.split('@')[0];
            }
          }
        }

        if (!resolvedName) resolvedName = 'المعلم';
        if (isMounted) setActualName(resolvedName);

        // 2. جلب توقيع Zoom
        const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';

        const response = await fetch(`${endpoint}/api/generate-signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingNumber: cleanMeetingNumber,
            role: userRole
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `فشل جلب التوقيع (HTTP ${response.status})`);
        }

        const data = await response.json();

        if (!data.signature) {
          throw new Error('لم يتم استلام توقيع صالح من الخادم.');
        }

        if (!isMounted || !zoomContainerRef.current) return;

        // 3. تهيئة Zoom Embedded SDK
        client = ZoomMtgEmbedded.createClient();
        clientRef.current = client;

        await client.init({
          zoomAppRoot: zoomContainerRef.current,
          language: 'ar-AR',
          patchJsMedia: false,
          canvas: true
        });

        await client.join({
          signature: data.signature,
          meetingNumber: cleanMeetingNumber,
          password: meetingDetails.password || '',
          userName: resolvedName,
          userEmail: resolvedEmail,
          role: userRole,
          tk: '',
          userZak: '',
          leaveUrl: window.location.href
        });

        if (isMounted) setIsLoading(false);
      } catch (err) {
        console.error('❌ خطأ أثناء الانضمام للاجتماع:', err);

        if (isMounted) {
          let msg = err.reason || err.message || JSON.stringify(err);

          if (
            err.errorCode === 3000 ||
            (err.reason && err.reason.includes('Already has other meetings in progress'))
          ) {
            msg = '⚠️ يوجد اجتماع زوم مفتوح بالفعل بنفس الحساب. يرجى إغلاق أي نافذة سابقة.';
          }

          setErrorMessage(msg);
          setIsLoading(false);
        }
      }
    };

    if (isOpen && meetingDetails) {
      initializeMeetingAndUser();
    } else {
      setIsLoading(false);
      setErrorMessage('');
    }

    return () => {
      isMounted = false;

      // تنظيف جلسة Zoom
      if (clientRef.current) {
        try {
          if (typeof clientRef.current.leaveMeeting === 'function') {
            clientRef.current.leaveMeeting();
          } else if (typeof clientRef.current.leave === 'function') {
            clientRef.current.leave();
          }
        } catch (e) {
          console.warn('إغلاق جلسة Zoom:', e);
        }

        clientRef.current = null;
      }
    };
  }, [isOpen, meetingDetails, userRole, userName, userEmail]);

  // منع تمرير الصفحة أثناء وجود الاجتماع
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
      aria-label="اجتماع Zoom"
    >
      {/* زر الإغلاق فقط؛ واجهة الاجتماع وأدواتها يملكها Zoom SDK */}
      <button
        type="button"
        onClick={onClose}
        className="zoom-floating-close"
        aria-label="إغلاق الاجتماع"
        title="إغلاق الاجتماع"
      >
        إغلاق
      </button>

      <div className="zoom-meeting-stage">
        {isLoading && (
          <div className="zoom-loading-overlay">
            <div className="zoom-loading-card">
              <div className="zoom-loading-spinner" />
              <div>جاري الانضمام إلى الاجتماع...</div>
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

        {/* لا نضع أي CSS على عناصر Zoom الداخلية؛ SDK يتحكم بالـ layout بنفسه */}
        <div
          ref={zoomContainerRef}
          id="zoomEmbedContainer"
          className="zoom-embed-root"
        />
      </div>
    </div>
  );

  return createPortal(meetingUI, document.body);
};