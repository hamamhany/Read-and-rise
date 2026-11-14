// api/cron-support-fallback.js
import admin from 'firebase-admin';

// ===== تهيئة Firebase Admin (مرة واحدة فقط) =====
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

const AI_FALLBACK_MS = 10 * 60 * 1000; // 10 دقائق
const AI_SENDER_ID = 'ai-assistant';
const AI_SENDER_NAME = 'المساعد الذكي سند';
const AI_SENDER_ROLE = 'system';

// دالة لحجز حق الرد ومنع التكرار (نفس فكرة claimAiReply في العميل)
async function claimAiReply(ticketId, messageId) {
  const ticketRef = db.collection('supportTickets').doc(ticketId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ticketRef);
      if (!snap.exists) return false;
      if (snap.data().aiRepliedToMessageId === messageId) return false;
      tx.update(ticketRef, { aiRepliedToMessageId: messageId });
      return true;
    });
  } catch (err) {
    console.warn('claimAiReply failed in cron:', err);
    return false;
  }
}

// بناء سجل المحادثة الذي يفهمه Gemini
function buildAiHistory(messages, studentId) {
  return messages
    .filter((m) => m.senderId === studentId || m.senderId === AI_SENDER_ID)
    .slice(-10)
    .map((m) => ({
      role: m.senderId === AI_SENDER_ID ? 'model' : 'user',
      text: m.text,
    }));
}

export default async function handler(req, res) {
  // ===== حماية الرابط بمفتاح سري =====
  const secret = req.query.secret || req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = Date.now();
    const cutoff = now - AI_FALLBACK_MS;

    // جلب كل التذاكر قيد التنفيذ
    const snap = await db
      .collection('supportTickets')
      .where('status', '==', 'in_progress')
      .get();

    const results = [];

    for (const doc of snap.docs) {
      const ticket = doc.data();
      const messages = ticket.messages || [];
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];

      // تجاهل إذا كانت آخر رسالة من المساعد أو من المشرف
      if (lastMsg.senderId === AI_SENDER_ID) continue;
      if (lastMsg.senderId === ticket.assignedSupervisorId) continue;

      // تجاهل إذا لم تمر 10 دقائق بعد
      const lastMsgTime = new Date(lastMsg.createdAt).getTime();
      if (!lastMsgTime || lastMsgTime > cutoff) continue;

      // تجاهل إذا سبق للمساعد الرد على هذه الرسالة
      if (ticket.aiRepliedToMessageId === lastMsg.id) continue;

      // حجز حق الرد (لمنع التكرار لو حدث تنفيذ متزامن)
      const claimed = await claimAiReply(doc.id, lastMsg.id);
      if (!claimed) continue;

      // بناء السجل وإرساله إلى Gemini
      const history = buildAiHistory(messages, ticket.studentId);
      const geminiUrl = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/gemini`;

      let aiText = null;
      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: lastMsg.text, history }),
        });
        if (!geminiRes.ok) {
          console.error('Gemini HTTP error:', geminiRes.status, await geminiRes.text());
          continue;
        }
        const data = await geminiRes.json();
        aiText = data?.text;
      } catch (err) {
        console.error('Gemini fetch error:', err);
        continue;
      }

      if (!aiText) continue;

      // تجهيز رسالة المساعد وحفظها في Firestore
      const aiMessage = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        senderId: AI_SENDER_ID,
        senderName: AI_SENDER_NAME,
        senderRole: AI_SENDER_ROLE,
        text: aiText,
        createdAt: new Date().toISOString(),
      };

      await db.collection('supportTickets').doc(doc.id).update({
        messages: admin.firestore.FieldValue.arrayUnion(aiMessage),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMessage: aiText,
        unreadForStudent: false,
        unreadForSupervisor: true,
      });

      results.push({ ticketId: doc.id, replied: true });
    }

    return res.status(200).json({
      ok: true,
      checked: snap.size,
      replied: results.length,
      results,
    });
  } catch (error) {
    console.error('Cron fallback error:', error);
    return res.status(500).json({
      error: 'Internal error',
      details: String(error.message || error).slice(0, 300),
    });
  }
}