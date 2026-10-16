# PrintBK REST API Specification

## Authentication Models

1. **Student Access**: Anonymous order capability tokens (`X-Order-Token: <token>`). Generated on `POST /orders` and stored in client `localStorage`. Requests also send `X-Device-Id: <uuid>`.
2. **Staff Access**: Bearer authentication header (`Authorization: Bearer <STAFF_TOKEN>`) or custom header (`x-staff-token: <STAFF_TOKEN>`). Secret configured in Catalyst environment variables.
3. **Agent Access**: Reserved for local print daemon (`Authorization: Bearer <AGENT_TOKEN>`).

---

## 1. Student / Public Endpoints

### `GET /health`
- **Auth**: None
- **Response**: `200 OK`
  ```json
  { "status": "ok" }
  ```

### `GET /config`
- **Auth**: None
- **Response**: `200 OK`
  ```json
  {
    "rates": { "bw": 1.5, "color": 8.0, "scan": 5, "photocopy": 1.5, "bulkTierThreshold": 100 },
    "rushEnabled": false,
    "maxFileMB": 25,
    "autoDeleteDelay": 5,
    "paymentMethods": { "cash": true, "upi": true, "razorpay": false }
  }
  ```

### `GET /shop/status`
- **Auth**: None
- **Response**: `200 OK`
  ```json
  { "open": true, "queueLength": 3, "estimatedWaitMinutes": 6 }
  ```

### `POST /upload`
- **Auth**: None (Firewalled by MIME + Magic byte validation)
- **Content-Type**: `multipart/form-data` (Field: `file`, max 25MB)
- **Response**: `200 OK`
  ```json
  { "cloudId": "18400000012345", "name": "document.pdf", "size": 1048576 }
  ```

### `POST /orders`
- **Auth**: None
- **Headers**: `X-Device-Id: <uuid>` (optional)
- **Body**:
  ```json
  {
    "files": [...],
    "services": [...],
    "rush": false,
    "payment": "cash" | "upi" | "razorpay"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "orderId": "d74e3048-2856-4c75-bf59-71ca33e8b075",
    "orderNumber": 1042,
    "status": "pending_cash",
    "payment_status": "cash_due",
    "total": 15.00,
    "quotePending": false,
    "pickupCode": null,
    "accessToken": "yFk6h7...",
    "breakdown": { ... }
  }
  ```

### `GET /orders/:id`
- **Auth**: `X-Order-Token: <accessToken>` or Staff Bearer
- **Response**: `200 OK`
  ```json
  {
    "id": "d74e3048-2856-4c75-bf59-71ca33e8b075",
    "orderNumber": 1042,
    "status": "processing",
    "payment_status": "cash_collected",
    "total": 15.00,
    "pickupCode": "4821",
    "fileNames": ["document.pdf"],
    "deleteAfter": 1791720000,
    "filesDeletedAt": null,
    "createdAt": 1791716400
  }
  ```

### `POST /orders/:id/cancel`
- **Auth**: `X-Order-Token: <accessToken>` or Staff Bearer
- **Response**: `200 OK`
  ```json
  { "ok": true, "status": "cancelled", "payment_status": "not_paid" }
  ```

### `POST /orders/:id/delete-files`
- **Auth**: `X-Order-Token: <accessToken>` or Staff Bearer
- **Response**: `200 OK` `{ "ok": true, "deletedAt": 1791720005 }`

---

## 2. Direct UPI Endpoints

### `POST /orders/:id/upi`
- **Auth**: `X-Order-Token: <accessToken>`
- **Response**: `200 OK`
  ```json
  {
    "ok": true,
    "orderId": "d74e3048-2856-4c75-bf59-71ca33e8b075",
    "orderNumber": 1042,
    "amount": 15.00,
    "vpa": "printbk@upi",
    "payeeName": "PrintBK Store",
    "upiIntentUrl": "upi://pay?pa=printbk@upi&pn=PrintBK%20Store&am=15.00&tr=1042&cu=INR&tn=Order%201042",
    "qrDataUrl": "data:image/svg+xml;utf8,..."
  }
  ```

