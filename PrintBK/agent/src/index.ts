import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import dns from 'dns';
import fetch from 'node-fetch';

// Prioritize IPv4 across all Node DNS lookups to prevent blackhole timeouts on campus/office Ethernet
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

// RFC 8305 Happy Eyeballs support to prevent IPv4 ETIMEDOUT on IPv6/NAT64 networks
const httpsAgent = new https.Agent({
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 250,
  keepAlive: true,
  timeout: 10000
});

const httpAgent = new http.Agent({
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 250,
  keepAlive: true,
  timeout: 10000
});

function agentFetch(url: string, options: any = {}): Promise<any> {
  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch(url, options);
  }
  const isHttps = url.startsWith('https:');
  return fetch(url, {
    ...options,
    agent: isHttps ? httpsAgent : httpAgent
  });
}
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
  private shopSettings?: any;

  constructor(cliArgs?: string[]) {
    this.config = loadConfig(cliArgs);
  }

  private get authHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-Agent-Token': this.config.agentToken,
      'X-Agent-Device-Token': this.config.agentToken
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

    // Initialize System Tray Companion (standalone CLI only; skipped when supervised by Electron desktop app)
    if (process.env.DESKTOP_SUPERVISED !== 'true') {
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
    }

    // Listen for IPC messages from desktop supervisor
    if (process.on) {
      process.on('message', async (msg: any) => {
        if (msg?.type === 'test_print') {
          logger.info(`[Agent] IPC test_print requested for role: ${msg.role || 'bw'}`);
          await this.triggerLocalTestPrint(msg.role);
        } else if (msg?.type === 'shutdown') {
          this.shutdown();
        }
      });
    }

    // 1. Pair if no token exists
    if (!this.config.agentToken) {
      if (this.trayManager) {
        this.trayManager.notify('PrintBK Agent Setup Required', 'Agent not yet paired. Click to configure counter.');
      }
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
      const res = await agentFetch(`${this.config.apiBase}/server/api/agent/pair`, {
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
      if (process.send) {
        process.send({ type: 'printers', printers });
      }
      const res = await agentFetch(`${this.config.apiBase}/server/api/agent/heartbeat`, {
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
        if (body.shop_settings) {
          this.shopSettings = body.shop_settings;
          if (body.shop_settings.mixed_colour_mode) {
            this.mixedColourMode = body.shop_settings.mixed_colour_mode;
          }
          if (body.shop_settings.printer_mapping) {
            const pm = body.shop_settings.printer_mapping;
            if (pm.bw && pm.bw !== 'No B&W printer') this.config.printerProfiles.bw = pm.bw;
            if (pm.colour && pm.colour !== 'No colour printer') this.config.printerProfiles.colour = pm.colour;
            if (pm.photo && pm.photo !== 'No photo printer') this.config.printerProfiles.photo = pm.photo;
          }
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
    const res = await agentFetch(`${this.config.apiBase}/server/api/agent/jobs/next`, {
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
    const discovered = await discoverPrinters(this.config.dryRun, this.config.printerProfiles).catch(() => []);
    let printerName = targetPrinter;
    if (!printerName || printerName === 'bw') {
      printerName = this.config.printerProfiles.bw || discovered.find(p => p.role === 'bw' || p.role === 'both')?.name;
    } else if (printerName === 'colour') {
      printerName = this.config.printerProfiles.colour || discovered.find(p => p.role === 'colour' || p.role === 'both')?.name;
    } else if (printerName === 'photo') {
      printerName = this.config.printerProfiles.photo || this.config.printerProfiles.colour;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((printerName || '').trim());
    if (isUuid || !printerName || !discovered.some(p => p.name.toLowerCase() === (printerName || '').toLowerCase())) {
      printerName = discovered.find(p => p.name.toLowerCase() === (this.config.printerProfiles.bw || '').toLowerCase())?.name
        || discovered.find(p => p.isDefault)?.name
        || discovered[0]?.name
        || this.config.printerProfiles.bw
        || '';
    }
    console.log(`[Agent] Generating test print for ${printerName || 'Default Printer'}...`);

    try {
      const pdfBytes = await generateTestPrintPdf(printerName || 'Default Printer', { name: 'HKBK Student Point' });
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
    } catch (err: any) {
      console.error(`[Agent] Test print failed: ${err.message}`);
      await this.reportFailure(job.id, 'PRINTER_ERROR', err.message);
    }
  }

  private async handlePrintQrJob(payload: any): Promise<void> {
    const { job, targetPrinter } = payload;
    const discovered = await discoverPrinters(this.config.dryRun, this.config.printerProfiles).catch(() => []);
    let printerName = targetPrinter || this.config.printerProfiles.colour;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((printerName || '').trim());
    if (isUuid || !printerName || printerName === 'bw' || printerName === 'colour' || printerName === 'photo' || !discovered.some(p => p.name.toLowerCase() === (printerName || '').toLowerCase())) {
      printerName = discovered.find(p => p.name.toLowerCase() === (this.config.printerProfiles.colour || '').toLowerCase())?.name
        || discovered.find(p => p.role === 'colour' || p.role === 'both')?.name
        || discovered.find(p => p.isDefault)?.name
        || discovered[0]?.name
        || '';
    }
    const qrUrl = `${this.config.apiBase.replace('/server/api', '')}/app/student`;

    console.log(`[Agent] Generating Print Your QR sign for ${printerName || 'Default Printer'}...`);

    try {
      const pdfBytes = await generateQrPrintPdf(qrUrl, this.shopSettings || { name: 'HKBK Student Point' });
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
    } catch (err: any) {
      console.error(`[Agent] Print QR failed: ${err.message}`);
      await this.reportFailure(job.id, 'PRINTER_ERROR', err.message);
    }
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
      await agentFetch(`${this.config.apiBase}/server/api/agent/items/${item.id}/ready`, {
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
        const discoveredPrinters = await discoverPrinters(this.config.dryRun, this.config.printerProfiles).catch(() => []);
        for (const part of allParts) {
          let targetPrinter = part.role === 'photo'
            ? (this.config.printerProfiles.photo || this.config.printerProfiles.colour || job.printer)
            : (part.role === 'colour'
                ? (this.config.printerProfiles.colour || job.printer)
                : (this.config.printerProfiles.bw || job.printer));

          const cleanTarget = (targetPrinter || '').trim();
          const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanTarget);
          
          let resolvedPrinter = '';
          if (!isTargetUuid && cleanTarget && !['bw', 'colour', 'photo', 'both', 'Default Printer'].includes(cleanTarget)) {
            // 1. Exact match in discovered printers
            const exact = discoveredPrinters.find(p => p.name.toLowerCase() === cleanTarget.toLowerCase());
            if (exact) resolvedPrinter = exact.name;
            // 2. Fuzzy substring match (driver names often have "(Copy 1)" or model prefixes)
            if (!resolvedPrinter) {
              const fuzzy = discoveredPrinters.find(p => p.name.toLowerCase().includes(cleanTarget.toLowerCase()) || cleanTarget.toLowerCase().includes(p.name.toLowerCase()));
              if (fuzzy) resolvedPrinter = fuzzy.name;
            }
          }

          if (!resolvedPrinter) {
            // 3. Match against configured role profile
            const profileName = (part.role === 'colour' ? this.config.printerProfiles.colour : (part.role === 'photo' ? (this.config.printerProfiles.photo || this.config.printerProfiles.colour) : this.config.printerProfiles.bw)) || '';
            if (profileName) {
              const profileMatch = discoveredPrinters.find(p => p.name.toLowerCase() === profileName.toLowerCase())
                || discoveredPrinters.find(p => p.name.toLowerCase().includes(profileName.toLowerCase()) || profileName.toLowerCase().includes(p.name.toLowerCase()));
              if (profileMatch) resolvedPrinter = profileMatch.name;
            }
          }

          if (!resolvedPrinter) {
            // 4. Role-based fallback: strictly match printer with corresponding capability
            const roleMatch = discoveredPrinters.find(p => p.role === part.role)
              || discoveredPrinters.find(p => p.role === 'both');
            if (roleMatch) resolvedPrinter = roleMatch.name;
          }

          targetPrinter = resolvedPrinter || discoveredPrinters.find(p => p.isDefault)?.name || discoveredPrinters[0]?.name || 'Default Printer';

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
      const res = await agentFetch(fileUrl, {
        headers: { 'X-Agent-Token': this.config.agentToken }
      });

      if (!res.ok) {
        console.warn(`[Agent] Failed to download file ${fileId} (HTTP ${res.status})`);
        continue;
      }

      const outName = `${item.id}_${fileId}.bin`;
      const outPath = path.join(this.config.workDir, outName);
      const arrayBuf = typeof (res as any).arrayBuffer === 'function' ? await (res as any).arrayBuffer() : await (res as any).buffer();
      const buffer = Buffer.from(arrayBuf);
      fs.writeFileSync(outPath, buffer);
      downloaded.push(outPath);
    }

    return downloaded;
  }

  private async reportProgress(jobId: string, pagesDone: number, pagesTotal: number): Promise<void> {
    try {
      await agentFetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/progress`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ pages_done: pagesDone, pages_total: pagesTotal })
      });
    } catch (_) {}
  }

  private async reportComplete(jobId: string, totalPages: number): Promise<void> {
    try {
      await agentFetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/complete`, {
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
      await agentFetch(`${this.config.apiBase}/server/api/agent/jobs/${jobId}/fail`, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify({ error_code: errorCode, error_message: message })
      });
    } catch (_) {}
  }

  public async triggerLocalTestPrint(printerNameOrRole?: string): Promise<void> {
    try {
      const printers = await discoverPrinters(this.config.dryRun, this.config.printerProfiles);
      let target = printerNameOrRole;
      if (!target || target === 'bw' || target === 'colour' || target === 'photo' || target === 'both') {
        const role = target || 'bw';
        target = this.config.printerProfiles[role] || printers.find(p => p.role === role)?.name || (printers[0]?.name) || 'Default Printer';
      }
      if (printers.length > 0 && !printers.some(p => p.name.toLowerCase() === (target || '').toLowerCase())) {
        target = printers.find(p => p.isDefault)?.name || printers[0]?.name || target;
      }
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
