/**
 * BIND Zone Service (volume-resolver)
 * Manages DNS records for registered subdomains via direct zone file manipulation.
 * Drop-in replacement for the old PowerDNS HTTP API client.
 *
 * Write path: edit zone file on host -> pipe into container via docker exec -> rndc reload
 * Read path: parse zone file from host disk
 * Health: docker exec volume-resolver rndc status
 */

import { readFile, writeFile, rename, access } from 'fs/promises';
import { join } from 'path';
import { exec as execCb } from 'child_process';

const ZONE_DIR = process.env.DNS_ZONE_DIR || '/home/localai/volume-resolver-data/auth_zones';
const CONTAINER = 'volume-resolver';
const NS_IP = '192.0.2.39';
const DEFAULT_TTL = 300;

// Infrastructure labels that are part of the zone header, not subdomain records
const INFRA_LABELS = new Set(['@', 'ns1', 'ns2', 'ns3']);

class BindZoneService {
  constructor() {
    // Per-TLD write queue: Map<tld, Promise>
    // Prevents concurrent writes to the same zone file from corrupting it
    this.writeQueues = new Map();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Execute a shell command with timeout
   */
  exec(cmd, timeout = 15000) {
    return new Promise((resolve, reject) => {
      execCb(cmd, { timeout }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr?.trim() || err.message));
        resolve(stdout.trim());
      });
    });
  }

  /**
   * Per-TLD write queue — serialises writes to the same zone file.
   * Writes to different TLDs run in parallel.
   */
  enqueue(tld, fn) {
    const prev = this.writeQueues.get(tld) || Promise.resolve();
    const next = prev.then(fn, fn); // run fn regardless of prior result
    this.writeQueues.set(tld, next);
    return next;
  }

  /**
   * Parse a zone file into header (SOA/NS/infra) and subdomain records.
   * Returns { header: string[], serial: string, records: Map<label, [{type, value}]> }
   */
  async parseZoneFile(tld) {
    const filePath = join(ZONE_DIR, tld);
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const header = [];
    const records = new Map();
    let serial = null;
    let inSOA = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track SOA block (multi-line parentheses)
      if (trimmed.includes('SOA')) inSOA = true;
      if (inSOA) {
        header.push(line);
        // Extract serial from SOA
        const serialMatch = trimmed.match(/(\d{10})\s*;\s*serial/);
        if (serialMatch) serial = serialMatch[1];
        if (trimmed.includes(')')) inSOA = false;
        continue;
      }

      // Directives ($TTL, $ORIGIN etc.) go in header
      if (trimmed.startsWith('$')) {
        header.push(line);
        continue;
      }

      // Empty lines and comments
      if (!trimmed || trimmed.startsWith(';')) {
        // Stop collecting into header once we hit the subdomain section marker
        if (records.size === 0 && !trimmed.includes('Registered subdomains')) {
          header.push(line);
        }
        continue;
      }

      // Parse record line: label [TTL] [class] type value
      const match = trimmed.match(/^(\S+)\s+(?:(\d+)\s+)?(?:IN\s+)?(\w+)\s+(.+)/);
      if (!match) {
        // Unparseable line — keep in header if before subdomain records
        if (records.size === 0) header.push(line);
        continue;
      }

      const [, label, , rrtype, value] = match;

      // Infrastructure records (SOA already handled above)
      if (INFRA_LABELS.has(label) || rrtype === 'SOA') {
        header.push(line);
        continue;
      }

      // Subdomain record
      if (!records.has(label)) {
        records.set(label, []);
      }
      records.get(label).push({ type: rrtype, value: value.trim() });
    }

    return { header, serial, records };
  }

  /**
   * Build zone file content from header + serial + subdomain records
   */
  buildZoneFile(header, newSerial, records) {
    // Replace serial in header
    let updatedHeader = header.map(line => {
      if (/\d{10}\s*;\s*serial/.test(line)) {
        return line.replace(/\d{10}/, newSerial);
      }
      return line;
    });

    // Trim trailing blank lines from header to prevent accumulation
    while (updatedHeader.length > 0 && updatedHeader[updatedHeader.length - 1].trim() === '') {
      updatedHeader.pop();
    }

    const parts = [updatedHeader.join('\n')];

    if (records.size > 0) {
      parts.push('');
      parts.push('; --- Registered subdomains ---');

      // Sort labels for deterministic output
      const sorted = [...records.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [label, rrs] of sorted) {
        for (const rr of rrs) {
          parts.push(`${label} IN ${rr.type} ${rr.value}`);
        }
      }
    }

    return parts.join('\n') + '\n';
  }

  /**
   * Increment YYYYMMDDNN serial
   */
  incrementSerial(serial) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (serial && serial.slice(0, 8) === today) {
      const nn = parseInt(serial.slice(8), 10) + 1;
      return `${today}${String(nn).padStart(2, '0')}`;
    }
    return `${today}01`;
  }

  /**
   * Pipe content into a file inside the container via docker exec stdin.
   * docker cp can't write to tmpfs (/dev/shm) mounts, so we pipe instead.
   */
  pipeToContainer(containerPath, content, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const child = execCb(
        `docker exec -i ${CONTAINER} sh -c 'cat > "${containerPath}"'`,
        { timeout },
        (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr?.trim() || err.message));
          resolve();
        },
      );
      child.stdin.write(content);
      child.stdin.end();
    });
  }

  /**
   * Write zone file to host, pipe into container, rndc reload.
   * Atomic: write .tmp then rename on host side.
   */
  async applyZoneChange(tld, content) {
    const filePath = join(ZONE_DIR, tld);
    const tmpPath = `${filePath}.tmp`;

    // Atomic write on host
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, filePath);

    // Pipe into container's tmpfs zone dir and reload both BIND views
    const containerZonePath = `/dev/shm/named/zones/${tld}`;
    try {
      await this.pipeToContainer(containerZonePath, content);
      await this.exec(`docker exec ${CONTAINER} rndc reload ${tld} IN recursive`);
      await this.exec(`docker exec ${CONTAINER} rndc reload ${tld} IN root`);
    } catch (err) {
      // Retry once after 2s
      console.error(`[DNS] applyZoneChange(${tld}) failed, retrying: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
      await this.pipeToContainer(containerZonePath, content);
      await this.exec(`docker exec ${CONTAINER} rndc reload ${tld} IN recursive`);
      await this.exec(`docker exec ${CONTAINER} rndc reload ${tld} IN root`);
    }
  }

  // ── Public API (same signatures as old PowerDNSService) ──────────────

  /**
   * Check if the DNS service is healthy
   */
  async healthCheck() {
    try {
      const output = await this.exec(`docker exec ${CONTAINER} rndc status`, 5000);
      if (output.includes('server is up and running')) {
        return { success: true, status: 'healthy' };
      }
      return { success: false, status: 'unhealthy' };
    } catch (error) {
      return { success: false, status: 'unreachable', error: error.message };
    }
  }

  /**
   * Create DNS records for a subdomain
   * @param {string} subdomain - e.g. "alice"
   * @param {string} tld - e.g. "cryptofans"
   * @param {object} records - { ipv4, ipv6, cname, txt, ttl }
   */
  async createSubdomainRecords(subdomain, tld, records = {}) {
    // Ensure zone exists before writing
    const ensureResult = await this.ensureZone(tld);
    if (!ensureResult.success) return ensureResult;

    return this.enqueue(tld, async () => {
      try {
        const zone = await this.parseZoneFile(tld);
        const label = subdomain.toLowerCase();

        // Build the record entries for this subdomain
        const newRrs = [];

        if (records.ipv4) {
          newRrs.push({ type: 'A', value: records.ipv4 });
        }
        if (records.ipv6) {
          newRrs.push({ type: 'AAAA', value: records.ipv6 });
        }
        if (records.cname) {
          newRrs.push({ type: 'CNAME', value: records.cname.endsWith('.') ? records.cname : `${records.cname}.` });
        }
        if (records.txt) {
          newRrs.push({ type: 'TXT', value: `"${records.txt}"` });
        }

        // If no records specified, create placeholder TXT
        if (newRrs.length === 0) {
          newRrs.push({ type: 'TXT', value: '"halcyon-registered"' });
        }

        // Replace any existing records for this label
        zone.records.set(label, newRrs);

        const newSerial = this.incrementSerial(zone.serial);
        const content = this.buildZoneFile(zone.header, newSerial, zone.records);
        await this.applyZoneChange(tld, content);

        return { success: true, data: null };
      } catch (error) {
        console.error(`[DNS] createSubdomainRecords(${subdomain}.${tld}) failed:`, error.message);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Update DNS records for a subdomain (wraps create for REPLACE semantics)
   */
  async updateSubdomainRecords(subdomain, tld, records) {
    return this.createSubdomainRecords(subdomain, tld, records);
  }

  /**
   * Delete all records for a subdomain
   */
  async deleteSubdomainRecords(subdomain, tld) {
    return this.enqueue(tld, async () => {
      try {
        const zone = await this.parseZoneFile(tld);
        const label = subdomain.toLowerCase();

        if (!zone.records.has(label)) {
          // Nothing to delete — consider it a success
          return { success: true, data: null };
        }

        zone.records.delete(label);

        const newSerial = this.incrementSerial(zone.serial);
        const content = this.buildZoneFile(zone.header, newSerial, zone.records);
        await this.applyZoneChange(tld, content);

        return { success: true, data: null };
      } catch (error) {
        console.error(`[DNS] deleteSubdomainRecords(${subdomain}.${tld}) failed:`, error.message);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Get records for a subdomain.
   * Returns in PowerDNS rrsets format for caller compatibility:
   * { success: true, records: [{ name, type, ttl, records: [{ content }] }] }
   */
  async getSubdomainRecords(subdomain, tld) {
    try {
      const zone = await this.parseZoneFile(tld);
      const label = subdomain.toLowerCase();
      const fqdn = `${subdomain}.${tld}.`;

      const labelRecords = zone.records.get(label);
      if (!labelRecords || labelRecords.length === 0) {
        return { success: true, records: [] };
      }

      // Group by type (like PowerDNS rrsets)
      const byType = new Map();
      for (const rr of labelRecords) {
        if (!byType.has(rr.type)) byType.set(rr.type, []);
        byType.get(rr.type).push({ content: rr.value, disabled: false });
      }

      const rrsets = [];
      for (const [type, recs] of byType) {
        rrsets.push({
          name: fqdn,
          type,
          ttl: DEFAULT_TTL,
          records: recs,
        });
      }

      return { success: true, records: rrsets };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Zone file doesn't exist — no records
        return { success: true, records: [] };
      }
      console.error(`[DNS] getSubdomainRecords(${subdomain}.${tld}) failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all DNS records for a subdomain, including sub-subdomains.
   * Scans the zone file for the subdomain label and any labels ending in .subdomain.
   * Returns a flat list: { host: '@' | prefix, type, value }[]
   */
  async getAllDomainRecords(subdomain, tld) {
    try {
      const zone = await this.parseZoneFile(tld);
      const label = subdomain.toLowerCase();
      const suffix = `.${label}`;
      const entries = [];

      for (const [key, records] of zone.records) {
        if (key === label) {
          // Root subdomain records → host = '@'
          for (const rr of records) {
            entries.push({ host: '@', type: rr.type, value: rr.value, ttl: DEFAULT_TTL });
          }
        } else if (key.endsWith(suffix)) {
          // Sub-subdomain records → host = prefix before .subdomain
          const hostPrefix = key.slice(0, -suffix.length);
          for (const rr of records) {
            entries.push({ host: hostPrefix, type: rr.type, value: rr.value, ttl: DEFAULT_TTL });
          }
        }
      }

      return { success: true, entries };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true, entries: [] };
      }
      console.error(`[DNS] getAllDomainRecords(${subdomain}.${tld}) failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a single DNS record (specific type+value) for a label.
   * If removing the last record for a label, deletes the label entirely.
   */
  async deleteSingleRecord(subdomain, tld, recordType, recordValue) {
    return this.enqueue(tld, async () => {
      try {
        const zone = await this.parseZoneFile(tld);
        const label = subdomain.toLowerCase();

        if (!zone.records.has(label)) {
          return { success: true, data: null };
        }

        const existing = zone.records.get(label);
        const filtered = existing.filter(
          rr => !(rr.type === recordType && rr.value === recordValue)
        );

        if (filtered.length === 0) {
          zone.records.delete(label);
        } else {
          zone.records.set(label, filtered);
        }

        const newSerial = this.incrementSerial(zone.serial);
        const content = this.buildZoneFile(zone.header, newSerial, zone.records);
        await this.applyZoneChange(tld, content);

        return { success: true, data: null };
      } catch (error) {
        console.error(`[DNS] deleteSingleRecord(${subdomain}.${tld}, ${recordType}) failed:`, error.message);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Set dnslink TXT record for IPFS content
   * Creates _dnslink.subdomain.tld TXT record with dnslink=/ipfs/{CID}
   */
  async setDnslink(subdomain, tld, cid) {
    const dnslinkLabel = `_dnslink.${subdomain}`.toLowerCase();

    return this.enqueue(tld, async () => {
      try {
        const zone = await this.parseZoneFile(tld);

        zone.records.set(dnslinkLabel, [
          { type: 'TXT', value: `"dnslink=/ipfs/${cid}"` },
        ]);

        const newSerial = this.incrementSerial(zone.serial);
        const content = this.buildZoneFile(zone.header, newSerial, zone.records);
        await this.applyZoneChange(tld, content);

        return { success: true, data: null };
      } catch (error) {
        console.error(`[DNS] setDnslink(${subdomain}.${tld}, ${cid}) failed:`, error.message);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Remove dnslink TXT record
   */
  async removeDnslink(subdomain, tld) {
    const dnslinkLabel = `_dnslink.${subdomain}`.toLowerCase();

    return this.enqueue(tld, async () => {
      try {
        const zone = await this.parseZoneFile(tld);

        if (!zone.records.has(dnslinkLabel)) {
          return { success: true, data: null };
        }

        zone.records.delete(dnslinkLabel);

        const newSerial = this.incrementSerial(zone.serial);
        const content = this.buildZoneFile(zone.header, newSerial, zone.records);
        await this.applyZoneChange(tld, content);

        return { success: true, data: null };
      } catch (error) {
        console.error(`[DNS] removeDnslink(${subdomain}.${tld}) failed:`, error.message);
        return { success: false, error: error.message };
      }
    });
  }

  /**
   * Ensure a zone exists for a TLD.
   * If the zone file doesn't exist on host, creates it and registers with BIND.
   */
  async ensureZone(tld) {
    const filePath = join(ZONE_DIR, tld);

    try {
      await access(filePath);
      return { success: true, exists: true };
    } catch {
      // Zone file doesn't exist — create it
    }

    try {
      const serial = this.incrementSerial(null);
      const content = [
        `$TTL ${DEFAULT_TTL}`,
        `@ IN SOA ns1.${tld}. admin.${tld}. (`,
        `    ${serial} ; serial YYYYMMDDNN`,
        `    3600       ; refresh`,
        `    900        ; retry`,
        `    604800     ; expire`,
        `    86400      ; minimum`,
        `)`,
        `@ IN NS ns1.${tld}.`,
        `@ IN NS ns2.${tld}.`,
        `ns1 IN A ${NS_IP}`,
        `ns2 IN A ${NS_IP}`,
        '',
      ].join('\n') + '\n';

      await writeFile(filePath, content, 'utf-8');

      // Pipe into container's tmpfs zone dir
      await this.pipeToContainer(`/dev/shm/named/zones/${tld}`, content);

      // Regenerate auth_zones.inc inside container
      await this.exec([
        `docker exec ${CONTAINER} sh -c '`,
        `cp /dev/null /dev/shm/named/etc/bind/auth_zones.inc;`,
        `cd /dev/shm/named/zones;`,
        `for f in *; do`,
        `  [ "$f" = "ROOT" ] && continue;`,
        `  [ "$f" = "root.mkeys" ] && continue;`,
        `  case "$f" in *.md|CLAUDE*) continue;; esac;`,
        `  echo "zone \\"$f\\" { type primary; file \\"/zones/$f\\"; notify no; };" >> /dev/shm/named/etc/bind/auth_zones.inc;`,
        `done`,
        `'`,
      ].join(' '));

      // Reconfig BIND to pick up new zone
      await this.exec(`docker exec ${CONTAINER} rndc reconfig`);

      console.log(`[DNS] Created new zone for TLD: ${tld}`);
      return { success: true, exists: false };
    } catch (error) {
      console.error(`[DNS] ensureZone(${tld}) failed:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

export const pdnsService = new BindZoneService();
export default pdnsService;
