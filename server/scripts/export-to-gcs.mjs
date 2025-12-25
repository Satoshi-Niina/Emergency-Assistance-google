#!/usr/bin/env node

/**
 * Knowledge Base データをGoogle Cloud Storageにエクスポートするスクリプト
 * 
 * このスクリプトは以下のフォルダをGCSにアップロードします:
 * - knowledge-base/history/
 * - knowledge-base/manuals/
 * - knowledge-base/temp/
 * - knowledge-base/chat-exports/
 * - knowledge-base/troubleshooting/
 * - knowledge-base/ai-context/
 */

import { Storage } from '@google-cloud/storage';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

// GCS設定
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
const GCS_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;
const GCS_KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// ローカルのknowledge-baseパス
const KNOWLEDGE_BASE_PATH = path.resolve(__dirname, '../../knowledge-base');

// エクスポート対象フォルダ（実際に存在するフォルダのみ）
const EXPORT_FOLDERS = [
    'manuals',
    'temp',
    'chat-exports',
    'troubleshooting',
    'ai-context',
    'chat-history',
];

/**
 * GCSクライアントの初期化
 */
async function initializeGCS() {
    log('\n🔧 Initializing Google Cloud Storage client...', colors.blue);

    if (!GCS_BUCKET_NAME) {
        throw new Error('GOOGLE_CLOUD_STORAGE_BUCKET environment variable is not set');
    }

    log(`  📦 Bucket: ${GCS_BUCKET_NAME}`, colors.cyan);
    log(`  🆔 Project ID: ${GCS_PROJECT_ID || 'Using default credentials'}`, colors.cyan);

    const storageOptions = {};

    if (GCS_PROJECT_ID) {
        storageOptions.projectId = GCS_PROJECT_ID;
    }

    if (GCS_KEY_FILE) {
        try {
            await fs.access(GCS_KEY_FILE);
            storageOptions.keyFilename = GCS_KEY_FILE;
            log(`  🔑 Using service account key file`, colors.cyan);
        } catch {
            log(`  🔑 Using Application Default Credentials (key file not found)`, colors.cyan);
        }
    } else {
        log(`  🔑 Using Application Default Credentials`, colors.cyan);
    }

    const storage = new Storage(storageOptions);
    const bucket = storage.bucket(GCS_BUCKET_NAME);

    log('  ✅ GCS client initialized', colors.green);

    return { storage, bucket };
}

/**
 * ディレクトリが存在するか確認
 */
async function dirExists(dirPath) {
    try {
        const stat = await fs.stat(dirPath);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

/**
 * ディレクトリ内の全ファイルを再帰的に取得
 */
async function getAllFiles(dirPath, baseDir = dirPath) {
    const files = [];

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                const subFiles = await getAllFiles(fullPath, baseDir);
                files.push(...subFiles);
            } else {
                const relativePath = path.relative(baseDir, fullPath);
                files.push({
                    localPath: fullPath,
                    relativePath: relativePath.replace(/\\/g, '/'), // Windowsパスを正規化
                });
            }
        }
    } catch (error) {
        log(`  ⚠️  Warning: Could not read directory ${dirPath}: ${error.message}`, colors.yellow);
    }

    return files;
}

/**
 * ファイルをGCSにアップロード
 */
async function uploadFile(bucket, localPath, gcsPath) {
    try {
        await bucket.upload(localPath, {
            destination: gcsPath,
            metadata: {
                cacheControl: 'public, max-age=31536000',
            },
        });
        return true;
    } catch (error) {
        log(`    ❌ Failed to upload: ${error.message}`, colors.red);
        return false;
    }
}

/**
 * フォルダをGCSにエクスポート
 */
async function exportFolder(bucket, folderName) {
    const localFolderPath = path.join(KNOWLEDGE_BASE_PATH, folderName);

    log(`\n📁 Exporting folder: ${folderName}`, colors.blue);

    // フォルダが存在するか確認
    if (!(await dirExists(localFolderPath))) {
        log(`  ⏭️  Skipped: Folder does not exist`, colors.yellow);
        return { uploaded: 0, failed: 0, skipped: 1 };
    }

    // 全ファイルを取得
    const files = await getAllFiles(localFolderPath);

    if (files.length === 0) {
        log(`  ⏭️  Skipped: No files found`, colors.yellow);
        return { uploaded: 0, failed: 0, skipped: 1 };
    }

    log(`  📊 Found ${files.length} files`, colors.cyan);

    let uploaded = 0;
    let failed = 0;

    // 各ファイルをアップロード
    for (const file of files) {
        const gcsPath = `${folderName}/${file.relativePath}`;
        process.stdout.write(`  ⬆️  Uploading: ${file.relativePath}...`);

        if (await uploadFile(bucket, file.localPath, gcsPath)) {
            process.stdout.write(` ${colors.green}✅${colors.reset}\n`);
            uploaded++;
        } else {
            process.stdout.write(` ${colors.red}❌${colors.reset}\n`);
            failed++;
        }
    }

    log(`  📊 Uploaded: ${uploaded}, Failed: ${failed}`, colors.cyan);

    return { uploaded, failed, skipped: 0 };
}

/**
 * メイン実行
 */
async function main() {
    log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
    log('║  Knowledge Base → GCS Export Tool                    ║', colors.blue);
    log('║  ローカルデータをGoogle Cloud Storageにエクスポート  ║', colors.blue);
    log('╚═══════════════════════════════════════════════════════╝', colors.blue);

    try {
        // GCS初期化
        const { bucket } = await initializeGCS();

        // knowledge-baseフォルダの存在確認
        if (!(await dirExists(KNOWLEDGE_BASE_PATH))) {
            throw new Error(`Knowledge base directory not found: ${KNOWLEDGE_BASE_PATH}`);
        }

        log(`\n📂 Local knowledge base: ${KNOWLEDGE_BASE_PATH}`, colors.cyan);

        // 統計情報
        const stats = {
            totalUploaded: 0,
            totalFailed: 0,
            totalSkipped: 0,
        };

        // 各フォルダをエクスポート
        for (const folderName of EXPORT_FOLDERS) {
            const result = await exportFolder(bucket, folderName);
            stats.totalUploaded += result.uploaded;
            stats.totalFailed += result.failed;
            stats.totalSkipped += result.skipped;
        }

        // サマリー表示
        log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
        log('║  Export Summary                                       ║', colors.blue);
        log('╚═══════════════════════════════════════════════════════╝', colors.blue);
        log(`  ✅ Uploaded: ${stats.totalUploaded} files`, colors.green);
        log(`  ❌ Failed: ${stats.totalFailed} files`, stats.totalFailed > 0 ? colors.red : colors.green);
        log(`  ⏭️  Skipped: ${stats.totalSkipped} folders`, colors.yellow);

        if (stats.totalFailed === 0) {
            log('\n🎉 Export completed successfully!', colors.green);
            log(`\n📦 GCS Bucket: gs://${GCS_BUCKET_NAME}`, colors.cyan);
            log(`🌐 Console: https://console.cloud.google.com/storage/browser/${GCS_BUCKET_NAME}`, colors.cyan);
        } else {
            log('\n⚠️  Export completed with errors', colors.yellow);
            process.exit(1);
        }

    } catch (error) {
        log(`\n❌ Export failed: ${error.message}`, colors.red);
        console.error(error);
        process.exit(1);
    }
}

// 実行
main();
