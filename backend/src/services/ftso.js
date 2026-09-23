import { ethers } from 'ethers';
import config from '../config/index.js';
import { loggers } from '../utils/logger.js';

const log = loggers.ftso;

/**
 * Flare FTSO Service
 * Fetches real-time FLR/USD price from Flare's Time Series Oracle
 *
 * References:
 * - https://dev.flare.network/ftso/getting-started/
 * - https://dev.to/ajtech0001/flare-oracle-a-comprehensive-guide-for-developers-28oe
 */

// Contract addresses (same on all Flare networks)
const FLARE_CONTRACT_REGISTRY = '0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019';

// Feed IDs for FTSO v2
const FEED_IDS = {
  FLR_USD: '0x01464c522f55534400000000000000000000000000',
  BTC_USD: '0x014254432f55534400000000000000000000000000',
  ETH_USD: '0x014554482f55534400000000000000000000000000',
};

// Minimal ABIs for the contracts we need
const CONTRACT_REGISTRY_ABI = [
  'function getContractAddressByName(string calldata _name) external view returns (address)',
];

const FTSO_V2_ABI = [
  'function getFeedById(bytes21 _feedId) external payable returns (uint256 _value, int8 _decimals, uint64 _timestamp)',
  'function getFeedByIdInWei(bytes21 _feedId) external payable returns (uint256 _value, uint64 _timestamp)',
  'function getFeedsById(bytes21[] calldata _feedIds) external payable returns (uint256[] memory _values, int8[] memory _decimals, uint64 _timestamp)',
];

// Fallback: FtsoRegistry v1 ABI (deprecated but still works)
const FTSO_REGISTRY_V1_ABI = [
  'function getCurrentPriceWithDecimals(string memory _symbol) external view returns (uint256 _price, uint256 _timestamp, uint256 _assetPriceUsdDecimals)',
  'function getSupportedSymbols() external view returns (string[] memory)',
];

