# PrintBK Data Model & Identifier Architecture

## Overview

PrintBK uses a dual-identifier model combined with cryptographic capability tokens to decouple public identification, queue tracking, and counter fulfillment from security authorization.

---

## Identifier Architecture

| Identifier | Format | Generator | Exposed To | Security Level | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`id`** | UUID v4 | Server | Student & Staff | Unguessable | Primary database key & internal resource routing |
| **`order_number`** | Sequential Int (`#1001`, `#1002`, ...) | Server | Student & Staff | Public | Friendly order reference called at the shop counter |
| **`pickupCode`** | 4-digit PIN (`1000`–`9999`) | Server | Student (post-payment) & Staff | High entropy | Claim code required to collect completed prints |
| **`accessToken`** | 192-bit base64url | Server | Student only (one-time) | Cryptographic capability | Authenticates `GET /orders/:id`, cancellations, and file deletions |

---

## Pickup Code Lifecycle & Collision-Free Guarantee

1. **Server-Generated Only**:
   - The client is prohibited from choosing or influencing the pickup code. Any `pickupCode` sent in `POST /orders` is ignored.
2. **Collision-Free Active Space**:
   - The generator queries active orders (`pending_payment`, `pending_cash`, `processing`, `printing`, `ready`) to collect currently allocated codes.
   - It generates a cryptographically random 4-digit integer (`crypto.randomInt(1000, 10000)`).
   - If a collision with an active job is detected, it draws a new code up to 50 iterations, with an automatic 5-digit fallback if the 4-digit namespace is saturated.
3. **Information Disclosure Prevention**:
   - While an order is in pre-processing states (`pending_cash`, `pending_payment`, `waiting_quote`), the pickup code is **withheld from the student**.
   - `GET /orders/:id` and `POST /orders` return `pickupCode: null`. The ticket displays `——` and directs the student: *"Show order #1042 at counter to pay ₹XX and start printing"*.
   - Once the order transitions to `processing` (verified payment or counter approval), the pickup code is revealed.

---

## Database Schema (`orders` Table)

The `orders` table in Zoho Catalyst Data Store contains the following columns:

| Column Name | Data Type | Mandatory | Unique | Purpose |
| :--- | :--- | :---: | :---: | :--- |
| `id` | VarChar(50) | Yes | Yes | Primary order UUID |
| `order_number` | Int | Yes | No | Sequential human-friendly reference (starts at 1001) |
| `access_token_hash` | VarChar(64) | Yes | No | SHA-256 hash of the 192-bit capability token |
| `status` | VarChar(30) | Yes | No | Order lifecycle state machine value |
| `total` | Double | Yes | No | Server-calculated authoritative price (INR) |
| `quote_pending` | Boolean | Yes | No | Indicates presence of custom unpriced service requests |
| `basket` | VarChar(5000) | Yes | No | JSON payload (files, settings, services, audit events) |
| `file_names` | VarChar(1000) | Yes | No | JSON array of original file names |
| `delete_after` | BigInt | No | No | Epoch seconds when files must be permanently purged |
| `files_deleted_at` | BigInt | No | No | Epoch seconds when files were purged from File Store |
| `expires_at` | BigInt | No | No | Epoch seconds after which unpaid reservations expire |
| `confirmed_by` | VarChar(50) | No | No | Actor confirming payment (`'staff'`, `'razorpay'`) |
| `confirmed_at` | BigInt | No | No | Epoch seconds of payment confirmation |
| `razorpay_order_id`| VarChar(100) | No | No | Razorpay order ID (`order_...`) |
| `razorpay_payment_id` | VarChar(100) | No | No | Razorpay captured payment ID (`pay_...`) |
| `created_at` | BigInt | Yes | No | Creation timestamp (epoch seconds) |
| `updated_at` | BigInt | Yes | No | Last modification timestamp (epoch seconds) |

---

## Order State Machine Definitions

```
                     ┌──────────────────┐
                     │   waiting_quote  │
                     └─────────┬────────┘
                               │ quote sent & accepted
                               ▼
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              ▼
[pending_payment]                              [pending_cash]
        │ (Razorpay capture)                           │ (Staff approve-cash)
        └──────────────────────┬───────────────────────┘
                               ▼
                          [processing]
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

### Terminal / Abortive States:
- **`cancelled`**: Can be triggered by the student before processing, or by staff at any active stage. Automatically purges uploaded files immediately.
- **`rejected`**: Triggered by staff if files are corrupt or inappropriate. Automatically purges uploaded files immediately.
- **`expired`**: Triggered automatically if reservation is not approved within the timeout window (2 hours default). Automatically purges uploaded files.
- **`failed`**: Triggered if printer hardware error or payment processing failure occurs.
