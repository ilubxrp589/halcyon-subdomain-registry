import { ethers } from 'ethers';
import config from '../config/index.js';
import { query } from '../db/index.js';
import { ftsoService } from './ftso.js';
import hnsService from './hns.js';

// In-memory cooldown tracking for sends
const sendCooldowns = new Map(); // key: adminWallet, value: timestamp

const SEND_COOLDOWN_MS = 30000;
const MAX_SEND_FLR = 1000;
const MIN_RESERVE_FLR = 5;

const BALANCE_THRESHOLDS = {
  backend: 50,
  operator: 10,
  treasury: 10,
};

// Contract-related audit_log actions
const CONTRACT_ACTIONS = [
  'dns_confirmed', 'dns_failed', 'price_updated', 'wallet_send_flr',
  'wallet_send_hns', 'domain_registered', 'domain_renewed', 'nft_minted',
  'listing_created', 'listing_cancelled', 'sale_executed', 'escrow_released',
];

function getProvider() {
  return new ethers.JsonRpcProvider(config.flare.rpcUrl);
}

function getBackendWallet(provider) {
  if (!config.flare.privateKey) return null;
  return new ethers.Wallet(config.flare.privateKey, provider);
}

function getOperatorWallet(provider) {
  if (!config.operatorPrivateKey) return null;
  return new ethers.Wallet(config.operatorPrivateKey, provider);
}

function getTreasuryWallet(provider) {
  if (!config.treasuryPrivateKey) return null;
  return new ethers.Wallet(config.treasuryPrivateKey, provider);
}

function getRoyaltiesWallet(provider) {
  if (!config.royaltiesPrivateKey) return null;
  return new ethers.Wallet(config.royaltiesPrivateKey, provider);
}

