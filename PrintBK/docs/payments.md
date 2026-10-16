# PrintBK Payment Architecture & Integration Runbook

## Overview

PrintBK supports three authoritative payment channels:
1. **Cash at Counter** (Default, Active): Students place order, show ticket at the counter, pay cash, and counter staff approves the job (`cash_due` → `cash_collected`).
2. **Direct UPI with Automated Return Detection** (Active): Students launch their installed UPI app via universal UPI deep link or scan the dynamic UPI QR. Return from the UPI app is detected automatically with zero manual "I've paid" buttons, transitioning to `upi_claimed` and confirmed receipt with staff verification.
3. **Razorpay Online Payments** (Fully Coded, Dormant): UPI, cards, and netbanking powered by Razorpay Orders API and server-side HMAC-SHA256 signature verification. Operates in dormant mode when API keys are absent.

---

## Direct UPI Flow & Automated Return Detection (P7 & Fix 1)

### 1. Elimination of "I've Paid" Button
There is NO "I've paid" button or manual payment claim card anywhere in the DOM. Payment claims are triggered automatically through strict lifecycle return detection.

### 2. Return Detection & False-Return Guard
When the student taps **"Pay with UPI"**, the client records `launchTimestamp = Date.now()` and opens the `upi://pay` deep link. Return to the web app is listened on `visibilitychange`, `focus`, and `pageshow`.
- **False-Return Guard (< 2 seconds hidden)**:
  If the page was hidden for less than 2,000 milliseconds (e.g., student immediately cancelled the OS app-chooser or the device lacked a UPI app), the return is flagged as a false return. The client will **NOT** redirect. Instead, it displays a friendly amber notice:
  *"UPI App Didn't Open — If your UPI app didn't open automatically, try again or use the QR code."* with explicit actions: **Try Again** and **Show QR Code**.
- **Valid Return (>= 2 seconds hidden and <= 15 minutes)**:
  If the page was hidden for $\ge 2$ seconds and returned within 15 minutes, it is recognized as a valid return from the banking app. The client automatically:
  1. Issues `POST /orders/:id/upi-return` with the order's capability token and persistent `X-Device-Id`.
  2. Updates local order state to `upi_claimed`.
  3. Immediately redirects to `/receipt/:orderId` with zero extra taps.
- **Expiration (> 15 minutes)**:
  Returns occurring more than 15 minutes after launching UPI are ignored.
- **Desktop Dynamic QR**:
  On desktop browsers, dynamic UPI QR is displayed. After the QR has been visible for 20 seconds, returning to or refocusing the tab triggers the same automated claim and zero-tap redirect.

### 3. Per-Device Abuse Limiting
To prevent rogue devices from spamming fake UPI claims on campus networks:
- The student client generates and persists a UUID `printbk_device_id` in `localStorage` sent as `X-Device-Id`.
- The backend enforces a strict limit: **maximum 3 unapproved UPI claims per device**.
- Unapproved claims expire automatically when the order expires (`delete_after` or 30 minutes after creation) or when approved by staff, unblocking quota.

### 4. Confirmed Receipt Progression
Upon automated redirect to `/receipt/:orderId`:
- **Headline**: Explicitly reads **"Order confirmed"** along with `#<orderNumber>` and order ID.
- **Truthful Payment Line**:
  - Initially: `"Payment: waiting for the shop to verify"`
  - Once approved by staff: `"Payment verified"`
  - During printing: `"Printing"`
  - Ready for pickup: `"Printed, show code ####"`
  - Cleaned up: `"Files deleted at HH:MM"`
- **"Pay again" Link**: Stays visible until staff verifies payment, enabling students to re-launch UPI or switch to cash if their payment didn't go through.
- **Optional UPI Reference**: A non-blocking input for the last 4 digits of the UPI transaction/UTR reference (`"Saved for counter"`), helping counter staff match bank notifications during rush hours.

### 5. Staff Counter Badge
Immediately upon `POST /orders/:id/upi-return`, the staff counter live feed renders a prominent badge:
**"UPI PAID, VERIFY"**
Counter staff verifies their bank notification/soundbox, then taps **"Approve & Print"**, transitioning the order to `processing` / `printing` and `payment_status` to `paid_verified`.

