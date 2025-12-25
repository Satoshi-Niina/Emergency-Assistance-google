// Google Cloud Storage接続状態確認APIエンドポイント
import { getStorageStatus } from '../../lib/storage.mjs';
import { STORAGE_MODE, GOOGLE_CLOUD_STORAGE_BUCKET, GOOGLE_CLOUD_PROJECT_ID } from '../../config/env.mjs';

/**
 * GET /api/storage-status
 * ストレージの接続状態を確認
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGetStatus(req, res);
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
  });
}

async function handleGetStatus(req, res) {
  try {
    console.log('[storage-status] Checking storage connection...');
    
    // ストレージステータスを取得
    const status = await getStorageStatus();
    
    // 環境変数情報を追加
    const envInfo = {
      storageMode: STORAGE_MODE,
      bucket: GOOGLE_CLOUD_STORAGE_BUCKET || 'NOT SET',
      projectId: GOOGLE_CLOUD_PROJECT_ID || 'NOT SET',
      hasGeminiApiKey: !!(process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    };
    
    // 接続テスト（簡易チェック）
    let connectionTest = {
      success: false,
      message: '',
    };
    
    if (status.mode === 'local') {
      connectionTest.success = status.exists;
      connectionTest.message = status.exists 
        ? 'ローカルストレージディレクトリが存在します' 
        : 'ローカルストレージディレクトリが見つかりません';
    } else if (status.mode === 'gcs' || status.mode === 'google') {
      // GCSの場合は、バケット名とプロジェクトIDの設定確認
      const hasRequiredConfig = !!(GOOGLE_CLOUD_STORAGE_BUCKET && GOOGLE_CLOUD_PROJECT_ID);
      connectionTest.success = hasRequiredConfig;
      connectionTest.message = hasRequiredConfig
        ? 'Google Cloud Storage設定が完了しています'
        : 'Google Cloud Storage設定が不完全です（バケット名またはプロジェクトIDが未設定）';
    }
    
    console.log('[storage-status] Status check complete:', {
      mode: status.mode,
      connectionTest: connectionTest.success,
    });
    
    return res.status(200).json({
      success: true,
      storage: {
        ...status,
        connectionTest,
      },
      environment: envInfo,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('[storage-status] Error checking storage status:', error);
    
    return res.status(500).json({
      success: false,
      error: 'ストレージステータスの確認に失敗しました',
      details: error.message,
    });
  }
}
