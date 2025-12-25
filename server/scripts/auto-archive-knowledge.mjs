#!/usr/bin/env node

/**
 * ナレッジデータ自動アーカイブスクリプト
 * 
 * 実行タイミング: 毎日午前2時（推奨）
 * 
 * 処理内容:
 * 1. 30日以上経過したデータを検出
 * 2. ZIPアーカイブを作成
 * 3. GCS temp/archives/ に保存
 * 4. 元ファイルを削除
 */

import { lifecycleService } from '../services/knowledge-lifecycle.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み
dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// カラー出力
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function main() {
    log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
    log('║  Knowledge Data Auto Archive                         ║', colors.blue);
    log('║  ナレッジデータ自動アーカイブ                        ║', colors.blue);
    log('╚═══════════════════════════════════════════════════════╝', colors.blue);

    try {
        // ストレージモード確認
        const storageMode = process.env.STORAGE_MODE || 'local';

        if (storageMode !== 'gcs') {
            log('\n⚠️  Warning: STORAGE_MODE is not set to "gcs"', colors.yellow);
            log('   This script is designed for GCS storage only', colors.yellow);
            process.exit(0);
        }

        log('\n✅ Storage mode: GCS', colors.green);
        log(`📦 Bucket: ${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}`, colors.cyan);

        // ステップ1: 統計情報を取得
        log('\n📊 Step 1: Getting storage statistics...', colors.blue);
        const stats = await lifecycleService.getStorageStats();

        log(`  Total files: ${stats.totalFiles}`, colors.cyan);
        log(`  Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`, colors.cyan);
        log(`  Old files (30+ days): ${stats.oldFiles.length}`, colors.cyan);

        if (stats.oldFiles.length === 0) {
            log('\n✅ No files to archive', colors.green);
            process.exit(0);
        }

        // ステップ2: アーカイブ実行
        log('\n📦 Step 2: Archiving old data...', colors.blue);
        const archiveResult = await lifecycleService.archiveOldData();

        if (archiveResult.success) {
            log(`  ✅ Archived: ${archiveResult.archived} files`, colors.green);
            log(`  🗑️  Deleted: ${archiveResult.deleted} files`, colors.green);
            log(`  📁 Archive path: ${archiveResult.archivePath}`, colors.cyan);
            log(`  📊 Archive size: ${(archiveResult.archiveSize / 1024 / 1024).toFixed(2)} MB`, colors.cyan);
        } else {
            log(`  ⚠️  Archive failed: ${archiveResult.message}`, colors.yellow);
        }

        // ステップ3: 重複データの検出
        log('\n🔍 Step 3: Checking for duplicates...', colors.blue);
        const duplicates = await lifecycleService.findDuplicates();

        if (duplicates.length > 0) {
            log(`  ⚠️  Found ${duplicates.length} duplicate files`, colors.yellow);
            log('  Run "npm run remove-duplicates" to clean up', colors.yellow);
        } else {
            log('  ✅ No duplicates found', colors.green);
        }

        // サマリー
        log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
        log('║  Archive Summary                                      ║', colors.blue);
        log('╚═══════════════════════════════════════════════════════╝', colors.blue);
        log(`  📦 Archived files: ${archiveResult.archived || 0}`, colors.green);
        log(`  🗑️  Deleted files: ${archiveResult.deleted || 0}`, colors.green);
        log(`  📊 Remaining files: ${stats.totalFiles - (archiveResult.deleted || 0)}`, colors.cyan);
        log(`  ⚠️  Duplicates: ${duplicates.length}`, duplicates.length > 0 ? colors.yellow : colors.green);

        log('\n🎉 Auto archive completed successfully!', colors.green);

    } catch (error) {
        log(`\n❌ Auto archive failed: ${error.message}`, colors.red);
        console.error(error);
        process.exit(1);
    }
}

// 実行
main();
