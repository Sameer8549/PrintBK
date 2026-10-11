# PrintBK REST API Specification

## Authentication Models

1. **Student Access**: Anonymous order capability tokens (`X-Order-Token: <token>`). Generated on `POST /orders` and stored in client `localStorage`.
2. **Staff Access**: Bearer authentication header (`Authorization: Bearer <STAFF_TOKEN>`). Secret configured in Catalyst environment variables.
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
    "rates": { "bw": 1.5, "color": 8.0, "scan": 5, "photocopy": 1.5, "bulkTierThreshold": 100, ... },
    "rushEnabled": false,
    "maxFileMB": 25,
    "autoDeleteDelay": 5,
    "paymentMethods": { "cash": true, "razorpay": false }
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
- **Body**:
  ```json
  {
    "files": [...],
    "services": [...],
    "rush": false,
    "payment": "Cash"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "orderId": "d74e3048-2856-4c75-bf59-71ca33e8b075",
    "orderNumber": 1042,
    "status": "pending_cash",
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
- **Response**: `200 OK` `{ "ok": true, "status": "cancelled" }`

### `POST /orders/:id/delete-files`
- **Auth**: `X-Order-Token: <accessToken>` or Staff Bearer
- **Response**: `200 OK` `{ "ok": true, "deletedAt": 1791720005 }`

---

## 2. Payments API (Razorpay)

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
- **Response**: `200 OK` `{ "ok": true, "status": "processing", "orderId": "..." }`

### `POST /webhooks/razorpay`
- **Auth**: `X-Razorpay-Signature: <hmac>` header verified against `RAZORPAY_WEBHOOK_SECRET`
- **Response**: `200 OK` `{ "status": "ok" }`

---

## 3. Staff Counter API (`Authorization: Bearer <STAFF_TOKEN>`)

### `GET /orders`
- **Query Params**: `status` (optional), `limit` (default: 50, max: 100)
- **Response**: `200 OK` array of orders with pickup codes, total, and files count.

### `POST /orders/:id/approve-cash`
- **Description**: Counter approves cash payment; transitions state from `pending_cash` to `processing`.
- **Response**: `200 OK` `{ "ok": true, "status": "processing" }`

### `POST /orders/:id/reject`
- **Description**: Rejects an unprintable order and immediately purges files from File Store.
- **Response**: `200 OK` `{ "ok": true, "status": "rejected" }`

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
