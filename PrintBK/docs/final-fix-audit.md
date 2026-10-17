# PrintBK Final Production Fix Audit & Root Cause Analysis

**Audit Date:** October 17, 2026  
**Branch:** `fix/final-pass`  
**Methodology:** Gravitas Reliability Runtime (Ground before mutating, empirical verification)

---

## 1. Executive Summary

This audit establishes the root causes for the 8 reported production problems (P1–P8) across the student web client, staff counter app, Catalyst serverless backend, and Windows print agent.

---

## 2. Root Cause Diagnoses

### P1 & P2: Icon Inconsistency, Emoji Characters & Missing Premium Gold Badges
- **P1 Root Cause:** `student/src/features/settings/Settings.tsx` implemented a rudimentary `GoldenIcon` component using a simple CSS linear gradient (`#fffbeb` to `#fde68a`), an orange border (`#f59e0b`), and inline stroke SVG. It completely lacked the glossy metallic gold ring, bright bevel, black glass disc, curved reflection, and 4-point sparkle specified by the design reference (`design/reference/gold-badges-reference.png`).
- **P2 Root Cause:** Scattered Unicode emoji characters (e.g., `🟢`, `📡`, emoji symbols in notification alerts) appeared in the source code and rendered DOM without a unified monoline icon family or strict linting check.

### P3: Shop Open/Closed Desynchronization
- **Root Cause 1 (Phone View Disconnected):** In `staff/src/App.tsx:1887` (`OwnerPhoneView`), the shop switch `onClick={() => setShopOpen(!shopOpen)}` updated only local component state and never called the API (`updateShopSettings`) at all.
- **Root Cause 2 (Local UI State Disconnected from Live Feed):** In root `App` component (`staff/src/App.tsx:2042`), `shopOpen` was initialized as `useState(true)` and was never initialized from or kept in sync with `live.shop.open` from `fetchLiveFeed`.
- **Root Cause 3 (Aggressive HTTP Caching):** In `functions/api/index.js:573`, `GET /config` sent `Cache-Control: public, max-age=5, stale-while-revalidate=5`. The browser and Catalyst CDN returned stale cached responses for up to 10 seconds.
- **Root Cause 4 (No Server-Calculated Effective Open State):** Open status was evaluated simply as `open !== false` without combining manual override, pause status, and operational hours into a single authoritative server field (`shop.open`).
- **Root Cause 5 (Upload Endpoint Fallthrough):** In `functions/api/index.js:662-673`, `/upload` queried ZCQL directly; if the query threw or ran locally without Catalyst initialized, it fell through to allow uploads even when memory state indicated the shop was closed.

### P4: Overlapping & Congested Layouts
- **Root Cause:** Multiple mobile views (360px and 390px widths) lacked generous vertical rhythm (at least 20px between rows, 24px padding), resulting in crowded interactive blocks with > 7 elements, misaligned grid lines, and button squishing on narrower devices.

### P5: UPI Payment Flow & Premature Redirects
- **Root Cause:** The UPI return flow relied on manual user taps ("I've paid") or lacked robust debounce gating against accidental quick switching. If the student opened a UPI app and returned under 2 seconds, the app could misinterpret app switching.
- **Requirements:** 
  1. Remove "I've paid" button entirely.
  2. Automatic visibility return detection (> 2s hidden).
  3. Automatic idempotent claim via `POST /orders/:id/upi-return`.
  4. Instant redirect to `/receipt/:orderId` displaying truthful payment line: `"Payment: waiting for the shop to verify"`.

### P6: History Payment Status Stale / "Payment Not Received Yet"
- **Root Cause 1 (SQL Query Column Omission):** In `functions/api/index.js:1002`, `GET /orders/:id` executed:
  `SELECT id, order_number, status, total, quote_pending, basket, file_names, delete_after, files_deleted_at, created_at, updated_at FROM orders`
  The column `payment_status` was completely missing from the `SELECT` list.
- **Root Cause 2 (Staff Action Missing Column Write):** In `functions/api/staff.js:638`, `POST /orders/:id/collect-cash` updated `status = 'cash_collected'` but never updated `payment_status = 'cash_collected'`.
- **Root Cause 3 (Student History Query Abandonment):** In `student/src/features/history/History.tsx:26-28`, completed orders were filtered out of live sync (`o => !['completed', ...].includes(o.status)`), meaning a completed order never polled for updated payment statuses.
- **Root Cause 4 (Client-Side Stale Fallback):** The client checked `order.payment_status || computePaymentStatus(order)`. Because initial creation stored `'unpaid'`, the truthy `'unpaid'` string masked the dynamic computed status.

### P7: Duplicate Order Numbers & Old Test Orders
- **Root Cause 1 (Non-Atomic Race Condition):** `functions/api/index.js:520-542` computed `max + 1` from `SELECT order_number FROM orders ORDER BY order_number DESC LIMIT 1`. Concurrent orders executed the same query and received identical numbers.
- **Root Cause 2 (Hardcoded Fallback in Staff Feed):** In `functions/api/staff.js:471`, when recent items were read from `order_items` without joining `orders`, `orderNumber` hardcoded `1000`.
- **Root Cause 3 (Historical Test Orders):** Accumulated test orders (`SMOKE_TEST_DOC.pdf`, `PICKUP_TEST.pdf`, etc.) remained in the database without being purged.

---

## 3. Implementation Plan & Policy Record

```json
{
  "planning": "compact",
  "context_depth": "dependency",
  "verification_depth": "impact",
  "delegation": "none",
  "reason_codes": ["shared-schema", "multi-client", "strict-verification"]
}
```

### Phase Sequence
1. **Phase 1:** Shop Open/Closed, Effective Hours, Live Settings Sync (P3)
2. **Phase 2:** UPI Auto-Redirect & Unified Server Payment Status (P5, P6)
3. **Phase 3:** Atomic Concurrency-Safe Order Counter & Test Data Purge (P7)
4. **Phase 4:** Premium Gold Badge Component & Complete Emoji Removal (P1, P2)
5. **Phase 5:** Layout Audit, Density, Mobile Viewports & Automated Spacing Checks (P4, P2)
6. **Phase 6:** Full Regression Verification & Empty-Backend Tests (P8)
7. **Phase 7:** Final Evidence Package & Pull Request
