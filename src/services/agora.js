import AgoraRTC from "agora-rtc-sdk-ng";

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