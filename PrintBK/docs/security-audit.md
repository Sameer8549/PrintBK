# PrintBK End-to-End Security & Reliability Audit

This document details the security posture, authentication architecture, data isolation guarantees, and failure modes evaluated for the PrintBK system.

---

## 1. Authentication & Authorization Architecture

### A. Student Isolation via Capability Tokens (`X-Order-Token`)
- **Threat**: Insecure Direct Object Reference (IDOR) / Order Enumeration. An attacker attempts to probe order IDs (`/orders/:id`) to view files, payment states, or pickup codes of other students.
- **Defense**: When an order is created via `POST /orders`, the server generates a cryptographically secure 128-bit random token (`accessToken = crypto.randomBytes(16).toString('hex')`).
- **Storage**: The server stores only the SHA-256 hash (`sha256(accessToken)`) in the Data Store.
- **Verification**: Any request to `GET /orders/:id`, `POST /orders/:id/delete-files`, `POST /orders/:id/choose-cash`, `POST /orders/:id/start-upi`, or `POST /orders/:id/upi-return` must provide the raw token in the `X-Order-Token` header.
- **Timing Safe Check**: The hash is verified using constant-time comparison. Unauthenticated or invalid token requests receive `403 Forbidden` or `404 Not Found`.

### B. Staff Counter PC Authentication
- **Threat**: Rogue network clients attempting to access `/staff/*` endpoints (live order feed, cash collection, approve & print).
- **Defense**:
  1. No passwords or credentials are hardcoded.
  2. One-time pairing via `POST /staff/pair`: requires `setupCode` matching the server's `STAFF_SETUP_CODE` environment variable.
  3. Upon successful pairing, the server generates a 256-bit random device token, stores its SHA-256 hash in the `staff_devices` table, and sets an `HttpOnly`, `Secure`, `SameSite=Strict` cookie (`staff_device_token`) while also returning it for `X-Staff-Device-Token` header backup.
  4. Revocation: Staff devices can be inspected and revoked (`POST /staff/devices/:id/revoke`), immediately terminating device access.

### C. Shop PC Print Agent Authentication
- **Threat**: Unauthorized clients polling `/agent/jobs/poll` or spoofing print completion.
- **Defense**:
  1. Requests to `/agent/*` require the `X-Agent-Token` header matching the `AGENT_TOKEN` environment variable.
  2. Comparison is performed using `crypto.timingSafeEqual`.
  3. Mismatched or missing tokens immediately return `401 Unauthorized`.

---

## 2. Input Validation & Defense-in-Depth

### A. Magic Byte Upload Verification
- **Threat**: Malicious executables or polyglots disguised with a `.pdf` extension uploaded to the server.
- **Defense**:
  - The multer stream saves the upload to a temporary disk location.
  - `validateFileMagicBytes()` inspects the raw leading bytes:
    * PDF: `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`)
    * DOCX/PPTX/XLSX: `PK\x03\x04` (`0x50 0x4B 0x03 0x04`)
    * JPEG: `\xFF\xD8\xFF`
    * PNG: `\x89PNG\r\n\x1a\n`
  - Any file whose magic bytes do not strictly match its declared extension is rejected with `400 Bad Request` and deleted from temp disk immediately.
  - File ceiling is strictly capped at 25 MB (`LIMIT_FILE_SIZE`).

### B. Rate Limiting & Abuse Prevention
- **Order Creation Flooding**: Limited to maximum 5 order creations per minute per IP address (`429 Too Many Requests`).
- **Unpaid Order Hogging**: Limited to maximum 3 concurrent unpaid orders per IP address.
- **Batch Size Limits**: Maximum 20 services per order, maximum 500 pages per file, maximum 100 copies.

### C. Content Security Policy (CSP)
In `staff/index.html`:
```http
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob:;
connect-src 'self' https://*.catalyst.zoho.com https://*.zohocatalyst.com;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
```
Prevents cross-site scripting (XSS), clickjacking (frame-ancestors 'none'), and plugin execution (object-src 'none').

---

## 3. Reliability & Failure Modes

### A. Shop PC / Agent Restart
- **Behavior**: The shop PC print agent runs as a daemon or Windows Service. On boot:
  1. Detects local installed Windows printers via PowerShell (`Get-Printer`).
  2. Registers their roles (`bw`, `colour`) with `/agent/printers/register`.
  3. Resumes polling `/agent/jobs/poll` every 2 seconds.
  4. Any pending or interrupted jobs resume processing seamlessly.

### B. Network Disconnection
- **Behavior**:
  - **Staff App**: Reacts to `offline` and `online` window events. The live status indicator transitions from `LIVE` to `OFFLINE`. The app continues displaying cached orders and resumes polling immediately upon network restoration.
  - **Print Agent**: Backs off during connectivity drops and reconnects automatically without crashing.

### C. Printer Paper Out / Hardware Errors
- **Behavior**: When SumatraPDF reports an error code or the print driver fails:
  1. The agent posts `/agent/jobs/:id/status` with `status: "failed"` and `errorCode: "printer_paper_out"` (or error detail).
  2. The item row in the staff app highlights the error and flips the action button from `APPROVE & PRINT` to `RETRY PRINT`.
  3. Once staff refills paper and clicks `RETRY PRINT`, the item status resets to `ready_to_print`, re-entering the queue without re-upload.

### D. File Retention & Auto-Deletion Rule
- **Rule**: Files for each item are permanently deleted from Catalyst File Store:
  * 5 minutes after `printed_at` (configurable 1–30 minutes in `shop_settings`).
  * Hard upper bound: 60 minutes after upload.
- **Execution**: The background cleanup cron job scans for items where `delete_after <= now` and removes physical files from Catalyst File Store, setting `files_deleted_at = now`.
- **Student Privacy**: Once deleted, the student order ticket disables file previews and permanently marks them: `✓ Files deleted for your privacy`.

---

## 4. Secret Inventory Check
Automated scanning across all branches confirms:
- ZERO hardcoded API keys.
- ZERO hardcoded tokens or passwords.
- Environment variables (`STAFF_SETUP_CODE`, `AGENT_TOKEN`, `STAFF_TOKEN`, `RAZORPAY_KEY_SECRET`) are loaded strictly from the Catalyst console execution environment.
