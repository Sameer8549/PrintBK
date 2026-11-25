# PrintBK Payment Architecture: Direct UPI with UPILerify

## Overview

PrintBK uses a **0% fee direct-to-bank UPI architecture** powered by **UPILerify** (self-hosted open-source UPI verification engine, https://github.com/harshavarma02/upilerify) combined with a cash-at-counter fallback.

### Payment Channels
1. **Direct UPI via UPILerify (Primary)**:
   - Automated order creation with unique micro-paise offsets (e.g., ₹499.03) via `${UPILERIFY_BASE_URL}/api/orders/create`.
   - Dynamic scannable UPI QR code and native `upi://pay` mobile intent links.
   - Bank email credit alerts read over TLS IMAP by UPILerify.
   - Automated HMAC-SHA256 signed webhooks (`POST /api/webhooks/upilerify`) for instant <3 second bank reconciliation.
   - 15-minute countdown payment window.
   - 20-second delayed manual "I Have Paid" fallback modal accepting 12-digit UTR (`^\d{12}$`) with duplicate protection and `UNDER_REVIEW` queue.
2. **Cash at Counter (Fallback)**:
   - Student reserves prints online, pays at the desk upon collection.

---

## Architecture Flow

```
┌──────────────┐             ┌─────────────────┐             ┌────────────────┐
│ Student Web  │──(checkout)─▶│ PrintBK Server  │──(reserve)─▶│   UPILerify    │
│  (/checkout) │             │ (Express/ZCQL)  │             │ (Self-Hosted)  │
└──────────────┘             └─────────────────┘             └────────────────┘
       │                              │                               │
       │ (Scans QR / opens UPI app)   │                               │
       ▼                              │                               │
┌──────────────┐                      │                               │
│ UPI App      │                      │                               │
│ (GPay/PhonePe│──(Pays exact ₹.paise)│                               │
└──────────────┘                      │                               │
       │                              │                               │
       ▼                              │                               │
┌──────────────┐                      │                               │
│ Merchant Bank│──(Credit email)─────┼───────────────────────────────▶
└──────────────┘                      │                          (IMAP match)
                                      ▼                               │
                             ┌─────────────────┐                      │
                             │ POST /webhooks/ ├◀──(HMAC Webhook)─────┘
                             │   upilerify     │
                             └────────┬────────┘
                                      │
                         (Status = PAID / Unlocks print)
                                      │
                                      ▼
                             ┌─────────────────┐
                             │  /order-success │ (Auto-redirect)
                             └─────────────────┘
```

---

## API Endpoints

### 1. `POST /api/checkout/create`
- Initiates or refreshes a UPILerify checkout session.
- Calls UPILerify to generate a unique paise offset and dynamic QR.
- Returns `{ orderId, orderNumber, baseAmount, payableAmount, qrCodeData, upiIntentUrl, merchantUpiId, payeeName, expiresAt, status }`.

### 2. `GET /api/checkout/status/:orderId`
- Polled every 3 seconds by the checkout page.
- Returns current payment status (`PENDING`, `UNDER_REVIEW`, `PAID`, `EXPIRED`).
- Automatically transitions `PENDING` orders to `EXPIRED` if 15 minutes have passed.

### 3. `POST /api/checkout/manual-utr`
- Manual fallback for delayed bank alerts (revealed after 20 seconds).
- Strictly validates 12 numeric digits (`^\d{12}$`).
- Rejects duplicate UTR numbers across all existing orders.
- Marks status `UNDER_REVIEW` and returns redirect to `/order-pending`.

### 4. `POST /api/webhooks/upilerify`
- Receives `payment.verified` events from the UPILerify instance.
- Verifies `X-UPILerify-Signature` HMAC-SHA256 using `UPILERIFY_WEBHOOK_SECRET`.
- Validates paid amount against `payableAmount`.
- Idempotently fulfills order, transitions status to `PAID`, and unlocks print queues.

### 5. `GET /api/admin/orders/under-review` & `POST /api/admin/orders/verify`
- Staff admin portal for reviewing and manually approving or rejecting student-submitted UTRs.
