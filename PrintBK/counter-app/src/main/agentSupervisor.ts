import { fork, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';

export type AgentStatus = 'starting' | 'connected' | 'printing' | 'offline' | 'error';

export interface AgentSupervisorOptions {
  workerScript: string;
  apiBase: string;
  agentToken: string;
  deviceLabel: string;
  sumatraPath?: string;
  libreOfficePath?: string;
  dryRun?: boolean;
}

export class AgentSupervisor extends EventEmitter {
  private child: ChildProcess | null = null;
  private options: AgentSupervisorOptions;
  private status: AgentStatus = 'offline';
  private shouldRun = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private restartCount = 0;
  private lastRestartWindow = Date.now();
  private logStream: fs.WriteStream | null = null;
  private logPath: string;

  constructor(options: AgentSupervisorOptions) {
    super();
    this.options = options;

    const baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const logsDir = path.join(baseDir, 'PrintBK', 'logs');
    if (!fs.existsSync(logsDir)) {
      try {
        fs.mkdirSync(logsDir, { recursive: true });
      } catch (_) {}
    }
    this.logPath = path.join(logsDir, 'agent.log');
  }

  public getLogPath(): string {
    return this.logPath;
  }

  public getStatus(): AgentStatus {
    return this.status;
  }

  public updateCredentials(token: string, label?: string): void {
    this.options.agentToken = token;
    if (label) this.options.deviceLabel = label;
    if (this.child) {
      this.restart();
    }
  }

  public start(): void {
    this.shouldRun = true;
    this.spawnChild();
  }

  public stop(): void {
    this.shouldRun = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch (_) {}
      this.child = null;
    }
    this.setStatus('offline');
  }

  public restart(): void {
    if (this.child) {
      try {
        this.child.kill('SIGTERM');
      } catch (_) {}
      this.child = null;
    }
    this.spawnChild();
  }

  private setStatus(newStatus: AgentStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.emit('status-changed', newStatus);
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [Supervisor] ${message}\n`;
    try {
      if (!this.logStream) {
        this.logStream = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf8' });
      }
      this.logStream.write(formatted);
    } catch (_) {}
  }

  private spawnChild(): void {
    if (!this.shouldRun) return;

    // Check crash rate: max 10 restarts per 60 seconds
    const now = Date.now();
    if (now - this.lastRestartWindow > 60000) {
      this.restartCount = 0;
      this.lastRestartWindow = now;
    }
    this.restartCount++;
    if (this.restartCount > 10) {
      this.log('CRITICAL: Agent crashed 10 times in 60 seconds. Pausing restart for 30s.');
      this.setStatus('error');
      this.restartTimer = setTimeout(() => {
        this.restartCount = 0;
        this.spawnChild();
      }, 30000);
      return;
    }

    this.setStatus('starting');
    this.log(`Spawning print agent child process: ${this.options.workerScript}`);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      API_BASE: this.options.apiBase,
      AGENT_TOKEN: this.options.agentToken,
      AGENT_LABEL: this.options.deviceLabel,
      ELECTRON_RUN_AS_NODE: '1'
    };

    if (this.options.sumatraPath) env.SUMATRA_PATH = this.options.sumatraPath;
    if (this.options.libreOfficePath) env.LIBREOFFICE_PATH = this.options.libreOfficePath;
    if (this.options.dryRun) env.DRY_RUN = 'true';

    const appDataDir = process.env.APPDATA ? path.join(process.env.APPDATA, 'PrintBK') : path.join(os.homedir(), 'AppData', 'Roaming', 'PrintBK');
    if (!fs.existsSync(appDataDir)) {
      try { fs.mkdirSync(appDataDir, { recursive: true }); } catch (_) {}
    }

    try {
      this.child = fork(this.options.workerScript, [], {
        cwd: appDataDir,
        env,
        silent: true,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      this.child.stdout?.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('[Heartbeat] OK') || text.includes('listening')) {
          this.setStatus('connected');
        }
        if (text.includes('Printing job') || text.includes('Spooling')) {
          this.setStatus('printing');
        }
        if (text.includes('Print completed') || text.includes('Job done')) {
          this.setStatus('connected');
        }
        try {
          if (!this.logStream) {
            this.logStream = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf8' });
          }
          this.logStream.write(text);
        } catch (_) {}
      });

      this.child.stderr?.on('data', (chunk) => {
        const text = chunk.toString();
        try {
          if (!this.logStream) {
            this.logStream = fs.createWriteStream(this.logPath, { flags: 'a', encoding: 'utf8' });
          }
          this.logStream.write(`[STDERR] ${text}`);
        } catch (_) {}
      });

      this.child.on('message', (msg: any) => {
        if (msg?.type === 'status') {
          this.setStatus(msg.status);
        } else if (msg?.type === 'printers') {
          this.emit('printers', msg.printers);
        }
      });

      this.child.on('exit', (code, signal) => {
        this.log(`Agent child process exited (code: ${code}, signal: ${signal})`);
        this.child = null;
        if (this.shouldRun) {
          this.setStatus('offline');
          // Auto-restart within 2 seconds
          this.restartTimer = setTimeout(() => {
            this.spawnChild();
          }, 2000);
        }
      });

      this.child.on('error', (err) => {
        this.log(`Agent child process error: ${err.message}`);
        this.setStatus('error');
      });
    } catch (err: any) {
      this.log(`Failed to spawn agent child process: ${err.message}`);
      this.setStatus('error');
      if (this.shouldRun) {
        this.restartTimer = setTimeout(() => this.spawnChild(), 5000);
      }
    }
  }

  public sendTestPrint(role: 'bw' | 'colour' | 'photo'): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.child || !this.child.connected) {
        return resolve(false);
      }
      this.child.send({ type: 'test_print', role }, () => {
        resolve(true);
      });
    });
  }
}
