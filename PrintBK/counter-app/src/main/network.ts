import { app, BrowserWindow, ipcMain, net, session, shell } from 'electron';
import crypto from 'crypto';
import path from 'path';

export type NetworkCategory =
  | 'OK'
  | 'CAPTIVE_PORTAL'
  | 'SSL_INTERCEPT'
  | 'PROXY_ERROR'
  | 'PROXY_AUTH'
  | 'DNS_ERROR'
  | 'TIMEOUT'
  | 'PORT_BLOCKED'
  | 'OFFLINE'
  | 'UNKNOWN';

export interface NetworkDiagnostic {
  timestamp: string;
  ok: boolean;
  code: string;
  numericCode?: number;
  category: NetworkCategory;
  badge: string;
  title: string;
  message: string;
  actionHint: string;
  url?: string;
  proxyInfo?: string;
  certIssuer?: string;
  certSubject?: string;
  portWarning?: string;
  latencyMs?: number;
}

const NON_STANDARD_PORTS = new Set(['3000', '5000', '8080', '8000', '8443', '27017', '5432', '3306', '6379']);

let lastDiagnostic: NetworkDiagnostic = {
  timestamp: new Date().toISOString(),
  ok: true,
  code: 'OK',
  category: 'OK',
  badge: 'CONNECTED',
  title: 'Network Connection Healthy',
  message: 'Using Chromium system proxy & dual-stack resolver over HTTPS port 443.',
  actionHint: ''
};

const pendingProxyPrompts = new Map<string, {
  resolve: (creds: { username: string; password: string } | null) => void;
  win: BrowserWindow;
}>();

const cachedProxyCreds = new Map<string, { username: string; password: string; cachedAt: number }>();
const activePromptByHost = new Map<string, Promise<{ username: string; password: string } | null>>();
let diagnosticsIpcRegistered = false;

/**
 * Inspects a backend/service URL and flags plaintext HTTP or blocked non-standard ports
 * (e.g. :3000, :5000, :8080, 27017, 5432) that institutional Ethernet firewalls routinely drop.
 */
