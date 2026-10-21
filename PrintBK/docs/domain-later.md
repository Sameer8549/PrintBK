# PrintBK — Custom Domain Migration Guide (printbk.tech)

**Status:** Parked for future activation  
**Current Production Host:** Zoho Catalyst Default Production (`https://printbk-60074625517.catalystserverless.in`)  
**Target Custom Domain:** `printbk.tech` (and optionally `counter.printbk.tech`)  
**Reference Prompt:** `printbk-domain-LATER-antigravity-prompt.md`

---

## 1. Architecture: URLs as Pure Configuration

PrintBK is built so that every user-facing, API, and inter-process communication URL is derived strictly from environment configuration. Switching to `printbk.tech` requires **zero code rewrites**.

### Current vs Custom Domain Mapping

| Variable | Default Catalyst Production | Target Custom Domain |
|---|---|---|
| **Student Web App** | `https://printbk-60074625517.catalystserverless.in/` | `https://printbk.tech/` |
| **Staff Counter App** | `https://printbk-60074625517.catalystserverless.in/staff/` | `https://printbk.tech/staff/` (or `https://counter.printbk.tech`) |
| **API Base Gateway** | `https://printbk-60074625517.catalystserverless.in/server/api` | `https://printbk.tech/server/api` |
| **Release Download Base** | `https://github.com/glittercowboy/PrintBK-releases/releases/latest/download` | Same or `https://releases.printbk.tech` |
| **Update Feed URL** | `https://github.com/glittercowboy/PrintBK-releases/releases/latest/download` | Same or `https://releases.printbk.tech` |

---

## 2. Browser Storage & Pairing Invariant

> [!IMPORTANT]
> **Web Storage is strictly partitioned per origin (`protocol + host + port`).**
> Switching the host from `printbk-60074625517.catalystserverless.in` to `printbk.tech` represents a new web origin.

### What Must Be Re-Paired:
1. **Desktop Counter Workstations**:
   - The desktop app connects to `staffAppUrl` specified in `counter-app/config/prod.json`.
   - After updating the URL and installing the new update, staff will be prompted to enter the single `COUNTER_SETUP_CODE` once.
   - The setup code instantly re-pairs both the desktop window and the supervised print agent for the new origin.
2. **Staff Phone/Mobile Browsers**:
   - Phone owners navigating to `https://printbk.tech/staff/` will see the download page with the link *"Owner on a phone? Pair this browser"*.
   - Tap the link, enter the setup code once, and device credentials are stored under the new origin.
3. **Student Devices**:
   - No pairing needed.
   - Any new QR poster printed from the staff app automatically encodes `https://printbk.tech/`, routing student devices seamlessly.

---

## 3. Step-by-Step Custom Domain Activation

### Step 1: Map Domain in Zoho Catalyst Console
1. Navigate to **Zoho Catalyst Console** → Select Project **PrintBK** (`60074625517`).
2. Go to **Web Client Hosting** → **Domains** tab.
3. Click **Add Domain** and enter `printbk.tech`.
4. Catalyst will display the required DNS validation records (CNAME or TXT and A records).
5. In your DNS provider (e.g., Cloudflare, Namecheap, GoDaddy):
   - Add the verification TXT/CNAME record.
   - Add the CNAME or A record pointing `printbk.tech` to Catalyst's serverless edge.
6. Return to Catalyst Console and click **Verify**. Zoho issues the automatic SSL certificate (Let's Encrypt / DigiCert) within 5–15 minutes.

### Step 2: Update Catalyst Environment Variables
In **Catalyst Console** → **Serverless Functions** → `api` → **Environment Variables**:
- Set `ALLOWED_ORIGINS` = `https://printbk.tech,https://counter.printbk.tech`
- Set `STUDENT_APP_URL` = `https://printbk.tech`
- Set `STAFF_APP_URL` = `https://printbk.tech/staff/`

### Step 3: Update Desktop Counter Config
In `PrintBK/counter-app/config/prod.json`:
```json
{
  "environment": "production",
  "apiBase": "https://printbk.tech",
  "staffAppUrl": "https://printbk.tech/staff/",
  "updateFeedUrl": "https://github.com/glittercowboy/PrintBK-releases/releases/latest/download",
  "autoUpdate": true,
  "heartbeatIntervalMs": 5000,
  "pollIntervalMs": 2000,
  "openAtLogin": true
}
```

### Step 4: Rebuild & Deploy
1. Rebuild web clients:
   ```bash
   pnpm --filter printbk-student build
   pnpm --filter printbk-staff build
   pnpm client:sync
   ```
2. Deploy to Catalyst Production:
   ```bash
   catalyst deploy --only client,functions
   ```
3. Release new Counter app update:
   ```bash
   pnpm release:counter
   ```

---

*Refer to `printbk-domain-LATER-antigravity-prompt.md` for complete DNS failover playbooks.*
