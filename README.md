# Halcyon Subdomain Registry

NFT-based subdomain marketplace on Flare Network with Handshake (HNS) integration.

**"Own your corner of the decentralized web"**

## Overview

Halcyon allows users to register subdomains on Handshake TLDs (starting with `.cryptofans`), with ownership represented as ERC-721 NFTs on Flare Network.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Web3Modal/WalletConnect v2
- **Backend**: Node.js, Express, PostgreSQL
- **Smart Contracts**: Solidity 0.8.20, Hardhat, OpenZeppelin
- **DNS**: Handshake (HNS) full node integration

## Project Structure

```
halcyon/
├── contracts/          # Solidity smart contracts
│   ├── src/           # Contract source files
│   ├── scripts/       # Deployment scripts
│   └── test/          # Contract tests
├── backend/           # Node.js API server
│   ├── src/
│   │   ├── api/       # Express routes
│   │   ├── services/  # HNS integration, etc.
│   │   ├── db/        # PostgreSQL models
│   │   └── config/    # Configuration
│   └── package.json
├── frontend/          # Next.js frontend
│   ├── app/           # App router pages
│   ├── components/    # React components
│   ├── lib/           # Utilities
│   └── services/      # API client
└── package.json       # Root package.json
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- HNS node running (mainnet, port 12037)

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Configure Environment

```bash
# Contracts
cp contracts/.env.example contracts/.env
# Edit with your private key and addresses

# Backend
cp backend/.env.example backend/.env
# Edit with database URL and HNS config

# Frontend
cp frontend/.env.example frontend/.env.local
# Edit with WalletConnect project ID
```

### 3. Deploy Contracts (Coston2 Testnet)

```bash
cd contracts
npm run deploy:coston2
```

Save the deployed addresses to your `.env` files.

### 4. Setup Database

```bash
cd backend
npm run db:migrate
```

### 5. Start Services

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000

## Smart Contracts

| Contract | Description |
|----------|-------------|
| `SubdomainNFT` | ERC-721 NFT with EIP-2981 royalties (2.5%) |
| `SubdomainEscrow` | Holds FLR until DNS verification |
| `DNSOracle` | Verifies HNS DNS registration |
| `PriceOracle` | FLR/USD price feed |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/tlds` | List available TLDs |
| GET | `/api/v1/search` | Check subdomain availability |
| GET | `/api/v1/pricing` | Get pricing tiers |
| GET | `/api/v1/stats` | Registry statistics |
| GET | `/api/v1/domains/:fqdn` | Get domain details |
| GET | `/api/v1/domains/owner/:wallet` | Get domains by owner |

## Pricing Tiers

| Tier | Characters | Price (USD) | Price (FLR)* |
|------|------------|-------------|--------------|
| Ultra Premium | 1 | $500 | 10,000 |
| Premium | 2 | $200 | 4,000 |
| Standard Plus | 3 | $50 | 1,000 |
| Standard | 4+ | $10 | 200 |

*Assuming $0.05/FLR

## HNS Node Configuration

The backend connects to your local HNS node:

```yaml
host: localhost
port: 12037 (HTTP RPC)
wallet_port: 12039
api_key: your_api_key
```

## Development

### Run Tests

```bash
# Contract tests
cd contracts && npm test

# Backend tests (coming soon)
cd backend && npm test
```

### Build for Production

```bash
# Frontend
cd frontend && npm run build

# Contracts
cd contracts && npm run compile
```

## License

MIT
