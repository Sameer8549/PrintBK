CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  basket TEXT NOT NULL, -- JSON
  breakdown TEXT NOT NULL, -- JSON
  quote_pending BOOLEAN NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  printed_at INTEGER
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
