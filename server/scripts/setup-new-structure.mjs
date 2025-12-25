#!/usr/bin/env node

/**
 * Knowledge Base 新規構造作成スクリプト
 * 既存フォルダを削除して新しい正規化された構造を作成
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ベースパス
const BASE_PATH = path.join(process.cwd(), 'knowledge-base');

// 新構造パス
const NEW_PATHS = {
  // チャットエクスポート
  'chat-exports': path.join(BASE_PATH, 'chat-exports'),
  'chat-exports/json': path.join(BASE_PATH, 'chat-exports', 'json'),
  'chat-exports/images': path.join(BASE_PATH, 'chat-exports', 'images'),
  
  // トラブルシューティング
  'troubleshooting': path.join(BASE_PATH, 'troubleshooting'),
  'troubleshooting/flows': path.join(BASE_PATH, 'troubleshooting', 'flows'),
  'troubleshooting/images': path.join(BASE_PATH, 'troubleshooting', 'images'),
  
  // AI学習データ
  'ai-training': path.join(BASE_PATH, 'ai-training'),
  'ai-training/manuals': path.join(BASE_PATH, 'ai-training', 'manuals'),
  'ai-training/faqs': path.join(BASE_PATH, 'ai-training', 'faqs'),
  'ai-training/knowledge': path.join(BASE_PATH, 'ai-training', 'knowledge'),
  
  // ベクトルデータ
  'vectors': path.join(BASE_PATH, 'vectors'),
  'vectors/embeddings': path.join(BASE_PATH, 'vectors', 'embeddings'),
  'vectors/indexes': path.join(BASE_PATH, 'vectors', 'indexes'),
  
  // 一時ファイル
  'temp': path.join(BASE_PATH, 'temp'),
  'temp/uploads': path.join(BASE_PATH, 'temp', 'uploads'),
  
  // バックアップ
  'backups': path.join(BASE_PATH, 'backups'),
};

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
 * 既存のknowledge-baseをバックアップ
 */
