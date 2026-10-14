import fs from 'fs';
import path from 'path';
import { PrintPart } from './layout';

export interface DryRunManifest {
  jobId: string;
  orderNumber?: number | string;
  pickupCode?: string;
  itemKind: string;
  printer: string;
  totalPages: number;
  parts: Array<{
    role: string;
    pageCount: number;
    pagesList: number[];
    combineNote?: string;
    filePath: string;
  }>;
  executedAt: string;
  durationMs: number;
}

export async function executeDryRunPrint(
  jobId: string,
  printer: string,
  item: any,
  parts: PrintPart[],
  dryRunDir: string,
  onProgress?: (pagesDone: number, totalPages: number) => Promise<void>
): Promise<{ success: boolean; durationMs: number; manifestPath: string }> {
  const jobFolder = path.join(dryRunDir, jobId);
  if (!fs.existsSync(jobFolder)) {
    fs.mkdirSync(jobFolder, { recursive: true });
  }

  const startTime = Date.now();
  const totalPages = parts.reduce((acc, p) => acc + p.pageCount, 0);

  const manifestParts: DryRunManifest['parts'] = [];

  // Write out each part PDF to the dry-run folder
  parts.forEach((part, idx) => {
    const fileName = `part_${idx + 1}_${part.role}.pdf`;
    const fullPath = path.join(jobFolder, fileName);
    fs.writeFileSync(fullPath, part.pdfBytes);

    manifestParts.push({
      role: part.role,
      pageCount: part.pageCount,
      pagesList: part.pagesList,
      combineNote: part.combineNote,
      filePath: fullPath
    });
  });

  // Simulate real-time printing page progress at 1 page / 500ms
  for (let p = 1; p <= totalPages; p++) {
    if (onProgress) {
      await onProgress(p, totalPages);
    }
    // Small sleep between pages to simulate physical mechanical movement
    await new Promise(r => setTimeout(r, 400));
  }

  const durationMs = Date.now() - startTime;

  const manifest: DryRunManifest = {
    jobId,
    orderNumber: item?.order_number,
    pickupCode: item?.pickup_code,
    itemKind: item?.kind || 'document',
    printer,
    totalPages,
    parts: manifestParts,
    executedAt: new Date().toISOString(),
    durationMs
  };

  const manifestPath = path.join(jobFolder, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return {
    success: true,
    durationMs,
    manifestPath
  };
}
