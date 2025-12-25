#!/usr/bin/env node

/**
 * Knowledge Base 構造マイグレーションスクリプト
 * 
 * 旧構造:
 * - knowledge-base/history/*.json
 * - knowledge-base/exports/*.json
 * - knowledge-base/images/chat-exports/*.png
 * - knowledge-base/troubleshooting/*.json
 * - knowledge-base/manuals/
 * 
 * 新構造:
 * - knowledge-base/chat-exports/json/*.json
 * - knowledge-base/chat-exports/images/*.png
 * - knowledge-base/troubleshooting/flows/*.json
 * - knowledge-base/ai-training/manuals/
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ベースパス
const BASE_PATH = path.join(process.cwd(), 'knowledge-base');

// 旧構造パス
const OLD_PATHS = {
  history: path.join(BASE_PATH, 'history'),
  exports: path.join(BASE_PATH, 'exports'),
  chatExportImages: path.join(BASE_PATH, 'images', 'chat-exports'),
  troubleshooting: path.join(BASE_PATH, 'troubleshooting'),
  manuals: path.join(BASE_PATH, 'manuals'),
};

// 新構造パス
const NEW_PATHS = {
  chatExportsJson: path.join(BASE_PATH, 'chat-exports', 'json'),
  chatExportsImages: path.join(BASE_PATH, 'chat-exports', 'images'),
  troubleshootingFlows: path.join(BASE_PATH, 'troubleshooting', 'flows'),
  troubleshootingImages: path.join(BASE_PATH, 'troubleshooting', 'images'),
  aiTrainingManuals: path.join(BASE_PATH, 'ai-training', 'manuals'),
  aiTrainingFaqs: path.join(BASE_PATH, 'ai-training', 'faqs'),
  aiTrainingKnowledge: path.join(BASE_PATH, 'ai-training', 'knowledge'),
  vectors: path.join(BASE_PATH, 'vectors'),
  vectorsEmbeddings: path.join(BASE_PATH, 'vectors', 'embeddings'),
  vectorsIndexes: path.join(BASE_PATH, 'vectors', 'indexes'),
  temp: path.join(BASE_PATH, 'temp'),
  tempUploads: path.join(BASE_PATH, 'temp', 'uploads'),
  backups: path.join(BASE_PATH, 'backups'),
};

// カラー出力
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
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
 * ファイルをコピー
 */
