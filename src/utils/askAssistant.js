import { useSyncExternalStore } from 'react';
import { sendTicketMessage } from '../services/support';

export const AI_SENDER = {
  id: 'ai-assistant',
  name: 'المساعد الذكي',
  role: 'system',
};

// ===== حالة "المساعد يكتب الآن" (مشتركة بين الشاشات) =====
const pending = new Map(); // ticketId -> عدد الطلبات الجارية
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

// true طالما المساعد يجهّز رداً لهذه التذكرة
export const useAiTyping = (ticketId) =>
  useSyncExternalStore(
    subscribe,
    () => (pending.get(ticketId) || 0) > 0,
    () => false
  );

// يبني سجل المحادثة اللي بينبعت لـ Gemini (آخر 10 رسائل من الطالب والمساعد فقط)
export const buildAiHistory = (messages = [], studentId) =>
  messages
    .filter((m) => m.senderId === studentId || m.senderId === AI_SENDER.id)
    .slice(-10)
    .map((m) => ({
      role: m.senderId === AI_SENDER.id ? 'model' : 'user',
      text: m.text,
    }));

// ينادي /api/gemini ويحفظ الرد بالتذكرة. بيرمي خطأ إذا فشل.
export async function askAssistant({ ticketId, message, history = [] }) {
  changePending(ticketId, +1);
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });

    const raw = await response.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // الرد مش JSON
    }

    if (!response.ok || !data?.text) {
      throw new Error(
        data
          ? `${data.error || 'خطأ'}${data.details ? ' — ' + data.details : ''}`
          : `HTTP ${response.status}`
      );
    }

    await sendTicketMessage(ticketId, AI_SENDER, data.text);
  } finally {
    changePending(ticketId, -1);
  }
}