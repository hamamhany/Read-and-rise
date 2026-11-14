import React, { useRef, useEffect, useState } from 'react';
import { FaPaperPlane, FaRobot } from 'react-icons/fa';

// صورة المساعد الذكي: ضعها في public/images/ باسم shat-boot.png
export const BOT_IMAGE = '/images/shat-boot.png';

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

// خانة الكتابة: تكبر مع النص (سطر جديد تلقائي)، وتدعم العربي والإنجليزي بالتبديل
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
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
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
      className="p-2 border-t border-gray-700 flex items-end gap-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
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
        className="flex-1 bg-gray-800 text-white px-3 py-2 rounded-2xl border border-gray-600 text-sm leading-6 resize-none overflow-y-auto focus:outline-none focus:border-blue-500"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={sending || disabled || !value.trim()}
        className="w-10 h-10 flex-shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center disabled:opacity-40 transition"
        title="إرسال"
      >
        <FaPaperPlane style={{ transform: 'scaleX(-1)' }} />
      </button>
    </div>
  );
};