# RAGナレッジ処理システム - 使用ガイド

## 概要

このシステムは、`manuals/`フォルダの元データをチャンク化し、Gemini APIで埋め込みベクトルを生成して、RAG処理済みJSONファイルとして保存します。Geminiはこれらのprocessed JSONを活用してユーザーの質問に回答します。

## 処理フロー

```
1. 元データ (manuals/*.txt, *.md)
   ↓
2. チャンク化 (1000文字、200文字オーバーラップ)
   ↓
3. 埋め込みベクトル生成 (Gemini embedding-001)
   ↓
4. RAG JSON保存 (processed/*_rag.json)
   ↓
5. GCSアップロード (オプション)
   ↓
6. Geminiがクエリ時に活用
```

## セットアップ

### 1. 環境変数の設定

`.env.development`に以下を追加:

```bash
# Gemini API
GOOGLE_GEMINI_API_KEY=your-api-key

# ストレージモード
STORAGE_MODE=local  # または gcs

# GCS設定（STORAGE_MODE=gcsの場合）
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name
GOOGLE_CLOUD_PROJECT_ID=your-project-id
```

### 2. ナレッジデータの配置

元データを`knowledge-base/manuals/`フォルダに配置します:

```
knowledge-base/
└── manuals/
    ├── manual1.txt
    ├── manual2.md
    └── troubleshooting-guide.txt
```

## 使用方法

### ステップ1: ナレッジベースの処理

元データをチャンク化してRAG JSONを生成:

```powershell
cd server
node scripts/process-knowledge-base.mjs
```

**出力:**

```
╔═══════════════════════════════════════════════════════╗
║  Knowledge Base RAG Processing Tool                  ║
║  マニュアルデータをチャンク化＋RAG処理               ║
╚═══════════════════════════════════════════════════════╝

✅ Gemini API initialized

📁 Fetching files from local storage...

📊 Found 3 files to process

📄 Processing: manual1.txt
  📊 File size: 5432 characters
  ✂️  Created 6 chunks
  🔄 Processing chunk 1/6... ✅
  🔄 Processing chunk 2/6... ✅
  ...
  💾 Saved: manual1_rag.json

╔═══════════════════════════════════════════════════════╗
║  Processing Summary                                   ║
╚═══════════════════════════════════════════════════════╝
  ✅ Processed: 3 files
  ❌ Failed: 0 files
  📦 Total chunks: 18

  💾 Output directory: knowledge-base/processed
```

### ステップ2: RAGクエリの実行

#### 方法1: APIエンドポイント経由

```javascript
// クライアント側
const response = await fetch('/api/rag/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'システムのトラブルシューティング方法を教えてください',
    topK: 5,
    similarityThreshold: 0.5,
    includeContext: true
  })
});

const result = await response.json();
console.log('回答:', result.answer);
console.log('参考資料:', result.sources);
```

#### 方法2: サービスクラス直接使用

```javascript
import { ragService } from './services/rag-service.mjs';

const result = await ragService.query(
  'システムのトラブルシューティング方法を教えてください',
  {
    topK: 5,
    similarityThreshold: 0.5,
    includeContext: true
  }
);

console.log('回答:', result.answer);
console.log('参考資料:', result.sources);
console.log('関連チャンク:', result.chunks);
```

## RAG JSONファイルの構造

処理済みJSONファイル (`*_rag.json`) の構造:

```json
{
  "source": "manual1.txt",
  "originalPath": "/path/to/manual1.txt",
  "totalChunks": 6,
  "totalCharacters": 5432,
  "processedAt": "2025-12-25T06:00:00.000Z",
  "chunks": [
    {
      "id": "manual1.txt_chunk_0",
      "text": "チャンクのテキスト内容...",
      "startIndex": 0,
      "endIndex": 1000,
      "embedding": [0.123, -0.456, 0.789, ...],
      "metadata": {
        "source": "manual1.txt",
        "chunkIndex": 0,
        "totalChunks": 6,
        "processedAt": "2025-12-25T06:00:00.000Z"
      }
    },
    ...
  ],
  "metadata": {
    "chunkSize": 1000,
    "chunkOverlap": 200,
    "embeddingModel": "embedding-001"
  }
}
```

## APIエンドポイント

### POST /api/rag/query

RAGクエリを実行してGeminiから回答を取得

**リクエスト:**

