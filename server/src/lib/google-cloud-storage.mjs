// Google Cloud Storage クライアント
import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

// ESM用__dirname定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .envファイルの読み込み
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../server/.env') });

// Google Cloud Storage設定
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || process.env.GCS_BUCKET_NAME;
const GCS_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCS_PROJECT_ID;
const GCS_KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GCS_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

// デバッグ用ログ
console.log('[DEBUG] Google Cloud Storage initialization:', {
  bucketName: GCS_BUCKET_NAME || 'NOT SET',
  projectId: GCS_PROJECT_ID || 'NOT SET',
  keyFile: GCS_KEY_FILE || 'NOT SET',
  hasKeyFile: GCS_KEY_FILE ? fs.existsSync(GCS_KEY_FILE) : false,
  hasCredentialsJson: !!GCS_CREDENTIALS_JSON,
});

// Google Cloud Storageクライアントの初期化
let storage = null;
let bucket = null;

try {
  const storageOptions = {};
  
  if (GCS_PROJECT_ID) {
    storageOptions.projectId = GCS_PROJECT_ID;
  }
  
  // 認証方法の優先順位: 1. JSON文字列、2. キーファイル、3. ADC
  if (GCS_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(GCS_CREDENTIALS_JSON);
      storageOptions.credentials = credentials;
      console.log('[DEBUG] Using service account credentials from JSON string');
    } catch (error) {
      console.error('[DEBUG] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', error.message);
    }
  } else if (GCS_KEY_FILE && fs.existsSync(GCS_KEY_FILE)) {
    storageOptions.keyFilename = GCS_KEY_FILE;
    console.log('[DEBUG] Using service account key file for authentication');
  } else {
    console.log('[DEBUG] Using default credentials (Application Default Credentials)');
  }

  if (GCS_BUCKET_NAME) {
    storage = new Storage(storageOptions);
    bucket = storage.bucket(GCS_BUCKET_NAME);
    console.log('[DEBUG] Google Cloud Storage client initialized successfully');
  } else {
    console.log('[DEV] Google Cloud Storage not initialized - bucket name not configured');
  }
} catch (error) {
  console.error('[DEBUG] Google Cloud Storage initialization failed:', error);
  storage = null;
  bucket = null;
}

/**
 * ファイルをGoogle Cloud Storageにアップロード
 * @param {string} filePath ローカルファイルパス
 * @param {string} destination GCS上の保存先パス
 * @returns {Promise<string>} アップロードされたファイルの公開URL
 */
export async function uploadToGCS(filePath, destination) {
  if (!bucket) {
    throw new Error('Google Cloud Storage is not configured');
  }

  try {
    await bucket.upload(filePath, {
      destination: destination,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    console.log(`[GCS] File ${filePath} uploaded to ${destination}`);
    
    // 公開URLを生成
    const file = bucket.file(destination);
    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destination}`;
    
    return publicUrl;
  } catch (error) {
    console.error('[GCS] Upload error:', error);
    throw error;
  }
}

/**
 * バッファをGoogle Cloud Storageにアップロード
 * @param {Buffer} buffer アップロードするバッファ
 * @param {string} destination GCS上の保存先パス
 * @param {string} contentType MIMEタイプ
 * @returns {Promise<string>} アップロードされたファイルの公開URL
 */
export async function uploadBufferToGCS(buffer, destination, contentType = 'application/json') {
  if (!bucket) {
    throw new Error('Google Cloud Storage is not configured');
  }

  try {
    const file = bucket.file(destination);
    
    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        cacheControl: 'public, max-age=31536000',
      },
    });

    console.log(`[GCS] Buffer uploaded to ${destination}`);
    
    const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destination}`;
    return publicUrl;
  } catch (error) {
    console.error('[GCS] Buffer upload error:', error);
    throw error;
  }
}

/**
 * ファイルをGoogle Cloud Storageからダウンロード
 * @param {string} source GCS上のファイルパス
 * @returns {Promise<Buffer>} ファイルの内容
 */
export async function downloadFromGCS(source) {
  if (!bucket) {
    throw new Error('Google Cloud Storage is not configured');
  }

  try {
    const file = bucket.file(source);
    const [contents] = await file.download();
    
    console.log(`[GCS] File ${source} downloaded`);
    return contents;
  } catch (error) {
    console.error('[GCS] Download error:', error);
    throw error;
  }
}

/**
 * ファイルがGoogle Cloud Storageに存在するか確認
 * @param {string} filePath GCS上のファイルパス
 * @returns {Promise<boolean>}
 */
export async function existsInGCS(filePath) {
  if (!bucket) {
    return false;
  }

  try {
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error('[GCS] Exists check error:', error);
    return false;
  }
}

/**
 * ファイルをGoogle Cloud Storageから削除
 * @param {string} filePath GCS上のファイルパス
 * @returns {Promise<void>}
 */
export async function deleteFromGCS(filePath) {
  if (!bucket) {
    throw new Error('Google Cloud Storage is not configured');
  }

  try {
    const file = bucket.file(filePath);
    await file.delete();
    
    console.log(`[GCS] File ${filePath} deleted`);
  } catch (error) {
    console.error('[GCS] Delete error:', error);
    throw error;
  }
}

/**
 * ディレクトリ内のファイル一覧を取得
 * @param {string} prefix ディレクトリのプレフィックス
 * @returns {Promise<Array>} ファイル一覧
 */
export async function listFilesInGCS(prefix = '') {
  if (!bucket) {
    throw new Error('Google Cloud Storage is not configured');
  }

  try {
    const [files] = await bucket.getFiles({ prefix });
    
    return files.map(file => ({
      name: file.name,
      size: file.metadata.size,
      created: file.metadata.timeCreated,
      updated: file.metadata.updated,
      contentType: file.metadata.contentType,
    }));
  } catch (error) {
    console.error('[GCS] List files error:', error);
    throw error;
  }
}

/**
 * Google Cloud Storageの状態を確認
 */
export function getGCSStatus() {
  return {
    initialized: !!storage && !!bucket,
    bucketName: GCS_BUCKET_NAME || 'NOT SET',
    projectId: GCS_PROJECT_ID || 'NOT SET',
    hasKeyFile: GCS_KEY_FILE ? fs.existsSync(GCS_KEY_FILE) : false,
  };
}

export { storage, bucket };
