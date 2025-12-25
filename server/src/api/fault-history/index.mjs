// 故障履歴API - GCS/ローカルから故障履歴データと画像を取得
import { 
  downloadFromGCS, 
  listFilesInGCS, 
  existsInGCS,
  bucket 
} from '../../lib/google-cloud-storage.mjs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ローカルストレージのベースパス（GCSが利用できない場合のフォールバック）
const LOCAL_STORAGE_BASE = path.resolve(__dirname, '../../../knowledge-base');

// GCS設定
const GCS_BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'emergency-assistanceapp-storage';

function sendPreflight(res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400',
  });
  return res.status(200).send('');
}

export default async function faultHistoryHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  // パスを解析 - /api/fault-history 以降の部分を取得
  const urlPath = req.path || req.url || '';
  // /api/fault-history/xxx の形式から、/api/fault-history を取り除く
  const subPath = urlPath.replace(/^\/?(api\/)?fault-history\/?/, '');
  const pathParts = subPath.split('/').filter(Boolean);
  
  console.log('[fault-history] Request:', req.method, urlPath);
  console.log('[fault-history] Sub path:', subPath);
  console.log('[fault-history] Path parts:', pathParts);

  // /api/fault-history/images/* - 画像を取得
  if (pathParts[0] === 'images' || subPath.startsWith('images')) {
    return handleGetImage(req, res);
  }

  // /api/fault-history/stats - 統計情報
  if (pathParts[0] === 'stats' || subPath === 'stats') {
    return handleGetStats(req, res);
  }

  // /api/fault-history - 一覧を取得（パスパーツが空の場合）
  if (pathParts.length === 0 || subPath === '') {
    if (req.method === 'GET') {
      return handleListFaultHistory(req, res);
    }
  }

  // /api/fault-history/:id - 詳細を取得（それ以外の場合）
  if (pathParts.length >= 1 && pathParts[0] !== '') {
    return handleGetDetail(req, res, pathParts[0]);
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

/**
 * 故障履歴一覧を取得（chat-exports/json/フォルダから）
 */
async function handleListFaultHistory(req, res) {
  try {
    const useGCS = !!bucket;
    const { limit = 20, offset = 0, keyword, machineType, machineNumber, office, category } = req.query;
    
    console.log(`[fault-history] Listing fault history, storage mode: ${useGCS ? 'GCS' : 'local'}`);
    
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

    // JSONファイルの内容を読み込んでデータを構築
    const historyItems = [];
    
    for (const file of files) {
      try {
        let content;
        if (useGCS) {
          content = await downloadFromGCS(file.name);
        } else {
          const localPath = path.join(LOCAL_STORAGE_BASE, file.name);
          content = fs.readFileSync(localPath);
        }
        
        const jsonData = JSON.parse(content.toString('utf-8'));
        
        // フィルタリング
        if (keyword) {
          const searchText = JSON.stringify(jsonData).toLowerCase();
          if (!searchText.includes(keyword.toLowerCase())) continue;
        }
        
        if (machineType && jsonData.metadata?.machineType !== machineType) continue;
        if (machineNumber && jsonData.metadata?.machineNumber !== machineNumber) continue;
        if (office && jsonData.metadata?.office !== office) continue;
        if (category && jsonData.metadata?.category !== category) continue;

        // ファイル名からエクスポートIDを抽出
        const baseName = file.name.replace('chat-exports/json/', '').replace('.json', '');
        const parts = baseName.split('_');
        // UUIDは通常 8-4-4-4-12 の形式なので、その部分を探す
        const uuidMatch = baseName.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
        const exportId = uuidMatch ? uuidMatch[0] : (jsonData.exportId || parts[parts.length - 2] || baseName);
        
        // 画像情報を構築
        const images = (jsonData.images || []).map((img, idx) => ({
          id: `img-${exportId}-${idx}`,
          faultHistoryId: exportId,
          originalFileName: img.originalName || img.name || `image_${idx + 1}`,
          fileName: img.storagePath || img.fileName || '',
          filePath: img.url || '',
          relativePath: img.storagePath || '',
          mimeType: img.mimeType || 'image/png',
          fileSize: img.size?.toString() || '0',
          description: img.description || '',
          createdAt: file.created || new Date().toISOString(),
        }));

        historyItems.push({
          id: exportId,
          title: jsonData.metadata?.title || baseName.split('_')[0] || '故障履歴',
          description: jsonData.metadata?.description || '',
          machineType: jsonData.metadata?.machineType || '',
          machineNumber: jsonData.metadata?.machineNumber || '',
          office: jsonData.metadata?.office || '',
          category: jsonData.metadata?.category || '',
          keywords: jsonData.metadata?.keywords || [],
          jsonData: jsonData,
          storageMode: useGCS ? 'gcs' : 'file',
          filePath: file.name,
          createdAt: file.created || jsonData.exportDate || new Date().toISOString(),
          updatedAt: file.updated || jsonData.exportDate || new Date().toISOString(),
          images: images,
        });
      } catch (err) {
        console.error(`[fault-history] Error parsing file ${file.name}:`, err.message);
      }
    }

    // ソート（新しい順）
    historyItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // ページネーション
    const offsetNum = parseInt(offset, 10) || 0;
    const limitNum = parseInt(limit, 10) || 20;
    const paginatedItems = historyItems.slice(offsetNum, offsetNum + limitNum);

    return res.status(200).json({
      success: true,
      data: paginatedItems,
      total: historyItems.length,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + limitNum < historyItems.length,
      storage: useGCS ? 'gcs' : 'local',
    });

  } catch (error) {
    console.error('[fault-history] List error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'list_failed',
      message: error.message || '故障履歴一覧の取得に失敗しました',
    });
  }
}

