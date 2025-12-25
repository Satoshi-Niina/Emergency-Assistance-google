# Gemini RAG統合 - GCSデータ活用ガイド

## 現在の状況

GCSバケット `emergency-assistanceapp-storage` に以下のフォルダが既に存在しています:

![GCSフォルダ構造](file:///C:/Users/Satoshi%20Niina/.gemini/antigravity/brain/5677d606-7709-4bda-ac16-3ba06d9bd4b6/uploaded_image_1766642588230.png)

- ✅ `chat-exports/`
- ✅ `manuals/`
- ✅ `temp/`
- ✅ `troubleshooting/`

## RAGシステムでGCSデータを活用する方法

### 1. ストレージモードの設定

アプリケーションがGCSを使用するように設定します:

```bash
# .env.development または .env
STORAGE_MODE=gcs
GOOGLE_CLOUD_STORAGE_BUCKET=emergency-assistanceapp-storage
GOOGLE_CLOUD_PROJECT_ID=emergency-assistanceapp
```

### 2. RAG設定の確認

#### `server/config/rag.config.json`

RAGパイプラインの設定を確認・調整します:

```json
{
  "knowledgeBase": {
    "source": "gcs",
    "bucket": "emergency-assistanceapp-storage",
    "folders": [
      "manuals",
      "troubleshooting",
      "chat-exports"
    ]
  },
  "embedding": {
    "model": "text-embedding-004",
    "dimensions": 768
  },
  "retrieval": {
    "topK": 5,
    "similarityThreshold": 0.7
  }
}
```

#### `data/rag-settings.json`

RAG動作設定を確認します:

```json
{
  "enabled": true,
  "useGCS": true,
  "chunkSize": 1000,
  "chunkOverlap": 200,
  "maxContextLength": 4000
}
```

### 3. Gemini APIとの統合

#### 基本的な使用例

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { downloadFromGCS } from './lib/google-cloud-storage.mjs';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// GCSからマニュアルデータを取得
const manualData = await downloadFromGCS('manuals/manual.json');
const context = JSON.parse(manualData.toString('utf-8'));

// Geminiにクエリを送信
const prompt = `
以下のマニュアルデータを参考に、ユーザーの質問に答えてください:

マニュアル: ${JSON.stringify(context)}

質問: ${userQuestion}
`;

const result = await model.generateContent(prompt);
const response = result.response.text();
```

### 4. RAGパイプラインの実装

#### ステップ1: GCSからデータ取得

```javascript
import { listFilesInGCS, downloadFromGCS } from './lib/google-cloud-storage.mjs';

// 特定フォルダのファイル一覧を取得
const files = await listFilesInGCS('manuals/');

// 各ファイルをダウンロード
const documents = [];
for (const file of files) {
  const content = await downloadFromGCS(file.name);
  documents.push({
    name: file.name,
    content: content.toString('utf-8'),
    metadata: {
      size: file.size,
      updated: file.updated
    }
  });
}
```

#### ステップ2: ドキュメントのチャンク化

```javascript
function chunkDocument(text, chunkSize = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start += chunkSize - overlap;
  }
  
  return chunks;
}
```

#### ステップ3: Geminiで埋め込みベクトル生成

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: 'embedding-001' });

async function generateEmbedding(text) {
  const result = await embeddingModel.embedContent(text);
  return result.embedding;
}
```

#### ステップ4: 類似度検索

```javascript
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

async function findRelevantChunks(query, chunks, topK = 5) {
  const queryEmbedding = await generateEmbedding(query);
  
  const similarities = await Promise.all(
    chunks.map(async (chunk) => ({
      chunk,
      similarity: cosineSimilarity(
        queryEmbedding,
        await generateEmbedding(chunk.text)
      )
    }))
  );
  
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(item => item.chunk);
}
```

#### ステップ5: RAGクエリの実行

