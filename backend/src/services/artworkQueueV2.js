import crypto from 'crypto';
import { ethers } from 'ethers';
import { query } from '../db/index.js';
import config from '../config/index.js';
import sdxlMultiGPUService from './sdxlMultiGPU.js';
import nftStorageService from './nftStorage.js';
import { loggers } from '../utils/logger.js';

const log = loggers.nft;

/**
 * ArtworkQueueV2 — processes pending artwork jobs from sld_artwork_v2.
 *
 * Flow:
 *   stakingListener inserts sld_artwork_v2 row (status='pending')
 *   → this service polls for pending rows
 *   → generates image via ComfyUI (sdxlMultiGPU)
 *   → uploads to IPFS (nftStorage)
 *   → calls HsrSld.setArtwork(tokenId, ipfsCid) on-chain
 *   → updates DB row to status='complete'
 */

const HSR_SLD_ABI = [
  'function setArtwork(uint256 tokenId, string calldata ipfsHash) external',
];

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 5000; // 5s, 25s, 125s

// Theme selection based on TLD namehash for deterministic theming
const THEME_IDS = [
  'cosmic', 'neon', 'nature', 'abstract', 'fractal',
  'fantasy', 'space', 'business', 'anime', 'exotic', 'crypto',
];

class ArtworkQueueV2 {
  constructor() {
    this.isRunning = false;
    this.pollingInterval = null;
    this.provider = null;
    this.wallet = null;
    this.hsrSldContract = null;
    this.processing = new Set(); // Track in-flight token IDs to avoid duplicates
  }

