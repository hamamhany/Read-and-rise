// api/cron-support-fallback.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

const AI_FALLBACK_MS = 10 * 60 * 1000;
const AI_SENDER_ID = 'ai-assistant';
const AI_SENDER_NAME = 'المساعد الذكي سند';
const AI_SENDER_ROLE = 'system';
const SUPPORT_END_TIMEOUT_MS = 24 * 60 * 60 * 1000;

async function isAiEnabled() {
  try {
    const snap = await db.collection('systemSettings').doc('ai').get();
    return snap.exists ? snap.data().enabled !== false : true;
  } catch (e) {
    console.warn('AI settings check failed in cron:', e.message);
    return true;
  }
}

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
  const secret = req.headers['x-cron-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const enabled = await isAiEnabled();
    if (!enabled) {
      return res.status(200).json({ ok: true, skipped: 'AI is disabled by admin' });
    }

    const now = Date.now();
    const cutoff = now - AI_FALLBACK_MS;

    const snap = await db
      .collection('supportTickets')
      .where('status', '==', 'in_progress')
      .get();

    const results = [];

    for (const doc of snap.docs) {
      const ticket = doc.data();
      // ✅ سند حوّل المحادثة للإشراف: لا ردود آلية بعد ذلك (توفيراً للباقة)
      if (ticket.aiHandedOff === true) continue;
      const messages = ticket.messages || [];
      if (messages.length === 0) continue;

      const lastMsg = messages[messages.length - 1];

      // ✅ لا ترد على رسائل سند نفسه، ولا على رسائل المشرف
      if (lastMsg.senderId === AI_SENDER_ID) continue;
      if (lastMsg.senderId === ticket.assignedSupervisorId) continue;

      const lastMsgTime = new Date(lastMsg.createdAt).getTime();
      if (!lastMsgTime || lastMsgTime > cutoff) continue;

      if (ticket.aiRepliedToMessageId === lastMsg.id) continue;

      const claimed = await claimAiReply(doc.id, lastMsg.id);
      if (!claimed) continue;

      const history = buildAiHistory(messages, ticket.studentId);
      const geminiUrl = `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000'}/api/gemini`;

      let aiText = null;
      let endRequested = false;
      let impersonationDetected = false;
      let handoff = false;
      try {
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: lastMsg.text,
            history,
            userRole: ticket.studentRole || 'student',
            userName: ticket.studentName || '',
            userGender: ticket.studentGender || '',
          }),
        });
        if (!geminiRes.ok) {
          console.error('Gemini HTTP error:', geminiRes.status, await geminiRes.text());
          continue;
        }
        const data = await geminiRes.json();
        aiText = data?.text;
        endRequested = !!data?.endRequested;
        impersonationDetected = !!data?.impersonationDetected;
        handoff = !!data?.handoff;
      } catch (err) {
        console.error('Gemini fetch error:', err);
        continue;
      }

      if (!aiText) continue;

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

      if (handoff) {
        try {
          await db.collection('supportTickets').doc(doc.id).update({
            aiHandedOff: true,
            aiHandedOffAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn('cron handoff mark failed:', e);
        }
      }

      if (endRequested && !handoff) {
        try {
          await db.collection('supportTickets').doc(doc.id).update({
            status: 'supervisor_ended',
            endRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
            endRequestExpiresAt: new Date(now + SUPPORT_END_TIMEOUT_MS),
            aiRequestedEnd: true,
            unreadForStudent: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn('cron AI end-request failed:', e);
        }
      }

      if (impersonationDetected) {
        try {
          await db.collection('securityIncidents').add({
            ticketId: doc.id,
            userId: ticket.studentId || null,
            userRole: ticket.studentRole || 'unknown',
            text: String(lastMsg.text || '').slice(0, 2000),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            reviewed: false,
          });
        } catch (e) {
          console.warn('cron security log failed:', e);
        }
      }

      results.push({ ticketId: doc.id, replied: true, ended: endRequested });
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