/**
 * 故障履歴詳細を取得
 */
async function handleGetDetail(req, res, id) {
  try {
    const useGCS = !!bucket;
    
    console.log(`[fault-history] Getting detail for id: ${id}`);
    
    // IDに一致するファイルを検索
    let files = [];
    if (useGCS) {
      files = await listFilesInGCS('chat-exports/json/');
    } else {
      const localDir = path.join(LOCAL_STORAGE_BASE, 'chat-exports', 'json');
      if (fs.existsSync(localDir)) {
        const fileNames = fs.readdirSync(localDir);
        files = fileNames.filter(f => f.endsWith('.json')).map(f => ({
          name: `chat-exports/json/${f}`,
        }));
      }
    }

    // IDを含むファイルを探す
    const targetFile = files.find(f => f.name.includes(id));
    
    if (!targetFile) {
      return res.status(404).json({
        success: false,
        error: 'not_found',
        message: '指定された故障履歴が見つかりません',
      });
    }

    let content;
    let fileStats = { created: new Date().toISOString(), updated: new Date().toISOString() };
    
    if (useGCS) {
      content = await downloadFromGCS(targetFile.name);
      if (targetFile.created) fileStats.created = targetFile.created;
      if (targetFile.updated) fileStats.updated = targetFile.updated;
    } else {
      const localPath = path.join(LOCAL_STORAGE_BASE, targetFile.name);
      content = fs.readFileSync(localPath);
      const stats = fs.statSync(localPath);
      fileStats.created = stats.birthtime.toISOString();
      fileStats.updated = stats.mtime.toISOString();
    }

    const jsonData = JSON.parse(content.toString('utf-8'));
    const baseName = targetFile.name.replace('chat-exports/json/', '').replace('.json', '');
    const exportId = jsonData.exportId || id;

    // 画像情報を構築
    const images = (jsonData.images || []).map((img, idx) => ({
      id: `img-${exportId}-${idx}`,
      faultHistoryId: exportId,
      originalFileName: img.originalName || img.name || `image_${idx + 1}`,
      fileName: img.storagePath || img.fileName || '',
      filePath: img.url || '',
      relativePath: img.storagePath || '',
      mimeType: img.mimeType || 'image/png',
      fileSize: img.size?.toString() || '0',
      description: img.description || '',
      createdAt: fileStats.created,
    }));

    const historyItem = {
      id: exportId,
      title: jsonData.metadata?.title || baseName.split('_')[0] || '故障履歴',
      description: jsonData.metadata?.description || '',
      machineType: jsonData.metadata?.machineType || '',
      machineNumber: jsonData.metadata?.machineNumber || '',
      office: jsonData.metadata?.office || '',
      category: jsonData.metadata?.category || '',
      keywords: jsonData.metadata?.keywords || [],
      jsonData: jsonData,
      storageMode: useGCS ? 'gcs' : 'file',
      filePath: targetFile.name,
      createdAt: fileStats.created,
      updatedAt: fileStats.updated,
      images: images,
    };

    return res.status(200).json({
      success: true,
      data: historyItem,
    });

  } catch (error) {
    console.error('[fault-history] Detail error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'detail_failed',
      message: error.message || '故障履歴詳細の取得に失敗しました',
    });
  }
}

