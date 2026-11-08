import { db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc,
  serverTimestamp, query, where, getDocs, orderBy, onSnapshot, limit
} from 'firebase/firestore';
import { SUPPORT_MESSAGES_COLLECTION } from '../constants';

export const createSupportMessage = async (data) => {
  const ref = await addDoc(collection(db, SUPPORT_MESSAGES_COLLECTION), {
    ...data,
    status: 'new',
    createdAt: serverTimestamp()
  });
  return ref.id;
};

export const subscribeSupportMessages = (callback) => {
  const q = query(collection(db, SUPPORT_MESSAGES_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
};

export const markSupportAsRead = async (id) => {
  await updateDoc(doc(db, SUPPORT_MESSAGES_COLLECTION, id), { status: 'read' });
};

export const deleteSupportMessage = async (id) => {
  await deleteDoc(doc(db, SUPPORT_MESSAGES_COLLECTION, id));
};