export function validateStandardHttpsPort(targetUrl?: string): string | undefined {
  if (!targetUrl) return undefined;
  try {
    const parsed = new URL(targetUrl);
    const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';
    if (isLocal) return undefined;

    if (parsed.protocol !== 'https:') {
      return `Insecure protocol "${parsed.protocol}" detected on ${parsed.host}. Institutional firewalls block non-HTTPS traffic; route through standard HTTPS port 443.`;
    }
    if (parsed.port && parsed.port !== '443') {
      const tag = NON_STANDARD_PORTS.has(parsed.port) ? 'known restricted port' : 'non-standard port';
      return `Non-standard port :${parsed.port} (${tag}) detected on ${parsed.hostname}. Campus firewalls typically allow outbound TCP 443 only; proxy this service behind HTTPS port 443.`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function getLastNetworkDiagnostic(): NetworkDiagnostic {
  return { ...lastDiagnostic };
}

export function recordNetworkDiagnostic(diag: NetworkDiagnostic, targetWindow?: BrowserWindow | null): void {
  lastDiagnostic = diag;
  if (targetWindow && !targetWindow.isDestroyed()) {
    try {
      targetWindow.webContents.send('network:diagnostic', diag);
    } catch (_) {}
  }
}

export async function resolveSystemProxyLabel(targetUrl: string): Promise<string> {
  try {
    const resolved = await session.defaultSession.resolveProxy(targetUrl);
    return resolved || 'DIRECT';
  } catch {
    return 'SYSTEM';
  }
}

export function classifyNetworkError(
  rawError: string | number,
  url?: string,
  extra?: { numericCode?: number; certIssuer?: string; certSubject?: string; proxyInfo?: string }
): NetworkDiagnostic {
  const errStr = String(rawError || 'UNKNOWN_ERROR');
  const upper = errStr.toUpperCase();
  const numCode = extra?.numericCode;
  const portWarning = validateStandardHttpsPort(url);
  const timestamp = new Date().toISOString();

  // Extract explicit Chromium ERR_* token if embedded in error message
  const errTokenMatch = upper.match(/ERR_[A-Z0-9_]+/);
  const normalizedCode = errTokenMatch ? errTokenMatch[0] : (numCode ? `NET_ERR_${numCode}` : errStr.slice(0, 48));

  if (
    upper.includes('ERR_PROXY_CONNECTION_FAILED') ||
    upper.includes('ERR_TUNNEL_CONNECTION_FAILED') ||
    upper.includes('ERR_MANDATORY_PROXY_CONFIGURATION_FAILED') ||
    upper.includes('ERR_PROXY_CERTIFICATE_INVALID') ||
    numCode === -130 || numCode === -111 || numCode === -127 || numCode === -136
  ) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_PROXY_CONNECTION_FAILED',
      numericCode: numCode,
      category: 'PROXY_ERROR',
      badge: 'PROXY CONNECTION ERROR',
      title: 'Institutional Proxy Unreachable or Blocked',
      message: 'PrintBK Counter detected a system/PAC proxy on this LAN, but could not establish a tunnel through it.',
      actionHint: 'Verify Windows Proxy / PAC settings (Settings > Network & Internet > Proxy). Confirm campus IT allows HTTPS CONNECT tunneling to *.catalystserverless.in on port 443.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  if (upper.includes('ERR_PROXY_AUTH') || upper.includes('407')) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_PROXY_AUTH_REQUESTED',
      numericCode: numCode,
      category: 'PROXY_AUTH',
      badge: 'PROXY AUTHENTICATION REQUIRED',
      title: 'Proxy Credentials Required',
      message: 'Your campus/corporate Ethernet proxy requested authentication before forwarding HTTPS traffic.',
      actionHint: 'Click Retry and enter your campus/corporate proxy username and password when prompted.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  if (
    upper.includes('ERR_CERT_') ||
    upper.includes('ERR_SSL_') ||
    upper.includes('SELF_SIGNED') ||
    upper.includes('UNABLE_TO_VERIFY') ||
    (typeof numCode === 'number' && numCode <= -200 && numCode >= -218)
  ) {
    const issuerText = extra?.certIssuer || 'Unknown Authority';
    const isCaptiveOrFirewall = /sophos|fortinet|fortigate|cyberoam|palo|zscaler|cisco|aruba|mikrotik|captive|portal|watchguard|barracuda|sonicwall/i.test(issuerText);
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_CERT_AUTHORITY_INVALID',
      numericCode: numCode,
      category: isCaptiveOrFirewall ? 'SSL_INTERCEPT' : 'CAPTIVE_PORTAL',
      badge: isCaptiveOrFirewall ? 'FIREWALL SSL INSPECTION' : 'CAPTIVE PORTAL / SSL ERROR',
      title: isCaptiveOrFirewall
        ? 'Campus Firewall SSL Certificate Untrusted'
        : 'Captive Portal Login or Untrusted Certificate',
      message: isCaptiveOrFirewall
        ? `An institutional firewall (${issuerText}) intercepted the HTTPS connection using a root CA not trusted by Windows.`
        : 'The Ethernet/Wi-Fi connection intercepted HTTPS traffic—usually because a campus captive portal login is pending or a firewall root CA is missing.',
      actionHint: '1) Click "Open Captive Portal Login in Browser" to verify if campus Wi-Fi/Ethernet login is required. 2) If behind Sophos/Fortinet/Cyberoam SSL inspection, ask IT to install the firewall Root CA into Windows Trusted Root Certification Authorities.',
      url,
      proxyInfo: extra?.proxyInfo,
      certIssuer: extra?.certIssuer,
      certSubject: extra?.certSubject,
      portWarning
    };
  }

  if (
    upper.includes('ERR_NAME_NOT_RESOLVED') ||
    upper.includes('ENOTFOUND') ||
    upper.includes('EAI_AGAIN') ||
    upper.includes('ERR_DNS_') ||
    numCode === -105
  ) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_NAME_NOT_RESOLVED',
      numericCode: numCode,
      category: 'DNS_ERROR',
      badge: 'DNS RESOLUTION FAILED',
      title: 'Campus DNS Could Not Resolve Gateway',
      message: 'The local network DNS resolver failed to translate the PrintBK server domain name.',
      actionHint: 'Check Ethernet cable / DHCP assignment and Windows DNS settings. If external DoH is blocked, verify internal campus DNS can resolve *.catalystserverless.in.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  if (
    upper.includes('ERR_CONNECTION_REFUSED') ||
    upper.includes('ERR_CONNECTION_RESET') ||
    upper.includes('ECONNREFUSED') ||
    upper.includes('ECONNRESET') ||
    numCode === -102 || numCode === -101
  ) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_CONNECTION_REFUSED',
      numericCode: numCode,
      category: 'PORT_BLOCKED',
      badge: 'FIREWALL / PORT BLOCKED',
      title: 'Connection Blocked or Reset by Network',
      message: portWarning || 'The remote endpoint or campus firewall actively refused or reset the TCP connection.',
      actionHint: portWarning
        ? portWarning
        : 'Verify you are logged into the campus network portal and outbound HTTPS (port 443) to *.catalystserverless.in is permitted.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  if (
    upper.includes('ERR_CONNECTION_TIMED_OUT') ||
    upper.includes('ERR_TIMED_OUT') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('TIMED OUT') ||
    upper.includes('ABORT') ||
    numCode === -118 || numCode === -7
  ) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_CONNECTION_TIMED_OUT',
      numericCode: numCode,
      category: 'TIMEOUT',
      badge: 'CONNECTION TIMED OUT',
      title: 'Campus Firewall Drop or Captive Portal Pending',
      message: 'The request timed out without a response. On restricted Ethernet LANs, this commonly happens when a firewall drops packets or a web portal login is required.',
      actionHint: portWarning || '1) Check if an Ethernet/campus captive portal login is open in your browser. 2) Check Windows Proxy settings if your institution requires a proxy/PAC file. 3) Ensure outbound TCP 443 is permitted.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  if (
    upper.includes('ERR_INTERNET_DISCONNECTED') ||
    upper.includes('ERR_NETWORK_CHANGED') ||
    numCode === -106 || numCode === -21
  ) {
    return {
      timestamp,
      ok: false,
      code: errTokenMatch?.[0] || 'ERR_INTERNET_DISCONNECTED',
      numericCode: numCode,
      category: 'OFFLINE',
      badge: 'NETWORK DISCONNECTED',
      title: 'Ethernet / Internet Link Down',
      message: 'Windows reports no active network route to the gateway.',
      actionHint: 'Check the Ethernet cable, Wi-Fi adapter, or institutional VLAN link.',
      url,
      proxyInfo: extra?.proxyInfo,
      portWarning
    };
  }

  return {
    timestamp,
    ok: false,
    code: normalizedCode,
    numericCode: numCode,
    category: 'UNKNOWN',
    badge: 'NETWORK ERROR',
    title: 'Unable to Reach PrintBK Cloud Gateway',
    message: `Network request failed (${errStr}).`,
    actionHint: portWarning || 'Check your Ethernet proxy configuration, campus portal sign-in, and HTTPS (port 443) connectivity.',
    url,
    proxyInfo: extra?.proxyInfo,
    portWarning
  };
}