async function logAction(action, entityType, entityId, adminWallet, details = {}) {
  try {
    await query(
      `INSERT INTO audit_log (action, entity_type, entity_id, actor_wallet, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, entityType, String(entityId), adminWallet, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('walletService logAction error:', e.message);
  }
}

const walletService = {
  // ============================================================
  // READ METHODS
  // ============================================================

  async getAllWalletBalances() {
    const provider = getProvider();
    const wallets = [];

    let flrPriceUSD = 0;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData?.price ?? 0;
    } catch {}

    // 1. Backend wallet
    try {
      const w = getBackendWallet(provider);
      if (w) {
        const bal = await provider.getBalance(w.address);
        const balFLR = parseFloat(ethers.formatEther(bal));
        wallets.push({
          id: 'backend',
          name: 'Backend',
          network: 'FLR',
          address: w.address,
          balance: balFLR,
          balanceUSD: balFLR * flrPriceUSD,
          role: 'DNS confirmations, NFT minting, contract calls',
        });
      }
    } catch (e) {
      wallets.push({ id: 'backend', name: 'Backend', network: 'FLR', address: 'N/A', balance: 0, balanceUSD: 0, role: 'Backend operations', error: e.message });
    }

    // 2. Platform wallet
    try {
      const addr = config.platformWallet;
      if (addr && ethers.isAddress(addr)) {
        const bal = await provider.getBalance(addr);
        const balFLR = parseFloat(ethers.formatEther(bal));
        wallets.push({
          id: 'platform',
          name: 'Platform',
          network: 'FLR',
          address: addr,
          balance: balFLR,
          balanceUSD: balFLR * flrPriceUSD,
          role: 'Revenue collection',
        });
      }
    } catch (e) {
      wallets.push({ id: 'platform', name: 'Platform', network: 'FLR', address: config.platformWallet || 'N/A', balance: 0, balanceUSD: 0, role: 'Revenue collection', error: e.message });
    }

    // 3. Operator wallet
    try {
      const w = getOperatorWallet(provider);
      if (w) {
        const bal = await provider.getBalance(w.address);
        const balFLR = parseFloat(ethers.formatEther(bal));
        wallets.push({
          id: 'operator',
          name: 'Operator',
          network: 'FLR',
          address: w.address,
          balance: balFLR,
          balanceUSD: balFLR * flrPriceUSD,
          role: 'Price oracle updates',
        });
      }
    } catch (e) {
      wallets.push({ id: 'operator', name: 'Operator', network: 'FLR', address: 'N/A', balance: 0, balanceUSD: 0, role: 'Price oracle updates', error: e.message });
    }

    // 4. Treasury wallet
    try {
      const w = getTreasuryWallet(provider);
      const addr = w ? w.address : (config.treasuryAddress || null);
      if (addr && ethers.isAddress(addr)) {
        const bal = await provider.getBalance(addr);
        const balFLR = parseFloat(ethers.formatEther(bal));
        wallets.push({
          id: 'treasury',
          name: 'Treasury',
          network: 'FLR',
          address: addr,
          balance: balFLR,
          balanceUSD: balFLR * flrPriceUSD,
          role: 'Treasury / grace period funds',
        });
      }
    } catch (e) {
      wallets.push({ id: 'treasury', name: 'Treasury', network: 'FLR', address: config.treasuryAddress || 'N/A', balance: 0, balanceUSD: 0, role: 'Treasury', error: e.message });
    }

    // 5. Royalties wallet
    try {
      const w = getRoyaltiesWallet(provider);
      const addr = w ? w.address : (config.royaltiesAddress || null);
      if (addr && ethers.isAddress(addr)) {
        const bal = await provider.getBalance(addr);
        const balFLR = parseFloat(ethers.formatEther(bal));
        wallets.push({
          id: 'royalties',
          name: 'Royalties',
          network: 'FLR',
          address: addr,
          balance: balFLR,
          balanceUSD: balFLR * flrPriceUSD,
          role: 'Marketplace sale royalties',
        });
      }
    } catch (e) {
      wallets.push({ id: 'royalties', name: 'Royalties', network: 'FLR', address: config.royaltiesAddress || 'N/A', balance: 0, balanceUSD: 0, role: 'Marketplace sale royalties', error: e.message });
    }

    // 6. HNS wallet
    try {
      const info = await hnsService.getWalletInfo();
      wallets.push({
        id: 'hns',
        name: 'HNS',
        network: 'HNS',
        address: info.address || 'N/A',
        balance: parseFloat(info.balance) || 0,
        balanceUSD: 0, // HNS price not tracked via FTSO
        role: 'TLD ownership, Handshake operations',
      });
    } catch (e) {
      wallets.push({ id: 'hns', name: 'HNS', network: 'HNS', address: 'N/A', balance: 0, balanceUSD: 0, role: 'Handshake operations', error: e.message });
    }

    return {
      wallets,
      flrPriceUSD,
      timestamp: new Date().toISOString(),
    };
  },

  async getTransactionHistory(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) FROM audit_log WHERE action = ANY($1)`,
      [CONTRACT_ACTIONS]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT id, action, entity_type, entity_id, actor_wallet, details, created_at
       FROM audit_log
       WHERE action = ANY($1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [CONTRACT_ACTIONS, limit, offset]
    );

    const provider = getProvider();
    const transactions = [];

    for (const row of result.rows) {
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
      const txHash = details.txHash || details.tx_hash || null;

      let gasUsed = null;
      let gasCostFLR = null;

      if (txHash) {
        try {
          const receipt = await provider.getTransactionReceipt(txHash);
          if (receipt) {
            gasUsed = Number(receipt.gasUsed);
            const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice;
            if (effectiveGasPrice) {
              gasCostFLR = parseFloat(ethers.formatEther(receipt.gasUsed * effectiveGasPrice));
            }
          }
        } catch {}
      }

      transactions.push({
        id: row.id,
        hash: txHash,
        action: row.action,
        from: row.actor_wallet,
        to: details.to || details.address || row.entity_id,
        value: details.amount || details.value || null,
        gasUsed,
        gasCostFLR,
        timestamp: row.created_at,
        status: 'confirmed',
        method: row.action,
      });
    }

    return {
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getGasSummary(period = '7d') {
    const days = period === '24h' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 7;

    const result = await query(
      `SELECT id, action, details, created_at
       FROM audit_log
       WHERE action = ANY($1) AND created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY created_at DESC`,
      [CONTRACT_ACTIONS]
    );

    const provider = getProvider();
    let totalGasSpentFLR = 0;
    const byDay = {};
    const byMethod = {};

    for (const row of result.rows) {
      const details = typeof row.details === 'string' ? JSON.parse(row.details) : (row.details || {});
      const txHash = details.txHash || details.tx_hash;
      if (!txHash) continue;

      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (!receipt) continue;

        const effectiveGasPrice = receipt.gasPrice || receipt.effectiveGasPrice;
        if (!effectiveGasPrice) continue;

        const gasCostFLR = parseFloat(ethers.formatEther(receipt.gasUsed * effectiveGasPrice));
        totalGasSpentFLR += gasCostFLR;

        const day = new Date(row.created_at).toISOString().split('T')[0];
        byDay[day] = (byDay[day] || 0) + gasCostFLR;

        if (!byMethod[row.action]) byMethod[row.action] = { count: 0, totalGasFLR: 0 };
        byMethod[row.action].count++;
        byMethod[row.action].totalGasFLR += gasCostFLR;
      } catch {}
    }

    let flrPriceUSD = 0;
    try {
      const priceData = await ftsoService.getFLRPrice();
      flrPriceUSD = priceData?.price ?? 0;
    } catch {}

    return {
      totalGasSpentFLR,
      totalGasCostUSD: totalGasSpentFLR * flrPriceUSD,
      period,
      byDay: Object.entries(byDay).map(([date, gasFLR]) => ({ date, gasFLR })).sort((a, b) => a.date.localeCompare(b.date)),
      byMethod,
    };
  },

  async getContractLog(page = 1, limit = 20, action = null) {
    const offset = (page - 1) * limit;
    let countQ, dataQ, params;

    if (action) {
      countQ = `SELECT COUNT(*) FROM audit_log WHERE action = $1`;
      dataQ = `SELECT id, action, entity_type, entity_id, actor_wallet, details, created_at
               FROM audit_log WHERE action = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      params = [action, limit, offset];
      const countResult = await query(countQ, [action]);
      const total = parseInt(countResult.rows[0].count);
      const result = await query(dataQ, params);
      return {
        data: result.rows.map(r => ({
          id: r.id,
          action: r.action,
          txHash: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.txHash || null,
          blockNumber: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.blockNumber || null,
          gasUsed: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.gasUsed || null,
          timestamp: r.created_at,
          details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }

    const countResult = await query(`SELECT COUNT(*) FROM audit_log WHERE action = ANY($1)`, [CONTRACT_ACTIONS]);
    const total = parseInt(countResult.rows[0].count);
    const result = await query(
      `SELECT id, action, entity_type, entity_id, actor_wallet, details, created_at
       FROM audit_log WHERE action = ANY($1) ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [CONTRACT_ACTIONS, limit, offset]
    );

    return {
      data: result.rows.map(r => ({
        id: r.id,
        action: r.action,
        txHash: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.txHash || null,
        blockNumber: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.blockNumber || null,
        gasUsed: (typeof r.details === 'string' ? JSON.parse(r.details) : r.details)?.gasUsed || null,
        timestamp: r.created_at,
        details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getNonceStatus() {
    const provider = getProvider();
    const w = getBackendWallet(provider);
    if (!w) return { address: 'N/A', currentNonce: 0, pendingNonce: 0, hasPendingTx: false, stuck: false };

    const [current, pending] = await Promise.all([
      provider.getTransactionCount(w.address, 'latest'),
      provider.getTransactionCount(w.address, 'pending'),
    ]);

    return {
      address: w.address,
      currentNonce: current,
      pendingNonce: pending,
      hasPendingTx: pending > current,
      stuck: (pending - current) > 5,
    };
  },

  async getBalanceAlerts() {
    const provider = getProvider();
    const alerts = [];

    const checkWallet = async (id, name, addressOrWallet) => {
      const threshold = BALANCE_THRESHOLDS[id];
      if (!threshold || !addressOrWallet) return;

      try {
        const addr = typeof addressOrWallet === 'string' ? addressOrWallet : addressOrWallet.address;
        const bal = await provider.getBalance(addr);
        const balFLR = parseFloat(ethers.formatEther(bal));

        if (balFLR < threshold) {
          alerts.push({
            walletId: id,
            name,
            balance: balFLR,
            threshold,
            severity: balFLR < threshold / 2 ? 'critical' : 'warning',
          });
        }
      } catch {}
    };

    const backendW = getBackendWallet(provider);
    const operatorW = getOperatorWallet(provider);
    const treasuryW = getTreasuryWallet(provider);
    const treasuryAddr = treasuryW ? treasuryW.address : config.treasuryAddress;

    await Promise.all([
      backendW && checkWallet('backend', 'Backend', backendW),
      operatorW && checkWallet('operator', 'Operator', operatorW),
      treasuryAddr && checkWallet('treasury', 'Treasury', treasuryAddr),
    ]);

    return alerts;
  },

  // ============================================================
  // WRITE METHODS
  // ============================================================

  async sendFLR(toAddress, amountFLR, adminWallet, fromWalletId = 'backend') {
    // Validate address
    if (!ethers.isAddress(toAddress)) {
      throw new Error('Invalid recipient address');
    }

    // Validate amount
    const amount = parseFloat(amountFLR);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (amount > MAX_SEND_FLR) {
      throw new Error(`Amount exceeds maximum of ${MAX_SEND_FLR} FLR per send`);
    }

    // Cooldown check
    const lastSend = sendCooldowns.get(adminWallet);
    if (lastSend && Date.now() - lastSend < SEND_COOLDOWN_MS) {
      const remaining = Math.ceil((SEND_COOLDOWN_MS - (Date.now() - lastSend)) / 1000);
      throw new Error(`Cooldown active. Wait ${remaining}s before sending again.`);
    }

    const provider = getProvider();
    let wallet;
    switch (fromWalletId) {
      case 'backend':
        wallet = getBackendWallet(provider);
        break;
      case 'operator':
        wallet = getOperatorWallet(provider);
        break;
      case 'treasury':
        wallet = getTreasuryWallet(provider);
        break;
      case 'royalties':
        wallet = getRoyaltiesWallet(provider);
        break;
      default:
        throw new Error(`Unknown wallet: ${fromWalletId}. Must be backend, operator, treasury, or royalties.`);
    }
    if (!wallet) throw new Error(`${fromWalletId} wallet not configured (no private key)`);

    // Check balance reserve
    const balance = await provider.getBalance(wallet.address);
    const balFLR = parseFloat(ethers.formatEther(balance));
    if (balFLR - amount < MIN_RESERVE_FLR) {
      throw new Error(`Insufficient balance. Must maintain ${MIN_RESERVE_FLR} FLR reserve. Current: ${balFLR.toFixed(4)} FLR`);
    }

    // Send
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(String(amount)),
    });

    const receipt = await tx.wait(2);
    sendCooldowns.set(adminWallet, Date.now());

    await logAction('wallet_send_flr', 'wallet', fromWalletId, adminWallet, {
      txHash: receipt.hash,
      from: wallet.address,
      fromWallet: fromWalletId,
      to: toAddress,
      amount: amount,
      gasUsed: Number(receipt.gasUsed),
    });

    return {
      success: true,
      txHash: receipt.hash,
      from: wallet.address,
      to: toAddress,
      amount,
      gasUsed: Number(receipt.gasUsed),
    };
  },

  async sendHNS(toAddress, amountHNS, adminWallet) {
    if (!toAddress || typeof toAddress !== 'string') {
      throw new Error('Invalid recipient address');
    }

    const amount = parseFloat(amountHNS);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Cooldown check
    const lastSend = sendCooldowns.get(adminWallet + '_hns');
    if (lastSend && Date.now() - lastSend < SEND_COOLDOWN_MS) {
      const remaining = Math.ceil((SEND_COOLDOWN_MS - (Date.now() - lastSend)) / 1000);
      throw new Error(`Cooldown active. Wait ${remaining}s before sending again.`);
    }

    // Use hnsService wallet client to send
    const result = await hnsService.sendHNS(toAddress, amount);
    sendCooldowns.set(adminWallet + '_hns', Date.now());

    await logAction('wallet_send_hns', 'wallet', 'hns', adminWallet, {
      txHash: result.hash || null,
      to: toAddress,
      amount,
    });

    return {
      success: true,
      txHash: result.hash || null,
      from: 'HNS Primary Wallet',
      to: toAddress,
      amount,
    };
  },
};

export default walletService;
