import fs from 'fs';
import { join } from 'path';
import { dbQuery } from '../../infra/db.mjs';
import { isAzureEnvironment } from '../../config/env.mjs';
// Azure Blobインポート削除済み

export default async function (req, res) {
  try {
    console.log('[api/knowledge-base] Request:', { method: req.method, path: req.path });

    // 検索エンドポイント: POST /api/knowledge-base/search
    const isSearchRequest = req.method === 'POST' && (req.path.endsWith('/search') || req.url.includes('/search'));
    
    if (isSearchRequest) {
      console.log('[api/knowledge-base] Serving search endpoint');
      try {
        const { query, limit = 5 } = req.body || {};

        if (!query || query.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: '検索クエリが指定されていません'
          });
        }

        console.log(`🔍 ナレッジベース検索: "${query}", limit: ${limit}`);

        // マニュアルディレクトリ（アップロードされたファイル）
        const manualsDir = join(process.cwd(), 'knowledge-base', 'manuals', 'processed');
        // チャット履歴ディレクトリ（エクスポートされた履歴）
        const historyDir = join(process.cwd(), 'knowledge-base', 'history', 'processed');
        const results = [];

        // 両方のディレクトリが存在しない場合
        if (!fs.existsSync(manualsDir) && !fs.existsSync(historyDir)) {
          console.warn('⚠️ manuals/processed および history/processed ディレクトリが存在しません');
          return res.json({
            success: true,
            results: [],
            totalFound: 0,
            query: query
          });
        }

        // メタデータファイルを検索（.json）
        const metadataFiles = [];
        
        // マニュアルディレクトリからメタデータを収集
        if (fs.existsSync(manualsDir)) {
          const manualFiles = fs.readdirSync(manualsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({ path: join(manualsDir, f), source: 'manual' }));
          metadataFiles.push(...manualFiles);
        }

        // チャット履歴ディレクトリからメタデータを収集
        if (fs.existsSync(historyDir)) {
          const historyFiles = fs.readdirSync(historyDir)
            .filter(f => f.endsWith('.json'))
            .map(f => ({ path: join(historyDir, f), source: 'history' }));
          metadataFiles.push(...historyFiles);
        }

        console.log(`📁 検索対象メタデータファイル: ${metadataFiles.length}件`);

        const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

        for (const { path: metadataPath, source } of metadataFiles) {
          try {
            // メタデータファイルを読み込む
            const metadataContent = fs.readFileSync(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataContent);

            // チャンクからコンテンツを抽出
            const content = metadata.chunks
              ? metadata.chunks.map(chunk => chunk.text || '').join(' ')
              : (metadata.content || '');

            // スコア計算
            let score = 0;
            const searchableText = (metadata.title + ' ' + content).toLowerCase();

            for (const term of searchTerms) {
              const matches = (searchableText.match(new RegExp(term, 'g')) || []).length;
              score += matches;
            }

            if (score > 0) {
              results.push({
                id: metadata.id || metadataPath,
                title: metadata.title || 'タイトルなし',
                content: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
                score: score / searchTerms.length, // 正規化されたスコア
                category: metadata.category || 'uncategorized',
                type: metadata.type || (source === 'history' ? 'chat-history' : 'document'),
                source: metadata.source || source,
                createdAt: metadata.createdAt || metadata.timestamp
              });
            }
          } catch (error) {
            console.warn(`メタデータ読み込みエラー: ${metadataPath}`, error.message);
          }
        }

        // スコア順でソート
        results.sort((a, b) => b.score - a.score);

        // 制限数まで切り詰め
        const limitedResults = results.slice(0, limit);

        console.log(`✅ ${limitedResults.length}件の結果を返します（全${results.length}件中）`);

        return res.json({
          success: true,
          results: limitedResults,
          totalFound: results.length,
          query: query
        });

      } catch (searchError) {
        console.error('[api/knowledge-base/search] Error:', searchError);
        return res.status(500).json({
          success: false,
          error: 'ナレッジベース検索に失敗しました',
          details: searchError.message
        });
      }
    }

    // 統計エンドポイント: /api/knowledge-base/stats
    // 統計エンドポイント: /api/knowledge-base/stats
    // Azure Functionsでは /api/knowledge-base 部分でトリガーされるため、
    // 相対パスが /stats または stats であるか、もしくはクエリパラメータ等も考慮
    const isStatsRequest = req.path.endsWith('/stats') || req.url.includes('/stats');

    if (isStatsRequest) {
      console.log('[api/knowledge-base] Serving stats endpoint');
      try {
        // DBからドキュメント数を取得
        let docCount = 0;
        try {
          const countResult = await dbQuery('SELECT COUNT(*) as count FROM base_documents');
          docCount = parseInt(countResult.rows[0]?.count || 0);
          console.log('[api/knowledge-base/stats] Document count:', docCount);
        } catch (countError) {
          console.warn('[api/knowledge-base/stats] DB count failed:', countError.message);
          // DB接続エラーの場合もゼロ値を返す（致命的エラーにしない）
        }

        return res.status(200).json({
          success: true,
          data: {
            total: docCount,
            totalSize: 0,
            typeStats: {
              json: 0,
              document: docCount
            },
            oldData: 0,
            lastMaintenance: new Date().toISOString()
          },
          timestamp: new Date().toISOString(),
        });
      } catch (statsError) {
        console.error('[api/knowledge-base/stats] Error generating stats:', statsError);
        // エラーの場合でもゼロ値を返して処理を継続
        return res.status(200).json({ 
          success: true,
          data: {
            total: 0,
            totalSize: 0,
            typeStats: { json: 0, document: 0 },
            oldData: 0,
            lastMaintenance: new Date().toISOString()
          },
          warning: 'Stats generation had errors',
          error: statsError.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log('Knowledge base HTTP trigger function processed a request.');

    let rows = [];

    try {
      // 生のSQLクエリで直接データを取得
      // base_documentsテーブルにはcontentカラムがないため、file_pathを使用
      const result = await dbQuery(`
              SELECT id, title, file_path, created_at
              FROM base_documents
              ORDER BY created_at DESC
          `);

      rows = result.rows.map(row => ({
        ...row,
        content: row.file_path, // file_pathをcontentとして扱う（互換性のため）
        category: 'base_document'
      }));
      console.log('Knowledge base query result:', { count: rows.length });
    } catch (dbError) {
      console.warn('Knowledge base DB query failed, falling back to storage:', dbError.message);

      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      console.log('[knowledge-base] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });

      // ローカル環境: ローカルファイルシステムから取得
      if (!useAzure) {
        console.log('[knowledge-base] LOCAL: Using local filesystem');
        const localPath = join(process.cwd(), 'knowledge-base', 'index.json');

        if (fs.existsSync(localPath)) {
          const raw = fs.readFileSync(localPath, 'utf8');
          const fallbackData = JSON.parse(raw);
          rows = Array.isArray(fallbackData) ? fallbackData : [];
          console.log(`[knowledge-base] LOCAL: Loaded ${rows.length} documents from local file`);
        } else {
          console.log('[knowledge-base] LOCAL: No local file found:', localPath);
        }
      } else {
        // Azure環境: BLOBストレージから取得
        console.log('[knowledge-base] AZURE: Using BLOB storage');
        try {
          const blobServiceClient = getBlobServiceClient();

          if (blobServiceClient) {
            const containerClient = blobServiceClient.getContainerClient(containerName);
            
            // manuals/processed/ と history/processed/ の両方を検索
            const prefixes = ['manuals/processed/', 'history/processed/'];

            for (const prefix of prefixes) {
              for await (const blob of containerClient.listBlobsFlat({ prefix })) {
                if (!blob.name.endsWith('.json')) continue;

                try {
                  const blobClient = containerClient.getBlobClient(blob.name);
                  const downloadResponse = await blobClient.download();
                  const chunks = [];

                  if (downloadResponse.readableStreamBody) {
                    for await (const chunk of downloadResponse.readableStreamBody) {
                      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    }
                    const buffer = Buffer.concat(chunks);
                    const data = JSON.parse(buffer.toString('utf8'));

                    if (Array.isArray(data)) {
                      rows.push(...data);
                    } else if (data.title && (data.content || data.chunks)) {
                      rows.push(data);
                    }
                  }
                } catch (blobError) {
                  console.warn(`[knowledge-base] AZURE: Failed to load blob ${blob.name}:`, blobError.message);
                }
              }
            }
            console.log(`[knowledge-base] AZURE: ✅ Loaded ${rows.length} documents from Blob storage`);
          } else {
            console.warn('[knowledge-base] AZURE: BLOB service client unavailable');
          }
        } catch (fileError) {
          console.error('[knowledge-base] AZURE: Fallback load failed:', fileError.message);
        }
      }
    }

    res.set({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });

    res.json({
      success: true,
      data: rows,
      total: rows.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in knowledge base function:', error);
    res.status(500).set({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }).json({
      success: false,
      error: 'ナレッジデータの取得に失敗しました',
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}

export const methods = ['get', 'post'];
