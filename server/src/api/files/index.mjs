import { upload } from '../../infra/blob.mjs';
import { uploadFile, isGCSStorage } from '../../lib/storage.mjs';
// GCS専用ストレージシステム（Azure削除済み）
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function (req, res) {
  try {
    console.log('[api/files] Request:', { method: req.method, path: req.path, url: req.url });

    // OPTIONSリクエストの処理
    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Max-Age': '86400',
      });
      return res.status(200).send('');
    }

    // パスパラメータの取得
    const parts = req.path.split('/');
    const action = parts[parts.length - 1];
    const method = req.method;

    console.log('[api/files] Request details:', { method, action, path: req.path });

    // POST /api/files/import - ファイルインポート
    if (method === 'POST' && (action === 'import' || req.path.endsWith('/import'))) {
      console.log('[api/files/import] File upload request received:', {
        hasFile: !!req.file,
        hasFiles: !!req.files,
        bodyKeys: Object.keys(req.body || {}),
        contentType: req.headers['content-type']
      });

      // Multerでファイルをパースする必要があるため、multerミドルウェアが適用されているかチェック
      if (!req.file && !req.files) {
        console.error('[api/files/import] No file uploaded. Request details:', {
          headers: req.headers,
          body: req.body
        });
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'ファイルが選択されていません。ファイルサイズが制限（100MB）を超えている可能性があります。'
        });
      }

      const uploadedFile = req.file;
      const saveOriginalFile = req.body.saveOriginalFile === 'true';
      const machineTag = req.body.machineTag || '';

      console.log('[api/files/import] File upload:', {
        fileName: uploadedFile?.originalname,
        fileSize: uploadedFile?.size,
        mimetype: uploadedFile?.mimetype,
        saveOriginalFile,
        machineTag
      });

      const useGCS = isGCSStorage();
      console.log('[api/files/import] Environment:', {
        useGCS,
        STORAGE_MODE: process.env.STORAGE_MODE,
        GCS_BUCKET: process.env.GOOGLE_CLOUD_STORAGE_BUCKET
      });

      // 保存先を決定
      const fileName = uploadedFile.originalname;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // ファイル名をサニタイズ（特殊文字を削除してURLセーフにする）
      const sanitizedFileName = fileName
        .normalize('NFC')  // Unicode正規化
        .replace(/[\s]+/g, '_')  // スペースをアンダースコアに
        .replace(/[^\w\.\-]/g, '')  // 英数字、ドット、ハイフン、アンダースコア以外を削除
        .replace(/\.+/g, '.')  // 連続するドットを1つに
        .trim();
      
      // 機種タグがある場合はファイル名に付与
      const machinePrefix = machineTag ? `[${machineTag}]_` : '';
      const safeFileName = `${timestamp}_${machinePrefix}${sanitizedFileName}`;

      try {
        let filePath = null;

        // saveOriginalFileがtrueの場合のみ元ファイルを保存
        if (saveOriginalFile) {
          // 全てmanualsフォルダに保存（機種タグはファイル名に含まれる）
          filePath = `manuals/${safeFileName}`;

          console.log('[api/files/import] Uploading to storage:', {
            storageMode: useGCS ? 'GCS' : 'Local',
            filePath,
            fileSize: uploadedFile.size
          });

          await uploadFile(uploadedFile.buffer, filePath, uploadedFile.mimetype);
          console.log('[api/files/import] ✅ File uploaded:', filePath);
        } else {
          console.log('[api/files/import] ⚠️ Skipping original file save (saveOriginalFile=false)');
        }

        // 自動処理トリガー: DataProcessorを呼び出す
        const isLocalDev = process.env.LOCAL_DEV === 'true';
        
        if (isLocalDev) {
          setImmediate(async () => {
            try {
              console.log('[api/files/import] 🔄 ai-context処理開始:', fileName);
              const module = await import('../data-processor/index.mjs');
              
              const mockReq = {
                method: 'POST',
                path: '/api/data-processor/process',
                body: {
                  filePath: filePath,
                  fileBuffer: saveOriginalFile ? null : uploadedFile.buffer,
                  fileType: uploadedFile.mimetype,
                  fileName: fileName,
                  machineTag: machineTag
                }
              };
              
              const mockRes = {
                set: () => {},
                status: (code) => ({
                  json: (data) => {
                    if (code === 200) {
                      console.log('[api/files/import] ✅ ai-context処理完了:', fileName);
                    } else {
                      console.error('[api/files/import] ❌ ai-context処理失敗:', code, data);
                    }
                  },
                  send: () => {}
                }),
                json: (data) => console.log('[api/files/import] 処理結果:', data)
              };

              await module.default(mockReq, mockRes);
            } catch (err) {
              console.error('[api/files/import] ❌ ai-context処理エラー:', err);
            }
          });
        } else {
          console.log('[api/files/import] ⏭️  本番環境: ai-context処理スキップ（元ファイルから直接読み込み）');
        }

        console.log('[api/files/import] ✅ ファイル保存完了' + (machineTag ? '（機種: ' + machineTag + '）' : '') + ':', filePath);

        return res.status(200).json({
          success: true,
          message: 'ファイルのインポートが完了しました（バックグラウンド処理開始）',
          importedFiles: [{
            id: `file-${timestamp}`,
            name: fileName,
            path: filePath,
            size: uploadedFile.size,
            type: uploadedFile.mimetype,
            importedAt: new Date().toISOString(),
            storage: useGCS ? 'gcs' : 'local'
          }],
          totalFiles: 1,
          processedFiles: 1,
          errors: []
        });
      } catch (error) {
        console.error('[api/files/import] Upload error:', error);
        return res.status(500).json({
          success: false,
          error: 'File upload failed',
          message: error.message
        });
      }
    }

    // GET /api/files - ファイル一覧
    // action が空、または /api/files そのものへのアクセス
    if (method === 'GET' && (req.path === '/api/files' || req.path === '/api/files/')) {
      const files = [
        {
          id: 'file-1',
          name: 'sample-file-1.txt',
          size: 1024,
          type: 'text/plain',
          uploadedAt: new Date().toISOString(),
          status: 'ready',
        },
        {
          id: 'file-2',
          name: 'sample-file-2.pdf',
          size: 2048,
          type: 'application/pdf',
          uploadedAt: new Date(Date.now() - 86400000).toISOString(),
          status: 'ready',
        },
      ];

      return res.status(200).json({
        success: true,
        data: files,
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Not found',
      path: req.path
    });

  } catch (error) {
    console.error('[api/files] Error:', {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method
    });
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
      path: req.path
    });
  }
}

export const methods = ['get', 'post', 'put', 'delete', 'options'];
export { upload };
