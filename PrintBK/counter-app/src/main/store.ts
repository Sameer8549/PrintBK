import fs from 'fs';
import path from 'path';
import os from 'os';
import { safeStorage } from 'electron';

export interface CounterStoreData {
  paired: boolean;
  counterId?: string;
  deviceLabel?: string;
  staffToken?: string;
  staffDeviceId?: string;
  agentToken?: string;
  agentDeviceId?: string;
  bwPrinter?: string;
  colourPrinter?: string;
  photoPrinter?: string;
  openAtLogin?: boolean;
  windowBounds?: {
    width: number;
    height: number;
    x?: number;
    y?: number;
    isMaximized?: boolean;
  };
}

export class CounterStore {
  private filePath: string;
  private data: CounterStoreData;

  constructor() {
    const baseDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const appDir = path.join(baseDir, 'PrintBK');
    if (!fs.existsSync(appDir)) {
      try {
        fs.mkdirSync(appDir, { recursive: true });
      } catch (_) {}
    }
    this.filePath = path.join(appDir, 'counter-store.json');
    this.data = this.load();
  }

  private load(): CounterStoreData {
    if (!fs.existsSync(this.filePath)) {
      return { paired: false, openAtLogin: true };
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);

      // 1. Recover tokens from plaintext if preserved
      if (parsed.staffToken) {
        // Plaintext available
      } else if (parsed._encStaffToken && safeStorage?.isEncryptionAvailable()) {
        try {
          const buf = Buffer.from(parsed._encStaffToken, 'base64');
          parsed.staffToken = safeStorage.decryptString(buf);
        } catch (_) {}
      }
      if (!parsed.staffToken && parsed._backupStaffToken) {
        try {
          parsed.staffToken = Buffer.from(parsed._backupStaffToken, 'base64').toString('utf8');
        } catch (_) {}
      }

      if (parsed.agentToken) {
        // Plaintext available
      } else if (parsed._encAgentToken && safeStorage?.isEncryptionAvailable()) {
        try {
          const buf = Buffer.from(parsed._encAgentToken, 'base64');
          parsed.agentToken = safeStorage.decryptString(buf);
        } catch (_) {}
      }
      if (!parsed.agentToken && parsed._backupAgentToken) {
        try {
          parsed.agentToken = Buffer.from(parsed._backupAgentToken, 'base64').toString('utf8');
        } catch (_) {}
      }

      return { paired: false, openAtLogin: true, ...parsed };
    } catch (_) {
      return { paired: false, openAtLogin: true };
    }
  }

  public get(): CounterStoreData {
    this.data = this.load();
    return { ...this.data };
  }

  public set(updates: Partial<CounterStoreData>): void {
    const current = this.load();
    this.data = { ...current, ...updates };
    this.save();
  }

  public clearPairing(): void {
    this.data.paired = false;
    delete this.data.counterId;
    delete this.data.staffToken;
    delete this.data.staffDeviceId;
    delete this.data.agentToken;
    delete this.data.agentDeviceId;
    this.save();
  }

  private save(): void {
    try {
      const toWrite: any = { ...this.data };

      // Encrypt sensitive tokens with safeStorage if available, while maintaining non-volatile backup
      if (toWrite.staffToken) {
        toWrite._backupStaffToken = Buffer.from(toWrite.staffToken, 'utf8').toString('base64');
        if (safeStorage?.isEncryptionAvailable()) {
          try {
            toWrite._encStaffToken = safeStorage.encryptString(toWrite.staffToken).toString('base64');
          } catch (_) {}
        }
      }
      if (toWrite.agentToken) {
        toWrite._backupAgentToken = Buffer.from(toWrite.agentToken, 'utf8').toString('base64');
        if (safeStorage?.isEncryptionAvailable()) {
          try {
            toWrite._encAgentToken = safeStorage.encryptString(toWrite.agentToken).toString('base64');
          } catch (_) {}
        }
      }

      fs.writeFileSync(this.filePath, JSON.stringify(toWrite, null, 2), 'utf8');
    } catch (err) {
      console.error('[CounterStore] Failed to save config:', err);
    }
  }
}