class FTSOService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.flare.rpcUrl);
    this.contractRegistry = new ethers.Contract(
      FLARE_CONTRACT_REGISTRY,
      CONTRACT_REGISTRY_ABI,
      this.provider
    );

    this.ftsoV2Address = null;
    this.ftsoRegistryAddress = null;
    this.lastPrice = null;
    this.lastPriceTimestamp = null;
    this.cacheMaxAge = 5 * 60 * 1000; // Cache price for 5 minutes
  }

  /**
   * Initialize FTSO contracts
   */
  async initialize() {
    try {
      // Try to get FtsoV2 address (newer interface)
      try {
        this.ftsoV2Address = await this.contractRegistry.getContractAddressByName('FtsoV2');
        log.info({ address: this.ftsoV2Address }, 'FtsoV2 resolved');
      } catch (e) {
        log.warn('FtsoV2 not found, trying TestFtsoV2...');
        try {
          this.ftsoV2Address = await this.contractRegistry.getContractAddressByName('TestFtsoV2');
          log.info({ address: this.ftsoV2Address }, 'TestFtsoV2 resolved');
        } catch (e2) {
          log.warn('TestFtsoV2 not found');
        }
      }

      // Fallback: get FtsoRegistry v1 address
      try {
        this.ftsoRegistryAddress = await this.contractRegistry.getContractAddressByName('FtsoRegistry');
        log.info({ address: this.ftsoRegistryAddress }, 'FtsoRegistry resolved');
      } catch (e) {
        log.warn('FtsoRegistry not found');
      }

      if (!this.ftsoV2Address && !this.ftsoRegistryAddress) {
        log.error('No FTSO contracts resolved - price feeds will be unavailable');
        return { success: false, error: 'No FTSO contracts available' };
      }

      return { success: true };
    } catch (error) {
      log.error({ err: error }, 'FTSO initialization failed');
      return { success: false, error: error.message };
    }
  }

  /**
   * Get FLR/USD price from FTSO v2
   */
  async getFLRPriceV2() {
    if (!this.ftsoV2Address) {
      throw new Error('FtsoV2 not initialized');
    }

    const ftsoV2 = new ethers.Contract(this.ftsoV2Address, FTSO_V2_ABI, this.provider);

    // Retry once on empty response (common during Coston2 voting epoch transitions)
    // 5-second timeout per attempt to avoid hanging on flaky Coston2 RPC
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await Promise.race([
          ftsoV2.getFeedById.staticCall(FEED_IDS.FLR_USD),
          new Promise((_, reject) => setTimeout(() => reject(new Error('FTSO call timeout')), 5000)),
        ]);
        break;
      } catch (err) {
        if (attempt === 0 && (err.code === 'BAD_DATA' || err.message === 'FTSO call timeout')) {
          log.warn('FtsoV2 returned empty data or timed out, retrying in 2s...');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
    }

    if (!result) {
      throw new Error('FtsoV2 returned empty data after retry');
    }

    const value = result[0];
    const decimals = result[1];
    const timestamp = result[2];

    // Convert to USD price (value / 10^decimals)
    const priceUSD = Number(value) / Math.pow(10, Number(decimals));

    return {
      price: priceUSD,
      decimals: Number(decimals),
      rawValue: value.toString(),
      timestamp: new Date(Number(timestamp) * 1000).toISOString(),
    };
  }

  /**
   * Get FLR/USD price from FTSO Registry v1 (deprecated fallback)
   */
  async getFLRPriceV1() {
    if (!this.ftsoRegistryAddress) {
      throw new Error('FtsoRegistry not initialized');
    }

    const ftsoRegistry = new ethers.Contract(
      this.ftsoRegistryAddress,
      FTSO_REGISTRY_V1_ABI,
      this.provider
    );

    const result = await ftsoRegistry.getCurrentPriceWithDecimals('FLR');

    const price = result[0];
    const timestamp = result[1];
    const decimals = result[2];

    // Convert to USD price
    const priceUSD = Number(price) / Math.pow(10, Number(decimals));

    return {
      price: priceUSD,
      decimals: Number(decimals),
      rawValue: price.toString(),
      timestamp: new Date(Number(timestamp) * 1000).toISOString(),
    };
  }

  /**
   * Get FLR/USD price (with caching)
   */
  async getFLRPrice() {
    // Return cached price if fresh enough
    if (this.lastPrice && this.lastPriceTimestamp) {
      const age = Date.now() - this.lastPriceTimestamp;
      if (age < this.cacheMaxAge) {
        return {
          ...this.lastPrice,
          cached: true,
          cacheAge: age,
        };
      }
    }

    try {
      // Try FtsoV2 first
      if (this.ftsoV2Address) {
        const price = await this.getFLRPriceV2();
        this.lastPrice = price;
        this.lastPriceTimestamp = Date.now();
        return { ...price, source: 'FtsoV2', cached: false };
      }

      // Fallback to FtsoRegistry v1
      if (this.ftsoRegistryAddress) {
        const price = await this.getFLRPriceV1();
        this.lastPrice = price;
        this.lastPriceTimestamp = Date.now();
        return { ...price, source: 'FtsoRegistry', cached: false };
      }

      throw new Error('No FTSO contract available');
    } catch (error) {
      // If we have a cached price, return it with a warning
      if (this.lastPrice) {
        const staleDuration = Date.now() - this.lastPriceTimestamp;
        log.warn({ err: error, staleDurationMs: staleDuration }, 'FTSO price fetch failed, returning stale cache');
        return {
          ...this.lastPrice,
          cached: true,
          stale: true,
          staleDurationMs: staleDuration,
          error: error.message,
        };
      }
      log.error({ err: error }, 'FTSO price fetch failed with no cache available');
      throw error;
    }
  }

  /**
   * Convert USD to FLR using current price
   */
  async convertUSDtoFLR(usdAmount) {
    const { price } = await this.getFLRPrice();
    if (!price || price <= 0) {
      throw new Error('Invalid FLR price');
    }
    return usdAmount / price;
  }

  /**
   * Convert FLR to USD using current price
   */
  async convertFLRtoUSD(flrAmount) {
    const { price } = await this.getFLRPrice();
    if (!price || price <= 0) {
      throw new Error('Invalid FLR price');
    }
    return flrAmount * price;
  }

  /**
   * Get pricing for a subdomain based on length tier
   * Prices match the smart contract: SubdomainEscrow.sol
   */
  async getSubdomainPricing(subdomainLength) {
    // Determine tier based on length
    let tierName;
    if (subdomainLength === 1) tierName = 'ultra_premium';
    else if (subdomainLength === 2) tierName = 'premium';
    else if (subdomainLength === 3) tierName = 'standard_plus';
    else tierName = 'standard';

    // Get current FLR/USD price from oracle
    const priceData = await this.getFLRPrice();
    const flrPriceUSD = priceData.price;

    // Check if we're on testnet (Coston2 = chain 114)
    const isTestnet = config.flare.chainId === 114 || config.flare.chainId === '114';

    if (isTestnet) {
      // TESTNET: Flat 1 C2FLR for all tiers (easy testing)
      const testPriceFLR = 1;
      return {
        tier: tierName,
        priceUSD: testPriceFLR * flrPriceUSD,
        priceFLR: testPriceFLR,
        flrPriceUSD,
        priceSource: priceData.source || 'cached',
        priceTimestamp: priceData.timestamp,
      };
    }

    // MAINNET: Real USD prices matching the smart contract
    const TIER_PRICES_USD = {
      ultra_premium: 500,  // 1 char
      premium: 200,        // 2 chars
      standard_plus: 50,   // 3 chars
      standard: 10,        // 4+ chars
    };

    const priceUSD = TIER_PRICES_USD[tierName];

    // Calculate FLR price: priceUSD / flrPriceUSD
    const priceFLR = flrPriceUSD > 0 ? priceUSD / flrPriceUSD : 0;

    return {
      tier: tierName,
      priceUSD,
      priceFLR: Math.ceil(priceFLR), // Round up to nearest whole FLR
      flrPriceUSD,
      priceSource: priceData.source || 'cached',
      priceTimestamp: priceData.timestamp,
    };
  }
}

export const ftsoService = new FTSOService();
export default ftsoService;
