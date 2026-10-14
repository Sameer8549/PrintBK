import fs from 'fs';
import path from 'path';

export function cleanJobFiles(filePaths: string[]): void {
  for (const fp of filePaths) {
    try {
      if (fp && fs.existsSync(fp)) {
        fs.unlinkSync(fp);
      }
    } catch (err: any) {
      console.warn(`[Sweeper] Failed to immediately delete temp file ${fp}: ${err.message}`);
    }
  }
}

export function sweepTempDirectory(workDir: string, maxAgeMs = 5 * 60 * 1000): number {
  if (!fs.existsSync(workDir)) return 0;
  let deletedCount = 0;
  const now = Date.now();

  try {
    const entries = fs.readdirSync(workDir);
    for (const entry of entries) {
      const fullPath = path.join(workDir, entry);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isFile() && (now - stats.mtimeMs) > maxAgeMs) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch (_) {}
    }
  } catch (err: any) {
    console.warn(`[Sweeper] Directory sweep error on ${workDir}: ${err.message}`);
  }

  return deletedCount;
}

export function startSweeper(workDir: string, intervalMs = 60000, maxAgeMs = 5 * 60 * 1000): NodeJS.Timeout {
  // Run sweep on startup
  const initialSwept = sweepTempDirectory(workDir, maxAgeMs);
  if (initialSwept > 0) {
    console.log(`[Sweeper] Initial startup sweep purged ${initialSwept} stale temp file(s).`);
  }

  // Periodic recurring sweeper
  return setInterval(() => {
    const count = sweepTempDirectory(workDir, maxAgeMs);
    if (count > 0) {
      console.log(`[Sweeper] Periodic sweep purged ${count} stale temp file(s).`);
    }
  }, intervalMs);
}
