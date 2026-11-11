import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';

// ✅ تحميل ملف Excel
export const downloadExcel = async ({ headers, rows, sheetName, filename }) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName || 'البيانات', {
      views: [{ rightToLeft: true }]
    });

    worksheet.columns = headers.map(h => ({
      header: h.header,
      key: h.key,
      width: h.width || 20
    }));

    rows.forEach(row => worksheet.addRow(row));

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    headerRow.height = 28;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { horizontal: 'right', vertical: 'middle', readingOrder: 'rtl' };
      row.height = 22;
      if (rowNumber % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      }
    });

    worksheet.eachRow(row => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('✅ تم تحميل ملف Excel');
    return true;
  } catch (err) {
    console.error('Excel export error:', err);
    toast.error('فشل تحميل Excel: ' + err.message);
    return false;
  }
};

// ✅ تحميل ملف PDF من HTML
export const downloadPDFFromHTML = async ({ html, filename, orientation = 'landscape' }) => {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:0;width:1400px;background:#ffffff;padding:40px;direction:rtl;font-family:Arial,Tahoma,sans-serif;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF(orientation, 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(filename || `export_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success('✅ تم تحميل ملف PDF');
    return true;
  } catch (err) {
    console.error('PDF export error:', err);
    toast.error('فشل تحميل PDF: ' + err.message);
    return false;
  } finally {
    document.body.removeChild(container);
  }
};