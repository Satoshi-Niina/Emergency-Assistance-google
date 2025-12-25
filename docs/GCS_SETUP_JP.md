# GCS設定とGemini統合ガイド

## 概要

このドキュメントでは、Google Cloud Storage (GCS) とGemini APIの設定方法、およびknowledge-baseデータのエクスポート手順を説明します。

## 前提条件

- Google Cloud Platformアカウント
- Google Cloud プロジェクトの作成済み
- GCSバケットの作成済み
- Gemini APIキーの取得済み

## 1. 環境変数の設定

### 1.1 `.env.development` ファイルの作成

プロジェクトのルートディレクトリに `.env.development` ファイルを作成し、以下の環境変数を設定します:

```bash
# Google Cloud Storage設定
GOOGLE_CLOUD_STORAGE_BUCKET=your-bucket-name
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Gemini API設定
GOOGLE_GEMINI_API_KEY=your-gemini-api-key

# サービスアカウントキー（オプション）
# GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account-key.json

# ストレージモード
STORAGE_MODE=gcs
```

### 1.2 環境変数の説明

| 環境変数 | 説明 | 必須 |
|---------|------|------|
| `GOOGLE_CLOUD_STORAGE_BUCKET` | GCSバケット名 | ✅ 必須 |
| `GOOGLE_CLOUD_PROJECT_ID` | Google CloudプロジェクトID | ✅ 必須 |
| `GOOGLE_GEMINI_API_KEY` | Gemini APIキー | ✅ 必須 |
| `GOOGLE_APPLICATION_CREDENTIALS` | サービスアカウントキーのパス | ⚠️ オプション |
| `STORAGE_MODE` | ストレージモード (`local` または `gcs`) | ✅ 必須 |

## 2. GCS認証の設定

### 方法1: Application Default Credentials（推奨）

```powershell
# Google Cloud SDKをインストール後、以下を実行
gcloud auth application-default login
```

### 方法2: サービスアカウントキー

1. Google Cloud Consoleでサービスアカウントを作成
2. JSONキーファイルをダウンロード
3. `.env.development` に以下を追加:

```bash
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your-service-account-key.json
```

## 3. GCS接続テスト

### 3.1 簡易テストの実行

以下のコマンドでGCS接続をテストします:

```powershell
cd server
node scripts/export-to-gcs.mjs
```

### 3.2 期待される出力

```
╔═══════════════════════════════════════════════════════╗
║  Knowledge Base → GCS Export Tool                    ║
║  ローカルデータをGoogle Cloud Storageにエクスポート  ║
╚═══════════════════════════════════════════════════════╝

🔧 Initializing Google Cloud Storage client...
  📦 Bucket: your-bucket-name
  🆔 Project ID: your-project-id
  🔑 Using Application Default Credentials
  ✅ GCS client initialized
```

## 4. データエクスポート

### 4.1 エクスポート対象フォルダ

以下のフォルダがGCSにエクスポートされます:

- `knowledge-base/manuals/` - マニュアルファイル
- `knowledge-base/temp/` - 一時ファイル
- `knowledge-base/chat-exports/` - チャットエクスポート
- `knowledge-base/troubleshooting/` - トラブルシューティングフロー
- `knowledge-base/ai-context/` - AIコンテキスト
- `knowledge-base/chat-history/` - チャット履歴

### 4.2 エクスポートの実行

```powershell
cd server
node scripts/export-to-gcs.mjs
```

### 4.3 エクスポート結果の確認

Google Cloud Consoleでバケットの内容を確認:

```
https://console.cloud.google.com/storage/browser/your-bucket-name
```

## 5. Gemini API設定

### 5.1 APIキーの取得

1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. 「Create API Key」をクリック
3. APIキーをコピー
4. `.env.development` に追加:

```bash
GOOGLE_GEMINI_API_KEY=your-api-key-here
```

### 5.2 Gemini APIテスト

Gemini APIの接続をテストするには、以下のスクリプトを実行します（作成予定）:

```powershell
cd server
node scripts/test-gemini-rag.mjs
```

## 6. RAGシステムの設定

### 6.1 RAG設定ファイル

RAG設定は以下のファイルで管理されます:

- `server/config/rag.config.json` - RAGパイプライン設定
- `data/rag-settings.json` - RAG動作設定

### 6.2 GCSをナレッジソースとして使用

`STORAGE_MODE=gcs` に設定することで、自動的にGCSがナレッジソースとして使用されます。

## 7. トラブルシューティング

### エラー: `GOOGLE_CLOUD_STORAGE_BUCKET is not set`

**原因**: 環境変数が設定されていない

**解決方法**:
1. `.env.development` ファイルを作成
2. 必要な環境変数を設定
3. サーバーを再起動

### エラー: `Bucket does not exist`

**原因**: 指定したバケットが存在しない

**解決方法**:
1. Google Cloud Consoleでバケットを作成
2. バケット名を確認して `.env.development` を更新

### エラー: `Authentication failed`

**原因**: GCS認証が正しく設定されていない

**解決方法**:
1. `gcloud auth application-default login` を実行
2. またはサービスアカウントキーのパスを確認

### エラー: `Permission denied`

**原因**: サービスアカウントに必要な権限がない

**解決方法**:
1. Google Cloud Consoleでサービスアカウントの権限を確認
2. 「Storage Object Admin」ロールを付与

## 8. 次のステップ

1. ✅ 環境変数の設定
2. ✅ GCS接続テスト
3. ✅ データエクスポート
4. ⏭️ Gemini APIテスト
5. ⏭️ RAGシステムの調整
6. ⏭️ アプリケーションの動作確認

## 9. 参考リンク

- [Google Cloud Storage ドキュメント](https://cloud.google.com/storage/docs)
- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [サービスアカウントの作成](https://cloud.google.com/iam/docs/service-accounts-create)

## 10. サポート

問題が発生した場合は、以下の情報を確認してください:

1. 環境変数が正しく設定されているか
2. GCS認証が正しく設定されているか
3. バケットが存在し、アクセス可能か
4. サービスアカウントに必要な権限があるか
