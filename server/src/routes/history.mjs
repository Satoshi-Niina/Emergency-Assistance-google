import express from 'express';
import fs from 'fs';
import path from 'path';
import { upload } from '../infra/blob.mjs';
import { dbQuery } from '../infra/db.mjs';
import { isAzureEnvironment } from '../config/env.mjs';
import { 
  downloadFromGCS, 
  listFilesInGCS, 
  bucket 
} from '../lib/google-cloud-storage.mjs';

const router = express.Router();

// Azure関連の後方互換性のための定数（使用されていない）
const containerName = 'knowledge';

// ID正規化（.json拡張子を除去、ファイル名全体を保持）
const normalizeId = (id = '') => {
  let normalized = id;
  // .json拡張子を除去
  if (normalized.endsWith('.json')) {
    normalized = normalized.replace(/\.json$/, '');
  }
  return normalized;
};

// Azure Blob関連の関数は削除済み（GCS/ローカル専用）
// findHistoryBlob, downloadJson などは使用されていません

// ファイル名やJSONからタイトル・機種情報を抽出
function deriveTitleFromFileName(fileName = '') {
  const nameWithoutExt = fileName.replace(/\.json$/, '');
  const match = nameWithoutExt.match(/^(.+?)_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/);
  if (match) return match[1];
  const simple = nameWithoutExt.split('_')[0];
  return simple || nameWithoutExt || '故障履歴';
}

function extractMetadataFromJson(json = {}, fileName = '') {
  const chatData = json.chatData || {};
  const machineInfo = chatData.machineInfo || json.machineInfo || {};

  console.log('[extractMetadata] Input JSON keys:', Object.keys(json));
  if (json.chatData) console.log('[extractMetadata] chatData keys:', Object.keys(json.chatData));
  if (json.savedImages) console.log('[extractMetadata] json.savedImages length:', json.savedImages.length);
  if (chatData.savedImages) console.log('[extractMetadata] chatData.savedImages length:', chatData.savedImages.length);

  // 機種情報の抽出（複数ソースから試行）
  let machineType = machineInfo.machineTypeName || 
                    machineInfo.selectedMachineType ||
                    json.machineType || 
                    '';
  let machineNumber = machineInfo.machineNumber || 
                      machineInfo.selectedMachineNumber ||
                      json.machineNumber || 
                      '';
  
  // 空の場合はファイル名から推測を試みる
  if (!machineType && !machineNumber) {
    // ファイル名から機種情報を抽出する試み（例: MC-300_100_xxx.json）
    const fileNameMatch = fileName.match(/([A-Z]+-\d+)[-_](\d+)/i);
    if (fileNameMatch) {
      machineType = fileNameMatch[1] || '';
      machineNumber = fileNameMatch[2] || '';
    }
  }
  
  // 最終的にも空の場合のみ"未設定"を設定
  machineType = machineType || '未設定';
  machineNumber = machineNumber || '未設定';

  console.log('[extractMetadata] Debug:', {
    fileName,
    hasChatData: !!json.chatData,
    hasMachineInfo: !!machineInfo,
    machineTypeName: machineInfo.machineTypeName,
    jsonMachineType: json.machineType,
    machineNumber: machineInfo.machineNumber || json.machineNumber,
    extractedMachineType: machineType,
    extractedMachineNumber: machineNumber
  });

  // 画像抽出: jsonData.images[] (chat-export形式)
  const exportImages = Array.isArray(json.images) ? json.images : [];
  const exportId = json.exportId;
  
  // chat-export形式の画像を変換
  const processedImages = exportImages.map((img) => {
    if (!img || typeof img !== 'object') return null;
    
    // storagePathから exportId と imageName を抽出
    // 例: "chat-exports/images/abc-123/image.png" → exportId="abc-123", imageName="image.png"
    let imageUrl = img.url;
    
    if (img.storagePath && exportId) {
      const parts = img.storagePath.split('/');
      const imageName = parts[parts.length - 1]; // 最後の部分がファイル名
      // APIエンドポイント形式のURLを生成
      imageUrl = `/api/history/images/${exportId}/${imageName}`;
    } else if (img.originalName && exportId) {
      // fallback: originalNameを使用
      imageUrl = `/api/history/images/${exportId}/${img.originalName}`;
    }
    
    return {
      url: imageUrl,
      fileName: img.originalName || img.fileName || '',
      storagePath: img.storagePath || '',
      mimeType: img.mimeType || 'image/png',
      size: img.size || 0
    };
  }).filter(img => img !== null);

  // 旧形式の画像も処理（後方互換性）
  const messages = Array.isArray(chatData.messages) ? chatData.messages : [];
  messages.forEach((msg) => {
    const media = Array.isArray(msg.media) ? msg.media : [];
    media.forEach((m) => {
      if (m && (m.url || m.fileName || m.path)) {
        processedImages.push({
          url: m.url || m.fileName || m.path,
          fileName: m.fileName || m.url || m.path,
        });
      }
    });
  });

  const savedImages = Array.isArray(json.savedImages)
    ? json.savedImages
    : Array.isArray(chatData.savedImages)
      ? chatData.savedImages
      : [];

  // 画像URLからファイル名を抽出する関数
  const extractFileName = (urlOrPath) => {
    if (!urlOrPath) return '';
    // /api/images/chat-exports/xxx.jpg → xxx.jpg
    const parts = urlOrPath.split('/');
    return parts[parts.length - 1];
  };

  // savedImages（旧形式）も追加
  savedImages.forEach((img) => {
    if (typeof img === 'string') {
      const fileName = extractFileName(img);
      processedImages.push({ url: img, fileName: fileName });
    } else if (img && typeof img === 'object') {
      const fileName = extractFileName(img.fileName || img.url || img.path);
      processedImages.push({
        url: img.url || img.fileName || img.path,
        fileName: fileName,
        ...img,
      });
    }
  });

  const uniqueImages = processedImages.filter((img, index, self) => 
    img.url && img.fileName && 
    index === self.findIndex(t => t.url === img.url)
  );

  const title = json.title || chatData.title || deriveTitleFromFileName(fileName);

  return {
    title,
    machineType,
    machineNumber,
    images: uniqueImages,
  };
}

// Azure Blob関連の downloadJson 関数は削除済み

