/**
 * IPFS Storage Service (Multi-Provider)
 * Handles uploading images and metadata to IPFS via Pinata (primary) and NFT.storage (backup)
 * Supports backup pinning, metadata updates, and pinning status monitoring
 */

import { PinataSDK } from 'pinata-web3';
import { NFTStorage, File as NFTFile, Blob as NFTBlob } from 'nft.storage';
import { config } from '../config/index.js';
import { query } from '../db/index.js';

// =============================================================
//                     CONFIGURATION
// =============================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Gateway URLs for different providers
const GATEWAYS = {
  pinata: 'https://gateway.pinata.cloud/ipfs',
  nftStorage: 'https://nftstorage.link/ipfs',
  ipfsIo: 'https://ipfs.io/ipfs',
  cloudflare: 'https://cloudflare-ipfs.com/ipfs',
  dweb: 'https://dweb.link/ipfs',
};

// Default gateway
const DEFAULT_GATEWAY = GATEWAYS.pinata;

// =============================================================
//                     SERVICE CLASS
// =============================================================

class IPFSStorageService {
  constructor() {
    this.pinataClient = null;
    this.nftStorageClient = null;
    this.pinataReady = false;
    this.nftStorageReady = false;
  }

  /**
   * Initialize the IPFS clients
   */
  initialize() {
    // Initialize Pinata (primary)
    const pinataJwt = config.pinata?.jwt || process.env.PINATA_JWT;
    if (pinataJwt && !this.pinataReady) {
      try {
        this.pinataClient = new PinataSDK({ pinataJwt });
        this.pinataReady = true;
        console.log('[IPFS] Pinata service initialized (primary)');
      } catch (error) {
        console.warn('[IPFS] Pinata initialization failed:', error.message);
      }
    }

    // NFT.storage API has been sunset - disabled
    // Using Pinata as sole provider

    if (!this.pinataReady && !this.nftStorageReady) {
      console.warn('[IPFS] No IPFS providers configured. Upload functionality will be disabled.');
    }
  }

  /**
   * Check if at least one service is ready
   */
  isReady() {
    return this.pinataReady || this.nftStorageReady;
  }

  /**
   * Get status of all providers
   */
  getProviderStatus() {
    return {
      pinata: this.pinataReady,
      nftStorage: this.nftStorageReady,
      anyReady: this.isReady(),
    };
  }

  /**
   * Sleep for a given number of milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =============================================================
  //                     PINATA METHODS
  // =============================================================

  /**
   * Upload image to Pinata
   */
  async uploadImageToPinata(imageBuffer, filename = 'nft-image.png') {
    if (!this.pinataReady) {
      return { success: false, error: 'Pinata not configured' };
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const file = new File([imageBuffer], filename, { type: 'image/png' });
        const result = await this.pinataClient.upload.file(file);
        const cid = result.IpfsHash;

        return {
          success: true,
          cid,
          provider: 'pinata',
          url: `${GATEWAYS.pinata}/${cid}`,
          ipfsUrl: `ipfs://${cid}`,
        };
      } catch (error) {
        lastError = error;
        console.error(`[Pinata] Upload attempt ${attempt} failed:`, error.message);
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    return { success: false, error: lastError?.message };
  }

  /**
   * Upload metadata to Pinata
   */
  async uploadMetadataToPinata(metadata, filename = 'metadata.json') {
    if (!this.pinataReady) {
      return { success: false, error: 'Pinata not configured' };
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.pinataClient.upload.json(metadata);
        const cid = result.IpfsHash;

        return {
          success: true,
          cid,
          provider: 'pinata',
          url: `${GATEWAYS.pinata}/${cid}`,
          ipfsUrl: `ipfs://${cid}`,
        };
      } catch (error) {
        lastError = error;
        console.error(`[Pinata] Metadata upload attempt ${attempt} failed:`, error.message);
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    return { success: false, error: lastError?.message };
  }

  // =============================================================
  //                     NFT.STORAGE METHODS
  // =============================================================

  /**
   * Upload image to NFT.storage
   */
  async uploadImageToNFTStorage(imageBuffer, filename = 'nft-image.png') {
    if (!this.nftStorageReady) {
      return { success: false, error: 'NFT.storage not configured' };
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const blob = new NFTBlob([imageBuffer], { type: 'image/png' });
        const cid = await this.nftStorageClient.storeBlob(blob);

        return {
          success: true,
          cid: cid.toString(),
          provider: 'nftStorage',
          url: `${GATEWAYS.nftStorage}/${cid}`,
          ipfsUrl: `ipfs://${cid}`,
        };
      } catch (error) {
        lastError = error;
        console.error(`[NFT.storage] Upload attempt ${attempt} failed:`, error.message);
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    return { success: false, error: lastError?.message };
  }

  /**
   * Upload metadata to NFT.storage
   */
  async uploadMetadataToNFTStorage(metadata) {
    if (!this.nftStorageReady) {
      return { success: false, error: 'NFT.storage not configured' };
    }

    let lastError;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const metadataBlob = new NFTBlob([JSON.stringify(metadata)], { type: 'application/json' });
        const cid = await this.nftStorageClient.storeBlob(metadataBlob);

        return {
          success: true,
          cid: cid.toString(),
          provider: 'nftStorage',
          url: `${GATEWAYS.nftStorage}/${cid}`,
          ipfsUrl: `ipfs://${cid}`,
        };
      } catch (error) {
        lastError = error;
        console.error(`[NFT.storage] Metadata upload attempt ${attempt} failed:`, error.message);
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
        }
      }
    }

    return { success: false, error: lastError?.message };
  }

