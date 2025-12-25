// ESM形式 - 応急復旧フローエンドポイント
// /api/emergency-flow/* にマッピング

import fs from 'fs';
import { upload } from '../../infra/blob.mjs';
// Azure Blob関連インポート削除済み - GCSは lib/storage.mjs 使用
import { processGeminiRequest } from '../../lib/gemini.mjs';
import { isAzureEnvironment } from '../../config/env.mjs';
import path from 'path';

// BLOBパスをnorm()で生成（BLOB_PREFIX環境変数に対応）
function buildCandidatePaths(fileName) {
  const baseName = fileName || '';
  // 複数のパターンを試す（過去の保存形式との互換性のため）
  return [
    norm(`troubleshooting/${baseName}`),  // 標準パス
  ];
}

async function resolveBlobClient(containerClient, fileName) {
  const candidates = buildCandidatePaths(fileName);
  console.log('[resolveBlobClient] Searching for:', fileName, 'candidates:', candidates);
  
  for (const blobName of candidates) {
    // BlockBlobClientを使用（読み書き両方可能）
    const blobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blobClient.exists();
    console.log('[resolveBlobClient] Checking:', blobName, 'exists:', exists);
    if (exists) {
      console.log('[resolveBlobClient] ✅ Found:', blobName);
      return { blobClient, blobName };
    }
  }
  console.log('[resolveBlobClient] ❌ Not found in any candidate path');
  return null;
}

