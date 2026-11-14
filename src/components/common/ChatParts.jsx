import React, { useRef, useEffect, useState } from 'react';
import { FaPaperPlane, FaRobot } from 'react-icons/fa';

// صورة المساعد الذكي: ضعها في public/images/ باسم shat-boot.png
export const BOT_IMAGE = '/images/shat-boot.png';

// ===== شريط تمرير بتصميم المنصة (بدل شريط المتصفح بالأسهم) =====
const CHAT_CSS = `
.chat-scroll { scrollbar-width: thin; scrollbar-color: #4b5563 transparent; }
.chat-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.chat-scroll::-webkit-scrollbar-track { background: transparent; }
.chat-scroll::-webkit-scrollbar-thumb { background-color: #4b5563; border-radius: 9999px; border: 2px solid transparent; background-clip: content-box; }
.chat-scroll::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }
.chat-scroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('chat-parts-style')) {
  const el = document.createElement('style');
  el.id = 'chat-parts-style';
  el.textContent = CHAT_CSS;
  document.head.appendChild(el);
}

export const BotAvatar = ({ size = 32 }) => {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (failed) {
    return (
      <div
        style={style}
        className="rounded-full bg-indigo-600/40 border border-indigo-400/40 flex items-center justify-center text-indigo-200 flex-shrink-0"
      >
        <FaRobot size={Math.round(size * 0.55)} />
      </div>
    );
  }

  return (
    <img
      src={BOT_IMAGE}
      alt="المساعد الذكي"
      style={style}
      onError={() => setFailed(true)}
      className="rounded-full object-cover flex-shrink-0 bg-gray-800"
    />
  );
};

// فقاعة "المساعد يكتب الآن": ثلاث نقاط تتنطط بجانب صورة البوت
export const TypingBubble = () => (
  <div className="flex items-end gap-2 justify-start">
    <BotAvatar />
    <div
      className="bg-gray-800 border border-gray-700 rounded-2xl rounded-br-none px-4 py-3 flex items-center gap-1.5"
      aria-label="المساعد الذكي يكتب"
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

// خانة الكتابة: تكبر مع النص حتى 10 أسطر، وتدعم العربي والإنجليزي بالتبديل
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

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent?.isComposing) return;
    // على الجوال: Enter سطر جديد، والإرسال بالزر
    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;
    e.preventDefault();
    if (!sending && !disabled && value.trim()) onSend();
  };

  return (
    <div
      dir="rtl"
      className="flex-shrink-0 bg-gray-900/90 backdrop-blur border-t border-gray-800 px-3 pt-2"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-3xl mx-auto w-full flex items-end gap-2 bg-gray-800 border border-gray-700 focus-within:border-blue-500 rounded-3xl px-3 py-1.5 transition-colors">
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
          onClick={onSend}
          disabled={sending || disabled || !value.trim()}
          className="w-9 h-9 mb-0.5 flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 disabled:hover:bg-blue-600 transition"
          title="إرسال"
        >
          <FaPaperPlane size={14} style={{ transform: 'scaleX(-1)' }} />
        </button>
      </div>
    </div>
  );
};