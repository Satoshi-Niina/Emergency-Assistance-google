// Azure Blobインポート削除済み - GCSは lib/storage.mjs 使用
import { isAzureEnvironment } from '../../config/env.mjs';
import { chunkText } from '../../../services/chunker.js';
// OpenAI Embedding機能は使用しないためコメントアウト
// import { embedTexts } from '../../../services/embedding.js';
import path from 'path';

export default async function (req, res) {
  try {
    console.log('[api/history-import] Request received');

    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Max-Age': '86400',
      });
      return res.status(200).send('');
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { fileName } = req.body;

    if (!fileName) {
      return res.status(400).json({ success: false, error: 'fileName is required' });
    }

    console.log('[api/history-import] Processing export file:', fileName);

    const useAzure = isAzureEnvironment();
    let jsonContent = null;

    // 1. JSONファイルを読み込む（history/フォルダから）
    try {
      if (useAzure) {
        const blobServiceClient = getBlobServiceClient();
        if (!blobServiceClient) {
          throw new Error('Blob Service unavailable');
        }
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobPath = `history/${fileName}`;
        const blobClient = containerClient.getBlobClient(blobPath);

        console.log('[api/history-import] Downloading from blob:', blobPath);

        const downloadResponse = await blobClient.download();
        const chunks = [];
        for await (const chunk of downloadResponse.readableStreamBody) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        jsonContent = JSON.parse(buffer.toString('utf8'));
      } else {
        const fs = await import('fs/promises');
        const localPath = path.join(process.cwd(), 'knowledge-base', 'history', fileName);
        const buffer = await fs.readFile(localPath);
        jsonContent = JSON.parse(buffer.toString('utf8'));
      }
    } catch (fetchError) {
      console.error('[api/history-import] Failed to read JSON:', fetchError);
      return res.status(500).json({ success: false, error: 'Failed to read file', details: fetchError.message });
    }

    // 2. JSONからテキストを抽出
    let textContent = '';
    try {
      const chatData = jsonContent.chatData || jsonContent;
      const machineInfo = chatData.machineInfo || {};
      const messages = chatData.messages || [];
      
      // 機種情報
      textContent += `機種: ${machineInfo.machineTypeName || machineInfo.selectedMachineType || '不明'}\n`;
      textContent += `機械番号: ${machineInfo.machineNumber || machineInfo.selectedMachineNumber || '不明'}\n`;
      
      // メッセージ履歴
      messages.forEach((msg, idx) => {
        const role = msg.isAiResponse ? 'AI' : 'ユーザー';
        textContent += `\n[${role} ${idx + 1}]: ${msg.content}\n`;
      });

      // 画像情報
      if (chatData.savedImages && chatData.savedImages.length > 0) {
        textContent += `\n画像: ${chatData.savedImages.length}件添付\n`;
      }

      console.log('[api/history-import] Extracted text length:', textContent.length);
    } catch (extractError) {
      console.error('[api/history-import] Text extraction error:', extractError);
      return res.status(500).json({ success: false, error: 'Text extraction failed', details: extractError.message });
    }

    if (!textContent || textContent.trim().length === 0) {
      return res.status(422).json({ success: false, error: 'No text content extracted from JSON' });
    }

    // 3. チャンク化
    const chunks = chunkText(textContent, { size: 800, overlap: 80 });
    console.log('[api/history-import] Chunked into', chunks.length, 'parts');

    // 4. 埋め込み生成
    // Embedding機能は無効化（Geminiで直接テキスト検索を使用）
    console.log('[api/history-import] ⚠️ Embedding機能はスキップ（Geminiでキーワード検索を使用）');
    const embeddings = []; // 空配列

    // 5. メタデータとして保存（history/processed/に保存）
    const metadata = {
      id: `history-${Date.now()}`,
      title: fileName.replace('.json', ''),
      path: `history/${fileName}`,
      source: 'history-export',
      timestamp: new Date().toISOString(),
      chunks: chunks.map((chunk, i) => ({
        ...chunk,
        // embedding機能は無効化（Geminiキーワード検索で対応）
      })),
      content: textContent.substring(0, 10000),
      keywords: []
    };

    const metadataFileName = `history-${Date.now()}.json`;
    const metadataBlobPath = `history/processed/${metadataFileName}`;

    try {
      if (useAzure) {
        const blobServiceClient = getBlobServiceClient();
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlockBlobClient(metadataBlobPath);

        const jsonString = JSON.stringify(metadata, null, 2);
        await blobClient.upload(jsonString, jsonString.length);
        console.log('[api/history-import] Metadata saved to Blob:', metadataBlobPath);
      } else {
        const fs = await import('fs/promises');
        const targetDir = path.join(process.cwd(), 'knowledge-base', 'history', 'processed');
        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(path.join(targetDir, metadataFileName), JSON.stringify(metadata, null, 2));
        console.log('[api/history-import] Metadata saved locally:', metadataFileName);
      }
    } catch (saveError) {
      console.error('[api/history-import] Failed to save metadata:', saveError);
      return res.status(500).json({ success: false, error: 'Metadata save failed', details: saveError.message });
    }

    return res.status(200).json({
      success: true,
      message: '機械故障情報のインポートが完了しました',
      metadata: {
        fileName,
        chunks: chunks.length,
        embeddings: embeddings.length,
        savedTo: metadataBlobPath
      }
    });

  } catch (error) {
    console.error('[api/history-import] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

export const methods = ['post', 'options'];
