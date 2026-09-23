import { loggers } from '../utils/logger.js';
import { query } from '../db/index.js';
import hnsService from './hns.js';
import { hnsWalletService, walletIdFromFlare } from './hnsWallet.js';

const log = loggers.hns;

const POLL_INTERVAL = 30000; // 30 seconds

/**
 * HNS Wallet Monitor
 *
 * Polls all registered wallets for new TLD arrivals.
 * When a TLD is detected (transferred in from Bob Wallet, ShakeStation, etc.),
 * the monitor auto-sets the `flr:0x{flareAddress}` TXT record.
 *
 * This is the killer UX: transfer TLD in -> auto-linked -> one-click FDC stake.
 */
class HNSWalletMonitor {
  constructor() {
    this._knownNames = new Map();   // walletId -> Set<string>
    this._walletMap = new Map();    // walletId -> flareAddress
    this._interval = null;
    this._running = false;
  }

  /**
   * Start the monitor.
   * Loads all registered wallets, snapshots their names, begins polling.
   */
  async start() {
    if (this._running) return;

    try {
      // Load all registered wallets from DB
      const wallets = await hnsWalletService.getAllRegisteredWallets();
      log.info({ count: wallets.length }, 'HNS wallet monitor loading wallets');

      // Snapshot current names for each wallet
      for (const { flare_address, wallet_id } of wallets) {
        this._walletMap.set(wallet_id, flare_address);
        await this._snapshotNames(wallet_id);
      }

      this._running = true;
      this._interval = setInterval(() => this._pollAll(), POLL_INTERVAL);
      log.info('HNS wallet monitor started');
    } catch (err) {
      log.error({ err }, 'Failed to start HNS wallet monitor');
    }
  }

  /**
   * Stop the monitor.
   */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._running = false;
    log.info('HNS wallet monitor stopped');
  }

  /**
   * Register a new wallet for monitoring (called when a wallet is first created).
   */
  async registerWallet(walletId, flareAddress) {
    this._walletMap.set(walletId, flareAddress);
    await this._snapshotNames(walletId);
    log.info({ walletId }, 'Registered wallet for monitoring');
  }

  /**
   * Snapshot current owned names for a wallet.
   */
  async _snapshotNames(walletId) {
    try {
      const wallet = hnsService.walletClient.wallet(walletId);
      const names = await wallet.getNames() || [];
      const owned = new Set(
        names.filter(n => n.state === 'CLOSED').map(n => n.name)
      );
      this._knownNames.set(walletId, owned);
    } catch (err) {
      // Wallet may not exist yet — that's fine
      if (!err.message?.includes('not found') && err.code !== 404 && err.statusCode !== 404) {
        log.warn({ err, walletId }, 'Failed to snapshot names');
      }
      this._knownNames.set(walletId, new Set());
    }
  }

  /**
   * Poll all registered wallets for new TLD arrivals.
   */
  async _pollAll() {
    for (const [walletId, flareAddress] of this._walletMap) {
      try {
        await this._pollWallet(walletId, flareAddress);
      } catch (err) {
        log.warn({ err, walletId }, 'Poll failed for wallet');
      }
    }
  }

  /**
   * Check a single wallet for new names.
   */
  async _pollWallet(walletId, flareAddress) {
    const wallet = hnsService.walletClient.wallet(walletId);

    let names;
    try {
      names = await wallet.getNames();
    } catch (err) {
      // Wallet may have been removed or hsd is down
      return;
    }

    if (!names) return; // hsd returned null for empty wallet

    const currentNames = new Set(
      names.filter(n => n.state === 'CLOSED').map(n => n.name)
    );
    const previousNames = this._knownNames.get(walletId) || new Set();

    // Detect new names
    for (const name of currentNames) {
      if (!previousNames.has(name)) {
        log.info({ walletId, name, flareAddress: flareAddress.slice(0, 10) },
          'New TLD detected in wallet');
        await this._handleNewName(walletId, flareAddress, name);
      }
    }

    this._knownNames.set(walletId, currentNames);
  }

  /**
   * Handle a newly detected TLD: auto-set flr:0x... TXT record.
   */
  async _handleNewName(walletId, flareAddress, tldName) {
    try {
      const wallet = hnsService.walletClient.wallet(walletId);

      // Check if flr: TXT already exists
      let resource;
      try {
        resource = await wallet.getResource(tldName);
      } catch {
        resource = null;
      }

      const records = resource?.records || [];
      const txtRecord = records.find(r => r.type === 'TXT');
      const flrValue = 'flr:' + flareAddress;

      // Skip if the correct flr: TXT already exists
      if (txtRecord?.txt?.includes(flrValue)) {
        log.info({ walletId, tldName }, 'TLD already has correct flr: TXT — skipping');
        await this._logEvent(flareAddress, walletId, 'tld_received', tldName, {
          action: 'skipped', reason: 'flr_txt_exists',
        });
        return;
      }

      // Build updated records array
      const newRecords = [...records];
      let existingTxt = newRecords.find(r => r.type === 'TXT');

      if (existingTxt) {
        if (!Array.isArray(existingTxt.txt)) existingTxt.txt = [];
        // Remove any old flr: entries, add new one
        existingTxt.txt = existingTxt.txt.filter(t => !t.startsWith('flr:'));
        existingTxt.txt.push(flrValue);
      } else {
        newRecords.push({ type: 'TXT', txt: [flrValue] });
      }

      // Set the TXT record
      const result = await wallet.createUpdate({
        name: tldName,
        data: { records: newRecords },
      });

      log.info({
        walletId, tldName, flareAddress: flareAddress.slice(0, 10),
        txHash: result.hash,
      }, 'Auto-set flr: TXT on new TLD');

      await this._logEvent(flareAddress, walletId, 'auto_txt_set', tldName, {
        txHash: result.hash, flareAddress,
      });
    } catch (err) {
      log.error({ err, walletId, tldName }, 'Auto-TXT failed — queueing for retry');

      // Queue event for retry on next login
      await this._logEvent(flareAddress, walletId, 'auto_txt_queued', tldName, {
        error: err.message,
      });
    }
  }

  /**
   * Log a wallet event to the database.
   */
  async _logEvent(flareAddress, walletId, eventType, tldName, details) {
    try {
      await query(
        `INSERT INTO hns_wallet_events (flare_address, wallet_id, event_type, tld_name, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [flareAddress.toLowerCase(), walletId, eventType, tldName, JSON.stringify(details)]
      );
    } catch (err) {
      log.warn({ err }, 'Failed to log wallet event');
    }
  }

  /**
   * Process any queued auto-TXT events for a user (called on login).
   */
  async processQueuedEvents(flareAddress) {
    try {
      const result = await query(
        `SELECT id, wallet_id, tld_name FROM hns_wallet_events
         WHERE flare_address = $1 AND event_type = 'auto_txt_queued'
         ORDER BY created_at ASC`,
        [flareAddress.toLowerCase()]
      );

      if (result.rows.length === 0) return;

      log.info({ count: result.rows.length, flareAddress: flareAddress.slice(0, 10) },
        'Processing queued auto-TXT events');

      for (const row of result.rows) {
        await this._handleNewName(row.wallet_id, flareAddress, row.tld_name);

        // Remove the queued event (it's now either auto_txt_set or re-queued)
        await query('DELETE FROM hns_wallet_events WHERE id = $1', [row.id]);
      }
    } catch (err) {
      log.error({ err }, 'processQueuedEvents failed');
    }
  }
}

export const hnsWalletMonitor = new HNSWalletMonitor();
export default hnsWalletMonitor;
