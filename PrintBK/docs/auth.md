# PrintBK Authentication & Authorization Architecture

> **Document Version:** 1.0 (Phase 1 Security Hardening)  
> **Status:** Active & Implemented  
> **Audience:** Backend Engineers, Security Reviewers, Counter App Developers

---

## 1. Threat Model & Role Definitions

PrintBK defines three distinct operational actors:

| Actor | Identification Method | Capabilities & Permissions |
| :--- | :--- | :--- |
| **Student** | Anonymous + Per-order 192-bit cryptographic capability token (`X-Order-Token`) | Can upload files, create orders, view their own order status & receipt, and trigger immediate deletion of their own uploaded files. Cannot read or mutate other students' orders. |
| **Staff (Seller App)** | Bearer token (`STAFF_TOKEN`) sent in `Authorization: Bearer <STAFF_TOKEN>` header (migrating to Catalyst Auth) | Can list incoming orders (paginated, filtered), view order file metadata, approve cash payments, reject jobs, advance status (`printing`, `ready`, `completed`), and download uncompressed print files. |
| **Agent (Shop PC)** | Reserved bearer token (`AGENT_TOKEN`) sent in `Authorization: Bearer <AGENT_TOKEN>` header | Local Node.js print daemon running on the counter computer; polls queued orders, downloads original files, dispatches to physical system printers (SumatraPDF/CUPS), and confirms print completion. |

---

## 2. Phase 1 Implementation (Current)

### 2.1 Staff Bearer Authentication
- **Token Storage:** The secret is stored strictly as a Zoho Catalyst Function Environment Variable (`STAFF_TOKEN`).
- **Header:** `Authorization: Bearer <STAFF_TOKEN>`.
- **Comparison:** Uses constant-time buffer comparison (`crypto.timingSafeEqual`) to prevent timing attack side-channels.
- **Rotation:** Can be updated instantly in the Zoho Catalyst Console without redeploying code.
- **Auditing & Logging:** Staff tokens are **NEVER logged** in plain text or written to files.

### 2.2 Student Per-Order Capability Token
- **Token Generation:** When a student creates an order via `POST /orders`, the server generates a cryptographically random 192-bit token (`crypto.randomBytes(24).toString('base64url')`).
- **Hash Storage:** The server computes `SHA-256(orderToken)` and stores **only the hash** in `access_token_hash`. The plain-text token is returned exactly once in the `POST /orders` response.
- **Client Storage:** The student web application saves the token in `localStorage` associated with the order ID.
- **Request Authorization:** Subsequent requests to `GET /orders/:id`, file deletion, or receipts require the header `X-Order-Token: <token>`.
- **Protection:** Even if an outsider guesses or intercepts an unguessable UUID order ID, access is denied (`401 Unauthorized` or `403 Forbidden`) without the matching cryptographic token.

---

## 3. Migration Path: From Token to Catalyst User Authentication & Roles

When the official seller web application (currently designed in Figma) is launched, the system will seamlessly transition from the shared `STAFF_TOKEN` to full user accounts with multi-user audit logging and Role-Based Access Control (RBAC).

### 3.1 Zoho Catalyst Authentication Overview
Zoho Catalyst provides native identity management supporting:
1. **Hosted Sign-in / Custom Sign-in:** Email/password login, Google/Zoho OAuth, or Magic Links.
2. **Catalyst User Roles:** Configurable roles (e.g. `Staff`, `Admin`, `CounterManager`).
3. **Session Cookie / Bearer JWT:** Catalyst automatically validates session cookies on incoming requests to Advanced I/O functions.

### 3.2 Step-by-Step Migration Plan
1. **Enable Catalyst Authentication in Console:**
   - In Zoho Catalyst Console, navigate to **Authentication** → **Users & Roles**.
   - Define custom roles: `Staff` and `Admin`.
   - Add staff user accounts (e.g., `counter1@hkbk.edu.in`).
2. **Seller App Sign-in Screen:**
   - Integrate the Catalyst Web SDK (`catalyst.auth.signIn()`) into the seller frontend.
   - On successful sign-in, Catalyst issues a secure, HttpOnly session cookie or user token.
3. **Backend Middleware Upgrade:**
   - In `functions/api/index.js`, enhance `isStaff(req)` to check Catalyst session context:
   ```javascript
   async function getAuthenticatedUser(req) {
     try {
       const catalystApp = catalyst.initialize(req);
       const user = await catalystApp.user().getCurrentUser();
       return user; // { user_id, email, role: 'Staff' }
     } catch (err) {
       return null;
     }
   }
   ```
4. **Dual-Support Transition Period:**
   - Keep `STAFF_TOKEN` support active for automated background jobs and scripts (`scripts/smoke-test.mjs`, CLI smoke tests) while interactive web users authenticate via their individual staff accounts.
5. **Granular Audit Logging:**
   - Replace static `confirmed_by = 'staff'` with the exact staff email (`confirmed_by = user.email`) in `order_events` and `orders` tables.

---

## 4. Rate Limiting & Anti-Brute-Force Rules

- **General Traffic:** Max 30 requests per 10-second sliding window per client IP. Excess calls return `429 Too Many Requests`.
- **Staff Authentication Brute Force:** If 5 failed staff token attempts occur from an IP within 1 minute, that IP is temporarily locked out for 5 minutes.
- **CORS Protection:** Rejects unknown origins with `403 Forbidden` and blocks wildcard `*` credentials.