  // =============================================================
  //                     MULTI-PROVIDER UPLOAD
  // =============================================================

  /**
   * Upload an image to IPFS with backup pinning
   * Tries Pinata first, then NFT.storage as backup
   * Optionally pins to both services for redundancy
   * @param {Buffer} imageBuffer - PNG image buffer
   * @param {string} filename - Filename for the image
   * @param {Object} options - Upload options
   * @param {boolean} options.backupPin - Also pin to backup service (default: true)
   * @returns {Promise<{success: boolean, cid?: string, providers: string[], url?: string, error?: string}>}
   */
  async uploadImage(imageBuffer, filename = 'nft-image.png', options = {}) {
    this.initialize();

    if (!this.isReady()) {
      return { success: false, error: 'No IPFS providers configured', providers: [] };
    }

    const { backupPin = true } = options;
    const providers = [];
    let primaryResult = null;

    // Try Pinata first (primary)
    if (this.pinataReady) {
      console.log('[IPFS] Uploading image to Pinata (primary)...');
      primaryResult = await this.uploadImageToPinata(imageBuffer, filename);
      if (primaryResult.success) {
        providers.push('pinata');
        console.log(`[IPFS] Image uploaded to Pinata. CID: ${primaryResult.cid}`);
      }
    }

    // If primary failed, try backup
    if (!primaryResult?.success && this.nftStorageReady) {
      console.log('[IPFS] Primary failed, trying NFT.storage (backup)...');
      primaryResult = await this.uploadImageToNFTStorage(imageBuffer, filename);
      if (primaryResult.success) {
        providers.push('nftStorage');
        console.log(`[IPFS] Image uploaded to NFT.storage. CID: ${primaryResult.cid}`);
      }
    }

    if (!primaryResult?.success) {
      return {
        success: false,
        error: 'All IPFS providers failed',
        providers: [],
      };
    }

    // Backup pin to secondary service for redundancy
    if (backupPin && primaryResult.success) {
      const backupProvider = primaryResult.provider === 'pinata' ? 'nftStorage' : 'pinata';

      if (backupProvider === 'nftStorage' && this.nftStorageReady) {
        console.log('[IPFS] Backup pinning to NFT.storage...');
        const backupResult = await this.uploadImageToNFTStorage(imageBuffer, filename);
        if (backupResult.success) {
          providers.push('nftStorage');
          console.log('[IPFS] Backup pin to NFT.storage successful');
        }
      } else if (backupProvider === 'pinata' && this.pinataReady) {
        console.log('[IPFS] Backup pinning to Pinata...');
        const backupResult = await this.uploadImageToPinata(imageBuffer, filename);
        if (backupResult.success) {
          providers.push('pinata');
          console.log('[IPFS] Backup pin to Pinata successful');
        }
      }
    }

    return {
      success: true,
      cid: primaryResult.cid,
      providers,
      url: primaryResult.url,
      ipfsUrl: primaryResult.ipfsUrl,
    };
  }

