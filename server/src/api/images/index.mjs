// ESM形式 - 画像取得エンドポイント
// /api/images/* にマッピング

import fs from 'fs';
import path from 'path';
// Azure Blobインポート削除済み
import { isAzureEnvironment } from '../../config/env.mjs';

export default async function imagesHandler(req, res) {
  const method = req.method;
  
  // OPTIONS preflight対応
  if (method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.status(200).end();
  }
  
  // GETリクエスト: 画像取得
  if (method === 'GET') {
    // パスから category と fileName を抽出
    // /api/images/chat-exports/xxx.jpg → category: chat-exports, fileName: xxx.jpg
    // /api/images/troubleshooting/xxx.jpg → category: troubleshooting, fileName: xxx.jpg
    const pathParts = req.path.split('/').filter(Boolean);
    
    console.log('[api/images] DEBUG: Full path:', req.path);
    console.log('[api/images] DEBUG: pathParts:', pathParts);
    
    // pathParts = ['api', 'images', 'chat-exports', 'xxx.jpg']
    // index 0: 'api'
    // index 1: 'images'
    // index 2: 'chat-exports' (category)
    // index 3+: 'xxx.jpg' (fileName)
    
    if (pathParts.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid path format. Expected: /api/images/{category}/{fileName}',
        receivedPath: req.path,
        pathParts: pathParts
      });
    }
    
    const category = pathParts[2]; // 'chat-exports' or 'troubleshooting'
    const fileName = pathParts.slice(3).join('/'); // ファイル名（サブフォルダ対応）
    
    console.log(`[api/images] Fetching image: category=${category}, fileName=${fileName}`);
    
    const setImageHeaders = (contentType) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    };
    
    const extension = path.extname(fileName || '').toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.bmp': 'image/bmp'
    };
    const contentType = mimeTypes[extension] || 'image/jpeg'; // デフォルトをimage/jpegに変更
    
    console.log('[api/images] Content-Type determination:', {
      fileName,
      extension,
      contentType
    });
    
    try {
      // Azure環境かどうかを判定
      const useAzure = isAzureEnvironment();
      
      console.log('[api/images] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        isAzureEnvironment: useAzure
      });
      
      // Azure環境: BLOBストレージのみ使用
      if (useAzure) {
        console.log('[api/images] AZURE: Using BLOB storage');
        const blobServiceClient = getBlobServiceClient();
        
        if (!blobServiceClient) {
          console.error('[api/images] AZURE: BLOB service client not available');
          console.error('[api/images] Azure BLOB Storage is no longer supported, use STORAGE_MODE=gcs');
          return res.status(503).json({
            success: false,
            error: 'ストレージサービスが利用できません（Azure環境）',
            hint: 'Azure BLOB Storage is no longer supported, use STORAGE_MODE=gcs'
          });
        }
        
        try {
          const containerClient = blobServiceClient.getContainerClient(containerName);
          const blobName = norm(`images/${category}/${fileName}`);
          console.log('[api/images] AZURE: Looking for blob:', blobName);
          
          const blockBlobClient = containerClient.getBlockBlobClient(blobName);
          const exists = await blockBlobClient.exists();
          
          if (!exists) {
            console.log('[api/images] AZURE: BLOB not found:', blobName);
            return res.status(404).json({
              success: false,
              error: '画像が見つかりません（Azure環境）',
              fileName: fileName,
              blobName: blobName,
              hint: 'BLOBストレージに画像がアップロードされているか確認してください'
            });
          }
          
          console.log('[api/images] AZURE: BLOB found:', blobName);
          const downloadResponse = await blockBlobClient.download();
          const chunks = [];
          
          if (downloadResponse.readableStreamBody) {
            for await (const chunk of downloadResponse.readableStreamBody) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);
            setImageHeaders(contentType);
            return res.status(200).send(buffer);
          }
          
          console.error('[api/images] AZURE: readableStreamBody is null');
          return res.status(500).json({
            success: false,
            error: '画像データの読み込みに失敗しました'
          });
        } catch (blobError) {
          console.error('[api/images] AZURE: BLOB error:', blobError.message);
          console.error('[api/images] AZURE: BLOB error stack:', blobError.stack);
          console.error('[api/images] AZURE: BLOB error code:', blobError.code);
          console.error('[api/images] AZURE: BLOB error statusCode:', blobError.statusCode);
          return res.status(blobError.statusCode || 500).json({
            success: false,
            error: 'BLOB取得エラー（Azure環境）',
            details: blobError.message,
            errorCode: blobError.code,
            fileName: fileName,
            category: category,
            blobName: norm(`images/${category}/${fileName}`),
            containerName: containerName
          });
        }
      }
      
      // ローカル環境: ローカルファイルシステムのみ使用
      console.log('[api/images] LOCAL: Using local filesystem');
      const localBasePath = path.resolve(process.cwd(), 'knowledge-base', 'images', category);
      const localFilePath = path.join(localBasePath, fileName);
      
      console.log('[api/images] LOCAL: Local file path:', localFilePath);
      
      if (fs.existsSync(localFilePath)) {
        console.log('[api/images] LOCAL: Local file found:', localFilePath);
        const fileBuffer = fs.readFileSync(localFilePath);
        setImageHeaders(contentType);
        return res.status(200).send(fileBuffer);
      }
      
      console.log('[api/images] LOCAL: File not found in local filesystem:', localFilePath);
      return res.status(404).json({
        success: false,
        error: '画像が見つかりません（ローカル環境）',
        fileName: fileName,
        category: category,
        localPath: localFilePath
      });
      
    } catch (error) {
      console.error('[api/images] Error (falling back to 404):', error);
      return res.status(404).json({
        success: false,
        error: '画像が見つかりません',
        fileName: fileName,
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return res.status(405).json({
    success: false,
    error: `Method ${method} not allowed`
  });
}

export const methods = ['get'];
