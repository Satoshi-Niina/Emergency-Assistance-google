import { uploadBufferToGCS, listFilesInGCS, getGCSStatus, bucket } from '../../lib/google-cloud-storage.mjs';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ローカルストレージのベースパス（GCSが利用できない場合のフォールバック）
const LOCAL_STORAGE_BASE = path.resolve(__dirname, '../../../knowledge-base');

function sendPreflight(res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400',
  });
  return res.status(200).send('');
}

export default async function chatExportHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  if (req.method === 'POST') {
    return handleExportChat(req, res);
  }

  if (req.method === 'GET') {
    return handleListExports(req, res);
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

/**
 * チャット履歴をエクスポート
 * - JSONファイル: chat-exports/json/
 * - 画像ファイル: chat-exports/images/
 * GCSを優先使用、利用できない場合はローカルにフォールバック
 */
async function handleExportChat(req, res) {
  try {
    const { chatHistory, metadata = {}, images = [] } = req.body || {};

    if (!chatHistory || !Array.isArray(chatHistory)) {
      return res.status(400).json({
        success: false,
        error: 'chatHistory is required and must be an array',
      });
    }

    const exportId = uuidv4();
    const exportDate = new Date().toISOString();
    const useGCS = !!bucket; // GCSが設定されているかチェック

    console.log(`[chat-export] Storage mode: ${useGCS ? 'GCS' : 'local'}`);
    
    // 画像を処理して chat-exports/images/ に保存
    const processedImages = [];
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`[chat-export] Processing ${images.length} images...`);
      
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // base64データから画像を抽出
          const base64Data = image.data?.replace(/^data:image\/\w+;base64,/, '') || '';
          if (!base64Data) {
            console.warn(`[chat-export] Skipping empty image at index ${i}`);
            continue;
          }
          
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const imageExt = image.mimeType?.split('/')[1] || 'png';
          const imageName = image.name || `image_${i + 1}.${imageExt}`;
          
          // 画像のストレージパス: chat-exports/images/{exportId}/{imageName}
          const imageFileName = `chat-exports/images/${exportId}/${imageName}`;
          
          let imageUrl;
          let gcsPublicUrl = null;
          
          if (useGCS) {
            // GCSにアップロード
            gcsPublicUrl = await uploadBufferToGCS(imageBuffer, imageFileName, image.mimeType || 'image/png');
            // APIエンドポイント経由でアクセスできるURLを生成
            imageUrl = `/api/history/images/${exportId}/${imageName}`;
          } else {
            // ローカルに保存
            const localPath = path.join(LOCAL_STORAGE_BASE, imageFileName);
            const localDir = path.dirname(localPath);
            if (!fs.existsSync(localDir)) {
              fs.mkdirSync(localDir, { recursive: true });
            }
            fs.writeFileSync(localPath, imageBuffer);
            imageUrl = `/api/history/images/${exportId}/${imageName}`;
          }
          
          processedImages.push({
            originalName: imageName,
            storagePath: imageFileName,
            url: imageUrl, // APIエンドポイント形式
            gcsUrl: gcsPublicUrl, // GCS直接URL（デバッグ用）
            size: imageBuffer.length,
            mimeType: image.mimeType || 'image/png',
          });
          
          console.log(`[chat-export] Uploaded image: ${imageFileName}`);
        } catch (imgError) {
          console.error(`[chat-export] Failed to process image ${i}:`, imgError);
        }
      }
    }

    // エクスポートデータの作成
    const exportData = {
      exportId: exportId,
      exportDate: exportDate,
      chatHistory: chatHistory,
      images: processedImages, // 画像情報を含める
      metadata: {
        ...metadata,
        messageCount: chatHistory.length,
        imageCount: processedImages.length,
        firstMessage: chatHistory[0]?.timestamp || null,
        lastMessage: chatHistory[chatHistory.length - 1]?.timestamp || null,
      },
    };

    // JSONファイルを chat-exports/json/ に保存
    // ファイル名にメタデータのタイトルを含める
    const safeTitle = (metadata.title || 'export').replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF_-]/g, '_').substring(0, 50);
    const dateStr = exportDate.replace(/[:.]/g, '-').substring(0, 19);
    const jsonFileName = `chat-exports/json/${safeTitle}_${exportId}_${dateStr}.json`;
    const buffer = Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
    
    let publicUrl;
    if (useGCS) {
      // GCSにアップロード
      publicUrl = await uploadBufferToGCS(buffer, jsonFileName, 'application/json');
    } else {
      // ローカルに保存
      const localPath = path.join(LOCAL_STORAGE_BASE, jsonFileName);
      const localDir = path.dirname(localPath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      fs.writeFileSync(localPath, buffer);
      publicUrl = `/knowledge-base/${jsonFileName}`;
    }

    console.log('[chat-export] Chat exported successfully:', exportId);
    console.log('[chat-export] JSON saved to:', jsonFileName);
    console.log('[chat-export] Images saved:', processedImages.length);
    console.log('[chat-export] Storage:', useGCS ? 'GCS' : 'local');

    return res.status(200).json({
      success: true,
      exportId: exportId,
      url: publicUrl,
      fileName: jsonFileName,
      messageCount: chatHistory.length,
      imageCount: processedImages.length,
      images: processedImages,
      timestamp: exportDate,
      storage: useGCS ? 'gcs' : 'local',
    });

  } catch (error) {
    console.error('[api/chat-export] Export error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'export_failed',
      message: error.message || 'チャット履歴のエクスポートに失敗しました',
    });
  }
}

/**
 * エクスポート一覧を取得（chat-exports/json/フォルダから）
 * GCSを優先使用、利用できない場合はローカルから取得
 */
async function handleListExports(req, res) {
  try {
    const useGCS = !!bucket;
    let files = [];

    if (useGCS) {
      // GCSから取得
      files = await listFilesInGCS('chat-exports/json/');
    } else {
      // ローカルから取得
      const localDir = path.join(LOCAL_STORAGE_BASE, 'chat-exports', 'json');
      if (fs.existsSync(localDir)) {
        const fileNames = fs.readdirSync(localDir);
        files = fileNames.filter(f => f.endsWith('.json')).map(f => {
          const filePath = path.join(localDir, f);
          const stats = fs.statSync(filePath);
          return {
            name: `chat-exports/json/${f}`,
            size: stats.size,
            created: stats.birthtime.toISOString(),
            updated: stats.mtime.toISOString(),
          };
        });
      }
    }

    return res.status(200).json({
      success: true,
      exports: files.map(file => {
        // ファイル名からエクスポートIDを抽出
        const baseName = file.name.replace('chat-exports/json/', '').replace('.json', '');
        // UUID部分を抽出（_で区切られた最後から2番目がUUID）
        const parts = baseName.split('_');
        const exportId = parts.length >= 2 ? parts[parts.length - 2] : baseName;
        return {
          exportId: exportId,
          fileName: file.name,
          size: file.size,
          created: file.created,
          updated: file.updated,
        };
      }),
      count: files.length,
      storage: useGCS ? 'gcs' : 'local',
    });

  } catch (error) {
    console.error('[api/chat-export] List error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'list_failed',
      message: error.message || 'エクスポート一覧の取得に失敗しました',
    });
  }
}

export const methods = ['post', 'get', 'options'];
