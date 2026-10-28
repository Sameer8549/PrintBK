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

      // Decrypt tokens if encrypted with Electron safeStorage
      if (parsed._encStaffToken && safeStorage?.isEncryptionAvailable()) {
        try {
          const buf = Buffer.from(parsed._encStaffToken, 'base64');
          parsed.staffToken = safeStorage.decryptString(buf);
        } catch (_) {}
      }
      if (parsed._encAgentToken && safeStorage?.isEncryptionAvailable()) {
        try {
          const buf = Buffer.from(parsed._encAgentToken, 'base64');
          parsed.agentToken = safeStorage.decryptString(buf);
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

      // Encrypt sensitive tokens with safeStorage if available
      if (toWrite.staffToken && safeStorage?.isEncryptionAvailable()) {
        try {
          toWrite._encStaffToken = safeStorage.encryptString(toWrite.staffToken).toString('base64');
          delete toWrite.staffToken;
        } catch (_) {}
      }
      if (toWrite.agentToken && safeStorage?.isEncryptionAvailable()) {
        try {
          toWrite._encAgentToken = safeStorage.encryptString(toWrite.agentToken).toString('base64');
          delete toWrite.agentToken;
        } catch (_) {}
      }

      fs.writeFileSync(this.filePath, JSON.stringify(toWrite, null, 2), 'utf8');
    } catch (err) {
      console.error('[CounterStore] Failed to save config:', err);
    }
  }
}
