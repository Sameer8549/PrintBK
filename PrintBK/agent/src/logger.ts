import fs from 'fs';
import path from 'path';

export class AgentLogger {
  private logFilePath: string;
  private logDir: string;

  constructor(baseDir?: string) {
    const root = baseDir || (process.env.APPDATA ? path.join(process.env.APPDATA, 'PrintBK') : process.cwd());
    this.logDir = path.resolve(root, 'logs');
    this.logFilePath = path.join(this.logDir, 'agent.log');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (_) {}
    }
  }

  public getLogPath(): string {
    return this.logFilePath;
  }

  private write(level: string, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    let formattedArgs = '';
    if (args.length > 0) {
      formattedArgs = ' ' + args.map(a => (a instanceof Error ? (a.stack || a.message) : (typeof a === 'object' ? JSON.stringify(a) : String(a)))).join(' ');
    }
    const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;

    // Console output
    if (level === 'ERROR') {
      console.error(`[${level}] ${message}`, ...args);
    } else if (level === 'WARN') {
      console.warn(`[${level}] ${message}`, ...args);
    } else {
      console.log(`[${level}] ${message}`, ...args);
    }

    // File append
    try {
      this.ensureDir();
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
    } catch (_) {}
  }

  public info(message: string, ...args: any[]): void {
    this.write('INFO', message, ...args);
  }

  public warn(message: string, ...args: any[]): void {
    this.write('WARN', message, ...args);
  }

  public error(message: string, ...args: any[]): void {
    this.write('ERROR', message, ...args);
  }
}

export const logger = new AgentLogger();
