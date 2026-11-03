import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export interface PrintSettings {
  copies?: number;
  duplex?: 'simplex' | 'duplexlong' | 'duplexshort';
  color?: 'monochrome' | 'color';
  paper?: 'A4' | 'A3' | 'Legal' | string;
  range?: string;
  tray?: string;
  scale?: 'fit' | 'shrink' | 'noscale';
}

export function buildSumatraSettings(settings: PrintSettings): string {
  const parts: string[] = [];

  if (settings.copies && settings.copies > 1) {
    parts.push(`${settings.copies}x`);
  }

  if (settings.duplex) {
    parts.push(settings.duplex);
  } else {
    parts.push('simplex');
  }

  if (settings.color) {
    parts.push(settings.color);
  }

  if (settings.paper) {
    parts.push(`paper=${settings.paper}`);
  }

  if (settings.range && settings.range !== 'all') {
    parts.push(settings.range);
  }

  if (settings.tray) {
    parts.push(`tray=${settings.tray}`);
  }

  if (settings.scale) {
    parts.push(settings.scale);
  } else {
    parts.push('fit');
  }

  return parts.join(',');
}

export function findSumatraBinary(explicitPath?: string): string | null {
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const resourcesDir = (process as any).resourcesPath;
  const execDir = path.dirname(process.execPath || '');
  let moduleDir = '';
  try {
    if (typeof __dirname !== 'undefined') moduleDir = __dirname;
  } catch (_) {}
  if (!moduleDir) {
    try {
      const getMetaUrl = new Function('try { return import.meta.url; } catch (_) { return null; }');
      const metaUrl = getMetaUrl();
      if (metaUrl) {
        moduleDir = path.dirname(new URL(metaUrl).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));
      }
    } catch (_) {}
  }
  if (!moduleDir) moduleDir = process.cwd();

  const candidates = [
    resourcesDir ? path.join(resourcesDir, 'bin', 'SumatraPDF.exe') : '',
    resourcesDir ? path.join(resourcesDir, 'SumatraPDF.exe') : '',
    execDir ? path.join(execDir, 'resources', 'bin', 'SumatraPDF.exe') : '',
    path.resolve(process.cwd(), 'PrintBK/counter-app/bin/SumatraPDF.exe'),
    path.resolve(process.cwd(), 'counter-app/bin/SumatraPDF.exe'),
    path.resolve(moduleDir, '../../counter-app/bin/SumatraPDF.exe'),
    path.resolve(moduleDir, '../../../counter-app/bin/SumatraPDF.exe'),
    path.join(process.cwd(), 'bin', 'SumatraPDF.exe'),
    path.resolve(moduleDir, '../../bin/SumatraPDF.exe'),
    path.resolve(moduleDir, '../../../bin/SumatraPDF.exe'),
    path.resolve(moduleDir, '../bin/SumatraPDF.exe'),
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    path.join(process.env.LOCALAPPDATA || '', 'SumatraPDF', 'SumatraPDF.exe')
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }

  return null;
}

export async function executeSumatraPrint(
  filePath: string,
  printerName: string,
  settings: PrintSettings,
  sumatraBinPath?: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const bin = findSumatraBinary(sumatraBinPath);
  if (!bin) {
    throw new Error('SumatraPDF executable not found. Please install SumatraPDF or provide path in config.');
  }

  const printSettings = buildSumatraSettings(settings);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((printerName || '').trim());
  const isDefaultTarget = !printerName || printerName === 'Default Printer' || isUuid;
  const primaryTarget = isDefaultTarget ? '-print-to-default' : `-print-to "${printerName}"`;
  const command = `"${bin}" ${primaryTarget} -print-settings "${printSettings}" -silent "${filePath}"`;

  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 60000 });
    return { success: true, stdout, stderr };
  } catch (err: any) {
    // 1. If targeted print failed due to driver rejecting advanced -print-settings, retry same printer with safe minimal options
    if (primaryTarget !== '-print-to-default') {
      try {
        const safeSettings = settings.copies && settings.copies > 1 ? `${settings.copies}x,fit` : 'fit';
        const safeCmd = `"${bin}" ${primaryTarget} -print-settings "${safeSettings}" -silent "${filePath}"`;
        const { stdout, stderr } = await execAsync(safeCmd, { timeout: 60000 });
        return { success: true, stdout, stderr };
      } catch (safeErr: any) {
        // 2. Pure basic print without any -print-settings (works on 100% of legacy Canon/Brother/HP CAPT/GDI drivers)
        try {
          const minimalCmd = `"${bin}" ${primaryTarget} -silent "${filePath}"`;
          const { stdout, stderr } = await execAsync(minimalCmd, { timeout: 60000 });
          return { success: true, stdout, stderr };
        } catch (_) {}
      }
    }
    throw new Error(`SumatraPDF print failed for "${printerName || 'default'}": ${err.message}`);
  }
}
