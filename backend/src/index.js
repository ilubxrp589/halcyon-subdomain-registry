import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config/index.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import routes from './api/routes.js';
import adminRoutes from './api/adminRoutes.js';
import routesV2 from './api/routesV2.js';
import indexerRoutes from './api/indexerRoutes.js';
import hnsWalletRoutes from './api/hnsWalletRoutes.js';
import auctionHouseRoutes from './api/auctionHouseRoutes.js';
import hnsService from './services/hns.js';
import watcherService from './services/watcher.js';
import ftsoService from './services/ftso.js';
import contractListener from './services/contractListener.js';
import stakingListener from './services/stakingListener.js';
import fdcKeeper from './services/fdcKeeper.js';
import artworkQueueV2 from './services/artworkQueueV2.js';
import priceSyncService from './services/priceSync.js';
import expiryCron from './services/expiryCron.js';
import renewalReminder from './services/renewalReminder.js';
import imageCache from './services/imageCache.js';
import emailService from './services/emailService.js';
import hnsSwapService from './services/hnsSwap.js';
import hnsWalletMonitor from './services/hnsWalletMonitor.js';
import auctionScanner from './services/auctionScanner.js';
import escrowFinalizer from './services/escrowFinalizer.js';
import { loggers } from './utils/logger.js';
import { requestId, requestLogger, errorLogger } from './middleware/requestLogger.js';
import sentry from './utils/sentry.js';
// Redis/BullMQ removed

const log = loggers.app;

// Initialize Sentry early (before other code runs)
sentry.init();

const app = express();

// =============================================================
//                       MIDDLEWARE
// =============================================================

// Security - configure helmet to allow cross-origin image loading
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
}));

// CORS - explicit origins only (no wildcards)
const allowedOrigins = config.env === 'production'
  ? [
      'https://halcyon.registry',
      'https://app.halcyon.registry',
      'https://halcyon-names.io',
      'https://halycon-sdr.xyz',
    ]
  : [
      'http://localhost:3000',      // Next.js dev
      'http://localhost:3001',      // Next.js dev (alternate port)
      'http://localhost:3002',      // Alternate port
      'http://localhost:3003',      // Bifrost Clone GUI
      'http://localhost:5173',      // Vite dev
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:5173',
    ];

