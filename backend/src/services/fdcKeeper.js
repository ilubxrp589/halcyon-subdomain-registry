import { ethers } from 'ethers';
import config from '../config/index.js';
import { query } from '../db/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.fdcKeeper || loggers.app;

// FDC protocol ID for data availability proofs
const FDC_PROTOCOL_ID = 200;

// Relay ABI — minimal, just isFinalized
const RELAY_ABI = [
  'function isFinalized(uint256 _protocolId, uint256 _votingRoundId) external view returns (bool)',
];

// TldClaimManager ABI — for completeStake (matches IWeb2Json.Proof struct)
const CLAIM_MANAGER_ABI = [
  'function completeStake(string tldLabel, tuple(bytes32[] merkleProof, tuple(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, tuple(string url, string httpMethod, string headers, string queryParams, string body, string postProcessJq, string abiSignature) requestBody, tuple(bytes abiEncodedData) responseBody) data) proof) external',
];

// ABI type string for decoding the DA Layer response_hex into IWeb2Json.Response
const RESPONSE_ABI_TYPE = [
  'tuple(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, tuple(string url, string httpMethod, string headers, string queryParams, string body, string postProcessJq, string abiSignature) requestBody, tuple(bytes abiEncodedData) responseBody)',
];

// Relay contract address on Coston2 (resolved from FlareContractRegistry)
const RELAY_ADDRESS = '0x97702e350CaEda540935d92aAf213307e9069784';

// Flare system contracts for voting round calculation
const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';
const FLARE_CONTRACT_REGISTRY_ABI = [
  'function getContractAddressByName(string _name) external view returns (address)',
];
const FLARE_SYSTEMS_MANAGER_ABI = [
  'function firstVotingRoundStartTs() external view returns (uint256)',
  'function votingEpochDurationSeconds() external view returns (uint256)',
];

class FdcKeeperService {
  constructor() {
    this.isRunning = false;
    this.provider = null;
    this.wallet = null;
    this.claimManager = null;
    this.relay = null;
    this.pollingInterval = null;
    this.pollIntervalMs = config.fdcKeeper?.pollIntervalMs || 30000;
    this.firstVotingRoundStartTs = null;
    this.votingEpochDurationSeconds = null;
  }

