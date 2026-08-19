import toast from 'react-hot-toast';
import { TEACHER_PHONE } from '../constants';
import { cleanPhoneNumber } from './helpers';

export const sendWhatsAppToTeacher = (message) => {
  const cleanedTeacherPhone = cleanPhoneNumber(TEACHER_PHONE);
  if (!cleanedTeacherPhone) {
    toast.error('رقم المعلم غير صالح.');
    return;
  }
  const encodedMessage = encodeURIComponent(message);
  window.open(`https://wa.me/${cleanedTeacherPhone}?text=${encodedMessage}`, '_blank');
};

export const sendWarningMessage = (student, warningNumber, description) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }

  const studentName = student.name || 'الطالب';
  const currentDate = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman' });
  const descriptionText = description || 'مخالفة غير محددة';

  let subject, body;
  if (warningNumber === 1) {
    subject = `إشعار إنذار أكاديمي أول – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `نحيطكم علماً بأن الطالب قد ارتكب مخالفة للوائح الأكاديمية بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `يُعد هذا إشعاراً رسمياً أول، ونود التأكيد أننا نطبق سياسة صارمة للحفاظ على بيئة تعليمية مناسبة. تبقى للطالب 2 إنذاران قبل اتخاذ إجراء الحذف النهائي للحساب.\n` +
           `يرجى العلم أنه في حال تلقي إنذار آخر خلال فترة 90 يوماً من تاريخ اليوم، سيتم إيقاف الحساب مؤقتاً كإجراء تأديبي.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 2) {
    subject = `إشعار إنذار أكاديمي ثانٍ – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `بالإشارة إلى المخالفات السابقة، نبلغكم بأن الطالب ${studentName} قد ارتكب مخالفة إضافية بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `نحيطكم علماً بأن هذا هو الإنذار الثاني، ويتبقى للطالب إنذار واحد فقط قبل أن يتم حذف حسابه نهائياً من الأكاديمية.\n` +
           `نؤكد لكم أن أي مخالفة إضافية خلال فترة الـ 90 يوماً القادمة ستؤدي إلى إيقاف الحساب مؤقتاً فوراً وتصعيد الموقف نحو الإجراء النهائي (الحذف).\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 3) {
    subject = `إنذار أكاديمي نهائي – الطالب ${studentName}`;
    body = `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
           `نكتب إليكم ببالغ الجدية بخصوص التجاوزات المستمرة من قِبل الطالب ${studentName} للوائح الأكاديمية، حيث سجلنا مخالفة جديدة بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `هذا هو الإنذار الأخير الموجه لكم. نود إبلاغكم وبشكل قاطع أن ارتكاب أي مخالفة إضافية خلال فترة الـ 90 يوماً القادمة سيؤدي إلى إغلاق وحذف الحساب نهائياً من أنظمتنا دون إشعار آخر.\n` +
           `نرجو منكم أخذ هذا الإنذار على محمل الجد التام، حيث إننا لا نستطيع التهاون أكثر في تطبيق قوانين الأكاديمية.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else {
    return;
  }

  const fullMessage = encodeURIComponent(
    `الموضوع: ${subject}\n\n` +
    body +
    `\n\nللتواصل والدعم: +962 7 8611 7388`
  );

  window.open(`https://wa.me/${cleanedPhone}?text=${fullMessage}`, '_blank');
};

export const sendSupervisorWarningMessage = (supervisor, warningNumber, description) => {
  const phone = supervisor.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا المشرف.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }

  const supervisorName = supervisor.name || 'المشرف';
  const currentDate = new Date().toLocaleDateString('ar-EG', { timeZone: 'Asia/Amman' });
  const descriptionText = description || 'مخالفة غير محددة';

  let subject, body;
  if (warningNumber === 1) {
    subject = `إشعار إنذار أول – المشرف ${supervisorName}`;
    body = `الأستاذ الفاضل ${supervisorName} المحترم،\n` +
           `نحيطكم علماً بأنه قد تم تسجيل مخالفة إدارية بحقكم بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `يُعد هذا إنذاراً رسمياً أول، ونود التذكير بأنه في حال تكرار المخالفات سيتم اتخاذ إجراءات تأديبية تصل إلى تجميد الحساب.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 2) {
    subject = `إشعار إنذار ثانٍ – المشرف ${supervisorName}`;
    body = `الأستاذ الفاضل ${supervisorName} المحترم،\n` +
           `بالإشارة إلى الإنذار السابق، نبلغكم بأنه قد تم تسجيل مخالفة إضافية بتاريخ ${currentDate} تتمثل في: ${descriptionText}.\n` +
           `هذا هو الإنذار الثاني، ويتبقى لكم إنذار واحد قبل اتخاذ إجراء التجميد النهائي للحساب.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else if (warningNumber === 3) {
    subject = `إنذار نهائي – المشرف ${supervisorName}`;
    body = `الأستاذ الفاضل ${supervisorName} المحترم،\n` +
           `نكتب إليكم ببالغ الأسف بعد وصول عدد الإنذارات إلى 3، وبناءً على ذلك سيتم تجميد حسابكم بشكل فوري. هذا الإجراء نهائي ولا يمكن التراجع عنه إلا بعد مراجعة الإدارة.\n` +
           `مع تحيات إدارة الأكاديمية`;
  } else {
    return;
  }

  const fullMessage = encodeURIComponent(
    `الموضوع: ${subject}\n\n` +
    body +
    `\n\nللتواصل والدعم: +962 7 8611 7388`
  );

  window.open(`https://wa.me/${cleanedPhone}?text=${fullMessage}`, '_blank');
};

