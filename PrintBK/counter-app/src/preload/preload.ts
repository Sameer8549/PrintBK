import { contextBridge, ipcRenderer } from 'electron';

// Synchronously sync credentials to localStorage before web page scripts execute
try {
  const creds = ipcRenderer.sendSync('counter:get-credentials-sync');
  if (creds && creds.staffToken) {
    window.localStorage.setItem('printbk_staff_token', creds.staffToken);
    if (creds.staffDeviceId) {
      window.localStorage.setItem('printbk_staff_device_id', creds.staffDeviceId);
    }
    window.localStorage.setItem('printbk-paired', 'true');
  }
} catch (_) {}

// Minimal, whitelisted IPC interface exposed to the renderer
contextBridge.exposeInMainWorld('printbkCounter', {
  isCounterApp: true,
  version: '1.0.0',
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('counter:get-version'),
  getAgentStatus: (): Promise<string> => ipcRenderer.invoke('counter:get-agent-status'),
  getDiscoveredPrinters: (): Promise<any[]> => ipcRenderer.invoke('counter:get-printers'),
  openWindowsPrinterSettings: (): Promise<void> => ipcRenderer.invoke('counter:open-printer-settings'),
  triggerTestPrint: (role: 'bw' | 'colour'): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('counter:test-print', role),
  pairWorkstation: (setupCode: string, label?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('counter:pair', { setupCode, label }),
  getHealth: (): Promise<any> => ipcRenderer.invoke('counter:get-health'),
  repairInstallation: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('counter:repair'),
  checkForUpdates: (): Promise<{ updateAvailable: boolean; version?: string }> =>
    ipcRenderer.invoke('counter:check-update'),
  finishWizard: (config: any): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('counter:finish-wizard', config),
  getStaffTokenSync: (): string | null => {
    try {
      return ipcRenderer.sendSync('counter:get-credentials-sync')?.staffToken || null;
    } catch {
      return null;
    }
  },
  onAgentStatusChange: (callback: (status: string) => void) => {
    const handler = (_event: any, status: string) => callback(status);
    ipcRenderer.on('agent:status', handler);
    return () => ipcRenderer.removeListener('agent:status', handler);
  }
});
