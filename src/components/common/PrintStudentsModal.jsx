import React, { useState, useEffect } from 'react';
import { FaPrint, FaTimes, FaSpinner } from 'react-icons/fa';
import { db } from '../../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { sortStudentsAlphabetically } from '../../utils/helpers';

const PrintStudentsModal = ({ isOpen, onClose, students }) => {
  const [notes, setNotes] = useState({});
  const [sortedStudents, setSortedStudents] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const sorted = sortStudentsAlphabetically(students);
      setSortedStudents(sorted);
      const initialNotes = {};
      sorted.forEach(s => { initialNotes[s.id] = s.notes || ''; });
      setNotes(initialNotes);
    }
  }, [isOpen, students]);

  const handleNoteChange = (studentId, value) => {
    setNotes(prev => ({ ...prev, [studentId]: value }));
  };

  const buildPrintHtml = () => {
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    };

    const rows = sortedStudents.map((s, i) => `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml((s.classes || []).map(c => c.name).filter(Boolean).join('، '))}</td>
        <td style="text-align:center;">${(s.warnings || []).length}</td>
        <td>${escapeHtml(notes[s.id] || '')}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <title>طباعة جدول الطلاب</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 10px; color: #000; background: #fff; }
          h1 { text-align: center; font-size: 20px; margin: 0 0 5px 0; }
          .date { text-align: center; font-size: 12px; color: #555; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #333; padding: 8px 6px; text-align: right; }
          th { background: #e5e5e5; font-weight: bold; font-size: 13px; }
          tr:nth-child(even) td { background: #f9f9f9; }
        </style>
      </head>
      <body>
        <h1>قائمة الطلاب - الفرسان التقنيين</h1>
        <p class="date">التاريخ: ${new Date().toLocaleDateString('ar-EG')} — إجمالي الطلاب: ${sortedStudents.length}</p>
        <table>
          <thead>
            <tr>
              <th style="width:40px;">م</th>
              <th>اسم الطالب</th>
              <th>الشعبة</th>
              <th style="width:70px;">الإنذارات</th>
              <th>الملاحظات</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `;
  };

  const triggerPrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(buildPrintHtml());
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Print error:', err);
      }
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1500);
    }, 300);
  };

  const handlePrint = async () => {
    setIsSaving(true);

    // حفظ الملاحظات في الخلفية
    const savePromise = (async () => {
      try {
        const promises = [];
        for (const s of sortedStudents) {
          const oldNote = (s.notes || '').trim();
          const newNote = (notes[s.id] || '').trim();
          if (oldNote !== newNote) {
            promises.push(updateDoc(doc(db, 'profiles', s.id), {
              notes: notes[s.id] || '',
              updatedAt: serverTimestamp()
            }));
          }
        }
        if (promises.length > 0) {
          await Promise.all(promises);
          toast.success('تم حفظ الملاحظات في النظام ✓');
        }
      } catch (err) {
        console.error('فشل حفظ الملاحظات:', err);
        toast.error('فشل حفظ بعض الملاحظات، لكن سيتم الطباعة');
      }
    })();

    // إطلاق الطباعة فوراً
    try {
      triggerPrint();
    } catch (err) {
      console.error('Print trigger failed:', err);
      toast.error('فشلت الطباعة: ' + err.message);
    }

    savePromise.finally(() => setIsSaving(false));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 p-6 rounded-3xl w-full max-w-5xl border border-gray-700 my-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-blue-300">
            <FaPrint className="inline-block me-2" /> جدول الطلاب
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>

        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-white">قائمة الطلاب - الفرسان التقنيين</h1>
          <p className="text-sm text-gray-400">التاريخ: {new Date().toLocaleDateString('ar-EG')} — إجمالي الطلاب: {sortedStudents.length}</p>
        </div>

        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto rounded-xl border border-gray-700">
          <table className="w-full text-right border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-gray-300">
                <th className="border border-gray-600 p-2 text-center w-12">#</th>
                <th className="border border-gray-600 p-2">اسم الطالب</th>
                <th className="border border-gray-600 p-2 text-center">الشعبة</th>
                <th className="border border-gray-600 p-2 text-center">الإنذارات</th>
                <th className="border border-gray-600 p-2">الملاحظات (قابلة للتعديل)</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-gray-800/50">
                  <td className="border border-gray-600 p-2 text-center text-gray-300">{idx + 1}</td>
                  <td className="border border-gray-600 p-2 text-white">{student.name}</td>
                  <td className="border border-gray-600 p-2 text-center text-gray-300">
                    {student.classes?.map(c => c.name).join(', ') || 'غير محدد'}
                  </td>
                  <td className="border border-gray-600 p-2 text-center text-gray-300">
                    {(student.warnings || []).length}
                  </td>
                  <td className="border border-gray-600 p-2">
                    <textarea
                      className="w-full bg-gray-800 text-white p-1 rounded border border-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-10"
                      value={notes[student.id] || ''}
                      onChange={(e) => handleNoteChange(student.id, e.target.value)}
                      placeholder="أضف ملاحظة هنا..."
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button
            onClick={handlePrint}
            disabled={isSaving}
            className="btn-primary bg-green-600 hover:bg-green-700 px-6 py-3 rounded-xl text-white flex items-center gap-2 font-bold shadow-lg disabled:opacity-60"
          >
            {isSaving ? <FaSpinner className="animate-spin" /> : <FaPrint />}
            {isSaving ? 'جاري الحفظ والطباعة...' : 'طباعة'}
          </button>
          <button
            onClick={onClose}
            className="btn-primary bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-xl text-white"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintStudentsModal;