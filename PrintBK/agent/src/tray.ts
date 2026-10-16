import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

export type TrayActionCallback = (action: string) => void;

export class TrayManager {
  private childProcess: ChildProcess | null = null;
  private actionListeners: TrayActionCallback[] = [];
  private isWindows = process.platform === 'win32';
  private disabled = process.env.HEADLESS_AGENT === 'true';

  constructor(
    private agentPid: number,
    private logPath: string,
    private staffUrl: string
  ) {}

  public start(): void {
    if (!this.isWindows || this.disabled) {
      logger.info('[Tray] System tray disabled (non-Windows or HEADLESS_AGENT=true)');
      return;
    }

    const scriptPath = path.resolve(__dirname, '..', 'tray.ps1');
    if (!fs.existsSync(scriptPath)) {
      logger.warn(`[Tray] Tray script not found at ${scriptPath}`);
      return;
    }

    try {
      this.childProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
        '-AgentPid', String(this.agentPid),
        '-LogsPath', this.logPath,
        '-StaffUrl', this.staffUrl
      ], {
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      });

      this.childProcess.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString('utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.action) {
              this.notifyListeners(parsed.action);
            }
          } catch (_) {}
        }
      });

      this.childProcess.on('exit', (code) => {
        logger.info(`[Tray] System tray process exited with code ${code}`);
        this.childProcess = null;
      });

      logger.info('[Tray] System tray companion process started successfully');
    } catch (err: any) {
      logger.warn(`[Tray] Failed to start system tray companion: ${err.message}`);
    }
  }

  public onAction(cb: TrayActionCallback): void {
    this.actionListeners.push(cb);
  }

  private notifyListeners(action: string): void {
    for (const listener of this.actionListeners) {
      try {
        listener(action);
      } catch (e: any) {
        logger.error(`[Tray] Listener error on action ${action}:`, e);
      }
    }
  }

  public updateStatus(text: string): void {
    if (!this.childProcess?.stdin?.writable) return;
    try {
      this.childProcess.stdin.write(JSON.stringify({ type: 'status', text }) + '\n');
    } catch (_) {}
  }

  public notify(title: string, text: string): void {
    if (!this.childProcess?.stdin?.writable) return;
    try {
      this.childProcess.stdin.write(JSON.stringify({ type: 'notify', title, text }) + '\n');
    } catch (_) {}
  }

  public close(): void {
    if (!this.childProcess) return;
    try {
      if (this.childProcess.stdin?.writable) {
        this.childProcess.stdin.write(JSON.stringify({ type: 'exit' }) + '\n');
      }
      setTimeout(() => {
        if (this.childProcess) {
          this.childProcess.kill();
          this.childProcess = null;
        }
      }, 500);
    } catch (_) {
      this.childProcess.kill();
      this.childProcess = null;
    }
  }
}