  async initialize() {
    try {
      if (!config.contractsV2?.hsrSld) {
        return { success: false, error: 'CONTRACT_V2_HSR_SLD not configured' };
      }

      // Artwork queue needs a wallet to call setArtwork on-chain
      const privateKey = config.flare.privateKey;
      if (!privateKey) {
        return { success: false, error: 'BACKEND_PRIVATE_KEY not configured (needed for setArtwork tx)' };
      }

      this.provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.hsrSldContract = new ethers.Contract(
        config.contractsV2.hsrSld,
        HSR_SLD_ABI,
        this.wallet,
      );

      log.info({ contract: config.contractsV2.hsrSld }, 'ArtworkQueueV2 initialized');
      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'ArtworkQueueV2 initialization failed');
      return { success: false, error: error.message };
    }
  }

  start(intervalMs = 15000) {
    if (this.isRunning) return;
    this.isRunning = true;
    log.info({ intervalMs }, 'ArtworkQueueV2 started');
    this.pollingInterval = setInterval(() => this.processQueue(), intervalMs);
    // Run immediately on start
    this.processQueue();
  }

  stop() {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    log.info('ArtworkQueueV2 stopped');
  }

  getStatus() {
    return {
      running: this.isRunning,
      processing: this.processing.size,
      contract: config.contractsV2?.hsrSld || null,
    };
  }

  /**
   * Poll for pending artwork jobs and process them.
   */
  async processQueue() {
    if (!this.isRunning) return;

    try {
      const result = await query(`
        SELECT id, sld_id, token_id, tld_namehash, label, attempts
        FROM sld_artwork_v2
        WHERE status = 'pending' AND attempts < $1
        ORDER BY created_at ASC
        LIMIT 5
      `, [MAX_ATTEMPTS]);

      if (result.rows.length === 0) return;

      log.info({ count: result.rows.length }, 'Processing pending artwork jobs');

      for (const job of result.rows) {
        if (this.processing.has(job.token_id)) continue;
        this.processing.add(job.token_id);

        try {
          await this.processJob(job);
        } finally {
          this.processing.delete(job.token_id);
        }
      }
    } catch (error) {
      log.error({ err: error }, 'ArtworkQueueV2 processQueue error');
    }
  }

  /**
   * Process a single artwork job: generate → upload → set on-chain → update DB.
   */
  async processJob(job) {
    const { id, token_id, tld_namehash, label } = job;
    const startTime = Date.now();

    try {
      // Look up the TLD label from slds_v2 for the full domain name
      const sldResult = await query(`
        SELECT sv.full_name, tv.label AS tld_label
        FROM slds_v2 sv
        LEFT JOIN tlds_v2 tv ON tv.namehash = $1
        WHERE sv.token_id = $2
        LIMIT 1
      `, [tld_namehash, token_id]);

      const fullName = sldResult.rows[0]?.full_name || `${label}.unknown`;
      const tldLabel = sldResult.rows[0]?.tld_label || 'unknown';

      // Deterministic seed from full domain name
      const seed = this._calculateSeed(fullName);

      // Select theme deterministically from TLD namehash
      const themeId = this._selectTheme(tld_namehash);

      log.info({ tokenId: token_id, domain: fullName, themeId, seed }, 'Generating artwork');

      // Update status to show we're working on it
      await query(`
        UPDATE sld_artwork_v2
        SET attempts = attempts + 1, prompt = $1, seed = $2
        WHERE id = $3
      `, [`theme:${themeId} domain:${fullName}`, seed, id]);

      // Generate image via ComfyUI
      const genResult = await sdxlMultiGPUService.generateSingle({
        domain: fullName,
        themeId,
        seed,
      });

      if (!genResult.success || !genResult.imageBuffer) {
        throw new Error(genResult.error || 'Image generation failed — no buffer returned');
      }

      const gpuWorker = genResult.gpu || 'unknown';

      // Upload to IPFS
      const imageName = `${fullName.replace('.', '-')}-${token_id}.png`;
      const metadata = {
        name: fullName,
        description: `Handshake subdomain registered on Halcyon Subdomain Registry, powered by Flare Network.`,
        image: '', // Will be set after image upload
        attributes: [
          { trait_type: 'TLD', value: tldLabel },
          { trait_type: 'Label', value: label },
          { trait_type: 'Length', value: label.length, display_type: 'number' },
          { trait_type: 'Art Theme', value: themeId },
          { trait_type: 'Art Source', value: 'AI Generated' },
        ],
      };

      const uploadResult = await nftStorageService.uploadNFT(
        genResult.imageBuffer,
        metadata,
        imageName,
      );

      if (!uploadResult.success) {
        throw new Error(`IPFS upload failed: ${uploadResult.error || 'unknown'}`);
      }

      const ipfsCid = uploadResult.imageCID;
      log.info({ tokenId: token_id, ipfsCid, metadataCID: uploadResult.metadataCID }, 'Artwork uploaded to IPFS');

      // Set artwork on-chain via HsrSld.setArtwork(tokenId, ipfsHash)
      const tx = await this.hsrSldContract.setArtwork(token_id, ipfsCid);
      const receipt = await tx.wait(1);

      const generationTimeMs = Date.now() - startTime;

      // Update DB to complete
      await query(`
        UPDATE sld_artwork_v2
        SET status = 'completed',
            ipfs_cid = $1,
            gpu_worker = $2,
            generation_time_ms = $3,
            completed_at = NOW()
        WHERE id = $4
      `, [ipfsCid, gpuWorker, generationTimeMs, id]);

      log.info({
        tokenId: token_id,
        domain: fullName,
        ipfsCid,
        txHash: receipt.hash,
        timeMs: generationTimeMs,
      }, 'Artwork completed');

    } catch (error) {
      const generationTimeMs = Date.now() - startTime;
      log.error({ err: error, tokenId: token_id, jobId: id, timeMs: generationTimeMs }, 'Artwork job failed');

      // Check if max attempts reached
      const updated = await query(`
        UPDATE sld_artwork_v2
        SET last_error = $1,
            generation_time_ms = $2
        WHERE id = $3
        RETURNING attempts
      `, [error.message?.substring(0, 500), generationTimeMs, id]);

      const attempts = updated.rows[0]?.attempts || 0;
      if (attempts >= MAX_ATTEMPTS) {
        await query(`UPDATE sld_artwork_v2 SET status = 'failed' WHERE id = $1`, [id]);
        log.warn({ tokenId: token_id, attempts }, 'Artwork job failed permanently');
      } else {
        // Exponential backoff: delay the next attempt by updating created_at forward
        const backoffMs = BACKOFF_BASE_MS * Math.pow(5, attempts - 1);
        log.info({ tokenId: token_id, attempts, nextRetryMs: backoffMs }, 'Artwork job will retry');
      }
    }
  }

  /**
   * Deterministic seed from full domain name (matches stableDiffusion.js calculateSeed)
   */
  _calculateSeed(fullName) {
    const hash = crypto.createHash('sha256').update(fullName.toLowerCase()).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Select a theme deterministically based on TLD namehash.
   * All domains under the same TLD get the same theme family.
   */
  _selectTheme(tldNamehash) {
    if (!tldNamehash) return THEME_IDS[0];
    // Use last 2 hex chars of namehash as index
    const hex = tldNamehash.replace('0x', '').slice(-2);
    const idx = parseInt(hex, 16) % THEME_IDS.length;
    return THEME_IDS[idx];
  }

  /**
   * Manually retry a failed artwork job (admin action).
   */
  async retryJob(artworkId) {
    const result = await query(`
      UPDATE sld_artwork_v2
      SET status = 'pending', attempts = 0, last_error = NULL
      WHERE id = $1 AND status = 'failed'
      RETURNING id, token_id
    `, [artworkId]);

    if (result.rows.length === 0) {
      return { success: false, error: 'Job not found or not in failed state' };
    }

    return { success: true, job: result.rows[0] };
  }

  /**
   * Get queue stats for admin dashboard.
   */
  async getQueueStats() {
    const result = await query(`
      SELECT status, COUNT(*) as count
      FROM sld_artwork_v2
      GROUP BY status
    `);

    const stats = { pending: 0, complete: 0, failed: 0 };
    for (const row of result.rows) {
      stats[row.status] = parseInt(row.count);
    }

    return {
      ...stats,
      processing: this.processing.size,
      running: this.isRunning,
    };
  }
}

export const artworkQueueV2 = new ArtworkQueueV2();
export default artworkQueueV2;
