import React, { useState, useEffect } from 'react';
import { FaPrint, FaSave, FaTimes } from 'react-icons/fa';
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
      sorted.forEach(s => {
        initialNotes[s.id] = s.notes || '';
      });
      setNotes(initialNotes);
    }
  }, [isOpen, students]);

  const handleNoteChange = (studentId, value) => {
    setNotes(prev => ({ ...prev, [studentId]: value }));
  };

  const handleSaveAndPrint = async (saveToSystem) => {
    if (saveToSystem) {
      setIsSaving(true);
      try {
        const promises = sortedStudents.map(s => {
          if (s.notes !== notes[s.id]) {
            return updateDoc(doc(db, 'profiles', s.id), {
              notes: notes[s.id],
              updatedAt: serverTimestamp()
            });
          }
          return Promise.resolve();
        });
        await Promise.all(promises);
        toast.success('تم حفظ الملاحظات في النظام بنجاح');
      } catch (err) {
        toast.error('فشل حفظ الملاحظات: ' + err.message);
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }
    
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-900 p-6 rounded-3xl w-full max-w-5xl border border-gray-700 my-8">
        <div className="flex justify-between items-center mb-4 no-print">
          <h3 className="text-xl font-semibold text-blue-300">
            <FaPrint className="inline-block me-2" /> جدول الطلاب
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl"><FaTimes /></button>
        </div>
        
        <div id="print-area">
          <div className="text-center mb-4 hidden print:block">
            <h1 className="text-2xl font-bold text-black">قائمة الطلاب - الفرسان التقنيين</h1>
            <p className="text-sm text-black">التاريخ: {new Date().toLocaleDateString('ar-EG')}</p>
          </div>
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-300 print:bg-gray-200 print:text-black">
                <th className="border border-gray-600 p-2 text-center w-12 print:border-black">#</th>
                <th className="border border-gray-600 p-2 print:border-black">اسم الطالب</th>
                <th className="border border-gray-600 p-2 text-center print:border-black">الشعبة</th>
                <th className="border border-gray-600 p-2 text-center print:border-black">الغيابات</th>
                <th className="border border-gray-600 p-2 text-center print:border-black">الإنذارات</th>
                <th className="border border-gray-600 p-2 print:border-black">الملاحظات (قابلة للتعديل)</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((student, idx) => (
                <tr key={student.id} className="hover:bg-gray-800/50 print:hover:bg-transparent">
                  <td className="border border-gray-600 p-2 text-center print:border-black">{idx + 1}</td>
                  <td className="border border-gray-600 p-2 print:border-black">{student.name}</td>
                  <td className="border border-gray-600 p-2 text-center print:border-black">
                    {student.classes?.map(c => c.name).join(', ') || 'غير محدد'}
                  </td>
                  <td className="border border-gray-600 p-2 text-center print:border-black">-</td>
                  <td className="border border-gray-600 p-2 text-center print:border-black">
                    {(student.warnings || []).length}
                  </td>
                  <td className="border border-gray-600 p-2 print:border-black">
                    <textarea
                      className="w-full bg-gray-800 text-white p-1 rounded border border-gray-500 no-print-border print:bg-transparent print:text-black print:border-none focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none h-10"
                      value={notes[student.id] || ''}
                      onChange={(e) => handleNoteChange(student.id, e.target.value)}
                      placeholder="أضف ملاحظة هنا..."
                    />
                    <span className="hidden print:inline">{notes[student.id]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end no-print">
          <button
            onClick={() => handleSaveAndPrint(true)}
            disabled={isSaving}
            className="btn-primary bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md text-white flex items-center gap-2"
          >
            <FaSave /> حفظ في النظام وطباعة
          </button>
          <button
            onClick={() => handleSaveAndPrint(false)}
            className="btn-primary bg-green-600 hover:bg-green-700 px-4 py-2 rounded-md text-white flex items-center gap-2"
          >
            <FaPrint /> طباعة فقط (بدون حفظ)
          </button>
          <button
            onClick={onClose}
            className="btn-primary bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-md text-white"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrintStudentsModal;