import { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, session, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import fetch from 'node-fetch';
import { autoUpdater } from 'electron-updater';
import { CounterStore } from './store';
import { AgentSupervisor, AgentStatus } from './agentSupervisor';
import { discoverPrinters } from '../agent/printers';
import { findSumatraBinary } from '../agent/sumatra';
import { findLibreOfficeBinary } from '../agent/converter';

// 1. Single-Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Register default protocol handler for printbk-counter://
app.setAsDefaultProtocolClient('printbk-counter');

// 2. Load Environment Configuration
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const envName = process.env.COUNTER_ENV || (app.isPackaged ? 'prod' : 'dev');
const configCandidates = [
  path.resolve(__dirname, `../../config/${envName}.json`),
  path.resolve(__dirname, `../config/${envName}.json`),
  path.resolve(process.resourcesPath || '', `config/${envName}.json`)
];

const releasesOwner = process.env.GITHUB_RELEASES_OWNER || 'Sameer8549';
const releasesRepo = process.env.GITHUB_RELEASES_REPO || 'PrintBK-releases';
const defaultUpdateFeedUrl = `https://github.com/${releasesOwner}/${releasesRepo}/releases/latest/download`;

let appConfig: any = envName === 'prod' ? {
  environment: 'production',
  apiBase: 'https://printbk-60074625517.catalystserverless.in',
  staffAppUrl: 'https://printbk-60074625517.catalystserverless.in/staff/',
  updateFeedUrl: defaultUpdateFeedUrl,
  autoUpdate: true,
  heartbeatIntervalMs: 5000,
  pollIntervalMs: 2000,
  openAtLogin: true
} : {
  environment: 'development',
  apiBase: 'https://printbk-60074625517.development.catalystserverless.in',
  staffAppUrl: 'https://printbk-60074625517.development.catalystserverless.in/staff/',
  updateFeedUrl: defaultUpdateFeedUrl,
  autoUpdate: false,
  heartbeatIntervalMs: 5000,
  pollIntervalMs: 2500,
  openAtLogin: true
};

for (const p of configCandidates) {
  if (fs.existsSync(p)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    } catch (_) {}
  }
}

if (process.env.COUNTER_API_BASE) {
  appConfig.apiBase = process.env.COUNTER_API_BASE;
}
if (process.env.COUNTER_STAFF_URL) {
  appConfig.staffAppUrl = process.env.COUNTER_STAFF_URL;
}

const store = new CounterStore();
let mainWindow: BrowserWindow | null = null;
let wizardWindow: BrowserWindow | null = null;
let healthWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let supervisor: AgentSupervisor | null = null;
let isQuitting = false;
let currentAgentStatus: AgentStatus = 'offline';
let lastDiscoveredPrinters: any[] = [];

// 3. Resolve Bundled SumatraPDF and LibreOffice
const bundledSumatra = (process as any).resourcesPath
  ? path.join((process as any).resourcesPath, 'bin', 'SumatraPDF.exe')
  : path.resolve(__dirname, '../../bin/SumatraPDF.exe');
const resolvedSumatra = findSumatraBinary(fs.existsSync(bundledSumatra) ? bundledSumatra : undefined);
const resolvedConverter = findLibreOfficeBinary();

// 4. Windows Auto-Start Registration
function configureAutoStart(enable: boolean) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false,
      path: process.execPath,
      args: ['--autostart']
    });
  } catch (err) {
    console.warn('[AutoStart] Failed to set login item settings:', err);
  }
}

// 5. System Tray Initialization
function createTray() {
  if (tray) return;

  try {
    const iconCandidates = [
      path.resolve(__dirname, '../../public/tray-icon.png'),
      path.resolve(__dirname, '../public/tray-icon.png'),
      path.resolve(__dirname, '../../public/icon.ico'),
      path.resolve(__dirname, '../public/icon.ico')
    ];

    let img = nativeImage.createEmpty();
    for (const p of iconCandidates) {
      if (fs.existsSync(p)) {
        try {
          const buf = fs.readFileSync(p);
          img = nativeImage.createFromBuffer(buf);
          if (!img.isEmpty()) break;
        } catch (_) {}
      }
    }

    if (img.isEmpty()) {
      // Fallback: 16x16 brand gold icon programmatically encoded
      img = nativeImage.createFromBuffer(Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAUSURBVDhPY/wPBAwUACMYNWDUAEMDAPkOABf1i1k8AAAAAElFTkSuQmCC',
        'base64'
      ));
    }

    tray = new Tray(img);
    updateTrayMenu();

    tray.on('double-click', () => {
      showMainWindow();
    });
  } catch (err) {
    console.warn('[Tray] Failed to initialize system tray:', err);
  }
}