  /**
   * Upload metadata JSON to IPFS with backup pinning
   * @param {Object} metadata - Metadata object
   * @param {string} filename - Filename for the metadata
   * @param {Object} options - Upload options
   * @param {boolean} options.backupPin - Also pin to backup service (default: true)
   * @returns {Promise<{success: boolean, cid?: string, providers: string[], url?: string, error?: string}>}
   */
  async uploadMetadata(metadata, filename = 'metadata.json', options = {}) {
    this.initialize();

    if (!this.isReady()) {
      return { success: false, error: 'No IPFS providers configured', providers: [] };
    }

    const { backupPin = true } = options;
    const providers = [];
    let primaryResult = null;

    // Try Pinata first (primary)
    if (this.pinataReady) {
      console.log('[IPFS] Uploading metadata to Pinata (primary)...');
      primaryResult = await this.uploadMetadataToPinata(metadata, filename);
      if (primaryResult.success) {
        providers.push('pinata');
        console.log(`[IPFS] Metadata uploaded to Pinata. CID: ${primaryResult.cid}`);
      }
    }

    // If primary failed, try backup
    if (!primaryResult?.success && this.nftStorageReady) {
      console.log('[IPFS] Primary failed, trying NFT.storage (backup)...');
      primaryResult = await this.uploadMetadataToNFTStorage(metadata);
      if (primaryResult.success) {
        providers.push('nftStorage');
        console.log(`[IPFS] Metadata uploaded to NFT.storage. CID: ${primaryResult.cid}`);
      }
    }

    if (!primaryResult?.success) {
      return {
        success: false,
        error: 'All IPFS providers failed',
        providers: [],
      };
    }

    // Backup pin to secondary service
    if (backupPin && primaryResult.success) {
      const backupProvider = primaryResult.provider === 'pinata' ? 'nftStorage' : 'pinata';

      if (backupProvider === 'nftStorage' && this.nftStorageReady) {
        console.log('[IPFS] Backup pinning metadata to NFT.storage...');
        const backupResult = await this.uploadMetadataToNFTStorage(metadata);
        if (backupResult.success) {
          providers.push('nftStorage');
          console.log('[IPFS] Backup metadata pin to NFT.storage successful');
        }
      } else if (backupProvider === 'pinata' && this.pinataReady) {
        console.log('[IPFS] Backup pinning metadata to Pinata...');
        const backupResult = await this.uploadMetadataToPinata(metadata, filename);
        if (backupResult.success) {
          providers.push('pinata');
          console.log('[IPFS] Backup metadata pin to Pinata successful');
        }
      }
    }

    return {
      success: true,
      cid: primaryResult.cid,
      providers,
      url: primaryResult.url,
      ipfsUrl: primaryResult.ipfsUrl,
    };
  }

  /**
   * Upload both image and metadata, with image CID embedded in metadata
   * @param {Buffer} imageBuffer - PNG image buffer
   * @param {Object} metadata - Metadata object (image field will be set automatically)
   * @param {string} imageName - Filename for the image
   * @param {Object} options - Upload options
   * @returns {Promise<{success: boolean, imageCID?: string, metadataCID?: string, metadataURI?: string, providers: Object, error?: string}>}
   */
  async uploadNFT(imageBuffer, metadata, imageName = 'nft-image.png', options = {}) {
    // First upload the image
    const imageResult = await this.uploadImage(imageBuffer, imageName, options);

    if (!imageResult.success) {
      return {
        success: false,
        error: `Image upload failed: ${imageResult.error}`,
        providers: { image: [], metadata: [] },
      };
    }

    // Update metadata with IPFS image URL
    const metadataWithImage = {
      ...metadata,
      image: imageResult.ipfsUrl,
    };

    // Upload metadata
    const metadataResult = await this.uploadMetadata(
      metadataWithImage,
      `${metadata.name || 'nft'}-metadata.json`,
      options
    );

    if (!metadataResult.success) {
      return {
        success: false,
        imageCID: imageResult.cid,
        error: `Metadata upload failed: ${metadataResult.error}`,
        providers: { image: imageResult.providers, metadata: [] },
      };
    }

    return {
      success: true,
      imageCID: imageResult.cid,
      imageURL: imageResult.url,
      imageIPFS: imageResult.ipfsUrl,
      metadataCID: metadataResult.cid,
      metadataURL: metadataResult.url,
      metadataURI: metadataResult.ipfsUrl,
      providers: {
        image: imageResult.providers,
        metadata: metadataResult.providers,
      },
    };
  }