/**
 * Step 1 (Pre-ready): Apply Chromium command-line switches for automatic WPAD/PAC proxy detection.
 * Deliberately avoids --disable-ipv6, --host-resolver-rules, and ipv4first hacks so IPv6/NAT64 and CDN TLS SNI work cleanly.
 */
export function configureLanNetworkingBeforeReady(): void {
  app.commandLine.appendSwitch('proxy-auto-detect');
}

/**
 * Step 2 (Post-ready): Configure Chromium's host resolver & system proxy settings.
 * - enableBuiltInResolver + secureDnsMode: 'automatic' uses encrypted DNS when reachable and cleanly falls back to LAN DNS.
 * - setProxy({ mode: 'system' }) honors Windows WinINet/PAC/institutional proxy policies.
 */
export async function configureLanNetworkingWhenReady(): Promise<void> {
  try {
    app.configureHostResolver({
      enableBuiltInResolver: true,
      secureDnsMode: 'automatic'
    });
    console.log('[Network] Configured Chromium host resolver (built-in resolver + automatic DoH fallback to LAN DNS)');
  } catch (err: any) {
    console.warn('[Network] configureHostResolver warning:', err?.message || err);
  }

  try {
    await session.defaultSession.setProxy({ mode: 'system' });
    console.log('[Network] Session proxy mode set to system (Windows OS proxy & PAC)');
  } catch (err: any) {
    console.warn('[Network] setProxy(system) warning:', err?.message || err);
  }
}

/**
 * Prompt the user cleanly when an institutional proxy requires authentication.
 */
async function promptForProxyCredentials(authInfo: Electron.AuthInfo): Promise<{ username: string; password: string } | null> {
  const hostKey = `${authInfo.host}:${authInfo.port}:${authInfo.realm || ''}`;
  const inFlight = activePromptByHost.get(hostKey);
  if (inFlight) {
    return inFlight;
  }

  const promptPromise = new Promise<{ username: string; password: string } | null>((resolve) => {
    const requestId = crypto.randomBytes(8).toString('hex');
    const uiCandidates = [
      path.resolve(__dirname, '../ui/proxy-auth.html'),
      path.resolve(__dirname, '../../src/ui/proxy-auth.html')
    ];
    const uiPath = uiCandidates.find((p) => {
      try {
        return require('fs').existsSync(p);
      } catch {
        return false;
      }
    }) || uiCandidates[0];

    const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const promptWin = new BrowserWindow({
      width: 440,
      height: 410,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modal: Boolean(parent),
      parent: parent || undefined,
      autoHideMenuBar: true,
      title: 'Proxy Authentication — PrintBK Counter',
      backgroundColor: '#f7f4ee',
      webPreferences: {
        preload: path.resolve(__dirname, '../preload/preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    pendingProxyPrompts.set(requestId, { resolve, win: promptWin });

    promptWin.loadFile(uiPath, {
      query: {
        requestId,
        host: authInfo.host || '',
        port: String(authInfo.port || ''),
        scheme: authInfo.scheme || 'http',
        realm: authInfo.realm || ''
      }
    }).catch(() => {
      pendingProxyPrompts.delete(requestId);
      resolve(null);
    });

    promptWin.on('closed', () => {
      const pending = pendingProxyPrompts.get(requestId);
      if (pending) {
        pendingProxyPrompts.delete(requestId);
        pending.resolve(null);
      }
    });
  }).finally(() => {
    activePromptByHost.delete(hostKey);
  });

  activePromptByHost.set(hostKey, promptPromise);
  return promptPromise;
}

/**
 * Registers Chromium-wide network handlers:
 * - app.on('login') for institutional proxy authentication (authInfo.isProxy)
 * - app.on('certificate-error') for diagnostics on campus SSL inspection or captive portals
 * - IPC endpoints for UI diagnostics, connectivity probe, captive portal, and proxy auth modal
 */
export function registerNetworkHandlers(getApiBase: () => string, getMainWindow: () => BrowserWindow | null): void {
  if (!diagnosticsIpcRegistered) {
    diagnosticsIpcRegistered = true;

    ipcMain.handle('counter:proxy-auth-submit', (_event, payload: { requestId: string; username: string; password: string }) => {
      const entry = pendingProxyPrompts.get(payload?.requestId);
      if (entry) {
        pendingProxyPrompts.delete(payload.requestId);
        entry.resolve({ username: payload.username, password: payload.password });
        if (!entry.win.isDestroyed()) entry.win.close();
      }
    });

    ipcMain.handle('counter:proxy-auth-cancel', (_event, payload: { requestId: string }) => {
      const entry = pendingProxyPrompts.get(payload?.requestId);
      if (entry) {
        pendingProxyPrompts.delete(payload.requestId);
        entry.resolve(null);
        if (!entry.win.isDestroyed()) entry.win.close();
      }
    });

    ipcMain.handle('counter:get-network-diagnostics', async () => {
      const apiBase = getApiBase();
      const proxyInfo = await resolveSystemProxyLabel(apiBase);
      return {
        ...lastDiagnostic,
        proxyInfo: lastDiagnostic.proxyInfo || proxyInfo,
        portWarning: lastDiagnostic.portWarning || validateStandardHttpsPort(apiBase)
      };
    });

    ipcMain.handle('counter:open-captive-portal', async () => {
      await shell.openExternal('http://detectportal.firefox.com/success.txt');
      return { ok: true };
    });

    ipcMain.handle('counter:open-network-settings', async () => {
      await shell.openExternal('ms-settings:network-proxy');
    });

    ipcMain.handle('counter:test-connectivity', async (_event, targetUrl?: string) => {
      const base = (targetUrl || getApiBase()).replace(/\/+$/, '');
      const probeUrl = `${base}/server/api/counter/version`;
      const proxyInfo = await resolveSystemProxyLabel(probeUrl);
      const portWarning = validateStandardHttpsPort(base);
      const start = Date.now();
      try {
        const res = await robustFetch(probeUrl, { method: 'GET', timeoutMs: 8000 });
        const latencyMs = Date.now() - start;
        const diag: NetworkDiagnostic = {
          timestamp: new Date().toISOString(),
          ok: res.ok || res.status < 500,
          code: `HTTP_${res.status}`,
          category: 'OK',
          badge: 'CONNECTED',
          title: 'Campus LAN Connectivity Verified',
          message: `Successfully reached ${base} over HTTPS in ${latencyMs}ms.`,
          actionHint: portWarning || '',
          url: probeUrl,
          proxyInfo,
          portWarning,
          latencyMs
        };
        recordNetworkDiagnostic(diag, getMainWindow());
        return diag;
      } catch (err: any) {
        const diag = classifyNetworkError(err?.message || err?.code || String(err), probeUrl, { proxyInfo });
        diag.latencyMs = Date.now() - start;
        recordNetworkDiagnostic(diag, getMainWindow());
        return diag;
      }
    });
  }

  // Handle corporate/campus proxy authentication prompts (Sophos, Fortinet, Squid, Cyberoam)
  app.on('login', async (event, _webContents, details, authInfo, callback) => {
    if (!authInfo?.isProxy) {
      return;
    }
    event.preventDefault();

    const hostKey = `${authInfo.host}:${authInfo.port}:${authInfo.realm || ''}`;
    console.warn(`[Network] Proxy auth requested for ${authInfo.scheme}://${authInfo.host}:${authInfo.port} (realm="${authInfo.realm || ''}", url=${details?.url || 'n/a'})`);

    const portWarning = validateStandardHttpsPort(details?.url);
    recordNetworkDiagnostic(
      classifyNetworkError('ERR_PROXY_AUTH_REQUESTED', details?.url || getApiBase(), {
        proxyInfo: `${authInfo.scheme.toUpperCase()} ${authInfo.host}:${authInfo.port}`,
        ...(portWarning ? {} : {})
      }),
      getMainWindow()
    );

    // Use short-lived in-memory credentials if fresh and not already rejected for this host
    const cached = cachedProxyCreds.get(hostKey);
    if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      // Remove before trying so a rejected retry prompts again instead of infinite looping
      cachedProxyCreds.delete(hostKey);
      callback(cached.username, cached.password);
      return;
    }

    const creds = await promptForProxyCredentials(authInfo);
    if (creds && creds.username) {
      cachedProxyCreds.set(hostKey, { ...creds, cachedAt: Date.now() });
      callback(creds.username, creds.password);
    } else {
      callback();
    }
  });

  // Log exact Chromium certificate errors (e.g. campus firewall SSL MITM or captive portal hijack)
  app.on('certificate-error', async (_event, _webContents, url, error, certificate, callback) => {
    const proxyInfo = await resolveSystemProxyLabel(url);
    console.error(
      `[Network] certificate-error: code=${error} url=${url} issuer="${certificate?.issuerName || 'unknown'}" subject="${certificate?.subjectName || 'unknown'}" proxy="${proxyInfo}"`
    );
    const diag = classifyNetworkError(error || 'ERR_CERT_AUTHORITY_INVALID', url, {
      certIssuer: certificate?.issuerName,
      certSubject: certificate?.subjectName,
      proxyInfo
    });
    recordNetworkDiagnostic(diag, getMainWindow());
    // Maintain strict TLS verification — do not blindly bypass invalid certificates
    callback(false);
  });
}

/**
 * Attaches Chromium did-fail-load diagnostics to a BrowserWindow.
 */
export function attachWindowLoadDiagnostics(
  win: BrowserWindow,
  onExhaustedMainFrameLoad?: (diag: NetworkDiagnostic) => void
): void {
  let retryAttempt = 0;

  win.webContents.on('did-finish-load', () => {
    const currentUrl = win.webContents.getURL();
    if (currentUrl && currentUrl.startsWith('http')) {
      retryAttempt = 0;
    }
  });

  win.webContents.on('did-fail-load', async (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // Always ignore -3 (ERR_ABORTED during rapid navigation)
    if (errorCode === -3) return;

    const proxyInfo = validatedURL && validatedURL.startsWith('http')
      ? await resolveSystemProxyLabel(validatedURL)
      : 'LOCAL';

    console.error(
      `[Network] did-fail-load: isMainFrame=${isMainFrame} errorCode=${errorCode} errorDescription=${errorDescription} url=${validatedURL} proxy="${proxyInfo}"`
    );

    if (!isMainFrame || !validatedURL || validatedURL.startsWith('file://')) {
      return;
    }

    const diag = classifyNetworkError(errorDescription || errorCode, validatedURL, {
      numericCode: errorCode,
      proxyInfo
    });
    recordNetworkDiagnostic(diag, win);

    // Retry transient blips once; if persistent (or cert/proxy error), present actionable diagnostics UI
    const skipRetry = diag.category === 'SSL_INTERCEPT' || diag.category === 'CAPTIVE_PORTAL' || diag.category === 'PROXY_AUTH';
    if (!skipRetry && retryAttempt < 1) {
      retryAttempt++;
      setTimeout(() => {
        if (!win.isDestroyed()) {
          const currentUrl = win.webContents.getURL();
          if (currentUrl && currentUrl.startsWith('http')) {
            console.log(`[Network] Retrying main frame reload after ${diag.code}...`);
            win.webContents.reload();
          } else {
            onExhaustedMainFrameLoad?.(diag);
          }
        }
      }, 2500);
    } else {
      retryAttempt = 0;
      onExhaustedMainFrameLoad?.(diag);
    }
  });
}

/**
 * Standardized main-process HTTP(S) client built exclusively on Chromium's `net.fetch`.
 * Automatically inherits Windows system proxy settings, PAC scripts, app.on('login') proxy auth,
 * Windows root certificate trust store, automatic DoH/LAN DNS resolution, and Happy Eyeballs RFC 8305.
 */
export async function robustFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
  timeoutMs = 15000
): Promise<Response> {
  const portWarning = validateStandardHttpsPort(url);
  if (portWarning) {
    console.warn(`[Network] ${portWarning}`);
  }

  const effectiveTimeout = options.timeoutMs ?? timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`ERR_CONNECTION_TIMED_OUT (${effectiveTimeout}ms)`));
  }, effectiveTimeout);

  try {
    const { timeoutMs: _ignored, ...fetchInit } = options;
    const res = await net.fetch(url, {
      ...fetchInit,
      signal: controller.signal
    });
    return res;
  } catch (netErr: any) {
    const proxyInfo = await resolveSystemProxyLabel(url);
    const diag = classifyNetworkError(netErr?.message || netErr?.code || String(netErr), url, { proxyInfo });
    recordNetworkDiagnostic(diag);
    console.error(`[Network] net.fetch failed: code=${diag.code} category=${diag.category} url=${url} proxy="${proxyInfo}" detail="${netErr?.message || netErr}"`);
    throw netErr;
  } finally {
    clearTimeout(timer);
  }
}
