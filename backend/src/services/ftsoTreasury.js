import { ethers } from 'ethers';
import { query } from '../db/index.js';
import config from '../config/index.js';
import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

const COMMUNITY_TREASURY_ABI = [
  'function commitSnapshot() external',
  'function executeSnapshot() external',
  'function takeSnapshot() external',
  'function claimFtsoRewards() external',
  'function finalizeEpoch(uint256 epochId, bytes32 merkleRoot, uint256 totalReward) external',
  'function currentEpochId() external view returns (uint256)',
  'function getEpoch(uint256 epochId) external view returns (uint256 snapshot1Block, uint256 snapshot2Block, bytes32 merkleRoot, uint256 totalReward, bool finalized)',
  'function snapshotCommitDelay() external view returns (uint256)',
  'event SnapshotCommitted(uint256 indexed epochId, uint256 snapshotIndex, uint256 targetBlock)',
  'event SnapshotExecuted(uint256 indexed epochId, uint256 snapshotIndex, uint256 blockNumber)',
  'event EpochFinalized(uint256 indexed epochId, bytes32 merkleRoot, uint256 totalReward)',
  'event FtsoRewardsClaimed(uint256 amount)',
];

const NFT_ABI = [
  'function totalSupply() external view returns (uint256)',
  'function tokenByIndex(uint256 index) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// Minimum hold duration in blocks before a domain counts for rewards
// ~3 days on Flare (1 block per ~1.8s)
const MIN_HOLD_BLOCKS = 144000;

// Default epoch duration: 1 week
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Max delay for pseudo-random snapshot timing: 3 days in seconds
const MAX_SNAPSHOT_DELAY = 3 * 24 * 60 * 60;

class FtsoTreasuryService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.treasuryContract = null;
    this.nftContract = null;
    this.running = false;
    this.intervals = [];
  }

  initialize() {
    const rpcUrl = config.flareRpcUrl || 'https://coston2-api.flare.network/ext/C/rpc';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    if (config.treasuryKeeperKey) {
      this.wallet = new ethers.Wallet(config.treasuryKeeperKey, this.provider);
    }

    if (config.communityTreasuryAddress) {
      this.treasuryContract = new ethers.Contract(
        config.communityTreasuryAddress,
        COMMUNITY_TREASURY_ABI,
        this.wallet || this.provider
      );
    }

    if (config.nftContractAddress) {
      this.nftContract = new ethers.Contract(
        config.nftContractAddress,
        NFT_ABI,
        this.provider
      );
    }

    console.log('[FtsoTreasury] Initialized',
      this.treasuryContract ? `treasury=${config.communityTreasuryAddress}` : 'no treasury configured'
    );
  }

  async start() {
    if (!this.treasuryContract || !this.wallet) {
      console.log('[FtsoTreasury] Not starting — missing treasury address or keeper key');
      return;
    }

    this.running = true;
    console.log('[FtsoTreasury] Starting keeper service');

    // Check every 30 minutes for snapshot/claim opportunities
    const interval = setInterval(() => this.tick(), 30 * 60 * 1000);
    this.intervals.push(interval);

    // Run immediately
    await this.tick();
  }

  stop() {
    this.running = false;
    this.intervals.forEach(i => clearInterval(i));
    this.intervals = [];
    console.log('[FtsoTreasury] Stopped');
  }

  async tick() {
    if (!this.running) return;

    try {
      await this.checkAndTakeSnapshot();
      await this.checkAndClaimRewards();
      await this.checkAndFinalize();
    } catch (error) {
      console.error('[FtsoTreasury] Tick error:', error.message);
    }
  }

  /**
   * Commit-reveal snapshot flow:
   * 1. commitSnapshot() — locks in a future block number
   * 2. Wait for that block to pass
   * 3. executeSnapshot() — records the snapshot at the committed block
   *
   * This prevents the keeper from knowing holder balances at snapshot time.
   */
  async checkAndTakeSnapshot() {
    try {
      const epochId = await this.treasuryContract.currentEpochId();
      const epoch = await this.treasuryContract.getEpoch(epochId);

      const snap1Taken = epoch.snapshot1Block > 0n;
      const snap2Taken = epoch.snapshot2Block > 0n;

      if (snap1Taken && snap2Taken) return;

      // Ensure DB record exists
      await query(
        `INSERT INTO ftso_reward_epochs (epoch_id, status) VALUES ($1, 'pending')
         ON CONFLICT (epoch_id) DO NOTHING`,
        [Number(epochId)]
      );

      // Try to execute any pending committed snapshot first
      try {
        const tx = await this.treasuryContract.executeSnapshot();
        const receipt = await tx.wait();
        console.log(`[FtsoTreasury] Snapshot executed for epoch ${epochId}, tx: ${receipt.hash}`);

        // Re-read epoch to get the snapshot block
        const updated = await this.treasuryContract.getEpoch(epochId);
        const snapshotCol = !snap1Taken ? 'snapshot1_block' : 'snapshot2_block';
        const blockNum = !snap1Taken ? updated.snapshot1Block : updated.snapshot2Block;
        await query(
          `UPDATE ftso_reward_epochs SET ${snapshotCol} = $1, status = 'snapshotting' WHERE epoch_id = $2`,
          [Number(blockNum), Number(epochId)]
        );
        return;
      } catch (e) {
        // No pending snapshot to execute, or target block not reached yet — that's fine
        if (!e.message?.includes('No pending snapshot') && !e.message?.includes('Target block not reached')) {
          // Log unexpected errors
          if (!e.message?.includes('revert')) console.error('[FtsoTreasury] Execute error:', e.message);
        }
      }

      // If no pending commit, create one
      try {
        console.log(`[FtsoTreasury] Committing snapshot for epoch ${epochId}`);
        const tx = await this.treasuryContract.commitSnapshot();
        const receipt = await tx.wait();
        console.log(`[FtsoTreasury] Snapshot committed, tx: ${receipt.hash}`);
      } catch (e) {
        if (e.message?.includes('No commit slot') || e.message?.includes('Too soon')) return;
        console.error('[FtsoTreasury] Commit error:', e.message);
      }
    } catch (error) {
      console.error('[FtsoTreasury] Snapshot error:', error.message);
    }
  }

  /**
   * Claim FTSO delegation rewards if available
   */
  async checkAndClaimRewards() {
    try {
      const tx = await this.treasuryContract.claimFtsoRewards();
      const receipt = await tx.wait();
      console.log(`[FtsoTreasury] FTSO rewards claimed, tx: ${receipt.hash}`);
    } catch (error) {
      if (error.message?.includes('No unclaimed rewards')) return;
      console.error('[FtsoTreasury] Claim rewards error:', error.message);
    }
  }

  /**
   * After both snapshots are taken, build Merkle tree and finalize epoch
   */
  async checkAndFinalize() {
    try {
      // Find epochs with both snapshots but not finalized
      const result = await query(
        `SELECT * FROM ftso_reward_epochs
         WHERE status = 'snapshotting'
         AND snapshot1_block IS NOT NULL
         AND snapshot2_block IS NOT NULL
         AND merkle_root IS NULL`
      );

      for (const epoch of result.rows) {
        await this.finalizeEpoch(epoch);
      }
    } catch (error) {
      console.error('[FtsoTreasury] Finalize check error:', error.message);
    }
  }

  /**
   * Build Merkle tree from holder balances at snapshot blocks, then finalize on-chain
   */
  async finalizeEpoch(epochRecord) {
    const { epoch_id, snapshot1_block, snapshot2_block } = epochRecord;
    console.log(`[FtsoTreasury] Finalizing epoch ${epoch_id}`);

    // Get holder balances at each snapshot
    const holders1 = await this.getHolderBalances(snapshot1_block);
    const holders2 = await this.getHolderBalances(snapshot2_block);

    // Average balances across both snapshots
    const allAddresses = new Set([...Object.keys(holders1), ...Object.keys(holders2)]);
    const avgBalances = {};

    for (const addr of allAddresses) {
      const bal1 = holders1[addr] || 0;
      const bal2 = holders2[addr] || 0;
      avgBalances[addr] = (bal1 + bal2) / 2;
    }

    // Calculate total weight
    const totalWeight = Object.values(avgBalances).reduce((sum, b) => sum + b, 0);
    if (totalWeight === 0) {
      console.log(`[FtsoTreasury] No holders in epoch ${epoch_id}, skipping`);
      return;
    }

    // Get treasury FLR balance available for distribution
    const treasuryBalance = await this.provider.getBalance(config.communityTreasuryAddress);
    if (treasuryBalance === 0n) {
      console.log(`[FtsoTreasury] No balance to distribute for epoch ${epoch_id}`);
      return;
    }

    const totalReward = treasuryBalance;

    // Calculate pro-rata amounts and build Merkle leaves
    const leaves = [];
    const claimData = [];

    for (const [addr, weight] of Object.entries(avgBalances)) {
      if (weight <= 0) continue;

      const share = (totalReward * BigInt(Math.floor(weight * 1e6))) / BigInt(Math.floor(totalWeight * 1e6));
      if (share === 0n) continue;

      const leaf = ethers.solidityPackedKeccak256(
        ['address', 'uint256'],
        [addr, share]
      );
      leaves.push(leaf);
      claimData.push({ address: addr, amount: share.toString(), leaf });
    }

    if (leaves.length === 0) {
      console.log(`[FtsoTreasury] No valid claims for epoch ${epoch_id}`);
      return;
    }

    // Build Merkle tree
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const merkleRoot = tree.getHexRoot();

    // Finalize on-chain
    const tx = await this.treasuryContract.finalizeEpoch(
      epoch_id,
      merkleRoot,
      totalReward
    );
    const receipt = await tx.wait();
    console.log(`[FtsoTreasury] Epoch ${epoch_id} finalized on-chain, tx: ${receipt.hash}`);

    // Store Merkle proofs in DB
    for (const claim of claimData) {
      const proof = tree.getHexProof(claim.leaf);
      await query(
        `INSERT INTO ftso_reward_claims (epoch_id, wallet_address, amount, merkle_proof)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (epoch_id, wallet_address) DO UPDATE SET amount = $3, merkle_proof = $4`,
        [epoch_id, claim.address.toLowerCase(), ethers.formatEther(claim.amount), JSON.stringify(proof)]
      );
    }

    // Update epoch record
    await query(
      `UPDATE ftso_reward_epochs
       SET merkle_root = $1, total_reward = $2, total_holders = $3,
           status = 'finalized', finalized_at = NOW()
       WHERE epoch_id = $4`,
      [merkleRoot, ethers.formatEther(totalReward), claimData.length, epoch_id]
    );

    console.log(`[FtsoTreasury] Epoch ${epoch_id} complete: ${claimData.length} holders, ${ethers.formatEther(totalReward)} FLR`);
  }

  /**
   * Get domain holder balances at a specific block number,
   * filtering out domains acquired less than MIN_HOLD_BLOCKS before the snapshot.
   *
   * This prevents gaming by buying domains right before a snapshot.
   */
  async getHolderBalances(blockNumber) {
    const balances = {};
    const cutoffBlock = Number(blockNumber) - MIN_HOLD_BLOCKS;

    try {
      const totalSupply = await this.nftContract.totalSupply({ blockTag: Number(blockNumber) });

      for (let i = 0; i < totalSupply; i++) {
        try {
          const tokenId = await this.nftContract.tokenByIndex(i, { blockTag: Number(blockNumber) });
          const owner = await this.nftContract.ownerOf(tokenId, { blockTag: Number(blockNumber) });
          const addr = owner.toLowerCase();

          // Check if this wallet held this token before the cutoff block
          // by verifying ownership at the cutoff block
          let heldLongEnough = true;
          if (cutoffBlock > 0) {
            try {
              const ownerAtCutoff = await this.nftContract.ownerOf(tokenId, { blockTag: cutoffBlock });
              // Only count if same owner held it at cutoff
              heldLongEnough = ownerAtCutoff.toLowerCase() === addr;
            } catch {
              // Token didn't exist at cutoff — newly minted, doesn't qualify
              heldLongEnough = false;
            }
          }

          if (heldLongEnough) {
            balances[addr] = (balances[addr] || 0) + 1;
          }
        } catch {
          // Token may not exist at that block
        }
      }
    } catch (error) {
      console.error(`[FtsoTreasury] Error reading holders at block ${blockNumber}:`, error.message);
    }

    return balances;
  }
}

const ftsoTreasuryService = new FtsoTreasuryService();
export default ftsoTreasuryService;
