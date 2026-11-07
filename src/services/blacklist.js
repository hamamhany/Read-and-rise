import { db } from '../firebase';
import { collection, query, where, getDocs, doc, deleteDoc, orderBy, onSnapshot } from 'firebase/firestore';

export const checkPhoneBlacklist = async (phone) => {
  if (!phone) return { blacklisted: false };
  try {
    const normalized = String(phone).replace(/[^\d]/g, '');
    const q = query(collection(db, 'blacklist'), where('phone', '==', normalized));
    const snap = await getDocs(q);
    if (snap.empty) return { blacklisted: false };
    return { blacklisted: true, record: { id: snap.docs[0].id, ...snap.docs[0].data() } };
  } catch (err) {
    console.warn('blacklist check failed:', err);
    return { blacklisted: false };
  }
};

export const removeFromBlacklist = async (id) => {
  await deleteDoc(doc(db, 'blacklist', id));
};

export const subscribeBlacklist = (callback) => {
  const q = query(collection(db, 'blacklist'), orderBy('addedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};