// オブジェクトをマージ（undefinedは無視）
function mergeData(original, updates) {
  const result = { ...original };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeData(original[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Get history list
router.get('/', async (req, res) => {
  try {
    console.log('[history] Fetching history list');
    const items = [];
    
    const useGCS = !!bucket;
    console.log('[history] Storage mode:', { useGCS, STORAGE_MODE: process.env.STORAGE_MODE });
    
    if (useGCS) {
      // GCS (Google Cloud Storage) から取得
      console.log('[history] GCS: Reading from Google Cloud Storage');
      try {
        const files = await listFilesInGCS('chat-exports/json/');
        console.log(`[history] GCS: Found ${files.length} files`);
        
        for (const file of files) {
          if (!file.name.endsWith('.json')) continue;
          
          const fileName = file.name.split('/').pop();
          const id = fileName.replace('.json', '');
          const defaultTitle = deriveTitleFromFileName(fileName);
          
          let meta = {
            title: defaultTitle,
            machineType: 'Unknown',
            machineNumber: 'Unknown',
            images: [],
          };
          
          try {
            const content = await downloadFromGCS(file.name);
            const json = JSON.parse(content.toString('utf-8'));
            meta = extractMetadataFromJson(json, fileName);
            
            if (!meta.title || meta.title === '故障履歴') {
              meta.title = defaultTitle;
            }
            
            console.log('[history] GCS metadata:', {
              fileName,
              title: meta.title,
              machineType: meta.machineType,
              machineNumber: meta.machineNumber,
              imageCount: meta.images.length,
              firstImageUrl: meta.images[0]?.url || 'none'
            });
          } catch (readError) {
            console.warn('[history] GCS: Metadata read failed for:', fileName, readError.message);
          }
          
          items.push({
            id,
            fileName,
            title: meta.title,
            machineType: meta.machineType,
            machineNumber: meta.machineNumber,
            imageCount: meta.images.length,
            images: meta.images,
            createdAt: file.created || new Date().toISOString(),
            lastModified: file.updated || file.created || new Date().toISOString(),
            source: 'gcs'
          });
        }
        
        console.log(`[history] GCS: Found ${items.length} items`);
        
        return res.json({
          success: true,
          data: items,
          total: items.length,
          source: 'gcs',
          timestamp: new Date().toISOString()
        });
      } catch (gcsError) {
        console.error('[history] GCS list failed:', gcsError.message);
        // GCS失敗時はローカルフォールバック
      }
    }
    
    // ローカルファイルシステムから読み込み（GCS利用不可時のフォールバック）
    console.log('[history] LOCAL: Reading from local filesystem');
    const localDir = path.resolve(process.cwd(), 'knowledge-base', 'chat-exports', 'json');
    
    if (fs.existsSync(localDir)) {
      const files = fs.readdirSync(localDir);
      console.log(`[history] LOCAL: Found ${files.length} files`);
      
      for (const fileName of files) {
        if (!fileName.endsWith('.json')) continue;
        
        const filePath = path.join(localDir, fileName);
        const id = fileName.replace('.json', '');
        const stats = fs.statSync(filePath);
        const defaultTitle = deriveTitleFromFileName(fileName);
        
        let meta = {
          title: defaultTitle,
          machineType: 'Unknown',
          machineNumber: 'Unknown',
          images: [],
        };
        
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const json = JSON.parse(content);
          meta = extractMetadataFromJson(json, fileName);
          
          if (!meta.title || meta.title === '故障履歴') {
            meta.title = defaultTitle;
          }
        } catch (readError) {
          console.warn('[history] LOCAL: Metadata read failed for:', fileName, readError.message);
        }
        
        items.push({
          id,
          fileName,
          title: meta.title,
          machineType: meta.machineType,
          machineNumber: meta.machineNumber,
          imageCount: meta.images.length,
          images: meta.images,
          createdAt: stats.mtime,
          lastModified: stats.mtime,
          source: 'local'
        });
      }
    }
    
    console.log(`[history] LOCAL: Found ${items.length} items`);
    
    return res.json({
      success: true,
      data: items,
      total: items.length,
      source: 'local',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[history] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get machine data
router.get('/machine-data', async (req, res) => {
  try {
    console.log('[history/machine-data] Fetching machine data');
    const result = await dbQuery(`
      SELECT m.id, m.machine_number, mt.machine_type_name
      FROM machines m
      LEFT JOIN machine_types mt ON m.machine_type_id = mt.id
      ORDER BY m.machine_number
    `);
    
    res.json({
      success: true,
      data: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[history/machine-data] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get image from GCS
router.get('/images/:exportId/:imageName', async (req, res) => {
  try {
    const { exportId, imageName } = req.params;
    console.log(`[history/images] Request: ${exportId}/${imageName}`);
    
    const useGCS = !!bucket;
    const imagePath = `chat-exports/images/${exportId}/${imageName}`;
    
    if (useGCS) {
      // GCSから取得
      try {
        console.log(`[history/images] GCS: Downloading ${imagePath}`);
        const imageBuffer = await downloadFromGCS(imagePath);
        
        // 拡張子からContent-Typeを判定
        let contentType = 'image/png';
        if (imageName.endsWith('.jpg') || imageName.endsWith('.jpeg')) {
          contentType = 'image/jpeg';
        } else if (imageName.endsWith('.gif')) {
          contentType = 'image/gif';
        } else if (imageName.endsWith('.webp')) {
          contentType = 'image/webp';
        } else if (imageName.endsWith('.bmp')) {
          contentType = 'image/bmp';
        }
        
        res.set({
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
        });
        
        return res.status(200).send(imageBuffer);
      } catch (gcsError) {
        console.error(`[history/images] GCS error for ${imagePath}:`, gcsError.message);
        // フォールバックしてローカルを試す
      }
    }
    
    // ローカルから取得
    const localPath = path.join(process.cwd(), 'knowledge-base', imagePath);
    
    if (!fs.existsSync(localPath)) {
      return res.status(404).json({
        success: false,
        error: '画像が見つかりません',
        path: imagePath
      });
    }
    
    let contentType = 'image/png';
    if (imageName.endsWith('.jpg') || imageName.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (imageName.endsWith('.gif')) {
      contentType = 'image/gif';
    } else if (imageName.endsWith('.webp')) {
      contentType = 'image/webp';
    } else if (imageName.endsWith('.bmp')) {
      contentType = 'image/bmp';
    }
    
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });
    
    const imageBuffer = fs.readFileSync(localPath);
    return res.status(200).send(imageBuffer);
    
  } catch (error) {
    console.error('[history/images] Error:', error);
    res.status(500).json({
      success: false,
      error: '画像の取得に失敗しました',
      message: error.message
    });
  }
});

// Upload image
// CORS preflight対応
router.options('/upload-image', (req, res) => {
  res.status(200).end();
});

router.post('/upload-image', upload.single('image'), async (req, res) => {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'ファイルがアップロードされていません'
        });
      }

      console.log(`[history/upload-image] Attempt ${attempt}/${maxRetries}:`, {
        fileName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // 画像形式のバリデーション（JPG/PNG/BMPのみ）
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/bmp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        console.error('[history/upload-image] Invalid file type:', req.file.mimetype);
        return res.status(400).json({
          success: false,
          error: `サポートされていないファイル形式です。JPG、PNG、BMPのみアップロード可能です。`,
          details: `受信したファイル形式: ${req.file.mimetype}`
        });
      }

      const timestamp = Date.now();
      let ext = path.extname(req.file.originalname);
      
      // 拡張子がない場合、mimetypeから推定
      if (!ext) {
        const mimeToExt = {
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/png': '.png',
          'image/bmp': '.bmp'
        };
        ext = mimeToExt[req.file.mimetype] || '.jpg'; // デフォルトは.jpg
        console.log(`[history/upload-image] No extension found, using mimetype: ${req.file.mimetype} -> ${ext}`);
      }
      
      const fileName = `chat_image_${timestamp}${ext}`;
      console.log(`[history/upload-image] Generated fileName: ${fileName}`);
      
      // Azure環境かどうかを判定
      const useLocal = process.env.STORAGE_MODE === 'local' || !process.env.STORAGE_MODE;
      
      console.log('[history/upload-image] Environment check:', {
        NODE_ENV: process.env.NODE_ENV,
        STORAGE_MODE: process.env.STORAGE_MODE,
        useLocal: useLocal
      });

      // ローカル環境: ローカルファイルシステムのみ使用
      if (useLocal) {
        console.log('[history/upload-image] LOCAL: Using local filesystem');
        
        const localDir = path.resolve(process.cwd(), 'knowledge-base', 'chat-exports', 'images');
        const localFilePath = path.join(localDir, fileName);
        
        // ディレクトリが存在しない場合は作成
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir, { recursive: true });
          console.log('[history/upload-image] LOCAL: Created local directory:', localDir);
        }
        
        // ファイルを保存
        fs.writeFileSync(localFilePath, req.file.buffer);
        console.log('[history/upload-image] LOCAL: ✅ Saved to local filesystem:', localFilePath);
        
        const imageUrl = `/api/images/chat-exports/${fileName}`;
        
        return res.json({
          success: true,
          imageUrl: imageUrl,
          fileName: fileName,
          size: req.file.size,
          storage: 'local',
          verified: true,
          environment: 'local'
        });
      }

      // Azure環境: BLOBストレージのみ使用
      console.log('[history/upload-image] STORAGE: Using cloud storage');
      const blobServiceClient = getBlobServiceClient();
      
      if (!blobServiceClient) {
        console.error('[history/upload-image] STORAGE: ❌ Cloud storage not configured');
        return res.status(503).json({
          success: false,
          error: 'Cloud storage not available',
          hint: 'STORAGE_MODEを確認してください'
        });
      }

      // BLOB接続テスト
      try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const exists = await containerClient.exists();
        console.log('[history/upload-image] AZURE: BLOB connection test:', {
          containerName,
          exists,
          canConnect: true
        });
      } catch (testError) {
        console.error('[history/upload-image] AZURE: ❌ BLOB connection test failed:', testError);
        return res.status(503).json({
          success: false,
          error: 'BLOB storage connection failed',
          details: testError.message
        });
      }

      // BLOBに保存
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = norm(`chat-exports/images/${fileName}`);
      console.log('[history/upload-image] 📤 Starting BLOB upload:', {
        container: containerName,
        blobName: blobName,
        fullPath: `${containerName}/${blobName}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        attempt: attempt
      });
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      // コンテナの存在確認と作成（確実に実行）
      console.log('[history/upload-image] Ensuring container exists...');
      try {
        await containerClient.createIfNotExists({
          access: 'container' // パブリックアクセス（必要に応じて変更）
        });
      } catch (createError) {
        console.error('[history/upload-image] ⚠️ Container creation failed (may already exist):', {
          message: createError.message,
          code: createError.code,
          statusCode: createError.statusCode,
          details: createError.details
        });
        // コンテナが既に存在する場合はエラーを無視
        if (createError.code !== 'ContainerAlreadyExists' && createError.statusCode !== 409) {
          throw createError;
        }
      }
      
      const containerExists = await containerClient.exists();
      console.log('[history/upload-image] Container status:', {
        container: containerName,
        exists: containerExists,
        confirmed: containerExists ? '✅' : '❌'
      });

      if (!containerExists) {
        throw new Error(`Container '${containerName}' does not exist and could not be created`);
      }

      // BLOB アップロード実行
      console.log('[history/upload-image] Uploading to BLOB...');
      const uploadPromise = blockBlobClient.uploadData(req.file.buffer, {
        blobHTTPHeaders: {
          blobContentType: req.file.mimetype,
          blobCacheControl: 'public, max-age=31536000' // 1年キャッシュ
        },
        metadata: {
          originalName: req.file.originalname,
          uploadedAt: new Date().toISOString(),
          source: 'chat-camera'
        }
      });

      // タイムアウトを60秒に延長
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('BLOB upload timeout (60s)')), 60000);
      });

      await Promise.race([uploadPromise, timeoutPromise]);

      console.log(`[history/upload-image] ✅ BLOB Upload command completed:`, {
        container: containerName,
        blobName: blobName,
        fullPath: `${containerName}/${blobName}`,
        fileName: fileName,
        size: req.file.size,
        mimetype: req.file.mimetype
      });

      // アップロード後に存在確認（必須）
      const uploadedBlobExists = await blockBlobClient.exists();
      console.log(`[history/upload-image] Upload verification:`, {
        exists: uploadedBlobExists,
        blobUrl: blockBlobClient.url,
        verified: uploadedBlobExists ? '✅' : '❌'
      });

      // 🔧 重要: BLOBに存在しない場合はエラー
      if (!uploadedBlobExists) {
        throw new Error(`BLOB upload failed: File does not exist after upload - ${blobName}`);
      }

      console.log(`[history/upload-image] ✅✅ BLOB Upload VERIFIED - File exists in storage`);

      const imageUrl = `/api/images/chat-exports/${fileName}`;

      return res.json({
        success: true,
        imageUrl: imageUrl,
        fileName: fileName,
        blobName: blobName,
        size: req.file.size,
        storage: 'blob',
        verified: true
      });
    } catch (error) {
      lastError = error;
      console.error(`[history/upload-image] ❌ Attempt ${attempt} failed:`, {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
        name: error.name
      });

      if (attempt < maxRetries) {
        console.log(`[history/upload-image] Retrying in ${attempt}s...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        continue;
      }
    }
  }

  console.error('[history/upload-image] ❌ All retry attempts failed:', {
    lastError: lastError?.message,
    stack: lastError?.stack,
    attempts: maxRetries
  });

  return res.status(500).json({
    success: false,
    error: '画像のアップロードに失敗しました',
    details: lastError?.message,
    errorCode: lastError?.code,
    errorName: lastError?.name,
    diagnostics: {
      containerName: containerName,
      nodeEnv: process.env.NODE_ENV,
      storageMode: process.env.STORAGE_MODE
    }
  });
});

// Get export file
router.get('/exports/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    console.log(`[history/exports] Request: ${fileName}`);
    
    const useGCS = !!bucket;
    
    if (useGCS) {
      // GCSから取得
      try {
        const gcsPath = `chat-exports/json/${fileName}`;
        console.log(`[history/exports] GCS: Downloading ${gcsPath}`);
        const content = await downloadFromGCS(gcsPath);
        
        const contentType = fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.send(content);
        return;
      } catch (gcsError) {
        console.error('[history/exports] GCS error:', gcsError.message);
        // フォールバックしてローカルを試す
      }
    }
    
    // ローカルモード: chat-exports/json/ から読み取り
    const filePath = path.join(process.cwd(), 'knowledge-base', 'chat-exports', 'json', fileName);
    
    if (!await fs.promises.access(filePath).then(() => true).catch(() => false)) {
      return res.status(404).json({
        success: false,
        error: 'ファイルが見つかりません',
      });
    }
    
    const contentType = fileName.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return;

  } catch (error) {
    console.error('[history/exports] Error:', error);
    res.status(404).json({
      success: false,
      error: 'ファイルが見つかりません',
      details: error.message,
    });
  }
});

// List export files
router.get('/export-files', async (req, res) => {
  try {
    console.log('[history/export-files] Fetching export files');
    
    const items = [];
    const useGCS = !!bucket;
    console.log('[history/export-files] Storage mode:', { useGCS });
    
    if (useGCS) {
      // GCS から取得
      console.log('[history/export-files] GCS: chat-exports/json/ から取得');
      try {
        const files = await listFilesInGCS('chat-exports/json/');
        
        for (const file of files) {
          if (!file.name.endsWith('.json')) continue;
          
          const fileName = file.name.split('/').pop();
          
          // ファイル名からタイトルを抽出（UUID部分を除去）
          let title = fileName.replace('.json', '');
          const titleMatch = title.match(/^(.+?)_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/);
          if (titleMatch) {
            title = titleMatch[1];
          }
          
          items.push({
            id: fileName.replace('.json', ''),
            fileName: fileName,
            title: title,
            blobName: file.name,
            createdAt: file.created || new Date().toISOString(),
            lastModified: file.updated || file.created || new Date().toISOString(),
            exportTimestamp: file.created || new Date().toISOString(),
            size: file.size || 0
          });
        }
        console.log('[history/export-files] ✅ GCS取得完了:', items.length, '件');
        
        return res.json({
          success: true,
          files: items,
          count: items.length,
          source: 'gcs',
          diagnostics: {
            mode: 'gcs',
            filesFound: items.length
          }
        });
      } catch (gcsError) {
        console.error('[history/export-files] GCS error:', gcsError.message);
        // フォールバックしてローカルを試す
      }
    }
    
    // ローカルモード: chat-exports/json/ から取得
    console.log('[history/export-files] ローカルモード: chat-exports/json/ から取得');
    const exportsDir = path.join(process.cwd(), 'knowledge-base', 'chat-exports', 'json');
    
    try {
      // ディレクトリが存在しない場合は作成
      if (!fs.existsSync(exportsDir)) {
        console.log('[history/export-files] Creating directory:', exportsDir);
        await fs.promises.mkdir(exportsDir, { recursive: true });
      }
      
      const files = await fs.promises.readdir(exportsDir);
      
      for (const fileName of files) {
        if (!fileName.endsWith('.json')) continue;
        
        const filePath = path.join(exportsDir, fileName);
        const stats = await fs.promises.stat(filePath);
        
        // ファイル名からタイトルを抽出（UUID部分を除去）
        let title = fileName.replace('.json', '');
        const titleMatch = title.match(/^(.+?)_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_/);
        if (titleMatch) {
          title = titleMatch[1];
        }
        
        items.push({
          id: fileName.replace('.json', ''),
          fileName: fileName,
          title: title,
          blobName: null,
          createdAt: stats.mtime.toISOString(),
          lastModified: stats.mtime.toISOString(),
          exportTimestamp: stats.mtime.toISOString(),
          size: stats.size
        });
      }
      console.log('[history/export-files] ✅ ローカルファイル取得完了:', items.length, '件');
    } catch (localError) {
      console.error('[history/export-files] ❌ ローカルディレクトリエラー:', localError.message);
    }
    
    res.json({
      success: true,
      files: items,
      count: items.length,
      source: 'local',
      diagnostics: {
        mode: 'local',
        filesFound: items.length
      }
    });
  } catch (error) {
    console.error('[history/export-files] Error:', error);
    res.status(500).json({
      success: false,
      error: 'ファイル一覧の取得に失敗しました'
    });
  }
});

// Get history detail by id
async function getHistoryDetail(normalizedId) {
  const useGCS = !!bucket;
  
  if (useGCS) {
    // GCS から取得
    try {
      const files = await listFilesInGCS('chat-exports/json/');
      
      // ファイル名の正規化して検索
      const targetFile = files.find(f => {
        const fileName = f.name.split('/').pop();
        const nameWithoutExt = fileName.replace('.json', '');
        return nameWithoutExt === normalizedId || 
               nameWithoutExt.includes(`_${normalizedId}_`) ||
               fileName === `${normalizedId}.json`;
      });
      
      if (!targetFile) {
        return { status: 404, error: 'ファイルが見つかりません' };
      }
      
      const content = await downloadFromGCS(targetFile.name);
      const json = JSON.parse(content.toString('utf-8'));
      const fileName = targetFile.name.split('/').pop();
      const meta = extractMetadataFromJson(json, fileName);
      
      return {
        status: 200,
        data: {
          id: normalizedId,
          fileName: fileName,
          blobName: targetFile.name,
          ...meta,
          json,
        },
      };
    } catch (gcsError) {
      console.error('[getHistoryDetail] GCS error:', gcsError.message);
      // フォールバックしてローカルを試す
    }
  }
  
  // ローカルモード: chat-exports/json/ から読み取り
  const baseDir = path.join(process.cwd(), 'knowledge-base', 'chat-exports', 'json');
  
  try {
    const files = await fs.promises.readdir(baseDir);
    
    // ファイル名の正規化して検索
    const targetFile = files.find(f => {
      const nameWithoutExt = f.replace('.json', '');
      return nameWithoutExt === normalizedId || 
             nameWithoutExt.includes(`_${normalizedId}_`) ||
             f === `${normalizedId}.json`;
    });
    
    if (!targetFile) {
      return { status: 404, error: 'ファイルが見つかりません' };
    }
    
    const filePath = path.join(baseDir, targetFile);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const json = JSON.parse(content);
    const meta = extractMetadataFromJson(json, targetFile);
    
    return {
      status: 200,
      data: {
        id: normalizedId,
        fileName: targetFile,
        blobName: null,
        ...meta,
        json,
      },
    };
  } catch (localError) {
    return { status: 500, error: 'ファイル読込エラー: ' + localError.message };
  }
}

router.get(['/detail/:id', '/item/:id', '/:id'], async (req, res, next) => {
  // 既存のルート（/exports, /export-files など）より後に解決しないように、パスが数値や既存プレフィックスと衝突する場合はスキップ
  const id = req.params.id;
  if (!id || id === 'export-files' || id === 'exports' || id === 'upload-image' || id === 'machine-data') {
    return next();
  }

  try {
    const normalizedId = normalizeId(id);
    const result = await getHistoryDetail(normalizedId);
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, error: result.error });
    }

    return res.json({ success: true, ...result.data });
  } catch (error) {
    console.error('[history/detail] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 共通の更新処理
async function handleUpdateHistory(req, res, rawId) {
  try {
    const normalizedId = normalizeId(rawId);
    const useAzure = isAzureEnvironment();
    
    // ローカルモード: chat-exports/json/ から読み書き
    if (!useAzure) {
      const baseDir = path.join(process.cwd(), 'knowledge-base', 'chat-exports', 'json');
      const imagesDir = path.join(process.cwd(), 'knowledge-base', 'chat-exports', 'images');
      
      // 既存ファイルを検索
      const files = await fs.promises.readdir(baseDir);
      const targetFile = files.find(f => {
        const nameWithoutExt = f.replace('.json', '');
        return nameWithoutExt === normalizedId || 
               nameWithoutExt.includes(`_${normalizedId}_`) ||
               f === `${normalizedId}.json`;
      });
      
      const targetFileName = targetFile || `${normalizedId}.json`;
      const targetFilePath = path.join(baseDir, targetFileName);
      
      console.log('[history/update] Local target:', { normalizedId, targetFileName, exists: !!targetFile });
      
      // 既存データを読み取り
      let originalData = {};
      try {
        if (targetFile) {
          const content = await fs.promises.readFile(targetFilePath, 'utf-8');
          originalData = JSON.parse(content);
          console.log('[history/update] Original data loaded:', Object.keys(originalData));
        }
      } catch (readError) {
        console.warn('[history/update] Failed to load original data:', readError.message);
        originalData = {};
      }
      
      const updatePayload = req.body?.updatedData || req.body || {};
      const merged = mergeData(originalData, {
        ...updatePayload,
        lastModified: new Date().toISOString(),
      });
      
      // 画像の処理
      if (updatePayload.savedImages) {
        console.log('[history/update] Saving images:', {
          count: updatePayload.savedImages.length,
          images: updatePayload.savedImages.map(img => img.fileName || img.url?.substring(0, 50))
        });

        // 削除された画像の検出と削除
        // クライアントから明示的に送信されたdeletedImages配列を優先使用
        let imagesToDelete = [];
        
        if (req.body.deletedImages && Array.isArray(req.body.deletedImages)) {
          console.log(`[history/update] Using explicit deletedImages from client:`, req.body.deletedImages);
          imagesToDelete = req.body.deletedImages;
        } else {
          // フォールバック: 差分から自動検出
          const oldImages = originalData.savedImages || originalData.jsonData?.savedImages || [];
          const newImages = updatePayload.savedImages || [];
          const newImageNames = new Set(newImages.map(img => img.fileName || img.url?.split('/').pop()));
          
          const deletedImages = oldImages.filter(img => {
            const fileName = img.fileName || img.url?.split('/').pop();
            return fileName && !newImageNames.has(fileName);
          });
          imagesToDelete = deletedImages.map(img => img.fileName || img.url?.split('/').pop()).filter(Boolean);
        }

        if (imagesToDelete.length > 0) {
          console.log(`[history/update] LOCAL: Deleting ${imagesToDelete.length} images:`, imagesToDelete);
          for (const fileName of imagesToDelete) {
            if (fileName) {
              try {
                const imageFilePath = path.join(imagesDir, fileName);
                if (await fs.promises.access(imageFilePath).then(() => true).catch(() => false)) {
                  await fs.promises.unlink(imageFilePath);
                  console.log(`[history/update] LOCAL 🗑️ Deleted image: ${fileName}`);
                } else {
                  console.log(`[history/update] LOCAL ⚠️ Image not found (already deleted?): ${fileName}`);
                }
              } catch (delErr) {
                console.warn(`[history/update] LOCAL ❌ Failed to delete image: ${fileName}`, delErr.message);
              }
            }
          }
        }
        
        merged.savedImages = updatePayload.savedImages;
        merged.jsonData = mergeData(merged.jsonData || {}, { savedImages: updatePayload.savedImages });
        
        if (updatePayload.chatData) {
          merged.jsonData.chatData = updatePayload.chatData;
        }
        
        delete merged.images;
        console.log('[history/update] Images unified to jsonData.savedImages');
      }
      
      // 更新履歴を追加
      merged.updateHistory = Array.isArray(merged.updateHistory) ? merged.updateHistory : [];
      merged.updateHistory.push({
        timestamp: new Date().toISOString(),
        updatedBy: req.body?.updatedBy || 'user',
        updatedFields: Object.keys(updatePayload || {}).filter(k => updatePayload[k] !== undefined),
      });
      
      // ファイルに書き込み
      const content = JSON.stringify(merged, null, 2);
      await fs.promises.writeFile(targetFilePath, content, 'utf-8');
      
      return res.json({
        success: true,
        message: '保存しました',
        updatedData: merged,
        updatedFile: targetFileName
      });
    }
    
    // Azureモード: BLOBから読み書き
    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      return res.status(503).json({ success: false, error: 'BLOB storage not available' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const found = await findHistoryBlob(containerClient, normalizedId);
    const targetBlobName = found?.blobName || `chat-exports/json/${normalizedId}.json`;
    const targetFileName = found?.fileName || `${normalizedId}.json`;

    console.log('[history/update] Target:', { normalizedId, targetBlobName, found: !!found });

    let originalData = {};
    try {
      originalData = (await downloadJson(containerClient, targetBlobName)) || {};
      console.log('[history/update] Original data loaded:', Object.keys(originalData));
    } catch (downloadError) {
      console.warn('[history/update] Failed to load original data:', downloadError.message);
      // 新規作成として扱う
      originalData = {};
    }

    const updatePayload = req.body?.updatedData || req.body || {};
    const merged = mergeData(originalData, {
      ...updatePayload,
      lastModified: new Date().toISOString(),
    });

    // 🔧 修正: savedImages を単一のソースに統一（jsonData.savedImagesに集約）
    if (updatePayload.savedImages) {
      console.log('[history/update] Saving images:', {
        count: updatePayload.savedImages.length,
        images: updatePayload.savedImages.map(img => img.fileName || img.url?.substring(0, 50))
      });

      // 削除された画像の検出と削除
      // クライアントから明示的に送信されたdeletedImages配列を優先使用
      let imagesToDelete = [];
      
      if (req.body.deletedImages && Array.isArray(req.body.deletedImages)) {
        console.log(`[history/update] Using explicit deletedImages from client:`, req.body.deletedImages);
        imagesToDelete = req.body.deletedImages;
      } else {
        // フォールバック: 差分から自動検出
        const oldImages = originalData.savedImages || originalData.jsonData?.savedImages || [];
        const newImages = updatePayload.savedImages || [];
        const newImageNames = new Set(newImages.map(img => img.fileName || img.url?.split('/').pop()));
        
        const deletedImages = oldImages.filter(img => {
          const fileName = img.fileName || img.url?.split('/').pop();
          return fileName && !newImageNames.has(fileName);
        });
        imagesToDelete = deletedImages.map(img => img.fileName || img.url?.split('/').pop()).filter(Boolean);
      }

      if (imagesToDelete.length > 0) {
        console.log(`[history/update] AZURE: Deleting ${imagesToDelete.length} images:`, imagesToDelete);
        for (const fileName of imagesToDelete) {
          if (fileName) {
            try {
              const imageBlobName = norm(`images/chat-exports/${fileName}`);
              const imageBlob = containerClient.getBlobClient(imageBlobName);
              if (await imageBlob.exists()) {
                await imageBlob.delete();
                console.log(`[history/update] AZURE 🗑️ Deleted image: ${fileName}`);
              } else {
                console.log(`[history/update] AZURE ⚠️ Image not found (already deleted?): ${fileName}`);
              }
            } catch (delErr) {
              console.warn(`[history/update] AZURE ❌ Failed to delete image: ${fileName}`, delErr.message);
            }
          }
        }
      }
      
      merged.savedImages = updatePayload.savedImages;
      merged.jsonData = mergeData(merged.jsonData || {}, { savedImages: updatePayload.savedImages });
      
      // chatData が送信された場合はそれを使用、なければ既存を保持
      if (updatePayload.chatData) {
        merged.jsonData.chatData = updatePayload.chatData;
      }
      
      // 他の画像フィールドは削除して単一ソースに統一
      delete merged.images;
      console.log('[history/update] Images unified to jsonData.savedImages');
    }

    // 更新履歴を追加
    merged.updateHistory = Array.isArray(merged.updateHistory) ? merged.updateHistory : [];
    merged.updateHistory.push({
      timestamp: new Date().toISOString(),
      updatedBy: req.body?.updatedBy || 'user',
      updatedFields: Object.keys(updatePayload || {}).filter(k => updatePayload[k] !== undefined),
    });

    const content = JSON.stringify(merged, null, 2);
    const blockBlobClient = containerClient.getBlockBlobClient(targetBlobName);
    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: { blobContentType: 'application/json' }
    });

    return res.json({
      success: true,
      message: '保存しました',
      updatedData: merged,
      updatedFile: targetFileName
    });
  } catch (error) {
    console.error('[history/update] Error:', {
      message: error.message,
      stack: error.stack,
      normalizedId: rawId,
      updatePayload: req.body?.updatedData || req.body
    });
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  }
}

// Update history item (Save edited JSON)
router.put('/update-item/:id', async (req, res) => {
  await handleUpdateHistory(req, res, req.params.id);
});

// Backward compatible update endpoint
router.put('/:id', async (req, res) => {
  await handleUpdateHistory(req, res, req.params.id);
});

// Delete history
router.delete('/:id', async (req, res) => {
  try {
    const normalizedId = normalizeId(req.params.id);
    console.log(`[history/delete] Request: ${normalizedId}`);
    
    const useAzure = isAzureEnvironment();
    
    // ローカルモード: knowledge-base/ から削除
    if (!useAzure) {
      const baseDir = path.join(process.cwd(), 'knowledge-base', 'exports');
      const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images', 'chat-exports');
      
      // ファイルを検索
      const files = await fs.promises.readdir(baseDir);
      const targetFile = files.find(f => {
        const nameWithoutExt = f.replace('.json', '');
        return nameWithoutExt === normalizedId || 
               nameWithoutExt.includes(`_${normalizedId}_`) ||
               f === `${normalizedId}.json`;
      });
      
      if (!targetFile) {
        return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
      }
      
      const filePath = path.join(baseDir, targetFile);
      
      // JSONを読み取って画像ファイル名を取得
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const jsonData = JSON.parse(content);
      const metadata = extractMetadataFromJson(jsonData, targetFile);
      const imagesToDelete = metadata.images || [];
      
      console.log(`[history/delete] Found ${imagesToDelete.length} images to delete from JSON`);
      console.log('[history/delete] Images to delete details:', JSON.stringify(imagesToDelete, null, 2));
      
      // 関連する画像をローカルから削除
      let deletedImagesCount = 0;
      const deletedImagesList = [];
      
      for (const img of imagesToDelete) {
        try {
          let fileName = null;
          if (img.fileName && !img.fileName.startsWith('http')) {
            fileName = img.fileName.split('/').pop();
          } else if (img.url && !img.url.startsWith('http')) {
            fileName = img.url.split('/').pop();
          } else if (img.path) {
            fileName = img.path.split('/').pop();
          }
          
          if (fileName) {
            const imageFilePath = path.join(imagesDir, fileName);
            if (await fs.promises.access(imageFilePath).then(() => true).catch(() => false)) {
              await fs.promises.unlink(imageFilePath);
              deletedImagesCount++;
              deletedImagesList.push(fileName);
              console.log(`[history/delete] ✅ Deleted image: ${fileName}`);
            } else {
              console.log(`[history/delete] ⚠️ Image not found: ${fileName}`);
            }
          }
        } catch (imgError) {
          console.warn(`[history/delete] ❌ Failed to delete image:`, imgError.message);
        }
      }
      
      // JSONファイルを削除
      await fs.promises.unlink(filePath);
      console.log(`[history/delete] ✅ Deleted JSON: ${targetFile}`);
      
      return res.json({ 
        success: true, 
        message: '削除しました', 
        deletedFile: targetFile,
        deletedImages: deletedImagesCount,
        deletedImagesList: deletedImagesList,
        totalImagesFound: imagesToDelete.length
      });
    }
    
    // Azureモード: BLOBから削除
    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      return res.status(503).json({ success: false, error: 'BLOB storage not available' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const found = await findHistoryBlob(containerClient, normalizedId);

    if (!found) {
      return res.status(404).json({ success: false, error: 'ファイルが見つかりません' });
    }

    // JSONをダウンロードして画像ファイル名を取得
    const jsonData = await downloadJson(containerClient, found.blobName);
    const metadata = extractMetadataFromJson(jsonData, found.fileName);
    const imagesToDelete = metadata.images || [];

    console.log(`[history/delete] Found ${imagesToDelete.length} images to delete from JSON`);
    console.log('[history/delete] Images to delete details:', JSON.stringify(imagesToDelete, null, 2));

    // 関連する画像をBLOBから削除
    let deletedImagesCount = 0;
    const deletedImagesList = [];
    
    for (const img of imagesToDelete) {
      try {
        // ファイル名を抽出（URL、fileName、pathのいずれかから）
        let fileName = null;
        if (img.fileName && !img.fileName.startsWith('http')) {
          fileName = img.fileName.split('/').pop();
        } else if (img.url && !img.url.startsWith('http')) {
          fileName = img.url.split('/').pop();
        } else if (img.path) {
          fileName = img.path.split('/').pop();
        }
        
        if (fileName) {
          const imageBlobName = norm(`images/chat-exports/${fileName}`);
          const imageBlob = containerClient.getBlobClient(imageBlobName);
          const exists = await imageBlob.exists();
          
          if (exists) {
            await imageBlob.delete();
            deletedImagesCount++;
            deletedImagesList.push(fileName);
            console.log(`[history/delete] ✅ Deleted image: ${imageBlobName}`);
          } else {
            console.log(`[history/delete] ⚠️ Image not found: ${imageBlobName}`);
          }
        }
      } catch (imgError) {
        console.warn(`[history/delete] ❌ Failed to delete image:`, imgError.message);
        // 画像削除失敗は警告のみ、処理は継続
      }
    }

    // JSONファイルを削除
    await containerClient.getBlobClient(found.blobName).delete();
    console.log(`[history/delete] ✅ Deleted JSON: ${found.blobName}`);

    return res.json({ 
      success: true, 
      message: '削除しました', 
      deletedFile: found.fileName,
      deletedImages: deletedImagesCount,
      deletedImagesList: deletedImagesList,
      totalImagesFound: imagesToDelete.length
    });
  } catch (error) {
    console.error('[history/delete] ❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 孤立画像ファイルのクリーンアップ
router.post('/cleanup-orphaned-images', async (req, res) => {
  try {
    console.log('[history/cleanup-orphaned-images] Starting cleanup...');
    
    const useAzure = isAzureEnvironment();
    
    // ローカルモード: knowledge-base/ から孤立画像をクリーンアップ
    if (!useAzure) {
      const exportsDir = path.join(process.cwd(), 'knowledge-base', 'exports');
      const imagesDir = path.join(process.cwd(), 'knowledge-base', 'images', 'chat-exports');
      
      // 1. すべてのJSONファイルから参照されている画像を収集
      const referencedImages = new Set();
      
      console.log('[cleanup] Step 1: Collecting referenced images from JSON files...');
      const jsonFiles = await fs.promises.readdir(exportsDir);
      
      for (const fileName of jsonFiles) {
        if (!fileName.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(exportsDir, fileName);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const jsonData = JSON.parse(content);
          const metadata = extractMetadataFromJson(jsonData, fileName);
          const images = metadata.images || [];
          
          images.forEach(img => {
            const imgFileName = img.fileName || img.url?.split('/').pop();
            if (imgFileName && !imgFileName.startsWith('http')) {
              referencedImages.add(imgFileName);
            }
          });
        } catch (err) {
          console.warn(`[cleanup] Failed to parse JSON: ${fileName}`, err.message);
        }
      }
      
      console.log(`[cleanup] Found ${referencedImages.size} referenced images`);
      
      // 2. chat-exports内のすべての画像ファイルを取得
      const allImages = [];
      
      console.log('[cleanup] Step 2: Listing all images in chat-exports...');
      const imageFiles = await fs.promises.readdir(imagesDir);
      
      for (const fileName of imageFiles) {
        const filePath = path.join(imagesDir, fileName);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.isFile()) {
          allImages.push({
            fileName,
            filePath,
            size: stats.size,
            lastModified: stats.mtime
          });
        }
      }
      
      console.log(`[cleanup] Found ${allImages.length} total images`);
      
      // 3. 孤立画像（参照されていない画像）を特定
      const orphanedImages = allImages.filter(img => !referencedImages.has(img.fileName));
      
      console.log(`[cleanup] Found ${orphanedImages.length} orphaned images`);
      
      // 4. 孤立画像を削除（dryRun モードに対応）
      const dryRun = req.body?.dryRun === true;
      let deletedCount = 0;
      let deletedSize = 0;
      const deletedList = [];
      
      if (!dryRun) {
        console.log('[cleanup] Step 3: Deleting orphaned images...');
        for (const img of orphanedImages) {
          try {
            await fs.promises.unlink(img.filePath);
            deletedCount++;
            deletedSize += img.size;
            deletedList.push(img.fileName);
            console.log(`[cleanup] Deleted: ${img.fileName} (${img.size} bytes)`);
          } catch (delErr) {
            console.error(`[cleanup] Failed to delete: ${img.fileName}`, delErr.message);
          }
        }
      }
      
      return res.json({
        success: true,
        message: dryRun ? '孤立画像の検出が完了しました' : '孤立画像のクリーンアップが完了しました',
        dryRun,
        source: 'local',
        stats: {
          totalImages: allImages.length,
          referencedImages: referencedImages.size,
          orphanedImages: orphanedImages.length,
          deletedCount: dryRun ? 0 : deletedCount,
          deletedSize: dryRun ? 0 : deletedSize,
          deletedSizeMB: dryRun ? 0 : (deletedSize / 1024 / 1024).toFixed(2)
        },
        orphanedList: orphanedImages.map(img => ({
          fileName: img.fileName,
          size: img.size,
          lastModified: img.lastModified?.toISOString()
        })),
        deletedList: dryRun ? [] : deletedList
      });
    }
    
    // Azureモード: BLOBから孤立画像をクリーンアップ
    const blobServiceClient = getBlobServiceClient();
    if (!blobServiceClient) {
      return res.status(503).json({ success: false, error: 'BLOB storage not available' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // 1. すべてのJSONファイルから参照されている画像を収集
    const referencedImages = new Set();
    const jsonPrefix = 'knowledge-base/exports/';
    
    console.log('[cleanup] Step 1: Collecting referenced images from JSON files...');
    for await (const blob of containerClient.listBlobsFlat({ prefix: jsonPrefix })) {
      if (!blob.name.endsWith('.json')) continue;
      
      try {
        const jsonData = await downloadJson(containerClient, blob.name);
        const metadata = extractMetadataFromJson(jsonData, blob.name);
        const images = metadata.images || [];
        
        images.forEach(img => {
          const fileName = img.fileName || img.url?.split('/').pop();
          if (fileName && !fileName.startsWith('http')) {
            referencedImages.add(fileName);
          }
        });
      } catch (err) {
        console.warn(`[cleanup] Failed to parse JSON: ${blob.name}`, err.message);
      }
    }
    
    console.log(`[cleanup] Found ${referencedImages.size} referenced images`);
    
    // 2. chat-exports内のすべての画像ファイルを取得
    const imagePrefix = norm('images/chat-exports/');
    const allImages = [];
    
    console.log('[cleanup] Step 2: Listing all images in chat-exports...');
    for await (const blob of containerClient.listBlobsFlat({ prefix: imagePrefix })) {
      const fileName = blob.name.split('/').pop();
      if (fileName) {
        allImages.push({
          fileName,
          blobName: blob.name,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified
        });
      }
    }
    
    console.log(`[cleanup] Found ${allImages.length} total images`);
    
    // 3. 孤立画像（参照されていない画像）を特定
    const orphanedImages = allImages.filter(img => !referencedImages.has(img.fileName));
    
    console.log(`[cleanup] Found ${orphanedImages.length} orphaned images`);
    
    // 4. 孤立画像を削除（dryRun モードに対応）
    const dryRun = req.body?.dryRun === true;
    let deletedCount = 0;
    let deletedSize = 0;
    const deletedList = [];
    
    if (!dryRun) {
      console.log('[cleanup] Step 3: Deleting orphaned images...');
      for (const img of orphanedImages) {
        try {
          const imageBlob = containerClient.getBlobClient(img.blobName);
          await imageBlob.delete();
          deletedCount++;
          deletedSize += img.size;
          deletedList.push(img.fileName);
          console.log(`[cleanup] Deleted: ${img.fileName} (${img.size} bytes)`);
        } catch (delErr) {
          console.error(`[cleanup] Failed to delete: ${img.fileName}`, delErr.message);
        }
      }
    }
    
    return res.json({
      success: true,
      message: dryRun ? '孤立画像の検出が完了しました' : '孤立画像のクリーンアップが完了しました',
      dryRun,
      source: 'blob',
      stats: {
        totalImages: allImages.length,
        referencedImages: referencedImages.size,
        orphanedImages: orphanedImages.length,
        deletedCount: dryRun ? 0 : deletedCount,
        deletedSize: dryRun ? 0 : deletedSize,
        deletedSizeMB: dryRun ? 0 : (deletedSize / 1024 / 1024).toFixed(2)
      },
      orphanedList: orphanedImages.map(img => ({
        fileName: img.fileName,
        size: img.size,
        lastModified: img.lastModified?.toISOString()
      })),
      deletedList: dryRun ? [] : deletedList
    });
    
  } catch (error) {
    console.error('[history/cleanup-orphaned-images] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.stack
    });
  }
});

export default function registerHistoryRoutes(app) {
  app.use('/api/history', router);
}