```javascript
async function ragQuery(userQuestion) {
  // 1. GCSからドキュメント取得
  const files = await listFilesInGCS('manuals/');
  const documents = await Promise.all(
    files.map(f => downloadFromGCS(f.name))
  );
  
  // 2. チャンク化
  const chunks = documents.flatMap(doc => 
    chunkDocument(doc.toString('utf-8'))
  );
  
  // 3. 関連チャンクを検索
  const relevantChunks = await findRelevantChunks(userQuestion, chunks);
  
  // 4. コンテキストを作成
  const context = relevantChunks.join('\n\n');
  
  // 5. Geminiにクエリ
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  const prompt = `
以下の情報を参考に、質問に答えてください:

【参考情報】
${context}

【質問】
${userQuestion}

【回答】
`;
  
  const result = await model.generateContent(prompt);
  return result.response.text();
}
```

### 5. 実装例: サービスクラス

```javascript
// server/services/gemini-rag-service.mjs
import { GoogleGenerativeAI } from '@google/generative-ai';
import { listFilesInGCS, downloadFromGCS } from '../lib/google-cloud-storage.mjs';

export class GeminiRAGService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    this.bucket = process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
  }
  
  async query(question, folders = ['manuals', 'troubleshooting']) {
    // GCSから関連ドキュメントを取得
    const documents = await this.fetchDocuments(folders);
    
    // コンテキストを構築
    const context = this.buildContext(documents);
    
    // Geminiにクエリ
    const response = await this.askGemini(question, context);
    
    return response;
  }
  
  async fetchDocuments(folders) {
    const allDocs = [];
    
    for (const folder of folders) {
      const files = await listFilesInGCS(`${folder}/`);
      
      for (const file of files.slice(0, 10)) { // 最初の10ファイル
        try {
          const content = await downloadFromGCS(file.name);
          allDocs.push({
            source: file.name,
            content: content.toString('utf-8')
          });
        } catch (error) {
          console.error(`Failed to fetch ${file.name}:`, error);
        }
      }
    }
    
    return allDocs;
  }
  
  buildContext(documents) {
    return documents
      .map(doc => `[${doc.source}]\n${doc.content}`)
      .join('\n\n---\n\n')
      .substring(0, 10000); // 最大10,000文字
  }
  
  async askGemini(question, context) {
    const prompt = `
あなたは技術サポートアシスタントです。以下の参考情報を使用して、ユーザーの質問に日本語で答えてください。

【参考情報】
${context}

【質問】
${question}

【回答】
`;
    
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}
```

### 6. 使用例

```javascript
import { GeminiRAGService } from './services/gemini-rag-service.mjs';

const ragService = new GeminiRAGService();

// 質問を送信
const answer = await ragService.query(
  'システムのトラブルシューティング方法を教えてください'
);

console.log('回答:', answer);
```

### 7. APIエンドポイントの実装

```javascript
// server/src/routes/rag.mjs
import express from 'express';
import { GeminiRAGService } from '../services/gemini-rag-service.mjs';

const router = express.Router();
const ragService = new GeminiRAGService();

router.post('/query', async (req, res) => {
  try {
    const { question, folders } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    const answer = await ragService.query(question, folders);
    
    res.json({
      question,
      answer,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

## 次のステップ

1. **環境変数の確認** - Gemini APIキーが設定されているか確認
2. **RAGサービスの実装** - 上記のコード例を参考に実装
3. **テストの実行** - 簡単なクエリでテスト
4. **パフォーマンス調整** - チャンクサイズや取得件数を調整

## トラブルシューティング

### Gemini APIエラー

```
Error: API key not valid
```

**解決方法**: `GOOGLE_GEMINI_API_KEY` を正しく設定してください。

### GCS接続エラー

```
Error: Bucket not found
```

**解決方法**: `STORAGE_MODE=gcs` と `GOOGLE_CLOUD_STORAGE_BUCKET` を確認してください。

## 参考リンク

- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [RAG (Retrieval-Augmented Generation) 概要](https://ai.google.dev/docs/rag_overview)