### `POST /orders/:id/upi-return`
- **Description**: Automated callback triggered when the student returns to the web app from their UPI application (after passing the $\ge 2$s false-return guard). Records payment claim, updates status to `upi_claimed`, and signals the staff dashboard.
- **Auth**: `X-Order-Token: <accessToken>` or Bearer
- **Headers**: `X-Device-Id: <uuid>` (mandatory for device abuse limit enforcement)
- **Body**:
  ```json
  {
    "utr": "8492"
  }
  ```
  *(Note: `utr` is optional and non-blocking, storing the last 4 digits of the UPI transaction reference).*
- **Response**: `200 OK`
  ```json
  {
    "ok": true,
    "orderId": "d74e3048-2856-4c75-bf59-71ca33e8b075",
    "orderNumber": 1042,
    "status": "upi_claimed",
    "payment_status": "upi_claimed",
    "claimedAt": 1792131000
  }
  ```
- **Abuse Prevention**:
  Enforces a strict cap of **maximum 3 unapproved UPI claims per device**. Returns HTTP 429 if the device exceeds this quota before earlier claims are approved or expired.

---

## 3. Razorpay Online Payments (Dormant / Active)

### `POST /orders/:id/razorpay`
- **Auth**: `X-Order-Token` or Staff Bearer
- **Response (Active)**: `200 OK` `{ "razorpayOrderId": "order_EK98...", "keyId": "rzp_...", "amount": 1500, "currency": "INR" }`
- **Response (Dormant)**: `400 Bad Request` `{ "error": "Online payments are currently disabled...", "enabled": false }`

### `POST /orders/:id/verify-payment`
- **Auth**: None (Protected by HMAC SHA256 Signature)
- **Body**:
  ```json
  {
    "razorpay_payment_id": "pay_EK...",
    "razorpay_order_id": "order_EK...",
    "razorpay_signature": "4a7f..."
  }
  ```
- **Response**: `200 OK`
  ```json
  { "ok": true, "status": "processing", "payment_status": "paid_verified", "orderId": "..." }
  ```

### `POST /webhooks/razorpay`
- **Auth**: `X-Razorpay-Signature: <hmac>` header verified against `RAZORPAY_WEBHOOK_SECRET`
- **Response**: `200 OK` `{ "status": "ok" }`

---

## 4. Staff Counter API (`Authorization: Bearer <STAFF_TOKEN>`)

### `GET /staff/live`
- **Auth**: Staff Token
- **Query Params**: `include_test` (boolean, default: `false`)
- **Response**: `200 OK`
  ```json
  {
    "orders": [
      {
        "id": "...",
        "orderNumber": 1042,
        "status": "upi_claimed",
        "payment_status": "upi_claimed",
        "total": 15.00,
        "paymentMethod": "upi",
        "utr": "8492"
      }
    ],
    "today": { "revenue": 450.00, "ordersCount": 18, "pagesPrinted": 240 }
  }
  ```

### `GET /staff/history`
- **Auth**: Staff Token
- **Query Params**: `limit` (default: 50, max: 100), `include_test` (default: `false`)
- **Response**: `200 OK` array of historical orders with `payment_status`.

### `POST /orders/:id/approve-cash`
- **Description**: Counter approves cash payment or verifies UPI payment; transitions order to `processing` and marks `payment_status: cash_collected` (if cash) or `paid_verified` (if upi).
- **Response**: `200 OK` `{ "ok": true, "status": "processing", "payment_status": "paid_verified" }`

### `POST /orders/:id/reject`
- **Description**: Rejects an unprintable order and immediately purges files from File Store.
- **Response**: `200 OK` `{ "ok": true, "status": "rejected", "payment_status": "not_paid" }`

### `POST /orders/:id/status`
- **Body**: `{ "status": "printing" | "ready" | "completed" }`
- **Description**: Transitions order state. When set to `ready`, sets `delete_after = now + 5 minutes`.
- **Response**: `200 OK` `{ "ok": true, "status": "ready" }`

### `GET /files/:cloudId`
- **Description**: Streams raw file directly from File Store to counter / print agent.
- **Response**: Binary octet-stream with `Cache-Control: no-store`.

### `POST /cron/cleanup`
- **Description**: Sweeps and deletes files whose `delete_after <= now()` or cancelled/rejected orders.
- **Response**: `200 OK` `{ "ok": true, "purgedOrdersCount": 2, "purgedFilesCount": 3 }`
