import { WalletClient } from 'hs-client';
import { createHash } from 'crypto';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { query } from '../db/index.js';

const log = loggers.hns;

/**
 * Derive hsd wallet ID from a Flare address.
 * Format: hsr-{first 12 hex chars of address} (lowercase, no 0x prefix)
 */
function walletIdFromFlare(flareAddress) {
  return 'hsr-' + flareAddress.toLowerCase().slice(2, 14);
}

/**
 * Derive a deterministic wallet passphrase from the user's Flare signature.
 * The passphrase is SHA-256(signature) — never stored, re-derived each session.
 * This ensures HSR operator cannot access user wallets without their Flare key.
 */
function derivePassphrase(signature) {
  return createHash('sha256').update(signature).digest('hex');
}

/**
 * HNS Wallet Service
 * Per-user wallet management via hsd's wallet API (port 12039).
 * Each Flare address maps 1:1 to an hsd wallet.
 */
class HNSWalletService {
  constructor() {
    this.walletClient = new WalletClient({
      host: config.hns.host,
      port: config.hns.walletPort,
      apiKey: config.hns.apiKey,
    });
  }

  /**
   * Get or create an hsd wallet for a Flare address.
   * Creates if not exists, returns wallet info + receive address.
   */
  async getOrCreateWallet(flareAddress, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      // Try to get existing wallet
      const wallet = this.walletClient.wallet(walletId);
      const info = await wallet.getInfo();

      // hsd returns null (not error) for non-existent wallets
      if (!info) {
        return this._createWallet(flareAddress, walletId, signature);
      }

      // Wallet exists — ensure it's registered in DB
      await this._ensureDbRecord(flareAddress, walletId);

      const account = await wallet.getAccount('default').catch(() => null);
      const balance = await wallet.getBalance().catch(() => null);

      return {
        success: true,
        walletId,
        address: account?.receiveAddress || null,
        balance: {
          confirmed: (balance?.confirmed || 0) / 1e6,
          unconfirmed: (balance?.unconfirmed || 0) / 1e6,
        },
        txCount: info?.txCount || 0,
        isNew: false,
      };
    } catch (err) {
      // Wallet doesn't exist — create it
      if (err.message?.includes('not found') || err.code === 404 || err.statusCode === 404) {
        return this._createWallet(flareAddress, walletId, signature);
      }
      log.error({ err, walletId }, 'getOrCreateWallet failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Create a new hsd wallet and encrypt it with a passphrase derived from the user's signature.
   * The passphrase is never stored — only the user's Flare wallet can reproduce it.
   */
  async _createWallet(flareAddress, walletId, signature) {
    try {
      const result = await this.walletClient.createWallet(walletId, {
        type: 'pubkeyhash',
        witness: false,
      });

      // Encrypt the wallet so operator cannot access keys at rest
      if (signature) {
        const passphrase = derivePassphrase(signature);
        const wallet = this.walletClient.wallet(walletId);
        await wallet.setPassphrase(passphrase);
        log.info({ walletId }, 'Wallet encrypted with user-derived passphrase');
      }

      // Register in DB
      await this._ensureDbRecord(flareAddress, walletId);

      const wallet = this.walletClient.wallet(walletId);
      const account = await wallet.getAccount('default');

      log.info({ walletId, flareAddress: flareAddress.slice(0, 10) }, 'Created HNS wallet');

      return {
        success: true,
        walletId,
        address: account?.receiveAddress || null,
        balance: { confirmed: 0, unconfirmed: 0 },
        txCount: 0,
        isNew: true,
      };
    } catch (err) {
      log.error({ err, walletId }, '_createWallet failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Unlock a wallet for a write operation using the user's signature.
   * Wallet auto-locks after the timeout (default 60s).
   * For unencrypted wallets (legacy/pre-encryption), this is a no-op.
   */
  async _unlockWallet(walletId, signature, timeout = 60) {
    if (!signature) return; // Read-only operations don't need unlock
    const passphrase = derivePassphrase(signature);
    const wallet = this.walletClient.wallet(walletId);
    try {
      await wallet.unlock(passphrase, timeout);
    } catch (err) {
      // If wallet is not encrypted (legacy), unlock fails — that's OK, wallet is already open
      if (err.message?.includes('not encrypted') || err.message?.includes('already unlocked')) {
        return;
      }
      throw err;
    }
  }

  /**
   * Get wallet info: balance, address, name count.
   */
  async getWalletInfo(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const [info, balance, account, names] = await Promise.all([
        wallet.getInfo(),
        wallet.getBalance().catch(() => null),
        wallet.getAccount('default').catch(() => null),
        wallet.getNames().catch(() => null),
      ]);

      const ownedNames = (names || []).filter(n => n.state === 'CLOSED');

      return {
        success: true,
        walletId,
        address: account?.receiveAddress || null,
        balance: {
          confirmed: (balance?.confirmed || 0) / 1e6,
          unconfirmed: (balance?.unconfirmed || 0) / 1e6,
        },
        txCount: info?.txCount || 0,
        nameCount: ownedNames.length,
      };
    } catch (err) {
      log.error({ err, walletId }, 'getWalletInfo failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all TLDs owned by this wallet (state=CLOSED).
   */
  async getOwnedNames(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames() || [];

      const owned = names.filter(n => n.state === 'CLOSED');

      return {
        success: true,
        names: owned.map(n => ({
          name: n.name,
          state: n.state,
          height: n.height,
          renewal: n.renewal,
          transfer: n.transfer,
        })),
      };
    } catch (err) {
      log.error({ err, walletId }, 'getOwnedNames failed');
      return { success: false, error: err.message, names: [] };
    }
  }

  /**
   * Get auctions this wallet participates in.
   */
  async getAuctions(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames() || [];

      // Include names in auction states
      const auctionStates = ['OPENING', 'BIDDING', 'REVEAL', 'CLOSED'];
      const auctions = names.filter(n => auctionStates.includes(n.state));

      return {
        success: true,
        auctions: auctions.map(n => ({
          name: n.name,
          state: n.state,
          height: n.height,
          renewal: n.renewal,
        })),
      };
    } catch (err) {
      log.error({ err, walletId }, 'getAuctions failed');
      return { success: false, error: err.message, auctions: [] };
    }
  }

  /**
   * Get transaction history.
   */
  async getHistory(flareAddress, limit = 50) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const txs = await wallet.getHistory('default') || [];

      const history = txs.slice(0, limit).map(tx => ({
        hash: tx.hash,
        height: tx.height,
        time: tx.mtime || tx.time,
        confirmations: tx.confirmations || 0,
        inputs: tx.inputs?.length || 0,
        outputs: tx.outputs?.length || 0,
      }));

      return { success: true, history };
    } catch (err) {
      log.error({ err, walletId }, 'getHistory failed');
      return { success: false, error: err.message, history: [] };
    }
  }

  // =========================================================
  //                    AUCTION OPERATIONS
  // =========================================================

  async openAuction(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createOpen({ name });

      log.info({ walletId, name, txHash: result.hash }, 'Opened auction');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'openAuction failed');
      return { success: false, error: err.message };
    }
  }

  async placeBid(flareAddress, name, bidAmount, lockupAmount, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    if (lockupAmount < bidAmount) {
      return { success: false, error: 'Lockup must be >= bid amount' };
    }

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createBid({
        name,
        bid: Math.round(bidAmount * 1e6),
        lockup: Math.round(lockupAmount * 1e6),
      });

      log.info({ walletId, name, bid: bidAmount, lockup: lockupAmount, txHash: result.hash }, 'Placed bid');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'placeBid failed');
      return { success: false, error: err.message };
    }
  }

  async revealBid(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createReveal({ name });

      log.info({ walletId, name, txHash: result.hash }, 'Revealed bid');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'revealBid failed');
      return { success: false, error: err.message };
    }
  }

  async redeemBid(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createRedeem({ name });

      log.info({ walletId, name, txHash: result.hash }, 'Redeemed bid');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'redeemBid failed');
      return { success: false, error: err.message };
    }
  }

  async finalizeAuction(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createFinalize({ name });

      log.info({ walletId, name, txHash: result.hash }, 'Finalized auction');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'finalizeAuction failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //                  NAME MANAGEMENT
  // =========================================================

  /**
   * Update DNS records on a TLD.
   */
  async updateDnsRecords(flareAddress, name, records, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createUpdate({
        name,
        data: { records },
      });

      log.info({ walletId, name, txHash: result.hash }, 'Updated DNS records');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'updateDnsRecords failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Auto-set flr:0x{addr} TXT record on a TLD.
   * Preserves existing records, replaces any existing flr: TXT.
   */
  async setFlareAddress(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);

      // Get current resource records
      const resource = await wallet.getResource(name);
      let records = resource?.records || [];

      // Find existing TXT record
      let txtRecord = records.find(r => r.type === 'TXT');
      const flrValue = 'flr:' + flareAddress;

      if (txtRecord) {
        // Remove any existing flr: entries, add new one
        if (!Array.isArray(txtRecord.txt)) txtRecord.txt = [];
        txtRecord.txt = txtRecord.txt.filter(t => !t.startsWith('flr:'));
        txtRecord.txt.push(flrValue);
      } else {
        // Create new TXT record
        records.push({ type: 'TXT', txt: [flrValue] });
      }

      const result = await wallet.createUpdate({
        name,
        data: { records },
      });

      log.info({ walletId, name, flareAddress: flareAddress.slice(0, 10), txHash: result.hash }, 'Set Flare address TXT');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'setFlareAddress failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Transfer a TLD to another HNS address.
   */
  async transferName(flareAddress, name, toAddress, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createTransfer({ name, address: toAddress });

      log.info({ walletId, name, to: toAddress, txHash: result.hash }, 'Initiated transfer');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'transferName failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Renew a TLD.
   */
  async renewName(flareAddress, name, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createRenewal({ name });

      log.info({ walletId, name, txHash: result.hash }, 'Renewed name');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'renewName failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //                     PAYMENT
  // =========================================================

  /**
   * Send HNS to an address.
   */
  async sendHns(flareAddress, toAddress, amount, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const dollarydoos = Math.round(amount * 1e6);
      const result = await wallet.send({ address: toAddress, value: dollarydoos });

      log.info({ walletId, to: toAddress, amount, txHash: result.hash }, 'Sent HNS');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, amount }, 'sendHns failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Get receive address for deposits.
   */
  async getReceiveAddress(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const account = await wallet.getAccount('default');

      return { success: true, address: account?.receiveAddress || null };
    } catch (err) {
      log.error({ err, walletId }, 'getReceiveAddress failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Export wallet master key (HD seed) for backup/self-custody.
   */
  async exportWallet(flareAddress, signature) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const master = await wallet.getMaster();

      if (!master) {
        return { success: false, error: 'Could not retrieve master key' };
      }

      return {
        success: true,
        walletId,
        mnemonic: master.mnemonic?.phrase || null,
        masterKey: master.key?.xprivkey || null,
      };
    } catch (err) {
      log.error({ err, walletId }, 'exportWallet failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //                   BATCH OPERATIONS (hsd-004)
  // =========================================================

  /**
   * Batch renew multiple names in sequence.
   * Returns results per name.
   */
  async batchRenew(flareAddress, nameList, signature) {
    const walletId = walletIdFromFlare(flareAddress);
    const results = [];

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);

      for (const name of nameList) {
        try {
          const result = await wallet.createRenewal({ name });
          results.push({ name, success: true, txHash: result.hash });
          log.info({ walletId, name, txHash: result.hash }, 'Batch renewed');
        } catch (err) {
          results.push({ name, success: false, error: err.message });
          log.warn({ walletId, name, err: err.message }, 'Batch renew failed for name');
        }
      }

      return { success: true, results };
    } catch (err) {
      log.error({ err, walletId }, 'batchRenew failed');
      return { success: false, error: err.message, results };
    }
  }

  /**
   * Batch finalize multiple names.
   */
  async batchFinalize(flareAddress, nameList, signature) {
    const walletId = walletIdFromFlare(flareAddress);
    const results = [];

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);

      for (const name of nameList) {
        try {
          const result = await wallet.createFinalize({ name });
          results.push({ name, success: true, txHash: result.hash });
          log.info({ walletId, name, txHash: result.hash }, 'Batch finalized');
        } catch (err) {
          results.push({ name, success: false, error: err.message });
        }
      }

      return { success: true, results };
    } catch (err) {
      log.error({ err, walletId }, 'batchFinalize failed');
      return { success: false, error: err.message, results };
    }
  }

  /**
   * Batch reveal bids for multiple names.
   */
  async batchReveal(flareAddress, nameList, signature) {
    const walletId = walletIdFromFlare(flareAddress);
    const results = [];

    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);

      for (const name of nameList) {
        try {
          const result = await wallet.createReveal({ name });
          results.push({ name, success: true, txHash: result.hash });
        } catch (err) {
          results.push({ name, success: false, error: err.message });
        }
      }

      return { success: true, results };
    } catch (err) {
      log.error({ err, walletId }, 'batchReveal failed');
      return { success: false, error: err.message, results };
    }
  }

  // =========================================================
  //          NAME STATE MACHINE (hsd-006)
  // =========================================================

  /**
   * Get detailed name state info: current phase, time remaining,
   * next required action, and relevant block heights.
   *
   * Handshake name lifecycle:
   *   OPENING (open tx in mempool) -> BIDDING (5 days) -> REVEAL (10 days)
   *   -> CLOSED (owned) -> TRANSFER (transfer lock) -> REVOKE
   *   Renewal: every ~2 years (network rule: within renewal window)
   */
  async getNameState(flareAddress, name) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const nameInfo = await wallet.getName(name);

      if (!nameInfo) {
        return { success: false, error: 'Name not found in wallet' };
      }

      const chainInfo = await this._getChainHeight();
      const currentHeight = chainInfo.height || 0;

      const state = this._parseNameState(nameInfo, currentHeight);

      return { success: true, ...state };
    } catch (err) {
      log.error({ err, walletId, name }, 'getNameState failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Get all names with state details (for bulk display).
   */
  async getNamesWithState(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames() || [];
      const chainInfo = await this._getChainHeight();
      const currentHeight = chainInfo.height || 0;

      const owned = names.filter(n => n.state === 'CLOSED');
      const detailed = owned.map(n => this._parseNameState(n, currentHeight));

      return { success: true, names: detailed };
    } catch (err) {
      log.error({ err, walletId }, 'getNamesWithState failed');
      return { success: false, error: err.message, names: [] };
    }
  }

  /**
   * Parse a name's state into actionable info.
   * Returns: { name, state, phase, blocksRemaining, timeRemaining,
   *            nextAction, renewalHeight, expiryHeight, ... }
   */
  _parseNameState(nameInfo, currentHeight) {
    const BLOCKS_PER_DAY = 144; // ~10 min blocks, 144/day
    const AUCTION_OPEN_PERIOD = 37;     // blocks (~6 hours)
    const AUCTION_BID_PERIOD = 720;     // blocks (~5 days)
    const AUCTION_REVEAL_PERIOD = 1440; // blocks (~10 days)
    const RENEWAL_WINDOW = 4320;        // blocks before expiry (~30 days)
    const NAME_EXPIRY = 2 * 365 * BLOCKS_PER_DAY; // ~2 years in blocks
    const TRANSFER_LOCKUP = 288;        // blocks (~2 days)

    const name = nameInfo.name;
    const state = nameInfo.state || 'UNKNOWN';
    const height = nameInfo.height || 0;
    const renewal = nameInfo.renewal || 0;
    const transfer = nameInfo.transfer || 0;

    let phase = state;
    let blocksRemaining = 0;
    let nextAction = null;
    let actionUrgency = 'none'; // none, low, medium, high, critical
    let renewalHeight = 0;
    let expiryHeight = 0;

    switch (state) {
      case 'OPENING':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD) - currentHeight);
        nextAction = 'wait_for_bidding';
        phase = 'Opening';
        actionUrgency = 'low';
        break;

      case 'BIDDING':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD + AUCTION_BID_PERIOD) - currentHeight);
        nextAction = blocksRemaining > 0 ? 'place_bid' : 'wait_for_reveal';
        phase = 'Bidding';
        actionUrgency = blocksRemaining < BLOCKS_PER_DAY ? 'high' : 'medium';
        break;

      case 'REVEAL':
        blocksRemaining = Math.max(0, (height + AUCTION_OPEN_PERIOD + AUCTION_BID_PERIOD + AUCTION_REVEAL_PERIOD) - currentHeight);
        nextAction = 'reveal_bid';
        phase = 'Reveal';
        actionUrgency = blocksRemaining < BLOCKS_PER_DAY ? 'critical' : 'high';
        break;

      case 'CLOSED': {
        const baseHeight = renewal > 0 ? renewal : height;
        expiryHeight = baseHeight + NAME_EXPIRY;
        const renewStart = expiryHeight - RENEWAL_WINDOW;
        renewalHeight = renewStart;

        if (currentHeight >= renewStart) {
          blocksRemaining = Math.max(0, expiryHeight - currentHeight);
          nextAction = 'renew';
          phase = 'Renewal Window';
          actionUrgency = blocksRemaining < BLOCKS_PER_DAY * 7 ? 'critical' : 'high';
        } else {
          blocksRemaining = 0;
          nextAction = 'none';
          phase = 'Owned';
          actionUrgency = 'none';
        }
        break;
      }

      case 'TRANSFER':
        blocksRemaining = Math.max(0, (transfer + TRANSFER_LOCKUP) - currentHeight);
        nextAction = blocksRemaining > 0 ? 'wait_for_finalize' : 'finalize_transfer';
        phase = 'Transferring';
        actionUrgency = blocksRemaining <= 0 ? 'medium' : 'low';
        break;

      case 'REVOKE':
        nextAction = 'none';
        phase = 'Revoked';
        actionUrgency = 'none';
        break;

      default:
        phase = state;
        nextAction = 'unknown';
        break;
    }

    const timeRemainingMs = blocksRemaining * 10 * 60 * 1000; // ~10 min per block

    return {
      name,
      state,
      phase,
      height,
      renewal,
      transfer,
      blocksRemaining,
      timeRemainingMs,
      timeRemainingHuman: this._formatDuration(timeRemainingMs),
      nextAction,
      actionUrgency,
      renewalHeight,
      expiryHeight,
    };
  }

  _formatDuration(ms) {
    if (ms <= 0) return 'now';
    const hours = Math.floor(ms / 3600000);
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (days > 0) return `${days}d ${remainingHours}h`;
    if (hours > 0) return `${hours}h`;
    return '<1h';
  }

  async _getChainHeight() {
    try {
      const info = await this.walletClient.execute('getblockchaininfo');
      return { height: info?.blocks || 0 };
    } catch {
      // Fallback: try node client via hns service
      try {
        const hnsService = (await import('./hns.js')).default;
        const info = await hnsService.nodeClient.getInfo();
        return { height: info?.chain?.height || 0 };
      } catch {
        return { height: 0 };
      }
    }
  }

  // =========================================================
  //              HSD NODE INFO (hsd-016)
  // =========================================================

  /**
   * Get hsd node status: sync progress, peer count, mempool, chain info.
   */
  async getNodeInfo() {
    try {
      const hnsService = (await import('./hns.js')).default;
      const [info, peers, mempool] = await Promise.allSettled([
        hnsService.nodeClient.getInfo(),
        hnsService.nodeClient.execute('getpeerinfo'),
        hnsService.nodeClient.execute('getmempoolinfo'),
      ]);

      const nodeInfo = info.status === 'fulfilled' ? info.value : null;
      const peerInfo = peers.status === 'fulfilled' ? peers.value : [];
      const mempoolInfo = mempool.status === 'fulfilled' ? mempool.value : null;

      return {
        success: true,
        chain: {
          height: nodeInfo?.chain?.height || 0,
          progress: nodeInfo?.chain?.progress || 0,
          tip: nodeInfo?.chain?.tip || '',
        },
        network: nodeInfo?.pool?.host || 'unknown',
        peers: {
          total: Array.isArray(peerInfo) ? peerInfo.length : 0,
          list: Array.isArray(peerInfo) ? peerInfo.slice(0, 10).map(p => ({
            addr: p.addr,
            version: p.version,
            height: p.height,
          })) : [],
        },
        mempool: {
          size: mempoolInfo?.size || 0,
          bytes: mempoolInfo?.bytes || 0,
        },
        version: nodeInfo?.version || 'unknown',
        uptime: nodeInfo?.time?.uptime || 0,
      };
    } catch (err) {
      log.error({ err }, 'getNodeInfo failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //          ESCROW OPERATIONS (marketplace)
  // =========================================================

  /**
   * Get or create the platform escrow wallet.
   * Uses a deterministic passphrase from HNS_ESCROW_SECRET env var.
   */
  async _getEscrowWallet() {
    const cfg = (await import('../config/index.js')).config || (await import('../config/index.js')).default;
    const walletId = cfg.hnsEscrow?.walletId || 'hsr-platform-escrow';
    const secret = cfg.hnsEscrow?.secret || 'REDACTED';
    const passphrase = createHash('sha256').update(secret).digest('hex');

    const wallet = this.walletClient.wallet(walletId);
    try {
      const info = await wallet.getInfo();
      if (!info) {
        // Create escrow wallet
        await this.walletClient.createWallet(walletId, { type: 'pubkeyhash', witness: false });
        const w = this.walletClient.wallet(walletId);
        await w.setPassphrase(passphrase);
        log.info({ walletId }, 'Created platform escrow wallet');
      }
    } catch (err) {
      if (err.message?.includes('not found') || err.code === 404 || err.statusCode === 404) {
        await this.walletClient.createWallet(walletId, { type: 'pubkeyhash', witness: false });
        const w = this.walletClient.wallet(walletId);
        await w.setPassphrase(passphrase);
        log.info({ walletId }, 'Created platform escrow wallet');
      } else {
        throw err;
      }
    }

    return { walletId, passphrase };
  }

  /**
   * Unlock the platform escrow wallet.
   */
  async _unlockEscrowWallet(timeout = 60) {
    const { walletId, passphrase } = await this._getEscrowWallet();
    const wallet = this.walletClient.wallet(walletId);
    try {
      await wallet.unlock(passphrase, timeout);
    } catch (err) {
      if (err.message?.includes('not encrypted') || err.message?.includes('already unlocked')) {
        return;
      }
      throw err;
    }
  }

  /**
   * Get the escrow wallet's receive address.
   */
  async getEscrowAddress() {
    const { walletId } = await this._getEscrowWallet();
    const wallet = this.walletClient.wallet(walletId);
    const account = await wallet.getAccount('default');
    return account?.receiveAddress || null;
  }

  /**
   * Transfer a name from the seller's wallet to the escrow wallet.
   * Called when a seller lists a name for sale.
   */
  async transferToEscrow(sellerFlareAddress, name, signature) {
    const escrowAddress = await this.getEscrowAddress();
    if (!escrowAddress) {
      return { success: false, error: 'Failed to get escrow address' };
    }

    const result = await this.transferName(sellerFlareAddress, name, escrowAddress, signature);
    if (result.success) {
      log.info({ name, seller: sellerFlareAddress.slice(0, 10), escrowAddress, txHash: result.txHash }, 'Transferred name to escrow');
    }
    return result;
  }

  /**
   * Finalize a transfer into escrow (called by background job after ~288 blocks).
   * Uses the SELLER's wallet to finalize since they initiated the TRANSFER.
   */
  async finalizeEscrowTransfer(sellerFlareAddress, name, signature) {
    const walletId = walletIdFromFlare(sellerFlareAddress);
    try {
      await this._unlockWallet(walletId, signature);
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createFinalize({ name });
      log.info({ walletId, name, txHash: result.hash }, 'Finalized escrow transfer');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, walletId, name }, 'finalizeEscrowTransfer failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Release a name from escrow to a buyer's address.
   * Platform controls the escrow wallet, so no user signature needed.
   */
  async releaseFromEscrow(name, buyerReceiveAddress) {
    const { walletId } = await this._getEscrowWallet();
    try {
      await this._unlockEscrowWallet();
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createTransfer({ name, address: buyerReceiveAddress });
      log.info({ name, to: buyerReceiveAddress, txHash: result.hash }, 'Released name from escrow to buyer');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, name }, 'releaseFromEscrow failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Finalize a release from escrow (called by background job after ~288 blocks).
   */
  async finalizeEscrowRelease(name) {
    const { walletId } = await this._getEscrowWallet();
    try {
      await this._unlockEscrowWallet();
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createFinalize({ name });
      log.info({ walletId, name, txHash: result.hash }, 'Finalized escrow release to buyer');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, name }, 'finalizeEscrowRelease failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Return a name from escrow back to the seller (for delist).
   * Since createCancel doesn't exist, this is a reverse TRANSFER + FINALIZE.
   */
  async returnFromEscrow(name, sellerFlareAddress) {
    const sellerWalletId = walletIdFromFlare(sellerFlareAddress);
    const sellerWallet = this.walletClient.wallet(sellerWalletId);
    const account = await sellerWallet.getAccount('default').catch(() => null);
    const sellerAddress = account?.receiveAddress;
    if (!sellerAddress) {
      return { success: false, error: 'Failed to get seller receive address' };
    }

    const { walletId } = await this._getEscrowWallet();
    try {
      await this._unlockEscrowWallet();
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createTransfer({ name, address: sellerAddress });
      log.info({ name, to: sellerAddress, txHash: result.hash }, 'Returning name from escrow to seller');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, name }, 'returnFromEscrow failed');
      return { success: false, error: err.message };
    }
  }

  /**
   * Finalize a return from escrow back to seller.
   */
  async finalizeEscrowReturn(name) {
    return this.finalizeEscrowRelease(name); // Same logic — finalize from escrow wallet
  }

  /**
   * Send HNS from escrow wallet to an address (for returning locked offer funds).
   */
  async sendHnsFromEscrow(toAddress, amount) {
    const { walletId } = await this._getEscrowWallet();
    try {
      await this._unlockEscrowWallet();
      const wallet = this.walletClient.wallet(walletId);
      const dollarydoos = Math.round(amount * 1e6);
      const result = await wallet.send({ address: toAddress, value: dollarydoos });
      log.info({ to: toAddress, amount, txHash: result.hash }, 'Sent HNS from escrow');
      return { success: true, txHash: result.hash };
    } catch (err) {
      log.error({ err, amount }, 'sendHnsFromEscrow failed');
      return { success: false, error: err.message };
    }
  }

  // =========================================================
  //          RENEWAL MONITORING (hsd-019)
  // =========================================================

  /**
   * Get names approaching renewal deadline across all wallets.
   * Returns names sorted by urgency (closest to expiry first).
   */
  async getExpiringNames(flareAddress) {
    const walletId = walletIdFromFlare(flareAddress);

    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames() || [];
      const chainInfo = await this._getChainHeight();
      const currentHeight = chainInfo.height || 0;

      const BLOCKS_PER_DAY = 144;
      const NAME_EXPIRY = 2 * 365 * BLOCKS_PER_DAY;
      const ALERT_WINDOW = 60 * BLOCKS_PER_DAY; // ~60 days out

      const expiring = [];
      for (const n of names) {
        if (n.state !== 'CLOSED') continue;

        const baseHeight = n.renewal > 0 ? n.renewal : n.height;
        const expiryHeight = baseHeight + NAME_EXPIRY;
        const blocksLeft = expiryHeight - currentHeight;

        if (blocksLeft < ALERT_WINDOW) {
          const daysLeft = Math.floor(blocksLeft / BLOCKS_PER_DAY);
          expiring.push({
            name: n.name,
            expiryHeight,
            blocksLeft,
            daysLeft,
            urgency: daysLeft < 7 ? 'critical' : daysLeft < 30 ? 'high' : 'medium',
          });
        }
      }

      expiring.sort((a, b) => a.blocksLeft - b.blocksLeft);

      return { success: true, expiring };
    } catch (err) {
      log.error({ err, walletId }, 'getExpiringNames failed');
      return { success: false, error: err.message, expiring: [] };
    }
  }

  // =========================================================
  //                     DB HELPERS
  // =========================================================

  async _ensureDbRecord(flareAddress, walletId) {
    try {
      await query(`
        INSERT INTO hns_wallets (flare_address, wallet_id)
        VALUES ($1, $2)
        ON CONFLICT (flare_address) DO NOTHING
      `, [flareAddress.toLowerCase(), walletId]);
    } catch (err) {
      log.warn({ err, flareAddress }, 'Failed to insert hns_wallets record');
    }
  }

  /**
   * Get all registered wallets (for the monitor).
   */
  async getAllRegisteredWallets() {
    try {
      const result = await query('SELECT flare_address, wallet_id FROM hns_wallets');
      return result.rows;
    } catch (err) {
      log.error({ err }, 'getAllRegisteredWallets failed');
      return [];
    }
  }
}

export const hnsWalletService = new HNSWalletService();
export { walletIdFromFlare };
export default hnsWalletService;
