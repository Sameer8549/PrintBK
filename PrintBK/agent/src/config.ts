import fs from 'fs';
import path from 'path';
import { protectData, unprotectData } from './dpapi';

export interface AgentConfig {
  apiBase: string;
  agentToken: string;
  encryptedToken?: string;
  agentSetupCode: string;
  deviceLabel: string;
  shopId?: string;
  paired?: boolean;
  dryRun: boolean;
  dryRunDir: string;
  workDir: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  sumatraPath?: string;
  libreOfficePath?: string;
  printerProfiles: Record<string, string>;
}

// Preferred config location: %APPDATA%\PrintBK\agent-config.json
export function getAppDataConfigDir(): string {
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'PrintBK');
  }
  return path.resolve(process.cwd());
}

export function getConfigFilePath(): string {
  const appDataDir = getAppDataConfigDir();
  const appDataFile = path.join(appDataDir, 'agent-config.json');
  if (fs.existsSync(appDataFile)) {
    return appDataFile;
  }
  // Local fallback / legacy migration check
  const localFile = path.resolve(process.cwd(), 'agent-config.json');
  if (fs.existsSync(localFile)) {
    return localFile;
  }
  return appDataFile;
}

const DEFAULT_CONFIG: AgentConfig = {
  apiBase: process.env.API_BASE || 'https://printbk-60074625517.development.catalystserverless.in',
  agentToken: process.env.AGENT_TOKEN || '',
  agentSetupCode: process.env.AGENT_SETUP_CODE || 'PBK-SETUP-9021',
  deviceLabel: process.env.AGENT_LABEL || 'Shop Counter PC',
  dryRun: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
  dryRunDir: path.resolve(getAppDataConfigDir(), 'dry-run'),
  workDir: path.resolve(getAppDataConfigDir(), 'work'),
  pollIntervalMs: 2500,
  heartbeatIntervalMs: 5000,
  sumatraPath: process.env.SUMATRA_PATH,
  libreOfficePath: process.env.LIBREOFFICE_PATH,
  printerProfiles: {}
};

export function loadConfig(cliArgs: string[] = process.argv.slice(2)): AgentConfig {
  const targetPath = getConfigFilePath();
  let fileConfig: Partial<AgentConfig> = {};

  if (fs.existsSync(targetPath)) {
    try {
      const raw = fs.readFileSync(targetPath, 'utf8');
      fileConfig = JSON.parse(raw);
    } catch (e) {
      console.warn(`[Config] Failed to parse ${targetPath}, using defaults`);
    }
  }

  // Attempt DPAPI decryption for token if encryptedToken exists
  let resolvedToken = fileConfig.agentToken || DEFAULT_CONFIG.agentToken;
  if (fileConfig.encryptedToken) {
    const decrypted = unprotectData(fileConfig.encryptedToken);
    if (decrypted) {
      resolvedToken = decrypted;
    }
  }

  // Parse CLI overrides
  const dryRunCli = cliArgs.includes('--dry-run');
  let apiBaseCli: string | undefined;
  let tokenCli: string | undefined;
  let codeCli: string | undefined;

  for (let i = 0; i < cliArgs.length; i++) {
    if (cliArgs[i] === '--api-base' && cliArgs[i + 1]) apiBaseCli = cliArgs[i + 1];
    if (cliArgs[i] === '--token' && cliArgs[i + 1]) tokenCli = cliArgs[i + 1];
    if (cliArgs[i] === '--setup-code' && cliArgs[i + 1]) codeCli = cliArgs[i + 1];
  }

  const merged: AgentConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    agentToken: tokenCli || resolvedToken,
    paired: fileConfig.paired !== undefined ? fileConfig.paired : Boolean(tokenCli || resolvedToken),
    dryRun: dryRunCli || fileConfig.dryRun || DEFAULT_CONFIG.dryRun,
    apiBase: apiBaseCli || fileConfig.apiBase || DEFAULT_CONFIG.apiBase,
    agentSetupCode: codeCli || fileConfig.agentSetupCode || DEFAULT_CONFIG.agentSetupCode
  };

  // Ensure directories exist
  if (!fs.existsSync(merged.workDir)) {
    fs.mkdirSync(merged.workDir, { recursive: true });
  }
  if (merged.dryRun && !fs.existsSync(merged.dryRunDir)) {
    fs.mkdirSync(merged.dryRunDir, { recursive: true });
  }

  return merged;
}

export function saveConfig(updates: Partial<AgentConfig>): void {
  const appDataDir = getAppDataConfigDir();
  if (!fs.existsSync(appDataDir)) {
    try {
      fs.mkdirSync(appDataDir, { recursive: true });
    } catch (_) {}
  }

  const targetPath = path.join(appDataDir, 'agent-config.json');
  let current: Partial<AgentConfig> = {};

  if (fs.existsSync(targetPath)) {
    try {
      current = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch (_) {}
  } else {
    // Check if legacy local file exists and read it
    const localFile = path.resolve(process.cwd(), 'agent-config.json');
    if (fs.existsSync(localFile)) {
      try {
        current = JSON.parse(fs.readFileSync(localFile, 'utf8'));
      } catch (_) {}
    }
  }

  const next = { ...current, ...updates };

  // DPAPI protect token if present and on Windows
  if (next.agentToken) {
    const encrypted = protectData(next.agentToken);
    if (encrypted) {
      next.encryptedToken = encrypted;
    }
  }

  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2), 'utf8');
}
