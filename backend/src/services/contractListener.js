import { ethers } from 'ethers';
import config from '../config/index.js';
import { query } from '../db/index.js';
import pdnsService from './pdns.js';
import cacheService from './cache.js';
import emailService from './emailService.js';
import { getDefaultsForWallet } from '../api/defaultsRoutes.js';
import { loggers } from '../utils/logger.js';
import { createFallbackProvider } from '../utils/rpcProvider.js';
// Redis/BullMQ removed

const log = loggers.contractListener;

/**
 * Contract Event Listener Service
 * Listens for SubdomainPurchased events and auto-creates DNS records
 */

// Transaction configuration
const TX_CONFIG = {
  confirmations: 2,           // Wait for 2 block confirmations
  timeout: 120000,            // 2 minute timeout
  maxRetries: 3,              // Retry up to 3 times
  retryDelay: 5000,           // 5 seconds between retries
  gasLimitMultiplier: 1.2,    // Add 20% buffer to gas estimate
};

// SubdomainEscrow ABI (only the events and functions we need)
const ESCROW_ABI = [
  'event SubdomainPurchased(uint256 indexed escrowId, address indexed buyer, string tld, string subdomain, uint256 amountPaidFLR, uint256 priceUSD, uint256 tokenId)',
  'event EscrowCompleted(uint256 indexed escrowId, address indexed buyer, uint256 amountReleased)',
  'event EscrowRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amountRefunded)',
  'function getEscrow(uint256 escrowId) external view returns (tuple(address buyer, string tld, string subdomain, uint256 amountPaid, uint256 priceUSD, uint256 tokenId, uint256 createdAt, uint8 status, string metadataURI))',
];

// DNS Oracle ABI
const DNS_ORACLE_ABI = [
  'function confirmDNSRegistration(uint256 requestId, bytes32 hnsBlockHash, uint256 hnsBlockHeight) external',
  'function failDNSRegistration(uint256 requestId, string calldata reason) external',
  'function escrowToRequest(uint256 escrowId) external view returns (uint256)',
];