function updateTrayMenu() {
  if (!tray) return;

  const statusLabel =
    currentAgentStatus === 'connected' ? '● Connected' :
    currentAgentStatus === 'printing' ? '● Printing Job…' :
    currentAgentStatus === 'starting' ? '◌ Connecting…' :
    currentAgentStatus === 'error' ? '▲ Error' : '○ Offline';

  tray.setToolTip(`PrintBK Counter — ${statusLabel}`);

  const contextMenu = Menu.buildFromTemplate([
    { label: `PrintBK Counter (${statusLabel})`, enabled: false },
    { type: 'separator' },
    {
      label: 'Open Counter Window',
      click: () => showMainWindow()
    },
    {
      label: 'Test Print (B&W)',
      click: async () => {
        if (supervisor) {
          const ok = await supervisor.sendTestPrint('bw');
          if (ok) {
            tray?.displayBalloon({ title: 'PrintBK Counter', content: 'B&W test page sent to printer queue.' });
          }
        }
      }
    },
    {
      label: 'Test Print (Colour)',
      click: async () => {
        if (supervisor) {
          const ok = await supervisor.sendTestPrint('colour');
          if (ok) {
            tray?.displayBalloon({ title: 'PrintBK Counter', content: 'Colour test page sent to printer queue.' });
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'System Health Check',
      click: () => showHealthWindow()
    },
    {
      label: 'View Logs',
      click: () => {
        if (supervisor) {
          shell.openPath(supervisor.getLogPath());
        }
      }
    },
    {
      label: 'Check for Updates',
      click: () => checkForAppUpdates(true)
    },
    {
      label: `About PrintBK Counter (${app.getVersion()})`,
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'PrintBK Counter',
          message: `PrintBK Counter v${app.getVersion()}`,
          detail: `Environment: ${appConfig.environment}\nAPI Gateway: ${appConfig.apiBase}\nSupervised Agent: Active\nSilent Engine: ${resolvedSumatra ? 'Present' : 'Missing'}\nConverter: ${resolvedConverter ? 'Present' : 'Not installed'}`
        });
      }
    },
    { type: 'separator' },
    {
      label: 'Reset Pairing…',
      click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'warning',
          buttons: ['Cancel', 'Reset Pairing'],
          defaultId: 0,
          title: 'Reset Workstation Pairing?',
          message: 'Resetting pairing disconnects this workstation from the campus store. You will need a new setup code to pair again.'
        });
        if (choice === 1) {
          store.clearPairing();
          supervisor?.stop();
          mainWindow?.close();
          mainWindow = null;
          showWizard();
        }
      }
    },
    {
      label: 'Quit PrintBK Counter',
      click: () => {
        const choice = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Stay Running', 'Quit'],
          defaultId: 0,
          title: 'Quit PrintBK Counter?',
          message: 'Quitting will STOP background printing. Orders will not print while the app is closed.'
        });
        if (choice === 1) {
          isQuitting = true;
          supervisor?.stop();
          app.quit();
        }
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// 6. Navigation and Window Creation
function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const bounds = store.get().windowBounds;

  mainWindow = new BrowserWindow({
    title: 'PrintBK Counter',
    width: bounds?.width || 1280,
    height: bounds?.height || 850,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Identify desktop Counter app via User-Agent token
  const currentUserAgent = mainWindow.webContents.userAgent;
  mainWindow.webContents.setUserAgent(`${currentUserAgent} PrintBKCounter/${app.getVersion()}`);

  if (bounds?.isMaximized !== false) {
    mainWindow.maximize();
  }

  // Save window bounds
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // F11 Fullscreen Toggle
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow?.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      saveWindowBounds();
      mainWindow?.hide();
      tray?.displayBalloon({
        title: 'PrintBK Counter',
        content: 'PrintBK Counter is still running in the system tray. Printing remains active.'
      });
    }
  });

  // Security: restrict navigation to allowed production / development origins
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isAllowed =
      url.startsWith('https://printbk-60074625517.catalystserverless.in') ||
      url.startsWith(appConfig.staffAppUrl) ||
      url.startsWith(appConfig.apiBase) ||
      url.startsWith('file://') ||
      (isDev && (
        url.startsWith('https://printbk-60074625517.development.catalystserverless.in') ||
        url.startsWith('http://localhost:') ||
        url.startsWith('http://127.0.0.1:')
      ));

    if (!isAllowed) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Pre-inject Staff Credentials into Session & Storage
  const creds = store.get();
  if (creds.staffToken) {
    session.defaultSession.cookies.set({
      url: appConfig.staffAppUrl,
      name: 'staff_device_token',
      value: creds.staffToken,
      sameSite: 'strict',
      secure: appConfig.staffAppUrl.startsWith('https')
    }).catch(() => {});

    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (details.url.includes('/server/api/') || details.url.includes('/staff/')) {
        details.requestHeaders['X-Staff-Device-Token'] = creds.staffToken!;
      }
      callback({ requestHeaders: details.requestHeaders });
    });

    mainWindow.webContents.on('dom-ready', () => {
      mainWindow?.webContents.executeJavaScript(`
        try {
          localStorage.setItem('printbk_staff_token', ${JSON.stringify(creds.staffToken)});
          if (${JSON.stringify(creds.staffDeviceId)}) {
            localStorage.setItem('printbk_staff_device_id', ${JSON.stringify(creds.staffDeviceId)});
          }
          localStorage.setItem('printbk-paired', 'true');
        } catch (_) {}
      `).catch(() => {});
    });
  }

  // Load staff app URL with offline fallback
  mainWindow.loadURL(appConfig.staffAppUrl).catch(() => {
    mainWindow?.loadFile(path.resolve(__dirname, '../ui/offline.html'));
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode) => {
    // If not aborted, show offline page
    if (errorCode !== -3) {
      mainWindow?.loadFile(path.resolve(__dirname, '../ui/offline.html'));
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });
}

