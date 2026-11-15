// src/utils/askAssistant.js
import { useSyncExternalStore } from 'react';
import { sendTicketMessage, requestTicketEnd, logSecurityIncident } from '../services/support';

export const AI_SENDER = {
  id: 'ai-assistant',
  name: 'المساعد الذكي سند',
  role: 'system',
};

// ===== حالة "المساعد يكتب الآن" (مشتركة بين الشاشات) =====
const pending = new Map();
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const changePending = (ticketId, delta) => {
  const next = (pending.get(ticketId) || 0) + delta;
  if (next > 0) pending.set(ticketId, next);
  else pending.delete(ticketId);
  emit();
};

export const useAiTyping = (ticketId) =>
  useSyncExternalStore(
    subscribe,
    () => (pending.get(ticketId) || 0) > 0,
    () => false
  );

export const buildAiHistory = (messages = [], studentId) =>
  messages
    .filter((m) => m.senderId === studentId || m.senderId === AI_SENDER.id)
    .slice(-10)
    .map((m) => ({
      role: m.senderId === AI_SENDER.id ? 'model' : 'user',
      text: m.text,
    }));

export async function askAssistant({ ticketId, message, history = [], userRole = 'student' }) {
  changePending(ticketId, +1);
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, userRole }),
    });

    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { /* الرد مش JSON */ }

    if (!response.ok || !data?.text) {
      throw new Error(
        data
          ? `${data.error || 'خطأ'}${data.details ? ' — ' + data.details : ''}`
          : `HTTP ${response.status}`
      );
    }

    await sendTicketMessage(ticketId, AI_SENDER, data.text);

    // ✅ إذا رأى "سند" أن الاستفسار انتهى — يقدّم طلب إنهاء زي المشرف
    if (data.endRequested) {
      try {
        await requestTicketEnd(ticketId, AI_SENDER.name, { aiEnd: true });
      } catch (e) {
        console.warn('AI end-request failed:', e);
      }
    }

    // ✅ إذا اكتشف "سند" محاولة انتحال هوية — تُسجّل الحادثة أمنياً
    if (data.impersonationDetected) {
      try {
        await logSecurityIncident(ticketId, userRole, message);
      } catch (e) {
        console.warn('Security log failed:', e);
      }
    }
  } finally {
    changePending(ticketId, -1);
  }
}