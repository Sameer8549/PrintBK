# PrintBK File Retention & Catalyst Cron Configuration

## Overview

PrintBK implements strict privacy-first file lifecycle guarantees:
1. **Zero Public Access**: Files stored in Catalyst File Store (`print_files` folder) are strictly gated behind staff/agent bearer authentication (`Authorization: Bearer <STAFF_TOKEN>`).
2. **Guaranteed 5-Minute Auto-Deletion**: Once an order reaches `ready` or `completed`, a 5-minute deletion deadline is recorded in `delete_after`.
3. **Immediate Purge Triggers**: Files are immediately and permanently deleted when an order is `cancelled`, `rejected`, `expired`, or when the student clicks **Delete my files now**.

---

## File Retention Lifecycle

```
[Student Uploads] ──► Catalyst File Store (Folder: print_files)
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
Student Cancels         Order Rejected        Order Completed
  or Purges Now            by Counter          or Marked Ready
     │                       │                       │
Immediate Purge         Immediate Purge       delete_after = now + 5 min
     │                       │                       │
     └───────────────────────┴───────────────────────┼───► 5 Minutes Later
                                                     ▼
                                            Catalyst Cron Purges
                                            Files Permanently
```

---

## Step-by-Step Runbook: Setting Up the Catalyst Cron Job

Follow these exact steps in the Zoho Catalyst Console to schedule automated file deletion:

### 1. Open Catalyst Cron
1. Log in to [Zoho Catalyst Console](https://catalyst.zoho.com/).
2. Select the **PrintBK** project.
3. In the left sidebar, expand **Develop** and click **Cron** (or **Job Scheduling**).

### 2. Create the Cleanup Job
1. Click **Create Cron** (or **Add Job**).
2. **Cron Details**:
   - **Cron Name**: `file_cleanup_job`
   - **Description**: `Automated purge for expired print files`
3. **Schedule Type**:
   - Select **Recurring / Periodic**.
   - Frequency: **Every 5 minutes** (Cron expression: `*/5 * * * *`).
   - Time Zone: `Asia/Kolkata` (IST) or `UTC`.
4. **Execution Action**:
   - Select **URL Callback** (HTTP Request).
   - **HTTP Method**: `POST`
   - **Target URL**:
     - Development: `https://printbk-60074625517.development.catalystserverless.in/server/api/cron/cleanup`
     - Production: `https://<production-domain>/server/api/cron/cleanup`
   - **Headers**:
     - Key: `Authorization`
     - Value: `Bearer <STAFF_TOKEN>` (use the exact secret saved in your Environment Variables).
5. Click **Create** and ensure the status is toggled to **Active**.

---

## Manual / On-Demand Execution

Counter staff or maintenance scripts can trigger an immediate retention sweep at any time:

```bash
curl -X POST https://printbk-60074625517.development.catalystserverless.in/server/api/cron/cleanup \
  -H "Authorization: Bearer $STAFF_TOKEN"
```

### Expected Response:
```json
{
  "ok": true,
  "purgedOrdersCount": 4,
  "purgedFilesCount": 7
}
```

---

## Student Immediate Deletion (`POST /orders/:id/delete-files`)

The student ticket provides a "Delete my files now" button. Clicking this triggers:
```bash
curl -X POST https://printbk-60074625517.development.catalystserverless.in/server/api/orders/<ORDER_ID>/delete-files \
  -H "X-Order-Token: <STUDENT_ACCESS_TOKEN>"
```
1. Server validates the student capability token against the stored SHA-256 hash.
2. Server iterates each file in the order and executes `folder.deleteFile(cloudId)` on Catalyst File Store.
3. Server updates `files_deleted_at = now()`.
4. The student ticket transitions to show: `✓ Files permanently deleted`.
