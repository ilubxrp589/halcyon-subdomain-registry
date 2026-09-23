import hnsService from './hns.js';
import { loggers } from '../utils/logger.js';

const log = loggers.hns;

/**
 * HSD Client — higher-level wrapper for TLD staking pre-validation.
 *
 * Uses the existing hnsService (hs-client JSON-RPC) under the hood.
 * Provides combined name info, TXT record extraction, expiry checks,
 * and Flare address ownership verification needed by the FDC staking flow.
 */
class HsdClient {
  /**
   * Get full name info + resource data for a TLD label.
   * Combines getnameinfo + getnameresource into a single response.
   *
   * @param {string} tldLabel - The Handshake TLD label (e.g. "cryptofans")
   * @returns {{ success: boolean, data?: object, error?: string }}
   */
  async getNameInfo(tldLabel) {
    const label = tldLabel.toLowerCase();

    const infoResult = await hnsService.getNameInfo(label);
    if (!infoResult.success) {
      return { success: false, error: infoResult.error };
    }

    const info = infoResult.data?.info;
    if (!info) {
      return { success: false, error: 'Name not found' };
    }

    // Fetch resource records (may be empty for names without resource data)
    let records = [];
    const resourceResult = await hnsService.getNameResource(label);
    if (resourceResult.success && resourceResult.data?.records) {
      records = resourceResult.data.records;
    }

    return {
      success: true,
      data: {
        name: info.name,
        state: info.state,
        expired: info.expired,
        registered: info.registered,
        owner: info.owner ? { hash: info.owner.hash } : null,
        stats: info.stats ? { daysUntilExpire: info.stats.daysUntilExpire } : null,
        records,
      },
    };
  }

  /**
   * Verify that a TLD is owned and has a flr: TXT record matching the expected address.
   *
   * Checks:
   * 1. Name exists
   * 2. state === 'CLOSED' (auction finished, name owned)
   * 3. expired === false
   * 4. TXT record contains "flr:<expectedFlareAddress>" (case-insensitive address match)
   *
   * @param {string} tldLabel
   * @param {string} expectedFlareAddress - e.g. "0x742d35Cc..."
   * @returns {{ valid: boolean, reason: string, data?: object }}
   */
  async verifyTldOwnership(tldLabel, expectedFlareAddress) {
    const result = await this.getNameInfo(tldLabel);
    if (!result.success) {
      return { valid: false, reason: result.error || 'Failed to fetch name info' };
    }

    const { state, records, stats } = result.data;

    if (state !== 'CLOSED') {
      return { valid: false, reason: `TLD state is "${state}", expected "CLOSED"`, data: result.data };
    }

    // hsd's "expired" flag means the original auction period ended, NOT that the name
    // has actually expired. Check daysUntilExpire from stats for real expiry.
    const daysUntilExpire = stats?.daysUntilExpire ?? 0;
    if (daysUntilExpire <= 0) {
      return { valid: false, reason: 'TLD has expired (0 days remaining)', data: result.data };
    }

    // Look for flr: TXT record
    const txtRecords = this._extractTxtStrings(records);
    const normalizedExpected = expectedFlareAddress.toLowerCase();
    const flrRecord = txtRecords.find(
      txt => txt.toLowerCase() === `flr:${normalizedExpected}`
    );

    if (!flrRecord) {
      return {
        valid: false,
        reason: `No TXT record found matching "flr:${expectedFlareAddress}". Found TXT records: ${txtRecords.length ? txtRecords.join(', ') : 'none'}`,
        data: result.data,
      };
    }

    return { valid: true, reason: 'OK', data: result.data };
  }

  /**
   * Extract all TXT record strings for a TLD.
   *
   * @param {string} tldLabel
   * @returns {Promise<string[]>}
   */
  async getTxtRecords(tldLabel) {
    const result = await this.getNameInfo(tldLabel);
    if (!result.success) {
      return [];
    }
    return this._extractTxtStrings(result.data.records);
  }

  /**
   * Check if a TLD has expired on Handshake.
   *
   * @param {string} tldLabel
   * @returns {Promise<boolean>}
   */
  async isExpired(tldLabel) {
    const result = await this.getNameInfo(tldLabel);
    if (!result.success) {
      return true; // Treat lookup failures as expired for safety
    }
    return result.data.expired === true;
  }

  /**
   * Extract the Flare address from TXT records (if present).
   *
   * @param {string} tldLabel
   * @returns {Promise<string|null>} The Flare address without the "flr:" prefix, or null
   */
  async getFlareAddress(tldLabel) {
    const txtRecords = await this.getTxtRecords(tldLabel);
    for (const txt of txtRecords) {
      if (txt.toLowerCase().startsWith('flr:')) {
        return txt.substring(4); // Return everything after "flr:"
      }
    }
    return null;
  }

  /**
   * Extract all TXT strings from an array of HNS resource records.
   * TXT records in HNS have { type: "TXT", txt: ["string1", "string2"] }
   *
   * @private
   * @param {Array} records
   * @returns {string[]}
   */
  _extractTxtStrings(records) {
    if (!Array.isArray(records)) return [];
    const strings = [];
    for (const r of records) {
      if (r.type === 'TXT' && Array.isArray(r.txt)) {
        strings.push(...r.txt);
      }
    }
    return strings;
  }
}

export const hsdClient = new HsdClient();
export default hsdClient;
