import { ethers } from 'ethers';
import config from '../config/index.js';
import { loggers } from './logger.js';

const log = loggers.app;

// Fallback RPC endpoints — primary can return 429 under load
const COSTON2_RPCS = [
  config.flare?.rpcUrl || 'https://coston2-api.flare.network/ext/C/rpc',
  'https://coston2.enosys.global/ext/C/rpc',
  'https://rpc.ankr.com/flare_coston2',
];

const FLARE_RPCS = [
  'https://flare-api.flare.network/ext/C/rpc',
  'https://rpc.ankr.com/flare',
];

/**
 * Creates a JsonRpcProvider with automatic fallback to alternate RPCs on failure.
 * Returns a Proxy that intercepts async method calls and retries on other endpoints.
 */
export function createFallbackProvider(chainId = 114) {
  const rpcs = chainId === 14 ? FLARE_RPCS : COSTON2_RPCS;
  let currentIndex = 0;
  const network = ethers.Network.from(chainId);
  const providers = rpcs.map(url =>
    new ethers.JsonRpcProvider(url, network, { staticNetwork: network })
  );

  return new Proxy(providers[0], {
    get(target, prop) {
      const current = providers[currentIndex];
      const value = current[prop];
      if (typeof value !== 'function') return value;

      return async function (...args) {
        for (let attempt = 0; attempt < providers.length; attempt++) {
          const idx = (currentIndex + attempt) % providers.length;
          try {
            const result = await providers[idx][prop](...args);
            if (attempt > 0) {
              log.info({ rpc: rpcs[idx] }, 'Switched to fallback RPC');
              currentIndex = idx;
            }
            return result;
          } catch (err) {
            const is429 = err.message?.includes('429') || err.info?.responseStatus?.includes('429');
            const isNetworkErr = err.code === 'SERVER_ERROR' || err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT';
            if ((is429 || isNetworkErr) && attempt < providers.length - 1) {
              log.warn({ rpc: rpcs[idx], method: String(prop) }, 'RPC failed, trying fallback');
              continue;
            }
            throw err;
          }
        }
      };
    }
  });
}
