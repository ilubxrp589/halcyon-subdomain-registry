# HSR API Proxy Security Audit

**Date:** 2026-02-08
**Scope:** Frontend catch-all proxy (`/api/proxy/[...path]/route.ts`) and backend admin route authentication

## Executive Summary

Audit of the HSR frontend-to-backend API proxy identified **10 admin endpoints** with **no authentication middleware** that were accessible to unauthenticated users. These included infrastructure monitoring routes (SSH to remote machines, GPU stats), service control endpoints, and system diagnostics.

All 10 endpoints have been secured with `adminReadOnly` (signature-based) authentication and converted from GET to POST to match the existing authenticated admin API pattern.

## Proxy Architecture

```
Browser -> Next.js Frontend (port 3000)
              -> /api/proxy/[...path] -> Backend (localhost:8000/api/v1/*)
```

The proxy whitelists path prefixes:
- Public: `health`, `search`, `resolve`, `register`, `share`, etc.
- Admin (backend-enforced auth): `admin`, `listener`, `watcher`, `price-sync`

## Findings & Fixes

### Fixed: Unprotected Admin Endpoints

| # | Route (before -> after) | File | Risk | Fix |
|---|------------------------|------|------|-----|
| 1 | `GET -> POST /admin/tlds/:id` | adminRoutes.js:263 | Exposes TLD configuration data | Added `adminReadOnly` |
| 2 | `GET -> POST /admin/remote-processes` | adminRoutes.js:1180 | **HIGH** - Enumerates processes on remote machines via SSH | Added `adminReadOnly` |
| 3 | `GET -> POST /admin/infra/remote-gpus` | adminRoutes.js:1453 | **HIGH** - SSH to remote machines, exposes GPU infrastructure | Added `adminReadOnly` |
| 4 | `GET -> POST /admin/infra/local-gpus` | adminRoutes.js:1488 | Runs nvidia-smi, exposes local GPU hardware info | Added `adminReadOnly` |
| 5 | `GET -> POST /admin/gpu/monitor` | adminRoutes.js:1943 | Full GPU monitoring dashboard data (ComfyUI, VRAM, jobs) | Added `adminReadOnly` |
| 6 | `GET -> POST /diagnostics` | adminRoutes.js:1557 | System diagnostics (services, DB, blockchain status) | Added `adminReadOnly` |
| 7 | `GET -> POST /diagnostics/:section` | adminRoutes.js:1571 | Per-section diagnostics | Added `adminReadOnly` |
| 8 | `GET -> POST /admin/parallel-demo/prompts` | routes.js:7296 | Demo prompt data | Added `auth.verifyAdminReadAuth` |
| 9 | `GET -> POST /admin/parallel-demo/status/:id` | routes.js:7540 | Demo session status | Added `auth.verifyAdminReadAuth` |
| 10 | `GET -> POST /admin/parallel-demo/gpu-stats` | routes.js:7573 | GPU stats during demo | Added `auth.verifyAdminReadAuth` |

### Initial Assessment Correction

`POST /admin/hns/start` was initially flagged as unprotected. On inspection, it already had `adminAuth` middleware (line 518) — a debug logging middleware before it made it appear unprotected at first glance.

### Mitigating Factor: Diagnostics Proxy Bypass

The `/diagnostics` endpoint was NOT in the frontend proxy whitelist (`ALLOWED_PATH_PREFIXES`), meaning it was only accessible directly on port 8000, not through the frontend. Auth was still added as defense-in-depth.

## Auth Middleware Reference

| Middleware | Method | Auth Type | Use Case |
|-----------|--------|-----------|----------|
| `adminAuth` | POST | Wallet + nonce-based signature + audit log | Write operations (start/stop services, modify data) |
| `adminReadOnly` | POST | Wallet + timestamp-based signature | Read operations (status, stats, listings) |
| `auth.verifyWallet` | POST | Wallet + nonce-based signature | User ownership verification |
| _(none)_ | GET/POST | None | Public endpoints (health, search, resolve) |

## Route Security Matrix

### Public Endpoints (No Auth) - Correct

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | API health check |
| `/hns/status` | GET | HNS node sync status |
| `/search` | POST | Domain search/availability |
| `/resolve/:name` | GET | DNS resolution |
| `/domains/:name/dns` | GET | DNS records |
| `/domains/:name/profile` | GET | Public domain profile |

### Admin Read Endpoints (adminReadOnly) - All Secured

| Route | Method | Purpose |
|-------|--------|---------|
| `/admin/status` | POST | System status |
| `/admin/domains` | POST | Domain listing |
| `/admin/tlds/list` | POST | TLD listing |
| `/admin/tlds/:id` | POST | Single TLD details |
| `/admin/audit` | POST | Audit log |
| `/admin/reserved/list` | POST | Reserved words |
| `/admin/db/stats` | POST | Database stats |
| `/admin/db/pending` | POST | Pending purchases |
| `/admin/pricing/compare` | POST | Price comparison |
| `/admin/remote-processes` | POST | Remote machine processes |
| `/admin/infra/remote-gpus` | POST | Remote GPU stats |
| `/admin/infra/local-gpus` | POST | Local GPU stats |
| `/admin/gpu/monitor` | POST | Combined GPU monitoring |
| `/diagnostics` | POST | System diagnostics |
| `/diagnostics/:section` | POST | Section diagnostics |
| `/admin/parallel-demo/prompts` | POST | Demo prompts |
| `/admin/parallel-demo/status/:id` | POST | Demo session status |
| `/admin/parallel-demo/gpu-stats` | POST | Demo GPU stats |
| `/listener/stats` | POST | Contract listener stats |

### Admin Write Endpoints (adminAuth) - All Secured

| Route | Method | Purpose |
|-------|--------|---------|
| `/admin/verify` | POST | Admin verification |
| `/listener/start` | POST | Start contract listener |
| `/listener/stop` | POST | Stop contract listener |
| `/admin/domains/:id/status` | PUT | Update domain status |
| `/admin/tlds` | POST | Create TLD |
| `/admin/tlds/sync` | POST | Sync TLDs from wallet |
| `/admin/tlds/:id` | PUT | Update TLD |
| `/admin/reserved` | POST | Add reserved word |
| `/admin/reserved/:word` | DELETE | Remove reserved word |
| `/admin/hns/start` | POST | Start HNS node |
| `/admin/hns/stop` | POST | Stop HNS node |
| `/admin/parallel-demo/start` | POST | Start parallel demo |
| `/admin/parallel-demo/stop` | POST | Stop parallel demo |

## Files Modified

1. **`backend/src/api/adminRoutes.js`** - Added `adminReadOnly` to 7 routes, converted GET->POST
2. **`backend/src/api/routes.js`** - Added `auth.verifyAdminReadAuth` to 3 parallel-demo routes, converted GET->POST
3. **`frontend/services/adminApi.ts`** - Updated 8 functions from `api.get()` to `api.post()` with `ReadAuthCredentials`
4. **`frontend/app/admin/gpu/page.tsx`** - Added credentials to `getGPUMonitor()` call
5. **`frontend/app/admin/pm2/page.tsx`** - Added credentials to `getRemoteProcesses()` call
6. **`frontend/app/admin/parallel/page.tsx`** - Added credentials to 3 parallel-demo API calls
7. **`frontend/app/docs/api/page.tsx`** - Updated diagnostics endpoint documentation

## Verification

All 10 fixed endpoints tested with unauthenticated curl requests:
- GET requests return **404** (method no longer exists)
- POST requests without credentials return **401** with `"Authentication required"`
- Public endpoints (`/health`, `/search`) continue to work without auth
