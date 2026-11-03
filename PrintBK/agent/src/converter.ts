import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { PDFDocument } from 'pdf-lib';

const execAsync = util.promisify(exec);

export function findLibreOfficeBinary(explicitPath?: string): string | null {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

export async function convertToPdf(
  inputPath: string,
  outDir: string,
  explicitSofficePath?: string
): Promise<string> {
  const ext = path.extname(inputPath).toLowerCase();
  const baseName = path.basename(inputPath, ext);
  const expectedPdfPath = path.join(outDir, `${baseName}.pdf`);

  if (ext === '.pdf') {
    return inputPath;
  }

  // 1. Check if the file is already an authentic PDF (regardless of current extension or if saved as .bin)
  try {
    const fd = fs.openSync(inputPath, 'r');
    const header = Buffer.alloc(5);
    fs.readSync(fd, header, 0, 5, 0);
    fs.closeSync(fd);
    if (header.toString('utf8').startsWith('%PDF')) {
      if (inputPath !== expectedPdfPath) {
        fs.copyFileSync(inputPath, expectedPdfPath);
      }
      return expectedPdfPath;
    }
  } catch (_) {}

  // 2. Native image-to-PDF embedding using pdf-lib (zero external dependencies required)
  if (['.jpg', '.jpeg', '.png', '.bmp'].includes(ext)) {
    try {
      const imgBytes = fs.readFileSync(inputPath);
      const doc = await PDFDocument.create();
      let image;
      if (ext === '.png') {
        image = await doc.embedPng(imgBytes);
      } else {
        image = await doc.embedJpg(imgBytes);
      }
      const { width, height } = image.scale(1);
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const page = doc.addPage([pageWidth, pageHeight]);
      const scale = Math.min((pageWidth - 40) / width, (pageHeight - 40) / height, 1);
      const imgWidth = width * scale;
      const imgHeight = height * scale;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      page.drawImage(image, { x, y, width: imgWidth, height: imgHeight });
      const pdfBytes = await doc.save();
      fs.writeFileSync(expectedPdfPath, pdfBytes);
      return expectedPdfPath;
    } catch (imgErr: any) {
      console.warn(`[Converter] Native image-to-PDF conversion failed: ${imgErr.message}`);
    }
  }

  const soffice = findLibreOfficeBinary(explicitSofficePath);

  if (soffice) {
    try {
      const cmd = `"${soffice}" --headless --convert-to pdf "${inputPath}" --outdir "${outDir}"`;
      await execAsync(cmd, { timeout: 30000 });
      if (fs.existsSync(expectedPdfPath)) {
        return expectedPdfPath;
      }
    } catch (err: any) {
      console.warn(`[Converter] LibreOffice conversion failed: ${err.message}`);
    }
  }

  // Windows PowerShell MS Word COM Automation Fallback
  if (process.platform === 'win32' && (ext === '.docx' || ext === '.doc')) {
    try {
      const psScript = `
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $doc = $word.Documents.Open("${inputPath.replace(/\\/g, '\\\\')}")
        $doc.SaveAs([ref]"${expectedPdfPath.replace(/\\/g, '\\\\')}", [ref]17)
        $doc.Close()
        $word.Quit()
      `;
      await execAsync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 30000 });
      if (fs.existsSync(expectedPdfPath)) {
        return expectedPdfPath;
      }
    } catch (err: any) {
      console.warn(`[Converter] Word COM automation fallback failed: ${err.message}`);
    }
  }

  throw new Error(`Cannot convert ${ext} to PDF: LibreOffice or MS Office not installed on shop PC.`);
}
