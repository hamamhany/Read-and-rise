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
        signature: meetingData.signature || '',
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

export const createRealZoomMeeting = async (topic, startTime, duration = 60, classId, teacherId) => {
  try {
    const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';
    console.log('🚀 جاري إنشاء اجتماع عبر الخادم:', endpoint);
    
    const response = await fetch(`${endpoint}/api/create-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, startTime, duration, classId, teacherId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ رد الخادم غير ناجح:', response.status, errorData);
      throw new Error(errorData.message || `فشل إنشاء الاجتماع (HTTP ${response.status})`);
    }
    
    const data = await response.json();
    console.log('✅ بيانات الاجتماع من الخادم:', data);
    
    // ✅ التحقق من وجود البيانات الأساسية
    if (!data.id && !data.meeting_number) {
      console.error('❌ الخادم لم يعد رقم الاجتماع:', data);
      throw new Error('الخادم لم يعد بيانات الاجتماع الصحيحة');
    }
    
    const meetingNumber = data.id || data.meeting_number;
    const joinUrl = data.join_url || data.start_url;
    const password = data.password || '';
    
    if (!joinUrl) {
      console.error('❌ الخادم لم يعد رابط الانضمام:', data);
      throw new Error('لم يتم استلام رابط الانضمام من الخادم');
    }
    
    // ✅ حفظ الاجتماع في Supabase
    const meetingData = {
      class_id: classId,
      teacher_id: teacherId,
      meeting_number: meetingNumber,
      password: password,
      join_url: joinUrl,
      signature: data.signature || '', // قد يكون موجوداً في بعض الإصدارات
      start_time: data.start_time || startTime
    };
    
    const saved = await saveZoomMeeting(meetingData);
    const savedId = saved && saved.length > 0 ? saved[0].id : null;
    
    // ✅ إرجاع البيانات مع التأكد من وجود جميع الحقول
    return {
      id: savedId,
      meeting_number: meetingNumber,
      join_url: joinUrl,
      password: password,
      signature: data.signature || '',
      topic: data.topic || topic,
      start_time: data.start_time || startTime,
      raw: data // للتصحيح
    };
  } catch (err) {
    console.error('❌ فشل إنشاء الاجتماع الحقيقي:', err);
    throw err;
  }
};