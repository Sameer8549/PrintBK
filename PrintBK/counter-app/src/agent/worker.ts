import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { pathToFileURL } from 'url';

// Prioritize IPv4 across all Node DNS lookups to prevent blackhole timeouts on campus/office Ethernet
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

// Mark as supervised by desktop app to suppress separate WinForms tray
process.env.DESKTOP_SUPERVISED = 'true';

async function startWorker() {
  try {
    const resPath = (process as any).resourcesPath || '';
    const execDir = path.dirname(process.execPath);
    const candidates = [
      path.resolve(__dirname, '../bundled-agent/src/index.js'),
      path.resolve(__dirname, '../../dist/bundled-agent/src/index.js'),
      path.join(resPath, 'app/dist/bundled-agent/src/index.js'),
      path.join(resPath, 'bundled-agent/src/index.js'),
      path.join(resPath, 'agent/dist/src/index.js'),
      path.join(execDir, 'resources/app/dist/bundled-agent/src/index.js'),
      path.join(execDir, 'resources/bundled-agent/src/index.js'),
      path.resolve(__dirname, '../../../agent/dist/src/index.js'),
      path.resolve(__dirname, '../../agent/dist/src/index.js'),
      path.resolve(process.cwd(), 'agent/dist/src/index.js'),
      path.resolve(process.cwd(), 'dist/bundled-agent/src/index.js')
    ];
    const targetPath = candidates.find(p => fs.existsSync(p));
    if (!targetPath) {
      throw new Error(`Could not locate compiled agent daemon. Checked: ${candidates.join(', ')}`);
    }
    const agentModule: any = await import(pathToFileURL(targetPath).href);
    const DaemonClass = agentModule.PrintAgentDaemon || agentModule.default?.PrintAgentDaemon;
    if (!DaemonClass) {
      throw new Error('PrintAgentDaemon not exported by agent module');
    }
    const daemon = new DaemonClass();
    await daemon.start();
  } catch (err: any) {
    console.error('[AgentWorker] Fatal error starting daemon:', err);
    process.exit(1);
  }
}

startWorker();
