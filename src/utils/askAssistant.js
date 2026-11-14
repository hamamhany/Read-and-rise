
import { sendTicketMessage } from '../services/support';
 
export const AI_SENDER = {
  id: 'ai-assistant',
  name: 'المساعد الذكي',
  role: 'system',
};
 
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
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
 
  await sendTicketMessage(ticketId, AI_SENDER, data.text);
}
 