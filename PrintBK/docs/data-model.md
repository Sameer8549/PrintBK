# PrintBK Data Model & State Machine (One Source of Truth)

## Overview

PrintBK uses a relational state model in Zoho Catalyst Data Store (ZCQL) combined with cryptographic capability tokens and server-enforced state transitions.

---

## 1. Data Store Tables (ZCQL)

### 1.1 `orders` (Existing)
Primary container for a customer order and financial transaction.

| Column Name | Data Type | Mandatory | Unique | Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | VarChar(50) | Yes | Yes | Primary order UUID |
| `order_number` | Int | Yes | No | Sequential human-friendly reference (`#1001`, `#1002`, ...) |
| `access_token_hash` | VarChar(64) | Yes | No | SHA-256 hash of student capability token |
| `status` | VarChar(30) | Yes | No | Order lifecycle state |
| `total` | Double | Yes | No | Authoritative total price (INR) |
| `quote_pending` | Boolean | Yes | No | True if unpriced custom service is present |
| `basket` | VarChar(5000) | Yes | No | Raw basket JSON |
| `file_names` | VarChar(1000) | Yes | No | JSON array of original file names |
| `pickup_code` | VarChar(10) | No | No | 4-digit pickup claim PIN |
| `payment_mode` | VarChar(20) | No | No | `cash`, `upi`, `online` |
| `delete_after` | BigInt | No | No | Epoch ms/sec for file purge fallback (max 60m) |
| `files_deleted_at` | BigInt | No | No | Epoch timestamp when files purged |
| `expires_at` | BigInt | No | No | Reservation expiry epoch timestamp |
| `confirmed_by` | VarChar(50) | No | No | Actor confirming payment (`staff`, `student_upi`, `razorpay`) |
| `confirmed_at` | BigInt | No | No | Epoch timestamp of payment confirmation |
| `created_at` | BigInt | Yes | No | Creation timestamp (epoch ms) |
| `updated_at` | BigInt | Yes | No | Last modification timestamp (epoch ms) |

---

### 1.2 `order_items` (New)
One row per physical or service deliverable in an order.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Primary item UUID |
| `order_id` | VarChar(50) | Yes | Foreign key to `orders.id` |
| `kind` | VarChar(30) | Yes | `document_bw`, `document_colour`, `photo`, `binding`, `lamination`, `scanning`, `photocopy`, `typing_request` |
| `status` | VarChar(30) | Yes | Item status (see Section 2.2) |
| `payload` | VarChar(5000) | Yes | JSON string of item specifications (pages, copies, sides, layout, colourPlan, etc.) |
| `price` | Double | Yes | Computed line total price in INR |
| `file_refs` | VarChar(1000) | No | JSON string array of file storage IDs |
| `printer_role` | VarChar(20) | Yes | Target role: `bw`, `colour`, `photo`, `none` |
| `created_at` | BigInt | Yes | Item creation epoch timestamp |
| `printed_at` | BigInt | No | Timestamp when printing was finished |
| `delete_after` | BigInt | No | Timestamp when item's files must be deleted (`printed_at + 5 min`) |
| `files_deleted_at` | BigInt | No | Timestamp when item's files were deleted from File Store |

---

### 1.3 `print_jobs` (New)
Execution attempts dispatched to the local PC print agent.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Primary job UUID |
| `item_id` | VarChar(50) | Yes | Foreign key to `order_items.id` |
| `attempt` | Int | Yes | Attempt counter (starts at 1) |
| `status` | VarChar(20) | Yes | `queued`, `sending`, `printing`, `completed`, `failed` |
| `pages_done` | Int | Yes | Real pages output so far |
| `pages_total` | Int | Yes | Total physical pages to output |
| `printer` | VarChar(100) | No | Windows printer name assigned |
| `error_code` | VarChar(50) | No | Error classification code (`paper_jam`, `out_of_paper`, `offline`, etc.) |
| `error_message` | VarChar(500) | No | Plain human-readable error description |
| `created_at` | BigInt | Yes | Creation timestamp |
| `updated_at` | BigInt | Yes | Last progress update timestamp |

---

### 1.4 `staff_devices` (New)
Paired staff counter devices (browsers/tablets).

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Device ID UUID |
| `label` | VarChar(100) | Yes | Device label (e.g., "Counter Tablet 1", "Shop PC Chrome") |
| `token_hash` | VarChar(64) | Yes | SHA-256 hash of device authentication credential |
| `created_at` | BigInt | Yes | Pairing timestamp |
| `last_seen_at` | BigInt | Yes | Last API activity timestamp |
| `revoked` | Boolean | Yes | True if device access has been revoked |

---

### 1.5 `agent_devices` (New)
Registered print agent installations running on shop PCs.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Agent ID UUID |
| `label` | VarChar(100) | Yes | Agent PC label (e.g., "Counter Windows PC") |
| `token_hash` | VarChar(64) | Yes | SHA-256 hash of agent token |
| `created_at` | BigInt | Yes | Pairing timestamp |
| `last_seen_at` | BigInt | Yes | Last heartbeat timestamp |
| `revoked` | Boolean | Yes | Revocation flag |

---

### 1.6 `printers` (New)
Printers reported by the print agent from Windows print spooler.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(100) | Yes | Printer identifier or slug |
| `name` | VarChar(100) | Yes | Windows device name (e.g., "EPSON L3110 Series") |
| `role` | VarChar(20) | Yes | `bw`, `colour`, `photo`, `both`, `none` |
| `online` | Boolean | Yes | Spooler online status |
| `status` | VarChar(50) | Yes | Status summary (`ready`, `paper_out`, `jam`, `offline`) |
| `paper_info` | VarChar(1000) | No | JSON supported paper sizes and trays |
| `tray_info` | VarChar(1000) | No | JSON tray status |
| `last_seen` | BigInt | Yes | Last heartbeat from agent |