async function backupExisting() {
  log('\n💾 Creating backup of existing knowledge-base...', colors.blue);
  
  if (!(await dirExists(BASE_PATH))) {
    log('  ℹ️  No existing knowledge-base directory found', colors.yellow);
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const backupDir = path.join(process.cwd(), `knowledge-base-backup-${timestamp}`);
  
  try {
    await fs.cp(BASE_PATH, backupDir, { recursive: true });
    log(`  ✅ Backup created: ${backupDir}`, colors.green);
    log(`  ℹ️  You can delete this backup after confirming everything works`, colors.cyan);
  } catch (error) {
    log(`  ❌ Backup failed: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * 既存のknowledge-baseを削除
 */
async function removeExisting() {
  log('\n🗑️  Removing existing knowledge-base directory...', colors.blue);
  
  if (!(await dirExists(BASE_PATH))) {
    log('  ℹ️  No existing knowledge-base directory to remove', colors.yellow);
    return;
  }
  
  try {
    await fs.rm(BASE_PATH, { recursive: true, force: true });
    log('  ✅ Existing directory removed', colors.green);
  } catch (error) {
    log(`  ❌ Failed to remove directory: ${error.message}`, colors.red);
    throw error;
  }
}

/**
 * 新しい構造を作成
 */
async function createNewStructure() {
  log('\n📁 Creating new knowledge-base structure...', colors.blue);
  
  for (const [name, dirPath] of Object.entries(NEW_PATHS)) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      log(`  ✅ ${name}`, colors.green);
    } catch (error) {
      log(`  ❌ Failed to create ${name}: ${error.message}`, colors.red);
    }
  }
}

/**
 * READMEファイルを各ディレクトリに作成
 */
async function createReadmeFiles() {
  log('\n📝 Creating README files...', colors.blue);
  
  const readmeContents = {
    'chat-exports/json': '# チャットエクスポートJSON\n\nチャット履歴のJSONファイルを保存します。\n\nファイル名形式: `{machineType}_{machineNumber}_{uuid}_{timestamp}.json`\n',
    'chat-exports/images': '# チャットエクスポート画像\n\nチャットに添付された画像ファイルを保存します。\n\nファイル名形式: `{uuid}_*.png`\n',
    'troubleshooting/flows': '# トラブルシューティングフロー\n\n応急処置フローのJSONファイルを保存します。\n\nファイル名形式: `{flowId}.json`\n',
    'troubleshooting/images': '# トラブルシューティング画像\n\nフロー関連の画像ファイルを保存します。\n\nファイル名形式: `{flowId}_step_{stepNumber}.png`\n',
    'ai-training/manuals': '# AI学習用マニュアル\n\nマニュアルを処理後のデータとして保存します。\n\n構造:\n- `{category}/original/` - 元ファイル\n- `{category}/chunks.json` - チャンク化データ\n- `{category}/metadata.json` - メタデータ\n',
    'ai-training/faqs': '# AI学習用FAQ\n\nFAQを処理後のデータとして保存します。\n',
    'ai-training/knowledge': '# AI学習用知識ベース\n\nその他の知識ベースを保存します。\n',
    'vectors/embeddings': '# ベクトル埋め込み\n\nRAG用のベクトル埋め込みデータを保存します。\n',
    'vectors/indexes': '# ベクトルインデックス\n\nRAG用のインデックスデータを保存します。\n',
    'temp/uploads': '# 一時アップロード\n\nアップロード時の一時ファイルを保存します。\n\n※自動削除対象\n',
    'backups': '# バックアップ\n\n定期バックアップを保存します。\n\n構造: `{date}/`\n',
  };
  
  for (const [pathKey, content] of Object.entries(readmeContents)) {
    try {
      const readmePath = path.join(BASE_PATH, pathKey, 'README.md');
      await fs.writeFile(readmePath, content, 'utf-8');
      log(`  ✅ ${pathKey}/README.md`, colors.green);
    } catch (error) {
      log(`  ❌ Failed to create README for ${pathKey}: ${error.message}`, colors.red);
    }
  }
}

/**
 * .gitkeepファイルを作成
 */
async function createGitkeepFiles() {
  log('\n📌 Creating .gitkeep files...', colors.blue);
  
  const emptyDirs = [
    'chat-exports/json',
    'chat-exports/images',
    'troubleshooting/flows',
    'troubleshooting/images',
    'ai-training/manuals',
    'ai-training/faqs',
    'ai-training/knowledge',
    'vectors/embeddings',
    'vectors/indexes',
    'temp/uploads',
    'backups',
  ];
  
  for (const dir of emptyDirs) {
    try {
      const gitkeepPath = path.join(BASE_PATH, dir, '.gitkeep');
      await fs.writeFile(gitkeepPath, '', 'utf-8');
      log(`  ✅ ${dir}/.gitkeep`, colors.green);
    } catch (error) {
      log(`  ❌ Failed to create .gitkeep for ${dir}: ${error.message}`, colors.red);
    }
  }
}

/**
 * サマリーを表示
 */
async function showSummary() {
  log('\n📊 Structure Summary', colors.blue);
  log('═══════════════════════════════════════════════════', colors.blue);
  
  for (const [name, dirPath] of Object.entries(NEW_PATHS)) {
    const exists = await dirExists(dirPath);
    const status = exists ? '✅' : '❌';
    log(`  ${status} ${name}`, exists ? colors.green : colors.red);
  }
  
  log('\n✅ New structure created successfully!', colors.green);
  log('\n📚 Next Steps:', colors.cyan);
  log('  1. データを移行する場合:', colors.cyan);
  log('     node server/scripts/migrate-knowledge-base.mjs', colors.yellow);
  log('\n  2. サーバーを起動:', colors.cyan);
  log('     npm run dev', colors.yellow);
  log('\n  3. 本番環境へのデプロイ:', colors.cyan);
  log('     GCS_SETUP_GUIDE.mdを参照してGCSをセットアップ', colors.yellow);
}

/**
 * メイン実行
 */
async function main() {
  log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
  log('║  Knowledge Base New Structure Setup                  ║', colors.blue);
  log('║  新規正規化構造を作成                                ║', colors.blue);
  log('╚═══════════════════════════════════════════════════════╝', colors.blue);
  
  try {
    // 1. バックアップ作成
    await backupExisting();
    
    // 2. 既存ディレクトリ削除
    await removeExisting();
    
    // 3. 新構造作成
    await createNewStructure();
    
    // 4. READMEファイル作成
    await createReadmeFiles();
    
    // 5. .gitkeepファイル作成
    await createGitkeepFiles();
    
    // 6. サマリー表示
    await showSummary();
    
  } catch (error) {
    log(`\n❌ Setup failed: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// 実行
main();
