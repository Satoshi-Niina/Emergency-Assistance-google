/**
 * トラブルシューティングフロー管理エンドポイント
 * 応急処置生成後のフローと画像を管理
 */
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { upload } from '../infra/blob.mjs';
// 注: Azure BLOBサポート削除済み - GCS/ローカルストレージを使用

// Azure関連の後方互換性のための定数（使用されていない）
const containerName = 'knowledge';
// GCSまたはローカルストレージのみを使用します
import { isAzureEnvironment } from '../config/env.mjs';

const router = express.Router();

/**
 * トラブルシューティングフローの保存先
 * ローカル: knowledge-base/troubleshooting/flows/
 * Azure/GCS: troubleshooting/flows/
 */
function getTroubleshootingFlowPath(fileName) {
  return path.join(process.cwd(), 'knowledge-base', 'troubleshooting', 'flows', fileName);
}

function getTroubleshootingImagePath(fileName) {
  return path.join(process.cwd(), 'knowledge-base', 'troubleshooting', 'images', fileName);
}

/**
 * フロー一覧取得
 * GET /api/troubleshooting/flows
 */
router.get('/flows', async (req, res) => {
  try {
    const useAzure = isAzureEnvironment();
    const flows = [];

    if (!useAzure) {
      // ローカル環境
      const flowsDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting', 'flows');
      
      try {
        await fs.mkdir(flowsDir, { recursive: true });
        const files = await fs.readdir(flowsDir);
        
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          
          const filePath = path.join(flowsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const flowData = JSON.parse(content);
          
          flows.push({
            id: flowData.id || file.replace('.json', ''),
            title: flowData.title || 'Untitled',
            description: flowData.description || '',
            machineType: flowData.machineType || '',
            stepCount: flowData.steps?.length || 0,
            createdAt: flowData.createdAt,
            updatedAt: flowData.updatedAt,
            source: 'local'
          });
        }
      } catch (error) {
        console.error('[troubleshooting/flows] Local read error:', error);
      }
    } else {
      // Azure/Blob環境
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'Blob storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const prefix = norm('troubleshooting/flows/');

      for await (const blob of containerClient.listBlobsFlat({ prefix })) {
        if (!blob.name.endsWith('.json')) continue;
        
        try {
          const blobClient = containerClient.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          const content = await streamToBuffer(downloadResponse.readableStreamBody);
          const flowData = JSON.parse(content.toString('utf-8'));
          
          flows.push({
            id: flowData.id || blob.name.split('/').pop().replace('.json', ''),
            title: flowData.title || 'Untitled',
            description: flowData.description || '',
            machineType: flowData.machineType || '',
            stepCount: flowData.steps?.length || 0,
            createdAt: flowData.createdAt,
            updatedAt: flowData.updatedAt,
            source: 'blob'
          });
        } catch (error) {
          console.error(`[troubleshooting/flows] Error reading blob ${blob.name}:`, error);
        }
      }
    }

    res.json({
      success: true,
      flows,
      count: flows.length
    });
  } catch (error) {
    console.error('[troubleshooting/flows] Error:', error);
    res.status(500).json({
      success: false,
      error: 'フロー一覧の取得に失敗しました'
    });
  }
});

/**
 * フロー詳細取得
 * GET /api/troubleshooting/flows/:id
 */
router.get('/flows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const useAzure = isAzureEnvironment();
    const fileName = id.endsWith('.json') ? id : `${id}.json`;

    if (!useAzure) {
      // ローカル環境
      const filePath = getTroubleshootingFlowPath(fileName);
      
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const flowData = JSON.parse(content);
        
        return res.json({
          success: true,
          flow: flowData
        });
      } catch (error) {
        return res.status(404).json({
          success: false,
          error: 'フローが見つかりません'
        });
      }
    } else {
      // Azure/Blob環境
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'Blob storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = norm(`troubleshooting/flows/${fileName}`);
      const blobClient = containerClient.getBlobClient(blobName);

      const downloadResponse = await blobClient.download();
      const content = await streamToBuffer(downloadResponse.readableStreamBody);
      const flowData = JSON.parse(content.toString('utf-8'));

      return res.json({
        success: true,
        flow: flowData
      });
    }
  } catch (error) {
    console.error('[troubleshooting/flows/:id] Error:', error);
    res.status(404).json({
      success: false,
      error: 'フローが見つかりません'
    });
  }
});

/**
 * フロー作成
 * POST /api/troubleshooting/flows
 */
