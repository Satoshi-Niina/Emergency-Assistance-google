// GCS専用ストレージシステム（Azure削除済み）
import { chunkText } from '../../../services/chunker.js';
import { uploadFile, isGCSStorage } from '../../lib/storage.mjs';
// OpenAI Embedding機能は使用しないためコメントアウト
// import { embedTexts } from '../../../services/embedding.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import path from 'path';
import * as fs from 'fs/promises';

export default async function (req, res) {
  try {
    console.log('[api/data-processor] Request received');

    // OPTIONS request
    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Max-Age': '86400',
      });
      return res.status(200).send('');
    }

    const parts = req.path.split('/');
    const action = parts[parts.length - 1];
    const method = req.method;

    console.log('[api/data-processor] Action:', action);

    // POST /api/data-processor/process
    if (method === 'POST' && (action === 'process' || req.path.endsWith('/process'))) {
      const body = req.body;
      const { filePath, fileBuffer, fileType, fileName } = body; // fileBuffer: 元ファイル非保存時のバッファ

      console.log('[api/data-processor] Processing file:', { filePath, hasBuffer: !!fileBuffer, fileType });

      if (!filePath && !fileBuffer) {
        return res.status(400).json({ success: false, error: 'No filePath or fileBuffer provided' });
      }

      let textContent = '';
      let buffer = null;

      // 1. Fetch File Content
      try {
        // fileBufferが提供されている場合（元ファイル非保存）
        if (fileBuffer) {
          console.log('[api/data-processor] Using provided file buffer');
          buffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
        } else {
          // filePathから読み込む（元ファイル保存済み）
          console.log('[api/data-processor] Reading file from:', filePath);
          buffer = await fs.readFile(filePath);
        }

        // Extract text based on type
        if (fileType === 'application/pdf' || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
          const data = await pdf(buffer);
          textContent = data.text;
        } else {
          textContent = buffer.toString('utf8');
        }
      } catch (fetchError) {
        console.error('[api/data-processor] Failed to fetch/extract file:', fetchError);
        return res.status(500).json({ success: false, error: 'File fetch failed', details: fetchError.message });
      }

      if (!textContent || textContent.trim().length === 0) {
        return res.status(422).json({ success: false, error: 'Extracted text is empty' });
      }

      console.log('[api/data-processor] Text extracted. Length:', textContent.length);

      // 2. Chunking
      const chunks = chunkText(textContent, { size: 800, overlap: 80 });
      console.log('[api/data-processor] Chunked into', chunks.length, 'parts');

      // 3. Embedding機能は無効化（Geminiで直接テキスト検索を使用）
      console.log('[api/data-processor] ⚠️ Embedding機能はスキップ（Geminiでキーワード検索を使用）');
      const embeddings = []; // 空配列

      // 4. Save Metadata (Chunks + Embeddings)
      // メタデータは処理済みデータとしてmanuals/processed/に保存
      // 元ファイルはmanuals/に保存済み

      const metadata = {
        id: `doc-${Date.now()}`,
        title: fileName,
        path: filePath,
        source: 'upload',
        timestamp: new Date().toISOString(),
        chunks: chunks.map((chunk, i) => ({
          ...chunk,
          // embedding機能は無効化（Geminiキーワード検索で対応）
        })),
        // Geminiでの検索用にテキスト全体を保持
        content: textContent.substring(0, 10000),
        fullContent: textContent, // 全文保存
        keywords: [] // 将来的にキーワード抽出機能を追加可能
      };

      const metadataFileName = `doc-${Date.now()}.json`;
      const metadataBlobPath = `manuals/processed/${metadataFileName}`;

      const useGCS = isGCSStorage();
      console.log('[api/data-processor] 📁 保存環境:', useGCS ? 'Google Cloud Storage' : 'Local Filesystem');
      console.log('[api/data-processor] 📁 メタデータ保存パス:', metadataBlobPath);
      console.log('[api/data-processor] 📊 チャンク数:', chunks.length);
      console.log('[api/data-processor] 📊 エンベディング数:', embeddings.length);

      try {
        const jsonBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
        await uploadFile(jsonBuffer, metadataBlobPath, 'application/json');
        console.log('[api/data-processor] ✅ メタデータを保存:', metadataBlobPath);
        console.log('[api/data-processor] 🔍 保存先:', useGCS ? `GCS Bucket: ${process.env.GOOGLE_CLOUD_STORAGE_BUCKET}` : 'Local storage');
      } catch (saveError) {
        console.error('[api/data-processor] ❌ メタデータ保存失敗:', saveError);
        console.error('[api/data-processor] ❌ エラー詳細:', {
          message: saveError.message,
          stack: saveError.stack,
          code: saveError.code
        });
        return res.status(500).json({ success: false, error: 'Metadata save failed', details: saveError.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Processing completed',
        processedData: {
          id: metadata.id,
          chunks: chunks.length,
          metadataPath: metadataBlobPath
        }
      });
    }

    return res.status(404).json({ message: 'Not found' });

  } catch (error) {
    console.error('Error in data processor function:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
}