function saveWindowBounds() {
  if (!mainWindow) return;
  const isMaximized = mainWindow.isMaximized();
  const bounds = mainWindow.getBounds();
  store.set({
    windowBounds: {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized
    }
  });
}

// 7. First-Run Wizard Window
function showWizard() {
  if (wizardWindow) {
    wizardWindow.focus();
    return;
  }

  wizardWindow = new BrowserWindow({
    title: 'PrintBK Counter Setup',
    width: 600,
    height: 720,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  wizardWindow.loadFile(path.resolve(__dirname, '../ui/wizard.html'));

  wizardWindow.on('closed', () => {
    wizardWindow = null;
  });
}

// 8. Health Check Window
function showHealthWindow() {
  if (healthWindow) {
    healthWindow.focus();
    return;
  }

  healthWindow = new BrowserWindow({
    title: 'PrintBK Counter — System Health Check',
    width: 660,
    height: 680,
    resizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.resolve(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  healthWindow.loadFile(path.resolve(__dirname, '../ui/health.html'));

  healthWindow.on('closed', () => {
    healthWindow = null;
  });
}

// 9. Auto-Update Logic
async function checkForAppUpdates(manual = false) {
  try {
    const res = await fetch(`${appConfig.apiBase}/server/api/counter/version`);
    if (res.ok) {
      const data: any = await res.json();
      const currentVer = app.getVersion();
      const latestVer = data.latestVersion || currentVer;

      if (latestVer > currentVer) {
        if (appConfig.autoUpdate) {
          autoUpdater.checkForUpdatesAndNotify();
        } else if (manual) {
          dialog.showMessageBox({
            type: 'info',
            title: 'Update Available',
            message: `A new version of PrintBK Counter is available (v${latestVer}).`,
            detail: data.releaseNotes || 'Automatic background update active.'
          });
        }
      } else if (manual) {
        dialog.showMessageBox({
          type: 'info',
          title: 'PrintBK Counter is Up to Date',
          message: `You are on the latest version (v${currentVer}).`
        });
      }
    }
  } catch (err: any) {
    if (manual) {
      dialog.showErrorBox('Update Check Error', 'Could not connect to update gateway: ' + err.message);
    }
  }
}

// 10. IPC Handlers
ipcMain.on('counter:get-credentials-sync', (event) => {
  event.returnValue = store.get();
});

ipcMain.handle('counter:get-version', () => app.getVersion());
ipcMain.handle('counter:get-agent-status', () => currentAgentStatus);
ipcMain.handle('counter:open-printer-settings', () => {
  shell.openPath('ms-settings:printers');
});
ipcMain.handle('counter:get-printers', async () => {
  try {
    lastDiscoveredPrinters = await discoverPrinters(false);
  } catch (_) {}
  return lastDiscoveredPrinters;
});

ipcMain.handle('counter:test-print', async (_event, role: 'bw' | 'colour') => {
  if (supervisor) {
    const ok = await supervisor.sendTestPrint(role || 'bw');
    return { success: ok, message: ok ? 'Sent to printer queue' : 'Agent offline' };
  }
  return { success: false, message: 'Print supervisor not initialized' };
});

ipcMain.handle('counter:pair', async (_event, { setupCode, label }) => {
  try {
    const res = await fetch(`${appConfig.apiBase}/server/api/counter/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupCode,
        label: label || 'Campus Store Counter PC #1',
        appVersion: app.getVersion(),
        agentVersion: app.getVersion()
      })
    });

    const data: any = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || 'Pairing rejected by server' };
    }

    // Save tokens in encrypted store
    store.set({
      paired: true,
      counterId: data.counterId,
      deviceLabel: data.label,
      staffToken: data.staffCredentials.token,
      staffDeviceId: data.staffCredentials.deviceId,
      agentToken: data.agentCredentials.token,
      agentDeviceId: data.agentCredentials.deviceId
    });

    // Start supervisor with new credentials
    startAgentSupervisor();

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection error' };
  }
});

ipcMain.handle('counter:get-health', async () => {
  let printers = lastDiscoveredPrinters;
  try {
    printers = await discoverPrinters(false);
    lastDiscoveredPrinters = printers;
  } catch (_) {}

  return {
    appVersion: app.getVersion(),
    agentStatus: currentAgentStatus,
    printers,
    sumatraPresent: Boolean(resolvedSumatra),
    converterPresent: Boolean(resolvedConverter),
    converterType: resolvedConverter?.includes('soffice') ? 'LibreOffice' : 'MS Office'
  };
});

ipcMain.handle('counter:repair', async () => {
  configureAutoStart(true);
  supervisor?.restart();
  return { ok: true, message: 'Repaired auto-start registration and restarted supervisor.' };
});

ipcMain.handle('counter:check-update', async () => {
  await checkForAppUpdates(true);
  return { updateAvailable: false };
});

ipcMain.handle('counter:finish-wizard', async (_event, config) => {
  if (config) {
    store.set({
      bwPrinter: config.bwPrinter,
      colourPrinter: config.colourPrinter,
      openAtLogin: config.openAtLogin !== false
    });
    configureAutoStart(config.openAtLogin !== false);
  }
  showMainWindow();
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.close();
  }
  return { ok: true };
});

// 11. Start Supervisor
function startAgentSupervisor() {
  const creds = store.get();
  if (!creds.agentToken) return;

  const workerScript = path.resolve(__dirname, '../agent/worker.js');

  if (supervisor) {
    supervisor.updateCredentials(creds.agentToken, creds.deviceLabel);
    return;
  }

  supervisor = new AgentSupervisor({
    workerScript,
    apiBase: appConfig.apiBase,
    agentToken: creds.agentToken,
    deviceLabel: creds.deviceLabel || 'Shop Counter PC',
    sumatraPath: resolvedSumatra || undefined,
    libreOfficePath: resolvedConverter || undefined,
    dryRun: process.env.DRY_RUN === 'true'
  });

  supervisor.on('status-changed', (newStatus: AgentStatus) => {
    currentAgentStatus = newStatus;
    updateTrayMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:status', newStatus);
    }
  });

  supervisor.on('printers', (printers: any[]) => {
    lastDiscoveredPrinters = printers;
  });

  supervisor.start();
}

// 12. App Lifecycle
app.whenReady().then(async () => {
  createTray();

  const creds = store.get();
  configureAutoStart(creds.openAtLogin !== false);

  if (creds.paired && creds.staffToken && creds.agentToken) {
    startAgentSupervisor();
    showMainWindow();
  } else {
    showWizard();
  }

  // Periodic update check every 2 hours
  setInterval(() => {
    if (currentAgentStatus !== 'printing') {
      checkForAppUpdates(false);
    }
  }, 2 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (store.get().paired) {
      showMainWindow();
    } else {
      showWizard();
    }
  });
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('open-url', (event) => {
  event.preventDefault();
  showMainWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
  supervisor?.stop();
});
