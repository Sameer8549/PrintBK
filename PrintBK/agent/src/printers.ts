import { exec } from 'child_process';
import util from 'util';
import os from 'os';

const execAsync = util.promisify(exec);

export interface DiscoveredPrinter {
  name: string;
  role: 'bw' | 'colour' | 'photo' | 'both';
  online: boolean;
  status: string;
  paper_info: Record<string, boolean>;
  tray_info: Record<string, boolean>;
  isDefault?: boolean;
}

export async function discoverPrinters(dryRun = false, fallbackProfiles?: Record<string, string>): Promise<DiscoveredPrinter[]> {
  const isWindows = os.platform() === 'win32';

  if (!dryRun && isWindows) {
    try {
      const psCommand = `powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Printer | Select-Object Name, Default, PrinterStatus, WorkOffline, PortName | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(psCommand, { timeout: 4000 });
      if (stdout && stdout.trim()) {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];

        const printers: DiscoveredPrinter[] = list.map((item: any) => {
          const name = String(item.Name || '').trim();
          const isOffline = item.WorkOffline === true;
          const statusVal = Number(item.PrinterStatus || 3);
          // 3 = Idle/Ready, 4 = Printing, 5 = Warmup, 1 = Other, 2 = Unknown
          let statusText = isOffline ? 'offline' : (statusVal === 3 || statusVal === 4 ? 'ready' : 'busy');
          
          // Role heuristics from name
          const lower = name.toLowerCase();
          let role: 'bw' | 'colour' | 'photo' | 'both' = 'both';
          if (lower.includes('photo') || lower.includes('l805') || lower.includes('g570') || lower.includes('pixma')) {
            role = 'photo';
          } else if (lower.includes('color') || lower.includes('colour') || lower.includes('l31') || lower.includes('ecotank')) {
            role = 'colour';
          } else if (lower.includes('laserjet') || lower.includes('m1005') || lower.includes('1020') || lower.includes('mono')) {
            role = 'bw';
          }

          return {
            name,
            role,
            online: !isOffline,
            status: statusText,
            paper_info: { A4: true, Legal: true, A3: lower.includes('a3') },
            tray_info: { 'Tray 1': true },
            isDefault: item.Default === true
          };
        });

        if (printers.length > 0) {
          return printers;
        }
      }
    } catch (err: any) {
      console.warn(`[Printers] Windows spooler query failed (${err.message}), using profile fallback`);
    }
  }

  // Fallback / Dry Run Simulated Profiles
  const profiles = fallbackProfiles || {};

  const results: DiscoveredPrinter[] = [];
  for (const [role, name] of Object.entries(profiles)) {
    results.push({
      name,
      role: (role === 'colour' || role === 'bw' || role === 'photo') ? role : 'both',
      online: true,
      status: 'ready',
      paper_info: { A4: true, Legal: true, A3: role === 'a3' },
      tray_info: { 'Tray 1': true },
      isDefault: role === 'bw'
    });
  }

  // If dry-run and no specific profiles were configured, provide simulated virtual print queues
  if (results.length === 0 && dryRun) {
    return [
      {
        name: 'Simulated B&W Counter Printer',
        role: 'bw',
        online: true,
        status: 'ready',
        paper_info: { A4: true, Legal: true, A3: false },
        tray_info: { 'Tray 1': true },
        isDefault: true
      },
      {
        name: 'Simulated Colour Counter Printer',
        role: 'colour',
        online: true,
        status: 'ready',
        paper_info: { A4: true, Legal: true, A3: true },
        tray_info: { 'Tray 1': true },
        isDefault: false
      }
    ];
  }

  return results;
}
