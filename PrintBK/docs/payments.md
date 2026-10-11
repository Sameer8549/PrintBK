# PrintBK Payment Architecture & Integration Runbook

## Overview

PrintBK supports two authoritative payment channels:
1. **Cash at Counter** (Default, Active): Students reserve the order with server-generated order numbers (e.g., `#1042`), show their ticket at the desk, pay cash, and counter staff approves the job to trigger printing.
2. **Razorpay Online Payments** (Fully Coded, Dormant): UPI, debit/credit cards, and netbanking powered by Razorpay Orders API and server-side HMAC-SHA256 signature verification. Operates in dormant mode when API keys are absent, keeping the application in clean cash-only operation.

> **CRITICAL SECURITY DECISION**:
> All manual student "I've paid" claim flows and direct unverified UPI QR claims have been permanently removed. Direct invocation of `POST /orders/:id/pay` returns `410 Gone`. An order can **only** enter the `processing` state through:
> - Verified Razorpay capture (`POST /orders/:id/verify-payment` or webhook), or
> - Authenticated staff cash approval (`POST /orders/:id/approve-cash` with `STAFF_TOKEN`).

---

## Order State Machine & Payment Transitions

```
                    ┌─────────────────────────┐
                    │      Order Created      │
                    └────────────┬────────────┘
                                 │
             ┌───────────────────┴───────────────────┐
             ▼                                       ▼
    [pending_payment]                          [pending_cash]
    (Online checkout)                          (Cash at counter)
             │                                       │
   HMAC-verified Razorpay                     Staff Cash Approval
    Signature & Capture                      POST /approve-cash
             │                               (Bearer STAFF_TOKEN)
             └───────────────────┬───────────────────┘
                                 ▼
                          [processing] (Queued for Print)
                                 │
                                 ▼
                            [printing]
                                 │
                                 ▼
                              [ready]
                                 │
                                 ▼
                            [completed]
```

### Invalid / Abortive Transitions:
- `pending_payment` -> `cancelled` (Student with order capability token) or `expired` (Timeout)
- `pending_cash` -> `cancelled` (Student with order capability token) or `expired` (Timeout)
- `processing` / `printing` -> `rejected` (Staff counter with reason, immediately purges files)

---

## Dormant Mode Operation

When `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are not configured in Catalyst Environment Variables:
1. `GET /config` returns:
   ```json
   {
     "paymentMethods": {
       "cash": true,
       "razorpay": false
     }
   }
   ```
2. The student web client inspects `paymentMethods` and renders **only** the "💵 Cash at counter" option. No broken QR codes, no dormant payment buttons.
3. If an attacker attempts to POST to `/orders/:id/razorpay` or `/orders/:id/verify-payment`, the server responds with HTTP 400:
   ```json
   {
     "error": "Online payments are currently disabled. Please pay with Cash at the counter.",
     "enabled": false
   }
   ```

---

## Step-by-Step Runbook: Activating Razorpay

When you are ready to activate Razorpay in Development (or Production), follow these exact steps:

### 1. Obtain Razorpay API Keys
1. Log into your [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Settings** → **API Keys**.
3. Generate **Key ID** and **Key Secret** (choose *Test Mode* for staging or *Live Mode* for production).

### 2. Configure Catalyst Environment Variables
1. Open the [Zoho Catalyst Console](https://catalyst.zoho.com/).
2. Select your project: **PrintBK** (Org `60074625517`).
3. In the left navigation, click **Cloud Functions** → **Functions** → Select `api`.
4. Click the **Configuration** tab → **Environment Variables**.
5. Click **Add Environment Variable** and create the following keys:
   - `RAZORPAY_KEY_ID`: Your Key ID (e.g., `rzp_test_...` or `rzp_live_...`).
   - `RAZORPAY_KEY_SECRET`: Your Key Secret.
   - `RAZORPAY_WEBHOOK_SECRET`: A high-entropy random string (e.g., generate with `openssl rand -hex 24`).
   - `RAZORPAY_ENABLED`: `true`
6. Select Target Environment: **Development** (and later **Production**).
7. Click **Save**.

### 3. Configure Razorpay Webhooks
1. In your Razorpay Dashboard, navigate to **Settings** → **Webhooks**.
2. Click **Add New Webhook**.
3. Webhook URL:
   - Development: `https://printbk-60074625517.development.catalystserverless.in/server/api/webhooks/razorpay`
   - Production: `https://<production-domain>/server/api/webhooks/razorpay`
4. Secret: Enter the exact same string configured in `RAZORPAY_WEBHOOK_SECRET`.
5. Active Events to subscribe:
   - `payment.captured`
   - `payment.failed`
6. Click **Save Webhook**.

---

## Verification & Testing

Once enabled, verify the payment flow:
1. `GET /config`: Verify `paymentMethods.razorpay` is now `true`.
2. Student app: Navigate to `/checkout` — both "Cash at counter" and "Online Payment (Razorpay)" will be visible.
3. Test Orders:
   - Place a test payment using Razorpay Test UPI / Card tokens (`success@razorpay`).
   - Verify `POST /orders/:id/verify-payment` validates the HMAC signature, confirms amount, and transitions the order to `processing`.
   - Verify the student ticket automatically reveals the 4-digit pickup code upon reaching `processing`.
