import express from 'express';
import { HEALTH_TOKEN, NODE_ENV, VERSION, DATABASE_URL, PG_SSL } from '../config/env.mjs';
import { dbPool } from '../infra/db.mjs';

const router = express.Router();

const ok = (_req, res) => res.status(200).send('ok');

// Simple health checks
router.get('/', (_req, res) => res.status(200).json({ status: 'ok' }));
router.get('/ping', ok);

// Detailed health check
router.get('/detailed', (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        status: 'timeout',
        message: 'Health check timed out',
        timestamp: new Date().toISOString()
      });
    }
  }, 10000);

  res.on('finish', () => clearTimeout(timeout));

  const healthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: VERSION,
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    },
    node_version: process.version,
    platform: process.platform,
    pid: process.pid
  };

  if (dbPool) {
    healthResponse.database_status = 'pool_available';
  } else {
    healthResponse.database_status = 'not_initialized';
  }

  healthResponse.database_env = {
    DATABASE_URL: !!DATABASE_URL,
    PG_SSL: PG_SSL || 'not_set'
  };

  // Azure BLOB Storageは使用しない（GCSまたはローカルストレージ）
  healthResponse.storage_mode = process.env.STORAGE_MODE || 'local';

  res.status(200).json(healthResponse);
});

// Full health check (async)
router.get('/full', async (req, res) => {
  const status = {
    service: 'Emergency Assistance API',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown',
      blobStorage: 'unknown'
    }
  };

  // DB Check
  if (dbPool) {
    try {
      await dbPool.query('SELECT 1');
      status.checks.database = 'ok';
    } catch (e) {
      status.checks.database = `error: ${e.message}`;
    }
  } else {
    status.checks.database = 'not_configured';
  }

  // Storage Check
  status.checks.storage = process.env.STORAGE_MODE || 'local';

  res.json(status);
});

export default function registerHealthRoutes(app) {
  // Root level routes
  app.get('/live', ok);
  app.get('/ready', (req, res) => {
    if (HEALTH_TOKEN && req.headers['x-health-token'] !== HEALTH_TOKEN) {
      return res.status(401).json({ status: 'unauthorized' });
    }
    const essentials = ['NODE_ENV'];
    const missing = essentials.filter(k => !process.env[k]);
    const ready = missing.length === 0;
    res.status(200).json({
      status: ready ? 'ok' : 'degraded',
      missing,
      timestamp: new Date().toISOString()
    });
  });
  app.get('/ping', ok);
  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  // API routes
  app.use('/api/health', router);
  app.get('/api/ping', ok);
  app.get('/api/ping/detailed', (req, res) => {
    res.json({
      ping: 'pong',
      timestamp: new Date().toISOString(),
      service: 'Emergency Assistance Backend (Azure)'
    });
  });
}
