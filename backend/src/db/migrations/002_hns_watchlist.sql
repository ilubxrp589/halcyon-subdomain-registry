-- HNS Watchlist table
-- Run: psql $DATABASE_URL -f backend/src/db/migrations/002_hns_watchlist.sql

CREATE TABLE IF NOT EXISTS hns_watchlist (
  id SERIAL PRIMARY KEY,
  flare_address TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flare_address, name)
);

CREATE INDEX IF NOT EXISTS idx_hns_watchlist_flare ON hns_watchlist(flare_address);
