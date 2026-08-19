import { supabase } from '../supabaseClient';

export const saveZoomMeeting = async (meetingData) => {
  try {
    const { data, error } = await supabase
      .from('zoom_meetings')
      .insert([{
        class_id: meetingData.class_id,
        teacher_id: meetingData.teacher_id,
        meeting_number: meetingData.meeting_number,
        password: meetingData.password || '',
        join_url: meetingData.join_url,
        start_time: meetingData.start_time || new Date().toISOString()
      }])
      .select();

    if (error) {
      console.error('خطأ في حفظ الاجتماع في Supabase:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('فشل حفظ الاجتماع:', err);
    throw err;
  }
};

export const getZoomMeetings = async (classId, teacherId) => {
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
      console.error('خطأ في جلب الاجتماعات من Supabase:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('فشل جلب الاجتماعات:', err);
    return [];
  }
};

export const deleteZoomMeeting = async (meetingId) => {
  try {
    const { error } = await supabase
      .from('zoom_meetings')
      .delete()
      .eq('id', meetingId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('فشل حذف الاجتماع:', err);
    return false;
  }
};

// ✅ الدالة المحسّنة لإنشاء اجتماع زوم حقيقي
export const createRealZoomMeeting = async (topic, startTime, duration = 60, classId, teacherId) => {
  try {
    const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';
    
    const response = await fetch(`${endpoint}/api/create-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, startTime, duration, classId, teacherId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `فشل إنشاء الاجتماع (HTTP ${response.status})`);
    }
    
    const data = await response.json();
    console.log('✅ بيانات الاجتماع من الخادم:', data);
    
    // التأكد من استلام رقم الاجتماع
    const meetingNumber = data.id || data.meeting_number;
    if (!meetingNumber) {
      throw new Error('لم يتم استلام رقم الاجتماع من الخادم.');
    }
    
    const joinUrl = data.join_url || data.start_url;
    const password = data.password || '';

    // حفظ الاجتماع في Supabase
    const meetingData = {
      class_id: classId,
      teacher_id: teacherId,
      meeting_number: String(meetingNumber).replace(/\s+/g, ''),
      password: password,
      join_url: joinUrl,
      start_time: data.start_time || startTime
    };
    
    const saved = await saveZoomMeeting(meetingData);
    const savedId = saved && saved.length > 0 ? saved[0].id : null;
    
    return {
      id: savedId,
      meeting_number: meetingNumber,
      join_url: joinUrl,
      password: password,
      topic: data.topic || topic,
      start_time: data.start_time || startTime
    };
  } catch (err) {
    console.error('❌ فشل إنشاء الاجتماع الحقيقي:', err);
    throw err;
  }
};