  async initialize() {
    try {
      if (!config.fdcKeeper?.enabled) {
        log.info('FDC Keeper Bot disabled (FDC_KEEPER_ENABLED != true)');
        return { success: false, error: 'disabled' };
      }

      if (!config.fdcKeeper.privateKey) {
        log.warn('FDC Keeper Bot: KEEPER_PRIVATE_KEY not configured');
        return { success: false, error: 'no private key' };
      }

      if (!config.contractsV2.tldClaimManager) {
        log.warn('FDC Keeper Bot: CONTRACT_V2_TLD_CLAIM_MANAGER not configured');
        return { success: false, error: 'no claim manager address' };
      }

      this.provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      this.wallet = new ethers.Wallet(config.fdcKeeper.privateKey, this.provider);

      this.claimManager = new ethers.Contract(
        config.contractsV2.tldClaimManager,
        CLAIM_MANAGER_ABI,
        this.wallet
      );

      this.relay = new ethers.Contract(RELAY_ADDRESS, RELAY_ABI, this.provider);

      // Fetch FDC voting round parameters for round ID computation
      try {
        const registry = new ethers.Contract(FLARE_CONTRACT_REGISTRY, FLARE_CONTRACT_REGISTRY_ABI, this.provider);
        const fsmAddress = await registry.getContractAddressByName('FlareSystemsManager');
        const fsm = new ethers.Contract(fsmAddress, FLARE_SYSTEMS_MANAGER_ABI, this.provider);
        this.firstVotingRoundStartTs = Number(await fsm.firstVotingRoundStartTs());
        this.votingEpochDurationSeconds = Number(await fsm.votingEpochDurationSeconds());
      } catch (fsmErr) {
        log.warn({ err: fsmErr }, 'Could not load FDC voting round params — round ID backfill unavailable');
      }

      const balance = await this.provider.getBalance(this.wallet.address);
      log.info({
        keeperAddress: this.wallet.address,
        balance: ethers.formatEther(balance) + ' FLR',
        claimManager: config.contractsV2.tldClaimManager,
        daLayerUrl: config.fdcKeeper.daLayerUrl,
        pollInterval: this.pollIntervalMs + 'ms',
      }, 'FDC Keeper Bot initialized');

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'FDC Keeper Bot init error');
      return { success: false, error: error.message };
    }
  }

  async start() {
    if (this.isRunning) {
      log.info('FDC Keeper Bot already running');
      return;
    }

    this.isRunning = true;
    this.pollingInterval = setInterval(() => this.poll(), this.pollIntervalMs);
    log.info('FDC Keeper Bot started');

    // Immediate first poll
    this.poll();
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
    log.info('FDC Keeper Bot stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      keeperAddress: this.wallet?.address || null,
      claimManager: config.contractsV2.tldClaimManager || null,
      daLayerUrl: config.fdcKeeper?.daLayerUrl || null,
      pollIntervalMs: this.pollIntervalMs,
    };
  }

  // ============================================================
  // Polling loop
  // ============================================================

  async poll() {
    if (!this.isRunning) return;

    try {
      const result = await query(
        "SELECT * FROM pending_claims WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10"
      );

      if (result.rows.length === 0) return;

      log.debug({ count: result.rows.length }, 'Processing pending FDC claims');

      for (const claim of result.rows) {
        try {
          await this.processClaim(claim);
        } catch (err) {
          await this.recordError(claim.id, err.message);
          log.error({ err, tldLabel: claim.tld_label, claimId: claim.id }, 'Error processing claim');
        }
      }
    } catch (err) {
      log.error({ err }, 'FDC Keeper polling error');
    }
  }

  async processClaim(claim) {
    // If round ID is missing, try to compute it from the claim's created_at timestamp
    if (!claim.fdc_round_id) {
      const roundId = await this.computeRoundId(claim);
      if (!roundId) {
        log.debug({ tldLabel: claim.tld_label }, 'Claim has no fdc_round_id and could not compute one, skipping');
        return;
      }
      // Store the computed round ID for future polls
      await query('UPDATE pending_claims SET fdc_round_id = $1 WHERE id = $2', [roundId, claim.id]);
      claim.fdc_round_id = roundId;
      log.info({ tldLabel: claim.tld_label, roundId }, 'Computed and stored missing fdc_round_id');
    }

    // Step 1: Check if the FDC voting round has finalized
    const isFinalized = await this.relay.isFinalized(FDC_PROTOCOL_ID, claim.fdc_round_id);
    if (!isFinalized) {
      log.debug({ tldLabel: claim.tld_label, roundId: claim.fdc_round_id }, 'Voting round not yet finalized');
      return;
    }

    log.info({ tldLabel: claim.tld_label, roundId: claim.fdc_round_id }, 'Voting round finalized — retrieving proof');

    // Step 2: Retrieve proof from DA Layer
    const proof = await this.retrieveProof(claim.fdc_round_id, claim.attestation_request_bytes);
    if (!proof) {
      await this.recordError(claim.id, 'Could not retrieve proof from DA Layer');
      return;
    }

    // Step 3: Submit completeStake
    log.info({ tldLabel: claim.tld_label }, 'Submitting completeStake transaction');

    const tx = await this.claimManager.completeStake(claim.tld_label, proof, {
      gasLimit: 500_000,
    });

    log.info({ tldLabel: claim.tld_label, txHash: tx.hash }, 'completeStake tx submitted');

    const receipt = await tx.wait(1);

    if (receipt.status === 1) {
      await query(
        "UPDATE pending_claims SET status = 'completed', tx_hash = $1, completed_at = NOW() WHERE id = $2",
        [tx.hash, claim.id]
      );
      log.info({ tldLabel: claim.tld_label, txHash: tx.hash }, 'completeStake succeeded — TLD NFT minted');
    } else {
      await this.recordError(claim.id, `Transaction reverted: ${tx.hash}`);
    }
  }

  // ============================================================
  // Voting round ID computation (fallback for missing fdc_round_id)
  // ============================================================

  async computeRoundId(claim) {
    if (!this.firstVotingRoundStartTs || !this.votingEpochDurationSeconds) {
      return null;
    }

    // Use the claim's created_at timestamp (approximate block time of the StakeRequested tx)
    const claimTimestamp = Math.floor(new Date(claim.created_at).getTime() / 1000);
    const roundId = Math.floor(
      (claimTimestamp - this.firstVotingRoundStartTs) / this.votingEpochDurationSeconds
    );

    if (roundId < 0) {
      log.warn({ tldLabel: claim.tld_label, claimTimestamp }, 'Computed negative round ID — claim timestamp before FDC epoch');
      return null;
    }

    return roundId;
  }

  // ============================================================
  // DA Layer proof retrieval
  // ============================================================

  async retrieveProof(roundId, requestBytes) {
    const daUrl = config.fdcKeeper.daLayerUrl;

    try {
      const response = await fetch(`${daUrl}/api/v1/fdc/proof-by-request-round-raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          votingRoundId: roundId,
          requestBytes: requestBytes,
        }),
      });

      if (!response.ok) {
        log.warn({ status: response.status, roundId }, 'DA Layer returned non-OK response');
        return null;
      }

      const data = await response.json();

      if (!data || data.status === 'ABSENT') {
        log.warn({ roundId }, 'Proof not available from DA Layer');
        return null;
      }

      // DA Layer returns { proof: bytes32[], response_hex: "0x..." }
      // proof = Merkle proof array
      // response_hex = ABI-encoded IWeb2Json.Response struct
      if (!data.proof || !data.response_hex) {
        log.warn({ roundId, keys: Object.keys(data) }, 'DA Layer response missing proof or response_hex');
        return null;
      }

      // Decode the ABI-encoded Response struct from response_hex
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const [decodedResponse] = abiCoder.decode(RESPONSE_ABI_TYPE, data.response_hex);

      // Construct the IWeb2Json.Proof struct expected by completeStake
      const proofStruct = {
        merkleProof: data.proof,
        data: {
          attestationType: decodedResponse.attestationType,
          sourceId: decodedResponse.sourceId,
          votingRound: decodedResponse.votingRound,
          lowestUsedTimestamp: decodedResponse.lowestUsedTimestamp,
          requestBody: {
            url: decodedResponse.requestBody.url,
            httpMethod: decodedResponse.requestBody.httpMethod,
            headers: decodedResponse.requestBody.headers,
            queryParams: decodedResponse.requestBody.queryParams,
            body: decodedResponse.requestBody.body,
            postProcessJq: decodedResponse.requestBody.postProcessJq,
            abiSignature: decodedResponse.requestBody.abiSignature,
          },
          responseBody: {
            abiEncodedData: decodedResponse.responseBody.abiEncodedData,
          },
        },
      };

      log.info({ roundId, merkleProofLen: data.proof.length }, 'Proof decoded successfully from DA Layer');
      return proofStruct;
    } catch (err) {
      log.error({ err, roundId }, 'Failed to retrieve proof from DA Layer');
      return null;
    }
  }

  // ============================================================
  // Error tracking
  // ============================================================

  async recordError(claimId, errorMessage) {
    try {
      const result = await query(
        "UPDATE pending_claims SET attempts = attempts + 1, last_error = $1 WHERE id = $2 RETURNING attempts",
        [errorMessage, claimId]
      );

      const attempts = result.rows[0]?.attempts || 0;

      // After 20 failed attempts, mark as failed to avoid infinite retries
      if (attempts >= 20) {
        await query(
          "UPDATE pending_claims SET status = 'failed' WHERE id = $1",
          [claimId]
        );
        log.warn({ claimId, attempts }, 'Claim marked as failed after max attempts');
      }
    } catch (err) {
      log.error({ err, claimId }, 'Failed to record error for claim');
    }
  }

  // ============================================================
  // Admin helpers
  // ============================================================

  async getPendingClaims() {
    const result = await query(
      "SELECT id, tld_label, claimer_address, namehash, status, fdc_round_id, attempts, last_error, created_at FROM pending_claims WHERE status IN ('pending', 'failed') ORDER BY created_at DESC LIMIT 50"
    );
    return result.rows;
  }

  async retryClaim(namehash) {
    const result = await query(
      "UPDATE pending_claims SET status = 'pending', attempts = 0, last_error = NULL WHERE namehash = $1 AND status = 'failed' RETURNING tld_label",
      [namehash]
    );
    if (result.rows.length === 0) {
      return { success: false, error: 'No failed claim found with that namehash' };
    }
    log.info({ tldLabel: result.rows[0].tld_label, namehash }, 'Claim reset for retry');
    return { success: true, tldLabel: result.rows[0].tld_label };
  }
}

export default new FdcKeeperService();
