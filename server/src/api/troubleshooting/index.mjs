// ESM形式 - トラブルシューティングエンドポイント
// /api/troubleshooting/* にマッピング
// GCSを優先使用、利用できない場合はローカルにフォールバック

import fs from 'fs';
import path from 'path';
import { uploadBufferToGCS, downloadFromGCS, existsInGCS, deleteFromGCS, listFilesInGCS, bucket } from '../../lib/google-cloud-storage.mjs';

// ローカルストレージのベースパス
const LOCAL_BASE_PATH = path.join(process.cwd(), 'knowledge-base');

// GCSが利用可能かどうかをチェック
const useGCS = () => !!bucket;

export default async function troubleshootingHandler(req, res) {
  const method = req.method;
  const pathParts = req.path.split('/').filter(Boolean);

  // /api/troubleshooting/list
  if (pathParts[2] === 'list' && method === 'GET') {
    try {
      console.log('[api/troubleshooting/list] Fetching list');

      const isGCS = useGCS();
      console.log('[api/troubleshooting/list] Storage mode:', isGCS ? 'GCS' : 'local');

      const troubleshootingList = [];

      if (isGCS) {
        // GCSから取得
        console.log('[api/troubleshooting/list] GCS: Using Google Cloud Storage');
        try {
          const files = await listFilesInGCS('chat-exports/troubleshooting/');
          console.log(`[api/troubleshooting/list] GCS: Found ${files.length} files`);

          for (const file of files) {
            if (!file.name.endsWith('.json')) continue;

            try {
              const content = await downloadFromGCS(file.name);
              const jsonData = JSON.parse(content.toString('utf-8'));

              troubleshootingList.push({
                id: jsonData.id || file.name.split('/').pop().replace('.json', ''),
                title: jsonData.title || 'Untitled',
                description: jsonData.description || '',
                lastModified: file.updated,
                fileName: file.name,
                storage: 'gcs'
              });
            } catch (error) {
              console.error(`[api/troubleshooting/list] GCS: Error parsing: ${file.name}`, error);
            }
          }
        } catch (gcsError) {
          console.error('[api/troubleshooting/list] GCS error:', gcsError);
        }
      }

      // ローカルからも取得（GCSが空の場合やフォールバック用）
      if (!isGCS || troubleshootingList.length === 0) {
        console.log('[api/troubleshooting/list] LOCAL: Using local filesystem');
        const localDir = path.join(LOCAL_BASE_PATH, 'troubleshooting');

        if (fs.existsSync(localDir)) {
          const files = fs.readdirSync(localDir);
          console.log(`[api/troubleshooting/list] LOCAL: Found ${files.length} files`);

          for (const fileName of files) {
            if (!fileName.endsWith('.json')) continue;

            try {
              const filePath = path.join(localDir, fileName);
              const stats = fs.statSync(filePath);
              const content = fs.readFileSync(filePath, 'utf-8');
              const jsonData = JSON.parse(content);

              troubleshootingList.push({
                id: jsonData.id || fileName.replace('.json', ''),
                title: jsonData.title || 'Untitled',
                description: jsonData.description || '',
                lastModified: stats.mtime,
                fileName: fileName,
                storage: 'local'
              });
            } catch (error) {
              console.error(`[api/troubleshooting/list] LOCAL: Error parsing ${fileName}:`, error);
            }
          }
        } else {
          console.log('[api/troubleshooting/list] LOCAL: Directory does not exist:', localDir);
        }
      }

      console.log(`[api/troubleshooting/list] Total found: ${troubleshootingList.length} items`);

      return res.json({
        success: true,
        data: troubleshootingList,
        message: `トラブルシューティングリスト取得成功: ${troubleshootingList.length}件`,
        storage: isGCS ? 'gcs' : 'local',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[api/troubleshooting/list] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'リストの取得に失敗しました',
        details: error.message
      });
    }
  }

  // /api/troubleshooting/:id - GET個別取得
  if (pathParts[2] && pathParts[2] !== 'list' && method === 'GET') {
    try {
      const id = pathParts[2];
      console.log(`[api/troubleshooting/:id] Fetching: ${id}`);

      const isGCS = useGCS();
      console.log('[api/troubleshooting/:id] Storage mode:', isGCS ? 'GCS' : 'local');

      // GCSから取得を試みる
      if (isGCS) {
        const gcsPath = `chat-exports/troubleshooting/${id}.json`;
        console.log('[api/troubleshooting/:id] GCS: Checking', gcsPath);
        
        const exists = await existsInGCS(gcsPath);
        if (exists) {
          const content = await downloadFromGCS(gcsPath);
          const jsonData = JSON.parse(content.toString('utf-8'));

          console.log(`[api/troubleshooting/:id] GCS: ✅ Found: ${id}`);
          return res.json({
            success: true,
            data: jsonData,
            storage: 'gcs',
            timestamp: new Date().toISOString()
          });
        }
      }

      // ローカルから取得
      console.log('[api/troubleshooting/:id] LOCAL: Using local filesystem');
      const localDir = path.join(LOCAL_BASE_PATH, 'troubleshooting');
      const filePath = path.join(localDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        console.warn(`[api/troubleshooting/:id] Not found: ${id}`);
        return res.status(404).json({
          success: false,
          message: `トラブルシューティングが見つかりません: ${id}`
        });
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(content);

      console.log(`[api/troubleshooting/:id] LOCAL: ✅ Found: ${id}`);
      return res.json({
        success: true,
        data: jsonData,
        storage: 'local',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`[api/troubleshooting/:id] Error:`, error);
      return res.status(500).json({
        success: false,
        error: 'データの取得に失敗しました',
        details: error.message
      });
    }
  }

  // /api/troubleshooting - POST新規作成
  if (!pathParts[2] && method === 'POST') {
    try {
      const flowData = req.body;
      console.log('[api/troubleshooting POST] Creating:', flowData.id || 'new');

      if (!flowData || !flowData.id) {
        return res.status(400).json({
          success: false,
          message: 'flowDataまたはidが必要です'
        });
      }

      flowData.createdAt = flowData.createdAt || new Date().toISOString();
      flowData.updatedAt = new Date().toISOString();

      const isGCS = useGCS();
      console.log('[api/troubleshooting POST] Storage mode:', isGCS ? 'GCS' : 'local');

      const jsonContent = JSON.stringify(flowData, null, 2);
      const buffer = Buffer.from(jsonContent, 'utf-8');

      // GCSに保存（優先）
      if (isGCS) {
        const gcsPath = `chat-exports/troubleshooting/${flowData.id}.json`;
        console.log('[api/troubleshooting POST] GCS: Saving to', gcsPath);

        await uploadBufferToGCS(buffer, gcsPath, 'application/json');
        console.log(`[api/troubleshooting POST] GCS: ✅ Created: ${flowData.id}`);

        return res.json({
          success: true,
          message: 'トラブルシューティングを保存しました',
          data: flowData,
          storage: 'gcs',
          timestamp: new Date().toISOString()
        });
      }

      // ローカルに保存
      console.log('[api/troubleshooting POST] LOCAL: Using local filesystem');
      const localDir = path.join(LOCAL_BASE_PATH, 'troubleshooting');
      const filePath = path.join(localDir, `${flowData.id}.json`);

      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      fs.writeFileSync(filePath, jsonContent, 'utf-8');
      console.log(`[api/troubleshooting POST] LOCAL: ✅ Created: ${flowData.id}`);

      return res.json({
        success: true,
        message: 'トラブルシューティングを保存しました',
        data: flowData,
        storage: 'local',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[api/troubleshooting POST] Error:', error);
      return res.status(500).json({
        success: false,
        error: '保存に失敗しました',
        details: error.message
      });
    }
  }

  // /api/troubleshooting/:id - PUT更新
  if (pathParts[2] && method === 'PUT') {
    try {
      const id = pathParts[2];
      const flowData = req.body;
      console.log(`[api/troubleshooting PUT] Updating: ${id}`);

      flowData.updatedAt = new Date().toISOString();

      const isGCS = useGCS();
      console.log('[api/troubleshooting PUT] Storage mode:', isGCS ? 'GCS' : 'local');

      const jsonContent = JSON.stringify(flowData, null, 2);
      const buffer = Buffer.from(jsonContent, 'utf-8');

      // GCSで更新（優先）
      if (isGCS) {
        const gcsPath = `chat-exports/troubleshooting/${id}.json`;
        console.log('[api/troubleshooting PUT] GCS: Updating', gcsPath);

        await uploadBufferToGCS(buffer, gcsPath, 'application/json');
        console.log(`[api/troubleshooting PUT] GCS: ✅ Updated: ${id}`);

        return res.json({
          success: true,
          message: 'トラブルシューティングを更新しました',
          data: flowData,
          storage: 'gcs',
          timestamp: new Date().toISOString()
        });
      }

      // ローカルで更新
      console.log('[api/troubleshooting PUT] LOCAL: Using local filesystem');
      const localDir = path.join(LOCAL_BASE_PATH, 'troubleshooting');
      const filePath = path.join(localDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: `トラブルシューティングが見つかりません: ${id}`
        });
      }

      fs.writeFileSync(filePath, jsonContent, 'utf-8');
      console.log(`[api/troubleshooting PUT] LOCAL: ✅ Updated: ${id}`);

      return res.json({
        success: true,
        message: 'トラブルシューティングを更新しました',
        data: flowData,
        storage: 'local',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`[api/troubleshooting PUT] Error:`, error);
      return res.status(500).json({
        success: false,
        error: '更新に失敗しました',
        details: error.message
      });
    }
  }

  // /api/troubleshooting/:id - DELETE削除
  if (pathParts[2] && method === 'DELETE') {
    try {
      const id = pathParts[2];
      console.log(`[api/troubleshooting DELETE] Deleting: ${id}`);

      const isGCS = useGCS();
      console.log('[api/troubleshooting DELETE] Storage mode:', isGCS ? 'GCS' : 'local');

      // GCSから削除（優先）
      if (isGCS) {
        const gcsPath = `chat-exports/troubleshooting/${id}.json`;
        console.log('[api/troubleshooting DELETE] GCS: Deleting', gcsPath);

        const exists = await existsInGCS(gcsPath);
        if (exists) {
          await deleteFromGCS(gcsPath);
          console.log(`[api/troubleshooting DELETE] GCS: ✅ Deleted: ${id}`);

          return res.json({
            success: true,
            message: 'トラブルシューティングを削除しました',
            id: id,
            storage: 'gcs',
            timestamp: new Date().toISOString()
          });
        }
      }

      // ローカルから削除
      console.log('[api/troubleshooting DELETE] LOCAL: Using local filesystem');
      const localDir = path.join(LOCAL_BASE_PATH, 'troubleshooting');
      const filePath = path.join(localDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: `トラブルシューティングが見つかりません: ${id}`
        });
      }

      fs.unlinkSync(filePath);
      console.log(`[api/troubleshooting DELETE] LOCAL: ✅ Deleted: ${id}`);

      return res.json({
        success: true,
        message: 'トラブルシューティングを削除しました',
        id: id,
        storage: 'local',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`[api/troubleshooting DELETE] Error:`, error);
      return res.status(500).json({
        success: false,
        error: '削除に失敗しました',
        details: error.message
      });
    }
  }

  return res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
}

export const methods = ['get', 'post', 'put', 'delete'];
