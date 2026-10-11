# Zoho Catalyst Production Deployment Runbook

## Overview

This runbook outlines the required human-supervised steps to deploy PrintBK from the current **Development** environment to the **Production** environment on Zoho Catalyst (Org `60074625517`).

> **RULE**: Do not deploy to production autonomously. A qualified human administrator must execute this procedure.

---

## Pre-Deployment Checklist

- [ ] All 10 security audit checks in `scripts/security-check.mjs` pass against Development.
- [ ] End-to-end smoke test in `scripts/smoke-test.mjs` passes.
- [ ] All golden pricing vectors pass (`pnpm --filter @printbk/shared test`).
- [ ] Working branch `fix/security-hardening` is merged into `main`.

---

## Step 1: Production Data Store Schema Setup

In the Zoho Catalyst Console, database schemas do not automatically copy from Development to Production.
1. Log into [Zoho Catalyst Console](https://catalyst.zoho.com/) -> Select **PrintBK**.
2. Switch top-header dropdown from **Development** to **Production**.
3. Navigate to **Data Store** → Tables → Create Table: `orders`.
4. Add the following columns (exact names and types):
   - `order_number` (`Int`, Mandatory: Yes)
   - `access_token_hash` (`VarChar`, Length: 64, Mandatory: Yes)
   - `status` (`VarChar`, Length: 30, Mandatory: Yes)
   - `total` (`Double`, Mandatory: Yes)
   - `quote_pending` (`Boolean`, Mandatory: Yes)
   - `basket` (`VarChar`, Length: 5000, Mandatory: Yes)
   - `file_names` (`VarChar`, Length: 1000, Mandatory: Yes)
   - `delete_after` (`BigInt`, Mandatory: No)
   - `files_deleted_at` (`BigInt`, Mandatory: No)
   - `expires_at` (`BigInt`, Mandatory: No)
   - `confirmed_by` (`VarChar`, Length: 50, Mandatory: No)
   - `confirmed_at` (`BigInt`, Mandatory: No)
   - `razorpay_order_id` (`VarChar`, Length: 100, Mandatory: No)
   - `razorpay_payment_id` (`VarChar`, Length: 100, Mandatory: No)
   - `created_at` (`BigInt`, Mandatory: Yes)
   - `updated_at` (`BigInt`, Mandatory: Yes)

---

## Step 2: Production File Store Folder

1. Still in the **Production** environment, navigate to **File Store**.
2. Create folder: `print_files`.
3. Set Permissions: **Private** (authenticated API access only).

---

## Step 3: Production Environment Variables

1. Navigate to **Cloud Functions** → **Functions** → `api` → **Configuration** → **Environment Variables**.
2. Create the following production variables:
   - `STAFF_TOKEN`: High-entropy 256-bit random hex string.
   - `AGENT_TOKEN`: High-entropy 256-bit random hex string (for print daemon).
   - `ALLOWED_ORIGINS`: Production web client domain(s).
   - `RAZORPAY_KEY_ID`: Production Razorpay Key (`rzp_live_...`).
   - `RAZORPAY_KEY_SECRET`: Production Razorpay Secret.
   - `RAZORPAY_WEBHOOK_SECRET`: Production Webhook Secret.
   - `RAZORPAY_ENABLED`: `true` (or leave unset until live testing is complete).

---

## Step 4: Build & Deploy Command

Run the following commands in your local terminal:

```bash
# 1. Build shared package & sync to function
pnpm --filter @printbk/shared build
node scripts/sync-shared.mjs

# 2. Build student client production bundle
pnpm --filter printbk-student build

# 3. Deploy to Catalyst Production
catalyst deploy --production
```

---

## Step 5: Post-Deployment Smoke Verification

1. Run the security check against the production URL:
   ```bash
   node scripts/security-check.mjs https://<production-domain>/server/api <PRODUCTION_STAFF_TOKEN>
   ```
2. Verify all checks report `PASS`.
3. Configure the production Catalyst Cron job as documented in [docs/catalyst-cron.md](./catalyst-cron.md).
