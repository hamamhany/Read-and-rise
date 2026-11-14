import React, { useRef, useEffect, useState } from 'react';
import { FaPaperPlane, FaRobot, FaHeadset, FaUserTie } from 'react-icons/fa';

// ===== مسارات الصور والصوت (عدّلها هنا إذا اختلف اسم الملف أو الامتداد) =====
export const BOT_IMAGE = '/images/shat-boot.png';              // صورة المساعد الذكي
export const SUPPORT_IMAGE = '/images/Support-image.png';      // صورة هيدر الدعم الفني
export const SUPERVISOR_IMAGE = '/images/Supervision-image.png'; // صورة المشرف
const SEND_SOUND_BASE = '/voice/Transmission-effect';          // صوت الإرسال (بدون امتداد)
const SEND_SOUND_EXTS = ['mp3', 'wav', 'ogg', 'm4a'];          // يجرّب الامتدادات بالترتيب

// ===== شريط تمرير بتصميم المنصة + حركات المحادثة =====
const CHAT_CSS = `
.chat-scroll { scrollbar-width: thin; scrollbar-color: #4b5563 transparent; }
.chat-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.chat-scroll::-webkit-scrollbar-track { background: transparent; }
.chat-scroll::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }
.chat-scroll::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }
.chat-scroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }

@keyframes chat-in-right { from { opacity: 0; transform: translate(28px, 14px) scale(.85); } to { opacity: 1; transform: none; } }
@keyframes chat-in-left  { from { opacity: 0; transform: translate(-28px, 14px) scale(.85); } to { opacity: 1; transform: none; } }
@keyframes chat-glow { 0% { box-shadow: 0 0 0 0 rgba(96,165,250,.55); } 100% { box-shadow: 0 0 0 14px rgba(96,165,250,0); } }
@keyframes chat-plane {
  0%   { transform: translate(0, 0) scale(1); opacity: 1; }
  45%  { transform: translate(-16px, -16px) scale(.7); opacity: 0; }
  46%  { transform: translate(16px, 16px) scale(.7); opacity: 0; }
  100% { transform: translate(0, 0) scale(1); opacity: 1; }
}
@keyframes chat-press { 0% { transform: scale(1); } 40% { transform: scale(.86); } 100% { transform: scale(1); } }
.chat-in-right { animation: chat-in-right .38s cubic-bezier(.2,.9,.3,1.25) both; transform-origin: bottom right; }
.chat-in-left  { animation: chat-in-left .38s cubic-bezier(.2,.9,.3,1.25) both; transform-origin: bottom left; }
.chat-glow { animation: chat-glow .7s ease-out; }
.chat-plane-fly { display: inline-flex; animation: chat-plane .5s ease-in-out; }
.chat-press { animation: chat-press .3s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .chat-in-right, .chat-in-left, .chat-glow, .chat-plane-fly, .chat-press { animation: none !important; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('chat-parts-style')) {
  const el = document.createElement('style');
  el.id = 'chat-parts-style';
  el.textContent = CHAT_CSS;
  document.head.appendChild(el);
}

// ===== صوت الإرسال =====
let sendAudio = null;
let sendExtIndex = 0;
let sendSoundDisabled = false;

const loadSendAudio = () => {
  if (typeof Audio === 'undefined') { sendSoundDisabled = true; return; }
  if (sendExtIndex >= SEND_SOUND_EXTS.length) { sendSoundDisabled = true; sendAudio = null; return; }
  const a = new Audio(`${SEND_SOUND_BASE}.${SEND_SOUND_EXTS[sendExtIndex]}`);
  a.preload = 'auto';
  a.volume = 0.6;
  // إذا الملف مش موجود أو الامتداد غلط، جرّب الامتداد التالي
  a.addEventListener('error', () => { sendExtIndex += 1; sendAudio = null; loadSendAudio(); }, { once: true });
  sendAudio = a;
};

export const prepareSendSound = () => {
  if (!sendAudio && !sendSoundDisabled) loadSendAudio();
};

export const playSendSound = () => {
  if (sendSoundDisabled) return;
  prepareSendSound();
  try {
    if (!sendAudio) return;
    sendAudio.currentTime = 0;
    const p = sendAudio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    // تجاهل أي خطأ بالصوت
  }
};

// ===== الصور الدائرية =====
const ImgAvatar = ({ src, alt, size, Fallback, fallbackClass }) => {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (failed) {
    return (
      <div
        style={style}
        className={`rounded-full border flex items-center justify-center flex-shrink-0 ${fallbackClass}`}
      >
        <Fallback size={Math.round(size * 0.5)} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setFailed(true)}
      className="rounded-full object-cover flex-shrink-0 bg-gray-800"
    />
  );
};

export const BotAvatar = ({ size = 32 }) => (
  <ImgAvatar src={BOT_IMAGE} alt="المساعد الذكي" size={size} Fallback={FaRobot}
    fallbackClass="bg-indigo-600/40 border-indigo-400/40 text-indigo-200" />
);

export const SupportAvatar = ({ size = 32 }) => (
  <ImgAvatar src={SUPPORT_IMAGE} alt="الدعم الفني" size={size} Fallback={FaHeadset}
    fallbackClass="bg-blue-600/40 border-blue-400/40 text-blue-200" />
);

export const SupervisorAvatar = ({ size = 32 }) => (
  <ImgAvatar src={SUPERVISOR_IMAGE} alt="المشرف" size={size} Fallback={FaUserTie}
    fallbackClass="bg-emerald-600/40 border-emerald-400/40 text-emerald-200" />
);

// فقاعة "يكتب الآن": ثلاث نقاط تتنطط بجانب صورة المساعد أو المشرف (على اليسار)
export const TypingBubble = ({ kind = 'ai' }) => (
  <div className="flex items-end gap-2 flex-row-reverse justify-start chat-in-left">
    {kind === 'staff' ? <SupervisorAvatar /> : <BotAvatar />}
    <div
      className="bg-gray-800 border border-gray-700 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-1.5"
      aria-label={kind === 'staff' ? 'المشرف يكتب' : 'المساعد الذكي يكتب'}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  </div>
);

const LINE_HEIGHT = 24; // يساوي leading-6
const MAX_LINES = 10;   // بعد 10 أسطر يتوقف النمو ويظهر شريط التمرير

// خانة الكتابة: تكبر مع النص حتى 10 أسطر، وتدعم العربي والإنجليزي، وفيها تأثير وصوت للإرسال
export const ChatComposer = ({
  value,
  onChange,
  onSend,
  sending = false,
  disabled = false,
  placeholder = 'اكتب رسالتك...',
  maxLength = 2000,
  autoFocus = false,
}) => {
  const ref = useRef(null);
  const [flying, setFlying] = useState(false);
  const flyTimer = useRef(null);

  useEffect(() => {
    prepareSendSound();
    return () => { if (flyTimer.current) clearTimeout(flyTimer.current); };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const maxH = LINE_HEIGHT * MAX_LINES + padY;
    el.style.height = 'auto';
    const needed = el.scrollHeight;
    el.style.height = Math.min(needed, maxH) + 'px';
    // شريط التمرير يظهر فقط لما يتجاوز النص 10 أسطر
    el.style.overflowY = needed > maxH + 1 ? 'auto' : 'hidden';
  }, [value]);

  const triggerSend = () => {
    if (sending || disabled || !value.trim()) return;
    // الصوت والحركة لحظة الضغط (ضروري عشان المتصفحات تسمح بتشغيل الصوت)
    playSendSound();
    setFlying(true);
    if (flyTimer.current) clearTimeout(flyTimer.current);
    flyTimer.current = setTimeout(() => setFlying(false), 520);
    onSend();
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    // على الجوال: Enter سطر جديد، والإرسال بالزر
    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;
    e.preventDefault();
    triggerSend();
  };

  return (
    <div
      dir="rtl"
      className="flex-shrink-0 bg-gray-900/90 backdrop-blur border-t border-gray-800 px-3 pt-2"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full flex items-end gap-2 bg-gray-800 border border-gray-700 focus-within:border-blue-500 rounded-3xl px-3 py-1.5 transition-colors">
        <textarea
          ref={ref}
          rows={1}
          dir={value ? 'auto' : 'rtl'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          autoFocus={autoFocus}
          disabled={disabled}
          style={{ unicodeBidi: 'plaintext', textAlign: 'start' }}
          className="chat-scroll flex-1 min-w-0 bg-transparent text-white text-[15px] leading-6 py-2 resize-none outline-none border-0 placeholder-gray-500"
        />
        <button
          type="button"
          onClick={triggerSend}
          disabled={sending || disabled || !value.trim()}
          className={`w-9 h-9 mb-0.5 flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 disabled:hover:bg-blue-600 transition ${flying ? 'chat-press' : ''}`}
          title="إرسال"
        >
          <span className={flying ? 'chat-plane-fly' : 'inline-flex'}>
            <FaPaperPlane size={14} style={{ transform: 'scaleX(-1)' }} />
          </span>
        </button>
      </div>
    </div>
  );
};