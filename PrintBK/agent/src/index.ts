import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { loadConfig, saveConfig, AgentConfig } from './config';
import { discoverPrinters } from './printers';
import { executeSumatraPrint } from './sumatra';
import { convertToPdf } from './converter';
import { processDocumentLayout, PrintPart } from './layout';
import { generateTestPrintPdf, generateQrPrintPdf } from './testprint';
import { cleanJobFiles, startSweeper } from './sweeper';
import { executeDryRunPrint } from './dryrun';
import { logger } from './logger';
import { TrayManager } from './tray';

const PID_FILE_PATH = path.resolve(process.cwd(), 'agent.pid');

function writePid(): void {
  try {
    fs.writeFileSync(PID_FILE_PATH, String(process.pid), 'utf8');
  } catch (_) {}
}

function removePid(): void {
  try {
    if (fs.existsSync(PID_FILE_PATH)) {
      fs.unlinkSync(PID_FILE_PATH);
    }
  } catch (_) {}
}

class PrintAgentDaemon {
  private config: AgentConfig;
  private isRunning = false;
  private heartbeatTimer?: NodeJS.Timeout;
  private sweeperTimer?: NodeJS.Timeout;
  private activeJobTempFiles: string[] = [];
  private mixedColourMode: 'split' | 'colour' = 'split';
  private trayManager?: TrayManager;

