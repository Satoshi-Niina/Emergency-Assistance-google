// GCS専用ストレージシステム（Azure Blob削除済み）
// ストレージ操作は lib/storage.mjs を使用

export default async function (req, res) {
  const method = req.method;
  const path = req.path;
  
  try {
    console.log('Flows API processed a request.', {
      method,
      path,
    });

    // OPTIONSリクエストの処理
    if (method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Max-Age': '86400',
      });
      return res.status(200).send('');
    }

    console.log('Storage configuration:', {
      storageMode: process.env.STORAGE_MODE || 'local',
      gcsBucket: process.env.GOOGLE_CLOUD_STORAGE_BUCKET,
    });

    // Azure BLOB Storageはサポート終了 - GCS実装が必要な場合は lib/storage.mjs を使用
    console.warn('Flows API: Azure BLOB removed, use lib/storage.mjs for GCS');
    return res.status(501).json({
      success: false,
      error: 'Flows API not implemented for GCS',
      details: 'Use troubleshooting API for flow management with GCS',
      method,
      path,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in flows function:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

