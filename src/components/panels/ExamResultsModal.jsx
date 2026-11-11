import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FaTimes, FaSpinner, FaEye, FaClipboardList, FaEdit, FaDownload, FaPrint, FaFileExcel, FaFilePdf, FaTrashAlt
} from 'react-icons/fa';
import { getExamResults, deleteExam } from '../../services/exams';
import ExamAnswersDetailModal from './ExamAnswersDetailModal';
import ExamManualCorrectionModal from './ExamManualCorrectionModal';
import { EXAM_RESULT_STATUS } from '../../constants';
import { downloadExcel, downloadPDFFromHTML } from '../../utils/exporters';
import { useConfirm } from '../common/ConfirmContext';

const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} ث`;
  return `${m}د${s > 0 ? ` ${s}ث` : ''}`;
};

const ExamResultsModal = ({ isOpen, onClose, exam, onEdit, onDelete }) => {
  const confirm = useConfirm();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exploringResult, setExploringResult] = useState(null);
  const [showManualCorrection, setShowManualCorrection] = useState(false);
  
  const [showDownloadChoice, setShowDownloadChoice] = useState(false);
  const [downloadResults, setDownloadResults] = useState([]);

  useEffect(() => {
    if (isOpen && exam) loadResults();
    // eslint-disable-next-line
  }, [isOpen, exam, showManualCorrection]);

  const loadResults = async () => {
    setLoading(true);
    try {
      const data = await getExamResults(exam.id);
      const byStudent = {};
      data.forEach(r => {
        if (!byStudent[r.studentId] || (r.score || 0) > (byStudent[r.studentId].score || 0)) {
          byStudent[r.studentId] = r;
        }
      });
      const grouped = Object.values(byStudent).map(r => {
        const attempts = data.filter(x => x.studentId === r.studentId).length;
        return { ...r, totalAttempts: attempts };
      });
      grouped.sort((a, b) => (b.score || 0) - (a.score || 0));
      setResults(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExam = () => {
    if (results.length === 0) return toast.error('لا توجد نتائج لتحميلها');
    setDownloadResults(results);
    setShowDownloadChoice(true);
  };

  const handlePrintExam = () => {
    if (results.length === 0) return toast.error('لا توجد نتائج للطباعة');
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str || '';
      return div.innerHTML;
    };
    const rows = results.map((r, i) => {
      const total = r.totalPoints || r.totalQuestions || 1;
      const pct = total > 0 ? Math.round(((r.score || 0) / total) * 100) : 0;
      return `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${escapeHtml(r.studentName || '')}</td>
          <td style="text-align:center;font-family:monospace;">${escapeHtml(r.studentSerial || '—')}</td>
          <td style="text-align:center;">${r.timeTakenSeconds ? Math.floor(r.timeTakenSeconds / 60) + 'د ' + (r.timeTakenSeconds % 60) + 'ث' : '—'}</td>
          <td style="text-align:center;font-weight:bold;">${r.score || 0}/${total} (${pct}%)</td>
          <td style="text-align:center;">${r.correctionStatus === 'pending_correction' ? '⏳ قيد التصحيح' : r.correctionStatus === 'manually_corrected' ? '✅ مصحح يدوياً' : '✓ تلقائي'}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
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
        <h1>نتائج الاختبار: ${escapeHtml(exam.title)}</h1>
        <p class="date">التاريخ: ${new Date().toLocaleDateString('ar-EG')} — عدد المتقدمين: ${results.length} — التصحيح: ${exam.correctionMode === 'manual' ? 'يدوي' : 'تلقائي'}</p>
        <table>
          <thead>
            <tr>
              <th style="width:50px;">#</th>
              <th>اسم الطالب</th>
              <th style="width:100px;">الرقم التسلسلي</th>
              <th style="width:120px;">الوقت المستغرق</th>
              <th style="width:140px;">العلامة</th>
              <th style="width:120px;">الحالة</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* ignore */ }
      setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 1500);
    }, 300);
  };

  const handleDeleteExam = async () => {
    const ok = await confirm(
      'إغلاق الاختبار نهائياً',
      `سيتم حذف الاختبار "${exam.title}" وكل نتائجه نهائياً من السيرفر. لا يمكن التراجع. هل أنت متأكد؟`
    );
    if (!ok) return;
    try {
      await deleteExam(exam.id);
      toast.success('✅ تم حذف الاختبار وكل نتائجه');
      if (onDelete) onDelete();
      else onClose();
    } catch (e) {
      toast.error('فشل: ' + e.message);
    }
  };

  if (!isOpen) return null;

  const isManual = exam.correctionMode === 'manual';

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-gray-950 overflow-y-auto" dir="rtl">
        <div className="min-h-screen flex flex-col max-w-5xl mx-auto">
          <div className="sticky top-0 z-10 bg-gray-900 border-b-2 border-blue-500/40 p-4 shadow-xl">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="text-xl font-bold text-white">نتائج: {exam.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {exam.duration ? `المدة: ${exam.duration} دقيقة` : 'بدون مؤقت'} |
                  عدد الأسئلة: {exam.questions?.length || 0} |
                  مجموع العلامات: {exam.questions?.reduce((s, q) => s + (Number(q.points) || 1), 0)} |
                  طريقة التصحيح: {isManual ? 'يدوي (شخصي)' : 'تلقائي'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onEdit(exam)}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                >
                  <FaEdit /> تعديل
                </button>
                <button
                  onClick={handleDownloadExam}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                >
                  <FaDownload /> تحميل النتائج
                </button>
                <button
                  onClick={handlePrintExam}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                >
                  <FaPrint /> طباعة
                </button>
                {isManual && (
                  <button
                    onClick={() => setShowManualCorrection(true)}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1"
                  >
                    <FaClipboardList /> تصحيح
                  </button>
                )}
                <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl px-2">
                  <FaTimes />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 p-4">
            {loading ? (
              <div className="text-center py-8">
                <FaSpinner className="animate-spin text-3xl text-gray-400 mx-auto" />
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400">لم يتقدم أي طالب لهذا الاختبار بعد.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border-2 border-gray-700 mb-6">
                <table className="w-full text-right border-collapse text-sm">
                  <thead className="bg-gray-800 text-gray-300 sticky top-0">
                    <tr>
                      <th className="p-2 border border-gray-700">#</th>
                      <th className="p-2 border border-gray-700">اسم الطالب</th>
                      <th className="p-2 border border-gray-700">الرقم التسلسلي</th>
                      <th className="p-2 border border-gray-700">الوقت المستغرق</th>
                      <th className="p-2 border border-gray-700">العلامة</th>
                      <th className="p-2 border border-gray-700">الحالة</th>
                      <th className="p-2 border border-gray-700">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => {
                      const total = r.totalPoints || r.totalQuestions || 1;
                      const percent = total > 0 ? Math.round(((r.score || 0) / total) * 100) : 0;
                      const status = r.correctionStatus || EXAM_RESULT_STATUS.AUTO_CORRECTED;

                      let statusBadge = null;
                      if (status === EXAM_RESULT_STATUS.PENDING_CORRECTION) {
                        statusBadge = (
                          <span className="text-xs bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded">
                            ⏳ قيد التصحيح
                          </span>
                        );
                      } else if (status === EXAM_RESULT_STATUS.MANUALLY_CORRECTED) {
                        statusBadge = (
                          <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                            ✅ مصحح يدوياً
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                            ✓ تلقائي
                          </span>
                        );
                      }

                      return (
                        <tr key={r.id} className="hover:bg-gray-800/50">
                          <td className="p-2 border border-gray-700 text-gray-300">{i + 1}</td>
                          <td className="p-2 border border-gray-700 text-white">
                            {r.studentName}
                            {r.totalAttempts > 1 && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded mr-2">
                                {r.totalAttempts} محاولات
                              </span>
                            )}
                          </td>
                          <td className="p-2 border border-gray-700 text-cyan-300 font-mono text-xs" dir="ltr">
                            {r.studentSerial || '—'}
                          </td>
                          <td className="p-2 border border-gray-700 text-gray-300">
                            {formatDuration(r.timeTakenSeconds)}
                          </td>
                          <td className="p-2 border border-gray-700">
                            <span className={`font-bold ${percent >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                              {r.score || 0}/{total}
                            </span>
                            <span className="text-xs text-gray-400"> ({percent}%)</span>
                          </td>
                          <td className="p-2 border border-gray-700">{statusBadge}</td>
                          <td className="p-2 border border-gray-700">
                            <button
                              onClick={() => setExploringResult(r)}
                              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded inline-flex items-center gap-1"
                            >
                              <FaEye /> استكشف
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-gray-900 border-t-2 border-gray-700 p-4 flex flex-wrap justify-between gap-3">
            <button
              onClick={handleDeleteExam}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"
            >
              <FaTrashAlt /> حذف الاختبار نهائياً
            </button>
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-8 py-2.5 rounded-xl font-bold"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {exploringResult && (
        <ExamAnswersDetailModal
          isOpen={!!exploringResult}
          onClose={() => setExploringResult(null)}
          result={exploringResult}
          exam={exam}
          viewerMode="teacher"
        />
      )}

      {showManualCorrection && (
        <ExamManualCorrectionModal
          isOpen={showManualCorrection}
          onClose={() => { setShowManualCorrection(false); loadResults(); }}
          exam={exam}
        />
      )}

      {showDownloadChoice && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[120] p-4">
          <div className="bg-gray-900 p-6 rounded-2xl max-w-md w-full border border-emerald-500/40">
            <h3 className="text-xl font-bold text-emerald-300 mb-3 text-center">
              تحميل نتائج "{exam.title}"
            </h3>
            <p className="text-sm text-gray-300 text-center mb-4">
              كيف تريد تحميل النتائج؟
            </p>
            <div className="space-y-2">
              <button
                onClick={async () => {
                  try {
                    const headers = [
                      { header: 'اسم الطالب', key: 'name', width: 25 },
                      { header: 'الرقم التسلسلي', key: 'serial', width: 15 },
                      { header: 'الوقت المستغرق', key: 'time', width: 15 },
                      { header: 'العلامة', key: 'score', width: 12 },
                      { header: 'المجموع', key: 'total', width: 10 },
                      { header: 'النسبة', key: 'percent', width: 10 },
                      { header: 'الحالة', key: 'status', width: 18 }
                    ];
                    const rows = downloadResults.map(r => {
                      const total = r.totalPoints || r.totalQuestions || 1;
                      const pct = total > 0 ? Math.round(((r.score || 0) / total) * 100) : 0;
                      return {
                        name: r.studentName || '',
                        serial: r.studentSerial || '—',
                        time: r.timeTakenSeconds ? `${Math.floor(r.timeTakenSeconds / 60)}د ${r.timeTakenSeconds % 60}ث` : '—',
                        score: r.score || 0,
                        total: total,
                        percent: pct + '%',
                        status: r.correctionStatus === 'pending_correction' ? 'قيد التصحيح'
                          : r.correctionStatus === 'manually_corrected' ? 'مصحح يدوياً' : 'تلقائي'
                      };
                    });
                    await downloadExcel({
                      headers, rows,
                      sheetName: 'النتائج',
                      filename: `results_${exam.title}_${Date.now()}.xlsx`
                    });
                    setShowDownloadChoice(false);
                  } catch (e) { toast.error('فشل: ' + e.message); }
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <FaFileExcel /> ملف Excel (قابل للتعديل)
              </button>
              <button
                onClick={async () => {
                  try {
                    const escapeHtml = (str) => {
                      const d = document.createElement('div');
                      d.textContent = str || '';
                      return d.innerHTML;
                    };
                    const rows = downloadResults.map((r, i) => {
                      const total = r.totalPoints || r.totalQuestions || 1;
                      const pct = total > 0 ? Math.round(((r.score || 0) / total) * 100) : 0;
                      return `<tr>
                        <td style="text-align:center;">${i + 1}</td>
                        <td>${escapeHtml(r.studentName)}</td>
                        <td style="text-align:center;font-family:monospace;">${escapeHtml(r.studentSerial || '—')}</td>
                        <td style="text-align:center;">${r.timeTakenSeconds ? Math.floor(r.timeTakenSeconds / 60) + 'د ' + (r.timeTakenSeconds % 60) + 'ث' : '—'}</td>
                        <td style="text-align:center;font-weight:bold;">${r.score || 0}/${total} (${pct}%)</td>
                        <td style="text-align:center;">${r.correctionStatus === 'pending_correction' ? '⏳ قيد التصحيح' : r.correctionStatus === 'manually_corrected' ? '✅ مصحح يدوياً' : '✓ تلقائي'}</td>
                      </tr>`;
                    }).join('');
                    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>
                      @page { size: A4 landscape; margin: 10mm; }
                      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 10px; color: #000; background: #fff; }
                      h1 { text-align: center; font-size: 20px; margin: 0 0 5px 0; }
                      .date { text-align: center; font-size: 12px; color: #555; margin-bottom: 15px; }
                      table { width: 100%; border-collapse: collapse; font-size: 12px; }
                      th, td { border: 1px solid #333; padding: 8px 6px; text-align: right; }
                      th { background: #e5e5e5; font-weight: bold; font-size: 13px; }
                      tr:nth-child(even) td { background: #f9f9f9; }
                    </style></head><body>
                      <h1>نتائج الاختبار: ${escapeHtml(exam.title)}</h1>
                      <p class="date">التاريخ: ${new Date().toLocaleDateString('ar-EG')} — عدد المتقدمين: ${downloadResults.length}</p>
                      <table><thead><tr>
                        <th style="width:50px;">#</th><th>اسم الطالب</th><th style="width:100px;">الرقم التسلسلي</th>
                        <th style="width:120px;">الوقت المستغرق</th><th style="width:140px;">العلامة</th><th style="width:120px;">الحالة</th>
                      </tr></thead><tbody>${rows}</tbody></table>
                    </body></html>`;
                    await downloadPDFFromHTML({
                      html,
                      filename: `results_${exam.title}_${Date.now()}.pdf`,
                      orientation: 'landscape'
                    });
                    setShowDownloadChoice(false);
                  } catch (e) { toast.error('فشل: ' + e.message); }
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
              >
                <FaFilePdf /> ملف PDF (أسرع، غير قابل للتعديل)
              </button>
              <button
                onClick={() => setShowDownloadChoice(false)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-xl text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExamResultsModal;