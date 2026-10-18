# PrintBK Authentication & Authorization Architecture

> **Document Version:** 2.0 (Real-Time End-to-End Hardening)  
> **Status:** Active & Implemented  
> **Audience:** Backend Engineers, Security Reviewers, Counter App Developers, System Administrators

---

## 1. Threat Model & Operational Actors

PrintBK implements zero-trust separation of privileges across three operational actors:

| Actor | Identification Method | Capabilities & Permissions |
| :--- | :--- | :--- |
| **Student** | Anonymous + Per-order 192-bit cryptographic capability token (`X-Order-Token`) | Can upload files, configure layout, place orders, claim UPI transfers, view live receipts, and trigger immediate deletion of their own print files. Cannot inspect or alter other orders. |
| **Staff Counter Terminal** | One-time paired 256-bit revocable device token (`X-Staff-Device-Token` / `staff_device_token` cookie) | Operates the counter queue: collect cash, approve prints, physical services DONE, send typing quotes, reject orders with 5-second UNDO window, manage shop settings, and revoke devices. |
| **Shop PC Print Agent** | One-time paired 256-bit revocable device token (`X-Agent-Device-Token`) | Local Windows print service running on shop hardware. Polls approved jobs, downloads original files, dispatches silent print jobs to physical printers (SumatraPDF/winspool), and reports live progress and hardware alerts. |

---

## 2. One-Time Device Pairing & Credential Lifecycle

PrintBK avoids hardcoded shared tokens across multi-device setups by using ephemeral setup codes exchanged for revocable, cryptographically unique device credentials.

```
       Counter PC / Print Agent                      Catalyst Backend
                  │                                         │
                  │   1. POST /staff/pair                   │
                  │      { setupCode, label }               │
                  ├────────────────────────────────────────►│
                  │                                         │ Check SHA-256(setupCode)
                  │                                         │ Generate 256-bit random token
                  │                                         │ Store token_hash in DB
                  │   2. 200 OK                             │
                  │      { deviceId, token, label }         │
                  │◄────────────────────────────────────────┤
                  │                                         │
  Save token in   │   3. Subsequent Requests                │
  localStorage /  │      X-Staff-Device-Token: <token>      │
  agent-config    ├────────────────────────────────────────►│ Validate hash in staff_devices
                  │                                         │ Check revoked === false
```

### 2.0 Unified Counter PC Pairing (`POST /server/api/counter/pair`) — Recommended for Windows Installer
1. On initial install of the **PrintBK Counter** desktop application, the first-run wizard prompts for a single **Setup Code**.
2. The user types the `COUNTER_SETUP_CODE` (at least 24 hex characters, configured in Catalyst environment variables).
3. The server validates the code with constant-time comparison, enforces single-use expiration (default 24h or single-use redemption) and anti-brute-force rate limiting (5 failed attempts locks IP for 15 minutes).
4. On success, the server simultaneously issues **both credentials**:
   - `staffCredentials`: `{ deviceId, token }` for the staff counter webview (`staff_devices`).
   - `agentCredentials`: `{ deviceId, token }` for the background print agent (`agent_devices`).
5. A unified workstation record is registered in `paired_counters`:
   - `id`: Unique PC UUID.
   - `label`: Workstation name (e.g. "Counter PC #1").
   - `staff_device_id` & `agent_device_id`: Linked device entries.
   - `app_version` & `agent_version`: Installed desktop application and agent version tags.
6. The desktop app securely stores the agent token in `%APPDATA%\PrintBK\agent-config.json` (DPAPI protected) and injects the staff token into the staff counter browser profile, launching straight onto the Orders page forever.
7. **Per-PC Revocation**: Revoking a PC via `POST /server/api/staff/counters/:id/revoke` immediately invalidates **both** credentials, shutting off both the UI and background printing.

### 2.1 Developer Staff Terminal Pairing (`POST /server/api/staff/pair`)
1. On initial boot, the staff web app displays a one-time pairing screen if running in a standalone browser.
2. The shop manager enters the `STAFF_SETUP_CODE` (configured in Catalyst environment variables).
3. The server validates the code in constant time, generates a 256-bit cryptographic token (`crypto.randomBytes(32).toString('hex')`), hashes it with SHA-256, and saves the record in `staff_devices`:
   - `id`: Unique UUID.
   - `label`: Human-readable identifier (e.g. "Counter Terminal 1").
   - `token_hash`: `SHA-256(deviceToken)`.
   - `created_at` / `last_seen_at`: Epoch timestamps.
   - `revoked`: `false`.
4. The plain token is sent back to the terminal and stored locally.

### 2.2 Developer Print Agent Pairing (`POST /server/api/agent/pair`)
1. On standalone developer install, the agent CLI runs `printbk-agent pair --code <AGENT_SETUP_CODE> --label "Counter PC 1"`.
2. The server generates a unique 256-bit token, hashes it, and stores it in `agent_devices`.
3. The plain token is stored locally on the shop PC in `agent-config.json` (chmod 600 / NTFS ACL restricted to current user).

---

## 3. Staff Device Token Storage in the Browser

### 3.1 Where the Token is Stored
In the staff counter web application, the token is saved in the browser's persistent key-value store:
```javascript
localStorage.setItem('printbk_staff_device_token', deviceToken);
localStorage.setItem('printbk_staff_device_id', deviceId);
```
On every API request, the counter frontend transmits the token via the `X-Staff-Device-Token` header. In addition, when running on unified root domains, the backend sets an `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`staff_device_token`).

### 3.2 Security Rationale & Threat Mitigation

| Risk / Threat | Mitigation Strategy |
| :--- | :--- |
| **XSS Token Extraction** | The staff counter application is an internal, zero-dependency, self-contained single-page application. It renders no user-supplied HTML (`dangerouslySetInnerHTML` is prohibited) and loads no third-party CDNs, advertising scripts, or trackers. Strict Content Security Policy (`default-src 'self'`) prevents arbitrary script execution. |
| **Token Theft / Stolen Device** | The token is **NOT** a master administrator secret. The server never stores the raw token—only its SHA-256 hash. If a terminal tablet or laptop is lost or compromised, the shop owner can instantly revoke the device via `POST /staff/devices/:id/revoke` from any other terminal. The backend immediately invalidates the hash and returns `403 Forbidden` on subsequent requests. |
| **Cross-Origin / Cookie Partitioning** | In serverless multi-tenant hosting (e.g., Catalyst domains where the UI is served on one hostname and Advanced I/O functions on `/server/api`), cross-site cookies are frequently blocked by modern browser privacy features (Safari ITP, Chrome Privacy Sandbox, third-party cookie phase-out). Header-based bearer authentication via `localStorage` provides robust, deterministic connectivity across mobile kiosks and desktops without cookie delivery failures. |

---

## 4. Device Revocation & Rotation Procedures

### 4.1 Immediate Revocation
To sever access for a compromised or retired staff terminal or print agent:
1. **Via Staff UI**: Navigate to **Settings** → **Devices** → Locate device → Tap **Revoke Access**.
2. **Via REST API**:
   ```bash
   # Revoke a staff terminal
   curl -X POST https://<domain>/server/api/staff/devices/<DEVICE_ID>/revoke \
     -H "X-Staff-Device-Token: <CALLER_STAFF_TOKEN>"

   # Revoke a print agent
   curl -X POST https://<domain>/server/api/staff/agent-devices/<AGENT_DEVICE_ID>/revoke \
     -H "X-Staff-Device-Token: <CALLER_STAFF_TOKEN>"
   ```
3. The server immediately sets `revoked = true` in the Data Store and flushes the in-memory device cache. The revoked device receives `403 Forbidden` on its next poll cycle.

### 4.2 Setup Code Rotation
To prevent unauthorized device registration after initial setup:
1. Log into the Zoho Catalyst Console.
2. Navigate to **Serverless** → **Functions** → **`api`** → **Configuration** → **Environment Variables**.
3. Update `STAFF_SETUP_CODE` and `AGENT_SETUP_CODE` to new high-entropy strings or leave blank to disable new pairings entirely.
4. Existing paired devices remain connected because their credentials are bound to hashed records in `staff_devices` / `agent_devices`.

---

## 5. Git & Secret Hygiene Guarantee

1. **Zero Hardcoded Secrets**: All setup codes, master tokens, and encryption keys are supplied exclusively via environment variables (`process.env`).
2. **Git Ignore Protections**:
   - `.env`, `.env.*`, `*.agent-token`, `agent-config.json`, and local credential files are permanently ignored in both root `.gitignore` and `PrintBK/.gitignore`.
   - Verified via `git status` and `git ls-files`—no credentials or configuration secrets have ever been committed to the repository.
3. **Automated CI Validation**: `scripts/no-mock-data.mjs` scans all source files and production bundles to ensure no dummy credentials, fake tokens, or simulated states are shipped.
