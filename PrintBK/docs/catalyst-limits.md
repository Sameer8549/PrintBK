# Zoho Catalyst Execution Quotas & Architecture Limits

## Overview

This reference document specifies the hard operational limits and quotas enforced by Zoho Catalyst, along with how PrintBK's architecture guards against each constraint.

---

## Limits Matrix & Architectural Mitigations

| Resource / Metric | Catalyst Limit | PrintBK Enforcement | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Function Execution Timeout** | 15 minutes (max), 30s default HTTP | 3.5s client timeout | Client falls back gracefully to offline ticket if cloud exceeds 3.5s; all function queries execute within 300ms. |
| **HTTP Request Payload Size** | 25 MB max | `multer` 25 MB ceiling | Uploads exceeding 25MB are rejected with HTTP 413 immediately at the firewall. |
| **Memory Allocation** | 512 MB – 1 GB | Memory-efficient streaming | Files are piped directly to/from File Store via streams; buffers are promptly garbage-collected. |
| **ZCQL Query Row Limit** | 500 rows per query | Server-side pagination | `SELECT ... LIMIT 50` on staff order listings; filtered by status to prevent unbounded scans. |
| **Rate Limiting** | Platform API quotas | In-memory token bucket & cache | 30 requests per 10s per IP sliding window; 5 failed logins triggers temporary 5-minute lockout. |
| **File Store Folder Quota** | Varies by tier | 5-minute auto-purge | Completed and cancelled jobs have files purged after 5 minutes via cron, preventing storage exhaustion. |
| **Concurrent Executions** | 100 concurrent instances | Connection pooling | Stateless Node.js Advanced I/O functions reuse existing database handles. |

---

## Error Handling & Resiliency

1. **ZCQL Schema Drift Resilience**: If a newly added column (e.g. `order_number`) is queried before replication finishes across Catalyst replicas, the queries in `functions/api/index.js` fall back to the base column set transparently without throwing a 500 error.
2. **Database Fallback for Pickup Codes**: If active order query times out, `crypto.randomInt(1000, 10000)` draws from the 4-digit namespace directly, ensuring orders can always be placed.
3. **Stream Piping for Downloads**: File downloads (`GET /files/:cloudId`) use Node.js streams (`fileStream.pipe(res)`) rather than loading whole files into function RAM, preserving concurrency capacity.
4. **Empirical Large Upload Validation (`scripts/test-upload-sizes.mjs`)**:
   - **20 MB PDF Upload**: Succeeded (HTTP 200, returned `cloudId: 43505000000484041`).
   - **25 MB PDF Upload**: Succeeded (HTTP 200, returned `cloudId: 43505000000503015`).
   - **26 MB PDF Upload**: Rejected with HTTP 413 Payload Too Large (`LIMIT_FILE_SIZE`).
   - Both 20 MB and 25 MB uploads stream directly to disk in `os.tmpdir()` and forward to File Store via Node streams, completely bypassing in-memory buffer exhaustion.