// Allow Cloudflare tunnels in development
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check explicit allowlist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Cloudflare tunnels in development only
    if (config.env !== 'production' && origin.endsWith('.trycloudflare.com')) {
      return callback(null, true);
    }

    // Reject unknown origins
    log.warn({ origin }, 'CORS blocked origin');
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-API-Key'],
  maxAge: 86400, // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// Rate limiting - general API
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: config.env === 'production' ? 60 : 300, // 300/min in dev, 60/min in prod
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - stricter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 auth attempts per minute
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting - for admin endpoints (relaxed in development)
const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: config.env === 'production' ? 30 : 120, // 30/min in prod, 120/min in dev
  message: { error: 'Rate limit exceeded for admin operations.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters
app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/admin', adminLimiter);
app.use('/api/v1/listener/start', adminLimiter);
app.use('/api/v1/listener/stop', adminLimiter);
app.use('/api/v1/watcher/start', adminLimiter);
app.use('/api/v1/watcher/stop', adminLimiter);
app.use('/api/v1/listener/catchup', adminLimiter);
app.use('/api/v1/price-sync/start', adminLimiter);
app.use('/api/v1/price-sync/stop', adminLimiter);
app.use('/api/v1/price-sync/force', adminLimiter);
app.use('/api', generalLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Static files - serve theme thumbnails and other public assets
// Serves files from /public at /api/v1/static (e.g., /api/v1/static/theme-thumbnails/...)
app.use('/api/v1/static', express.static(path.join(__dirname, '../public/static'), {
  maxAge: '7d', // Cache for 7 days
  immutable: true,
}));

// Sentry request handler (must be first middleware)
app.use(sentry.requestHandler());

// Structured logging with request ID tracking
app.use(requestId());
app.use(requestLogger());

// =============================================================
//                        ROUTES
// =============================================================

// Swagger/OpenAPI documentation
try {
  const swaggerDocument = YAML.load(path.join(__dirname, '../../docs/swagger.yaml'));

  // Custom Swagger UI options
  const swaggerOptions = {
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 30px 0 }
      .swagger-ui .info .title { color: #6366F1 }
    `,
    customSiteTitle: 'HSR API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  };

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerOptions));
  log.info('Swagger UI available at /api/docs');
} catch (err) {
  log.warn({ error: err.message }, 'Swagger documentation not loaded - swagger.yaml may be missing');
}

// API routes
app.use('/api/v1', routes);
app.use('/api/v1', adminRoutes);
app.use('/api/v2', routesV2);
app.use('/api/v2/hns-wallet', hnsWalletRoutes);
app.use('/api/v2/indexer', indexerRoutes);
  app.use('/api/v2/auction-house', auctionHouseRoutes);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'Halcyon Subdomain Registry API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/api/v1/health',
  });
});

// NOTE: 404 and error handlers are registered in start() after Bull Board mount

// =============================================================
//                        STARTUP
// =============================================================

async function start() {
  log.info('='.repeat(60));
  log.info('  Halcyon Subdomain Registry - Backend');
  log.info('='.repeat(60));

  // Initialize image cache
  log.info('Initializing image cache...');
  await imageCache.initCache();
  log.info('Image cache directory ready');

  // Check HNS connection
  log.info('Checking HNS node connection...');
  const hnsStatus = await hnsService.isReady();
  if (hnsStatus.connected) {
    log.info({ height: hnsStatus.height, synced: hnsStatus.synced }, 'HNS node connected');
    if (!hnsStatus.synced) {
      log.warn({ progress: (hnsStatus.progress * 100).toFixed(2) }, 'HNS node is syncing');
    }
  } else {
    log.error({ error: hnsStatus.error }, 'HNS node not connected');
  }

  // Initialize FTSO price oracle
  log.info('Initializing Flare FTSO price oracle...');
  const ftsoStatus = await ftsoService.initialize();
  if (ftsoStatus.success) {
    try {
      const priceData = await ftsoService.getFLRPrice();
      log.info({ price: priceData.price, source: priceData.source }, 'FTSO price fetched');
    } catch (e) {
      log.warn({ error: e.message }, 'Could not fetch initial FTSO price');
    }
  } else {
    log.warn({ error: ftsoStatus.error }, 'FTSO initialization failed, using fallback price');
  }

  // Check owned TLDs
  log.info('Checking owned TLDs...');
  const ownedTLDs = await hnsService.getOwnedTLDs();
  if (ownedTLDs.success && ownedTLDs.tlds.length > 0) {
    log.info({ count: ownedTLDs.tlds.length, tlds: ownedTLDs.tlds.map(t => t.name) }, 'Found owned TLDs');
  } else {
    log.warn('No owned TLDs found');
  }

  // Ensure database connection is ready
  log.info('Connecting to database...');
  try {
    const { query } = await import('./db/index.js');
    await query('SELECT 1');
    log.info('Database connection ready');
  } catch (dbErr) {
    log.error({ error: dbErr.message }, 'Database connection failed');
  }

  // Start watcher service
  log.info('Starting watcher service...');
  watcherService.start(60000);

  // Log propagation status
  watcherService.onStatus((event, data) => {
    if (event === 'propagated') {
      loggers.watcher.info({ tld: data.tld }, 'TLD propagated to all HNS resolvers');
    }
  });

  // Initialize contract event listener
  log.info('Initializing contract event listener...');
  const listenerStatus = await contractListener.initialize();
  if (listenerStatus.success) {
    await contractListener.start();
    log.info('Contract event listener started');
  } else {
    log.warn({ error: listenerStatus.error }, 'Contract listener not available');
  }

  // Initialize v2 staking contract listener
  log.info('Initializing v2 staking contract listener...');
  const stakingStatus = await stakingListener.initialize();
  if (stakingStatus.success) {
    await stakingListener.start();
    log.info('v2 staking contract listener started');
  } else {
    log.warn({ error: stakingStatus.error }, 'v2 staking listener not available');
  }

  // Initialize FDC Keeper Bot (monitors pending FDC claims and submits proofs)
  log.info('Initializing FDC Keeper Bot...');
  const keeperStatus = await fdcKeeper.initialize();
  if (keeperStatus.success) {
    fdcKeeper.start();
    log.info('FDC Keeper Bot started');
  } else {
    log.info({ reason: keeperStatus.error }, 'FDC Keeper Bot not started');
  }

  // Initialize artwork queue for v2 SLD registrations
  // DISABLED: artwork generation paused — re-enable when ready
  // const artworkStatus = await artworkQueueV2.initialize();
  // if (artworkStatus.success) {
  //   artworkQueueV2.start(15000); // Poll every 15s
  //   log.info('ArtworkQueueV2 started (15s polling)');
  // } else {
  //   log.info({ reason: artworkStatus.error }, 'ArtworkQueueV2 not started');
  log.info('ArtworkQueueV2 DISABLED — artwork generation paused');
  if (false) {
  }

  // Price sync service disabled on testnet — MVP uses flat C2FLR pricing via oracle set to $1/FLR
  // To re-enable for mainnet, uncomment the startPriceSync() call below
  log.info('Price sync service DISABLED (testnet flat pricing mode)');
  // await startPriceSync();

  // Initialize expiry cron service
  log.info('Initializing expiry cron service...');
  const expiryCronStatus = await expiryCron.initialize();
  if (expiryCronStatus.success) {
    expiryCron.start(3600000); // Every hour
    log.info('Expiry cron service started (hourly)');
  } else {
    log.warn({ error: expiryCronStatus.error }, 'Expiry cron not available');
  }

  // Initialize renewal reminder service
  log.info('Initializing renewal reminder service...');
  const reminderStatus = await renewalReminder.initialize();
  if (reminderStatus.success) {
    renewalReminder.start(3600000); // Every hour
    log.info('Renewal reminder service started (hourly)');
  } else {
    log.warn({ error: reminderStatus.error }, 'Renewal reminder service not available');
  }

  // Initialize email service
  log.info('Initializing email service...');
  const emailStatus = emailService.initialize();
  if (emailStatus.success) {
    if (emailStatus.enabled) {
      log.info('Email service initialized with Resend');
    } else {
      log.info('Email service disabled (set EMAIL_ENABLED=true to enable)');
    }
  } else {
    log.warn({ error: emailStatus.error }, 'Email service not available');
  }

  // Initialize HNS swap pool wallet
  log.info('Initializing HNS swap pool wallet...');
  try {
    await hnsSwapService.ensureSwapWallet();
    log.info('HNS swap pool wallet ready');
  } catch (err) {
    log.warn({ error: err.message }, 'HNS swap pool wallet not available');
  }

  // Start HNS wallet monitor (auto-TXT on incoming transfers)
  log.info('Starting HNS wallet monitor...');
  try {
    await hnsWalletMonitor.start();
    log.info('HNS wallet monitor started');
  } catch (err) {
    log.warn({ error: err.message }, 'HNS wallet monitor not available');
  }

  // Start auction scanner (indexes Handshake auctions from chain)
  log.info('Starting auction scanner...');
  try {
    await auctionScanner.start();
    log.info('Auction scanner started');
  } catch (err) {
    log.warn({ error: err.message }, 'Auction scanner not available');
  }

  // Start escrow finalizer (processes marketplace escrow state transitions)
  log.info('Starting escrow finalizer...');
  try {
    escrowFinalizer.start();
    log.info('Escrow finalizer started');
  } catch (err) {
    log.warn({ error: err.message }, 'Escrow finalizer not available');
  }

  // Reset API key daily counters at midnight UTC
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() === 0) {
      try {
        const { query: dbQuery } = await import('./db/index.js');
        await dbQuery('UPDATE api_keys SET requests_today = 0 WHERE requests_today > 0');
        log.info('Reset API key daily counters');
      } catch (err) {
        log.error({ err }, 'Failed to reset API key daily counters');
      }
    }
  }, 60000);

  // Refresh tld_stats materialized view every 5 minutes (for /v2/tlds/browse)
  const refreshTldStats = async () => {
    try {
      const { query: dbQuery } = await import('./db/index.js');
      await dbQuery('REFRESH MATERIALIZED VIEW CONCURRENTLY tld_stats');
      log.debug('Refreshed tld_stats materialized view');
    } catch (err) {
      // View may not exist yet if migration hasn't run — not fatal
      if (!err.message?.includes('does not exist')) {
        log.warn({ err }, 'Failed to refresh tld_stats view');
      }
    }
  };
  // Initial refresh on startup, then every 5 minutes
  refreshTldStats();
  setInterval(refreshTldStats, 5 * 60 * 1000);

  // Recalculate auction states every 2 minutes (handles time-based transitions)
  setInterval(() => auctionScanner.recalculateStates(), 2 * 60 * 1000);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Sentry error handler (must be before other error handlers)
  app.use(sentry.errorHandler());

  // Error logging middleware
  app.use(errorLogger());

  // Error response handler
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: config.env === 'production' ? 'Internal server error' : err.message,
      requestId: req.id,
    });
  });

  // Start server
  const server = app.listen(config.port, () => {
    log.info({
      port: config.port,
      env: config.env,
      urls: {
        api: `http://localhost:${config.port}/api/v1`,
        health: `http://localhost:${config.port}/api/v1/health`,
      },
    }, 'Server started');
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      log.warn({ port: config.port }, "Port in use, retrying in 5s...");
      setTimeout(() => { server.close(); server.listen(config.port); }, 5000);
    }
  });
  global.__server = server;
}

start().catch(async (err) => {
  log.fatal({ err }, 'Failed to start server');
  sentry.captureException(err, { context: 'startup' });
  await sentry.flush();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down gracefully');
  stakingListener.stop();
  fdcKeeper.stop();
  artworkQueueV2.stop();
  if (global.__server) global.__server.close();
  await sentry.flush();
  process.exit(0);
});

process.on('uncaughtException', async (err) => {
  log.fatal({ err }, 'Uncaught exception');
  sentry.captureException(err, { context: 'uncaughtException' });
  await sentry.flush();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error({ reason, promise }, 'Unhandled promise rejection');
  sentry.captureException(reason, { context: 'unhandledRejection' });
});
