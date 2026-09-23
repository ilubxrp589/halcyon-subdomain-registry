import { NodeClient, WalletClient } from 'hs-client';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';
import { withRetry, isTransientError } from '../utils/retry.js';

const log = loggers.hns;

/**
 * HNS Node Service
 * Connects to local Handshake node for DNS operations
 */
class HNSService {
  constructor() {
    this.nodeClient = new NodeClient({
      host: config.hns.host,
      port: config.hns.port,
      apiKey: config.hns.apiKey,
    });

    this.walletClient = new WalletClient({
      host: config.hns.host,
      port: config.hns.walletPort,
      apiKey: config.hns.apiKey,
    });
  }

  /**
   * Get node info
   */
  async getInfo() {
    try {
      const info = await withRetry(
        () => this.nodeClient.getInfo(),
        { maxRetries: 3, label: 'getInfo', shouldRetry: isTransientError, logger: log }
      );
      return {
        success: true,
        data: {
          version: info.version,
          network: info.network,
          chain: {
            height: info.chain?.height,
            progress: info.chain?.progress,
          },
          pool: {
            peers: info.pool?.size,
          },
        },
      };
    } catch (error) {
      log.error({ err: error }, 'getInfo failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if connected and synced
   */
  async isReady() {
    try {
      const info = await this.nodeClient.getInfo();
      const isSynced = info.chain?.progress >= 0.99;
      return {
        connected: true,
        synced: isSynced,
        height: info.chain?.height,
        progress: info.chain?.progress,
      };
    } catch (error) {
      return {
        connected: false,
        synced: false,
        error: error.message,
      };
    }
  }

  /**
   * Get name info for a TLD
   */
  async getNameInfo(name) {
    try {
      const info = await withRetry(
        () => this.nodeClient.execute('getnameinfo', [name]),
        { maxRetries: 2, label: `getNameInfo(${name})`, shouldRetry: isTransientError, logger: log }
      );
      return { success: true, data: info };
    } catch (error) {
      log.error({ err: error, name }, 'getNameInfo failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get DNS resource records for a name
   */
  async getNameResource(name) {
    try {
      const resource = await withRetry(
        () => this.nodeClient.execute('getnameresource', [name]),
        { maxRetries: 2, label: `getNameResource(${name})`, shouldRetry: isTransientError, logger: log }
      );
      return { success: true, data: resource };
    } catch (error) {
      log.error({ err: error, name }, 'getNameResource failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if we own a TLD
   */
  async checkTLDOwnership(tld, walletId = 'primary') {
    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames();

      const ownedName = names.find(n => n.name === tld);
      if (ownedName) {
        return {
          owned: true,
          name: ownedName.name,
          state: ownedName.state,
          height: ownedName.height,
        };
      }
      return { owned: false };
    } catch (error) {
      log.error({ err: error, tld }, 'checkTLDOwnership failed');
      return { owned: false, error: error.message };
    }
  }

  /**
   * Get wallet info including address and balance
   */
  async getWalletInfo(walletId = 'primary') {
    try {
      const wallet = this.walletClient.wallet(walletId);
      const [info, balance, account] = await Promise.all([
        wallet.getInfo(),
        wallet.getBalance(),
        wallet.getAccount('default'),
      ]);

      // Balance is in dollarydoos (1 HNS = 1,000,000 dollarydoos)
      const confirmedHNS = (balance.confirmed || 0) / 1e6;
      const unconfirmedHNS = (balance.unconfirmed || 0) / 1e6;

      return {
        success: true,
        walletId: info.id,
        address: account?.receiveAddress || null,
        balance: confirmedHNS.toFixed(6),
        unconfirmed: unconfirmedHNS.toFixed(6),
        txCount: info.txCount || 0,
      };
    } catch (error) {
      log.error({ err: error }, 'getWalletInfo failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all owned TLDs
   */
  async getOwnedTLDs(walletId = 'primary') {
    try {
      const wallet = this.walletClient.wallet(walletId);
      const names = await wallet.getNames();

      // Filter for owned names (state === 'CLOSED' means we own it)
      const owned = names.filter(n => n.state === 'CLOSED');

      return {
        success: true,
        tlds: owned.map(n => ({
          name: n.name,
          state: n.state,
          height: n.height,
          renewal: n.renewal,
          transfer: n.transfer,
        })),
      };
    } catch (error) {
      log.error({ err: error }, 'getOwnedTLDs failed');
      return { success: false, error: error.message, tlds: [] };
    }
  }

  /**
   * Register a subdomain by updating TLD DNS records
   * @param {string} tld - The TLD we own
   * @param {string} subdomain - The subdomain to register
   * @param {object} records - DNS records to set
   */
  async registerSubdomain(tld, subdomain, records = {}, walletId = 'primary') {
    try {
      // Get current resource
      const currentResource = await this.getNameResource(tld);

      let resource = currentResource.success ? currentResource.data : { records: [] };
      if (!resource.records) resource.records = [];

      // Add NS record for subdomain
      // Format: subdomain points to nameserver
      const nsRecord = {
        type: 'NS',
        ns: `ns1.${subdomain}.${tld}.`,
      };

      // Check if subdomain already exists
      const existingNS = resource.records.find(
        r => r.type === 'NS' && r.ns && r.ns.startsWith(`ns1.${subdomain}.`)
      );

      if (existingNS) {
        return { success: false, error: 'Subdomain already exists in DNS' };
      }

      // Add the NS record
      resource.records.push(nsRecord);

      // If IP provided, add glue record
      if (records.ip) {
        resource.records.push({
          type: 'GLUE4',
          ns: `ns1.${subdomain}.${tld}.`,
          address: records.ip,
        });
      }

      // Send update
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createUpdate({ name: tld, data: resource });

      return {
        success: true,
        txHash: result.hash,
        subdomain: `${subdomain}.${tld}`,
      };
    } catch (error) {
      log.error({ err: error, subdomain, tld }, 'registerSubdomain failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a subdomain is registered in DNS
   */
  async isSubdomainRegistered(tld, subdomain) {
    try {
      const resource = await this.getNameResource(tld);
      if (!resource.success || !resource.data?.records) {
        return { registered: false };
      }

      const nsRecord = resource.data.records.find(
        r => r.type === 'NS' && r.ns && r.ns.includes(`${subdomain}.`)
      );

      return {
        registered: !!nsRecord,
        record: nsRecord,
      };
    } catch (error) {
      log.error({ err: error, subdomain, tld }, 'isSubdomainRegistered failed');
      return { registered: false, error: error.message };
    }
  }

  /**
   * Send HNS to an address
   * @param {string} address - Recipient HNS address
   * @param {number} amount - Amount in HNS (not dollarydoos)
   * @param {string} walletId - Wallet to send from
   */
  async sendHNS(address, amount, walletId = 'primary') {
    try {
      const wallet = this.walletClient.wallet(walletId);
      // hs-client send expects value in dollarydoos (1 HNS = 1,000,000 dollarydoos)
      const dollarydoos = Math.round(amount * 1e6);
      const result = await withRetry(
        () => wallet.send({ address, value: dollarydoos }),
        { maxRetries: 2, baseDelay: 2000, label: 'sendHNS', shouldRetry: isTransientError, logger: log }
      );
      return {
        success: true,
        hash: result.hash,
      };
    } catch (error) {
      log.error({ err: error, address, amount, walletId }, 'sendHNS failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Set or replace a TXT record on a TLD
   * Uses read-merge-write pattern: reads current records, modifies TXT entries, sends update
   * @param {string} tld - The TLD to update
   * @param {string} txtValue - The TXT value to set (e.g. 'flr:0x...')
   * @param {string} walletId - Wallet to sign the update
   * @param {string|null} replacePrefixFilter - If set, removes existing TXT entries starting with this prefix before adding
   */
  async setTxtRecord(tld, txtValue, walletId = 'primary', replacePrefixFilter = null) {
    try {
      // Read current resource (may be null for TLDs with no records yet)
      const currentResource = await this.getNameResource(tld);
      let resource = currentResource.success && currentResource.data ? currentResource.data : { records: [] };
      if (!resource.records) resource.records = [];

      // Find or create TXT record
      let txtRecord = resource.records.find(r => r.type === 'TXT');

      if (txtRecord) {
        // Filter out entries matching prefix if requested
        if (replacePrefixFilter && Array.isArray(txtRecord.txt)) {
          txtRecord.txt = txtRecord.txt.filter(t => !t.startsWith(replacePrefixFilter));
        }
        // Append new value
        if (!Array.isArray(txtRecord.txt)) txtRecord.txt = [];
        txtRecord.txt.push(txtValue);
      } else {
        // Create new TXT record
        resource.records.push({
          type: 'TXT',
          txt: [txtValue],
        });
      }

      // Send update (preserves all existing NS/GLUE/etc records)
      const wallet = this.walletClient.wallet(walletId);
      const result = await wallet.createUpdate({ name: tld, data: resource });

      log.info({ tld, txtValue, txHash: result.hash }, 'setTxtRecord succeeded');
      return { success: true, txHash: result.hash };
    } catch (error) {
      log.error({ err: error, tld, txtValue }, 'setTxtRecord failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get owned TLDs enriched with name info and resource records
   * Returns expiry info, current records, and extracted flr: address per TLD
   */
  async getOwnedTLDsWithDetails(walletId = 'primary') {
    try {
      const ownedResult = await this.getOwnedTLDs(walletId);
      if (!ownedResult.success) {
        return { success: false, error: ownedResult.error, tlds: [] };
      }

      // Enrich each TLD with name info and resource records in parallel
      const enriched = await Promise.all(
        ownedResult.tlds.map(async (tld) => {
          const [nameInfoResult, resourceResult] = await Promise.all([
            this.getNameInfo(tld.name),
            this.getNameResource(tld.name),
          ]);

          // Extract expiry from name info
          // Note: hsd's "expired" flag means auction period ended, NOT that name has lapsed.
          // Use daysUntilExpire for real expiry check.
          let expiryHeight = null;
          let expired = false;
          if (nameInfoResult.success && nameInfoResult.data?.info) {
            const info = nameInfoResult.data.info;
            expiryHeight = info.stats?.renewalPeriodEnd || null;
            const daysUntilExpire = info.stats?.daysUntilExpire ?? 0;
            expired = daysUntilExpire <= 0;
          }

          // Extract flr: address from TXT records
          let flrAddress = null;
          let records = [];
          if (resourceResult.success && resourceResult.data?.records) {
            records = resourceResult.data.records;
            const txtRecord = records.find(r => r.type === 'TXT');
            if (txtRecord && Array.isArray(txtRecord.txt)) {
              const flrEntry = txtRecord.txt.find(t => t.startsWith('flr:'));
              if (flrEntry) {
                flrAddress = flrEntry.substring(4); // Strip 'flr:' prefix
              }
            }
          }

          return {
            name: tld.name,
            state: tld.state,
            height: tld.height,
            renewal: tld.renewal,
            transfer: tld.transfer,
            expiryHeight,
            expired,
            flrAddress,
            records,
          };
        })
      );

      return { success: true, tlds: enriched };
    } catch (error) {
      log.error({ err: error }, 'getOwnedTLDsWithDetails failed');
      return { success: false, error: error.message, tlds: [] };
    }
  }

  /**
   * Check if a TLD has a pending (unconfirmed) UPDATE transaction in the mempool.
   * Queries wallet unconfirmed TXs and matches UPDATE covenants (type 7) by name hash.
   *
   * @param {string} tldLabel - The TLD to check
   * @param {string} walletId - Wallet ID (default 'primary')
   * @returns {{ hasPending: boolean, txHash?: string, submittedAt?: string }}
   */
  async getPendingUpdateForName(tldLabel, walletId = 'primary') {
    try {
      // 1. Get the name hash for this TLD
      const nameInfo = await this.nodeClient.execute('getnameinfo', [tldLabel.toLowerCase()]);
      if (!nameInfo?.info?.nameHash) {
        return { hasPending: false };
      }
      const targetHash = nameInfo.info.nameHash;

      // 2. Fetch unconfirmed TXs via direct HTTP to wallet API
      const url = `http://${config.hns.host}:${config.hns.walletPort}/wallet/${walletId}/tx/unconfirmed`;
      const authHeader = 'Basic ' + Buffer.from('x:' + config.hns.apiKey).toString('base64');

      const response = await fetch(url, {
        headers: { 'Authorization': authHeader },
      });

      if (!response.ok) {
        log.warn({ status: response.status }, 'Failed to fetch unconfirmed TXs');
        return { hasPending: false };
      }

      const unconfirmedTxs = await response.json();

      // 3. Search for UPDATE covenants (type 7) matching our name hash
      for (const tx of unconfirmedTxs) {
        for (const output of (tx.outputs || [])) {
          const cov = output.covenant || {};
          if (cov.type === 7 && cov.action === 'UPDATE') {
            const items = cov.items || [];
            if (items[0] === targetHash) {
              return {
                hasPending: true,
                txHash: tx.hash,
                submittedAt: tx.mdate || null,
              };
            }
          }
        }
      }

      return { hasPending: false };
    } catch (error) {
      log.error({ err: error, tldLabel }, 'getPendingUpdateForName failed');
      return { hasPending: false };
    }
  }

  /**
   * Get blockchain info for verification
   */
  async getBlockInfo() {
    try {
      const info = await this.nodeClient.getInfo();
      const block = await this.nodeClient.execute('getblockbyheight', [info.chain.height, true, false]);

      return {
        success: true,
        height: info.chain.height,
        hash: block?.hash,
        time: block?.time,
      };
    } catch (error) {
      log.error({ err: error }, 'getBlockInfo failed');
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
export const hnsService = new HNSService();
export default hnsService;