router.post('/flows', async (req, res) => {
  try {
    const flowData = req.body;
    const flowId = flowData.id || uuidv4();
    const fileName = `${flowId}.json`;
    const useAzure = isAzureEnvironment();

    // フローデータに必須フィールドを追加
    const completeFlowData = {
      ...flowData,
      id: flowId,
      createdAt: flowData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const jsonContent = JSON.stringify(completeFlowData, null, 2);

    if (!useAzure) {
      // ローカル環境
      const flowsDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting', 'flows');
      await fs.mkdir(flowsDir, { recursive: true });
      
      const filePath = path.join(flowsDir, fileName);
      await fs.writeFile(filePath, jsonContent, 'utf-8');
      
      console.log('[troubleshooting/flows] ✅ Saved to local:', filePath);
      
      return res.json({
        success: true,
        flowId,
        fileName,
        storage: 'local'
      });
    } else {
      // Azure/Blob環境
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'Blob storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = norm(`troubleshooting/flows/${fileName}`);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(jsonContent, Buffer.byteLength(jsonContent), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });

      console.log('[troubleshooting/flows] ✅ Saved to blob:', blobName);

      return res.json({
        success: true,
        flowId,
        fileName,
        blobName,
        storage: 'blob'
      });
    }
  } catch (error) {
    console.error('[troubleshooting/flows] POST Error:', error);
    res.status(500).json({
      success: false,
      error: 'フローの保存に失敗しました'
    });
  }
});

/**
 * フロー更新
 * PUT /api/troubleshooting/flows/:id
 */
router.put('/flows/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const fileName = id.endsWith('.json') ? id : `${id}.json`;
    const useAzure = isAzureEnvironment();

    // 更新日時を追加
    const completeFlowData = {
      ...updateData,
      id: id.replace('.json', ''),
      updatedAt: new Date().toISOString()
    };

    const jsonContent = JSON.stringify(completeFlowData, null, 2);

    if (!useAzure) {
      // ローカル環境
      const filePath = getTroubleshootingFlowPath(fileName);
      await fs.writeFile(filePath, jsonContent, 'utf-8');
      
      console.log('[troubleshooting/flows] ✅ Updated local:', filePath);
      
      return res.json({
        success: true,
        flowId: id,
        storage: 'local'
      });
    } else {
      // Azure/Blob環境
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'Blob storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = norm(`troubleshooting/flows/${fileName}`);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(jsonContent, Buffer.byteLength(jsonContent), {
        blobHTTPHeaders: { blobContentType: 'application/json' }
      });

      console.log('[troubleshooting/flows] ✅ Updated blob:', blobName);

      return res.json({
        success: true,
        flowId: id,
        blobName,
        storage: 'blob'
      });
    }
  } catch (error) {
    console.error('[troubleshooting/flows] PUT Error:', error);
    res.status(500).json({
      success: false,
      error: 'フローの更新に失敗しました'
    });
  }
});

/**
 * フロー画像アップロード
 * POST /api/troubleshooting/flows/:id/images
 */
router.post('/flows/:id/images', async (req, res) => {
  try {
    const { id } = req.params;
    const { stepNumber } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '画像ファイルが送信されていません'
      });
    }

    const useAzure = isAzureEnvironment();
    const imageName = stepNumber !== undefined
      ? `${id}_step_${stepNumber}.png`
      : `${id}.png`;

    if (!useAzure) {
      // ローカル環境
      const imagesDir = path.join(process.cwd(), 'knowledge-base', 'troubleshooting', 'images');
      await fs.mkdir(imagesDir, { recursive: true });
      
      const imagePath = path.join(imagesDir, imageName);
      await fs.writeFile(imagePath, req.file.buffer);
      
      console.log('[troubleshooting/images] ✅ Saved to local:', imagePath);
      
      return res.json({
        success: true,
        imageUrl: `/api/troubleshooting/images/${imageName}`,
        fileName: imageName,
        storage: 'local'
      });
    } else {
      // Azure/Blob環境
      const blobServiceClient = getBlobServiceClient();
      if (!blobServiceClient) {
        return res.status(503).json({
          success: false,
          error: 'Blob storage not available'
        });
      }

      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = norm(`troubleshooting/images/${imageName}`);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.upload(req.file.buffer, req.file.buffer.length, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype }
      });

      console.log('[troubleshooting/images] ✅ Saved to blob:', blobName);

      return res.json({
        success: true,
        imageUrl: `/api/troubleshooting/images/${imageName}`,
        fileName: imageName,
        blobName,
        storage: 'blob'
      });
    }
  } catch (error) {
    console.error('[troubleshooting/images] POST Error:', error);
    res.status(500).json({
      success: false,
      error: '画像のアップロードに失敗しました'
    });
  }
});

/**
 * Helper: Stream to Buffer
 */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

export default router;