  // =============================================================
  //                     PINNING STATUS & MONITORING
  // =============================================================

  /**
   * Check if a CID is pinned on Pinata
   * @param {string} cid - IPFS CID to check
   * @returns {Promise<{pinned: boolean, provider: string, error?: string}>}
   */
  async checkPinataPin(cid) {
    if (!this.pinataReady) {
      return { pinned: false, provider: 'pinata', error: 'Pinata not configured' };
    }

    try {
      // Use Pinata's list pins API to check
      const response = await this.pinataClient.listFiles().cid(cid);
      const isPinned = response && response.length > 0;
      return { pinned: isPinned, provider: 'pinata' };
    } catch (error) {
      // If we get a 404 or similar, the file isn't pinned
      return { pinned: false, provider: 'pinata', error: error.message };
    }
  }

  /**
   * Check if a CID is accessible via NFT.storage gateway
   * @param {string} cid - IPFS CID to check
   * @returns {Promise<{pinned: boolean, provider: string, error?: string}>}
   */
  async checkNFTStoragePin(cid) {
    try {
      const url = `${GATEWAYS.nftStorage}/${cid}`;
      const response = await fetch(url, { method: 'HEAD', timeout: 10000 });
      return { pinned: response.ok, provider: 'nftStorage' };
    } catch (error) {
      return { pinned: false, provider: 'nftStorage', error: error.message };
    }
  }

  /**
   * Check pinning status across all configured providers
   * @param {string} cid - IPFS CID to check
   * @returns {Promise<{cid: string, status: Object, healthy: boolean}>}
   */
  async checkPinningStatus(cid) {
    this.initialize();

    const status = {
      pinata: { checked: false, pinned: false },
      nftStorage: { checked: false, pinned: false },
    };

    const checks = [];

    if (this.pinataReady) {
      checks.push(
        this.checkPinataPin(cid).then(result => {
          status.pinata = { checked: true, ...result };
        })
      );
    }

    if (this.nftStorageReady) {
      checks.push(
        this.checkNFTStoragePin(cid).then(result => {
          status.nftStorage = { checked: true, ...result };
        })
      );
    }

    await Promise.all(checks);

    // Consider healthy if at least one provider has the content pinned
    const healthy = status.pinata.pinned || status.nftStorage.pinned;

    return { cid, status, healthy };
  }

  /**
   * Re-pin content to a backup provider if not already pinned there
   * @param {string} cid - IPFS CID to re-pin
   * @param {string} targetProvider - 'pinata' or 'nftStorage'
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async repinToProvider(cid, targetProvider) {
    this.initialize();

    try {
      // Fetch content from IPFS
      const gatewayUrl = `${GATEWAYS.ipfsIo}/${cid}`;
      const response = await fetch(gatewayUrl);

      if (!response.ok) {
        return { success: false, error: `Failed to fetch content from IPFS: ${response.status}` };
      }

      const contentType = response.headers.get('content-type');
      const buffer = Buffer.from(await response.arrayBuffer());

      if (targetProvider === 'pinata' && this.pinataReady) {
        if (contentType?.includes('json')) {
          const metadata = JSON.parse(buffer.toString());
          const result = await this.uploadMetadataToPinata(metadata);
          return { success: result.success, error: result.error };
        } else {
          const result = await this.uploadImageToPinata(buffer, `${cid}.png`);
          return { success: result.success, error: result.error };
        }
      } else if (targetProvider === 'nftStorage' && this.nftStorageReady) {
        if (contentType?.includes('json')) {
          const metadata = JSON.parse(buffer.toString());
          const result = await this.uploadMetadataToNFTStorage(metadata);
          return { success: result.success, error: result.error };
        } else {
          const result = await this.uploadImageToNFTStorage(buffer, `${cid}.png`);
          return { success: result.success, error: result.error };
        }
      }

      return { success: false, error: `Provider ${targetProvider} not available` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ensure a CID is pinned on all available providers
   * @param {string} cid - IPFS CID to ensure
   * @returns {Promise<{success: boolean, status: Object}>}
   */
  async ensurePinned(cid) {
    const currentStatus = await this.checkPinningStatus(cid);
    const results = { ...currentStatus.status };

    // Re-pin to any provider that doesn't have it
    if (this.pinataReady && !currentStatus.status.pinata.pinned) {
      console.log(`[IPFS] Re-pinning ${cid} to Pinata...`);
      const repinResult = await this.repinToProvider(cid, 'pinata');
      results.pinata.repinned = repinResult.success;
      if (repinResult.error) results.pinata.error = repinResult.error;
    }

    if (this.nftStorageReady && !currentStatus.status.nftStorage.pinned) {
      console.log(`[IPFS] Re-pinning ${cid} to NFT.storage...`);
      const repinResult = await this.repinToProvider(cid, 'nftStorage');
      results.nftStorage.repinned = repinResult.success;
      if (repinResult.error) results.nftStorage.error = repinResult.error;
    }

    return {
      success: results.pinata.pinned || results.pinata.repinned || results.nftStorage.pinned || results.nftStorage.repinned,
      status: results,
    };
  }

