-- HNS Wallet + Swap tables
-- Run: psql $DATABASE_URL -f backend/src/db/migrations/001_hns_wallet.sql

-- Maps Flare addresses to hsd wallet IDs
CREATE TABLE IF NOT EXISTS hns_wallets (
  id SERIAL PRIMARY KEY,
  flare_address TEXT NOT NULL UNIQUE,
  wallet_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hns_wallets_flare ON hns_wallets(flare_address);

-- Swap transaction records
CREATE TABLE IF NOT EXISTS swaps (
  id SERIAL PRIMARY KEY,
  flare_address TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy_hns', 'sell_hns')),
  hns_amount BIGINT NOT NULL,
  flr_amount TEXT NOT NULL,
  hns_usd_rate NUMERIC(18,8) NOT NULL,
  flr_usd_rate NUMERIC(18,8) NOT NULL,
  fee_pct NUMERIC(5,2) DEFAULT 2.50,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','expired')),
  flr_tx_hash TEXT,
  hns_tx_hash TEXT,
  quote_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_swaps_flare_address ON swaps(flare_address);
CREATE INDEX IF NOT EXISTS idx_swaps_status ON swaps(status);
CREATE INDEX IF NOT EXISTS idx_swaps_created ON swaps(created_at DESC);

-- Activity log for auto-TXT and wallet monitor events
CREATE TABLE IF NOT EXISTS hns_wallet_events (
  id SERIAL PRIMARY KEY,
  flare_address TEXT NOT NULL,
  wallet_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  tld_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hns_events_address ON hns_wallet_events(flare_address);
CREATE INDEX IF NOT EXISTS idx_hns_events_type ON hns_wallet_events(event_type);
