import { ethers } from 'ethers';
import config from '../config/index.js';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';
import { createFallbackProvider } from '../utils/rpcProvider.js';
import { pdnsService } from './pdns.js';

const log = loggers.stakingListener;

// ============================================================
// ABI Definitions (human-readable event strings)
// ============================================================

const HSR_TLD_ABI = [
  'event TldMinted(uint256 indexed tokenId, bytes32 indexed namehash, string label, address indexed to)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event RegistrationEnabledUpdated(bytes32 indexed namehash, bool enabled)',
  'event RegistrationStrategyUpdated(bytes32 indexed namehash, address strategy)',
];

const HSR_SLD_ABI = [
  'event SldMinted(uint256 indexed tokenId, bytes32 indexed sldNamehash, bytes32 indexed parentNamehash, string label, address to, uint256 expiryTime, uint256 priceUsdCents)',
  'event SldRenewed(bytes32 indexed sldNamehash, uint256 newExpiryTime, uint256 additionalYears)',
  'event ArtworkSet(uint256 indexed tokenId, string ipfsHash)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

const SLD_REG_MANAGER_ABI = [
  'event Registered(bytes32 indexed sldNamehash, bytes32 indexed tldNamehash, string label, address indexed buyer, uint256 tokenId, uint256 priceUsdCents, uint256 priceLockPerYear, uint256 durationYears)',
  'event Renewed(bytes32 indexed sldNamehash, address indexed payer, uint256 additionalYears, uint256 renewalPriceUsdCents)',
  'event ArtworkRequested(uint256 indexed tokenId, bytes32 indexed tldNamehash, string label)',
];

const PAYMENT_MANAGER_ABI = [
  'event PaymentProcessed(bytes32 indexed tldNamehash, address indexed tldOwner, uint256 tldOwnerAmount, uint256 platformAmount, uint256 priceUsdCents)',
];

const DEFAULT_STRATEGY_ABI = [
  'event LengthPricesSet(bytes32 indexed tldNamehash)',
  'event PremiumNameSet(bytes32 indexed tldNamehash, string label, uint256 priceUsdCents)',
  'event ReservedNameSet(bytes32 indexed tldNamehash, string label, address wallet)',
  'event MultiYearDiscountsSet(bytes32 indexed tldNamehash)',
  // View functions for on-chain reads after config events
  'function getLengthPrices(bytes32 tldNamehash) external view returns (uint256[10])',
  'function getMultiYearDiscounts(bytes32 tldNamehash) external view returns (uint256[10])',
];

const TLD_CLAIM_MANAGER_ABI = [
  'event StakeRequested(bytes32 indexed namehash, string tldLabel, address indexed claimer, uint256 feePaid)',
  'event StakeCompleted(bytes32 indexed namehash, string tldLabel, address indexed claimer, uint256 tokenId)',
  'event StakeRefunded(bytes32 indexed namehash, address indexed claimer, uint256 amount)',
  'event TldClaimed(bytes32 indexed namehash, string tldLabel, uint256 tokenId, address indexed claimedBy)',
];

// Flare system contracts for voting round calculation
const FLARE_CONTRACT_REGISTRY_ABI = [
  'function getContractAddressByName(string _name) external view returns (address)',
];

const FLARE_SYSTEMS_MANAGER_ABI = [
  'function firstVotingRoundStartTs() external view returns (uint256)',
  'function votingEpochDurationSeconds() external view returns (uint256)',
];

// FlareContractRegistry address (same across Coston2 and mainnet)
const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

// ============================================================
// Staking Listener Service
// ============================================================

class StakingListenerService {
  constructor() {
    this.provider = null;
    this.hsrTldContract = null;
    this.hsrSldContract = null;
    this.sldRegManagerContract = null;
    this.paymentManagerContract = null;
    this.defaultStrategyContract = null;
    this.tldClaimManagerContract = null;
    this.isListening = false;
    this.lastProcessedBlock = 0;
    this.pollingInterval = null;
    this.pollIntervalMs = 5000;

    // FDC voting round parameters (fetched from FlareSystemsManager at init)
    this.firstVotingRoundStartTs = null;
    this.votingEpochDurationSeconds = null;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // Block tracking (independent from v1)
  // ============================================================

  async getLastProcessedBlock() {
    try {
      const result = await query(
        "SELECT value FROM watcher_state WHERE key = 'last_processed_block_v2'"
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

  async saveLastProcessedBlock(blockNumber) {
    try {
      await query(`
        INSERT INTO watcher_state (key, value, updated_at)
        VALUES ('last_processed_block_v2', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
      `, [blockNumber.toString()]);
      this.lastProcessedBlock = blockNumber;
    } catch (error) {
      log.error({ err: error }, 'Failed to save last processed block');
    }
  }

  // ============================================================
  // Idempotency (shared processed_events table, _v2 suffix types)
  // ============================================================

  async isAlreadyProcessed(txHash, logIndex, eventType) {
    try {
      const result = await query(
        'SELECT id FROM processed_events WHERE tx_hash = $1 AND log_index = $2 AND event_type = $3',
        [txHash, logIndex, eventType]
      );
      return result.rows.length > 0;
    } catch (error) {
      log.error({ err: error }, 'Failed to check processed event');
      return false;
    }
  }

  async markProcessed(txHash, logIndex, eventType, blockNumber, data = null) {
    try {
      await query(
        'INSERT INTO processed_events (tx_hash, log_index, event_type, block_number, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (tx_hash, log_index) DO NOTHING',
        [txHash, logIndex, eventType, blockNumber, data ? JSON.stringify(data) : null]
      );
    } catch (error) {
      log.error({ err: error }, 'Failed to mark event processed');
    }
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  async initialize() {
    try {
      const c = config.contractsV2;

      if (!c.hsrTld) {
        log.warn('CONTRACT_V2_HSR_TLD not configured — v2 listener disabled');
        return { success: false, error: 'v2 contracts not configured' };
      }

      this.provider = createFallbackProvider();

      this.hsrTldContract = new ethers.Contract(c.hsrTld, HSR_TLD_ABI, this.provider);
      this.hsrSldContract = new ethers.Contract(c.hsrSld, HSR_SLD_ABI, this.provider);
      this.sldRegManagerContract = new ethers.Contract(c.sldRegistrationManager, SLD_REG_MANAGER_ABI, this.provider);
      this.paymentManagerContract = new ethers.Contract(c.paymentManager, PAYMENT_MANAGER_ABI, this.provider);
      this.defaultStrategyContract = new ethers.Contract(c.defaultRegistrationStrategy, DEFAULT_STRATEGY_ABI, this.provider);

      if (c.tldClaimManager) {
        this.tldClaimManagerContract = new ethers.Contract(c.tldClaimManager, TLD_CLAIM_MANAGER_ABI, this.provider);
      }

      // Fetch FDC voting round parameters from FlareSystemsManager
      try {
        const registry = new ethers.Contract(FLARE_CONTRACT_REGISTRY, FLARE_CONTRACT_REGISTRY_ABI, this.provider);
        const fsmAddress = await registry.getContractAddressByName('FlareSystemsManager');
        const fsm = new ethers.Contract(fsmAddress, FLARE_SYSTEMS_MANAGER_ABI, this.provider);
        this.firstVotingRoundStartTs = Number(await fsm.firstVotingRoundStartTs());
        this.votingEpochDurationSeconds = Number(await fsm.votingEpochDurationSeconds());
        log.info({
          firstVotingRoundStartTs: this.firstVotingRoundStartTs,
          votingEpochDurationSeconds: this.votingEpochDurationSeconds,
          flareSystemsManager: fsmAddress,
        }, 'FDC voting round parameters loaded');
      } catch (fsmErr) {
        log.warn({ err: fsmErr }, 'Could not load FDC voting round params — fdc_round_id will not be set');
      }

      this.lastProcessedBlock = await this.getLastProcessedBlock();

      log.info({
        hsrTld: c.hsrTld,
        hsrSld: c.hsrSld,
        sldRegManager: c.sldRegistrationManager,
        paymentManager: c.paymentManager,
        defaultStrategy: c.defaultRegistrationStrategy,
        tldClaimManager: c.tldClaimManager || 'not configured',
        resumeBlock: this.lastProcessedBlock || 'first run',
      }, 'v2 staking listener initialized');

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'v2 staking listener init error');
      return { success: false, error: error.message };
    }
  }

  async start() {
    if (this.isListening) {
      log.info('v2 staking listener already running');
      return;
    }

    try {
      const currentBlock = await this.provider.getBlockNumber();

      this.isListening = true;
      this.startPolling();

      if (this.lastProcessedBlock > 0 && this.lastProcessedBlock < currentBlock) {
        const blocksBehind = currentBlock - this.lastProcessedBlock;
        log.info({ blocksBehind }, 'Catching up v2 events in background');
      } else if (this.lastProcessedBlock === 0) {
        await this.saveLastProcessedBlock(currentBlock);
        log.info({ startBlock: currentBlock }, 'v2 first run, starting from current block');
      }

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'Failed to start v2 staking listener');
      return { success: false, error: error.message };
    }
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isListening = false;
    log.info('v2 staking listener stopped');
  }

  getStatus() {
    return {
      isListening: this.isListening,
      lastProcessedBlock: this.lastProcessedBlock,
      contracts: {
        hsrTld: config.contractsV2.hsrTld,
        hsrSld: config.contractsV2.hsrSld,
        sldRegistrationManager: config.contractsV2.sldRegistrationManager,
        paymentManager: config.contractsV2.paymentManager,
        defaultRegistrationStrategy: config.contractsV2.defaultRegistrationStrategy,
      },
    };
  }

  // ============================================================
  // Polling
  // ============================================================

  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      await this.pollForEvents();
    }, this.pollIntervalMs);

    this.pollForEvents();
  }

  async pollForEvents() {
    if (!this.isListening) return;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      if (currentBlock <= this.lastProcessedBlock) return;

      const fromBlock = this.lastProcessedBlock + 1;
      const toBlock = currentBlock;

      await this.queryHsrTldEvents(fromBlock, toBlock);
      await this.queryHsrSldEvents(fromBlock, toBlock);
      await this.querySldRegManagerEvents(fromBlock, toBlock);
      await this.queryPaymentManagerEvents(fromBlock, toBlock);
      await this.queryStrategyEvents(fromBlock, toBlock);
      if (this.tldClaimManagerContract) {
        await this.queryTldClaimManagerEvents(fromBlock, toBlock);
      }

      await this.saveLastProcessedBlock(currentBlock);
    } catch (error) {
      const isRateLimit = error.message?.includes('rate limit') || error.message?.includes('429');
      if (isRateLimit) {
        log.warn('v2 polling rate-limited, will retry next interval');
      } else {
        log.error({ err: error }, 'v2 polling error');
      }
    }
  }

  async queryInBatches(contract, filter, fromBlock, toBlock) {
    const BATCH_SIZE = 30;
    const allEvents = [];

    for (let start = fromBlock; start <= toBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, toBlock);

      try {
        const events = await contract.queryFilter(filter, start, end);
        allEvents.push(...events);
      } catch (batchError) {
        const isRateLimit = batchError.message?.includes('rate limit') || batchError.message?.includes('429');
        if (!isRateLimit) {
          log.error({ err: batchError, fromBlock: start, toBlock: end }, 'v2 batch query error');
        }
      }

      if (start + BATCH_SIZE <= toBlock) {
        await this.sleep(100);
      }
    }

    return allEvents;
  }

  // ============================================================
  // Query methods (one per contract)
  // ============================================================

  async queryHsrTldEvents(fromBlock, toBlock) {
    const tldMinted = await this.queryInBatches(
      this.hsrTldContract, this.hsrTldContract.filters.TldMinted(), fromBlock, toBlock
    );
    for (const event of tldMinted) {
      await this.handleTldMinted(event);
    }

    const transfers = await this.queryInBatches(
      this.hsrTldContract, this.hsrTldContract.filters.Transfer(), fromBlock, toBlock
    );
    for (const event of transfers) {
      await this.handleTldTransfer(event);
    }

    const regEnabled = await this.queryInBatches(
      this.hsrTldContract, this.hsrTldContract.filters.RegistrationEnabledUpdated(), fromBlock, toBlock
    );
    for (const event of regEnabled) {
      await this.handleRegistrationEnabledUpdated(event);
    }

    const stratUpdated = await this.queryInBatches(
      this.hsrTldContract, this.hsrTldContract.filters.RegistrationStrategyUpdated(), fromBlock, toBlock
    );
    for (const event of stratUpdated) {
      await this.handleRegistrationStrategyUpdated(event);
    }
  }

  async queryHsrSldEvents(fromBlock, toBlock) {
    const sldMinted = await this.queryInBatches(
      this.hsrSldContract, this.hsrSldContract.filters.SldMinted(), fromBlock, toBlock
    );
    for (const event of sldMinted) {
      await this.handleSldMinted(event);
    }

    const sldRenewed = await this.queryInBatches(
      this.hsrSldContract, this.hsrSldContract.filters.SldRenewed(), fromBlock, toBlock
    );
    for (const event of sldRenewed) {
      await this.handleSldRenewed(event);
    }

    const artworkSet = await this.queryInBatches(
      this.hsrSldContract, this.hsrSldContract.filters.ArtworkSet(), fromBlock, toBlock
    );
    for (const event of artworkSet) {
      await this.handleArtworkSet(event);
    }

    const transfers = await this.queryInBatches(
      this.hsrSldContract, this.hsrSldContract.filters.Transfer(), fromBlock, toBlock
    );
    for (const event of transfers) {
      await this.handleSldTransfer(event);
    }
  }

  async querySldRegManagerEvents(fromBlock, toBlock) {
    const registered = await this.queryInBatches(
      this.sldRegManagerContract, this.sldRegManagerContract.filters.Registered(), fromBlock, toBlock
    );
    for (const event of registered) {
      await this.handleRegistered(event);
    }

    const renewed = await this.queryInBatches(
      this.sldRegManagerContract, this.sldRegManagerContract.filters.Renewed(), fromBlock, toBlock
    );
    for (const event of renewed) {
      await this.handleRenewed(event);
    }

    const artRequested = await this.queryInBatches(
      this.sldRegManagerContract, this.sldRegManagerContract.filters.ArtworkRequested(), fromBlock, toBlock
    );
    for (const event of artRequested) {
      await this.handleArtworkRequested(event);
    }
  }

  async queryPaymentManagerEvents(fromBlock, toBlock) {
    const payments = await this.queryInBatches(
      this.paymentManagerContract, this.paymentManagerContract.filters.PaymentProcessed(), fromBlock, toBlock
    );
    for (const event of payments) {
      await this.handlePaymentProcessed(event);
    }
  }

  async queryStrategyEvents(fromBlock, toBlock) {
    const lengthPrices = await this.queryInBatches(
      this.defaultStrategyContract, this.defaultStrategyContract.filters.LengthPricesSet(), fromBlock, toBlock
    );
    for (const event of lengthPrices) {
      await this.handleLengthPricesSet(event);
    }

    const premiumNames = await this.queryInBatches(
      this.defaultStrategyContract, this.defaultStrategyContract.filters.PremiumNameSet(), fromBlock, toBlock
    );
    for (const event of premiumNames) {
      await this.handlePremiumNameSet(event);
    }

    const reservedNames = await this.queryInBatches(
      this.defaultStrategyContract, this.defaultStrategyContract.filters.ReservedNameSet(), fromBlock, toBlock
    );
    for (const event of reservedNames) {
      await this.handleReservedNameSet(event);
    }

    const multiYear = await this.queryInBatches(
      this.defaultStrategyContract, this.defaultStrategyContract.filters.MultiYearDiscountsSet(), fromBlock, toBlock
    );
    for (const event of multiYear) {
      await this.handleMultiYearDiscountsSet(event);
    }
  }

  // ============================================================
  // Query methods — TldClaimManager
  // ============================================================

  async queryTldClaimManagerEvents(fromBlock, toBlock) {
    const stakeRequested = await this.queryInBatches(
      this.tldClaimManagerContract, this.tldClaimManagerContract.filters.StakeRequested(), fromBlock, toBlock
    );
    for (const event of stakeRequested) {
      await this.handleStakeRequested(event);
    }

    const stakeCompleted = await this.queryInBatches(
      this.tldClaimManagerContract, this.tldClaimManagerContract.filters.StakeCompleted(), fromBlock, toBlock
    );
    for (const event of stakeCompleted) {
      await this.handleStakeCompleted(event);
    }

    const stakeRefunded = await this.queryInBatches(
      this.tldClaimManagerContract, this.tldClaimManagerContract.filters.StakeRefunded(), fromBlock, toBlock
    );
    for (const event of stakeRefunded) {
      await this.handleStakeRefunded(event);
    }

    const tldClaimed = await this.queryInBatches(
      this.tldClaimManagerContract, this.tldClaimManagerContract.filters.TldClaimed(), fromBlock, toBlock
    );
    for (const event of tldClaimed) {
      await this.handleTldClaimed(event);
    }
  }

  // ============================================================
  // Event Handlers — TldClaimManager (FDC staking)
  // ============================================================

  /** StakeRequested → INSERT into pending_claims for FDC keeper bot */
  async handleStakeRequested(event) {
    const eventType = 'StakeRequested_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, tldLabel, claimer, feePaid] = event.args;

    try {
      // Extract attestation request bytes from the transaction input data
      let attestationRequestBytes = null;
      try {
        const tx = await this.provider.getTransaction(event.transactionHash);
        if (tx && tx.data) {
          // The abiEncodedRequest is the second parameter of requestStake(string,bytes)
          const iface = new ethers.Interface([
            'function requestStake(string tldLabel, bytes abiEncodedRequest) external payable',
          ]);
          const decoded = iface.decodeFunctionData('requestStake', tx.data);
          attestationRequestBytes = decoded.abiEncodedRequest;
        }
      } catch (decodeErr) {
        log.warn({ err: decodeErr, txHash: event.transactionHash }, 'Could not decode requestStake tx data');
      }

      // Compute FDC voting round ID from block timestamp
      let fdcRoundId = null;
      if (this.firstVotingRoundStartTs && this.votingEpochDurationSeconds) {
        try {
          const block = await this.provider.getBlock(event.blockNumber);
          if (block) {
            fdcRoundId = Math.floor(
              (block.timestamp - this.firstVotingRoundStartTs) / this.votingEpochDurationSeconds
            );
            log.info({ tldLabel, fdcRoundId, blockTimestamp: block.timestamp }, 'Computed FDC voting round ID');
          }
        } catch (blockErr) {
          log.warn({ err: blockErr, txHash: event.transactionHash }, 'Could not fetch block for round ID calculation');
        }
      }

      await query(`
        INSERT INTO pending_claims (tld_label, claimer_address, namehash, staking_fee_paid, attestation_request_bytes, fdc_round_id, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
        ON CONFLICT (namehash) DO UPDATE SET
          claimer_address = EXCLUDED.claimer_address,
          staking_fee_paid = EXCLUDED.staking_fee_paid,
          attestation_request_bytes = EXCLUDED.attestation_request_bytes,
          fdc_round_id = EXCLUDED.fdc_round_id,
          status = 'pending',
          created_at = NOW()
      `, [
        tldLabel,
        claimer.toLowerCase(),
        namehash,
        ethers.formatEther(feePaid),
        attestationRequestBytes,
        fdcRoundId,
      ]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, tldLabel, claimer, feePaid: feePaid.toString(),
      });

      log.info({ tldLabel, claimer, feePaid: ethers.formatEther(feePaid) }, 'StakeRequested processed — pending FDC verification');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling StakeRequested');
    }
  }

  /** StakeCompleted → UPDATE pending_claims to completed */
  async handleStakeCompleted(event) {
    const eventType = 'StakeCompleted_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, tldLabel, claimer, tokenId] = event.args;

    try {
      await query(`
        UPDATE pending_claims SET status = 'completed', tx_hash = $1, completed_at = NOW()
        WHERE namehash = $2 AND status IN ('pending', 'failed')
      `, [event.transactionHash, namehash]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, tldLabel, claimer, tokenId: tokenId.toString(),
      });

      log.info({ tldLabel, claimer, tokenId: tokenId.toString() }, 'StakeCompleted processed — TLD NFT minted');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling StakeCompleted');
    }
  }

  /** StakeRefunded → UPDATE pending_claims to refunded */
  async handleStakeRefunded(event) {
    const eventType = 'StakeRefunded_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, claimer, amount] = event.args;

    try {
      await query(`
        UPDATE pending_claims SET status = 'refunded', completed_at = NOW()
        WHERE namehash = $1 AND status IN ('pending', 'failed')
      `, [namehash]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, claimer, amount: ethers.formatEther(amount),
      });

      log.info({ namehash, claimer, amount: ethers.formatEther(amount) }, 'StakeRefunded processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling StakeRefunded');
    }
  }

  /** TldClaimed (Phase 1 operator mint) → just log it */
  async handleTldClaimed(event) {
    const eventType = 'TldClaimed_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, tldLabel, tokenId, claimedBy] = event.args;

    try {
      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, tldLabel, tokenId: tokenId.toString(), claimedBy,
      });

      log.info({ tldLabel, tokenId: tokenId.toString(), claimedBy }, 'TldClaimed (operator mint) processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling TldClaimed');
    }
  }

  // ============================================================
  // Event Handlers — Critical (core state)
  // ============================================================

  /** #1 TldMinted → INSERT tlds_v2 */
  async handleTldMinted(event) {
    const eventType = 'TldMinted_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tokenId, namehash, label, to] = event.args;

    try {
      const ownerAddr = to.toLowerCase();
      const operatorAddr = (config.operatorAddress || '').toLowerCase();
      const isOfficial = operatorAddr ? ownerAddr === operatorAddr : false;

      await query(`
        INSERT INTO tlds_v2 (token_id, label, namehash, owner_address, is_official, staked_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NOW())
        ON CONFLICT (token_id) DO UPDATE SET
          owner_address = EXCLUDED.owner_address,
          is_official = EXCLUDED.is_official,
          updated_at = NOW()
      `, [
        Number(tokenId),
        label,
        namehash,
        ownerAddr,
        isOfficial,
      ]);

      // Auto-create DNS zone for the new TLD
      try {
        const zoneResult = await pdnsService.ensureZone(label);
        if (zoneResult.success) {
          log.info({ label, existed: zoneResult.exists }, 'DNS zone ensured for new TLD');
        } else {
          log.warn({ label, error: zoneResult.error }, 'Failed to create DNS zone for new TLD');
        }
      } catch (dnsErr) {
        log.warn({ label, err: dnsErr }, 'DNS zone creation failed (non-fatal)');
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), label, namehash, to,
      });

      log.info({ tokenId: tokenId.toString(), label, to }, 'TldMinted processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling TldMinted');
    }
  }

  /** #2 HsrTld Transfer → UPDATE tlds_v2.owner_address (skip mint/burn) */
  async handleTldTransfer(event) {
    const [from, to, tokenId] = event.args;

    if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) return;

    const eventType = 'TldTransfer_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    try {
      const result = await query(
        'UPDATE tlds_v2 SET owner_address = $1, updated_at = NOW() WHERE token_id = $2 RETURNING label',
        [to.toLowerCase(), Number(tokenId)]
      );

      if (result.rows.length === 0) {
        log.warn({ tokenId: tokenId.toString() }, 'TLD transfer for unknown token_id');
        return;
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), from, to,
      });

      log.debug({ tokenId: tokenId.toString(), from, to, label: result.rows[0].label }, 'TldTransfer processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling TldTransfer');
    }
  }

  /** #3 SldMinted → INSERT slds_v2 (lookup tld_id by parentNamehash) */
  async handleSldMinted(event) {
    const eventType = 'SldMinted_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tokenId, sldNamehash, parentNamehash, label, to, expiryTime, priceUsdCents] = event.args;

    try {
      // Lookup tld_id and label from tlds_v2
      const tldResult = await query(
        'SELECT id, label FROM tlds_v2 WHERE namehash = $1',
        [parentNamehash]
      );

      if (tldResult.rows.length === 0) {
        log.warn({ parentNamehash, sldLabel: label }, 'SldMinted references unknown TLD namehash');
        return;
      }

      const tldId = tldResult.rows[0].id;
      const tldLabel = tldResult.rows[0].label;
      const fullName = `${label}.${tldLabel}`;

      // Derive registration_time from block timestamp
      const block = await this.provider.getBlock(event.blockNumber);
      const registrationTime = new Date(block.timestamp * 1000);

      await query(`
        INSERT INTO slds_v2 (
          token_id, label, tld_id, namehash, full_name, owner_address,
          registration_time, expiry_time, registration_price_usd_cents,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (token_id) DO UPDATE SET
          owner_address = EXCLUDED.owner_address,
          expiry_time = EXCLUDED.expiry_time,
          updated_at = NOW()
      `, [
        Number(tokenId),
        label,
        tldId,
        sldNamehash,
        fullName,
        to.toLowerCase(),
        registrationTime,
        new Date(Number(expiryTime) * 1000),
        Number(priceUsdCents),
      ]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), label, fullName, parentNamehash,
      });

      log.debug({ tokenId: tokenId.toString(), fullName, to }, 'SldMinted processed');

      // Auto-create DNS records: A record (domain resolves) + TXT flr= (wallet lookup)
      try {
        const dnsRecords = {
          txt: `flr=${to.toLowerCase()}`,
        };
        if (config.defaultARecordIP) {
          dnsRecords.ipv4 = config.defaultARecordIP;
        }
        const dnsResult = await pdnsService.createSubdomainRecords(label, tldLabel, dnsRecords);
        if (dnsResult.success) {
          log.info({ fullName }, 'Auto-DNS created (A + TXT flr=)');
        } else {
          log.warn({ fullName, error: dnsResult.error }, 'Auto-DNS failed (non-fatal)');
        }
      } catch (dnsErr) {
        log.warn({ fullName, err: dnsErr }, 'Auto-DNS error (non-fatal)');
      }
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling SldMinted');
    }
  }

  /** #4 SldRenewed → UPDATE slds_v2.expiry_time */
  async handleSldRenewed(event) {
    const eventType = 'SldRenewed_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [sldNamehash, newExpiryTime, additionalYears] = event.args;

    try {
      const result = await query(
        'UPDATE slds_v2 SET expiry_time = $1, updated_at = NOW() WHERE namehash = $2 RETURNING full_name',
        [new Date(Number(newExpiryTime) * 1000), sldNamehash]
      );

      if (result.rows.length === 0) {
        log.warn({ sldNamehash }, 'SldRenewed for unknown SLD namehash');
        return;
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        sldNamehash, newExpiryTime: newExpiryTime.toString(), additionalYears: additionalYears.toString(),
      });

      log.debug({ fullName: result.rows[0].full_name, additionalYears: additionalYears.toString() }, 'SldRenewed processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling SldRenewed');
    }
  }

  /** #5 HsrSld Transfer → UPDATE slds_v2.owner_address (skip mint/burn) */
  async handleSldTransfer(event) {
    const [from, to, tokenId] = event.args;

    if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) return;

    const eventType = 'SldTransfer_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    try {
      const result = await query(
        'UPDATE slds_v2 SET owner_address = $1, updated_at = NOW() WHERE token_id = $2 RETURNING full_name',
        [to.toLowerCase(), Number(tokenId)]
      );

      if (result.rows.length === 0) {
        log.warn({ tokenId: tokenId.toString() }, 'SLD transfer for unknown token_id');
        return;
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), from, to,
      });

      log.debug({ tokenId: tokenId.toString(), from, to, fullName: result.rows[0].full_name }, 'SldTransfer processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling SldTransfer');
    }
  }

  /** #6 ArtworkSet → UPDATE sld_artwork_v2 SET status='completed', ipfs_cid */
  async handleArtworkSet(event) {
    const eventType = 'ArtworkSet_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tokenId, ipfsHash] = event.args;

    try {
      await query(`
        UPDATE sld_artwork_v2
        SET status = 'completed', ipfs_cid = $1, completed_at = NOW()
        WHERE token_id = $2 AND status != 'completed'
      `, [ipfsHash, Number(tokenId)]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), ipfsHash,
      });

      log.debug({ tokenId: tokenId.toString(), ipfsHash }, 'ArtworkSet processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling ArtworkSet');
    }
  }

  // ============================================================
  // Event Handlers — Registration flow
  // ============================================================

  /** #7 Registered → INSERT registration_events_v2 (type='register') */
  async handleRegistered(event) {
    const eventType = 'Registered_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [sldNamehash, tldNamehash, label, buyer, tokenId, priceUsdCents, priceLockPerYear, durationYears] = event.args;

    try {
      // Lookup sld_id
      const sldResult = await query('SELECT id FROM slds_v2 WHERE namehash = $1', [sldNamehash]);
      const sldId = sldResult.rows[0]?.id || null;

      await query(`
        INSERT INTO registration_events_v2 (sld_id, event_type, tx_hash, usd_amount, tld_namehash, payer_address, timestamp)
        VALUES ($1, 'register', $2, $3, $4, $5, NOW())
      `, [
        sldId,
        event.transactionHash,
        Number(priceUsdCents) / 100,
        tldNamehash,
        buyer.toLowerCase(),
      ]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        sldNamehash, tldNamehash, label, buyer, tokenId: tokenId.toString(),
        priceUsdCents: priceUsdCents.toString(), durationYears: durationYears.toString(),
      });

      log.debug({ label, buyer, tokenId: tokenId.toString() }, 'Registered processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling Registered');
    }
  }

  /** #8 Renewed → INSERT registration_events_v2 (type='renew') */
  async handleRenewed(event) {
    const eventType = 'Renewed_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [sldNamehash, payer, additionalYears, renewalPriceUsdCents] = event.args;

    try {
      const sldResult = await query('SELECT id FROM slds_v2 WHERE namehash = $1', [sldNamehash]);
      const sldId = sldResult.rows[0]?.id || null;

      await query(`
        INSERT INTO registration_events_v2 (sld_id, event_type, tx_hash, usd_amount, payer_address, timestamp)
        VALUES ($1, 'renew', $2, $3, $4, NOW())
      `, [
        sldId,
        event.transactionHash,
        Number(renewalPriceUsdCents) / 100,
        payer.toLowerCase(),
      ]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        sldNamehash, payer, additionalYears: additionalYears.toString(),
        renewalPriceUsdCents: renewalPriceUsdCents.toString(),
      });

      log.debug({ sldNamehash, payer, additionalYears: additionalYears.toString() }, 'Renewed processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling Renewed');
    }
  }

  /** #9 ArtworkRequested → SKIP auto-queue, artwork only via NFT customization modal */
  async handleArtworkRequested(event) {
    const eventType = 'ArtworkRequested_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tokenId, tldNamehash, label] = event.args;

    try {
      // Auto-artwork disabled — GPUs only spin up via NFT customization flow
      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tokenId: tokenId.toString(), tldNamehash, label, skipped: true,
      });

      log.debug({ tokenId: tokenId.toString(), label }, 'ArtworkRequested skipped (auto-artwork disabled)');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling ArtworkRequested');
    }
  }

  /** #10 PaymentProcessed → INSERT registration_events_v2 (type='payment') */
  async handlePaymentProcessed(event) {
    const eventType = 'PaymentProcessed_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tldNamehash, tldOwner, tldOwnerAmount, platformAmount, priceUsdCents] = event.args;

    try {
      // Attempt to find associated SLD via tldNamehash + same tx
      // PaymentProcessed is emitted alongside Registered in the same tx, but we don't
      // have the sldNamehash directly. Store with null sld_id; analytics can join on tx_hash.

      await query(`
        INSERT INTO registration_events_v2 (sld_id, event_type, tx_hash, flr_amount, usd_amount, tld_namehash, payer_address, timestamp)
        VALUES (NULL, 'payment', $1, $2, $3, $4, $5, NOW())
      `, [
        event.transactionHash,
        ethers.formatEther(tldOwnerAmount + platformAmount),
        Number(priceUsdCents) / 100,
        tldNamehash,
        tldOwner.toLowerCase(),
      ]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tldNamehash, tldOwner,
        tldOwnerAmount: ethers.formatEther(tldOwnerAmount),
        platformAmount: ethers.formatEther(platformAmount),
        priceUsdCents: priceUsdCents.toString(),
      });

      log.debug({
        tldOwner,
        tldOwnerFLR: ethers.formatEther(tldOwnerAmount),
        platformFLR: ethers.formatEther(platformAmount),
      }, 'PaymentProcessed processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling PaymentProcessed');
    }
  }

  // ============================================================
  // Event Handlers — Config changes
  // ============================================================

  /** #11 RegistrationEnabledUpdated → UPDATE tlds_v2.registration_enabled */
  async handleRegistrationEnabledUpdated(event) {
    const eventType = 'RegistrationEnabledUpdated_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, enabled] = event.args;

    try {
      await query(
        'UPDATE tlds_v2 SET registration_enabled = $1, updated_at = NOW() WHERE namehash = $2',
        [enabled, namehash]
      );

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, enabled,
      });

      log.debug({ namehash, enabled }, 'RegistrationEnabledUpdated processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling RegistrationEnabledUpdated');
    }
  }

  /** #12 RegistrationStrategyUpdated → UPDATE tlds_v2.strategy_address */
  async handleRegistrationStrategyUpdated(event) {
    const eventType = 'RegistrationStrategyUpdated_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [namehash, strategy] = event.args;

    try {
      await query(
        'UPDATE tlds_v2 SET strategy_address = $1, updated_at = NOW() WHERE namehash = $2',
        [strategy.toLowerCase(), namehash]
      );

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        namehash, strategy,
      });

      log.debug({ namehash, strategy }, 'RegistrationStrategyUpdated processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling RegistrationStrategyUpdated');
    }
  }

  /** #13 LengthPricesSet → Read chain → UPSERT tld_pricing_v2.length_prices */
  async handleLengthPricesSet(event) {
    const eventType = 'LengthPricesSet_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tldNamehash] = event.args;

    try {
      // Read current prices from chain
      const prices = await this.defaultStrategyContract.getLengthPrices(tldNamehash);
      const pricesArray = prices.map(p => Number(p));

      // Find tld_id
      const tldResult = await query('SELECT id FROM tlds_v2 WHERE namehash = $1', [tldNamehash]);
      if (tldResult.rows.length === 0) {
        log.warn({ tldNamehash }, 'LengthPricesSet for unknown TLD');
        return;
      }
      const tldId = tldResult.rows[0].id;

      await query(`
        INSERT INTO tld_pricing_v2 (tld_id, length_prices, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (tld_id) DO UPDATE SET
          length_prices = EXCLUDED.length_prices,
          updated_at = NOW()
      `, [tldId, pricesArray]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tldNamehash, prices: pricesArray,
      });

      log.debug({ tldNamehash, prices: pricesArray }, 'LengthPricesSet processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling LengthPricesSet');
    }
  }

  /** #14 PremiumNameSet → UPSERT premium_names_v2 */
  async handlePremiumNameSet(event) {
    const eventType = 'PremiumNameSet_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tldNamehash, label, priceUsdCents] = event.args;

    try {
      const tldResult = await query('SELECT id FROM tlds_v2 WHERE namehash = $1', [tldNamehash]);
      if (tldResult.rows.length === 0) {
        log.warn({ tldNamehash }, 'PremiumNameSet for unknown TLD');
        return;
      }
      const tldId = tldResult.rows[0].id;

      if (Number(priceUsdCents) === 0) {
        // Price of 0 means remove premium status
        await query(
          'DELETE FROM premium_names_v2 WHERE tld_id = $1 AND label = $2',
          [tldId, label]
        );
      } else {
        await query(`
          INSERT INTO premium_names_v2 (tld_id, label, price_usd_cents)
          VALUES ($1, $2, $3)
          ON CONFLICT (tld_id, label) DO UPDATE SET
            price_usd_cents = EXCLUDED.price_usd_cents
        `, [tldId, label, Number(priceUsdCents)]);
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tldNamehash, label, priceUsdCents: priceUsdCents.toString(),
      });

      log.debug({ label, priceUsdCents: priceUsdCents.toString() }, 'PremiumNameSet processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling PremiumNameSet');
    }
  }

  /** #15 ReservedNameSet → UPSERT reserved_names_v2 */
  async handleReservedNameSet(event) {
    const eventType = 'ReservedNameSet_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tldNamehash, label, wallet] = event.args;

    try {
      const tldResult = await query('SELECT id FROM tlds_v2 WHERE namehash = $1', [tldNamehash]);
      if (tldResult.rows.length === 0) {
        log.warn({ tldNamehash }, 'ReservedNameSet for unknown TLD');
        return;
      }
      const tldId = tldResult.rows[0].id;

      if (wallet === ethers.ZeroAddress) {
        // Zero address means unreserve
        await query(
          'DELETE FROM reserved_names_v2 WHERE tld_id = $1 AND label = $2',
          [tldId, label]
        );
      } else {
        await query(`
          INSERT INTO reserved_names_v2 (tld_id, label, reserved_for)
          VALUES ($1, $2, $3)
          ON CONFLICT (tld_id, label) DO UPDATE SET
            reserved_for = EXCLUDED.reserved_for
        `, [tldId, label, wallet.toLowerCase()]);
      }

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tldNamehash, label, wallet,
      });

      log.debug({ label, wallet }, 'ReservedNameSet processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling ReservedNameSet');
    }
  }

  /** #16 MultiYearDiscountsSet → Read chain → UPSERT tld_pricing_v2.multi_year_discounts */
  async handleMultiYearDiscountsSet(event) {
    const eventType = 'MultiYearDiscountsSet_v2';
    const logIndex = event.index ?? 0;

    if (await this.isAlreadyProcessed(event.transactionHash, logIndex, eventType)) return;

    const [tldNamehash] = event.args;

    try {
      const discounts = await this.defaultStrategyContract.getMultiYearDiscounts(tldNamehash);
      const discountsArray = discounts.map(d => Number(d));

      const tldResult = await query('SELECT id FROM tlds_v2 WHERE namehash = $1', [tldNamehash]);
      if (tldResult.rows.length === 0) {
        log.warn({ tldNamehash }, 'MultiYearDiscountsSet for unknown TLD');
        return;
      }
      const tldId = tldResult.rows[0].id;

      await query(`
        INSERT INTO tld_pricing_v2 (tld_id, multi_year_discounts, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (tld_id) DO UPDATE SET
          multi_year_discounts = EXCLUDED.multi_year_discounts,
          updated_at = NOW()
      `, [tldId, discountsArray]);

      await this.markProcessed(event.transactionHash, logIndex, eventType, event.blockNumber, {
        tldNamehash, discounts: discountsArray,
      });

      log.debug({ tldNamehash, discounts: discountsArray }, 'MultiYearDiscountsSet processed');
    } catch (error) {
      log.error({ err: error, txHash: event.transactionHash }, 'Error handling MultiYearDiscountsSet');
    }
  }
}

export default new StakingListenerService();