  // =============================================================
  //                     METADATA UPDATE WORKFLOW
  // =============================================================

  /**
   * Update NFT metadata (generates new CID since IPFS is immutable)
   * @param {string} oldMetadataCID - Current metadata CID
   * @param {Object} updates - Fields to update in metadata
   * @param {Object} options - Upload options
   * @returns {Promise<{success: boolean, oldCID: string, newCID?: string, newURI?: string, error?: string}>}
   */
  async updateMetadata(oldMetadataCID, updates, options = {}) {
    this.initialize();

    try {
      // Fetch existing metadata from IPFS
      const gatewayUrl = `${GATEWAYS.ipfsIo}/${oldMetadataCID}`;
      const response = await fetch(gatewayUrl);

      if (!response.ok) {
        return {
          success: false,
          oldCID: oldMetadataCID,
          error: `Failed to fetch existing metadata: ${response.status}`,
        };
      }

      const existingMetadata = await response.json();

      // Merge updates with existing metadata
      const updatedMetadata = {
        ...existingMetadata,
        ...updates,
        // Preserve image if not explicitly updated
        image: updates.image || existingMetadata.image,
        // Update timestamp
        properties: {
          ...existingMetadata.properties,
          ...updates.properties,
          lastUpdated: new Date().toISOString(),
        },
      };

      // Upload new metadata
      console.log(`[IPFS] Uploading updated metadata (replacing ${oldMetadataCID})...`);
      const uploadResult = await this.uploadMetadata(
        updatedMetadata,
        `${updatedMetadata.name || 'nft'}-metadata.json`,
        options
      );

      if (!uploadResult.success) {
        return {
          success: false,
          oldCID: oldMetadataCID,
          error: uploadResult.error,
        };
      }

      console.log(`[IPFS] Metadata updated. Old CID: ${oldMetadataCID}, New CID: ${uploadResult.cid}`);

      return {
        success: true,
        oldCID: oldMetadataCID,
        newCID: uploadResult.cid,
        newURI: uploadResult.ipfsUrl,
        newURL: uploadResult.url,
        providers: uploadResult.providers,
      };
    } catch (error) {
      return {
        success: false,
        oldCID: oldMetadataCID,
        error: error.message,
      };
    }
  }

