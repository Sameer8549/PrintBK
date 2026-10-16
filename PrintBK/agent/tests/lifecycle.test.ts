import fs from 'fs';
import path from 'path';
import assert from 'assert';
import http from 'node:http';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

const agentRoot = fs.existsSync(path.resolve(process.cwd(), 'package.json')) && JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).name === 'agent'
  ? process.cwd()
  : path.resolve(__dirname, '../..');

let server: http.Server;
let port: number;
let baseUrl: string;

async function startServer(): Promise<void> {
  const candidate1 = path.resolve(agentRoot, '../functions/api/index.js');
  const candidate2 = path.resolve(__dirname, '../../../functions/api/index.js');
  const apiPath = fs.existsSync(candidate1) ? candidate1 : candidate2;
  const importDynamic = new Function('p', 'return import(p)');
  const mod = await importDynamic(pathToFileURL(apiPath).href);
  const app = mod.default || mod;

  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr: any = server.address();
      port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[Lifecycle Test] Test backend server running on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function runLifecycleTest(): Promise<void> {
  console.log('====================================================');
  console.log('       PRINTBK PRINT AGENT - LIFECYCLE TEST         ');
  console.log('====================================================');

  await startServer();

  const agentPidFile = path.resolve(agentRoot, 'agent.pid');
  const agentLogFile = path.resolve(agentRoot, 'logs', 'agent.log');

  // Clean prior artifacts
  if (fs.existsSync(agentPidFile)) {
    fs.unlinkSync(agentPidFile);
  }

  let passed = 0;
  let agentProc: any;

  try {
    console.log('\nStep 1: Starting Agent process in dry-run mode...');
    agentProc = spawn('node', ['dist/src/index.js', '--dry-run', '--api-base', baseUrl], {
      cwd: agentRoot,
      env: {
        ...process.env,
        HEADLESS_AGENT: 'true', // Run in headless mode during test
        AGENT_SETUP_CODE: 'PBK-SETUP-9021',
        AGENT_LABEL: 'Lifecycle Test PC'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const agentPid = agentProc.pid;
    console.log(`  -> Agent process spawned with PID ${agentPid}`);

    // Capture logs for debugging if failure occurs
    let agentStdout = '';
    let agentStderr = '';
    agentProc.stdout?.on('data', (d: any) => { agentStdout += d.toString(); });
    agentProc.stderr?.on('data', (d: any) => { agentStderr += d.toString(); });

    // Step 2: Verify PID file creation within 5 seconds
    console.log('\nStep 2: Checking PID file creation...');
    let pidFound = false;
    for (let i = 0; i < 25; i++) {
      if (fs.existsSync(agentPidFile)) {
        const fileContent = fs.readFileSync(agentPidFile, 'utf8').trim();
        assert.strictEqual(Number(fileContent), agentPid, 'PID file content must match spawned process PID');
        pidFound = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!pidFound) {
      console.error(`Debug: agentRoot="${agentRoot}", agentPidFile="${agentPidFile}"`);
      console.error(`Debug: agentProc.exitCode=${agentProc.exitCode}`);
      console.error(`Debug: agentStdout=\n${agentStdout}`);
      console.error(`Debug: agentStderr=\n${agentStderr}`);
    }
    assert.ok(pidFound, 'Agent must write agent.pid on startup');
    passed++;
    console.log(`  ✓ agent.pid exists and accurately contains PID ${agentPid}`);

    // Step 3: Verify log file creation and content
    console.log('\nStep 3: Checking logs/agent.log...');
    let logFound = false;
    for (let i = 0; i < 25; i++) {
      if (fs.existsSync(agentLogFile)) {
        const logs = fs.readFileSync(agentLogFile, 'utf8');
        if (logs.includes(String(agentPid)) && logs.includes('PRINTBK REAL-TIME PRINT AGENT')) {
          logFound = true;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(logFound, 'Agent must write startup logs with timestamp and PID');
    passed++;
    console.log('  ✓ logs/agent.log successfully created with timestamped lines');

    // Step 4: Verify Heartbeat communication with backend
    console.log('\nStep 4: Waiting for Agent Heartbeat to backend...');
    let heartbeatConfirmed = false;
    for (let i = 0; i < 30; i++) {
      try {
        const liveRes = await fetch(`${baseUrl}/staff/live`, {
          headers: { 'X-Staff-Token': 'fafeee08f195644f79d5dc333533fe7f82b226a05b6748b0072d9a6a04644485' }
        });
        if (liveRes.ok) {
          const liveData: any = await liveRes.json();
          if (liveData.printers && liveData.printers.length > 0) {
            heartbeatConfirmed = true;
            break;
          }
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 300));
    }
    assert.ok(heartbeatConfirmed, 'Backend live feed must report printers sent by agent heartbeat');
    passed++;
    console.log('  ✓ Agent heartbeat confirmed by backend live feed');

    // Step 5: Test Graceful Shutdown and PID cleanup
    console.log('\nStep 5: Testing graceful shutdown & PID file cleanup...');
    if (agentProc.stdin?.writable) {
      agentProc.stdin.write('shutdown\n');
    } else {
      agentProc.kill('SIGINT');
    }

    let exitCode: number | null = null;
    await new Promise<void>((resolve) => {
      agentProc.on('exit', (code: any) => {
        exitCode = code;
        resolve();
      });
      setTimeout(() => {
        if (exitCode === null) {
          agentProc.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });

    // Check PID file is deleted
    let pidDeleted = false;
    for (let i = 0; i < 15; i++) {
      if (!fs.existsSync(agentPidFile)) {
        pidDeleted = true;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    assert.ok(pidDeleted, 'Agent must delete agent.pid on graceful shutdown');
    passed++;
    console.log('  ✓ agent.pid cleanly deleted upon shutdown');

    console.log(`\n🎉 All ${passed} Lifecycle Tests Passed Successfully!\n`);
  } catch (err: any) {
    console.error('\n❌ Lifecycle test failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      if (agentProc && !agentProc.killed) {
        agentProc.kill('SIGKILL');
      }
    } catch (_) {}
    await stopServer();
  }
}

runLifecycleTest();
