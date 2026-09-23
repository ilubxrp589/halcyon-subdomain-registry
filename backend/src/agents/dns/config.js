/**
 * DNS Agent Configuration
 *
 * Centralizes all settings for the 3 DNS monitoring modules:
 * - Health Monitor (agent-dns-001)
 * - Prometheus Scraper (agent-dns-002)
 * - Zone Sync Watcher (agent-dns-003)
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const config = {
  port: parseInt(process.env.DNS_AGENT_PORT || '8070'),

  // Database (reuses main backend connection string)
  databaseUrl: process.env.DATABASE_URL || 'postgresql://subdomain_user:REDACTED@localhost:5432/subdomain_registry',

  // Discord webhook for alerts
  discordWebhook: process.env.DNS_DISCORD_WEBHOOK || '',

  // Zone file directory
  zoneDir: process.env.DNS_ZONE_DIR || '/home/localai/volume-resolver-data/auth_zones',

  // Health Monitor settings
  health: {
    intervalMs: 60_000, // 1 minute
    digTimeout: 5,      // seconds
    httpTimeoutMs: 5_000,
    warnAfterFailures: 3,
    criticalAfterFailures: 10,
    retentionDays: 7,
    // Checks to run
    checks: {
      icannDomains: ['google.com', 'cloudflare.com'],
      authSubdomain: { name: 'testzone', expectedIp: '10.0.0.39' },
      dohEndpoint: 'https://dns.halcyon-names.io/resolve?name=google.com&type=A',
      dotHost: '127.0.0.1',
      dotPort: 853,
      jsonApiEndpoint: 'http://127.0.0.1:8054/resolve?name=google.com&type=A',
      hsdPort: 5349,
      hsdTestDomain: 'cryptofans',
      containerName: 'volume-resolver',
    },
  },

  // Prometheus Scraper settings
  prometheus: {
    intervalMs: 60_000, // 1 minute
    httpTimeoutMs: 5_000,
    retentionDays: 7,
    hourlyRetentionDays: 30,
    endpoints: {
      bind: 'http://127.0.0.1:9119/metrics',
      haproxy: 'http://127.0.0.1:8405/metrics',
      // dnsdist web API inside container — may be unreachable due to Docker snap port forwarding
      // The connection resets are expected; scraper degrades gracefully to bind+haproxy only
      dnsdist: {
        url: 'http://127.0.0.1:8083/jsonstat?command=stats',
        apiKey: 'REDACTED',
      },
    },
    // Only scrape these metrics (whitelist)
    whitelist: {
      bind: [
        'bind_incoming_queries_total',
        'bind_responses_total',
        'bind_query_errors_total',
        'bind_resolver_cache_hits',
        'bind_resolver_cache_misses',
        'bind_up',
      ],
      haproxy: [
        'haproxy_frontend_current_sessions',
        'haproxy_frontend_bytes_in_total',
        'haproxy_frontend_bytes_out_total',
        'haproxy_frontend_http_requests_total',
        'haproxy_backend_current_sessions',
        'haproxy_backend_response_time_average_seconds',
        'haproxy_server_status',
      ],
      dnsdist: [
        'queries',
        'responses',
        'servfail-responses',
        'latency-avg100',
        'latency-avg1000',
        'cache-hits',
        'cache-misses',
        'downstream-timeouts',
      ],
    },
  },

  // Zone Sync Watcher settings
  zoneSync: {
    intervalMs: 300_000, // 5 minutes
    alertAfterConsecutiveDrifts: 3,
    retentionDays: 30,
  },
};

export default config;
