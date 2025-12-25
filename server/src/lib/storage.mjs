// ストレージ統合ライブラリ - ローカル/Google Cloud Storage切り替え
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { 
  uploadBufferToGCS, 
  downloadFromGCS, 
  existsInGCS, 
  deleteFromGCS, 
  listFilesInGCS,
  getGCSStatus 
} from './google-cloud-storage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ストレージモードの判定
const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const isLocal = STORAGE_MODE === 'local';
const isGCS = STORAGE_MODE === 'gcs' || STORAGE_MODE === 'google';

// ローカルストレージのベースパス
const LOCAL_STORAGE_BASE = process.env.LOCAL_STORAGE_PATH || 
  path.resolve(__dirname, '../../knowledge-base');

// Google Cloud Storageバケット名
const GCS_BUCKET = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'emergency-knowledge-assets';

console.log('[Storage] Mode:', STORAGE_MODE);
console.log('[Storage] Local base path:', LOCAL_STORAGE_BASE);
if (isGCS) {
  console.log('[Storage] GCS bucket:', GCS_BUCKET);
}

// ローカルストレージの標準フォルダ構造を作成(GCSバケットと同じ構造)
const STANDARD_FOLDERS = [
  'history',              // チャットエクスポート履歴(JSON)
  'history/processed',    // 処理済みチャット履歴メタデータ
  'manuals',              // 基礎データ(マニュアル、ナレッジファイル)
  'manuals/processed',    // 処理済みマニュアルメタデータ
  'temp',                 // 一時ファイル
  'images/chat-exports'   // チャットエクスポート時の画像
];

if (isLocal) {
  // ベースディレクトリを作成
  if (!fs.existsSync(LOCAL_STORAGE_BASE)) {
    fs.mkdirSync(LOCAL_STORAGE_BASE, { recursive: true });
    console.log('[Storage] Created local storage directory');
  }
  
  // 標準フォルダを作成
  STANDARD_FOLDERS.forEach(folder => {
    const folderPath = path.join(LOCAL_STORAGE_BASE, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      console.log(`[Storage] Created folder: ${folder}/`);
    }
  });
}

/**
 * ファイルをストレージにアップロード
 * @param {Buffer|string} content アップロードする内容（Bufferまたはファイルパス）
 * @param {string} destination 保存先パス
 * @param {string} contentType MIMEタイプ
 * @returns {Promise<string>} アップロードされたファイルのURL
 */
export async function uploadFile(content, destination, contentType = 'application/json') {
  if (isLocal) {
    return uploadFileLocal(content, destination);
  } else if (isGCS) {
    // contentがBufferの場合
    if (Buffer.isBuffer(content)) {
      return await uploadBufferToGCS(content, destination, contentType);
    }
    // contentがファイルパスの場合
    const { uploadToGCS } = await import('./google-cloud-storage.mjs');
    return await uploadToGCS(content, destination);
  }
  throw new Error(`Unknown storage mode: ${STORAGE_MODE}`);
}

/**
 * ファイルをローカルストレージにアップロード
 */
function uploadFileLocal(content, destination) {
  const fullPath = path.join(LOCAL_STORAGE_BASE, destination);
  const dir = path.dirname(fullPath);

  // ディレクトリが存在しない場合は作成
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Bufferの場合
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(fullPath, content);
  } 
  // ファイルパスの場合
  else if (typeof content === 'string' && fs.existsSync(content)) {
    fs.copyFileSync(content, fullPath);
  }
  // 文字列の場合
  else if (typeof content === 'string') {
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  console.log(`[Storage] File uploaded locally: ${destination}`);
  
  // ローカルファイルのURLを返す（相対パス）
  return `/knowledge-base/${destination}`;
}

/**
 * ファイルをストレージからダウンロード
 * @param {string} source ファイルパス
 * @returns {Promise<Buffer>} ファイルの内容
 */
export async function downloadFile(source) {
  if (isLocal) {
    return downloadFileLocal(source);
  } else if (isGCS) {
    return await downloadFromGCS(source);
  }
  throw new Error(`Unknown storage mode: ${STORAGE_MODE}`);
}

/**
 * ファイルをローカルストレージからダウンロード
 */
function downloadFileLocal(source) {
  const fullPath = path.join(LOCAL_STORAGE_BASE, source);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${source}`);
  }

  return fs.readFileSync(fullPath);
}

/**
 * ファイルがストレージに存在するか確認
 * @param {string} filePath ファイルパス
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  if (isLocal) {
    const fullPath = path.join(LOCAL_STORAGE_BASE, filePath);
    return fs.existsSync(fullPath);
  } else if (isGCS) {
    return await existsInGCS(filePath);
  }
  return false;
}

/**
 * ファイルをストレージから削除
 * @param {string} filePath ファイルパス
 * @returns {Promise<void>}
 */
export async function deleteFile(filePath) {
  if (isLocal) {
    const fullPath = path.join(LOCAL_STORAGE_BASE, filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`[Storage] File deleted locally: ${filePath}`);
    }
  } else if (isGCS) {
    await deleteFromGCS(filePath);
  }
}

/**
 * ディレクトリ内のファイル一覧を取得
 * @param {string} prefix ディレクトリのプレフィックス
 * @returns {Promise<Array>} ファイル一覧
 */
export async function listFiles(prefix = '') {
  if (isLocal) {
    return listFilesLocal(prefix);
  } else if (isGCS) {
    return await listFilesInGCS(prefix);
  }
  return [];
}

/**
 * ローカルディレクトリ内のファイル一覧を取得
 */
function listFilesLocal(prefix = '') {
  const fullPath = path.join(LOCAL_STORAGE_BASE, prefix);
  
  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const files = [];
  
  function scanDirectory(dirPath, relativePath = '') {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        scanDirectory(itemPath, itemRelativePath);
      } else {
        files.push({
          name: prefix ? `${prefix}${itemRelativePath}` : itemRelativePath,
          size: stats.size,
          created: stats.birthtime.toISOString(),
          updated: stats.mtime.toISOString(),
          contentType: getContentType(item),
        });
      }
    }
  }
  
  if (fs.statSync(fullPath).isDirectory()) {
    scanDirectory(fullPath);
  }
  
  return files;
}

/**
 * ファイル拡張子からContent-Typeを取得
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * ストレージの状態を取得
 */
export function getStorageStatus() {
  if (isLocal) {
    return {
      mode: 'local',
      basePath: LOCAL_STORAGE_BASE,
      exists: fs.existsSync(LOCAL_STORAGE_BASE),
    };
  } else if (isGCS) {
    return {
      mode: 'gcs',
      ...getGCSStatus(),
    };
  }
  return {
    mode: STORAGE_MODE,
    error: 'Unknown storage mode',
  };
}

/**
 * ストレージモードを取得
 */
export function getStorageMode() {
  return STORAGE_MODE;
}

/**
 * ローカルストレージモードかどうか
 */
export function isLocalStorage() {
  return isLocal;
}

/**
 * GCSモードかどうか
 */
export function isGCSStorage() {
  return isGCS;
}
