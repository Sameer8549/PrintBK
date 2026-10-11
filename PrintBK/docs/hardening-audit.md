# PrintBK Security Hardening Audit & Failing Baseline (Phase 0)

> **Audit Date:** October 11, 2026  
> **Environment:** Zoho Catalyst Development Environment (`60074625517`)  
> **Base URL:** `https://printbk-60074625517.development.catalystserverless.in/server/api`  
> **Baseline Test Execution:** `node scripts/security-check.mjs`

---

## 1. Executive Summary

This security audit documents the current attack surface of PrintBK prior to the execution of the security hardening plan. A comprehensive regression test suite (`scripts/security-check.mjs`) was created and executed against the live development backend, revealing **8 critical failures out of 10 security checks**.

---

## 2. Automated Baseline Security Results

```
╔════════════════════════════════════════════════════════════════╗
║       PrintBK Automated Security Baseline & Audit Suite        ║
╚════════════════════════════════════════════════════════════════╝
Target Base URL: https://printbk-60074625517.development.catalystserverless.in/server/api
Staff Token:     [NONE]
----------------------------------------------------------------

[ FAIL ] 1. Unauthenticated GET /orders is rejected (401/403)
         Detail: Returned 200 OK (Exposed 8 orders to public internet!)
[ FAIL ] 2. Unauthenticated POST /orders/:id/status is rejected (401/403)
         Detail: Returned 200 (Unauthenticated status manipulation allowed!)
[ FAIL ] 3. POST /orders/:id/pay by student cannot move order to processing
         Detail: Returned 200 and moved order to "processing" without payment verification!
[ FAIL ] 4. GET /orders/:id requires order access token and rejects others
         Detail: Exposed order data without token (HTTP 200) or with wrong token (HTTP 200)
[ FAIL ] 5. Client cannot choose its own pickupCode
         Detail: Server accepted client-specified pickupCode "7777"! Must be server-generated.
[ FAIL ] 6. Online-payment returns clear "not enabled" response when keys absent
         Detail: Endpoint does not exist yet (404)
[ PASS ] 7. Upload validation rejects disallowed types and mismatched content
         Detail: Both rejected
[ FAIL ] 8. Unauthenticated file download by cloudId is rejected (401/403)
         Detail: Returned 404 (Missing authentication gate on file access)
[ PASS ] 9. CORS rejects unknown Origin
         Detail: Header: [absent]
[ FAIL ] 10. Rate limits trigger after repeated requests (429)
         Detail: No 429 triggered across 40 rapid requests; rate limiting middleware is missing

════════════════════════════════════════════════════════════════
Summary: 2 PASSED, 8 FAILED out of 10 checks
════════════════════════════════════════════════════════════════
```

---

## 3. Comprehensive Endpoint Inventory & Vulnerability Analysis

### 3.1 `GET /orders` (Staff Order Queue)
- **Who can call it today:** Anyone on the public internet. No authentication header or token checked.
- **Data exposed:** Array of all student orders, including internal UUIDs, document file names, order totals, quote statuses, timestamps, and active pickup codes.
- **Vulnerability Level:** **CRITICAL**. Total privacy breach of all campus print files and pickup codes.
- **Remediation Plan (Phase 1):** Restrict strictly to `STAFF_TOKEN` bearer authorization. Reject unauthenticated access with `401 Unauthorized`.

### 3.2 `POST /orders/:id/status` (Order Status Progression)
- **Who can call it today:** Anyone with an order UUID. Unauthenticated.
- **Data exposed / Action allowed:** Allows an arbitrary caller to update status to any string (e.g. `printing`, `ready`, `completed`).
- **Vulnerability Level:** **CRITICAL**. Malicious actor can hijack or prematurely close printing queues.
- **Remediation Plan (Phase 1 & 2):** Require `STAFF_TOKEN` auth, validate transitions against the formal server state machine, and log every event in `order_events`.

### 3.3 `POST /orders/:id/pay` (Payment Transition Bypass)
- **Who can call it today:** Any student or unauthenticated client.
- **Vulnerability Level:** **CRITICAL**. Bypasses payment completely by running `UPDATE orders SET status = 'processing'` without verifying any transaction.
- **Remediation Plan (Phase 2):** Remove or disable endpoint (`410 Gone`). Transition to `processing` must ONLY occur via server-verified Razorpay HMAC-SHA256 capture or staff cash approval.

### 3.4 `GET /orders/:id` (Order Tracking)
- **Who can call it today:** Anyone who knows or guesses the UUID.
- **Data exposed:** Complete order breakdown, file list, total, and pickup code.
- **Vulnerability Level:** **HIGH**.
- **Remediation Plan (Phase 1):** Issue a cryptographically random 128-bit access token upon order creation (`POST /orders`). Require `X-Order-Token` header. Verify against SHA-256 hash stored in database. Reject requests lacking valid token with `401/403`.

### 3.5 `POST /orders` (Order Creation)
- **Who can call it today:** Public (student).
- **Vulnerability Level:** **HIGH**.
  - Client can choose its own `pickupCode` (e.g., `req.body.pickupCode = '7777'`).
  - No rate limiting against denial-of-wallet / DB flood.
  - Duplicated pricing logic in `functions/api/index.js` diverging from `packages/shared/src/pricing.ts`.
- **Remediation Plan (Phase 1, 3 & 5):** Ignore client `pickupCode`. Generate 4-digit code cryptographically on server, unique among active orders. Bundle single shared pricing engine.

### 3.6 `POST /upload` (File Ingestion)
- **Who can call it today:** Public (student).
- **Vulnerability Level:** **HIGH**.
  - Uploads check MIME type string from client header, without magic-byte verification.
  - Uploaded files in Catalyst File Store `print_files` are never auto-deleted.
  - No quota per IP or tracking unattached file lifetimes.
- **Remediation Plan (Phase 4):** Verify magic bytes against allowlist. Enforce 25MB limit. Schedule auto-delete cron after order completion.

### 3.7 File Download by `cloudId`
- **Who can call it today:** Missing explicit authenticated download gate.
- **Vulnerability Level:** **HIGH**. File downloads must not be publicly accessible.
- **Remediation Plan (Phase 1 & 4):** Provide `GET /staff/files/:cloudId` protected by `STAFF_TOKEN` (or short-lived time-bound signed URLs).

### 3.8 CORS & Rate Limiting
- **Who can call it today:** Missing rate limiting on all endpoints (burst of 40 calls passed with 0 throttle).
- **Vulnerability Level:** **MEDIUM**. Susceptible to scraping and brute force.
- **Remediation Plan (Phase 1):** Implement rate limiter via Catalyst Cache segment or in-memory bucket with IP and token lockouts. Return 429 Too Many Requests.

---

## 4. Hard-Coded Values & Secrets Identified

1. `functions/api/index.js`:
   - Hardcoded origin array: `['https://printbk-60074625517.development.catalystserverless.in', 'http://localhost:5173']`.
   - Hardcoded shop rates in `defaultShopConfig`.
2. `student/src/features/checkout/Checkout.tsx`:
   - Hardcoded UPI ID: `hkbkstudentpoint@upi`.
   - Hardcoded Shop Name: `HKBK Student Point`.
3. `catalyst.json` & scripts:
   - Project ID / Org ID `60074625517`.
4. Git secrets scan:
   - Confirmed no live API keys or private credentials are in repo history.

---

## 5. Next Steps

With Phase 0 complete and the failing baseline captured, proceed sequentially to **Phase 1: Authentication and Authorization**.