// SubdomainNFT ABI (for release, reclaim, and transfer events)
const NFT_ABI = [
  'event SubdomainReleased(uint256 indexed tokenId, address indexed previousOwner, string tld, string subdomain, string fullDomain)',
  'event DomainReclaimed(uint256 indexed tokenId, address indexed previousOwner, address indexed treasury)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Marketplace ABI (for listing/sale events)
const MARKETPLACE_ABI = [
  'event Listed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 price, uint8 listingType, uint256 endTime)',
  'event Sale(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price, uint256 royaltyAmount, uint256 platformFee)',
  'event ListingCancelled(uint256 indexed listingId, uint256 indexed tokenId)',
  'event BidPlaced(uint256 indexed listingId, uint256 indexed tokenId, address indexed bidder, uint256 amount)',
  'event BidRefunded(uint256 indexed listingId, address indexed bidder, uint256 amount)',
  'event OfferMade(uint256 indexed offerId, uint256 indexed tokenId, address indexed offerer, uint256 amount, uint256 expiresAt)',
  'event OfferAccepted(uint256 indexed offerId, uint256 indexed tokenId, address seller, address buyer, uint256 amount)',
  'event OfferCancelled(uint256 indexed offerId, uint256 indexed tokenId)',
  'event PriceUpdated(uint256 indexed listingId, uint256 oldPrice, uint256 newPrice)',
];

class ContractListenerService {
  constructor() {
    this.provider = null;
    this.escrowContract = null;
    this.nftContract = null;
    this.dnsOracleContract = null;
    this.marketplaceContract = null;
    this.wallet = null;
    this.isListening = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.lastProcessedBlock = 0;
    this.pollingInterval = null;
    this.pollIntervalMs = 5000; // Poll every 5 seconds
  }

  /**
   * Get the last processed block from database
   */
  async getLastProcessedBlock() {
    try {
      const result = await query(
        "SELECT value FROM watcher_state WHERE key = 'last_processed_block'"
      );
      if (result.rows.length > 0) {
        return parseInt(result.rows[0].value, 10);
      }
      return 0;
    } catch (error) {
      log.error({ err: error }, 'Failed to get last processed block');
      return 0;
    }
  }

  /**
   * Save the last processed block to database
   */
  async saveLastProcessedBlock(blockNumber) {
    try {
      await query(`
        INSERT INTO watcher_state (key, value, updated_at)
        VALUES ('last_processed_block', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
      `, [blockNumber.toString()]);
      this.lastProcessedBlock = blockNumber;
    } catch (error) {
      log.error({ err: error }, 'Failed to save last processed block');
    }
  }

  /**
   * Send a transaction with proper confirmation waiting and retry logic
   */
  async sendTransactionWithConfirmation(contract, method, args, description = 'transaction') {
    let lastError = null;

    for (let attempt = 0; attempt < TX_CONFIG.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          log.warn({ attempt: attempt + 1, maxRetries: TX_CONFIG.maxRetries, description }, 'Retrying transaction');
          await this.sleep(TX_CONFIG.retryDelay);
        }

        // Estimate gas and add buffer
        let gasLimit;
        try {
          const gasEstimate = await contract[method].estimateGas(...args);
          gasLimit = Math.ceil(Number(gasEstimate) * TX_CONFIG.gasLimitMultiplier);
        } catch (gasError) {
          log.warn({ gasLimit: 500000 }, 'Gas estimation failed, using default');
          gasLimit = 500000;
        }

        // Send transaction
        const tx = await contract[method](...args, { gasLimit });
        log.info({ hash: tx.hash, description }, 'TX submitted');

        // Wait for confirmations with timeout
        const receipt = await Promise.race([
          tx.wait(TX_CONFIG.confirmations),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), TX_CONFIG.timeout)
          ),
        ]);

        if (receipt.status === 0) {
          throw new Error('Transaction reverted');
        }

        log.info({ hash: receipt.hash, confirmations: TX_CONFIG.confirmations, description }, 'TX confirmed');
        return { success: true, receipt, hash: receipt.hash };

      } catch (error) {
        lastError = error;
        log.error({ err: error, description }, 'Transaction failed');

        // Don't retry on certain errors
        if (error.message.includes('insufficient funds') ||
            error.message.includes('nonce too low') ||
            error.message.includes('already known')) {
          break;
        }
      }
    }

    return { success: false, error: lastError?.message || 'Unknown error' };
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize the listener
   */
  async initialize() {
    try {
      // Validate required config
      if (!config.contracts.escrow) {
        log.error('CONTRACT_ESCROW not configured');
        return { success: false, error: 'Escrow contract not configured' };
      }

      // Coston2 doesn't have public websocket, use polling with fallback RPCs
      this.provider = createFallbackProvider();

      // Create contract instances
      this.escrowContract = new ethers.Contract(
        config.contracts.escrow,
        ESCROW_ABI,
        this.provider
      );

      // Create NFT contract instance for release events
      if (config.contracts.nft) {
        this.nftContract = new ethers.Contract(
          config.contracts.nft,
          NFT_ABI,
          this.provider
        );
        console.log(`  ✓ NFT contract: ${config.contracts.nft}`);
      }

      // Create Marketplace contract instance for listing/sale events
      if (config.contracts.marketplace) {
        this.marketplaceContract = new ethers.Contract(
          config.contracts.marketplace,
          MARKETPLACE_ABI,
          this.provider
        );
        console.log(`  ✓ Marketplace contract: ${config.contracts.marketplace}`);
      }

      // If we have a backend wallet and DNS oracle, set up for callbacks
      if (config.backendPrivateKey && config.contracts.dnsOracle) {
        this.wallet = new ethers.Wallet(config.backendPrivateKey, this.provider);
        this.dnsOracleContract = new ethers.Contract(
          config.contracts.dnsOracle,
          DNS_ORACLE_ABI,
          this.wallet
        );
        console.log('  ✓ DNS Oracle callback enabled');
      } else {
        console.log('  ⚠ DNS Oracle callback disabled (no backend wallet configured)');
      }

      // Load last processed block from database
      this.lastProcessedBlock = await this.getLastProcessedBlock();
      if (this.lastProcessedBlock > 0) {
        console.log(`  ✓ Resuming from block ${this.lastProcessedBlock}`);
      }

      console.log(`  ✓ Escrow contract: ${config.contracts.escrow}`);

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'Contract listener init error');
      return { success: false, error: error.message };
    }
  }

  /**
   * Start listening for events using polling (more reliable than filters on public RPC)
   */
  async start() {
    if (this.isListening) {
      console.log('Contract listener already running');
      return;
    }

    try {
      // Get current block for reference
      const currentBlock = await this.provider.getBlockNumber();

      // Start polling immediately (non-blocking) - don't wait for catch-up
      this.isListening = true;
      this.reconnectAttempts = 0;
      this.startPolling();
      console.log('🔔 Contract event listener started (polling mode)');

      // If we have a last processed block, catch up on missed events IN THE BACKGROUND
      if (this.lastProcessedBlock > 0 && this.lastProcessedBlock < currentBlock) {
        const blocksBehind = currentBlock - this.lastProcessedBlock;
        console.log(`📥 Catching up ${blocksBehind} blocks in background...`);

        // Run catch-up asynchronously - don't block server startup
        this.catchupEvents(this.lastProcessedBlock + 1)
          .then(result => {
            if (result.success) {
              console.log(`   ✓ Background catch-up complete: ${result.eventsProcessed} events processed`);
            } else {
              log.error({ error: result.error }, 'Background catch-up failed');
            }
          })
          .catch(err => {
            log.error({ err }, 'Background catch-up error');
          });
      } else if (this.lastProcessedBlock === 0) {
        // First run - save current block as starting point
        await this.saveLastProcessedBlock(currentBlock);
        console.log(`   ✓ First run, starting from block ${currentBlock}`);
      }

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'Failed to start contract listener');
      return { success: false, error: error.message };
    }
  }

  /**
   * Start polling for new blocks
   */
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollForEvents();
    }, this.pollIntervalMs);

    // Also poll immediately
    this.pollForEvents();
  }

  /**
   * Poll for new events since last processed block
   */
  async pollForEvents() {
    if (!this.isListening) return;

    try {
      const currentBlock = await this.provider.getBlockNumber();

      // No new blocks
      if (currentBlock <= this.lastProcessedBlock) {
        return;
      }

      const fromBlock = this.lastProcessedBlock + 1;
      const toBlock = currentBlock;

      // Query escrow events
      await this.queryEscrowEvents(fromBlock, toBlock);

      // Query NFT release events
      if (this.nftContract) {
        await this.queryNftEvents(fromBlock, toBlock);
      }

      // Query marketplace events
      if (this.marketplaceContract) {
        await this.queryMarketplaceEvents(fromBlock, toBlock);
      }

      // Update last processed block
      await this.saveLastProcessedBlock(currentBlock);

    } catch (error) {
      const isRateLimit = error.message.includes('rate limit') || error.message.includes('429') || error.message.includes('Too Many Requests');
      if (isRateLimit) {
        log.warn({ err: error }, 'Polling rate-limited, will retry next interval');
      } else {
        log.error({ err: error }, 'Polling error');
      }
    }
  }

  /**
   * Query escrow contract events
   */
  async queryEscrowEvents(fromBlock, toBlock) {
    const BATCH_SIZE = 30;

    for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, toBlock);

      try {
        // SubdomainPurchased events
        const purchasedEvents = await this.escrowContract.queryFilter(
          this.escrowContract.filters.SubdomainPurchased(),
          start,
          end
        );
        for (const event of purchasedEvents) {
          await this.handlePurchasedEvent(event);
        }

        // EscrowCompleted events
        const completedEvents = await this.escrowContract.queryFilter(
          this.escrowContract.filters.EscrowCompleted(),
          start,
          end
        );
        for (const event of completedEvents) {
          await this.handleCompletedEvent(event);
        }

        // EscrowRefunded events
        const refundedEvents = await this.escrowContract.queryFilter(
          this.escrowContract.filters.EscrowRefunded(),
          start,
          end
        );
        for (const event of refundedEvents) {
          await this.handleRefundedEvent(event);
        }

      } catch (batchError) {
        const isRateLimit = batchError.message.includes('rate limit') || batchError.message.includes('429');
        if (isRateLimit) {
          log.warn({ fromBlock: start, toBlock: end }, 'Batch query rate-limited');
        } else {
          log.error({ err: batchError, fromBlock: start, toBlock: end }, 'Batch query error');
        }
      }

      // Small delay between batches
      if (start + BATCH_SIZE <= toBlock) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Query NFT contract events
   */
  async queryNftEvents(fromBlock, toBlock) {
    const BATCH_SIZE = 30;

    for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, toBlock);

      try {
        const releasedEvents = await this.nftContract.queryFilter(
          this.nftContract.filters.SubdomainReleased(),
          start,
          end
        );
        for (const event of releasedEvents) {
          await this.handleReleasedEvent(event);
        }

        // DomainReclaimed events
        const reclaimedEvents = await this.nftContract.queryFilter(
          this.nftContract.filters.DomainReclaimed(),
          start,
          end
        );
        for (const event of reclaimedEvents) {
          await this.handleDomainReclaimedEvent(event);
        }

        // Transfer events (ERC721) - update owner_wallet on direct transfers
        const transferEvents = await this.nftContract.queryFilter(
          this.nftContract.filters.Transfer(),
          start,
          end
        );
        for (const event of transferEvents) {
          await this.handleTransferEvent(event);
        }

      } catch (batchError) {
        if (!batchError.message.includes('rate')) {
          log.error({ err: batchError, fromBlock: start, toBlock: end }, 'NFT batch query error');
        }
      }

      if (start + BATCH_SIZE <= toBlock) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Query Marketplace contract events
   */
  async queryMarketplaceEvents(fromBlock, toBlock) {
    const BATCH_SIZE = 30;

    for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, toBlock);

      try {
        // Listed events
        const listedEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.Listed(),
          start,
          end
        );
        for (const event of listedEvents) {
          await this.handleListedEvent(event);
        }

        // Sale events
        const saleEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.Sale(),
          start,
          end
        );
        for (const event of saleEvents) {
          await this.handleSaleEvent(event);
        }

        // ListingCancelled events
        const cancelledEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.ListingCancelled(),
          start,
          end
        );
        for (const event of cancelledEvents) {
          await this.handleListingCancelledEvent(event);
        }

        // BidPlaced events
        const bidEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.BidPlaced(),
          start,
          end
        );
        for (const event of bidEvents) {
          await this.handleBidPlacedEvent(event);
        }

        // OfferMade events
        const offerMadeEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.OfferMade(),
          start,
          end
        );
        for (const event of offerMadeEvents) {
          await this.handleOfferMadeEvent(event);
        }

        // OfferAccepted events
        const offerAcceptedEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.OfferAccepted(),
          start,
          end
        );
        for (const event of offerAcceptedEvents) {
          await this.handleOfferAcceptedEvent(event);
        }

        // OfferCancelled events
        const offerCancelledEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.OfferCancelled(),
          start,
          end
        );
        for (const event of offerCancelledEvents) {
          await this.handleOfferCancelledEvent(event);
        }

        // PriceUpdated events
        const priceUpdatedEvents = await this.marketplaceContract.queryFilter(
          this.marketplaceContract.filters.PriceUpdated(),
          start,
          end
        );
        for (const event of priceUpdatedEvents) {
          await this.handlePriceUpdatedEvent(event);
        }

      } catch (batchError) {
        if (!batchError.message.includes('rate')) {
          log.error({ err: batchError, fromBlock: start, toBlock: end }, 'Marketplace batch query error');
        }
      }

      if (start + BATCH_SIZE <= toBlock) {
        await this.sleep(100);
      }
    }
  }

  /**
   * Handle SubdomainPurchased event from queryFilter
   */
  async handlePurchasedEvent(event) {
    const [escrowId, buyer, tld, subdomain, amountPaidFLR, priceUSD, tokenId] = event.args;

    console.log(`\n📝 [Contract] SubdomainPurchased event received`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);
    console.log(`   Subdomain: ${subdomain}.${tld}`);
    console.log(`   Buyer: ${buyer}`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Amount: ${ethers.formatEther(amountPaidFLR)} FLR`);

    await this.handleSubdomainPurchased({
      escrowId: escrowId.toString(),
      buyer,
      tld,
      subdomain,
      amountPaidFLR: amountPaidFLR.toString(),
      priceUSD: priceUSD.toString(),
      tokenId: tokenId.toString(),
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Handle EscrowCompleted event from queryFilter
   */
  async handleCompletedEvent(event) {
    const [escrowId, buyer, amountReleased] = event.args;

    console.log(`\n✅ [Contract] EscrowCompleted event received`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);

    await this.handleEscrowCompleted({
      escrowId: escrowId.toString(),
      buyer,
      amountReleased: amountReleased.toString(),
      txHash: event.transactionHash,
    });
  }

  /**
   * Handle EscrowRefunded event from queryFilter
   */
  async handleRefundedEvent(event) {
    const [escrowId, buyer, amountRefunded] = event.args;

    console.log(`\n⚠️ [Contract] EscrowRefunded event received`);
    console.log(`   Escrow ID: ${escrowId.toString()}`);

    await this.handleEscrowRefunded({
      escrowId: escrowId.toString(),
      buyer,
      amountRefunded: amountRefunded.toString(),
      txHash: event.transactionHash,
    });
  }

  /**
   * Handle SubdomainReleased event from queryFilter
   */
  async handleReleasedEvent(event) {
    const [tokenId, previousOwner, tld, subdomain, fullDomain] = event.args;

    console.log(`\n🗑️ [Contract] SubdomainReleased event received`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Domain: ${fullDomain}`);
    console.log(`   Previous Owner: ${previousOwner}`);

    await this.handleSubdomainReleased({
      tokenId: tokenId.toString(),
      previousOwner,
      tld,
      subdomain,
      fullDomain,
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
    });
  }

  /**
   * Handle SubdomainPurchased event
   */
  async handleSubdomainPurchased(data) {
    const { escrowId, buyer, tld, subdomain, amountPaidFLR, priceUSD, tokenId, txHash, blockNumber } = data;
    const fqdn = `${subdomain}.${tld}`;

    try {
      // Check for duplicate processing (idempotency)
      const existingEvent = await query(
        'SELECT id FROM processed_events WHERE tx_hash = $1 AND event_type = $2',
        [txHash, 'SubdomainPurchased']
      );

      if (existingEvent.rows.length > 0) {
        console.log(`   ⚠ Event already processed, skipping`);
        return;
      }

      // Record the event
      await query(
        'INSERT INTO processed_events (tx_hash, log_index, event_type, block_number) VALUES ($1, $2, $3, $4)',
        [txHash, 0, 'SubdomainPurchased', blockNumber || 0]
      );

      // Create or update pending purchase
      await query(`
        INSERT INTO pending_purchases (escrow_id, wallet_address, subdomain, fqdn, price_flr, token_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
        ON CONFLICT (escrow_id) DO UPDATE SET
          status = 'pending',
          token_id = EXCLUDED.token_id
      `, [escrowId, buyer, subdomain, fqdn, ethers.formatEther(amountPaidFLR), tokenId]);

      // Create DNS records in PowerDNS
      console.log(`   📡 Creating DNS records for ${fqdn}...`);
      const dnsResult = await pdnsService.createSubdomainRecords(subdomain, tld, {
        // Default placeholder record - user can update later
        txt: `halcyon-verified;token=${tokenId};owner=${buyer}`,
      });

      if (dnsResult.success) {
        console.log(`   ✓ DNS records created successfully`);

        // If DNS Oracle is configured, confirm registration
        if (this.dnsOracleContract) {
          console.log(`   🔗 Calling DNS Oracle to confirm registration...`);

          try {
            // Get the requestId from escrowId
            const requestId = await this.dnsOracleContract.escrowToRequest(escrowId);

            if (requestId === 0n) {
              console.log(`   ⚠ No DNS request found for escrow ${escrowId} (may be already processed)`);
            } else {
              // Use block hash and number as HNS proof (simplified - in production would use actual HNS data)
              const block = await this.provider.getBlock('latest');
              const hnsBlockHash = block.hash;
              const hnsBlockHeight = block.number;

              const txResult = await this.sendTransactionWithConfirmation(
                this.dnsOracleContract,
                'confirmDNSRegistration',
                [requestId, hnsBlockHash, hnsBlockHeight],
                'DNS Oracle confirmation'
              );

              if (txResult.success) {
                console.log(`   ✓ DNS registration confirmed on-chain (request ${requestId})`);
              } else {
                log.error({ error: txResult.error }, 'DNS Oracle callback failed');
                // DNS is created, but on-chain confirmation failed
                // The escrow will need manual completion or timeout
              }
            }
          } catch (oracleError) {
            // Handle case where escrow doesn't exist in DNS Oracle (old/processed events)
            if (oracleError.message.includes('reverted') || oracleError.message.includes('CALL_EXCEPTION')) {
              console.log(`   ⚠ Escrow ${escrowId} not found in DNS Oracle (may be old or already processed)`);
            } else {
              log.error({ err: oracleError }, 'DNS Oracle confirmation failed');
            }
          }
        }
      } else {
        log.error({ error: dnsResult.error }, 'DNS creation failed');

        // If DNS Oracle is configured, report failure
        if (this.dnsOracleContract) {
          try {
            const requestId = await this.dnsOracleContract.escrowToRequest(escrowId);

            if (requestId > 0n) {
              const txResult = await this.sendTransactionWithConfirmation(
                this.dnsOracleContract,
                'failDNSRegistration',
                [requestId, 'DNS creation failed'],
                'DNS Oracle failure report'
              );

              if (txResult.success) {
                console.log(`   → Escrow marked as failed, refund available`);
              } else {
                log.error({ error: txResult.error }, 'DNS Oracle failure callback failed');
              }
            } else {
              console.log(`   ⚠ No DNS request found for escrow ${escrowId} (may be already processed)`);
            }
          } catch (oracleError) {
            // Handle case where escrow doesn't exist in DNS Oracle (old/processed events)
            if (oracleError.message.includes('reverted') || oracleError.message.includes('CALL_EXCEPTION')) {
              console.log(`   ⚠ Escrow ${escrowId} not found in DNS Oracle (may be old or already processed)`);
            } else {
              log.error({ err: oracleError }, 'DNS Oracle failure report failed');
            }
          }
        }
      }

      // Log to audit
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('subdomain_purchased', 'domain', $1, $2, $3)
      `, [fqdn, buyer, JSON.stringify({
        escrowId,
        tokenId,
        amountFLR: ethers.formatEther(amountPaidFLR),
        txHash,
        blockNumber,
        dnsCreated: dnsResult.success,
      })]);

      // Persist block number for restart recovery
      await this.saveLastProcessedBlock(blockNumber);

    } catch (error) {
      log.error({ err: error }, 'Error processing SubdomainPurchased event');
    }
  }

  /**
   * Handle EscrowCompleted event
   */
  async handleEscrowCompleted(data) {
    const { escrowId, buyer, amountReleased, txHash } = data;

    try {
      // Get escrow details from contract
      const escrow = await this.escrowContract.getEscrow(escrowId);
      const fqdn = `${escrow.subdomain}.${escrow.tld}`;

      // Update pending purchase status
      await query(
        "UPDATE pending_purchases SET status = 'completed', completed_at = NOW() WHERE escrow_id = $1",
        [escrowId]
      );

      // Get or create TLD
      let tldResult = await query('SELECT id FROM tlds WHERE name = $1', [escrow.tld.toLowerCase()]);
      let tldId;

      if (tldResult.rows.length === 0) {
        const insertResult = await query(
          'INSERT INTO tlds (name, is_active) VALUES ($1, true) RETURNING id',
          [escrow.tld.toLowerCase()]
        );
        tldId = insertResult.rows[0].id;
      } else {
        tldId = tldResult.rows[0].id;
      }

      // Create or update domain record
      const tier = escrow.subdomain.length === 1 ? 'ultra_premium' :
                   escrow.subdomain.length === 2 ? 'premium' :
                   escrow.subdomain.length === 3 ? 'standard_plus' : 'standard';

      await query(`
        INSERT INTO domains (
          token_id, subdomain, tld_id, fqdn, owner_wallet, original_buyer,
          registration_price_flr, registration_price_usd, registration_date,
          status, tier, dns_active
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, NOW(), 'active', $8, true)
        ON CONFLICT (fqdn) DO UPDATE SET
          owner_wallet = EXCLUDED.owner_wallet,
          token_id = EXCLUDED.token_id,
          status = 'active',
          dns_active = true,
          updated_at = NOW()
      `, [
        escrow.tokenId.toString(),
        escrow.subdomain.toLowerCase(),
        tldId,
        fqdn.toLowerCase(),
        buyer,
        ethers.formatEther(amountReleased),
        ethers.formatEther(escrow.priceUSD),
        tier
      ]);

      console.log(`   ✓ Domain ${fqdn} registration completed`);

      // Copy NFT preparation data (AI image CIDs) to domains table
      console.log(`   📷 Looking for NFT preparation data for ${fqdn}...`);
      const nftUpdateResult = await query(`
        UPDATE domains d
        SET nft_image_cid = p.image_cid,
            nft_metadata_cid = p.metadata_cid,
            nft_generation_seed = p.generation_seed,
            metadata_uri = 'ipfs://' || p.metadata_cid
        FROM nft_preparations p
        WHERE d.fqdn = p.fqdn
        AND d.fqdn = $1
        AND d.nft_image_cid IS NULL
        RETURNING d.fqdn, p.image_cid, p.metadata_cid
      `, [fqdn.toLowerCase()]);

      if (nftUpdateResult.rows.length > 0) {
        const { image_cid, metadata_cid } = nftUpdateResult.rows[0];
        console.log(`   ✓ NFT CIDs copied: image=${image_cid?.substring(0, 12)}..., metadata=${metadata_cid?.substring(0, 12)}...`);
      } else {
        // Check why the update didn't work
        const prepCheck = await query(
          'SELECT image_cid FROM nft_preparations WHERE fqdn = $1',
          [fqdn.toLowerCase()]
        );
        if (prepCheck.rows.length === 0) {
          console.log(`   ⚠ No NFT preparation found for ${fqdn} - image will be missing on explorers!`);
          console.log(`   → User should regenerate via /nft/prepare before listing on marketplace`);
        } else {
          console.log(`   ⚠ NFT preparation exists but domain already has CIDs (skipped)`);
        }
      }

      // Auto-apply user's domain defaults (DNS records and profile layout)
      try {
        const defaults = await getDefaultsForWallet(buyer);
        if (defaults) {
          console.log(`   ⚙️ Applying user domain defaults for ${buyer.substring(0, 10)}...`);

          // Apply DNS records if any are set
          const dnsRecords = {};
          if (defaults.ipv4) dnsRecords.ipv4 = defaults.ipv4;
          if (defaults.ipv6) dnsRecords.ipv6 = defaults.ipv6;
          if (defaults.cname) dnsRecords.cname = defaults.cname;
          if (defaults.txt) dnsRecords.txt = defaults.txt;

          if (Object.keys(dnsRecords).length > 0) {
            const dnsResult = await pdnsService.updateSubdomainRecords(
              escrow.subdomain.toLowerCase(),
              escrow.tld.toLowerCase(),
              dnsRecords
            );
            if (dnsResult.success) {
              console.log(`   ✓ Default DNS records applied: ${Object.keys(dnsRecords).join(', ')}`);
            } else {
              console.log(`   ⚠ Failed to apply default DNS records: ${dnsResult.error}`);
            }
          }

          // Apply default profile layout if set
          if (defaults.defaultLayout && defaults.defaultLayout !== 'standard') {
            const domainResult = await query(
              'SELECT id FROM domains WHERE fqdn = $1',
              [fqdn.toLowerCase()]
            );
            if (domainResult.rows.length > 0) {
              await query(`
                INSERT INTO profile_settings (domain_id, layout)
                VALUES ($1, $2)
                ON CONFLICT (domain_id) DO UPDATE SET layout = EXCLUDED.layout
              `, [domainResult.rows[0].id, defaults.defaultLayout]);
              console.log(`   ✓ Default profile layout applied: ${defaults.defaultLayout}`);
            }
          }
        }
      } catch (defaultsError) {
        log.warn({ err: defaultsError }, 'Failed to apply domain defaults (non-critical)');
      }

      // Log to audit
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('escrow_completed', 'domain', $1, $2, $3)
      `, [fqdn, buyer, JSON.stringify({ escrowId, txHash, amountReleased: ethers.formatEther(amountReleased) })]);

      // Send registration success email
      try {
        await emailService.sendNotification(buyer, 'registration_success', {
          fqdn: fqdn.toLowerCase(),
          tokenId: escrow.tokenId.toString(),
        });
      } catch (emailError) {
        log.warn({ err: emailError }, 'Failed to send registration email (non-critical)');
      }

    } catch (error) {
      log.error({ err: error }, 'Error processing EscrowCompleted event');
    }
  }

  /**
   * Handle EscrowRefunded event
   */
  async handleEscrowRefunded(data) {
    const { escrowId, buyer, amountRefunded, txHash } = data;

    try {
      // Update pending purchase status
      await query(
        "UPDATE pending_purchases SET status = 'refunded' WHERE escrow_id = $1",
        [escrowId]
      );

      // Get escrow details for DNS cleanup
      try {
        const escrow = await this.escrowContract.getEscrow(escrowId);
        const fqdn = `${escrow.subdomain}.${escrow.tld}`;

        // Delete DNS records
        await pdnsService.deleteSubdomainRecords(escrow.subdomain, escrow.tld);
        console.log(`   ✓ DNS records deleted for ${fqdn}`);

        // Log to audit
        await query(`
          INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
          VALUES ('escrow_refunded', 'domain', $1, $2, $3)
        `, [fqdn, buyer, JSON.stringify({ escrowId, txHash, amountRefunded: ethers.formatEther(amountRefunded) })]);

      } catch (e) {
        log.warn({ err: e }, 'Could not cleanup DNS during refund');
      }

    } catch (error) {
      log.error({ err: error }, 'Error processing EscrowRefunded event');
    }
  }

  /**
   * Handle SubdomainReleased event - domain is being released back to availability
   */
  async handleSubdomainReleased(data) {
    const { tokenId, previousOwner, tld, subdomain, fullDomain, txHash, blockNumber } = data;

    try {
      // Delete DNS records from PowerDNS
      console.log(`   📡 Deleting DNS records for ${fullDomain}...`);
      const dnsResult = await pdnsService.deleteSubdomainRecords(subdomain, tld);
      if (dnsResult.success) {
        console.log(`   ✓ DNS records deleted`);
      } else {
        console.log(`   ⚠ DNS deletion failed: ${dnsResult.error}`);
      }

      // Update database - mark domain as released (available for re-registration)
      const updateResult = await query(`
        UPDATE domains SET
          status = 'released',
          owner_wallet = NULL,
          token_id = NULL,
          dns_active = false,
          updated_at = NOW()
        WHERE fqdn = $1
        RETURNING id
      `, [fullDomain]);

      if (updateResult.rows.length > 0) {
        console.log(`   ✓ Domain marked as released in database`);
      } else {
        console.log(`   ⚠ Domain not found in database`);
      }

      // Log to audit
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('subdomain_released', 'domain', $1, $2, $3)
      `, [fullDomain, previousOwner, JSON.stringify({
        tokenId,
        txHash,
        blockNumber,
      })]);

      console.log(`   ✓ ${fullDomain} is now available for re-registration!`);

      // Persist block number
      await this.saveLastProcessedBlock(blockNumber);

    } catch (error) {
      log.error({ err: error }, 'Error processing SubdomainReleased event');
    }
  }

  /**
   * Handle DomainReclaimed event - domain transferred to treasury after grace period
   */
  async handleDomainReclaimedEvent(event) {
    const [tokenId, previousOwner, treasury] = event.args;

    console.log(`\n🔄 [Contract] DomainReclaimed event received`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Previous Owner: ${previousOwner}`);
    console.log(`   Treasury: ${treasury}`);

    try {
      // Update domain in database
      await query(`
        UPDATE domains SET
          owner_wallet = $1,
          status = 'reclaimed',
          reclaimed_at = NOW(),
          updated_at = NOW()
        WHERE token_id = $2
      `, [treasury, tokenId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log to audit
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('domain_reclaimed', 'domain', $1, $2, $3)
      `, [fqdn || tokenId.toString(), previousOwner, JSON.stringify({
        tokenId: tokenId.toString(),
        previousOwner,
        treasury,
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
      })]);

      console.log(`   ✓ Domain ${fqdn || `token ${tokenId}`} reclaimed to treasury`);

      // Persist block number
      await this.saveLastProcessedBlock(event.blockNumber);

    } catch (error) {
      log.error({ err: error }, 'Error processing DomainReclaimed event');
    }
  }

  /**
   * Handle ERC721 Transfer event - update owner_wallet when NFT changes hands
   */
  async handleTransferEvent(event) {
    const [from, to, tokenId] = event.args;

    // Skip mint (from zero) and burn (to zero) — those are handled by other events
    if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) return;

    try {
      // Look up domain by token_id
      const result = await query('SELECT fqdn, owner_wallet FROM domains WHERE token_id = $1', [tokenId.toString()]);
      if (result.rows.length === 0) return;

      const domain = result.rows[0];

      // Skip if already up to date
      if (domain.owner_wallet && domain.owner_wallet.toLowerCase() === to.toLowerCase()) return;

      console.log(`\n🔄 [Contract] Transfer event: token ${tokenId} (${domain.fqdn})`);
      console.log(`   From: ${from}`);
      console.log(`   To:   ${to}`);

      await query('UPDATE domains SET owner_wallet = $1, updated_at = NOW() WHERE token_id = $2', [to, tokenId.toString()]);

      console.log(`   ✓ owner_wallet updated for ${domain.fqdn}`);
      await this.saveLastProcessedBlock(event.blockNumber);

    } catch (error) {
      log.error({ err: error, tokenId: tokenId.toString() }, 'Error processing Transfer event');
    }
  }

  // =============================================================
  //                    MARKETPLACE EVENT HANDLERS
  // =============================================================

  /**
   * Handle Listed event from marketplace
   */
  async handleListedEvent(event) {
    const [listingId, tokenId, seller, price, listingType, endTime] = event.args;

    console.log(`\n🏷️ [Marketplace] Listed event received`);
    console.log(`   Listing ID: ${listingId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Seller: ${seller}`);
    console.log(`   Price: ${ethers.formatEther(price)} FLR`);
    console.log(`   Type: ${listingType === 0 ? 'Fixed Price' : 'Auction'}`);

    try {
      // Get domain info by token ID
      const domainResult = await query(
        'SELECT id, fqdn FROM domains WHERE token_id = $1',
        [tokenId.toString()]
      );
      const domain = domainResult.rows[0];
      const fqdn = domain?.fqdn || null;

      // Insert listing
      await query(`
        INSERT INTO marketplace_listings (
          listing_id, token_id, domain_id, fqdn, seller_wallet, price,
          listing_type, status, end_time, tx_hash, block_number, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9, $10, NOW())
        ON CONFLICT (listing_id) DO UPDATE SET
          price = EXCLUDED.price,
          status = 'active',
          end_time = EXCLUDED.end_time
      `, [
        listingId.toString(),
        tokenId.toString(),
        domain?.id || null,
        fqdn,
        seller,
        ethers.formatEther(price),
        listingType === 0 ? 'fixed_price' : 'auction',
        endTime > 0 ? new Date(Number(endTime) * 1000) : null,
        event.transactionHash,
        event.blockNumber,
      ]);

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, listing_id, token_id, fqdn, actor_wallet, amount, tx_hash, block_number)
        VALUES ('listed', $1, $2, $3, $4, $5, $6, $7)
      `, [listingId.toString(), tokenId.toString(), fqdn, seller, ethers.formatEther(price), event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Listing ${listingId} recorded for ${fqdn || `token ${tokenId}`}`);

      // Clear marketplace caches
      cacheService.clearListings();
      cacheService.clearStats();

    } catch (error) {
      log.error({ err: error }, 'Error processing Listed event');
    }
  }

  /**
   * Handle Sale event from marketplace
   */
  async handleSaleEvent(event) {
    const [listingId, tokenId, seller, buyer, price, royaltyAmount, platformFee] = event.args;

    console.log(`\n💰 [Marketplace] Sale event received`);
    console.log(`   Listing ID: ${listingId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Seller: ${seller}`);
    console.log(`   Buyer: ${buyer}`);
    console.log(`   Price: ${ethers.formatEther(price)} FLR`);

    try {
      // Update listing
      await query(`
        UPDATE marketplace_listings SET
          status = 'sold',
          buyer_wallet = $1,
          sale_price = $2,
          royalty_amount = $3,
          platform_fee = $4,
          sold_at = NOW()
        WHERE listing_id = $5
      `, [buyer, ethers.formatEther(price), ethers.formatEther(royaltyAmount), ethers.formatEther(platformFee), listingId.toString()]);

      // Update domain owner
      await query(`
        UPDATE domains SET owner_wallet = $1, updated_at = NOW() WHERE token_id = $2
      `, [buyer, tokenId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, listing_id, token_id, fqdn, actor_wallet, counterparty_wallet, amount, tx_hash, block_number)
        VALUES ('sale', $1, $2, $3, $4, $5, $6, $7, $8)
      `, [listingId.toString(), tokenId.toString(), fqdn, seller, buyer, ethers.formatEther(price), event.transactionHash, event.blockNumber]);

      // Audit log
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('marketplace_sale', 'domain', $1, $2, $3)
      `, [fqdn || tokenId.toString(), buyer, JSON.stringify({
        listingId: listingId.toString(),
        tokenId: tokenId.toString(),
        seller,
        price: ethers.formatEther(price),
        royaltyAmount: ethers.formatEther(royaltyAmount),
        platformFee: ethers.formatEther(platformFee),
        txHash: event.transactionHash,
      })]);

      console.log(`   ✓ Sale recorded: ${fqdn || `token ${tokenId}`} sold to ${buyer}`);

      // Clear all marketplace caches on sale
      cacheService.clearMarketplace();

      // Send sale completed email to seller
      if (fqdn) {
        try {
          await emailService.sendNotification(seller, 'sale_completed', {
            fqdn,
            price: ethers.formatEther(price),
            received: (parseFloat(ethers.formatEther(price)) - parseFloat(ethers.formatEther(royaltyAmount)) - parseFloat(ethers.formatEther(platformFee))).toFixed(4),
            royalty: ethers.formatEther(royaltyAmount),
            platformFee: ethers.formatEther(platformFee),
          });
        } catch (emailError) {
          log.warn({ err: emailError }, 'Failed to send sale email (non-critical)');
        }
      }

    } catch (error) {
      log.error({ err: error }, 'Error processing Sale event');
    }
  }

  /**
   * Handle ListingCancelled event from marketplace
   */
  async handleListingCancelledEvent(event) {
    const [listingId, tokenId] = event.args;

    console.log(`\n❌ [Marketplace] ListingCancelled event received`);
    console.log(`   Listing ID: ${listingId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);

    try {
      // Update listing
      await query(`
        UPDATE marketplace_listings SET status = 'cancelled', cancelled_at = NOW()
        WHERE listing_id = $1
      `, [listingId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, listing_id, token_id, fqdn, tx_hash, block_number)
        VALUES ('listing_cancelled', $1, $2, $3, $4, $5)
      `, [listingId.toString(), tokenId.toString(), fqdn, event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Listing ${listingId} cancelled`);

      // Clear marketplace caches
      cacheService.clearListings();
      cacheService.clearStats();

    } catch (error) {
      log.error({ err: error }, 'Error processing ListingCancelled event');
    }
  }

  /**
   * Handle BidPlaced event from marketplace
   */
  async handleBidPlacedEvent(event) {
    const [listingId, tokenId, bidder, amount] = event.args;

    console.log(`\n🔨 [Marketplace] BidPlaced event received`);
    console.log(`   Listing ID: ${listingId.toString()}`);
    console.log(`   Bidder: ${bidder}`);
    console.log(`   Amount: ${ethers.formatEther(amount)} FLR`);

    try {
      // Get previous highest bidder before updating
      const prevBidResult = await query(`
        SELECT highest_bidder, highest_bid FROM marketplace_listings WHERE listing_id = $1
      `, [listingId.toString()]);
      const previousBidder = prevBidResult.rows[0]?.highest_bidder;
      const previousBid = prevBidResult.rows[0]?.highest_bid;

      // Update listing with highest bid
      await query(`
        UPDATE marketplace_listings SET highest_bidder = $1, highest_bid = $2
        WHERE listing_id = $3
      `, [bidder, ethers.formatEther(amount), listingId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, listing_id, token_id, fqdn, actor_wallet, amount, tx_hash, block_number)
        VALUES ('bid_placed', $1, $2, $3, $4, $5, $6, $7)
      `, [listingId.toString(), tokenId.toString(), fqdn, bidder, ethers.formatEther(amount), event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Bid recorded: ${ethers.formatEther(amount)} FLR`);

      // Send outbid email to previous bidder
      if (previousBidder && previousBidder !== bidder && fqdn) {
        try {
          await emailService.sendNotification(previousBidder, 'auction_outbid', {
            fqdn,
            yourBid: previousBid || '0',
            newBid: ethers.formatEther(amount),
          });
        } catch (emailError) {
          log.warn({ err: emailError }, 'Failed to send outbid email (non-critical)');
        }
      }

    } catch (error) {
      log.error({ err: error }, 'Error processing BidPlaced event');
    }
  }

  /**
   * Handle OfferMade event from marketplace
   */
  async handleOfferMadeEvent(event) {
    const [offerId, tokenId, offerer, amount, expiresAt] = event.args;

    console.log(`\n📝 [Marketplace] OfferMade event received`);
    console.log(`   Offer ID: ${offerId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Offerer: ${offerer}`);
    console.log(`   Amount: ${ethers.formatEther(amount)} FLR`);

    try {
      // Get domain info
      const domainResult = await query('SELECT id, fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const domain = domainResult.rows[0];
      const fqdn = domain?.fqdn || null;

      // Insert offer
      await query(`
        INSERT INTO marketplace_offers (
          offer_id, token_id, domain_id, fqdn, offerer_wallet, amount, expires_at, tx_hash, block_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (offer_id) DO UPDATE SET
          amount = EXCLUDED.amount,
          expires_at = EXCLUDED.expires_at
      `, [
        offerId.toString(),
        tokenId.toString(),
        domain?.id || null,
        fqdn,
        offerer,
        ethers.formatEther(amount),
        new Date(Number(expiresAt) * 1000),
        event.transactionHash,
        event.blockNumber,
      ]);

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, offer_id, token_id, fqdn, actor_wallet, amount, tx_hash, block_number)
        VALUES ('offer_made', $1, $2, $3, $4, $5, $6, $7)
      `, [offerId.toString(), tokenId.toString(), fqdn, offerer, ethers.formatEther(amount), event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Offer ${offerId} recorded for ${fqdn || `token ${tokenId}`}`);

      // Send offer notification to domain owner
      if (fqdn) {
        try {
          const ownerResult = await query('SELECT owner_wallet FROM domains WHERE token_id = $1', [tokenId.toString()]);
          const owner = ownerResult.rows[0]?.owner_wallet;
          if (owner && owner !== offerer) {
            await emailService.sendNotification(owner, 'offer_received', {
              fqdn,
              amount: ethers.formatEther(amount),
              expiresAt: new Date(Number(expiresAt) * 1000).toLocaleDateString(),
            });
          }
        } catch (emailError) {
          log.warn({ err: emailError }, 'Failed to send offer email (non-critical)');
        }
      }

    } catch (error) {
      log.error({ err: error }, 'Error processing OfferMade event');
    }
  }

  /**
   * Handle OfferAccepted event from marketplace
   */
  async handleOfferAcceptedEvent(event) {
    const [offerId, tokenId, seller, buyer, amount] = event.args;

    console.log(`\n✅ [Marketplace] OfferAccepted event received`);
    console.log(`   Offer ID: ${offerId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);
    console.log(`   Seller: ${seller}`);
    console.log(`   Buyer: ${buyer}`);
    console.log(`   Amount: ${ethers.formatEther(amount)} FLR`);

    try {
      // Update offer
      await query(`
        UPDATE marketplace_offers SET is_accepted = true, accepted_by = $1 WHERE offer_id = $2
      `, [seller, offerId.toString()]);

      // Update domain owner
      await query(`
        UPDATE domains SET owner_wallet = $1, updated_at = NOW() WHERE token_id = $2
      `, [buyer, tokenId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, offer_id, token_id, fqdn, actor_wallet, counterparty_wallet, amount, tx_hash, block_number)
        VALUES ('offer_accepted', $1, $2, $3, $4, $5, $6, $7, $8)
      `, [offerId.toString(), tokenId.toString(), fqdn, seller, buyer, ethers.formatEther(amount), event.transactionHash, event.blockNumber]);

      // Audit log
      await query(`
        INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
        VALUES ('offer_accepted', 'domain', $1, $2, $3)
      `, [fqdn || tokenId.toString(), seller, JSON.stringify({
        offerId: offerId.toString(),
        tokenId: tokenId.toString(),
        buyer,
        amount: ethers.formatEther(amount),
        txHash: event.transactionHash,
      })]);

      console.log(`   ✓ Offer ${offerId} accepted: ${fqdn || `token ${tokenId}`} sold to ${buyer}`);

    } catch (error) {
      log.error({ err: error }, 'Error processing OfferAccepted event');
    }
  }

  /**
   * Handle OfferCancelled event from marketplace
   */
  async handleOfferCancelledEvent(event) {
    const [offerId, tokenId] = event.args;

    console.log(`\n❌ [Marketplace] OfferCancelled event received`);
    console.log(`   Offer ID: ${offerId.toString()}`);
    console.log(`   Token ID: ${tokenId.toString()}`);

    try {
      // Update offer
      await query(`
        UPDATE marketplace_offers SET is_cancelled = true WHERE offer_id = $1
      `, [offerId.toString()]);

      // Get fqdn for logging
      const domainResult = await query('SELECT fqdn FROM domains WHERE token_id = $1', [tokenId.toString()]);
      const fqdn = domainResult.rows[0]?.fqdn || null;

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, offer_id, token_id, fqdn, tx_hash, block_number)
        VALUES ('offer_cancelled', $1, $2, $3, $4, $5)
      `, [offerId.toString(), tokenId.toString(), fqdn, event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Offer ${offerId} cancelled`);

    } catch (error) {
      log.error({ err: error }, 'Error processing OfferCancelled event');
    }
  }

  /**
   * Handle PriceUpdated event from marketplace
   */
  async handlePriceUpdatedEvent(event) {
    const [listingId, oldPrice, newPrice] = event.args;

    console.log(`\n💲 [Marketplace] PriceUpdated event received`);
    console.log(`   Listing ID: ${listingId.toString()}`);
    console.log(`   Old Price: ${ethers.formatEther(oldPrice)} FLR`);
    console.log(`   New Price: ${ethers.formatEther(newPrice)} FLR`);

    try {
      // Update listing
      await query(`
        UPDATE marketplace_listings SET price = $1 WHERE listing_id = $2
      `, [ethers.formatEther(newPrice), listingId.toString()]);

      // Get listing info for logging
      const listingResult = await query('SELECT token_id, fqdn FROM marketplace_listings WHERE listing_id = $1', [listingId.toString()]);
      const listing = listingResult.rows[0];

      // Log activity
      await query(`
        INSERT INTO marketplace_activity (event_type, listing_id, token_id, fqdn, amount, tx_hash, block_number)
        VALUES ('price_updated', $1, $2, $3, $4, $5, $6)
      `, [listingId.toString(), listing?.token_id || null, listing?.fqdn || null, ethers.formatEther(newPrice), event.transactionHash, event.blockNumber]);

      console.log(`   ✓ Price updated for listing ${listingId}`);

    } catch (error) {
      log.error({ err: error }, 'Error processing PriceUpdated event');
    }
  }

  /**
   * Handle disconnection and reconnect
   */
  async handleDisconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached, stopping listener');
      this.isListening = false;
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting to provider (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    try {
      await this.initialize();
      await this.start();
    } catch (error) {
      log.error({ err: error }, 'Reconnection failed');
      this.handleDisconnect();
    }
  }

  /**
   * Stop listening for events
   */
  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.escrowContract) {
      this.escrowContract.removeAllListeners();
    }
    if (this.nftContract) {
      this.nftContract.removeAllListeners();
    }
    if (this.marketplaceContract) {
      this.marketplaceContract.removeAllListeners();
    }
    if (this.provider) {
      this.provider.removeAllListeners();
    }
    this.isListening = false;
    console.log('Contract event listener stopped');
  }

  /**
   * Get listener status
   */
  getStatus() {
    return {
      isListening: this.isListening,
      escrowContract: config.contracts.escrow,
      nftContract: config.contracts.nft,
      marketplaceContract: config.contracts.marketplace,
      dnsOracleEnabled: !!this.dnsOracleContract,
      marketplaceEnabled: !!this.marketplaceContract,
      reconnectAttempts: this.reconnectAttempts,
      lastProcessedBlock: this.lastProcessedBlock,
    };
  }

  /**
   * Manually process past events (catchup)
   * Batches queries to respect Flare's 30-block limit
   */
  async catchupEvents(fromBlock = 0) {
    console.log(`Catching up events from block ${fromBlock}...`);

    // Flare RPC limits queries to 30 blocks at a time
    const BATCH_SIZE = 30;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const filter = this.escrowContract.filters.SubdomainPurchased();

      // If range is small enough, query directly
      if (currentBlock - fromBlock <= BATCH_SIZE) {
        const events = await this.escrowContract.queryFilter(filter, fromBlock, currentBlock);
        console.log(`Found ${events.length} SubdomainPurchased events`);

        for (const event of events) {
          await this.processEvent(event);
        }

        await this.saveLastProcessedBlock(currentBlock);
        return { success: true, eventsProcessed: events.length };
      }

      // Otherwise, batch the queries
      let totalEvents = 0;
      let start = fromBlock;
      const totalBlocks = currentBlock - fromBlock;

      console.log(`   Scanning ${totalBlocks} blocks in batches of ${BATCH_SIZE}...`);

      while (start <= currentBlock) {
        const end = Math.min(start + BATCH_SIZE - 1, currentBlock);

        try {
          const events = await this.escrowContract.queryFilter(filter, start, end);

          if (events.length > 0) {
            console.log(`   Found ${events.length} events in blocks ${start}-${end}`);
            for (const event of events) {
              await this.processEvent(event);
            }
            totalEvents += events.length;
          }

          // Save progress after each batch
          await this.saveLastProcessedBlock(end);

        } catch (batchError) {
          log.error({ err: batchError, fromBlock: start, toBlock: end }, 'Catchup batch query error');
          // Continue to next batch - don't fail entire catchup
        }

        // Progress indicator every 10 batches
        const progress = Math.round(((end - fromBlock) / totalBlocks) * 100);
        if ((end - fromBlock) % (BATCH_SIZE * 10) === 0 && progress < 100) {
          console.log(`   Progress: ${progress}% (block ${end})`);
        }

        start = end + 1;

        // Small delay to avoid rate limiting
        if (start <= currentBlock) {
          await this.sleep(100);
        }
      }

      console.log(`   Catchup complete: ${totalEvents} events processed`);
      return { success: true, eventsProcessed: totalEvents };

    } catch (error) {
      log.error({ err: error }, 'Catchup failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a single event from queryFilter
   */
  async processEvent(event) {
    const [escrowId, buyer, tld, subdomain, amountPaidFLR, priceUSD, tokenId] = event.args;

    const data = {
      escrowId: escrowId.toString(),
      buyer,
      tld,
      subdomain,
      amountPaidFLR: amountPaidFLR.toString(),
      priceUSD: priceUSD.toString(),
      tokenId: tokenId.toString(),
      txHash: event.transactionHash,
      blockNumber: event.blockNumber,
    };

    await this.handleSubdomainPurchased(data);
  }
}

export const contractListener = new ContractListenerService();
export default contractListener;