export const sendActivationMessage = (student, tempUsername, tempPassword) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || '';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const studentAge = student.age || 'غير محدد';
  const studentGender = student.gender || 'غير محدد';
  const message = encodeURIComponent(
    `الموضوع: تأكيد تفعيل حسابك في الفرسان التقنيين - اقرأ وارتق\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `يسعدنا انضمامك إلينا في بيئة التعلم الرقمية الخاصة بـ "الفرسان التقنيين". نود إبلاغك بأنه تم إنشاء حسابك بنجاح، ونرفق لكم أدناه البيانات المسجلة في نظامنا:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `الصف الدراسي: ${studentClass}\n` +
    `رقم الهاتف: ${student.phone || 'غير مسجل'}\n` +
    `العمر: ${studentAge}\n` +
    `الجنس: ${studentGender}\n` +
    `اسم المستخدم المؤقت: ${tempUsername}\n` +
    `كلمة المرور المؤقتة: ${tempPassword}\n\n` +
    `خطوة أخيرة لتفعيل الحساب:\n` +
    `لإتمام عملية التسجيل، يرجى الانتقال إلى الرابط أدناه وتسجيل الدخول لأول مرة لملء البيانات اللازمة وتأكيد حسابك:\n` +
    `https://read-and-rise-two.vercel.app/\n\n` +
    `نرجو منكم الاحتفاظ بهذه البيانات، والالتزام بالقوانين التعليمية المتبعة. نتمنى لكم رحلة تعليمية مثمرة ومليئة بالإنجازات.\n\n` +
    `مع التقدير،\n` +
    `همام هاني محمد علي\n` +
    `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendSupervisorActivationMessage = (supervisor, tempUsername, tempPassword) => {
  const phone = supervisor.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا المشرف.');
    return false;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return false;
  }
  const supervisorName = supervisor.name || 'المشرف';
  const message = encodeURIComponent(
    `الموضوع: بيانات الدخول المؤقتة لحساب المشرف – ${supervisorName}\n\n` +
    `الأستاذ الفاضل ${supervisorName} المحترم،\n` +
    `تحية طيبة وبعد،،\n` +
    `أتقدم إليكم بخالص التحية والتقدير لجهودكم المستمرة ودوركم البارز في دعم عمل الأكاديمية.\n` +
    `بناءً على طلبكم الخاص بتحديث أو إنشاء حساب الإشراف الخاص بكم، تجدون أدناه بيانات الاعتماد المؤقتة الخاصة بدخول النظام الأكاديمي:\n\n` +
    `اسم المستخدم: ${tempUsername}\n` +
    `كلمة المرور المؤقتة: ${tempPassword}\n\n` +
    `نرجو منكم التكرم بتسجيل الدخول باستخدام هذه البيانات، والقيام بتغيير كلمة المرور فوراً من خلال لوحة التحكم الخاصة بكم لضمان أمان وخصوصية الحساب.\n` +
    `شاكرين لكم حسن تعاونكم، ونسأل الله لنا ولكم دوام التوفيق والسداد في مهامنا المشتركة.\n\n` +
    `مع خالص التحية والتقدير،\n` +
    `رئيس قسم قسم التكنولوجيا وتطوير المعلومات والأمن السيبراني : همام هاني محمد`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
  toast.success('✅ تم إرسال رسالة التفعيل للمشرف عبر واتساب.');
  return true;
};

export const sendFreezeMessage = (student) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || '';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const message = encodeURIComponent(
    `الموضوع: إشعار بشأن حساب الطالب في منصة "اقرأ وارتق"\n\n` +
    `عزيزي ولي أمر الطالب/ة ${studentName} المحترم،\n` +
    `تحية طيبة وبعد،،\n` +
    `نود إحاطتكم علماً بأنه قد تم إجراء "تجميد مؤقت" لحساب الطالب في منصة الفرسان التقنيين - اقرأ وارتق التعليمية. يأتي هذا الإجراء وفقاً للسياسات التنظيمية المتبعة في المنصة لضمان سير العملية التعليمية بفعالية.\n\n` +
    `بيانات الطالب:\n` +
    `اسم الطالب: ${studentName}\n` +
    `الصف الدراسي: ${studentClass}\n` +
    `سبب الإجراء: عدم الالتزام بالحصص والانقطاع لفترة طويلة\n\n` +
    `نرجو منكم التواصل معنا لمناقشة الإجراءات اللازمة لفك التجميد وإعادة تفعيل الحساب لضمان استمرارية الطالب في مسيرته التعليمية دون انقطاع.\n` +
    `نحن نقدر حرصكم الدائم على متابعة مستوى الطالب ونتطلع لتعاونكم معنا.\n\n` +
    `مع التقدير،\n` +
    `همام هاني محمد علي\n` +
    `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendDeleteMessage = (student) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || '';
  const message = encodeURIComponent(
    `الموضوع: إشعار بخصوص إلغاء حساب الطالب ${studentName} في نظامنا الأكاديمي\n\n` +
    `عزيزي ولي أمر الطالب ${studentName} المحترم،\n` +
    `تحية طيبة وبعد،،\n` +
    `نود إعلامكم بأنه قد تم إغلاق وحذف حساب الطالب ${studentName} من نظامنا الأكاديمي، وذلك بناءً على [ تعدد الإنذارات / ارتكاب خطأ أدى لحذف حسابه بناءً على تعليمات الأكاديمية ].\n` +
    `يُرجى العلم أن هذا الإجراء يتضمن ما يلي:\n` +
    `- إيقاف صلاحية الدخول والوصول الكامل للحساب عبر المنصة الأكاديمية.\n` +
    `- حذف كافة البيانات، السجلات، والتقارير المرتبطة بالحساب نهائياً من قاعدة بياناتنا.\n\n` +
    `نود أن نشكركم على ثقتكم بنا خلال فترة انضمام الطالب للأكاديمية، ونتمنى له دوام التوفيق والنجاح في مسيرته التعليمية القادمة.\n\n` +
    `مع خالص التحية والتقدير،\n` +
    `إدارة الأكاديمية`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendResetPasswordMessage = (student, tempPassword) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || '';
  const message = encodeURIComponent(
    `الموضوع: تم إعادة تعيين بيانات دخولك - بانتظار تحديث حسابك في "اقرأ وارتق"\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `نود إعلامك بأنه قد تمت إعادة تعيين البيانات الدخول الخاصة بحسابك في منصة الفرسان التقنيين - اقرأ وارتق لتصحيح بياناتك.\n\n` +
    `بيانات الدخول الجديدة:\n` +
    `اسم المستخدم: ${student.username}\n` +
    `كلمة المرور المؤقتة: ${tempPassword}\n\n` +
    `ما الخطوة التالية؟\n` +
    `بما أن الحساب الآن يحتاج لبيانات جديدة، يرجى التوجه إلى رابط تسجيل الدخول لأول مرة وتعبئة اسم المستخدم وكلمة المرور الخاصة بك من جديد:\n` +
    `https://read-and-rise-two.vercel.app/\n\n` +
    `ملاحظة هامة:\n` +
    `بمجرد دخولك وتعبئة البيانات المطلوبة، سيتم ربط حسابك ببياناتك الدراسية الموجودة مسبقاً في النظام.\n\n` +
    `للاستفسار والدعم الفني:\n` +
    `لأي استفسار حول طريقة إكمال المعلومات، أو في حال وجود معلومات ناقصة، لا تتردد بالتواصل معي مباشرة عبر الرقم التالي:\n` +
    `+962 7 8611 7388\n\n` +
    `نحن هنا لضمان تجربة تعليمية آمنة ومستقرة لكم.\n\n` +
    `مع التقدير،\n` +
    `همام هاني محمد علي\n` +
    `رئيس قسم التكنولوجيا وأمن المعلومات | معلم تطوير البرمجيات`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendDataUpdateApprovalMessage = (student, newData) => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const message = encodeURIComponent(
    `الموضوع: تأكيد الموافقة على طلب تصحيح البيانات – الطالب ${studentName}\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `تحية طيبة،،\n` +
    `نود إعلامكم بأنه قد تم قبول طلبكم المقدم بخصوص تصحيح وتحديث البيانات الخاصة بكم في نظامنا الأكاديمي.\n` +
    `لقد تم إجراء التعديلات المطلوبة بنجاح، وأصبحت سجلاتكم الآن محدثة وفقاً للبيانات الجديدة التي قدمتموها. يمكنكم الآن الاطلاع على ملفكم الشخصي للتأكد من صحة التعديلات.\n` +
    `نشكر لكم حرصكم على دقة بياناتكم، ونتمنى لكم التوفيق في مسيرتكم الدراسية.\n\n` +
    `مع تحيات إدارة الأكاديمية`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendDataUpdateRejectionMessage = (student, reason = 'عدم مطابقة الوثائق الرسمية / الحاجة لتقديم إثبات رسمي آخر / عدم استيفاء الشروط المطلوبة') => {
  const phone = student.phone || '';
  if (!phone) {
    toast.error('رقم الهاتف غير مسجل لهذا الطالب.');
    return;
  }
  const cleanedPhone = cleanPhoneNumber(phone);
  if (!cleanedPhone) {
    toast.error('رقم الهاتف غير صالح.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const message = encodeURIComponent(
    `الموضوع: بخصوص طلبكم الخاص بتصحيح البيانات – الطالب ${studentName}\n\n` +
    `عزيزي الطالب ${studentName}،\n` +
    `تحية طيبة،،\n` +
    `بالإشارة إلى طلبكم المتعلق بتصحيح البيانات في نظام الأكاديمية، نود إعلامكم بأنه قد تعذر قبول الطلب في الوقت الحالي وذلك بسبب:\n` +
    `[${reason}].\n` +
    `نحن نحرص دائماً على دقة البيانات لضمان سلامة السجلات الأكاديمية. في حال كان لديكم أي اعتراض على هذا القرار، يمكنكم إرسال إثباتات أو مستندات داعمة إضافية عبر الرد على هذه الرسالة لإعادة النظر في طلبكم.\n` +
    `شاكرين لكم تفهمكم.\n\n` +
    `مع تحيات إدارة الأكاديمية`
  );
  window.open(`https://wa.me/${cleanedPhone}?text=${message}`, '_blank');
};

export const sendUrgentReminderMessage = (student) => {
  if (!student) {
    toast.error('لا توجد بيانات الطالب.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const studentPhone = student.phone || 'غير مسجل';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const message =
    `الموضوع: طلب عاجل: استكمال تصحيح وتأكيد بيانات الطالب - ${studentName}\n\n` +
    `إلى إدارة الأكاديمية الموقرة،\n` +
    `تحية طيبة وبعد،،\n` +
    `أرجو من حضراتكم التكرم بالموافقة على معالجة طلبي المتعلق بتصحيح وتأكيد بياناتي الأكاديمية في أقرب وقت ممكن.\n` +
    `اسم الطالب: ${studentName}\n` +
    `الرقم المسجل : ${studentPhone}\n` +
    `نوع الطلب: تصحيح وتحديث بيانات\n` +
    `إنني بحاجة ماسة لاستكمال هذا الإجراء لضمان دقة سجلاتي في النظام وتجنب أي تأخير في الخدمات الأكاديمية المقدمة لي.\n` +
    `شاكراً لكم حسن تعاونكم وسرعة استجابتكم.\n\n` +
    `مع خالص التحية،\n` +
    `${studentName}`;

  sendWhatsAppToTeacher(message);
};

export const sendContactTeacherMessage = (student, requestType = 'تحديث') => {
  if (!student) {
    toast.error('لا توجد بيانات الطالب.');
    return;
  }
  const studentName = student.name || 'الطالب';
  const studentClass = student.classes?.map(c => c.name).join(', ') || 'غير محدد';
  const studentPhone = student.phone || 'غير مسجل';
  const purpose = requestType === 'update' ? 'تحديث' : 'تأكيد';
  const message =
    `الموضوع: طلب تأكيد بيانات الطالب - ${studentName}\n\n` +
    `إلى إدارة الأكاديمية،\n` +
    `أتقدم إليكم بهذا الطلب لتأكيد وتحديث بياناتي في نظام الأكاديمية، وذلك لضمان استمرارية الخدمات التعليمية المقدمة لي بشكل صحيح.\n` +
    `بيانات الطالب المطلوبة:\n` +
    `الاسم الكامل: ${studentName}\n` +
    `الصف/المستوى الدراسي: ${studentClass}\n` +
    `رقم الهاتف للتواصل: ${studentPhone}\n` +
    `الغرض من الطلب: ${purpose}\n\n` +
    `أقر بأن كافة البيانات المذكورة أعلاه صحيحة ومحدثة، وأتحمل مسؤولية أي خطأ فيها.\n` +
    `شاكراً لكم جهودكم في تسريع معالجة هذا الطلب.\n\n` +
    `مع التحية،\n` +
    `${studentName}`;

  sendWhatsAppToTeacher(message);
};