/**
 * 故障履歴の画像を取得
 */
async function handleGetImage(req, res) {
  try {
    const useGCS = !!bucket;
    
    // URLから画像パスを抽出
    const urlPath = req.path || req.url || '';
    // /api/fault-history/images/xxx または /images/xxx 形式を処理
    let imagePath = urlPath.replace(/^\/?(api\/)?fault-history\/images\//, '');
    
    console.log(`[fault-history] Getting image: ${imagePath}`);
    
    // 画像パスが chat-exports/images/ で始まっていない場合は追加
    if (!imagePath.startsWith('chat-exports/images/')) {
      imagePath = `chat-exports/images/${imagePath}`;
    }

    let imageBuffer;
    let contentType = 'image/png';

    if (useGCS) {
      // GCSから画像を取得
      try {
        imageBuffer = await downloadFromGCS(imagePath);
      } catch (err) {
        console.error(`[fault-history] GCS image download error for ${imagePath}:`, err.message);
        return res.status(404).json({
          success: false,
          error: 'image_not_found',
          message: `画像が見つかりません: ${imagePath}`,
        });
      }
    } else {
      // ローカルから画像を取得
      const localPath = path.join(LOCAL_STORAGE_BASE, imagePath);
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({
          success: false,
          error: 'image_not_found',
          message: `画像が見つかりません: ${localPath}`,
        });
      }
      imageBuffer = fs.readFileSync(localPath);
    }

    // 拡張子からContent-Typeを判定
    if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (imagePath.endsWith('.gif')) {
      contentType = 'image/gif';
    } else if (imagePath.endsWith('.webp')) {
      contentType = 'image/webp';
    }

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',
    });
    
    return res.status(200).send(imageBuffer);

  } catch (error) {
    console.error('[fault-history] Image error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'image_failed',
      message: error.message || '画像の取得に失敗しました',
    });
  }
}

/**
 * 故障履歴の統計情報を取得
 */
async function handleGetStats(req, res) {
  try {
    const useGCS = !!bucket;
    
    let files = [];
    if (useGCS) {
      files = await listFilesInGCS('chat-exports/json/');
    } else {
      const localDir = path.join(LOCAL_STORAGE_BASE, 'chat-exports', 'json');
      if (fs.existsSync(localDir)) {
        const fileNames = fs.readdirSync(localDir);
        files = fileNames.filter(f => f.endsWith('.json')).map(f => ({
          name: `chat-exports/json/${f}`,
          created: fs.statSync(path.join(localDir, f)).birthtime.toISOString(),
        }));
      }
    }

    // 統計情報を集計
    const stats = {
      total: files.length,
      byMachineType: {},
      byCategory: {},
      byOffice: {},
      recentCount: 0,
    };

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const file of files) {
      try {
        let content;
        if (useGCS) {
          content = await downloadFromGCS(file.name);
        } else {
          const localPath = path.join(LOCAL_STORAGE_BASE, file.name);
          content = fs.readFileSync(localPath);
        }
        
        const jsonData = JSON.parse(content.toString('utf-8'));
        
        // 機種別
        const machineType = jsonData.metadata?.machineType || 'その他';
        stats.byMachineType[machineType] = (stats.byMachineType[machineType] || 0) + 1;
        
        // カテゴリ別
        const category = jsonData.metadata?.category || 'その他';
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        
        // 事業所別
        const office = jsonData.metadata?.office || 'その他';
        stats.byOffice[office] = (stats.byOffice[office] || 0) + 1;
        
        // 30日以内
        const fileDate = new Date(file.created || jsonData.exportDate);
        if (fileDate >= thirtyDaysAgo) {
          stats.recentCount++;
        }
      } catch (err) {
        console.error(`[fault-history] Error parsing file for stats ${file.name}:`, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: stats,
    });

  } catch (error) {
    console.error('[fault-history] Stats error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'stats_failed',
      message: error.message || '統計情報の取得に失敗しました',
    });
  }
}

export const methods = ['get', 'options'];

