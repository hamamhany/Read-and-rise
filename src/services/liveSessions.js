// src/services/liveSessions.js
// كل ما يخص الحصص المباشرة من جهة المتصفح
import { db } from '../firebase';
import { auth } from './firebaseAuth';
import { collection, doc, query, where, onSnapshot } from 'firebase/firestore';

export const LIVE_SESSIONS_COLLECTION = 'liveSessions';
export const LIVE_VISIBLE_STALE_MS = 5 * 60 * 1000; // يجب أن يطابق VISIBLE_STALE_MS في api/jitsi-token.js

export const DEVICE_CONFLICT_MESSAGE =
  'لقد قمت بالانضمام من جهاز آخر. لا يُسمح بالانضمام من أكثر من جهاز لنفس الحساب، يجب الخروج أولاً من الحساب الآخر.';

// معرّف هذا الجهاز/التبويب (يبقى عند تحديث الصفحة، ويختلف في جهاز أو تبويب آخر)
export function getDeviceId() {
  const KEY = 'rr-device-id';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export async function getFreshIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('لم يتم العثور على حساب مسجّل الدخول، أعد تسجيل الدخول.');
  return user.getIdToken();
}

// نداء موحّد لخادم المنصة (api/jitsi-token)
export async function callLiveApi(action, payload = {}) {
  const idToken = await getFreshIdToken();
  let res;
  try {
    res = await fetch('/api/jitsi-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action, ...payload })
    });
  } catch (e) {
    const err = new Error('تعذر الاتصال بخادم المنصة.');
    err.code = 'network';
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `رمز الخطأ ${res.status}`);
    err.code = data && data.code;
    err.status = res.status;
    throw err;
  }
  return data || {};
}

// تحرير الجهاز أثناء إغلاق الصفحة (يعمل حتى لو أُغلق المتصفح)
export function releaseDeviceOnUnload({ idToken, classId, deviceId }) {
  if (!idToken || !deviceId) return;
  try {
    fetch('/api/jitsi-token', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ action: 'release', classId, deviceId })
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

export const startLiveSession = (classId) => callLiveApi('start', { classId });
export const endLiveSession = (classId) => callLiveApi('end', { classId });

// الحصة تُعتبر "ظاهرة للانضمام" إذا كانت مفتوحة والمعلم ما زال ينبض
export const isSessionJoinable = (session, now = Date.now()) =>
  !!(session && session.active && now - (session.lastPingMs || 0) < LIVE_VISIBLE_STALE_MS);

// متابعة حصص مجموعة شعب (للطالب أو للمعلم)
export function subscribeToLiveSessions(classIds, callback) {
  const ids = Array.from(new Set((classIds || []).filter(Boolean))).slice(0, 30);
  if (ids.length === 0) {
    callback([]);
    return () => {};
  }
  const q = query(collection(db, LIVE_SESSIONS_COLLECTION), where('classId', 'in', ids));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => { console.warn('liveSessions listener error:', err); callback([]); }
  );
}

// متابعة حصة شعبة واحدة (داخل الغرفة لمعرفة انتهاء الحصة)
export function subscribeToLiveSession(classId, callback) {
  return onSnapshot(
    doc(db, LIVE_SESSIONS_COLLECTION, classId),
    (snap) => callback(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => console.warn('liveSession listener error:', err)
  );
}