---

### 1.7 `shop_settings` (New)
Single-row shop operational and pricing configuration.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Fixed key (`default`) |
| `rates` | VarChar(2000) | Yes | JSON rates: `{ bw, colour, duplex, bulk, a3, legal, ... }` |
| `services` | VarChar(1000) | Yes | JSON service availability flags |
| `payments` | VarChar(1000) | Yes | JSON payment options: `{ cash, upi, upiId, payeeName, razorpay }` |
| `shop_info` | VarChar(1000) | Yes | JSON shop metadata: `{ name, address, hours, phone, delete_delay_minutes }` |
| `delete_delay_minutes` | Int | Yes | Auto-delete delay in minutes (default 5, max 30) |
| `mixed_colour_mode` | VarChar(20) | Yes | `split` or `colour` |
| `open` | Boolean | Yes | Counter open/closed toggle |
| `announcement` | VarChar(500) | No | Optional broadcast banner |
| `updated_at` | BigInt | Yes | Last updated timestamp |

---

### 1.8 `order_events` (Existing/Enhanced)
Comprehensive audit trail for every status transition and action.

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Event UUID |
| `order_id` | VarChar(50) | Yes | Foreign key to `orders.id` |
| `item_id` | VarChar(50) | No | Foreign key to `order_items.id` |
| `actor_type` | VarChar(20) | Yes | `student`, `staff`, `agent`, `system` |
| `actor_label` | VarChar(100) | Yes | Device or user identifier |
| `action` | VarChar(50) | Yes | Action code (`create`, `collect_cash`, `approve_print`, `undo`, `file_delete`) |
| `from_status` | VarChar(30) | Yes | Prior state |
| `to_status` | VarChar(30) | Yes | Resulting state |
| `timestamp` | BigInt | Yes | Epoch timestamp |

---

### 1.9 `staff_actions` (New)
Undo window storage for counter actions (5-second grace period).

| Column Name | Data Type | Mandatory | Description |
| :--- | :--- | :---: | :--- |
| `id` | VarChar(50) | Yes | Action UUID |
| `action_type` | VarChar(30) | Yes | `collect_cash`, `reject`, `approve_print` |
| `order_id` | VarChar(50) | Yes | Target order ID |
| `item_id` | VarChar(50) | No | Target item ID |
| `payload` | VarChar(2000) | Yes | JSON snapshot of previous state for restoration |
| `expires_at` | BigInt | Yes | Epoch timestamp when undo window expires (`created_at + 5s`) |
| `undone` | Boolean | Yes | True if undone |
| `created_at` | BigInt | Yes | Action timestamp |

---

## 2. State Machine & Transition Rules

### 2.1 Order State Machine
1. `pending_payment` -> `paid` (Razorpay capture, dormant)
2. `pending_payment` -> `pending_cash` (Student selects Pay Cash at Counter)
3. `pending_payment` -> `upi_started` (Student triggers UPI payment link)
4. `upi_started` -> `upi_claimed` (Student taps "I Have Paid" with UTR)
5. `pending_cash` -> `cash_collected` (Staff taps COLLECT CASH)
6. `upi_claimed` / `cash_collected` / `paid` -> `processing` -> `printing` -> `ready` -> `completed`
7. Abortive transitions: `cancelled`, `rejected`, `expired`, `failed`

### 2.2 Item State Machine
- `waiting_payment`: Unpaid reservation, hidden from staff.
- `preparing`: Payment committed (`pending_cash` or `upi_claimed`), agent downloading/converting file in background.
- `ready_to_print`: File prepared, awaiting staff approval.
- `sending`: Staff tapped APPROVE & PRINT; job sent to agent.
- `printing`: Spooler printing with progress (`pages_done / pages_total`).
- `printed`: Printing finished. Starts 5-minute file deletion timer.
- `failed`: Hardware/spooler error with code.
- `waiting_for_print`: Physical service (binding/lamination) linked to an active print item.
- `ready_to_bind`: Linked print item completed; physical finishing ready to begin.
- `done`: Physical service finished.
- `quote_waiting` / `quote_sent` / `quote_accepted`: Custom typing/request flow.

### 2.3 Server-Enforced Invariants (409 Conflict)
1. **Approve & Print Guard**: Allowed ONLY when `order.status` is `cash_collected`, `upi_claimed`, or `paid`, and item status is `ready_to_print`, `preparing`, or `failed`.
2. **Collect Cash Guard**: Allowed ONLY when `order.status == 'pending_cash'`.
3. **Physical Service Guard**: `DONE` allowed ONLY when linked print item is `printed` (or if unlinked).
4. **Student Gating**: Students cannot trigger staff or agent transitions.
5. **Idempotency**: All staff action requests include an idempotency key.

---

## 3. Strict 5-Minute File Deletion Rule

1. When an item reaches `printed`, the server sets:
   `delete_after = printed_at + (shop_settings.delete_delay_minutes * 60)` (default 5 minutes).
2. The agent and background cron delete the file from Zoho Catalyst File Store when `now >= delete_after`.
3. Hard ceiling: All files are purged unconditionally at `created_at + 60 minutes`.
4. After deletion:
   - File Store file is deleted.
   - `files_deleted_at = now` is recorded on `order_items`.
   - The UI shows neutral labels: `Document 1 (files deleted)`.
