// GCSを優先使用、利用できない場合はローカルにフォールバック
import { AUTO_INGEST_CHAT_EXPORTS } from '../../config/env.mjs';
import { uploadBufferToGCS, downloadFromGCS, existsInGCS, listFilesInGCS, bucket } from '../../lib/google-cloud-storage.mjs';

// GCS上の保存先パス
const GCS_EXPORT_DIR = 'chat-exports/json';
// ローカル保存時のサブディレクトリ
const LOCAL_EXPORT_SUBDIR = 'exports';

// GCSが利用可能かどうかをチェック
const useGCS = () => !!bucket;

async function saveJsonFile(fileName, content) {
  const isGCS = useGCS();
  const fs = await import('fs');
  const path = await import('path');

  // GCSモード: chat-exports/json/ へ保存（優先）
  if (isGCS) {
    console.log('[saveJsonFile] GCS: Using Google Cloud Storage:', fileName);
    const gcsPath = `${GCS_EXPORT_DIR}/${fileName}`;
    const buffer = Buffer.from(content, 'utf-8');
    const publicUrl = await uploadBufferToGCS(buffer, gcsPath, 'application/json');
    console.log(`[saveJsonFile] GCS: Successfully saved to: ${gcsPath}`);
    return { storage: 'gcs', path: gcsPath, url: publicUrl };
  }

  // ローカルモード: knowledge-base/exports/ へ保存（フォールバック）
  console.log('[saveJsonFile] LOCAL: Using local filesystem:', fileName);
  const localDir = path.join(process.cwd(), 'knowledge-base', LOCAL_EXPORT_SUBDIR);
  await fs.promises.mkdir(localDir, { recursive: true });
  const localPath = path.join(localDir, fileName);
  await fs.promises.writeFile(localPath, content, 'utf8');
  console.log(`[saveJsonFile] LOCAL: Successfully saved to: ${localPath}`);
  return { storage: 'local', path: localPath };
}

async function getLatestExport(chatId) {
  let latest = null;
  const isGCS = useGCS();
  const fs = await import('fs');
  const path = await import('path');

  // GCSモード: chat-exports/json/ から最新ファイルを検索（優先）
  if (isGCS) {
    try {
      const files = await listFilesInGCS(`${GCS_EXPORT_DIR}/`);
      for (const file of files) {
        if (!file.name.endsWith('.json')) continue;
        if (!chatId || file.name.includes(chatId)) {
          const fileDate = new Date(file.updated);
          if (!latest || fileDate > latest.lastModified) {
            latest = {
              source: 'gcs',
              name: file.name.replace(`${GCS_EXPORT_DIR}/`, ''),
              lastModified: fileDate,
            };
          }
        }
      }
      if (latest) return latest;
    } catch (error) {
      console.warn('[api/chats] GCS: Error reading exports:', error.message);
    }
  }

  // ローカルモード: knowledge-base/exports/ から最新ファイルを検索（フォールバック）
  const localDir = path.join(process.cwd(), 'knowledge-base', LOCAL_EXPORT_SUBDIR);
  try {
    const files = await fs.promises.readdir(localDir);
    for (const fileName of files) {
      if (!fileName.endsWith('.json')) continue;
      if (!chatId || fileName.includes(chatId)) {
        const filePath = path.join(localDir, fileName);
        const stats = await fs.promises.stat(filePath);
        if (!latest || stats.mtime > latest.lastModified) {
          latest = {
            source: 'local',
            name: fileName,
            lastModified: stats.mtime,
          };
        }
      }
    }
  } catch (error) {
    console.warn('[api/chats] LOCAL: Error reading exports:', error.message);
  }

  return latest;
}

async function downloadExport(fileName) {
  const isGCS = useGCS();
  const fs = await import('fs');
  const path = await import('path');

  // GCSモード: chat-exports/json/ から読み取り（優先）
  if (isGCS) {
    const gcsPath = `${GCS_EXPORT_DIR}/${fileName}`;
    console.log('[api/chats] GCS: Downloading from:', gcsPath);
    try {
      const exists = await existsInGCS(gcsPath);
      if (exists) {
        return await downloadFromGCS(gcsPath);
      }
    } catch (error) {
      console.warn('[api/chats] GCS: Error reading file:', error.message);
    }
  }

  // ローカルモード: knowledge-base/exports/ から読み取り（フォールバック）
  const localPath = path.join(process.cwd(), 'knowledge-base', LOCAL_EXPORT_SUBDIR, fileName);
  console.log('[api/chats] LOCAL: Downloading from local:', localPath);
  try {
    if (await fs.promises.access(localPath).then(() => true).catch(() => false)) {
      return await fs.promises.readFile(localPath);
    }
  } catch (error) {
    console.warn('[api/chats] LOCAL: Error reading file:', error.message);
  }

  return null;
}

