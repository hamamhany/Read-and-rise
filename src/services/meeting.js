import { supabase } from '../supabaseClient';

export const saveMeeting = async (meetingData) => {
  try {
    const { data, error } = await supabase
      .from('meetings')
      .insert([{
        class_id: meetingData.class_id,
        teacher_id: meetingData.teacher_id,
        meeting_number: meetingData.meeting_number,
        topic: meetingData.topic,
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

export const getMeetings = async (classId, teacherId) => {
  try {
    let query = supabase.from('meetings').select('*');

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
    return data || [];
  } catch (err) {
    console.error('فشل جلب الاجتماعات:', err);
    return [];
  }
};

export const deleteMeeting = async (meetingId) => {
  try {
    const { error } = await supabase
      .from('meetings')
      .delete()
      .eq('id', meetingId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('فشل حذف الاجتماع:', err);
    return false;
  }
};

export const createJitsiMeeting = async (topic, startTime, classId, teacherId) => {
  try {
    const meetingNumber = Math.floor(100000 + Math.random() * 900000).toString();
    
    const meetingData = {
      class_id: classId,
      teacher_id: teacherId,
      meeting_number: meetingNumber,
      topic: topic || 'حصة بث مباشر',
      start_time: startTime || new Date().toISOString()
    };
    
    const saved = await saveMeeting(meetingData);
    const savedId = saved && saved.length > 0 ? saved[0].id : null;
    
    return {
      id: savedId,
      meeting_number: meetingNumber,
      topic: topic,
      start_time: startTime,
      room_name: `ReadAndRise_${meetingNumber}`
    };
  } catch (err) {
    console.error('❌ فشل إنشاء الاجتماع:', err);
    throw err;
  }
};

export const getZoomMeetings = getMeetings;
export const deleteZoomMeeting = deleteMeeting;
export const createRealZoomMeeting = async (topic, startTime, classId, teacherId) => {
  return await createJitsiMeeting(topic, startTime, classId, teacherId);
};