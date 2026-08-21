import { supabase } from '../supabaseClient';

// عنوان السيرفر الخلفي (نفس سيرفر Render القديم، بس بمنطق أجورا الآن)
const AGORA_BACKEND_URL = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';

// جلب توكن دخول آمن للغرفة من السيرفر الخلفي (لازم يصير هالنداء كل مرة يفتح فيها أي مستخدم الحصة)
export const getAgoraToken = async (channelName) => {
  try {
    const response = await fetch(`${AGORA_BACKEND_URL}/api/generate-agora-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `فشل جلب توكن الدخول (HTTP ${response.status})`);
    }

    return await response.json(); // { token, appId, channelName, uid }
  } catch (err) {
    console.error('فشل جلب توكن Agora:', err);
    throw err;
  }
};

// حفظ بيانات الحصة في Supabase (نفس جدول zoom_meetings القديم بالضبط، ما في داعي نغيّره)
const saveAgoraMeeting = async (meetingData) => {
  try {
    const { data, error } = await supabase
      .from('zoom_meetings')
      .insert([{
        class_id: meetingData.class_id,
        teacher_id: meetingData.teacher_id,
        meeting_number: meetingData.channel_name, // نستخدم نفس العمود القديم لتخزين اسم الغرفة الجديد
        join_url: '',
        password: '',
        start_time: meetingData.start_time || new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('خطأ في حفظ الحصة في Supabase:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('فشل حفظ الحصة:', err);
    throw err;
  }
};

export const getAgoraMeetings = async (classId, teacherId) => {
  try {
    let query = supabase.from('zoom_meetings').select('*');

    if (classId) {
      query = query.eq('class_id', classId);
    }
    if (teacherId) {
      query = query.eq('teacher_id', teacherId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('خطأ في جلب الحصص من Supabase:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('فشل جلب الحصص:', err);
    return [];
  }
};

export const deleteAgoraMeeting = async (meetingId) => {
  try {
    const { error } = await supabase
      .from('zoom_meetings')
      .delete()
      .eq('id', meetingId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('فشل حذف الحصة:', err);
    return false;
  }
};

// إنشاء حصة جديدة: على عكس زوم، ما في داعي نتصل بأي API خارجي — بس نولّد اسم غرفة فريد ونحفظه
export const createAgoraMeeting = async (topic, startTime, classId, teacherId) => {
  try {
    const channelName = `class_${classId}_${Date.now()}`;

    const meetingData = {
      class_id: classId,
      teacher_id: teacherId,
      channel_name: channelName,
      start_time: startTime || new Date().toISOString()
    };

    const saved = await saveAgoraMeeting(meetingData);
    const savedId = saved && saved.length > 0 ? saved[0].id : null;

    return {
      id: savedId,
      channel_name: channelName,
      topic: topic,
      start_time: meetingData.start_time
    };
  } catch (err) {
    console.error('❌ فشل إنشاء الحصة:', err);
    throw err;
  }
};