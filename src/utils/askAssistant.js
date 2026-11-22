// src/utils/askAssistant.js
import { useSyncExternalStore } from 'react';
import { sendTicketMessage, requestTicketEnd, logSecurityIncident, markAiHandedOff } from '../services/support';

export const AI_SENDER = {
  id: 'ai-assistant',
  name: 'المساعد الذكي سند',
  role: 'system',
};

const pending = new Map();
const inFlight = new Set();
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

export async function askAssistant({
  ticketId,
  message,
  history = [],
  userRole = 'student',
  suppressEndTag = false,
  userName = '',
  userGender = '',
}) {
  const key = `${ticketId}|${(message || '').slice(0, 60)}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  changePending(ticketId, +1);
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history, userRole, suppressEndTag, userName, userGender }),
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

    // ✅ سند حوّل المحادثة لقسم الإشراف: نسجّل ذلك فلا يرد سند بعدها إطلاقاً
    if (data.handoff) {
      try {
        await markAiHandedOff(ticketId);
      } catch (e) {
        console.warn('AI handoff mark failed:', e);
      }
    }

    if (data.endRequested && !data.handoff) {
      try {
        await requestTicketEnd(ticketId, AI_SENDER.name, { aiEnd: true });
      } catch (e) {
        console.warn('AI end-request failed:', e);
      }
    }

    if (data.impersonationDetected) {
      try {
        await logSecurityIncident(ticketId, userRole, message);
      } catch (e) {
        console.warn('Security log failed:', e);
      }
    }
  } finally {
    inFlight.delete(key);
    changePending(ticketId, -1);
  }
}
/**
 * ✅ مراجعة محتوى الإعلان قبل النشر (عبر المساعد الذكي سند)
 * - يستدعي /api/gemini بوضع المراجعة (mode: 'moderation')
 * - يعيد { safe, reason, confidence }
 * - إذا فشل الاتصال: { safe: false, error: true, reason } → يُرسَل للمدير للمراجعة اليدوية
 */
export const reviewAnnouncementContent = async (title, body) => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'moderation',
        title: title || '',
        body: body || ''
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        safe: false,
        error: true,
        reason: data?.error || `HTTP ${response.status}`,
        confidence: 0
      };
    }

    return {
      safe: data.safe === true,
      reason: data.reason || '',
      confidence: Number(data.confidence) || 0
    };
  } catch (e) {
    return {
      safe: false,
      error: true,
      reason: 'تعذر الاتصال بالمراجعة الآلية: ' + e.message,
      confidence: 0
    };
  }
};