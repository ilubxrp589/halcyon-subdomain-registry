-- NFT Metadata Changes Table
-- Tracks all metadata updates for audit trail and history

CREATE TABLE IF NOT EXISTS nft_metadata_changes (
  id SERIAL PRIMARY KEY,
  fqdn VARCHAR(255) NOT NULL,
  old_cid VARCHAR(128) NOT NULL,
  new_cid VARCHAR(128) NOT NULL,
  change_type VARCHAR(50) NOT NULL,  -- 'dns_update', 'regeneration', 'attribute_update', etc.
  change_details JSONB,               -- Details of what changed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index for quick lookups by domain
  CONSTRAINT fk_domain FOREIGN KEY (fqdn) REFERENCES domains(fqdn) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_fqdn ON nft_metadata_changes(fqdn);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_created_at ON nft_metadata_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_old_cid ON nft_metadata_changes(old_cid);
CREATE INDEX IF NOT EXISTS idx_nft_metadata_changes_new_cid ON nft_metadata_changes(new_cid);

-- Pinning Status Cache Table (optional - for caching pin checks)
CREATE TABLE IF NOT EXISTS ipfs_pinning_status (
  cid VARCHAR(128) PRIMARY KEY,
  pinata_pinned BOOLEAN DEFAULT FALSE,
  nft_storage_pinned BOOLEAN DEFAULT FALSE,
  last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  check_count INTEGER DEFAULT 0,

  -- Auto-update timestamp
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding stale entries
CREATE INDEX IF NOT EXISTS idx_ipfs_pinning_status_last_checked ON ipfs_pinning_status(last_checked);
