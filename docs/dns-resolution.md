# DNS & Name Resolution

## Overview

HSR handles two types of resolution:
1. **Traditional DNS** — volume-resolver (BIND 9.20 + dnsdist) serves DNS records (A, AAAA, CNAME, TXT, MX) for subdomains
2. **On-chain resolution** — HSRResolver smart contract maps subdomains to Flare wallet addresses

## DNS Infrastructure (volume-resolver)

### Architecture

```
Client query
    │
    ▼
Caddy (port 443) ─── DoH endpoint: dns.halcyon-names.io/dns-query
    │
    ▼
haproxy (port 80, inside container)
    │
    ├── /dns-query → dnsdist DoH (port 800) → BIND (port 5300)
    └── other → static content

BIND 9.20 (port 5300)
    ├── Own authoritative zones (testzone, cryptomusic, cryptofans, etc.)
    └── Handshake TLDs → root_proxy (127.2.0.x) → hsd (10.0.0.39:5349)
```

### Components

| Component | Role | Port |
|-----------|------|------|
| **BIND 9.20** | Authoritative + recursive DNS server | 5300 (container) |
| **dnsdist 1.9** | DNS load balancer + DoH frontend | 800 (container) |
| **root_proxy** | Bridges BIND to hsd for Handshake resolution | 127.2.0.x (container) |
| **haproxy** | HTTP routing inside container | 80 (container) |
| **Caddy** | TLS termination, reverse proxy | 443 (host) |
| **hsd** | Handshake full node | 5349 (host) |

### Docker Container

The DNS stack runs in a single Docker container (`jamesstevens/handshake-volume-resolver`):

```bash
# Check container status
docker ps | grep volume-resolver

# View BIND logs
docker exec volume-resolver tail -f /var/log/named/default.log

# Reload zones after changes
docker exec volume-resolver rndc reload
```

### Own Authoritative Zones

HSR-controlled TLDs with custom zone files configured in `auth_zones.inc`:
- testzone, cryptomusic, aisoftwaredesign, aiworktools
- cryptodnd, cryptofans, nflapps, sexyness

When a subdomain is registered, its DNS records are added to the appropriate zone file and BIND reloads the zone.

### DoH & JSON API

- **DoH (wire format):** `https://dns.halcyon-names.io/dns-query` — RFC 8484
- **JSON API:** `https://dns.halcyon-names.io/resolve?name=DOMAIN&type=A` — Google DNS-compatible
- **JSON API service:** `/home/localai/dns-json-api.py` (systemd: `dns-json-api`, port 8054)
- **Caddy config:** `/etc/caddy/Caddyfile`

### DNS Query Flow

```
1. Query arrives: "wallet.cryptofans"
2. If via DoH: Caddy → haproxy → dnsdist → BIND
3. BIND checks if cryptofans is an authoritative zone
4. If yes: returns records from zone file
5. If no (third-party Handshake TLD): BIND → root_proxy → hsd → resolve
6. Response returned to client
```

### User Record Management

Subdomain owners can modify their DNS records through the HSR dashboard:
- Add/edit/delete A, AAAA, CNAME, TXT, MX records
- Changes trigger zone file update + BIND reload
- Ownership verified via NFT — only the token holder can modify records

### Important Config Notes

- **hsd config:** `/home/localai/.hsd/hsd.conf` — must have `no-sig0: true` (BIND 9.20 rejects SIG0)
- **UFW rule:** `ufw allow from 172.17.0.0/16 to any port 5349` — container → hsd access
- **Chrome DoH:** Single-label domains (no dots) bypass DoH — use `www.testzone` not `testzone`
- **Self-signed TLS:** Caddy uses `tls internal` for `*.testzone`, `*.cryptomusic` etc.

## Handshake Node (hsd)

- Full hsd node for TLD ownership verification AND recursive Handshake resolution
- Managed via PM2: `pm2 restart halcyon-hsd`
- Listens on port 5349 for DNS queries from the volume-resolver container
- REST API on port 12037 for name lookups

### Key Commands

```bash
hsd-cli info                    # Node status
hsd-cli rpc getnameinfo <name>  # Look up a TLD
pm2 status halcyon-hsd          # Process status
```

## On-Chain Resolution (HSRResolver)

Separate from DNS — this maps subdomains to Flare wallet addresses on-chain.

### Forward Resolution
```
"wallet.cryptofans" → 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18
```

### Reverse Resolution
```
0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18 → "wallet.cryptofans"
```

### How It Works
- HSRResolver contract stores name → address mappings
- Subdomain owner calls `setRecord()` to set their Flare address
- Reverse records set via `setName()` — must be done explicitly by the owner
- Read by the Resolver SDK, wallets, and dApps

## Important Notes

- volume-resolver (BIND) handles traditional DNS (website resolution)
- HSRResolver handles wallet/blockchain resolution (send FLR to a name)
- Both should be updated when a subdomain is registered
- Default TTL: 300 seconds
- Cloudflare sits in front for CDN and DDoS protection
