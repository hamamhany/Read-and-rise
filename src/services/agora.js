import AgoraRTC from "agora-rtc-sdk-ng";
import { supabase } from '../supabaseClient';

// الـ App ID الخاص بك جاهز هنا
const APP_ID = "070f70eead5d4ee28e4d1100bdefee78";

let client = null;
let localAudioTrack = null;
let localVideoTrack = null;

// دالة الانضمام للغرفة وتشغيل الكاميرا والمايك
export async function joinAgoraRoom(channelName, localContainerId, remoteContainerId) {
  if (!client) {
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  }

  // الانضمام للقناة (وضع اختبار بدون Token)
  await client.join(APP_ID, channelName, null, null);

  // إنشاء مسارات الصوت والفيديو الخاصة بك
  [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();

  // تشغيل الفيديو الخاص بك في المكان المخصص له في الصفحة
  localVideoTrack.play(localContainerId);

  // نشر الصوت والفيديو ليراهما الآخرون
  await client.publish([localAudioTrack, localVideoTrack]);

  // الاستماع لأي شخص آخر يدخل الغرفة
  client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);

    if (mediaType === "video") {
      // إنشاء مكان لعرض فيديو الشخص القادم إذا لم يكن موجوداً
      let remotePlayerContainer = document.getElementById(user.uid.toString());
      if (!remotePlayerContainer) {
        remotePlayerContainer = document.createElement("div");
        remotePlayerContainer.id = user.uid.toString();
        remotePlayerContainer.style.width = "100%";
        remotePlayerContainer.style.height = "100%";
        document.getElementById(remoteContainerId).appendChild(remotePlayerContainer);
      }
      user.videoTrack.play(remotePlayerContainer.id);
    }

    if (mediaType === "audio") {
      user.audioTrack.play();
    }
  });

  console.log("تم الانضمام بنجاح للبث عبر أجورا!");
}

// دالة مغادرة الغرفة وإنهاء الاتصال
export async function leaveAgoraRoom() {
  if (localAudioTrack) {
    localAudioTrack.close();
    localAudioTrack = null;
  }
  if (localVideoTrack) {
    localVideoTrack.close();
    localVideoTrack = null;
  }
  if (client) {
    await client.leave();
    client = null;
  }
  console.log("تمت مغادرة الغرفة بنجاح.");
}

async function saveZoomMeeting(meetingData) {
  const { data, error } = await supabase
    .from('zoom_meetings')
    .insert([meetingData])
    .select();

  if (error) throw error;
  return data;
}

export async function getZoomMeetings(classId, teacherId) {
  let query = supabase.from('zoom_meetings').select('*');

  if (classId) query = query.eq('class_id', classId);
  if (teacherId) query = query.eq('teacher_id', teacherId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteZoomMeeting(meetingId) {
  const { error } = await supabase
    .from('zoom_meetings')
    .delete()
    .eq('id', meetingId);

  return !error;
}

export async function createRealZoomMeeting(topic, startTime, duration = 60, classId, teacherId) {
  const endpoint = import.meta.env.VITE_ZOOM_AUTH_ENDPOINT || 'https://zoom-backend-xcew.onrender.com';
  const response = await fetch(`${endpoint}/api/create-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, startTime, duration, classId, teacherId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Meeting creation failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  const meetingNumber = data.id || data.meeting_number;
  const joinUrl = data.join_url || data.start_url;

  if (!meetingNumber || !joinUrl) {
    throw new Error('The meeting service returned incomplete data');
  }

  const saved = await saveZoomMeeting({
    class_id: classId,
    teacher_id: teacherId,
    meeting_number: meetingNumber,
    password: data.password || '',
    join_url: joinUrl,
    signature: data.signature || '',
    start_time: data.start_time || startTime
  });

  return {
    id: saved?.[0]?.id || null,
    meeting_number: meetingNumber,
    join_url: joinUrl,
    password: data.password || '',
    signature: data.signature || '',
    topic: data.topic || topic,
    start_time: data.start_time || startTime
  };
}