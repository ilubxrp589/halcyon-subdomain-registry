import pool from './index.js';

const migrations = `
-- Enum types
DO $$ BEGIN
  CREATE TYPE escrow_status AS ENUM ('pending', 'dns_verified', 'completed', 'refunded', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE domain_status AS ENUM ('active', 'expiring_soon', 'expired', 'grace_period');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- TLDs table
CREATE TABLE IF NOT EXISTS tlds (
  id SERIAL PRIMARY KEY,
  name VARCHAR(63) NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  registration_open BOOLEAN DEFAULT true,
  description TEXT,
  icon_url VARCHAR(500),
  -- Pricing (USD) - base price for standard tier (4+ chars)
  base_price_usd NUMERIC(10, 2) DEFAULT 10.00,
  -- Price multipliers for shorter domains
  price_multiplier_ultra NUMERIC(5, 2) DEFAULT 50.00,      -- 1 char = base * 50 = $500
  price_multiplier_premium NUMERIC(5, 2) DEFAULT 20.00,    -- 2 chars = base * 20 = $200
  price_multiplier_standard_plus NUMERIC(5, 2) DEFAULT 8.00, -- 3 chars = base * 8 = $80
  -- Renewal pricing (can be different from registration)
  renewal_price_multiplier NUMERIC(5, 2) DEFAULT 0.80,     -- 80% of registration price
  -- Sorting/display
  display_order INTEGER DEFAULT 100,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add new columns to existing tlds table (idempotent)
DO $$ BEGIN
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS registration_open BOOLEAN DEFAULT true;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS icon_url VARCHAR(500);
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS base_price_usd NUMERIC(10, 2) DEFAULT 10.00;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS price_multiplier_ultra NUMERIC(5, 2) DEFAULT 50.00;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS price_multiplier_premium NUMERIC(5, 2) DEFAULT 20.00;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS price_multiplier_standard_plus NUMERIC(5, 2) DEFAULT 8.00;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS renewal_price_multiplier NUMERIC(5, 2) DEFAULT 0.80;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 100;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;
  ALTER TABLE tlds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Domains table
CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  token_id BIGINT UNIQUE,
  subdomain VARCHAR(63) NOT NULL,
  tld_id INTEGER REFERENCES tlds(id),
  fqdn VARCHAR(255) NOT NULL UNIQUE,
  owner_wallet VARCHAR(42) NOT NULL,
  original_buyer VARCHAR(42) NOT NULL,
  registration_price_flr NUMERIC(36, 18),
  registration_price_usd NUMERIC(18, 2),
  registration_date TIMESTAMP NOT NULL,
  expiration_date TIMESTAMP,
  status domain_status DEFAULT 'active',
  tier VARCHAR(20),
  metadata_uri VARCHAR(500),
  dns_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pending purchases (escrow tracking)
CREATE TABLE IF NOT EXISTS pending_purchases (
  id SERIAL PRIMARY KEY,
  escrow_id BIGINT UNIQUE,
  wallet_address VARCHAR(42) NOT NULL,
  subdomain VARCHAR(63) NOT NULL,
  tld_id INTEGER REFERENCES tlds(id),
  fqdn VARCHAR(255) NOT NULL,
  price_flr NUMERIC(36, 18) NOT NULL,
  price_usd NUMERIC(18, 2),
  escrow_tx_hash VARCHAR(66),
  token_id BIGINT,
  status escrow_status DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  dns_verified_at TIMESTAMP,
  completed_at TIMESTAMP,
  timeout_at TIMESTAMP
);

-- DNS verifications
CREATE TABLE IF NOT EXISTS dns_verifications (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER REFERENCES pending_purchases(id),
  hns_block_hash VARCHAR(66),
  hns_block_height BIGINT,
  hns_tx_hash VARCHAR(66),
  dns_records JSONB,
  verified_at TIMESTAMP DEFAULT NOW()
);

-- Processed blockchain events
CREATE TABLE IF NOT EXISTS processed_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  tx_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  data JSONB,
  UNIQUE(tx_hash, log_index)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  actor_wallet VARCHAR(42),
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add missing columns to audit_log if they don't exist
DO $$ BEGIN
  ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_wallet VARCHAR(42);
  ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS details JSONB;
  -- Migrate old columns if they exist
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'performed_by') THEN
    UPDATE audit_log SET actor_wallet = performed_by WHERE actor_wallet IS NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Change entity_id type to VARCHAR if it's INTEGER
DO $$ BEGIN
  ALTER TABLE audit_log ALTER COLUMN entity_id TYPE VARCHAR(100);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Audit log indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_wallet);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created ON audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type_created ON audit_log(entity_type, created_at DESC);

-- Reserved words
CREATE TABLE IF NOT EXISTS reserved_words (
  id SERIAL PRIMARY KEY,
  word VARCHAR(63) NOT NULL UNIQUE,
  reason VARCHAR(255),
  added_by VARCHAR(42),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Price sync history
CREATE TABLE IF NOT EXISTS price_sync_history (
  id SERIAL PRIMARY KEY,
  old_price NUMERIC(18, 8) NOT NULL,
  new_price NUMERIC(18, 8) NOT NULL,
  tx_hash VARCHAR(66),
  synced_at TIMESTAMP DEFAULT NOW()
);

-- Watcher state (persists block scanner position)
CREATE TABLE IF NOT EXISTS watcher_state (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Authentication nonces (prevent replay attacks)
CREATE TABLE IF NOT EXISTS auth_nonces (
  wallet_address VARCHAR(42) PRIMARY KEY,
  nonce VARCHAR(100) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for cleanup of expired nonces
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);

-- NFT Preparations table (stores prepared NFTs before purchase)
CREATE TABLE IF NOT EXISTS nft_preparations (
  id SERIAL PRIMARY KEY,
  fqdn VARCHAR(255) NOT NULL UNIQUE,
  subdomain VARCHAR(63) NOT NULL,
  tld VARCHAR(63) NOT NULL,
  image_cid VARCHAR(100) NOT NULL,
  metadata_cid VARCHAR(100) NOT NULL,
  generation_seed BIGINT NOT NULL,
  tier VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add NFT CID columns to domains table if they don't exist
DO $$ BEGIN
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS nft_image_cid VARCHAR(100);
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS nft_metadata_cid VARCHAR(100);
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS nft_generation_seed BIGINT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Index for NFT preparations lookup
CREATE INDEX IF NOT EXISTS idx_nft_prep_fqdn ON nft_preparations(fqdn);
CREATE INDEX IF NOT EXISTS idx_nft_prep_created ON nft_preparations(created_at);

-- Regeneration credits table (track free and paid regeneration credits per wallet)
CREATE TABLE IF NOT EXISTS regeneration_credits (
  wallet_address VARCHAR(42) PRIMARY KEY,
  free_remaining INTEGER DEFAULT 10,
  paid_credits INTEGER DEFAULT 0,
  total_regenerations INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for regeneration credits lookup
CREATE INDEX IF NOT EXISTS idx_regen_credits_wallet ON regeneration_credits(wallet_address);

-- Add theme column to nft_preparations if not exists
DO $$ BEGIN
  ALTER TABLE nft_preparations ADD COLUMN IF NOT EXISTS theme VARCHAR(50);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add custom_prompt column to nft_preparations if not exists
DO $$ BEGIN
  ALTER TABLE nft_preparations ADD COLUMN IF NOT EXISTS custom_prompt VARCHAR(200);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Used credit transactions (prevent replay attacks on credit purchases)
CREATE TABLE IF NOT EXISTS used_credit_transactions (
  id SERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  wallet VARCHAR(42) NOT NULL,
  amount VARCHAR(78) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for credit transaction lookup
CREATE INDEX IF NOT EXISTS idx_used_credit_tx_hash ON used_credit_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_used_credit_wallet ON used_credit_transactions(wallet);

-- Preview credits table (track preview credits per wallet - 10 free total)
CREATE TABLE IF NOT EXISTS preview_credits (
  wallet_address VARCHAR(42) PRIMARY KEY,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Migration: if old table exists with theme column, migrate data
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'preview_credits' AND column_name = 'theme') THEN
    -- Create temp table with new structure
    CREATE TEMP TABLE preview_credits_migration AS
    SELECT wallet_address, SUM(used_count) as used_count, MIN(created_at) as created_at, MAX(updated_at) as updated_at
    FROM preview_credits GROUP BY wallet_address;

    -- Drop old table and recreate
    DROP TABLE preview_credits;
    CREATE TABLE preview_credits (
      wallet_address VARCHAR(42) PRIMARY KEY,
      used_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Migrate data
    INSERT INTO preview_credits SELECT * FROM preview_credits_migration;
    DROP TABLE preview_credits_migration;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add bonus_credits column to preview_credits (for bulk registration bonuses)
DO $$ BEGIN
  ALTER TABLE preview_credits ADD COLUMN IF NOT EXISTS bonus_credits INTEGER DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Credit audit log table (track bonus credit additions)
CREATE TABLE IF NOT EXISTS credit_audit_log (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  credit_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  reason VARCHAR(100),
  tx_hash VARCHAR(66),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_audit_wallet ON credit_audit_log(wallet_address);

-- ============================================================
-- HSR Address Resolution (FLR Address Resolution feature)
-- Enables sending FLR to username.cryptofans instead of 0x...
-- ============================================================

-- Add resolver columns to domains table
DO $$ BEGIN
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS resolver_address VARCHAR(42);
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42);
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS namehash VARCHAR(66);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Address mappings table (mirrors on-chain resolver state)
CREATE TABLE IF NOT EXISTS address_mappings (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  token_id BIGINT NOT NULL,
  fqdn VARCHAR(255) NOT NULL,
  namehash VARCHAR(66) NOT NULL,
  wallet_address VARCHAR(42),
  coin_type BIGINT DEFAULT 2147483662,  -- COINTYPE_FLR = 0x8000000E
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(42),
  tx_hash VARCHAR(66),
  UNIQUE(namehash, coin_type)
);

-- Text records for domains (avatar, url, description, etc.)
CREATE TABLE IF NOT EXISTS domain_text_records (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  namehash VARCHAR(66) NOT NULL,
  record_key VARCHAR(100) NOT NULL,
  record_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(namehash, record_key)
);

-- Resolution audit log (track address changes)
CREATE TABLE IF NOT EXISTS resolution_audit (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id),
  fqdn VARCHAR(255) NOT NULL,
  old_address VARCHAR(42),
  new_address VARCHAR(42),
  changed_by VARCHAR(42),
  tx_hash VARCHAR(66),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast resolution lookups
CREATE INDEX IF NOT EXISTS idx_address_mappings_namehash ON address_mappings(namehash);
CREATE INDEX IF NOT EXISTS idx_address_mappings_fqdn ON address_mappings(fqdn);
CREATE INDEX IF NOT EXISTS idx_address_mappings_wallet ON address_mappings(wallet_address);
CREATE INDEX IF NOT EXISTS idx_domains_wallet_address ON domains(wallet_address);
CREATE INDEX IF NOT EXISTS idx_domains_namehash ON domains(namehash);
CREATE INDEX IF NOT EXISTS idx_text_records_namehash ON domain_text_records(namehash);

-- ============================================================
-- Marketplace Tables (track on-chain listings and offers)
-- ============================================================

-- Listing type and status enums
DO $$ BEGIN
  CREATE TYPE listing_type AS ENUM ('fixed_price', 'auction');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('active', 'sold', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Marketplace listings table
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id SERIAL PRIMARY KEY,
  listing_id BIGINT NOT NULL UNIQUE,
  token_id BIGINT NOT NULL,
  domain_id INTEGER REFERENCES domains(id),
  fqdn VARCHAR(255),
  seller_wallet VARCHAR(42) NOT NULL,
  price NUMERIC(36, 18) NOT NULL,
  listing_type listing_type NOT NULL DEFAULT 'fixed_price',
  status listing_status NOT NULL DEFAULT 'active',
  end_time TIMESTAMP,
  highest_bidder VARCHAR(42),
  highest_bid NUMERIC(36, 18),
  buyer_wallet VARCHAR(42),
  sale_price NUMERIC(36, 18),
  royalty_amount NUMERIC(36, 18),
  platform_fee NUMERIC(36, 18),
  tx_hash VARCHAR(66),
  block_number BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  sold_at TIMESTAMP,
  cancelled_at TIMESTAMP
);

-- Marketplace offers table
CREATE TABLE IF NOT EXISTS marketplace_offers (
  id SERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL UNIQUE,
  token_id BIGINT NOT NULL,
  domain_id INTEGER REFERENCES domains(id),
  fqdn VARCHAR(255),
  offerer_wallet VARCHAR(42) NOT NULL,
  amount NUMERIC(36, 18) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_accepted BOOLEAN DEFAULT false,
  is_cancelled BOOLEAN DEFAULT false,
  accepted_by VARCHAR(42),
  tx_hash VARCHAR(66),
  block_number BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Marketplace activity log (all events for history/analytics)
CREATE TABLE IF NOT EXISTS marketplace_activity (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  listing_id BIGINT,
  offer_id BIGINT,
  token_id BIGINT NOT NULL,
  fqdn VARCHAR(255),
  actor_wallet VARCHAR(42),
  counterparty_wallet VARCHAR(42),
  amount NUMERIC(36, 18),
  tx_hash VARCHAR(66),
  block_number BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for marketplace
CREATE INDEX IF NOT EXISTS idx_listings_token ON marketplace_listings(token_id);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON marketplace_listings(seller_wallet);
CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_fqdn ON marketplace_listings(fqdn);
CREATE INDEX IF NOT EXISTS idx_offers_token ON marketplace_offers(token_id);
CREATE INDEX IF NOT EXISTS idx_offers_offerer ON marketplace_offers(offerer_wallet);
CREATE INDEX IF NOT EXISTS idx_activity_token ON marketplace_activity(token_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON marketplace_activity(event_type);

-- Optimized composite indexes for marketplace queries (Phase 1.3)
CREATE INDEX IF NOT EXISTS idx_listings_active_created ON marketplace_listings(status, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_active_price ON marketplace_listings(status, price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_status_sold_at ON marketplace_listings(status, sold_at DESC) WHERE status = 'sold';

-- ============================================================
-- Standard indexes
-- ============================================================

-- Indexes
CREATE INDEX IF NOT EXISTS idx_domains_owner ON domains(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_domains_fqdn ON domains(fqdn);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_purchases(status);
CREATE INDEX IF NOT EXISTS idx_pending_wallet ON pending_purchases(wallet_address);
CREATE INDEX IF NOT EXISTS idx_events_block ON processed_events(block_number);

-- Insert default TLD (cryptofans)
INSERT INTO tlds (name, is_active)
VALUES ('cryptofans', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Flux Multi-GPU Generation Tables
-- Tracks parallel image generation across 3 GPUs
-- ============================================================

-- Generation status enum
DO $$ BEGIN
  CREATE TYPE flux_generation_status AS ENUM ('pending', 'generating', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Main generations table
CREATE TABLE IF NOT EXISTS flux_generations (
  id SERIAL PRIMARY KEY,
  generation_id UUID NOT NULL UNIQUE,
  wallet_address VARCHAR(42) NOT NULL,
  fqdn VARCHAR(255) NOT NULL,
  custom_prompt VARCHAR(500),
  status flux_generation_status DEFAULT 'pending',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  total_time_seconds NUMERIC(10, 2),
  success_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Individual images for each generation (3 per generation)
CREATE TABLE IF NOT EXISTS flux_generation_images (
  id SERIAL PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES flux_generations(generation_id) ON DELETE CASCADE,
  image_index INTEGER NOT NULL CHECK (image_index >= 0 AND image_index < 5),
  theme_id VARCHAR(50) NOT NULL,
  theme_name VARCHAR(100) NOT NULL,
  theme_category VARCHAR(20) NOT NULL,
  seed BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  server_name VARCHAR(20),
  generation_time_seconds NUMERIC(10, 2),
  image_cid VARCHAR(100),
  image_base64 TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(generation_id, image_index)
);

-- Add image_base64 column if table already exists (migration)
ALTER TABLE flux_generation_images ADD COLUMN IF NOT EXISTS image_base64 TEXT;

-- Track which image was selected for NFT
CREATE TABLE IF NOT EXISTS flux_nft_selections (
  id SERIAL PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES flux_generations(generation_id) ON DELETE CASCADE,
  selected_index INTEGER NOT NULL CHECK (selected_index >= 0 AND selected_index < 3),
  nft_prepared BOOLEAN DEFAULT false,
  metadata_cid VARCHAR(100),
  image_cid VARCHAR(100),
  selected_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(generation_id)
);

-- Indexes for flux generation queries
CREATE INDEX IF NOT EXISTS idx_flux_gen_wallet ON flux_generations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_flux_gen_fqdn ON flux_generations(fqdn);
CREATE INDEX IF NOT EXISTS idx_flux_gen_status ON flux_generations(status);
CREATE INDEX IF NOT EXISTS idx_flux_gen_created ON flux_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_flux_images_gen_id ON flux_generation_images(generation_id);
CREATE INDEX IF NOT EXISTS idx_flux_selections_gen_id ON flux_nft_selections(generation_id);

-- ============================================================
-- User Favorites & Share Preview Tables
-- For Register Page v2 features
-- ============================================================

-- User favorites table (themes and styles)
CREATE TABLE IF NOT EXISTS user_favorites (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  theme_id VARCHAR(100),
  style_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique index to prevent duplicate favorites (handles NULLs properly)
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique
  ON user_favorites(wallet_address, COALESCE(theme_id, ''), COALESCE(style_id, ''));

-- Shared images table (for share preview feature)
CREATE TABLE IF NOT EXISTS shared_images (
  id SERIAL PRIMARY KEY,
  share_id VARCHAR(16) UNIQUE NOT NULL,
  image_hash VARCHAR(100) NOT NULL,
  domain VARCHAR(255),
  model VARCHAR(50),
  themes JSONB,
  wallet_address VARCHAR(42),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for favorites and shared images
CREATE INDEX IF NOT EXISTS idx_favorites_wallet ON user_favorites(wallet_address);
CREATE INDEX IF NOT EXISTS idx_favorites_theme ON user_favorites(theme_id);
CREATE INDEX IF NOT EXISTS idx_favorites_style ON user_favorites(style_id);
CREATE INDEX IF NOT EXISTS idx_shared_images_share_id ON shared_images(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_images_wallet ON shared_images(wallet_address);

-- ============================================================
-- GPU Test Results Tables
-- Tracks comprehensive style/theme testing with LLaVA validation
-- ============================================================

-- Main test results table
CREATE TABLE IF NOT EXISTS gpu_test_results (
  id SERIAL PRIMARY KEY,
  test_run_id UUID NOT NULL,
  section_id VARCHAR(10) NOT NULL,
  batch_number INT NOT NULL,

  -- Generation details
  model VARCHAR(50),
  theme_id VARCHAR(100),
  theme_category VARCHAR(50),
  style_id VARCHAR(100),
  style_category VARCHAR(50),
  prompt TEXT,

  -- Output
  image_path TEXT,
  image_base64 TEXT,
  generation_time_ms INT,
  gpu_server VARCHAR(20),

  -- LLaVA scores (1-10)
  llava_style_score INT,
  llava_theme_score INT,
  llava_prompt_score INT,
  llava_quality_score INT,
  llava_reasoning TEXT,

  -- Status
  success BOOLEAN DEFAULT true,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for gpu_test_results
CREATE INDEX IF NOT EXISTS idx_gpu_test_section ON gpu_test_results(section_id);
CREATE INDEX IF NOT EXISTS idx_gpu_test_run ON gpu_test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_gpu_test_scores ON gpu_test_results(llava_style_score, llava_theme_score);
CREATE INDEX IF NOT EXISTS idx_gpu_test_model ON gpu_test_results(model);
CREATE INDEX IF NOT EXISTS idx_gpu_test_theme ON gpu_test_results(theme_id);
CREATE INDEX IF NOT EXISTS idx_gpu_test_style ON gpu_test_results(style_id);
CREATE INDEX IF NOT EXISTS idx_gpu_test_created ON gpu_test_results(created_at DESC);

-- Track section progress (for resume functionality)
CREATE TABLE IF NOT EXISTS gpu_test_progress (
  section_id VARCHAR(10) PRIMARY KEY,
  test_run_id UUID,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, running, completed, failed
  total_batches INT,
  completed_batches INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  avg_style_score DECIMAL(3,1),
  avg_theme_score DECIMAL(3,1),
  pass_rate DECIMAL(5,2)
);

-- Index for progress queries
CREATE INDEX IF NOT EXISTS idx_gpu_progress_status ON gpu_test_progress(status);

-- ============================================================
-- NFT Metadata Changes (IPFS Pinning Audit Trail)
-- Tracks all metadata updates for history and audit
-- ============================================================

-- NFT Metadata Changes Table
CREATE TABLE IF NOT EXISTS nft_metadata_changes (
  id SERIAL PRIMARY KEY,
  fqdn VARCHAR(255) NOT NULL,
  old_cid VARCHAR(128) NOT NULL,
  new_cid VARCHAR(128) NOT NULL,
  change_type VARCHAR(50) NOT NULL,  -- 'dns_update', 'regeneration', 'attribute_update', 'admin_update'
  change_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for metadata changes
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_fqdn ON nft_metadata_changes(fqdn);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_created_at ON nft_metadata_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_old_cid ON nft_metadata_changes(old_cid);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_new_cid ON nft_metadata_changes(new_cid);

-- IPFS Pinning Status Cache Table
-- Caches pin checks to avoid excessive API calls
CREATE TABLE IF NOT EXISTS ipfs_pinning_status (
  cid VARCHAR(128) PRIMARY KEY,
  pinata_pinned BOOLEAN DEFAULT FALSE,
  nft_storage_pinned BOOLEAN DEFAULT FALSE,
  last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  check_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding stale entries
CREATE INDEX IF NOT EXISTS idx_ipfs_pinning_status_last_checked ON ipfs_pinning_status(last_checked);

-- System Settings table (for feature flags and config)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default feature flags
INSERT INTO system_settings (key, value, description)
VALUES ('bulk_registration_enabled', 'true', 'Enable/disable bulk domain registration feature')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Simplified Registration: Buy First, Mint Later
-- NFT status tracking and credit transactions
-- ============================================================

-- Add nft_status column to domains table (placeholder vs customized)
DO $$ BEGIN
  ALTER TABLE domains ADD COLUMN IF NOT EXISTS nft_status VARCHAR(20) DEFAULT 'placeholder';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Index for filtering domains by NFT status
CREATE INDEX IF NOT EXISTS idx_domains_nft_status ON domains(nft_status);

-- Credit transactions table for audit trail
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  amount INTEGER NOT NULL,  -- positive = earned, negative = spent
  transaction_type VARCHAR(30) NOT NULL,  -- 'purchase_bonus', 'generation', 'finalization'
  reference_id VARCHAR(255),  -- fqdn or generation_id
  tx_hash VARCHAR(66),  -- blockchain tx if applicable
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for credit transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet ON credit_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);

-- Add source column to nft_preparations (registration vs dashboard)
DO $$ BEGIN
  ALTER TABLE nft_preparations ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'registration';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- URL Forwarding (redirect subdomains to external URLs)
-- ============================================================

-- URL forwards table
CREATE TABLE IF NOT EXISTS url_forwards (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  fqdn VARCHAR(255) NOT NULL UNIQUE,
  target_url VARCHAR(2048) NOT NULL,
  redirect_type SMALLINT NOT NULL DEFAULT 301,
  path_forwarding BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Grace Period & Domain Reclaim columns
-- ============================================================

ALTER TABLE domains ADD COLUMN IF NOT EXISTS grace_ends_at TIMESTAMPTZ;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS reclaimed_at TIMESTAMPTZ;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS auction_round INTEGER DEFAULT 0;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS current_auction_price NUMERIC;

-- Add 'reclaimed' and 'released' to domain_status enum if not exists
DO $$ BEGIN
  ALTER TYPE domain_status ADD VALUE IF NOT EXISTS 'reclaimed';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE domain_status ADD VALUE IF NOT EXISTS 'released';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes for grace period queries
CREATE INDEX IF NOT EXISTS idx_domains_grace_ends ON domains(grace_ends_at) WHERE grace_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_domains_reclaimed ON domains(reclaimed_at) WHERE reclaimed_at IS NOT NULL;

-- Indexes for url_forwards
CREATE INDEX IF NOT EXISTS idx_url_forwards_fqdn ON url_forwards(fqdn);
CREATE INDEX IF NOT EXISTS idx_url_forwards_domain_id ON url_forwards(domain_id);
CREATE INDEX IF NOT EXISTS idx_url_forwards_enabled ON url_forwards(enabled);

-- ============================================================
-- Domain Search Suggestions & Watch Alerts
-- ============================================================

-- Index on subdomain for prefix search (LIKE 'prefix%')
CREATE INDEX IF NOT EXISTS idx_domains_subdomain ON domains(subdomain);

-- Domain watch alerts (notify when a taken domain becomes available)
CREATE TABLE IF NOT EXISTS domain_watch_alerts (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  fqdn VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'watching',
  created_at TIMESTAMP DEFAULT NOW(),
  notified_at TIMESTAMP,
  UNIQUE(wallet_address, fqdn)
);

CREATE INDEX IF NOT EXISTS idx_watch_alerts_wallet ON domain_watch_alerts(wallet_address);
CREATE INDEX IF NOT EXISTS idx_watch_alerts_fqdn ON domain_watch_alerts(fqdn);
CREATE INDEX IF NOT EXISTS idx_watch_alerts_status ON domain_watch_alerts(status);

-- ============================================================
-- IPFS Contenthash (dnslink support)
-- ============================================================

ALTER TABLE domains ADD COLUMN IF NOT EXISTS contenthash TEXT;

-- ============================================================
-- Profile Pages (Web3 ENS-style profile for each subdomain)
-- ============================================================

-- Profile settings table
CREATE TABLE IF NOT EXISTS profile_settings (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE UNIQUE,
  bio TEXT,
  layout VARCHAR(20) DEFAULT 'standard',
  primary_color VARCHAR(7) DEFAULT '#6366f1',
  bg_color VARCHAR(7) DEFAULT '#0f172a',
  show_avatar BOOLEAN DEFAULT true,
  show_nft BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add domain_mode column to url_forwards (redirect vs profile)
ALTER TABLE url_forwards ADD COLUMN IF NOT EXISTS domain_mode VARCHAR(20) DEFAULT 'redirect';

-- Index for profile settings lookup
CREATE INDEX IF NOT EXISTS idx_profile_settings_domain_id ON profile_settings(domain_id);

-- ============================================================
-- Renewal Reminders (tracks which reminders have been sent per domain)
-- ============================================================

CREATE TABLE IF NOT EXISTS domain_reminders (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  fqdn VARCHAR(255) NOT NULL,
  owner_wallet VARCHAR(42) NOT NULL,
  reminder_days INTEGER NOT NULL,
  reminder_type VARCHAR(20) DEFAULT 'expiry',
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(domain_id, reminder_days)
);

CREATE INDEX IF NOT EXISTS idx_reminders_wallet ON domain_reminders(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_reminders_read ON domain_reminders(is_read, is_dismissed);
CREATE INDEX IF NOT EXISTS idx_reminders_created ON domain_reminders(created_at DESC);

-- FTSO Community Treasury reward epochs
CREATE TABLE IF NOT EXISTS ftso_reward_epochs (
  id SERIAL PRIMARY KEY,
  epoch_id INTEGER NOT NULL UNIQUE,
  snapshot1_block BIGINT,
  snapshot2_block BIGINT,
  merkle_root VARCHAR(66),
  total_reward NUMERIC(36, 18),
  total_holders INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  finalized_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ftso_reward_claims (
  id SERIAL PRIMARY KEY,
  epoch_id INTEGER NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  amount NUMERIC(36, 18) NOT NULL,
  merkle_proof JSONB NOT NULL,
  claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMP,
  tx_hash VARCHAR(66),
  UNIQUE(epoch_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_ftso_claims_wallet ON ftso_reward_claims(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ftso_claims_epoch ON ftso_reward_claims(epoch_id);
CREATE INDEX IF NOT EXISTS idx_ftso_claims_unclaimed ON ftso_reward_claims(wallet_address, claimed) WHERE claimed = false;

-- ============================================================
-- Developer API Keys (programmatic access)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_hash VARCHAR(64) NOT NULL UNIQUE,
  wallet_address VARCHAR(42) NOT NULL,
  label VARCHAR(100) NOT NULL DEFAULT 'My API Key',
  tier VARCHAR(10) NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro')),
  requests_today INTEGER DEFAULT 0,
  requests_month INTEGER DEFAULT 0,
  last_request_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(wallet_address);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- ============================================================
-- Email Notification System (Resend integration)
-- ============================================================

-- User email preferences
CREATE TABLE IF NOT EXISTS user_emails (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(64),
  verification_expires_at TIMESTAMP,
  unsubscribe_token VARCHAR(64) NOT NULL DEFAULT gen_random_uuid(),
  preferences JSONB DEFAULT '{"registration": true, "marketplace": true, "renewal": true, "marketing": false}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP
);

-- Email verification tracking
CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Email send log
CREATE TABLE IF NOT EXISTS email_log (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42),
  email VARCHAR(255) NOT NULL,
  email_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  resend_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_emails_wallet ON user_emails(wallet_address);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_log_wallet ON email_log(wallet_address);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);

-- ============================================================
-- User Domain Defaults (auto-apply DNS records to new domains)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_domain_defaults (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  ipv4 VARCHAR(45),
  ipv6 VARCHAR(45),
  cname VARCHAR(255),
  txt TEXT,
  default_layout VARCHAR(20) DEFAULT 'standard',
  auto_apply BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_defaults_wallet ON user_domain_defaults(wallet_address);

-- ============================================================
-- TLD Staking v2 Tables
-- New tables for the hierarchical TLD/SLD staking system.
-- Coexist with original tables during transition.
-- ============================================================

-- tlds_v2 — TLD registry (mirrors on-chain HsrTld)
CREATE TABLE IF NOT EXISTS tlds_v2 (
  id SERIAL PRIMARY KEY,
  token_id INTEGER NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL UNIQUE,
  namehash CHAR(66) NOT NULL UNIQUE,
  owner_address CHAR(42) NOT NULL,
  registration_enabled BOOLEAN DEFAULT false,
  strategy_address CHAR(42),
  resolver_address CHAR(42),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tlds_v2_namehash ON tlds_v2(namehash);
CREATE INDEX IF NOT EXISTS idx_tlds_v2_owner ON tlds_v2(owner_address);

-- slds_v2 — SLD registry (mirrors on-chain HsrSld)
CREATE TABLE IF NOT EXISTS slds_v2 (
  id SERIAL PRIMARY KEY,
  token_id INTEGER NOT NULL UNIQUE,
  label VARCHAR(255) NOT NULL,
  tld_id INTEGER NOT NULL REFERENCES tlds_v2(id),
  namehash CHAR(66) NOT NULL UNIQUE,
  full_name VARCHAR(512) NOT NULL,
  owner_address CHAR(42) NOT NULL,
  registration_time TIMESTAMP NOT NULL,
  expiry_time TIMESTAMP NOT NULL,
  registration_price_usd_cents INTEGER NOT NULL,
  resolver_address CHAR(42),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slds_v2_full_name ON slds_v2(full_name);
CREATE INDEX IF NOT EXISTS idx_slds_v2_owner ON slds_v2(owner_address);
CREATE INDEX IF NOT EXISTS idx_slds_v2_expiry ON slds_v2(expiry_time);
CREATE INDEX IF NOT EXISTS idx_slds_v2_tld ON slds_v2(tld_id);

-- sld_artwork_v2 — Artwork generation queue
CREATE TABLE IF NOT EXISTS sld_artwork_v2 (
  id SERIAL PRIMARY KEY,
  sld_id INTEGER NOT NULL REFERENCES slds_v2(id),
  token_id INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  prompt TEXT,
  seed BIGINT,
  ipfs_cid VARCHAR(100),
  gpu_worker VARCHAR(50),
  generation_time_ms INTEGER,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sld_artwork_v2_status ON sld_artwork_v2(status);
CREATE INDEX IF NOT EXISTS idx_sld_artwork_v2_token ON sld_artwork_v2(token_id);

-- tld_pricing_v2 — Cached pricing config from chain
CREATE TABLE IF NOT EXISTS tld_pricing_v2 (
  tld_id INTEGER PRIMARY KEY REFERENCES tlds_v2(id),
  length_prices INTEGER[10],
  multi_year_discounts INTEGER[10],
  updated_at TIMESTAMP DEFAULT NOW()
);

-- premium_names_v2
CREATE TABLE IF NOT EXISTS premium_names_v2 (
  id SERIAL PRIMARY KEY,
  tld_id INTEGER NOT NULL REFERENCES tlds_v2(id),
  label VARCHAR(255) NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  UNIQUE(tld_id, label)
);

-- reserved_names_v2
CREATE TABLE IF NOT EXISTS reserved_names_v2 (
  id SERIAL PRIMARY KEY,
  tld_id INTEGER NOT NULL REFERENCES tlds_v2(id),
  label VARCHAR(255) NOT NULL,
  reserved_for CHAR(42) NOT NULL,
  UNIQUE(tld_id, label)
);

-- pending_claims — FDC staking (Phase 2 table, created now)
CREATE TABLE IF NOT EXISTS pending_claims (
  id SERIAL PRIMARY KEY,
  tld_label VARCHAR(255) NOT NULL,
  claimer_address CHAR(42) NOT NULL,
  namehash CHAR(66) NOT NULL,
  staking_fee_paid NUMERIC(30,18),
  fdc_round_id INTEGER,
  attestation_request_bytes TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  tx_hash CHAR(66),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  last_error TEXT,
  attempts INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pending_claims_status ON pending_claims(status);
CREATE INDEX IF NOT EXISTS idx_pending_claims_claimer ON pending_claims(claimer_address);
CREATE INDEX IF NOT EXISTS idx_pending_claims_namehash ON pending_claims(namehash);

-- registration_events_v2 — Analytics
CREATE TABLE IF NOT EXISTS registration_events_v2 (
  id SERIAL PRIMARY KEY,
  sld_id INTEGER REFERENCES slds_v2(id),
  event_type VARCHAR(20) NOT NULL,
  tx_hash CHAR(66),
  flr_amount NUMERIC(30,18),
  usd_amount NUMERIC(10,2),
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_events_v2_type ON registration_events_v2(event_type);
CREATE INDEX IF NOT EXISTS idx_reg_events_v2_sld ON registration_events_v2(sld_id);
CREATE INDEX IF NOT EXISTS idx_reg_events_v2_ts ON registration_events_v2(timestamp DESC);

-- Additional columns for event listener (ts-031)
ALTER TABLE sld_artwork_v2 ADD COLUMN IF NOT EXISTS tld_namehash CHAR(66);
ALTER TABLE sld_artwork_v2 ADD COLUMN IF NOT EXISTS label VARCHAR(255);
ALTER TABLE sld_artwork_v2 ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE registration_events_v2 ADD COLUMN IF NOT EXISTS tld_namehash CHAR(66);
ALTER TABLE registration_events_v2 ADD COLUMN IF NOT EXISTS payer_address CHAR(42);

-- pending_claims: add unique constraint on namehash (ts-032)
DO $$ BEGIN
  ALTER TABLE pending_claims ADD CONSTRAINT pending_claims_namehash_unique UNIQUE (namehash);
EXCEPTION
  WHEN duplicate_table THEN null;
  WHEN duplicate_object THEN null;
END $$;

-- HSR v2 Marketplace: is_official + staked_at columns on tlds_v2
ALTER TABLE tlds_v2 ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT false;
ALTER TABLE tlds_v2 ADD COLUMN IF NOT EXISTS staked_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tlds_v2_is_official ON tlds_v2(is_official);

-- tld_stats materialized view for fast browse queries
CREATE MATERIALIZED VIEW IF NOT EXISTS tld_stats AS
SELECT
  t.id AS tld_id,
  t.token_id,
  t.label,
  t.namehash,
  t.owner_address,
  t.is_official,
  t.registration_enabled,
  t.staked_at,
  t.created_at,
  COUNT(DISTINCT s.id) AS sld_count,
  COALESCE(MIN(
    CASE WHEN p.length_prices IS NOT NULL THEN p.length_prices[5] ELSE NULL END
  ), 0) AS starting_price_usd_cents,
  COALESCE(SUM(DISTINCT re.usd_amount), 0) AS total_revenue_usd
FROM tlds_v2 t
LEFT JOIN slds_v2 s ON s.tld_id = t.id
LEFT JOIN tld_pricing_v2 p ON p.tld_id = t.id
LEFT JOIN registration_events_v2 re ON re.tld_namehash = t.namehash
GROUP BY t.id, t.token_id, t.label, t.namehash, t.owner_address,
         t.is_official, t.registration_enabled, t.staked_at, t.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tld_stats_tld_id ON tld_stats(tld_id);
CREATE INDEX IF NOT EXISTS idx_tld_stats_official ON tld_stats(is_official);
CREATE INDEX IF NOT EXISTS idx_tld_stats_sld_count ON tld_stats(sld_count DESC);

-- v2-056: TLD Display Name + Description (profile fields)
ALTER TABLE tlds_v2 ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE tlds_v2 ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tlds_v2 ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ============================================================
-- Auction House & HNS Marketplace (auc-011)
-- ============================================================

-- auc-001: Discovered auctions (populated by block scanner)
CREATE TABLE IF NOT EXISTS discovered_auctions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(63) NOT NULL UNIQUE,
  state VARCHAR(20) NOT NULL,
  open_height INTEGER,
  bid_count INTEGER DEFAULT 0,
  highest_lockup BIGINT DEFAULT 0,
  reveal_count INTEGER DEFAULT 0,
  highest_reveal BIGINT DEFAULT 0,
  winner_address VARCHAR(200),
  bidding_ends_height INTEGER,
  reveal_ends_height INTEGER,
  current_height INTEGER,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_da_state ON discovered_auctions(state);
CREATE INDEX IF NOT EXISTS idx_da_open_height ON discovered_auctions(open_height DESC);
CREATE INDEX IF NOT EXISTS idx_da_bidding_ends ON discovered_auctions(bidding_ends_height);
CREATE INDEX IF NOT EXISTS idx_da_reveal_ends ON discovered_auctions(reveal_ends_height);
CREATE INDEX IF NOT EXISTS idx_da_updated ON discovered_auctions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_da_bid_count ON discovered_auctions(bid_count DESC);
CREATE INDEX IF NOT EXISTS idx_da_name ON discovered_auctions(name);

-- auc-002: Individual bid records (for bid history display)
CREATE TABLE IF NOT EXISTS auction_bids (
  id SERIAL PRIMARY KEY,
  name VARCHAR(63) NOT NULL,
  tx_hash VARCHAR(64) NOT NULL,
  block_height INTEGER NOT NULL,
  covenant_type VARCHAR(20) NOT NULL,
  lockup_value BIGINT,
  reveal_value BIGINT,
  address VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tx_hash, name, covenant_type)
);

CREATE INDEX IF NOT EXISTS idx_ab_name ON auction_bids(name);
CREATE INDEX IF NOT EXISTS idx_ab_height ON auction_bids(block_height DESC);
CREATE INDEX IF NOT EXISTS idx_ab_name_height ON auction_bids(name, block_height DESC);
CREATE INDEX IF NOT EXISTS idx_ab_covenant_created ON auction_bids(covenant_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_covenant_address ON auction_bids(covenant_type, address);

-- auc-003: Block scan checkpoint (single-row table)
CREATE TABLE IF NOT EXISTS block_scan_checkpoint (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_processed_height INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- auc-004: HNS marketplace listings (secondary market for owned names)
CREATE TABLE IF NOT EXISTS hns_marketplace_listings (
  id SERIAL PRIMARY KEY,
  name VARCHAR(63) NOT NULL,
  seller_flare_address VARCHAR(42) NOT NULL,
  price_hns NUMERIC(18, 6) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'active',
  buyer_flare_address VARCHAR(42),
  transfer_tx_hash VARCHAR(64),
  listed_at TIMESTAMPTZ DEFAULT NOW(),
  sold_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hml_active_name ON hns_marketplace_listings(name) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS idx_hml_status ON hns_marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_hml_price ON hns_marketplace_listings(price_hns) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS idx_hml_seller ON hns_marketplace_listings(seller_flare_address);
CREATE INDEX IF NOT EXISTS idx_hml_listed ON hns_marketplace_listings(listed_at DESC);

-- auc-005: HNS marketplace activity log
CREATE TABLE IF NOT EXISTS hns_marketplace_activity (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL,
  name VARCHAR(63) NOT NULL,
  listing_id INTEGER REFERENCES hns_marketplace_listings(id),
  actor_address VARCHAR(42),
  price_hns NUMERIC(18, 6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hma_name ON hns_marketplace_activity(name);
CREATE INDEX IF NOT EXISTS idx_hma_created ON hns_marketplace_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hma_type ON hns_marketplace_activity(event_type);

-- auc-006: Escrow tracking columns on marketplace listings
DO $$ BEGIN
  ALTER TABLE hns_marketplace_listings ADD COLUMN IF NOT EXISTS escrow_status TEXT DEFAULT 'none';
  ALTER TABLE hns_marketplace_listings ADD COLUMN IF NOT EXISTS escrow_transfer_tx TEXT;
  ALTER TABLE hns_marketplace_listings ADD COLUMN IF NOT EXISTS escrow_finalize_tx TEXT;
  ALTER TABLE hns_marketplace_listings ADD COLUMN IF NOT EXISTS escrow_block_height INTEGER;
END $$;

-- auc-007: HNS marketplace offers
CREATE TABLE IF NOT EXISTS hns_marketplace_offers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(63) NOT NULL,
  listing_id INTEGER,
  offerer_address VARCHAR(128) NOT NULL,
  offer_hns DECIMAL(18,6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'accepted', 'cancelled', 'expired')),
  escrow_tx TEXT,
  hns_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hns_offers_name ON hns_marketplace_offers(name);
CREATE INDEX IF NOT EXISTS idx_hns_offers_offerer ON hns_marketplace_offers(offerer_address);
CREATE INDEX IF NOT EXISTS idx_hns_offers_status ON hns_marketplace_offers(status);

-- auc-008: HNS notifications
CREATE TABLE IF NOT EXISTS hns_notifications (
  id SERIAL PRIMARY KEY,
  recipient_address VARCHAR(128) NOT NULL,
  name VARCHAR(63) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hns_notif_recipient ON hns_notifications(recipient_address);
CREATE INDEX IF NOT EXISTS idx_hns_notif_unread ON hns_notifications(recipient_address, read);

-- auc-009: Watchlist state tracking column
DO $$ BEGIN
  ALTER TABLE hns_watchlist ADD COLUMN IF NOT EXISTS last_known_state VARCHAR(20);
EXCEPTION
  WHEN undefined_table THEN null;
END $$;

-- auc-010: HNS name status cache (for expiring domains, avoids N+1 hsd RPC calls)
CREATE TABLE IF NOT EXISTS hns_name_status (
  name VARCHAR(63) PRIMARY KEY,
  state VARCHAR(20),
  renewal_block INTEGER,
  expiry_block INTEGER,
  grace_ends_block INTEGER,
  owner_hash VARCHAR(128),
  value_locked BIGINT DEFAULT 0,
  highest_bid BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hns_name_status_expiry ON hns_name_status(expiry_block);
CREATE INDEX IF NOT EXISTS idx_hns_name_status_state ON hns_name_status(state);
`;

async function migrate() {
  console.log('Running database migrations...');
  try {
    await pool.query(migrations);
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate();
