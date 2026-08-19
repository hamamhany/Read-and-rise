import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
};

export const arabicToEnglishNumber = (str) => {
  const map = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
  };
  return str.replace(/[٠-٩]/g, (d) => map[d] || d);
};

export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').trim();
};

export const safeDate = (d) => {
  const date = new Date(d);
  return isNaN(date.getTime()) ? new Date() : date;
};

export const fetchClassNames = async (classIds) => {
  if (!classIds || classIds.length === 0) return {};
  const names = {};
  await Promise.all(classIds.map(async (id) => {
    try {
      const docSnap = await getDoc(doc(db, 'classes', id));
      if (docSnap.exists()) {
        names[id] = docSnap.data().name;
      } else {
        names[id] = null;
      }
    } catch (err) {
      console.error('Error fetching class name for id', id, err);
      names[id] = null;
    }
  }));
  return names;
};

export const cleanPhoneNumber = (phone) => {
  if (!phone) return '';
  return phone.replace(/^0+/, '').replace(/[^0-9]/g, '');
};