export default async function emergencyFlowHandler(req, res) {
  const method = req.method;
  const pathParts = req.path.split('/').filter(Boolean);

  // /api/emergency-flow/list
  if (pathParts[2] === 'list' && method === 'GET') {
    try {
      console.log('[api/emergency-flow/list] Fetching flows');
      
      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      
      console.log('[api/emergency-flow/list] 環境チェック:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });
      
      const flows = [];
      
      // ローカル環境: ローカルファイルシステムから取得
      if (!useAzure) {
        console.log('[api/emergency-flow/list] LOCAL: Reading from local filesystem');
        const localDir = path.resolve(process.cwd(), 'knowledge-base', 'troubleshooting');
        
        if (fs.existsSync(localDir)) {
          const files = fs.readdirSync(localDir);
          console.log(`[api/emergency-flow/list] LOCAL: Found ${files.length} files`);
          
          for (const fileName of files) {
            if (!fileName.endsWith('.json')) continue;
            
            const filePath = path.join(localDir, fileName);
            const stats = fs.statSync(filePath);
            
            // JSONファイルの内容を読み取ってtitleとdescriptionを取得
            let title = fileName;
            let description = '';
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const jsonData = JSON.parse(content);
              title = jsonData.title || fileName;
              description = jsonData.description || '';
            } catch (readError) {
              console.warn(`[api/emergency-flow/list] LOCAL: Could not read ${fileName}:`, readError.message);
            }
            
            flows.push({
              id: fileName.replace('.json', ''),
              name: fileName,
              fileName,
              title,
              description,
              lastModified: stats.mtime,
              size: stats.size,
            });
          }
        } else {
          console.log('[api/emergency-flow/list] LOCAL: Directory does not exist:', localDir);
        }
        
        console.log(`[api/emergency-flow/list] LOCAL: Found ${flows.length} flows`);
        
        return res.json({
          success: true,
          data: flows,
          total: flows.length,
          storage: 'local',
          timestamp: new Date().toISOString()
        });
      }
      
      // Azure環境: BLOBストレージから取得
      console.log('[api/emergency-flow/list] AZURE: Reading from BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      
      if (!blobServiceClient) {
        console.error('[api/emergency-flow/list] AZURE: ❌ BLOB client not available');
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available (Azure環境)'
        });
      }

      try {
        const containerClient = blobServiceClient.getContainerClient(containerName);

        const containerExists = await containerClient.exists();
        if (!containerExists) {
          console.error(`[api/emergency-flow/list] AZURE: Container not found: ${containerName}`);
          return res.json({
            success: true,
            data: flows,
            total: flows.length,
            storage: 'blob',
            message: `Container "${containerName}" not found`,
            timestamp: new Date().toISOString()
          });
        }

        // norm()でBLOB_PREFIXを自動適用
        const prefix = norm('troubleshooting/');
        const seen = new Set();

        console.log(`[api/emergency-flow/list] AZURE: Listing with prefix: ${prefix}`);
        for await (const blob of containerClient.listBlobsFlat({ prefix })) {
          if (!blob.name.endsWith('.json')) continue;
          const fileName = blob.name.split('/').pop();
          if (!fileName) continue;
          if (seen.has(fileName)) continue;
          seen.add(fileName);
          
          // JSONファイルの内容を読み取ってtitleとdescriptionを取得
          let title = fileName;
          let description = '';
          try {
            const blobClient = containerClient.getBlobClient(blob.name);
            const downloadResponse = await blobClient.download();
            if (downloadResponse.readableStreamBody) {
              const chunks = [];
              for await (const chunk of downloadResponse.readableStreamBody) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
              }
              const buffer = Buffer.concat(chunks);
              const jsonData = JSON.parse(buffer.toString('utf-8'));
              title = jsonData.title || fileName;
              description = jsonData.description || '';
            }
          } catch (readError) {
            console.warn(`[api/emergency-flow/list] AZURE: Could not read ${fileName}:`, readError.message);
          }
          
          const flowData = {
            id: fileName.replace('.json', ''),
            name: fileName,
            fileName,
            blobName: blob.name,
            title,
            description,
            lastModified: blob.properties.lastModified,
            size: blob.properties.contentLength,
          };
          flows.push(flowData);
          console.log(`[api/emergency-flow/list] AZURE: ✅ Flow: ${flowData.id} - ${title}`);
        }
        
        console.log(`[api/emergency-flow/list] AZURE: Found ${flows.length} flows`);
        if (flows.length > 0) {
          console.log('[api/emergency-flow/list] AZURE: フロー一覧:', flows.map(f => f.id));
        }
      } catch (blobError) {
        console.error('[api/emergency-flow/list] AZURE: BLOB error:', blobError);
        return res.status(500).json({
          success: false,
          error: 'BLOB error occurred',
          details: blobError.message,
          timestamp: new Date().toISOString()
        });
      }

      return res.json({
        success: true,
        data: flows,
        total: flows.length,
        storage: 'blob',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[api/emergency-flow/list] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'フロー一覧の取得に失敗しました',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // /api/emergency-flow/detail/:id - GET詳細取得（JSONパース済み）
  if (pathParts[2] === 'detail' && pathParts[3] && method === 'GET') {
    try {
      // URLエンコードされたパスをデコード（日本語ファイル名対応）
      const decodedFlowId = decodeURIComponent(pathParts[3]).replace('.json', '');
      const flowId = decodedFlowId;
      const fileName = flowId.endsWith('.json') ? flowId : `${flowId}.json`;
      console.log(`[api/emergency-flow/detail] Fetching detail: ${flowId}`);
      
      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      
      console.log('[api/emergency-flow/detail] 環境チェック:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });

      // ローカル環境: ローカルファイルシステムから取得
      if (!useAzure) {
        console.log('[api/emergency-flow/detail] LOCAL: Reading from local filesystem');
        const localDir = path.resolve(process.cwd(), 'knowledge-base', 'troubleshooting');
        const localFilePath = path.join(localDir, fileName);
        
        if (!fs.existsSync(localFilePath)) {
          console.warn('[api/emergency-flow/detail] LOCAL: File not found:', localFilePath);
          return res.status(404).json({ 
            success: false, 
            error: 'フローが見つかりません',
            fileName: fileName,
            flowId: flowId
          });
        }
        
        const content = fs.readFileSync(localFilePath, 'utf-8');
        const jsonData = JSON.parse(content);
        
        console.log('[api/emergency-flow/detail] LOCAL: ✅ フロー詳細取得完了');
        console.log('[api/emergency-flow/detail] LOCAL: steps:', jsonData.steps?.length || 0, '件');
        
        return res.json({
          success: true,
          data: jsonData,
          storage: 'local',
          ...jsonData
        });
      }

      // Azure環境: BLOBストレージから取得
      console.log('[api/emergency-flow/detail] AZURE: Reading from BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available (Azure環境)'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      console.log('[api/emergency-flow/detail] AZURE: コンテナ名:', containerName);
      
      const resolved = await resolveBlobClient(containerClient, fileName);
      if (!resolved) {
        console.warn('[api/emergency-flow/detail] AZURE: ❌ Blob not found for', fileName);
        return res.status(404).json({ 
          success: false, 
          error: 'フローが見つかりません',
          fileName: fileName,
          flowId: flowId
        });
      }

      console.log(`[api/emergency-flow/detail] AZURE: ✅ BLOB path: ${resolved.blobName}`);
      const downloadResponse = await resolved.blobClient.download();
      
      // JSONとしてパースして返す
      const chunks = [];
      if (downloadResponse.readableStreamBody) {
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const jsonData = JSON.parse(buffer.toString('utf8'));
        
        console.log('[api/emergency-flow/detail] AZURE: ✅ フロー詳細取得完了');
        console.log('[api/emergency-flow/detail] AZURE: steps:', jsonData.steps?.length || 0, '件');
        
        return res.json({
          success: true,
          data: jsonData,
          storage: 'blob',
          ...jsonData
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'データの読み込みに失敗しました'
      });
    } catch (error) {
      console.error('[api/emergency-flow/detail] ❌ Error:', error);
      return res.status(404).json({
        success: false,
        error: 'フロー詳細の取得に失敗しました',
        details: error.message
      });
    }
  }

  // /api/emergency-flow/:fileName - GET個別取得（生データ）
  if (pathParts[2] && !pathParts[2].includes('list') && !pathParts[2].includes('detail') && !pathParts[2].includes('image') && !pathParts[2].includes('save') && !pathParts[2].includes('generate') && method === 'GET') {
    try {
      // URLエンコードされたパスをデコード（日本語ファイル名対応）
      const decodedPath = decodeURIComponent(pathParts[2]);
      // .json拡張子を確実に付ける
      const fileName = decodedPath.endsWith('.json') ? decodedPath : `${decodedPath}.json`;
      console.log(`[api/emergency-flow] Fetching:`, { pathParts2: pathParts[2], decoded: decodedPath, fileName });

      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      console.log('[api/emergency-flow] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });

      // ローカル環境: ローカルファイルシステムから取得
      if (!useAzure) {
        console.log('[api/emergency-flow] LOCAL: Using local filesystem');
        const basePath = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
        const filePath = path.join(basePath, fileName);

        if (!fs.existsSync(filePath)) {
          console.warn('[api/emergency-flow] LOCAL: File not found:', filePath);
          return res.status(404).json({ success: false, error: 'フローが見つかりません' });
        }

        const content = await fs.promises.readFile(filePath, 'utf-8');
        console.log('[api/emergency-flow] LOCAL: ✅ Loaded from local filesystem:', filePath);

        res.setHeader('Content-Type', 'application/json');
        return res.send(content);
      }

      // Azure環境: BLOBストレージから取得
      console.log('[api/emergency-flow] AZURE: Using BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      console.log('[api/emergency-flow] AZURE: BLOBクライアント:', blobServiceClient ? '取得成功' : '取得失敗');
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const resolved = await resolveBlobClient(containerClient, fileName);
      if (!resolved) {
        console.warn('[api/emergency-flow] AZURE: Blob not found for', fileName);
        return res.status(404).json({ success: false, error: 'フローが見つかりません' });
      }

      console.log(`[api/emergency-flow] AZURE: ✅ BLOB path: ${resolved.blobName}`);
      const downloadResponse = await resolved.blobClient.download();
      const contentType = downloadResponse.contentType || 'application/json';

      res.setHeader('Content-Type', contentType);
      downloadResponse.readableStreamBody.pipe(res);
    } catch (error) {
      console.error('[api/emergency-flow] Error:', error);
      return res.status(404).json({
        success: false,
        error: 'フローが見つかりません',
        details: error.message
      });
    }
    return;
  }

  // /api/emergency-flow/save - POST保存
  if (pathParts[2] === 'save' && method === 'POST') {
    try {
      console.log('[api/emergency-flow/save] Saving flow data');

      const { flowData, flowId } = req.body;
      if (!flowData) {
        return res.status(400).json({ 
          success: false, 
          error: 'flowData is required' 
        });
      }

      const useAzure = isAzureEnvironment();
      const content = typeof flowData === 'string' ? flowData : JSON.stringify(flowData, null, 2);
      const fileName = `${flowId || 'flow-' + Date.now()}.json`;

      // ローカルモード: knowledge-base/troubleshooting/ へ保存
      if (!useAzure) {
        const localDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
        await fs.promises.mkdir(localDir, { recursive: true });
        const localPath = path.join(localDir, fileName);
        await fs.promises.writeFile(localPath, content, 'utf-8');
        
        console.log(`[api/emergency-flow/save] LOCAL: Saved successfully to: ${localPath}`);
        
        return res.json({
          success: true,
          message: 'Flow data saved successfully',
          filePath: localPath,
          fileName: fileName,
          timestamp: new Date().toISOString()
        });
      }

      // Azureモード: BLOBストレージへ保存
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        console.error('[api/emergency-flow/save] ❌ BLOB service client not available');
        return res.status(503).json({ 
          success: false, 
          error: 'BLOB storage not available' 
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // コンテナが存在するか確認
      const containerExists = await containerClient.exists();
      if (!containerExists) {
        console.log('[api/emergency-flow/save] Creating container:', containerName);
        await containerClient.create();
      }
      
      // 既存データとの互換性のため base付きとなし両方で保存を試みる
      const blobNamePrimary = norm(`troubleshooting/${fileName}`);
      const blobClientPrimary = containerClient.getBlockBlobClient(blobNamePrimary);

      console.log('[api/emergency-flow/save] AZURE: Saving flow data to BLOB');
      console.log('[api/emergency-flow/save]   Container:', containerName);
      console.log('[api/emergency-flow/save]   BLOB path:', blobNamePrimary);
      console.log('[api/emergency-flow/save]   Flow ID:', flowId);

      await blobClientPrimary.upload(content, content.length, {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });

      console.log(`[api/emergency-flow/save] ✅ Saved successfully to: ${blobNamePrimary}`);

      // baseなしプレフィックスにもベストエフォートで保存（既存ファイル構造との互換性）
      try {
        const altName = `troubleshooting/${fileName}`;
        const altClient = containerClient.getBlockBlobClient(altName);
        await altClient.upload(content, content.length, {
          blobHTTPHeaders: { blobContentType: 'application/json' }
        });
        console.log(`[api/emergency-flow/save] Also saved to: ${altName}`);
      } catch (altErr) {
        console.warn('[api/emergency-flow/save] Alt prefix save skipped:', altErr.message);
      }

      return res.json({
        success: true,
        message: 'Flow data saved successfully',
        blobName: blobNamePrimary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('[api/emergency-flow/save] Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }

  // /api/emergency-flow/upload-image - POST画像アップロード
  if (pathParts[2] === 'upload-image' && method === 'POST') {
    // multerミドルウェアを手動で適用
    return upload.single('image')(req, res, async (err) => {
      if (err) {
        console.error('[api/emergency-flow/upload-image] ❌ Multer error:', {
          message: err.message,
          code: err.code,
          field: err.field,
          stack: err.stack,
          name: err.name
        });
        return res.status(500).json({
          success: false,
          error: 'ファイルのアップロードに失敗しました',
          details: err.message,
          code: err.code
        });
      }

      try {
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'ファイルがアップロードされていません'
          });
        }

        console.log('[api/emergency-flow/upload-image] 📤 Request details:', {
          fileName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          stepId: req.body.stepId,
          flowId: req.body.flowId || 'not provided',
          bodyKeys: Object.keys(req.body)
        });

        // 画像形式のバリデーション（JPG/PNG/BMPのみ）
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/bmp'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
          console.error('[api/emergency-flow/upload-image] Invalid file type:', req.file.mimetype);
          return res.status(400).json({
            success: false,
            error: `サポートされていないファイル形式です。JPG、PNG、BMPのみアップロード可能です。`,
            details: `受信したファイル形式: ${req.file.mimetype}`
          });
        }

        const timestamp = Date.now();
        const ext = path.extname(req.file.originalname);
        const fileName = `emergency_flow_${timestamp}${ext}`;

        // Azure環境かどうかを判定
        const useAzure = isAzureEnvironment();
        console.log('[api/emergency-flow/upload-image] Environment check:', {
          NODE_ENV: process.env.NODE_ENV,
          STORAGE_MODE: process.env.STORAGE_MODE,
          isAzureEnvironment: useAzure
        });

        // ローカル環境: ローカルファイルシステムのみ使用
        if (!useAzure) {
          console.log('[api/emergency-flow/upload-image] LOCAL: Using local filesystem');
          const localDir = path.join(process.cwd(), 'knowledge-base', 'images', 'troubleshooting');
          
          if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
          }
          
          const localPath = path.join(localDir, fileName);
          fs.writeFileSync(localPath, req.file.buffer);
          
          console.log('[api/emergency-flow/upload-image] LOCAL: ✅ Saved to local filesystem:', localPath);
          const imageUrl = `/api/images/troubleshooting/${fileName}`;
          
          return res.json({
            success: true,
            imageUrl: imageUrl,
            fileName: fileName,
            imageFileName: fileName,  // クライアントとの互換性のため
            size: req.file.size,
            storage: 'local'
          });
        }

        // Azure環境: BLOBストレージのみ使用
        console.log('[api/emergency-flow/upload-image] AZURE: Using BLOB storage');
        const blobServiceClient = getBlobServiceClient();
        if (!blobServiceClient) {
          return res.status(503).json({
            success: false,
            error: 'BLOB storage not available'
          });
        }

        const containerClient = blobServiceClient.getContainerClient(containerName);
        // norm()を使用してBLOB_PREFIXを自動適用
        const blobName = norm(`images/troubleshooting/${fileName}`);
        console.log('[api/emergency-flow/upload-image] AZURE: Uploading to Blob:', blobName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        const containerExists = await containerClient.exists();
        if (!containerExists) {
          await containerClient.createIfNotExists();
        }

        await blockBlobClient.uploadData(req.file.buffer, {
          blobHTTPHeaders: {
            blobContentType: req.file.mimetype
          },
          metadata: {
            originalName: req.file.originalname,
            uploadedAt: new Date().toISOString()
          }
        });

        console.log(`[api/emergency-flow/upload-image] AZURE: ✅ アップロード完了: ${blobName}`);

        const imageUrl = `/api/images/emergency-flows/${fileName}`;

        return res.json({
          success: true,
          imageUrl: imageUrl,
          fileName: fileName,
          imageFileName: fileName,  // クライアントとの互換性のため
          blobName: blobName,
          size: req.file.size,
          storage: 'blob'
        });
      } catch (error) {
        console.error('[api/emergency-flow/upload-image] ❌ Error:', {
          message: error.message,
          stack: error.stack,
          fileName: req.file?.originalname,
          stepId: req.body.stepId,
          flowId: req.body.flowId
        });
        return res.status(500).json({
          success: false,
          error: '画像のアップロードに失敗しました',
          details: error.message
        });
      }
    });
  }

  // /api/emergency-flow/image/:fileName - DELETE画像削除
  if (pathParts[2] === 'image' && pathParts[3] && method === 'DELETE') {
    try {
      const fileName = pathParts[3];
      console.log('[api/emergency-flow/delete-image] Deleting:', fileName);

      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      console.log('[api/emergency-flow/delete-image] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });

      // ローカル環境: ローカルファイルシステムから削除
      if (!useAzure) {
        console.log('[api/emergency-flow/delete-image] LOCAL: Using local filesystem');
        const localFilePath = path.join(process.cwd(), 'knowledge-base', 'images', 'emergency-flows', fileName);

        if (!fs.existsSync(localFilePath)) {
          console.log('[api/emergency-flow/delete-image] LOCAL: Image not found:', localFilePath);
          return res.status(404).json({
            success: false,
            error: '画像が見つかりません'
          });
        }

        await fs.promises.unlink(localFilePath);
        console.log('[api/emergency-flow/delete-image] LOCAL: ✅ Deleted from local filesystem:', localFilePath);

        return res.json({
          success: true,
          message: '画像を削除しました',
          deletedFile: fileName,
          storage: 'local'
        });
      }

      // Azure環境: BLOBストレージから削除
      console.log('[api/emergency-flow/delete-image] AZURE: Using BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      // norm()を使用してBLOB_PREFIXを自動適用
      const blobName = norm(`images/emergency-flows/${fileName}`);
      console.log('[api/emergency-flow/delete-image] AZURE: 削除試行パス:', blobName);
      const blobClient = containerClient.getBlobClient(blobName);

      const exists = await blobClient.exists();
      if (!exists) {
        console.log('[api/emergency-flow/delete-image] AZURE: Image not found:', blobName);
        return res.status(404).json({
          success: false,
          error: '画像が見つかりません'
        });
      }

      await blobClient.delete();
      console.log(`[api/emergency-flow/delete-image] AZURE: ✅ Deleted: ${blobName}`);

      return res.json({
        success: true,
        message: '画像を削除しました',
        deletedFile: fileName,
        storage: 'azure'
      });
    } catch (error) {
      console.error('[api/emergency-flow/delete-image] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // /api/emergency-flow/generate - POSTフロー生成（GPT統合）
  if (pathParts[2] === 'generate' && method === 'POST') {
    try {
      const { keyword } = req.body;
      console.log('[api/emergency-flow/generate] Generate request:', keyword);

      if (!keyword) {
        return res.status(400).json({
          success: false,
          error: 'キーワードが必要です'
        });
      }

      const timestamp = Date.now();
      let flowTemplate;

      // Google Gemini APIを使用してフロー生成
      console.log('[api/emergency-flow/generate] 🤖 Using Google Gemini to generate flow for keyword:', keyword);

      const prompt = `建設機械の応急処置フローをJSON形式で生成してください。
キーワード: ${keyword}

以下の構造でJSONを生成してください。必ず5～6ステップ以上のフローにしてください:
{
  "title": "フローのタイトル（${keyword}に関連）",
  "description": "フローの説明",
  "triggerKeywords": ["${keyword}", "関連キーワード1", "関連キーワード2"],
  "steps": [
    {
      "id": "step1",
      "type": "step",
      "title": "安全確認",
      "description": "作業前の安全確保",
      "message": "機械を停止し、周囲の安全を確保してください",
      "nextStep": "step2"
    },
    {
      "id": "step2",
      "type": "step",
      "title": "症状の確認",
      "description": "${keyword}の症状を詳しく確認",
      "message": "故障の状態を確認し、記録してください",
      "nextStep": "step3"
    },
    {
      "id": "step3",
      "type": "decision",
      "title": "緊急度の判断",
      "description": "即座の対応が必要か判断",
      "message": "作業を継続できますか？",
      "options": [
        { "label": "継続可能", "nextStep": "step4" },
        { "label": "継続不可", "nextStep": "step5" }
      ]
    },
    {
      "id": "step4",
      "type": "step",
      "title": "応急処置",
      "description": "${keyword}に対する応急的な対処",
      "message": "一時的な処置を実施してください",
      "nextStep": "step6"
    },
    {
      "id": "step5",
      "type": "step",
      "title": "作業中止・退避",
      "description": "安全な場所への移動",
      "message": "機械を安全な場所に移動し、作業を中止してください",
      "nextStep": "step6"
    },
    {
      "id": "step6",
      "type": "step",
      "title": "記録と報告",
      "description": "状況の記録と関係者への報告",
      "message": "写真撮影、記録、上司への報告を行ってください",
      "nextStep": "complete"
    }
  ]
}

【重要】必ず守ること:
1. 最低5～6ステップ以上のフローを生成すること（上記の例を参考に）
2. 安全確認 → 症状確認 → 判断分岐 → 応急処置/中止 → 報告の流れを必ず含めること
3. stepタイプ: 通常の作業ステップ（nextStepで次のステップIDを指定）
4. decisionタイプ: 判断分岐ポイント（optionsで選択肢を提供）
5. 最終ステップのnextStepは必ず "complete" にすること
6. ${keyword}に応じた具体的で実践的な作業手順を含めること
7. 建設機械の専門用語を使用すること
8. **必ずJSON形式のみで返答してください。説明文などは含めないでください。**`;

      try {
        const geminiResponse = await processGeminiRequest(
          `あなたは建設機械の保守・メンテナンスの専門家です。安全で実践的な応急処置フローを生成してください。\n\n${prompt}`,
          { temperature: 0.7, maxOutputTokens: 3000 }
        );
          console.log('[api/emergency-flow/generate] ✅ GPT response received');
          
          const parsedFlow = JSON.parse(gptResponse);
          const title = parsedFlow.title || keyword;
          
          // タイトルからファイル名を生成（日本語対応）
          const sanitizedTitle = title
            .replace(/[<>:"/\\|?*]/g, '') // 無効な文字を削除
            .replace(/\s+/g, '_')         // スペースをアンダースコアに
            .substring(0, 50);            // 50文字に制限
          const flowId = `${sanitizedTitle}_${timestamp}`;
          
          flowTemplate = {
            id: flowId,
            title: title,
            description: parsedFlow.description || `キーワード「${keyword}」から自動生成された応急処置フロー`,
            triggerKeywords: parsedFlow.triggerKeywords || [keyword],
            steps: parsedFlow.steps || [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          generatedBy: 'Google Gemini'
        };

        console.log('[api/emergency-flow/generate] ✅ Flow generated:', {
          title: flowTemplate.title,
          flowId: flowId,
          steps: flowTemplate.steps.length
        });
      } catch (geminiError) {
        console.error('[api/emergency-flow/generate] ❌ Gemini generation failed:', geminiError.message);
        // Gemini失敗時はフォールバック
        const tempFlowId = `flow_${timestamp}`;
        flowTemplate = createFallbackTemplate(tempFlowId, keyword);
        const sanitizedTitle = flowTemplate.title
          .replace(/[<>:"/\\|?*]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 50);
        const flowId = `${sanitizedTitle}_${timestamp}`;
        flowTemplate.id = flowId;
      }

      // 🔧 生成したフローを保存
      console.log('[api/emergency-flow/generate] 🔍 保存診断開始');
      
      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      
      console.log('[api/emergency-flow/generate] 環境チェック:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure,
        flowId: flowTemplate.id,
        title: flowTemplate.title
      });
      
      const fileName = `${flowTemplate.id}.json`;
      
      // ローカル環境: ローカルファイルシステムのみ使用
      if (!useAzure) {
        console.log('[api/emergency-flow/generate] LOCAL: Using local filesystem');
        
        const localDir = path.resolve(process.cwd(), 'knowledge-base', 'troubleshooting');
        const localFilePath = path.join(localDir, fileName);
        
        // ディレクトリが存在しない場合は作成
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
          console.log('[api/emergency-flow/generate] LOCAL: Created local directory:', localDir);
        }
        
        // ファイルを保存
        const content = JSON.stringify(flowTemplate, null, 2);
        fs.writeFileSync(localFilePath, content, 'utf-8');
        console.log('[api/emergency-flow/generate] LOCAL: ✅ Flow saved to local filesystem:', localFilePath);
        
        return res.json({
          success: true,
          data: flowTemplate,
          saved: true,
          fileName: fileName,
          storage: 'local',
          message: `フローを生成してローカルに保存しました (${fileName})`
        });
      }
      
      // Azure環境: BLOBストレージのみ使用
      console.log('[api/emergency-flow/generate] AZURE: Using BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      
      if (!blobServiceClient) {
        console.error('[api/emergency-flow/generate] AZURE: ❌ BLOB service client not available');
        console.error('[api/emergency-flow/generate] Azure BLOB Storage is no longer supported, use STORAGE_MODE=gcs');
        return res.status(503).json({
          success: false,
          error: 'Azure BLOB Storage is no longer supported, use STORAGE_MODE=gcs'
        });
      }
      
      try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        console.log('[api/emergency-flow/generate] AZURE: コンテナ名:', containerName);
        
        // コンテナが存在するか確認し、なければ作成
        const containerExists = await containerClient.exists();
        console.log('[api/emergency-flow/generate] AZURE: コンテナ存在確認:', containerExists ? 'あり' : 'なし');
        if (!containerExists) {
          console.log('[api/emergency-flow/generate] AZURE: Creating container:', containerName);
          await containerClient.create();
        }
        
        const blobName = norm(`troubleshooting/${fileName}`);
        
        console.log('[api/emergency-flow/generate] AZURE: ✅ Saving generated flow to BLOB');
        console.log('[api/emergency-flow/generate] AZURE:   Container:', containerName);
        console.log('[api/emergency-flow/generate] AZURE:   BLOB path:', blobName);
        console.log('[api/emergency-flow/generate] AZURE:   File name:', fileName);
        
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const content = JSON.stringify(flowTemplate, null, 2);
        
        await blockBlobClient.upload(content, content.length, {
          blobHTTPHeaders: { blobContentType: 'application/json' },
          metadata: {
            generatedFrom: 'keyword',
            createdAt: new Date().toISOString()
          }
        });
        
        console.log('[api/emergency-flow/generate] AZURE: ✅ Flow saved successfully to BLOB:', blobName);
        
        return res.json({
          success: true,
          data: flowTemplate,
          saved: true,
          blobName: blobName,
          fileName: fileName,
          storage: 'blob',
          message: `フローを生成してBLOBに保存しました (${blobName})`
        });
      } catch (blobError) {
        console.error('[api/emergency-flow/generate] AZURE: ❌ BLOB save failed:', blobError);
        console.error('[api/emergency-flow/generate] AZURE: Error details:', blobError.stack);
        return res.status(500).json({
          success: false,
          error: 'BLOB保存に失敗しました',
          details: blobError.message
        });
      }
    } catch (error) {
      console.error('[api/emergency-flow/generate] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // /api/emergency-flow/:id - PUT更新（編集後の差分上書き）
  if (pathParts[2] && method === 'PUT') {
    try {
      // URLエンコードされたパスをデコード（日本語ファイル名対応）
      const decodedId = decodeURIComponent(pathParts[2]);
      const flowId = decodedId.replace('.json', '');
      const fileName = flowId.endsWith('.json') ? flowId : `${flowId}.json`;
      const flowData = req.body;

      console.log('[api/emergency-flow/PUT] 🔍 PUT診断:');
      console.log('[api/emergency-flow/PUT]   受信したpathParts[2]:', pathParts[2]);
      console.log('[api/emergency-flow/PUT]   デコード後:', decodedId);
      console.log('[api/emergency-flow/PUT]   生成したflowId:', flowId);
      console.log('[api/emergency-flow/PUT]   生成したfileName:', fileName);
      console.log('[api/emergency-flow/PUT]   flowData.id:', flowData?.id);
      console.log('[api/emergency-flow/PUT]   flowData.title:', flowData?.title);
      console.log('[api/emergency-flow/PUT]   flowData.steps:', flowData?.steps?.length || 0, '件');
      
      // 画像情報をログ出力
      let totalImages = 0;
      if (Array.isArray(flowData?.steps)) {
        flowData.steps.forEach((step, idx) => {
          if (step.images && Array.isArray(step.images)) {
            totalImages += step.images.length;
            console.log(`[api/emergency-flow/PUT]   Step ${idx + 1} 画像:`, step.images.length, '枚', 
              step.images.map(img => img.fileName || 'unknown'));
          }
        });
      }
      console.log('[api/emergency-flow/PUT]   合計画像数:', totalImages);
      console.log('[api/emergency-flow/PUT] Updating flow:', flowId);

      const useAzure = isAzureEnvironment();

      // 新しいフローの画像ファイル名を収集
      const newImageFileNames = new Set();
      if (Array.isArray(flowData.steps)) {
        flowData.steps.forEach(step => {
          if (step.images && Array.isArray(step.images)) {
            step.images.forEach(image => {
              if (image.fileName) {
                newImageFileNames.add(image.fileName);
              }
            });
          }
        });
      }

      const imageCount = newImageFileNames.size;
      console.log(`[api/emergency-flow/PUT] 新しいフローの画像数: ${imageCount}`);

      // ローカルモード: knowledge-base/ で更新
      if (!useAzure) {
        const baseDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
        const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images', 'emergency-flows');
        
        const files = await fs.promises.readdir(baseDir);
        const targetFile = files.find(f => f === fileName || f.includes(flowId));
        
        if (!targetFile) {
          return res.status(404).json({
            success: false,
            error: 'フローが見つかりません'
          });
        }
        
        const filePath = path.join(baseDir, targetFile);
        
        // 既存のフローデータを取得して画像の差分を確認
        let oldImageFileNames = new Set();
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const oldJsonData = JSON.parse(content);
          
          if (Array.isArray(oldJsonData.steps)) {
            oldJsonData.steps.forEach(step => {
              if (step.images && Array.isArray(step.images)) {
                step.images.forEach(image => {
                  if (image.fileName) {
                    oldImageFileNames.add(image.fileName);
                  }
                });
              }
            });
          }
          console.log(`[api/emergency-flow/PUT] LOCAL: 既存フローの画像数: ${oldImageFileNames.size}`);
        } catch (readError) {
          console.warn('[api/emergency-flow/PUT] LOCAL: Could not read old flow for diff:', readError.message);
        }
        
        // 削除された画像をクリーンアップ
        const imagesToDelete = [...oldImageFileNames].filter(fileName => !newImageFileNames.has(fileName));
        if (imagesToDelete.length > 0) {
          console.log(`[api/emergency-flow/PUT] LOCAL: 🗑️ 削除対象の画像: ${imagesToDelete.length}件`);
          let deletedCount = 0;
          for (const imageFileName of imagesToDelete) {
            try {
              const imageFilePath = path.join(imagesDir, imageFileName);
              if (await fs.promises.access(imageFilePath).then(() => true).catch(() => false)) {
                await fs.promises.unlink(imageFilePath);
                deletedCount++;
                console.log(`[api/emergency-flow/PUT] LOCAL: ✅ 画像削除成功: ${imageFileName}`);
              }
            } catch (imgError) {
              console.warn(`[api/emergency-flow/PUT] LOCAL: ❌ 画像削除失敗 ${imageFileName}:`, imgError.message);
            }
          }
          console.log(`[api/emergency-flow/PUT] LOCAL: 画像クリーンアップ完了: ${deletedCount}/${imagesToDelete.length}件削除`);
        }
        
        // updatedAtを更新して保存
        const updatedFlowData = {
          ...flowData,
          updatedAt: new Date().toISOString()
        };
        
        const content = JSON.stringify(updatedFlowData, null, 2);
        await fs.promises.writeFile(filePath, content, 'utf-8');
        
        console.log(`[api/emergency-flow/PUT] LOCAL: ✅ Updated successfully: ${targetFile}`);
        
        return res.json({
          success: true,
          message: 'フローを更新しました',
          data: updatedFlowData,
          fileName: targetFile,
          imageCount: imageCount,
          deletedImages: imagesToDelete.length
        });
      }

      // GCSモード対応が必要な場合は lib/storage.mjs を使用
      console.log('[api/emergency-flow/PUT] GCS: Storage mode:', {
        STORAGE_MODE: process.env.STORAGE_MODE,
        GCS_BUCKET: process.env.GOOGLE_CLOUD_STORAGE_BUCKET
      });

      const blobServiceClient = getBlobServiceClient();
      console.log('[api/emergency-flow/PUT] AZURE: BLOBクライアント:', blobServiceClient ? '取得成功' : '取得失敗');
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // 既存のBLOBを探す
      const resolved = await resolveBlobClient(containerClient, fileName);
      
      if (!resolved) {
        return res.status(404).json({
          success: false,
          error: 'フローが見つかりません'
        });
      }

      console.log('[api/emergency-flow/PUT] AZURE: ✅ BLOB発見:', resolved.blobName);
      const blobClient = resolved.blobClient;
      const blobName = resolved.blobName;

      // 🔍 既存のフローデータを取得して画像の差分を確認
      let oldImageFileNames = new Set();
      try {
        const downloadResponse = await blobClient.download();
        if (downloadResponse.readableStreamBody) {
          const chunks = [];
          for await (const chunk of downloadResponse.readableStreamBody) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          const oldJsonData = JSON.parse(buffer.toString('utf-8'));
          
          // 既存フローの画像ファイル名を収集
          if (Array.isArray(oldJsonData.steps)) {
            oldJsonData.steps.forEach(step => {
              if (step.images && Array.isArray(step.images)) {
                step.images.forEach(image => {
                  if (image.fileName) {
                    oldImageFileNames.add(image.fileName);
                  }
                });
              }
            });
          }
          console.log(`[api/emergency-flow/PUT] AZURE: 既存フローの画像数: ${oldImageFileNames.size}`);
        }
      } catch (downloadError) {
        console.warn('[api/emergency-flow/PUT] AZURE: Could not download old flow for diff:', downloadError.message);
      }

      // updatedAtを更新
      const updatedFlowData = {
        ...flowData,
        updatedAt: new Date().toISOString()
      };

      // 画像数をログ出力（newImageFileNamesは既に定義済み）
      console.log(`[api/emergency-flow/PUT] AZURE: 新しいフローの画像数: ${imageCount}`);

      // 🗑️ 削除された画像をクリーンアップ
      const imagesToDelete = [...oldImageFileNames].filter(fileName => !newImageFileNames.has(fileName));
      if (imagesToDelete.length > 0) {
        console.log(`[api/emergency-flow/PUT] 🗑️ 削除対象の画像: ${imagesToDelete.length}件`);
        console.log('[api/emergency-flow/PUT] 削除対象:', imagesToDelete);
        
        let deletedCount = 0;
        for (const imageFileName of imagesToDelete) {
          try {
            // norm()を使用してBLOB_PREFIXを自動適用
            const imageBlobName = norm(`images/emergency-flows/${imageFileName}`);
            console.log(`[api/emergency-flow/PUT] 🗑️ 削除試行: ${imageBlobName}`);
            const imageBlob = containerClient.getBlockBlobClient(imageBlobName);
            const exists = await imageBlob.exists();
            if (exists) {
              await imageBlob.delete();
              deletedCount++;
              console.log(`[api/emergency-flow/PUT] ✅ 画像削除成功: ${imageFileName}`);
            } else {
              console.log(`[api/emergency-flow/PUT] ⚠️ 画像が既に存在しません: ${imageFileName} (試行パス: ${imageBlobName})`);
            }
          } catch (imgError) {
            console.warn(`[api/emergency-flow/PUT] ❌ 画像削除失敗 ${imageFileName}:`, imgError.message);
          }
        }
        console.log(`[api/emergency-flow/PUT] 画像クリーンアップ完了: ${deletedCount}/${imagesToDelete.length}件削除`);
      } else {
        console.log('[api/emergency-flow/PUT] 削除対象の画像はありません');
      }

      const content = JSON.stringify(updatedFlowData, null, 2);
      const buffer = Buffer.from(content, 'utf-8');

      // 差分で上書き保存（既存データを完全に置き換え）
      await blobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: { 
          blobContentType: 'application/json; charset=utf-8'
        },
        metadata: {
          lastModified: new Date().toISOString()
        }
      });

      console.log(`[api/emergency-flow/PUT] ✅ Updated successfully: ${blobName}`);

      return res.json({
        success: true,
        message: 'フローを更新しました',
        data: updatedFlowData,
        blobName: blobName,
        imageCount: imageCount,
        deletedImages: imagesToDelete.length
      });
    } catch (error) {
      console.error('[api/emergency-flow/PUT] ❌ Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // /api/emergency-flow/:id - DELETE削除
  if (pathParts[2] && method === 'DELETE') {
    try {
      // URLエンコードされたパスをデコード（日本語ファイル名対応）
      const decodedId = decodeURIComponent(pathParts[2]);
      const flowId = decodedId.replace('.json', '');
      // .json拡張子を確実に付ける
      const fileName = flowId.endsWith('.json') ? flowId : `${flowId}.json`;
      console.log('[api/emergency-flow/delete] Deleting:', { pathParts2: pathParts[2], decodedId, flowId, fileName });

      const useAzure = isAzureEnvironment();

      // ローカルモード: knowledge-base/ から削除
      if (!useAzure) {
        const baseDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting');
        const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images', 'emergency-flows');
        
        const files = await fs.promises.readdir(baseDir);
        const targetFile = files.find(f => f === fileName || f === `${fileName}.json`);
        
        if (!targetFile) {
          return res.status(404).json({
            success: false,
            error: 'フローが見つかりません'
          });
        }
        
        const filePath = path.join(baseDir, targetFile);
        
        // JSONを読み取って画像ファイル名を取得
        let imagesToDelete = [];
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const jsonData = JSON.parse(content);
          
          if (Array.isArray(jsonData.steps)) {
            jsonData.steps.forEach(step => {
              if (step.images && Array.isArray(step.images)) {
                step.images.forEach(image => {
                  if (image.fileName) {
                    imagesToDelete.push(image.fileName);
                  }
                });
              }
            });
          }
        } catch (parseError) {
          console.warn('[api/emergency-flow/delete] Could not parse JSON for image cleanup:', parseError.message);
        }
        
        // 関連画像を削除
        if (imagesToDelete.length > 0) {
          console.log(`[api/emergency-flow/delete] LOCAL: Deleting ${imagesToDelete.length} related images`);
          for (const imageFileName of imagesToDelete) {
            try {
              const imageFilePath = path.join(imagesDir, imageFileName);
              if (await fs.promises.access(imageFilePath).then(() => true).catch(() => false)) {
                await fs.promises.unlink(imageFilePath);
                console.log(`[api/emergency-flow/delete] LOCAL: Deleted image: ${imageFileName}`);
              }
            } catch (imgError) {
              console.warn(`[api/emergency-flow/delete] LOCAL: Failed to delete image ${imageFileName}:`, imgError.message);
            }
          }
        }
        
        // JSONファイルを削除
        await fs.promises.unlink(filePath);
        console.log(`[api/emergency-flow/delete] LOCAL: Deleted JSON: ${targetFile}`);
        
        return res.json({
          success: true,
          message: '削除しました',
          deletedFile: targetFile,
          deletedImages: imagesToDelete.length
        });
      }

      // Azureモード: BLOBから削除
      console.log('[api/emergency-flow/delete] AZURE: Using BLOB storage');
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        console.error('[api/emergency-flow/delete] AZURE: BLOB service client not available');
        return res.status(503).json({
          success: false,
          error: 'BLOB storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      console.log('[api/emergency-flow/delete] AZURE: Container:', containerName, 'FileName:', fileName);
      
      const resolved = await resolveBlobClient(containerClient, fileName);

      if (!resolved) {
        console.error('[api/emergency-flow/delete] AZURE: ❌ Flow not found:', fileName);
        return res.status(404).json({
          success: false,
          error: 'フローが見つかりません',
          details: `ファイル ${fileName} が見つかりませんでした`
        });
      }
      
      console.log('[api/emergency-flow/delete] AZURE: ✅ Found blob:', resolved.blobName);
      const blobClient = resolved.blobClient;
      const blobName = resolved.blobName;

      // JSONをダウンロードして画像ファイル名を取得
      let imagesToDelete = [];
      try {
        const downloadResponse = await blobClient.download();
        if (downloadResponse.readableStreamBody) {
          const chunks = [];
          for await (const chunk of downloadResponse.readableStreamBody) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);
          const jsonData = JSON.parse(buffer.toString('utf-8'));
          
          // steps配列から画像を抽出
          if (Array.isArray(jsonData.steps)) {
            jsonData.steps.forEach(step => {
              if (step.images && Array.isArray(step.images)) {
                step.images.forEach(image => {
                  if (image.fileName) {
                    imagesToDelete.push(image.fileName);
                  }
                });
              }
            });
          }
        }
      } catch (parseError) {
        console.warn('[api/emergency-flow/delete] Could not parse JSON for image cleanup:', parseError.message);
      }

      // 関連画像を削除
      if (imagesToDelete.length > 0) {
        console.log(`[api/emergency-flow/delete] AZURE: Deleting ${imagesToDelete.length} related images`);
        for (const imageFileName of imagesToDelete) {
          try {
            const imageBlobName = norm(`images/emergency-flows/${imageFileName}`);
            const imageBlob = containerClient.getBlockBlobClient(imageBlobName);
            const exists = await imageBlob.exists();
            if (exists) {
              await imageBlob.delete();
              console.log(`[api/emergency-flow/delete] AZURE: Deleted image: ${imageFileName}`);
            }
          } catch (imgError) {
            console.warn(`[api/emergency-flow/delete] AZURE: Failed to delete image ${imageFileName}:`, imgError.message);
          }
        }
      }

      // JSONファイルを削除
      await blobClient.delete();
      console.log(`[api/emergency-flow/delete] AZURE: Deleted JSON: ${blobName}`);

      return res.json({
        success: true,
        message: '削除しました',
        deletedFile: fileName,
        deletedImages: imagesToDelete.length
      });
    } catch (error) {
      console.error('[api/emergency-flow/delete] Error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  return res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
}

// フォールバックテンプレート生成関数
function createFallbackTemplate(flowId, keyword) {
  return {
    id: flowId,
    title: keyword,
    description: `キーワード「${keyword}」から自動生成された応急処置フロー`,
    triggerKeywords: [keyword],
    steps: [
      {
        id: 'step1',
        type: 'step',
        title: '安全確認',
        description: '作業エリアの安全を確認し、必要な保護具を着用してください。',
        message: '作業エリアの安全を確認し、必要な保護具を着用してください。',
        nextStep: 'step2'
      },
      {
        id: 'step2',
        type: 'step',
        title: '症状の確認',
        description: `${keyword}の症状を詳しく確認してください。`,
        message: `${keyword}の症状を詳しく確認してください。`,
        nextStep: 'step3'
      },
      {
        id: 'step3',
        type: 'decision',
        title: '状況判断',
        description: '現在の状況を選択してください。',
        message: '現在の状況を選択してください。',
        options: [
          { label: '軽微な問題', nextStep: 'step4' },
          { label: '深刻な問題', nextStep: 'step5' },
          { label: '緊急対応必要', nextStep: 'step6' },
          { label: '不明', nextStep: 'step7' }
        ]
      },
      {
        id: 'step4',
        type: 'step',
        title: '応急処置',
        description: '基本的な点検と調整を行ってください。',
        message: '基本的な点検と調整を行ってください。',
        nextStep: 'complete'
      },
      {
        id: 'step5',
        type: 'step',
        title: '詳細点検',
        description: '詳細な点検を実施し、問題箇所を特定してください。',
        message: '詳細な点検を実施し、問題箇所を特定してください。',
        nextStep: 'step8'
      },
      {
        id: 'step6',
        type: 'step',
        title: '緊急対応',
        description: '直ちに専門技術者に連絡し、指示を仰いでください。',
        message: '直ちに専門技術者に連絡し、指示を仰いでください。',
        nextStep: 'complete'
      },
      {
        id: 'step7',
        type: 'step',
        title: '専門家への相談',
        description: '判断が困難な場合は、専門技術者に連絡してください。',
        message: '判断が困難な場合は、専門技術者に連絡してください。',
        nextStep: 'complete'
      },
      {
        id: 'step8',
        type: 'step',
        title: '報告',
        description: '確認した内容を記録し、関係者に報告してください。',
        message: '確認した内容を記録し、関係者に報告してください。',
        nextStep: 'complete'
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    generatedBy: 'Fallback Template'
  };
}
export const methods = ['get', 'post', 'put', 'delete'];
