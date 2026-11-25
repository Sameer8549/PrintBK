-- Clean PrintBK Order & UPILerify Direct-UPI Schema

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  userId TEXT,
  customerEmail TEXT,
  order_number INTEGER,
  baseAmount REAL NOT NULL,
  payableAmount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- Enum: PENDING | UNDER_REVIEW | PAID | EXPIRED
  utrNumber TEXT UNIQUE,                  -- Unique 12-digit UPI Reference ID
  qrCodeData TEXT,
  upiIntentUrl TEXT,
  expiresAt TEXT NOT NULL,                -- ISO-8601 expiry timestamp (15 minutes)
  basket TEXT NOT NULL,                   -- JSON basket & fulfillment metadata
  breakdown TEXT NOT NULL,                -- JSON pricing breakdown
  quote_pending BOOLEAN NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  printed_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_utr_unique
  ON orders(utrNumber)
  WHERE utrNumber IS NOT NULL;

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