---

## Canonical Server-Authoritative `payment_status` (Fix 2)

All endpoints returning order objects (`GET /orders/:id`, `GET /orders`, `GET /staff/live`, `GET /staff/history`, `POST /orders`) compute and return the single authoritative `payment_status`:

| `payment_status` | Condition / State | Student History Label & Badge | Staff App Badge |
|---|---|---|---|
| `cash_due` | Cash order before shop collection | `"Pay ₹XX.XX at the counter"` (Amber) | CASH DUE |
| `cash_collected` | Cash order approved by counter staff | `"Paid in cash"` (Green) | CASH COLLECTED |
| `upi_claimed` | Student returned from UPI app, pending staff check | `"UPI payment waiting for the shop to verify"` (Amber) | **UPI PAID, VERIFY** |
| `paid_verified` | Staff approved UPI claim OR Razorpay signature verified | `"Payment verified"` (Green) | PAID VERIFIED |
| `not_paid` | Order cancelled, rejected, or expired without payment | `"Not paid (cancelled)"` (Red) | NOT PAID |
| `refunded` | Order refunded | `"Refunded"` (Purple) | REFUNDED |
| `unpaid` | Fallback initial state before method selection | `"Unpaid"` (Neutral) | UNPAID |

### History Screen Rules:
1. **Independent Dual Chips**: Every order in Student History displays two distinct, non-overlapping chips:
   - **Chip 1 (Order Lifecycle)**: `Order Placed` | `Printing` | `Ready` | `Completed` | `Cancelled`
   - **Chip 2 (Payment Status)**: Truthful badge derived **only** from `payment_status`.
2. A printed or completed order **never** displays "payment not received yet".
3. Student History mounts with automatic status polling for active orders to reflect staff approvals in real time.

---

## Order State Machine & Payment Transitions

```
                    ┌─────────────────────────┐
                    │      Order Created      │
                    └────────────┬────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     [pending_payment]    [pending_cash]      [upi_started]
     (Online checkout)   (Cash at counter)   (UPI app launched)
              │                  │                  │
    HMAC-verified Razorpay       │           Auto Return Guard (>= 2s)
     Signature & Capture         │                  │
              │                  │                  ▼
              │                  │           [upi_claimed]
              │                  │      (Staff badge: UPI PAID, VERIFY)
              │                  │                  │
              │          Staff Cash Approval  Staff UPI Approval
              │          POST /approve-cash   POST /approve-cash
              │                  │                  │
              └──────────────────┼──────────────────┘
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
- `pending_payment` / `pending_cash` / `upi_started` / `upi_claimed` → `cancelled` (Student token) or `expired` (Timeout) → `payment_status: not_paid`.
- `processing` / `printing` → `rejected` (Staff counter with reason) → `payment_status: not_paid`.

---

## Dormant Mode Operation (Razorpay)

When `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are not configured in Catalyst Environment Variables:
1. `GET /config` returns `paymentMethods: { cash: true, upi: true, razorpay: false }`.
2. The student web client renders direct UPI and Cash at counter. No dormant gateway buttons.
3. If an attacker attempts to POST to `/orders/:id/razorpay`, the server responds with HTTP 400.

---

## Step-by-Step Runbook: Activating Razorpay

When you are ready to activate Razorpay in Development (or Production), follow these exact steps:

### 1. Obtain Razorpay API Keys
1. Log into your [Razorpay Dashboard](https://dashboard.razorpay.com/).
2. Navigate to **Settings** → **API Keys**.
3. Generate **Key ID** and **Key Secret**.

### 2. Configure Catalyst Environment Variables
1. Open the [Zoho Catalyst Console](https://catalyst.zoho.com/).
2. Select your project: **PrintBK** (Org `60074625517`).
3. In the left navigation, click **Cloud Functions** → **Functions** → Select `api`.
4. Click the **Configuration** tab → **Environment Variables**.
5. Click **Add Environment Variable** and create the following keys:
   - `RAZORPAY_KEY_ID`: Your Key ID.
   - `RAZORPAY_KEY_SECRET`: Your Key Secret.
   - `RAZORPAY_WEBHOOK_SECRET`: A high-entropy random string.
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
