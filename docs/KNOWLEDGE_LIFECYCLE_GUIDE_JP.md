# ナレッジデータライフサイクル管理ガイド

## 概要

ナレッジデータのライフサイクルを自動管理し、ストレージコストを最適化します。

![ナレッジデータ管理UI](/C:/Users/Satoshi%20Niina/.gemini/antigravity/brain/5677d606-7709-4bda-ac16-3ba06d9bd4b6/uploaded_image_1766645384364.png)

## 機能

### 1. ストレージ統計情報

GCSから以下の情報を取得:

- **総ファイル数** - すべてのナレッジファイル数
- **総容量** - ストレージ使用量（MB/GB）
- **ファイルタイプ別統計** - JSON、PDF、テキストなど
- **フォルダ別統計** - manuals、processed、tempなど
- **古いファイル** - 30日以上経過したファイル
- **重複データ** - 同一コンテンツのファイル

### 2. 自動アーカイブ（30日経過）

**処理フロー:**
1. 30日以上経過したファイルを検出
2. ZIPアーカイブを作成
3. `emergency-assistanceapp-storage/temp/archives/` に保存
4. 元ファイルを削除

**実行方法:**

```powershell
# 手動実行
cd server
node scripts/auto-archive-knowledge.mjs

# 自動実行（推奨: 毎日午前2時）
# Windows タスクスケジューラーに登録
```

### 3. 自動削除（90日経過）

GCSのライフサイクル設定により、90日経過したファイルは自動削除されます。

**GCS側の設定確認:**

```bash
# GCSライフサイクルルールを確認
gsutil lifecycle get gs://emergency-assistanceapp-storage

# ライフサイクルルールを設定（90日→延長可能）
gsutil lifecycle set lifecycle.json gs://emergency-assistanceapp-storage
```

**lifecycle.json 例:**

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 90,
          "matchesPrefix": ["temp/"]
        }
      }
    ]
  }
}
```

### 4. 重複データ削除

同一タイトル・コンテンツのファイルを検出して削除:

```powershell
# 重複検出
GET /api/knowledge-lifecycle/duplicates

# 重複削除
POST /api/knowledge-lifecycle/remove-duplicates
```

### 5. 全データエクスポート

すべてのナレッジデータをZIPでエクスポート:

```powershell
# エクスポート実行
POST /api/knowledge-lifecycle/export

# エクスポートファイルは temp/exports/ に保存
```

## APIエンドポイント

### GET /api/knowledge-lifecycle/stats

ストレージ統計情報を取得

**レスポンス:**

```json
{
  "success": true,
  "totalFiles": 150,
  "totalSize": 52428800,
  "filesByType": {
    "json": 120,
    "pdf": 20,
    "txt": 10
  },
  "filesByFolder": {
    "manuals": 50,
    "processed": 80,
    "temp": 20
  },
  "oldFiles": [
    {
      "name": "manuals/old-manual.pdf",
      "size": 1048576,
      "age": 35,
      "updated": "2024-11-20T10:00:00Z"
    }
  ],
  "duplicates": [
    {
      "original": "processed/doc-1.json",
      "duplicate": "processed/doc-2.json",
      "title": "同じタイトル"
    }
  ]
}
```

### POST /api/knowledge-lifecycle/archive

30日経過データを自動アーカイブ

**レスポンス:**

```json
{
  "success": true,
  "message": "Archived 10 files",
  "archived": 10,
  "deleted": 10,
  "archivePath": "temp/archives/archive_2025-12-25.zip",
  "archiveSize": 5242880
}
```

### POST /api/knowledge-lifecycle/delete-old

1年以上経過データを削除

**リクエスト:**

```json
{
  "daysThreshold": 365
}
```

**レスポンス:**

```json
{
  "success": true,
  "message": "Deleted 5 files",
  "deleted": 5,
  "totalSize": 10485760
}
```

### POST /api/knowledge-lifecycle/export

全データをエクスポート

**レスポンス:**

```json
{
  "success": true,
  "message": "Export completed",
  "exportPath": "temp/exports/full_export_2025-12-25.zip",
  "exportSize": 104857600
}
```

### GET /api/knowledge-lifecycle/archives

アーカイブ一覧を取得

**レスポンス:**

```json
{
  "success": true,
  "archives": [
    {
      "name": "temp/archives/archive_2025-12-25.zip",
      "size": 5242880,
      "created": "2025-12-25T02:00:00Z",
      "updated": "2025-12-25T02:00:00Z"
    }
  ],
  "count": 1
}
```

### POST /api/knowledge-lifecycle/remove-duplicates

重複データを削除

**レスポンス:**

```json
{
  "success": true,
  "message": "Removed 3 duplicate files",
  "removed": 3
}
```

### GET /api/knowledge-lifecycle/duplicates

重複データを検出

**レスポンス:**

```json
{
  "success": true,
  "duplicates": [
    {
      "original": "processed/doc-1.json",
      "duplicate": "processed/doc-2.json",
      "title": "同じタイトル"
    }
  ],
  "count": 1
}
```

## 自動実行設定

### Windows タスクスケジューラー

1. タスクスケジューラーを開く
2. 「基本タスクの作成」を選択
3. 以下を設定:
   - **名前**: Knowledge Data Auto Archive
   - **トリガー**: 毎日午前2時
   - **操作**: プログラムの開始
   - **プログラム**: `node`
   - **引数**: `scripts/auto-archive-knowledge.mjs`
   - **開始**: `C:\path\to\Emergency-Assistance-google\server`

### Linux/Mac (cron)

```bash
# crontabを編集
crontab -e

# 毎日午前2時に実行
0 2 * * * cd /path/to/Emergency-Assistance-google/server && node scripts/auto-archive-knowledge.mjs
```

## GCSライフサイクル設定の延長

デフォルトの90日削除を延長する場合:

```bash
# lifecycle.jsonを編集
{
  "lifecycle": {
    "rule": [
      {
        "action": {
          "type": "Delete"
        },
        "condition": {
          "age": 180,
          "matchesPrefix": ["temp/"]
        }
      }
    ]
  }
}

# 設定を適用
gsutil lifecycle set lifecycle.json gs://emergency-assistanceapp-storage
```

## トラブルシューティング

### エラー: `STORAGE_MODE is not set to "gcs"`

**解決方法**: `.env.development`で`STORAGE_MODE=gcs`を設定

### エラー: `Bucket not found`

**解決方法**: GCSバケット名とプロジェクトIDを確認

### アーカイブが作成されない

**原因**: 30日以上経過したファイルがない

**確認方法**:
```powershell
GET /api/knowledge-lifecycle/stats
```

### 重複データが検出されない

**原因**: processedフォルダにJSONファイルがない

**確認方法**: ファイルインポートが正しく実行されているか確認

## 推奨設定

| 項目 | 推奨値 | 説明 |
|------|--------|------|
| アーカイブ実行 | 毎日午前2時 | システム負荷が低い時間帯 |
| アーカイブ閾値 | 30日 | GCS削除(90日)の前に保存 |
| 削除閾値 | 365日 | 1年以上のデータは削除 |
| GCSライフサイクル | 90日 | コスト最適化 |

## 次のステップ

1. ✅ ライフサイクル管理サービスの実装
2. ✅ APIエンドポイントの作成
3. ✅ 自動アーカイブスクリプトの作成
4. ⏭️ タスクスケジューラーへの登録
5. ⏭️ UIからの統計情報表示
6. ⏭️ 定期実行の確認