```json
{
  "question": "質問内容",
  "topK": 5,
  "similarityThreshold": 0.5,
  "includeContext": true
}
```

**レスポンス:**

```json
{
  "success": true,
  "question": "質問内容",
  "answer": "Geminiからの回答",
  "sources": ["manual1.txt", "manual2.md"],
  "chunks": [
    {
      "text": "関連するチャンクのテキスト",
      "source": "manual1.txt",
      "similarity": 0.85
    }
  ],
  "metadata": {
    "queryEmbeddingGenerated": true,
    "chunksFound": 5,
    "topSimilarity": 0.85
  },
  "timestamp": "2025-12-25T06:00:00.000Z"
}
```

### GET /api/rag/stats

RAGデータの統計情報を取得

**レスポンス:**

```json
{
  "success": true,
  "totalFiles": 3,
  "totalChunks": 18,
  "totalCharacters": 15432,
  "sources": [
    {
      "name": "manual1.txt",
      "chunks": 6,
      "characters": 5432,
      "processedAt": "2025-12-25T06:00:00.000Z"
    }
  ],
  "storageMode": "local",
  "timestamp": "2025-12-25T06:00:00.000Z"
}
```

### POST /api/rag/search

関連チャンクのみを検索（Geminiクエリなし）

**リクエスト:**

```json
{
  "query": "検索キーワード",
  "topK": 5,
  "similarityThreshold": 0.5
}
```

**レスポンス:**

```json
{
  "success": true,
  "query": "検索キーワード",
  "chunks": [
    {
      "text": "関連するチャンクのテキスト",
      "source": "manual1.txt",
      "similarity": 0.85,
      "metadata": { ... }
    }
  ],
  "count": 5,
  "timestamp": "2025-12-25T06:00:00.000Z"
}
```

## フォルダ構造

```
knowledge-base/
├── manuals/              # 元データ（.txt, .md）
│   ├── manual1.txt
│   ├── manual2.md
│   └── troubleshooting.txt
│
├── processed/            # RAG処理済みJSON
│   ├── manual1_rag.json
│   ├── manual2_rag.json
│   └── troubleshooting_rag.json
│
├── temp/                 # 一時ファイル
└── chat-exports/         # チャットエクスポート
```

## GCS使用時の構造

`STORAGE_MODE=gcs`の場合:

```
gs://your-bucket/
├── manuals/              # 元データ
│   ├── manual1.txt
│   └── manual2.md
│
└── processed/            # RAG処理済みJSON
    ├── manual1_rag.json
    └── manual2_rag.json
```

## トラブルシューティング

### エラー: `GOOGLE_GEMINI_API_KEY is not set`

**解決方法**: `.env.development`にGemini APIキーを設定してください。

### エラー: `No files found to process`

**解決方法**: `knowledge-base/manuals/`フォルダに`.txt`または`.md`ファイルを配置してください。

### エラー: `Embedding generation failed`

**原因**: Gemini API制限またはネットワークエラー

**解決方法**: 
- APIキーを確認
- ネットワーク接続を確認
- API使用量を確認

### 関連情報が見つからない

**原因**: 類似度閾値が高すぎる、またはナレッジベースに関連情報がない

**解決方法**:
- `similarityThreshold`を下げる（例: 0.3）
- `topK`を増やす（例: 10）
- ナレッジベースに関連データを追加

## パフォーマンス最適化

### チャンクサイズの調整

```javascript
// server/scripts/process-knowledge-base.mjs
const CHUNK_SIZE = 1000;      // 小さくすると精度向上、大きくすると処理速度向上
const CHUNK_OVERLAP = 200;    // 大きくすると文脈保持、小さくすると重複削減
```

### キャッシュの活用

RAGServiceはRAGデータをメモリにキャッシュします。サーバー再起動時に再読み込みされます。

### バッチ処理

大量のファイルを処理する場合は、バッチサイズを調整:

```javascript
// 一度に処理するファイル数を制限
const batchSize = 10;
for (let i = 0; i < files.length; i += batchSize) {
  const batch = files.slice(i, i + batchSize);
  await processBatch(batch);
}
```

## 次のステップ

1. ✅ ナレッジデータを`manuals/`に配置
2. ✅ `process-knowledge-base.mjs`を実行
3. ✅ RAG JSONが`processed/`に生成されることを確認
4. ⏭️ APIエンドポイントをテスト
5. ⏭️ フロントエンドに統合
