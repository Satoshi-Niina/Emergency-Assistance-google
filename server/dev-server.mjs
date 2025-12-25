#!/usr/bin/env node
// 改良版ローカル開発サーバー
// src/app.mjsをベースに、Viteプロキシと開発機能を追加

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Azure App Service環境の検出と対応
const isAzure = !!process.env.WEBSITE_SITE_NAME;
let rootDir;

if (isAzure) {
  // Azure環境: /home/site/wwwroot がルート
  rootDir = '/home/site/wwwroot';
} else {
  // ローカル環境: server/の親ディレクトリがルート
  rootDir = resolve(__dirname, '..');
}

// カレントディレクトリをルートに変更
process.chdir(rootDir);
console.log('  Working directory set to:', process.cwd());

import { createApp } from './src/app.mjs';
import { PORT as DEFAULT_PORT } from './src/config/env.mjs';
import { initializeDatabase, ensureTables } from './src/infra/db.mjs';
// Azure Blob関連のインポートは削除済み（GCS専用）
import { spawn } from 'child_process';

const PORT = process.env.PORT || DEFAULT_PORT || 8080;
const VITE_PORT = 5174;

console.log('🚀 Starting Local Development Server...');
console.log(`📊 Environment: development`);
console.log(`🔧 API Port: ${PORT}`);
console.log(`⚡ Vite Port: ${VITE_PORT}`);

async function startupSequence() {
  console.log('🔄 Running startup sequence...');
  
  // Database - CRITICAL
  try {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  Database Initialization');
    console.log('═══════════════════════════════════════');
    
    const dbInitialized = initializeDatabase();
    if (!dbInitialized) {
      console.error('❌ CRITICAL: Database initialization failed');
      console.error('❌ Application cannot start without database');
      console.error('❌ Please check:');
      console.error('   1. DATABASE_URL is set in .env file');
      console.error('   2. PostgreSQL server is running');
      console.error('   3. Database credentials are correct');
      process.exit(1);
    }
    
    console.log('✅ Database pool initialized');
    
    // Wait for actual connection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await ensureTables();
    console.log('✅ Database tables verified');
    console.log('✅ Database ready for authentication');
    console.log('');
  } catch (err) {
    console.error('❌ CRITICAL: Database setup error:', err.message);
    console.error('❌ Stack:', err.stack);
    console.error('❌ Application cannot continue without database');
    process.exit(1);
  }

  // Azure Blob Storage は使用しません（GCS専用システム）
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  Storage: Google Cloud Storage (GCS)');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Storage Mode: ${process.env.STORAGE_MODE || 'local'}`);
  if (process.env.STORAGE_MODE === 'gcs') {
    console.log(`✅ GCS Bucket: ${process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'Not configured'}`);
  }
  console.log('');
}

(async () => {
  try {
    // Expressアプリ作成（src/app.mjsを使用）
    const app = await createApp();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════╗');
      console.log('║   🚀 Local Development Server Started!          ║');
      console.log('╠═══════════════════════════════════════════════════╣');
      console.log(`║   📡 API:      http://localhost:${PORT}          ║`);
      console.log(`║   ⚡ Frontend: http://localhost:${VITE_PORT}         ║`);
      console.log(`║   🔥 Hot Reload: Enabled                        ║`);
      console.log('╚═══════════════════════════════════════════════════╝');
      console.log('');
      console.log('✨ Using modular API structure (src/api/*)');
      console.log('✨ Same as production environment');
      console.log('');
      
      startupSequence().catch(err => {
        console.error('❌ Startup sequence error:', err);
      });
    });

    // Graceful Shutdown
    const shutdown = (sig) => () => {
      console.log(`\n🛑 Received ${sig}, shutting down...`);
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown('SIGTERM'));
    process.on('SIGINT', shutdown('SIGINT'));

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
})();
