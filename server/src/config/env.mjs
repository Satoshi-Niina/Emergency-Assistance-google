import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../../'); // project root (not server root)

// 環境変数の読み込み
if (!process.env.WEBSITE_SITE_NAME) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
  const envPath = path.join(rootDir, envFile);

  console.log('[Config] Root directory:', rootDir);
  console.log('[Config] Looking for:', envPath);
  console.log('[Config] Exists?', fs.existsSync(envPath));

  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    console.log(`[Config] Loaded environment from ${envFile}`);
    console.log('[Config] DATABASE_URL loaded:', !!result.parsed?.DATABASE_URL);
  } else {
    const fallbackPath = path.join(rootDir, '.env');
    console.log('[Config] Fallback path:', fallbackPath);
    console.log('[Config] Fallback exists?', fs.existsSync(fallbackPath));
    if (fs.existsSync(fallbackPath)) {
      const result = dotenv.config({ path: fallbackPath });
      console.log(`[Config] Loaded environment from .env (fallback)`);
      console.log('[Config] DATABASE_URL loaded:', !!result.parsed?.DATABASE_URL);
    } else {
      console.warn(`[Config] No environment file found.`);
    }
  }
}

// 定数定義
const cleanEnvValue = (value) => {
  if (!value) return null;
  return value.trim().replace(/^["']|["']$/g, '').trim();
};

const DEFAULT_STATIC_WEB_APP_URL = 'https://witty-river-012f39e00.1.azurestaticapps.net';

export const FRONTEND_URL = cleanEnvValue(
  process.env.FRONTEND_URL ||
  process.env.STATIC_WEB_APP_URL ||
  (process.env.NODE_ENV === 'production'
    ? DEFAULT_STATIC_WEB_APP_URL
    : 'http://localhost:5173')
) || 'http://localhost:5173';

export const STATIC_WEB_APP_URL = cleanEnvValue(
  process.env.STATIC_WEB_APP_URL ||
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === 'production' ? DEFAULT_STATIC_WEB_APP_URL : 'http://localhost:5173')
) || 'http://localhost:5173';

export const PORT = process.env.PORT || 3000;
export const HEALTH_TOKEN = process.env.HEALTH_TOKEN || '';
export const NODE_ENV = process.env.NODE_ENV || 'production';
export const VERSION = '2025-12-23T15:00:00+09:00'; // Updated - Google Cloud Storage integration

// ========================================
// Storage Configuration (Google Cloud Storage)
// ========================================
export const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
export const GOOGLE_CLOUD_STORAGE_BUCKET = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || process.env.GCS_BUCKET_NAME;
export const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCS_PROJECT_ID;
export const LOCAL_STORAGE_PATH = process.env.LOCAL_STORAGE_PATH;

// Google Gemini API
export const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// Azure BLOB Storage は使用しません（削除済み）
// このシステムはGoogle Cloud Storage (GCS)またはローカルストレージを使用します

console.log(`[Config] Storage Mode: ${STORAGE_MODE}`);

export const DATABASE_URL = process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.AZURE_POSTGRESQL_CONNECTIONSTRING;

export const PG_SSL = process.env.PG_SSL;

export const SESSION_SECRET = process.env.SESSION_SECRET || 'azure-production-fallback-secret-key-2025';

if (!process.env.SESSION_SECRET) {
  console.warn('[Config] ⚠️ SESSION_SECRET is not set in environment variables. Using fallback secret.');
}

// デフォルトユーザー設定（初期セットアップ用）
export const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
export const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin';
export const DEFAULT_ADMIN_DISPLAY_NAME = process.env.DEFAULT_ADMIN_DISPLAY_NAME || 'System Admin';

if (!process.env.DEFAULT_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD === 'admin') {
  console.warn('[Config] ⚠️ DEFAULT_ADMIN_PASSWORD is not set or using default weak password. Please set a strong password in environment variables.');
}

// チャットエクスポートを自動でナレッジに取り込むか（デフォルト: false）
export const AUTO_INGEST_CHAT_EXPORTS =
  (process.env.AUTO_INGEST_CHAT_EXPORTS || '').toLowerCase() === 'true';

// Azure環境かどうかを判定する統一関数
// 注意: ストレージはGoogle Cloud Storageを使用するため、STORAGE_MODE=gcsで設定
export function isAzureEnvironment() {
  // デバッグログ
  const debugInfo = {
    STORAGE_MODE,
    NODE_ENV,
    hasWebsiteInstanceId: !!process.env.WEBSITE_INSTANCE_ID,
    hasWebsiteSiteName: !!process.env.WEBSITE_SITE_NAME,
    portNumber: process.env.PORT
  };

  console.log('[isAzureEnvironment] 環境判定開始:', debugInfo);

  // 1. STORAGE_MODEが明示的に設定されている場合
  // GCS使用時でもAzure環境の判定は必要（データベース接続等のため）
  if (STORAGE_MODE === 'gcs' || STORAGE_MODE === 'google') {
    // Azure App Service上でGCSを使用する場合
    if (process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_SITE_NAME) {
      console.log('[isAzureEnvironment] ✅ TRUE - Azure環境でGCS使用');
      return true;
    }
    console.log('[isAzureEnvironment] ❌ FALSE - ローカル環境でGCS使用');
    return false;
  }
  
  if (STORAGE_MODE === 'azure' || STORAGE_MODE === 'blob') {
    console.log('[isAzureEnvironment] ✅ TRUE - STORAGE_MODE=azure/blob (レガシー)');
    return true;
  }
  if (STORAGE_MODE === 'local') {
    console.log('[isAzureEnvironment] ❌ FALSE - STORAGE_MODE=local');
    return false;
  }

  // 2. Azure App Service固有の環境変数
  if (process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_SITE_NAME) {
    console.log('[isAzureEnvironment] ✅ TRUE - Azure App Service detected');
    return true;
  }

  // Azure BLOB Storageサポートは削除済み

  // 4. デフォルト: 本番環境はAzure（ポート番号も考慮）
  const isProduction = NODE_ENV === 'production' || process.env.PORT === '8080' || process.env.PORT === '80';
  console.log(`[isAzureEnvironment] ${isProduction ? '✅ TRUE' : '❌ FALSE'} - Default production check (NODE_ENV=${NODE_ENV}, PORT=${process.env.PORT})`);
  return isProduction;
}