async function copyFile(src, dest) {
  try {
    await fs.copyFile(src, dest);
    return true;
  } catch (error) {
    log(`  ❌ Failed to copy: ${src} -> ${dest}`, colors.red);
    log(`     Error: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * 新構造のディレクトリを作成
 */
async function createNewDirectories() {
  log('\n📁 Creating new directory structure...', colors.blue);
  
  for (const [name, dirPath] of Object.entries(NEW_PATHS)) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      log(`  ✅ Created: ${dirPath}`, colors.green);
    } catch (error) {
      log(`  ❌ Failed to create: ${dirPath}`, colors.red);
      log(`     Error: ${error.message}`, colors.red);
    }
  }
}

/**
 * チャットエクスポートJSONを移行
 */
async function migrateChatExportsJson() {
  log('\n📦 Migrating chat export JSON files...', colors.blue);
  
  let totalMigrated = 0;
  
  // history/からの移行
  if (await dirExists(OLD_PATHS.history)) {
    log(`  📂 Migrating from: ${OLD_PATHS.history}`, colors.yellow);
    const files = await fs.readdir(OLD_PATHS.history);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const src = path.join(OLD_PATHS.history, file);
      const dest = path.join(NEW_PATHS.chatExportsJson, file);
      
      if (await copyFile(src, dest)) {
        log(`  ✅ ${file}`, colors.green);
        totalMigrated++;
      }
    }
  }
  
  // exports/からの移行
  if (await dirExists(OLD_PATHS.exports)) {
    log(`  📂 Migrating from: ${OLD_PATHS.exports}`, colors.yellow);
    const files = await fs.readdir(OLD_PATHS.exports);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const src = path.join(OLD_PATHS.exports, file);
      const dest = path.join(NEW_PATHS.chatExportsJson, file);
      
      // 既に存在する場合はスキップ
      try {
        await fs.access(dest);
        log(`  ⏭️  Skipped (already exists): ${file}`, colors.yellow);
        continue;
      } catch {
        // ファイルが存在しない場合は続行
      }
      
      if (await copyFile(src, dest)) {
        log(`  ✅ ${file}`, colors.green);
        totalMigrated++;
      }
    }
  }
  
  log(`\n  📊 Total migrated: ${totalMigrated} files`, colors.blue);
}

/**
 * チャットエクスポート画像を移行
 */
async function migrateChatExportsImages() {
  log('\n🖼️  Migrating chat export images...', colors.blue);
  
  let totalMigrated = 0;
  
  if (await dirExists(OLD_PATHS.chatExportImages)) {
    log(`  📂 Migrating from: ${OLD_PATHS.chatExportImages}`, colors.yellow);
    const files = await fs.readdir(OLD_PATHS.chatExportImages);
    
    for (const file of files) {
      const src = path.join(OLD_PATHS.chatExportImages, file);
      const dest = path.join(NEW_PATHS.chatExportsImages, file);
      
      if (await copyFile(src, dest)) {
        log(`  ✅ ${file}`, colors.green);
        totalMigrated++;
      }
    }
  }
  
  log(`\n  📊 Total migrated: ${totalMigrated} files`, colors.blue);
}

/**
 * トラブルシューティングフローを移行
 */
async function migrateTroubleshootingFlows() {
  log('\n🔧 Migrating troubleshooting flows...', colors.blue);
  
  let totalMigrated = 0;
  
  if (await dirExists(OLD_PATHS.troubleshooting)) {
    log(`  📂 Migrating from: ${OLD_PATHS.troubleshooting}`, colors.yellow);
    const files = await fs.readdir(OLD_PATHS.troubleshooting);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const src = path.join(OLD_PATHS.troubleshooting, file);
      const dest = path.join(NEW_PATHS.troubleshootingFlows, file);
      
      if (await copyFile(src, dest)) {
        log(`  ✅ ${file}`, colors.green);
        totalMigrated++;
      }
    }
  }
  
  log(`\n  📊 Total migrated: ${totalMigrated} files`, colors.blue);
}

/**
 * マニュアルを移行
 */
async function migrateManuals() {
  log('\n📚 Migrating manuals...', colors.blue);
  
  let totalMigrated = 0;
  
  if (await dirExists(OLD_PATHS.manuals)) {
    log(`  📂 Migrating from: ${OLD_PATHS.manuals}`, colors.yellow);
    
    // マニュアルディレクトリ全体をコピー
    const entries = await fs.readdir(OLD_PATHS.manuals, { withFileTypes: true });
    
    for (const entry of entries) {
      const src = path.join(OLD_PATHS.manuals, entry.name);
      const dest = path.join(NEW_PATHS.aiTrainingManuals, entry.name);
      
      if (entry.isDirectory()) {
        // ディレクトリをコピー
        try {
          await fs.cp(src, dest, { recursive: true });
          log(`  ✅ Copied directory: ${entry.name}`, colors.green);
          totalMigrated++;
        } catch (error) {
          log(`  ❌ Failed to copy directory: ${entry.name}`, colors.red);
          log(`     Error: ${error.message}`, colors.red);
        }
      } else {
        // ファイルをコピー
        if (await copyFile(src, dest)) {
          log(`  ✅ ${entry.name}`, colors.green);
          totalMigrated++;
        }
      }
    }
  }
  
  log(`\n  📊 Total migrated: ${totalMigrated} items`, colors.blue);
}

/**
 * バックアップを作成
 */
async function createBackup() {
  log('\n💾 Creating backup of old structure...', colors.blue);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const backupDir = path.join(NEW_PATHS.backups, `migration-${timestamp}`);
  
  try {
    await fs.mkdir(backupDir, { recursive: true });
    
    // 旧ディレクトリをバックアップ
    for (const [name, oldPath] of Object.entries(OLD_PATHS)) {
      if (await dirExists(oldPath)) {
        const backupPath = path.join(backupDir, name);
        await fs.cp(oldPath, backupPath, { recursive: true });
        log(`  ✅ Backed up: ${name}`, colors.green);
      }
    }
    
    log(`\n  📦 Backup created at: ${backupDir}`, colors.blue);
  } catch (error) {
    log(`  ❌ Backup failed: ${error.message}`, colors.red);
  }
}

/**
 * サマリーを表示
 */
async function showSummary() {
  log('\n📊 Migration Summary', colors.blue);
  log('═══════════════════════════════════════', colors.blue);
  
  for (const [name, dirPath] of Object.entries(NEW_PATHS)) {
    try {
      const files = await fs.readdir(dirPath);
      log(`  ${name}: ${files.length} items`, colors.green);
    } catch {
      log(`  ${name}: (directory not accessible)`, colors.yellow);
    }
  }
  
  log('\n✅ Migration completed successfully!', colors.green);
  log('\n⚠️  Important:', colors.yellow);
  log('  1. 旧ディレクトリはバックアップフォルダに保存されています', colors.yellow);
  log('  2. アプリケーションを再起動して新構造を反映してください', colors.yellow);
  log('  3. 動作確認後、旧ディレクトリを削除できます', colors.yellow);
}

/**
 * メイン実行
 */
async function main() {
  log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
  log('║  Knowledge Base Structure Migration Tool             ║', colors.blue);
  log('║  旧構造 → 新構造 へのデータ移行                      ║', colors.blue);
  log('╚═══════════════════════════════════════════════════════╝', colors.blue);
  
  try {
    // 1. バックアップ作成
    await createBackup();
    
    // 2. 新ディレクトリ作成
    await createNewDirectories();
    
    // 3. チャットエクスポートJSON移行
    await migrateChatExportsJson();
    
    // 4. チャットエクスポート画像移行
    await migrateChatExportsImages();
    
    // 5. トラブルシューティングフロー移行
    await migrateTroubleshootingFlows();
    
    // 6. マニュアル移行
    await migrateManuals();
    
    // 7. サマリー表示
    await showSummary();
    
  } catch (error) {
    log(`\n❌ Migration failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// 実行
main();
