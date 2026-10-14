import fs from 'fs';
import path from 'path';

export interface AgentConfig {
  apiBase: string;
  agentToken: string;
  agentSetupCode: string;
  deviceLabel: string;
  dryRun: boolean;
  dryRunDir: string;
  workDir: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
  sumatraPath?: string;
  libreOfficePath?: string;
  printerProfiles: Record<string, string>;
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'agent-config.json');

const DEFAULT_CONFIG: AgentConfig = {
  apiBase: process.env.API_BASE || 'https://printbk-60074625517.development.catalystserverless.in',
  agentToken: process.env.AGENT_TOKEN || '',
  agentSetupCode: process.env.AGENT_SETUP_CODE || 'PBK-SETUP-9021',
  deviceLabel: process.env.AGENT_LABEL || 'Shop Counter PC',
  dryRun: process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run'),
  dryRunDir: path.resolve(process.cwd(), 'dry-run'),
  workDir: path.resolve(process.cwd(), 'work'),
  pollIntervalMs: 2500,
  heartbeatIntervalMs: 5000,
  sumatraPath: process.env.SUMATRA_PATH,
  libreOfficePath: process.env.LIBREOFFICE_PATH,
  printerProfiles: {
    bw: 'EPSON L3110 Series',
    colour: 'EPSON L3110 Series',
    photo: 'EPSON L3110 Series'
  }
};

export function loadConfig(cliArgs: string[] = process.argv.slice(2)): AgentConfig {
  let fileConfig: Partial<AgentConfig> = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      fileConfig = JSON.parse(raw);
    } catch (e) {
      console.warn(`[Config] Failed to parse ${CONFIG_FILE_PATH}, using defaults`);
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
    dryRun: dryRunCli || fileConfig.dryRun || DEFAULT_CONFIG.dryRun,
    apiBase: apiBaseCli || fileConfig.apiBase || DEFAULT_CONFIG.apiBase,
    agentToken: tokenCli || fileConfig.agentToken || DEFAULT_CONFIG.agentToken,
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
  let current: Partial<AgentConfig> = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    } catch (_) {}
  }
  const next = { ...current, ...updates };
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(next, null, 2), 'utf8');
}
