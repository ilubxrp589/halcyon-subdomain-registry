// Handshake blockchain timing constants
export const BLOCK_TIME_MS = 10 * 60 * 1000; // 10 minutes per block = 600,000ms
export const BLOCKS_PER_DAY = 144;            // ~10 min blocks, 144/day

// Auction phase durations (in blocks)
export const AUCTION_OPEN_PERIOD = 37;        // ~6 hours
export const AUCTION_BID_PERIOD = 720;        // ~5 days
export const AUCTION_REVEAL_PERIOD = 1440;    // ~10 days
export const TRANSFER_LOCKUP = 288;           // ~2 days

// Name lifecycle
export const NAME_EXPIRY_BLOCKS = 105120;     // ~2 years
export const RENEWAL_WINDOW_BLOCKS = 4320;    // ~30 days before expiry
export const GRACE_PERIOD_BLOCKS = 4320;      // ~30 days after expiry

// Polling intervals (ms)
export const AUCTION_POLL_INTERVAL = 30000;   // 30 seconds
export const NOTIFICATION_POLL_INTERVAL = 30000; // 30 seconds