  constructor(cliArgs?: string[]) {
    this.config = loadConfig(cliArgs);
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Agent-Token': this.config.agentToken,
      'Authorization': `Bearer ${this.config.agentToken}`
    };
  }

  public async start(): Promise<void> {
    writePid();

    logger.info('====================================================');
    logger.info('           PRINTBK REAL-TIME PRINT AGENT             ');
    logger.info('====================================================');
    logger.info(`PID:            ${process.pid}`);
    logger.info(`API Base:       ${this.config.apiBase}`);
    logger.info(`Device Label:   ${this.config.deviceLabel}`);
    logger.info(`Execution Mode: ${this.config.dryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION (Physical)'}`);
    logger.info(`Work Dir:       ${this.config.workDir}`);
    logger.info(`Logs File:      ${logger.getLogPath()}`);
    if (this.config.dryRun) {
      logger.info(`Dry-Run Dir:    ${this.config.dryRunDir}`);
    }
    logger.info('----------------------------------------------------');

    // Initialize System Tray Companion
    const staffUrl = `${this.config.apiBase.replace(/\/server\/api$/, '')}/staff`;
    this.trayManager = new TrayManager(process.pid, logger.getLogPath(), staffUrl);
    this.trayManager.start();
    this.trayManager.onAction(async (action) => {
      logger.info(`[Agent] System tray action: ${action}`);
      if (action === 'test_print') {
        await this.triggerLocalTestPrint();
      } else if (action === 'check_update') {
        await this.sendHeartbeat();
      } else if (action === 'exit') {
        this.shutdown();
      }
    });

    // 1. Pair if no token exists
    if (!this.config.agentToken) {
      this.trayManager.notify('PrintBK Agent Setup Required', 'Agent not yet paired. Click to configure counter.');
      await this.pairDevice();
    }

    this.isRunning = true;

    // 2. Start Background Sweeper for orphan files
    this.sweeperTimer = startSweeper(this.config.workDir);

    // 3. Initial Heartbeat & Spooler sync
    await this.sendHeartbeat();

    // 4. Start Heartbeat Timer (5s)
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(err => {
        logger.warn(`[Agent] Heartbeat error: ${err.message}`);
      });
    }, this.config.heartbeatIntervalMs);

    // 5. Start Adaptive Job Polling Loop
    this.pollLoop();

    // Setup graceful exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  private async pairDevice(): Promise<void> {
    logger.info(`[Agent] Pairing device with setup code against ${this.config.apiBase}...`);
    try {
      const res = await fetch(`${this.config.apiBase}/server/api/agent/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupCode: this.config.agentSetupCode,
          label: this.config.deviceLabel
        })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Pairing failed with status ${res.status}: ${err}`);
      }

      const data: any = await res.json();
      if (!data.token) throw new Error('No token returned in pairing response');

      this.config.agentToken = data.token;
      saveConfig({ agentToken: data.token, paired: true });
      logger.info(`[Agent] Device successfully paired! Token secured with DPAPI.`);
      this.trayManager?.notify('PrintBK Agent Paired', 'Counter PC successfully paired and ready.');
    } catch (err: any) {
      logger.error(`[Agent] CRITICAL: Device pairing failed: ${err.message}`);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const printers = await discoverPrinters(this.config.dryRun, this.config.printerProfiles);
      const res = await fetch(`${this.config.apiBase}/server/api/agent/heartbeat`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({
          label: this.config.deviceLabel,
          printers
        })
      });

      if (res.status === 401) {
        logger.warn('[Agent] 401 Unauthorized during heartbeat: attempting re-pair...');
        await this.pairDevice();
        return;
      }

      if (res.ok) {
        const body: any = await res.json();
        if (body.shop_settings?.mixed_colour_mode) {
          this.mixedColourMode = body.shop_settings.mixed_colour_mode;
        }
        this.trayManager?.updateStatus(`PrintBK Agent (Online - ${printers.length} printer${printers.length > 1 ? 's' : ''})`);
      } else {
        this.trayManager?.updateStatus('PrintBK Agent (Connecting...)');
      }
    } catch (err: any) {
      logger.warn(`[Agent] Heartbeat communication failed: ${err.message}`);
      this.trayManager?.updateStatus('PrintBK Agent (Connecting...)');
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      let waitMs = this.config.pollIntervalMs;
      try {
        const hasJob = await this.pollNextJob();
        if (hasJob) {
          waitMs = 100; // Immediate next cycle if a job was processed
        }
      } catch (err: any) {
        console.warn(`[Agent] Polling cycle error: ${err.message}`);
        waitMs = 5000;
      }

      if (process.argv.includes('--once')) {
        break;
      }

      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  private async pollNextJob(): Promise<boolean> {
    const res = await fetch(`${this.config.apiBase}/server/api/agent/jobs/next`, {
      method: 'GET',
      headers: this.authHeaders
    });

    if (res.status === 204) {
      return false; // Queue empty
    }

    if (!res.ok) {
      if (res.status === 401) {
        await this.pairDevice();
      }
      return false;
    }

    const payload: any = await res.json();
    if (!payload || !payload.type) return false;

    console.log(`[Agent] Acquired job type: ${payload.type}`);

    if (payload.type === 'test_print') {
      await this.handleTestPrintJob(payload);
      return true;
    }

    if (payload.type === 'print_qr') {
      await this.handlePrintQrJob(payload);
      return true;
    }

    if (payload.type === 'prepare') {
      await this.handleEarlyPrepareJob(payload);
      return true;
    }

    if (payload.type === 'print') {
      await this.handlePrintJob(payload);
      return true;
    }

    return false;
  }

  /* ─── Handlers ─────────────────────────────────────────────────── */

  private async handleTestPrintJob(payload: any): Promise<void> {
    const { job, targetPrinter } = payload;
    const printerName = targetPrinter || this.config.printerProfiles.bw || 'Default Printer';
    console.log(`[Agent] Generating test print for ${printerName}...`);

    const pdfBytes = await generateTestPrintPdf(printerName, { name: 'HKBK Student Point' });
    const part: PrintPart = {
      role: 'both',
      pdfBytes,
      pageCount: 1,
      pagesList: [1]
    };

    if (this.config.dryRun) {
      await executeDryRunPrint(job.id, printerName, { kind: 'test_print' }, [part], this.config.dryRunDir, async (p, t) => {
        await this.reportProgress(job.id, p, t);
      });
    } else {
      const tempPdf = path.join(this.config.workDir, `test_print_${job.id}.pdf`);
      fs.writeFileSync(tempPdf, pdfBytes);
      this.activeJobTempFiles.push(tempPdf);

      await this.reportProgress(job.id, 1, 1);
      await executeSumatraPrint(tempPdf, printerName, { copies: 1, paper: 'A4' }, this.config.sumatraPath);
      cleanJobFiles([tempPdf]);
    }

    await this.reportComplete(job.id, 1);
    console.log(`[Agent] Test print completed successfully.`);
  }

  private async handlePrintQrJob(payload: any): Promise<void> {
    const { job, targetPrinter } = payload;
    const printerName = targetPrinter || this.config.printerProfiles.colour || 'Default Printer';
    const qrUrl = `${this.config.apiBase.replace('/server/api', '')}/app/student`;

    console.log(`[Agent] Generating Print Your QR sign for ${printerName}...`);
    const pdfBytes = await generateQrPrintPdf(qrUrl, { name: 'HKBK Student Point' });
    const part: PrintPart = {
      role: 'colour',
      pdfBytes,
      pageCount: 1,
      pagesList: [1]
    };

    if (this.config.dryRun) {
      await executeDryRunPrint(job.id, printerName, { kind: 'print_qr' }, [part], this.config.dryRunDir, async (p, t) => {
        await this.reportProgress(job.id, p, t);
      });
    } else {
      const tempPdf = path.join(this.config.workDir, `qr_sign_${job.id}.pdf`);
      fs.writeFileSync(tempPdf, pdfBytes);
      this.activeJobTempFiles.push(tempPdf);

      await this.reportProgress(job.id, 1, 1);
      await executeSumatraPrint(tempPdf, printerName, { copies: 1, paper: 'A4' }, this.config.sumatraPath);
      cleanJobFiles([tempPdf]);
    }

    await this.reportComplete(job.id, 1);
    console.log(`[Agent] Print QR completed successfully.`);
  }

  private async handleEarlyPrepareJob(payload: any): Promise<void> {
    const { item } = payload;
    console.log(`[Agent] Pre-preparing item #${item.id} (${item.kind}) for order #${item.order_number}...`);

    try {
      // Download files into work directory
      const downloadedFiles = await this.downloadItemFiles(item);
      for (const fp of downloadedFiles) {
        let pdfPath = fp;
        if (path.extname(fp).toLowerCase() !== '.pdf') {
          pdfPath = await convertToPdf(fp, this.config.workDir, this.config.libreOfficePath);
          this.activeJobTempFiles.push(pdfPath);
        }

        const buf = fs.readFileSync(pdfPath);
        await processDocumentLayout(buf, item.payload?.settings || {}, this.mixedColourMode, {
          orderNumber: item.order_number,
          pickupCode: item.pickup_code
        });
      }

      // Notify server item is ready_to_print
      await fetch(`${this.config.apiBase}/server/api/agent/items/${item.id}/ready`, {
        method: 'POST',
        headers: this.authHeaders
      });

      console.log(`[Agent] Item #${item.id} is prepared and ready_to_print instantly on counter approve.`);
    } catch (err: any) {
      console.warn(`[Agent] Pre-prepare failed for #${item.id}: ${err.message}`);
    }
  }

  private async handlePrintJob(payload: any): Promise<void> {
    const { job, item } = payload;
    console.log(`[Agent] Executing print job #${job.id} for item #${item.id} (Order #${item.order_number})...`);

    const tempJobFiles: string[] = [];

    try {
      const downloadedFiles = await this.downloadItemFiles(item);
      tempJobFiles.push(...downloadedFiles);

      if (downloadedFiles.length === 0) {
        throw new Error('No document files available for print job');
      }

      const allParts: PrintPart[] = [];

      for (const filePath of downloadedFiles) {
        let pdfPath = filePath;
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.pdf') {
          pdfPath = await convertToPdf(filePath, this.config.workDir, this.config.libreOfficePath);
          tempJobFiles.push(pdfPath);
        }

        const buffer = fs.readFileSync(pdfPath);
        const processed = await processDocumentLayout(buffer, item.payload?.settings || item.payload || {}, this.mixedColourMode, {
          orderNumber: item.order_number,
          pickupCode: item.pickup_code
        });

        allParts.push(...processed.parts);
      }

      const totalPages = allParts.reduce((acc, p) => acc + p.pageCount, 0);

      if (this.config.dryRun) {
        await executeDryRunPrint(
          job.id,
          job.printer || this.config.printerProfiles.bw,
          item,
          allParts,
          this.config.dryRunDir,
          async (done, total) => {
            await this.reportProgress(job.id, done, total);
          }
        );
      } else {
        // Physical Print via SumatraPDF
        let pagesDoneAcc = 0;
        for (const part of allParts) {
          const targetPrinter = part.role === 'colour'
            ? (this.config.printerProfiles.colour || job.printer)
            : (this.config.printerProfiles.bw || job.printer);

          const partFile = path.join(this.config.workDir, `print_${job.id}_${part.role}.pdf`);
          fs.writeFileSync(partFile, part.pdfBytes);
          tempJobFiles.push(partFile);

          const settings = item.payload?.settings || item.payload || {};
          const duplexMode = settings.sided === 'double'
            ? (settings.duplexEdge === 'short' ? 'duplexshort' : 'duplexlong')
            : 'simplex';

          await executeSumatraPrint(
            partFile,
            targetPrinter,
            {
              copies: Number(settings.copies || 1),
              duplex: duplexMode,
              color: part.role === 'colour' ? 'color' : 'monochrome',
              paper: settings.paper || 'A4'
            },
            this.config.sumatraPath
          );

          pagesDoneAcc += part.pageCount;
          await this.reportProgress(job.id, pagesDoneAcc, totalPages);
        }
      }

      // Report Completion
      await this.reportComplete(job.id, totalPages);
      console.log(`[Agent] Print job #${job.id} completed successfully.`);
    } catch (err: any) {
      console.error(`[Agent] Print job #${job.id} failed: ${err.message}`);
      await this.reportFailure(job.id, 'PRINT_FAILED', err.message);
    } finally {
      // Immediate file cleanup upon completion/failure
      cleanJobFiles(tempJobFiles);
    }
  }

  private async downloadItemFiles(item: any): Promise<string[]> {
    const downloaded: string[] = [];
    const fileRefs = Array.isArray(item.file_refs) ? item.file_refs : [];

    for (const ref of fileRefs) {
      const fileId = typeof ref === 'string' ? ref : (ref.id || ref.cloudId);
      if (!fileId) continue;

      const fileUrl = `${this.config.apiBase}/server/api/files/${fileId}`;
      const res = await fetch(fileUrl, {
        headers: { 'X-Agent-Token': this.config.agentToken }
      });

      if (!res.ok) {
        console.warn(`[Agent] Failed to download file ${fileId} (HTTP ${res.status})`);
        continue;
      }

      const outName = `${item.id}_${fileId}.bin`;
      const outPath = path.join(this.config.workDir, outName);
      const buffer = await res.buffer();
      fs.writeFileSync(outPath, buffer);
      downloaded.push(outPath);
    }

    return downloaded;
  }

  private async reportProgress(jobId: string, pagesDone: number, pagesTotal: number): Promise<void> {
    try {
      await fetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/progress`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ pages_done: pagesDone, pages_total: pagesTotal })
      });
    } catch (_) {}
  }

  private async reportComplete(jobId: string, totalPages: number): Promise<void> {
    try {
      await fetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/complete`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ pages_printed: totalPages })
      });
    } catch (err: any) {
      console.warn(`[Agent] Failed to report complete: ${err.message}`);
    }
  }

  private async reportFailure(jobId: string, errorCode: string, message: string): Promise<void> {
    try {
      await fetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/fail`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ error_code: errorCode, error_message: message })
      });
    } catch (_) {}
  }

  public async triggerLocalTestPrint(printerName?: string): Promise<void> {
    try {
      const printers = await discoverPrinters(this.config.dryRun, this.config.printerProfiles);
      const target = printerName || this.config.printerProfiles.bw || (printers[0]?.name) || 'Default Printer';
      logger.info(`[Agent] Triggering local test print on: ${target}`);
      const pdfBytes = await generateTestPrintPdf(target, { name: 'HKBK Student Point' });
      const part: PrintPart = {
        role: 'both',
        pdfBytes,
        pageCount: 1,
        pagesList: [1]
      };
      if (this.config.dryRun) {
        await executeDryRunPrint('local-test', target, { kind: 'test_print' }, [part], this.config.dryRunDir);
      } else {
        const tempPdf = path.join(this.config.workDir, `local_test_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdf, pdfBytes);
        await executeSumatraPrint(tempPdf, target, { copies: 1, paper: 'A4' }, this.config.sumatraPath);
        cleanJobFiles([tempPdf]);
      }
      logger.info(`[Agent] Local test print completed on: ${target}`);
      this.trayManager?.notify('PrintBK Test Print', `Sent test print to ${target}`);
    } catch (err: any) {
      logger.error(`[Agent] Local test print error: ${err.message}`);
    }
  }

  public shutdown(): void {
    logger.info('\n[Agent] Shutting down agent daemon gracefully...');
    this.isRunning = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.sweeperTimer) clearInterval(this.sweeperTimer);
    this.trayManager?.close();
    cleanJobFiles(this.activeJobTempFiles);
    removePid();
    logger.info('[Agent] Cleaned up temporary files and PID. Goodbye.');
    process.exit(0);
  }
}

// Process-level self-healing exception handlers
process.on('uncaughtException', (err) => {
  logger.error('CRITICAL: Uncaught exception in agent process:', err);
  removePid();
  // Exit with non-zero so Task Scheduler triggers auto-restart
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('CRITICAL: Unhandled promise rejection in agent process:', reason);
});

process.on('exit', () => {
  removePid();
});

// Start agent if run as main module
let daemonInstance: PrintAgentDaemon | null = null;

if (require.main === module) {
  daemonInstance = new PrintAgentDaemon();
  daemonInstance.start().catch(err => {
    logger.error('[Agent] Fatal error:', err);
    removePid();
    process.exit(1);
  });
}

// Graceful IPC/stdin shutdown listener (works reliably across Windows, Linux, and macOS)
process.stdin.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg === 'shutdown' || msg === 'exit' || msg.includes('"shutdown"') || msg.includes('"exit"')) {
    if (daemonInstance) {
      daemonInstance.shutdown();
    } else {
      removePid();
      process.exit(0);
    }
  }
});

export { PrintAgentDaemon };
