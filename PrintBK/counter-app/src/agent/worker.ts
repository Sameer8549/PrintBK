import path from 'path';
import fs from 'fs';
import { pathToFileURL } from 'url';

// Mark as supervised by desktop app to suppress separate WinForms tray
process.env.DESKTOP_SUPERVISED = 'true';

async function startWorker() {
  try {
    const candidates = [
      path.resolve(__dirname, '../bundled-agent/src/index.js'),
      path.resolve(__dirname, '../../dist/bundled-agent/src/index.js'),
      path.resolve(__dirname, '../../../agent/dist/src/index.js'),
      path.resolve(__dirname, '../../agent/dist/src/index.js'),
      path.resolve((process as any).resourcesPath || '', 'agent/dist/src/index.js'),
      path.resolve(process.cwd(), 'agent/dist/src/index.js')
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