// エクスポートファイル名に事象名（タイトル）を含めるためのヘルパー
function deriveExportTitle(payload = {}) {
  const fallback = 'chat';
  const chatData = payload.chatData || {};
  const messages = Array.isArray(chatData.messages) ? chatData.messages : [];
  const machineInfo = chatData.machineInfo || {};

  let title = '';

  // まず最初のユーザーメッセージをタイトルにする（優先）
  const firstUserMessage = messages.find(
    (m) => m && m.isAiResponse === false && typeof m.content === 'string' && m.content.trim()
  );
  if (firstUserMessage) {
    title = firstUserMessage.content.split(/\r?\n/)[0].slice(0, 80);
  }

  // フォールバック: 機種名と機械番号
  if (!title) {
    const machineType =
      machineInfo.machineTypeName ||
      machineInfo.selectedMachineType ||
      machineInfo.machineType ||
      '';
    const machineNumber =
      machineInfo.machineNumber ||
      machineInfo.selectedMachineNumber ||
      '';

    if (machineType || machineNumber) {
      title = `${machineType || ''}${machineNumber ? `_${machineNumber}` : ''}`;
    }
  }

  if (!title) title = fallback;

  // ファイル名に使えない文字を除去し、空白はトリム
  title = title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  if (!title) title = fallback;
  if (title.length > 80) title = title.slice(0, 80);
  return title;
}

export default async function chatsHandler(req, res) {
  const parts = req.path.split('/').filter(Boolean); // ["api","chats",":chatId", ...]
  const chatId = parts[2];
  const action = parts[3];

  if (req.method === 'OPTIONS') {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.status(200).send('');
  }

  // /api/chats/exports/:fileName
  if (parts[2] === 'exports' && parts.length >= 4 && req.method === 'GET') {
    const fileName = parts.slice(3).join('/');
    const buffer = await downloadExport(fileName);
    if (!buffer) {
      return res.status(404).json({ success: false, error: 'not_found' });
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(buffer);
  }

  if (!chatId) {
    return res.status(400).json({ success: false, error: 'chatId is required' });
  }

  // POST /api/chats/:chatId/export
  if (req.method === 'POST' && action === 'export') {
    const payload = req.body || {};
    const title = deriveExportTitle(payload);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${title}_${chatId}_${timestamp}.json`;
    
    // 画像データのログ出力
    const savedImages = payload.savedImages || [];
    console.log('[chats/export] Export request:', {
      chatId,
      title,
      savedImagesCount: savedImages.length,
      savedImages: savedImages.map(img => ({
        fileName: img.fileName,
        url: img.url?.substring(0, 50)
      }))
    });
    
    const content = JSON.stringify({ chatId, exportType: 'manual_export', ...payload, savedAt: new Date().toISOString(), title }, null, 2);
    const saveResult = await saveJsonFile(fileName, content);
    
    console.log('[chats/export] Saved to:', saveResult.storage, fileName);
    
    return res.json({ success: true, fileName, storage: saveResult.storage });
  }

  // POST /api/chats/:chatId/send or send-test
  if (req.method === 'POST' && (action === 'send' || action === 'send-test')) {
    const payload = req.body || {};
    const title = deriveExportTitle(payload);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${title}_${chatId}_${timestamp}.json`;
    const content = JSON.stringify({ chatId, exportType: payload.exportType || action, ...payload, savedAt: new Date().toISOString(), title }, null, 2);
    const saveResult = await saveJsonFile(fileName, content);
    return res.json({
      success: true,
      fileName,
      storage: saveResult.storage,
      knowledgeUpdateScheduled: AUTO_INGEST_CHAT_EXPORTS === true
    });
  }

  // GET /api/chats/:chatId/formatted-export
  if (req.method === 'GET' && action === 'formatted-export') {
    const latest = await getLatestExport(chatId);
    return res.json({
      success: true,
      chatId,
      lastExport: latest?.name || null,
      lastModified: latest?.lastModified || null
    });
  }

  // GET /api/chats/:chatId/last-export
  if (req.method === 'GET' && action === 'last-export') {
    const latest = await getLatestExport(chatId);
    if (!latest) {
      return res.json({ success: true, exists: false });
    }
    return res.json({ success: true, exists: true, fileName: latest.name, timestamp: latest.lastModified });
  }

  return res.status(404).json({ success: false, error: 'not_found' });
}

export const methods = ['get', 'post', 'options'];
