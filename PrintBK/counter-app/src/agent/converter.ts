import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

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
