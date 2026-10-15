# PrintBK File Retention & Catalyst Cron Configuration

## Overview

PrintBK implements strict privacy-first file lifecycle guarantees:
1. **Zero Public Access**: Files stored in Catalyst File Store (`print_files` folder) are strictly gated behind staff/agent authentication.
2. **5-Minute Auto-Deletion Window**: Once an order item reaches `printed`, a 5-minute deletion deadline is calculated and stored in `delete_after` (`printed_at + 300 seconds`).
3. **Immediate Purge Triggers**: Files are immediately and permanently deleted when an order is `cancelled`, `rejected`, `expired`, or when the student invokes `POST /orders/:id/delete-files`.
4. **Hard 60-Minute Ceiling**: Regardless of print state, any file uploaded more than 60 minutes ago (`created_at <= now - 3600`) is unconditionally purged to prevent orphaned file accumulation.

---

## The 5-Minute Catalyst Cron Constraint & Lazy Purge Engine

### 1. Catalyst Cron Schedule Interval Limit
Zoho Catalyst Cron has a minimum execution interval of **5 minutes** (`*/5 * * * *`). The Catalyst console scheduler does not allow 1-minute cron expressions.

### 2. Worst-Case 10-Minute Retention Without Lazy Deletion
Under a pure 5-minute cron architecture:
- Suppose a print job completes at $T = 00:00$, scheduling deletion for $T = 00:05$.
- If the Catalyst cron scheduler triggers at $T = 00:04:59$, the file is not yet 5 minutes past print and is skipped.
- The next cron cycle executes at $T = 00:09:59$.
- Consequently, without additional mechanisms, printed files could remain in storage for **up to 10 minutes** after printing.

```
T = 00:00        T = 04:59             T = 05:00            T = 09:59
   │                 │                     │                    │
Printed         Cron Run #1            Scheduled            Cron Run #2
(delete_after   (Skipped:              Deletion             (Purged: ~10m after print)
 = T + 5m)       not expired yet)       Deadline
```

### 3. Real-Time Solution: Dual Purge Architecture (Cron + Lazy Purge Engine)
To guarantee that files are deleted within **~5 minutes** (5 minutes + ~2 seconds) without relying solely on the 5-minute cron boundary:

1. **Per-Item Lazy Deletion Engine (`purgeExpiredFiles`)**:
   - The staff counter app polls `GET /staff/live` every **1.5 to 2 seconds**.
   - The shop PC print agent polls `GET /agent/jobs/poll` every **2 seconds**.
   - On every such poll request, the backend executes `purgeExpiredFiles(catalystApp, zcql, filestore)`:
     - Scans items and orders where `delete_after <= now` and `files_deleted_at IS NULL`.
     - Deletes the underlying cloud files from Catalyst File Store (`folder.deleteFile(cloudId)`).
     - Marks `files_deleted_at = now` in ZCQL Data Store and memory.
   - **Result**: Files are permanently destroyed within **2 seconds of reaching the 5-minute mark**.

2. **Catalyst Scheduler Fallback**:
   - Outside operating hours (when no staff terminal or agent is polling), the 5-minute cron job calls `POST /server/api/cron/cleanup-files` with `CRON_SECRET`.
   - Cleans up any remaining files, expired orders, or items exceeding the 60-minute ceiling.

---

## Step-by-Step Runbook: Catalyst Console Setup

Follow these exact steps in the Zoho Catalyst Console to configure the 5-minute recurring cron and security secret:

### Step 1: Add `CRON_SECRET` Environment Variable
1. Log in to [Zoho Catalyst Console](https://catalyst.zoho.com/).
2. Select your project: **PrintBK**.
3. In the left navigation menu under **Serverless**, click **Functions**.
4. Click on the function named **`api`**.
5. In the top navigation bar, select **Configuration**.
6. Scroll down to the **Environment Variables** section.
7. Select Environment: **Development** (repeat for **Production** when ready to deploy).
8. Click **Add Variable** (or **+**):
   - **Key**: `CRON_SECRET`
   - **Value**: Generate a high-entropy secret (e.g., 64-character hex string generated with `openssl rand -hex 32`).
9. Click **Save** at the bottom right of the page.

### Step 2: Create the 5-Minute Recurring Cron Job
1. In the left navigation menu under **Develop**, click **Cron**.
2. Click the **Create Cron** (or **Add Job**) button in the top right.
3. Fill in the **Basic Details**:
   - **Cron Name**: `printbk_file_cleanup`
   - **Description**: `Automated 5-minute purge for expired print files`
4. Set the **Schedule Type**:
   - Select **Recurring**.
   - Frequency: Select **Minutes** or **Cron Expression**.
   - Interval: **Every 5 Minutes** (Cron expression: `*/5 * * * *`).
   - Time Zone: `Asia/Kolkata` (IST) or `UTC`.
5. Configure the **Execution Action**:
   - Action Type: **URL Callback** (HTTP Request).
   - **HTTP Method**: `POST`
   - **Target URL**:
     - Development: `https://printbk-60074625517.development.catalystserverless.in/server/api/cron/cleanup-files`
     - Production: `https://<production-domain>/server/api/cron/cleanup-files`
   - **Headers**:
     - Header Name: `X-Cron-Secret`
     - Header Value: Enter the identical value assigned to `CRON_SECRET` in Step 1.
6. Click **Create**.
7. In the Cron dashboard, ensure the toggle switch for `printbk_file_cleanup` is set to **Active**.

---

## Endpoint Security & Authentication

The endpoint `POST /server/api/cron/cleanup-files` (and alias `/server/api/cron/cleanup`) enforces strict timing-safe comparison:

- **Missing Secret**: Returns `401 Unauthorized`:
  ```json
  { "error": "Unauthorized: valid cron secret required" }
  ```
- **Invalid Secret**: Returns `401 Unauthorized` using `crypto.timingSafeEqual`.
- **Valid Secret**: Returns `200 OK`:
  ```json
  {
    "ok": true,
    "purgedOrdersCount": 2,
    "purgedFilesCount": 3
  }
  ```

Supported Secret Transmission Headers:
- `X-Cron-Secret: <secret>`
- `CRON_SECRET: <secret>`
- `Authorization: Bearer <secret>`

---

## Empirical Verification

The security and deletion behavior is verified via the automated test suite `scripts/e2e-live.mjs`:
- Unauthenticated requests: Verified rejection (HTTP 401).
- Tampered secret: Verified rejection (HTTP 401).
- Valid secret: Verified successful purge execution (HTTP 200).
- Lazy deletion: Verified file purge upon polling.