  /**
   * Update domain metadata when DNS settings change
   * @param {string} fqdn - Fully qualified domain name
   * @param {Object} dnsUpdates - DNS-related updates
   * @returns {Promise<{success: boolean, newMetadataCID?: string, error?: string}>}
   */
  async updateDomainMetadata(fqdn, dnsUpdates) {
    try {
      // Get current domain data from database
      const result = await query(
        'SELECT nft_metadata_cid, dns_active FROM domains WHERE fqdn = $1',
        [fqdn.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Domain not found' };
      }

      const { nft_metadata_cid: metadataCID } = result.rows[0];

      if (!metadataCID) {
        return { success: false, error: 'Domain has no NFT metadata' };
      }

      // Update metadata with DNS changes
      const updates = {
        attributes: [], // Will be merged with existing
      };

      // Build attribute updates
      if (dnsUpdates.dnsActive !== undefined) {
        updates.attributeUpdates = updates.attributeUpdates || [];
        updates.attributeUpdates.push({
          trait_type: 'DNS Active',
          value: dnsUpdates.dnsActive ? 'Yes' : 'No',
        });
      }

      // Use the generic updateMetadata method
      const updateResult = await this.updateMetadata(metadataCID, {
        properties: {
          dnsUpdatedAt: new Date().toISOString(),
        },
      });

      if (updateResult.success) {
        // Update database with new CID
        await query(
          'UPDATE domains SET nft_metadata_cid = $2, metadata_uri = $3, updated_at = NOW() WHERE fqdn = $1',
          [fqdn.toLowerCase(), updateResult.newCID, updateResult.newURI]
        );

        // Log the metadata change
        await this.logMetadataChange(fqdn, metadataCID, updateResult.newCID, 'dns_update', dnsUpdates);
      }

      return {
        success: updateResult.success,
        oldMetadataCID: metadataCID,
        newMetadataCID: updateResult.newCID,
        newMetadataURI: updateResult.newURI,
        error: updateResult.error,
      };
    } catch (error) {
      console.error('[IPFS] Error updating domain metadata:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log metadata changes for audit trail
   * @param {string} fqdn - Domain name
   * @param {string} oldCID - Previous metadata CID
   * @param {string} newCID - New metadata CID
   * @param {string} changeType - Type of change
   * @param {Object} changeDetails - Details of the change
   */
  async logMetadataChange(fqdn, oldCID, newCID, changeType, changeDetails) {
    try {
      await query(`
        INSERT INTO nft_metadata_changes (fqdn, old_cid, new_cid, change_type, change_details, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [fqdn.toLowerCase(), oldCID, newCID, changeType, JSON.stringify(changeDetails)]);
    } catch (error) {
      console.error('[IPFS] Error logging metadata change:', error);
      // Don't fail the overall operation for logging errors
    }
  }

  // =============================================================
  //                     BATCH OPERATIONS
  // =============================================================

  /**
   * Check pinning health for multiple CIDs
   * @param {string[]} cids - Array of CIDs to check
   * @returns {Promise<{healthy: number, unhealthy: number, details: Object[]}>}
   */
  async batchCheckPinningHealth(cids) {
    const results = await Promise.all(
      cids.map(cid => this.checkPinningStatus(cid))
    );

    const healthy = results.filter(r => r.healthy).length;
    const unhealthy = results.filter(r => !r.healthy).length;

    return {
      healthy,
      unhealthy,
      total: cids.length,
      details: results,
    };
  }

  /**
   * Ensure multiple CIDs are pinned across providers
   * @param {string[]} cids - Array of CIDs to ensure
   * @returns {Promise<{success: number, failed: number, details: Object[]}>}
   */
  async batchEnsurePinned(cids) {
    const results = [];
    let success = 0;
    let failed = 0;

    for (const cid of cids) {
      const result = await this.ensurePinned(cid);
      results.push({ cid, ...result });
      if (result.success) success++;
      else failed++;

      // Small delay to avoid rate limiting
      await this.sleep(100);
    }

    return { success, failed, total: cids.length, details: results };
  }

  // =============================================================
  //                     UTILITY METHODS
  // =============================================================

  /**
   * Get the gateway URL for a CID (uses default gateway)
   * @param {string} cid - IPFS CID
   * @returns {string} Gateway URL
   */
  getGatewayUrl(cid) {
    return `${DEFAULT_GATEWAY}/${cid}`;
  }

  /**
   * Get gateway URL from a specific provider
   * @param {string} cid - IPFS CID
   * @param {string} provider - Provider name ('pinata', 'nftStorage', 'ipfsIo', 'cloudflare', 'dweb')
   * @returns {string} Gateway URL
   */
  getGatewayUrlForProvider(cid, provider) {
    return `${GATEWAYS[provider] || DEFAULT_GATEWAY}/${cid}`;
  }

  /**
   * Get the IPFS URI for a CID
   * @param {string} cid - IPFS CID
   * @returns {string} IPFS URI
   */
  getIPFSUri(cid) {
    return `ipfs://${cid}`;
  }

  /**
   * Get all available gateways
   * @returns {Object} Gateway URLs by provider
   */
  getGateways() {
    return { ...GATEWAYS };
  }
}

// Export singleton instance
const nftStorageService = new IPFSStorageService();

export default nftStorageService;

export {
  IPFSStorageService,
  nftStorageService,
  GATEWAYS,
  DEFAULT_GATEWAY,
};
