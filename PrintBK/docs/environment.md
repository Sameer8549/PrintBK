# PrintBK Environment Variables & Secrets Specification

**Target Platform**: Zoho Catalyst Serverless Compute  
**Function**: `api` (Advanced I/O Node.js 18)  
**Configuration Location**: Catalyst Console > Compute > Functions > `api` > Environment Variables  

---

## 1. Environment Variables Reference

| Variable Name | Description | Environment | Sensitive? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `STAFF_TOKEN` | Pre-shared secret token for staff counter operations | Dev & Prod | **Yes** | Protects `/orders`, `/orders/:id/approve-cash`, `/orders/:id/status`, `/files/:cloudId` |
| `CRON_SECRET` | Pre-shared constant-time secret for scheduled tasks | Dev & Prod | **Yes** | Protects `POST /cron/cleanup` scheduler endpoint |
| `UPI_ID` | Virtual Payment Address (VPA) for direct UPI transfers | Dev & Prod | **Yes** (Server-only) | Server builds NPCI `upi://pay` payload; never exposed in client bundle |
| `UPI_PAYEE_NAME` | Business / Shop Payee Name displayed in UPI apps | Dev & Prod | No | NPCI `pn` parameter (e.g. `PrintBK HKBK`) |
| `RAZORPAY_KEY_ID` | Razorpay API Key ID | Dev & Prod | No | Dormant online payment gateway activation |
| `RAZORPAY_KEY_SECRET` | Razorpay API Secret | Dev & Prod | **Yes** | Dormant online payment gateway signature verification |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Webhook Secret | Dev & Prod | **Yes** | Dormant online payment webhook validation |

---

## 2. Click-by-Click Console Setup Guide

### Setting `UPI_ID` and `UPI_PAYEE_NAME` in Catalyst Console
1. Log in to the [Zoho Catalyst Console](https://console.catalyst.zoho.com/).
2. Select the **PrintBK** project and switch to your target environment (**Development** or **Production**).
3. In the left navigation sidebar under **Compute**, click **Functions**.
4. Click on the **`api`** function card.
5. In the function details page, open the **Environment Variables** tab.
6. Click **+ Add Variable** (or **Configure Variable**).
7. Add the UPI ID variable:
   - **Key**: `UPI_ID`
   - **Value**: Enter your UPI VPA (e.g., `Q098686787@ybl`)
8. Click **+ Add Variable** again:
   - **Key**: `UPI_PAYEE_NAME`
   - **Value**: `PrintBK HKBK` (or your registered shop name)
9. Click **Save** / **Apply**.

---

## 3. Data Store Schema Additions (orders Table)

For Phase 3 (UPI Intent & Cash Counter Workflow) and Phase 4 (Typed Items for Staff), the following columns are configured in the `orders` Data Store table:

| Column Name | Data Type | Mandatory | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `order_payment_method` | Var Char (50) | No | `'cash'` | Payment method: `'cash'`, `'upi'`, `'razorpay'` |
| `upi_utr_last4` | Var Char (10) | No | `null` | Optional last 4 digits of student UPI reference |
| `upi_started_at` | BigInt | No | `null` | Epoch timestamp (seconds) when UPI intent was launched |
| `upi_claimed_at` | BigInt | No | `null` | Epoch timestamp (seconds) when student returned from UPI app |
| `cash_collected_at` | BigInt | No | `null` | Epoch timestamp (seconds) when staff confirmed cash payment |
| `approved_at` | BigInt | No | `null` | Epoch timestamp (seconds) when staff approved order for printing |
| `approved_by` | Var Char (100) | No | `null` | Identifier of staff member who approved order |

*(Note: The API implementation contains resilient JSON fallbacks in the `basket` column payload so the backend remains functional whether columns are already provisioned or pending in the console).*
