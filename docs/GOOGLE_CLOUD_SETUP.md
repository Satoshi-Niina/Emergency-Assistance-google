# Google Cloud デプロイメント設定ガイド

## 概要
このプロジェクトをGoogle Cloudにデプロイするための設定方法を説明します。

## 1. Google Cloud プロジェクトの準備

### 必要なサービスの有効化
```bash
# Cloud Run API
gcloud services enable run.googleapis.com

# Cloud Storage API
gcloud services enable storage-api.googleapis.com

# Cloud SQL API (PostgreSQL使用時)
gcloud services enable sqladmin.googleapis.com

# Artifact Registry API (Dockerイメージ保存用)
gcloud services enable artifactregistry.googleapis.com
```

## 2. GitHub Secrets の設定

以下のシークレットをGitHubリポジトリに設定してください：

### 必須シークレット
| シークレット名 | 説明 | 例 |
|---------------|------|-----|
| `GCP_PROJECT_ID` | Google CloudプロジェクトID | `my-project-12345` |
| `GCP_SERVICE_ACCOUNT_KEY` | サービスアカウントのJSONキー | `{"type": "service_account"...}` |
| `GCS_BUCKET_NAME` | ナレッジベース用バケット名 | `emergency-assistance-knowledge` |
| `GCS_STATIC_BUCKET_NAME` | 静的ファイルホスティング用バケット名 | `emergency-assistance-static` |
| `DATABASE_URL` | PostgreSQL接続文字列 | `postgres://user:pass@host/db` |
| `SESSION_SECRET` | セッション暗号化キー (32文字以上) | `your-session-secret-32-chars` |
| `JWT_SECRET` | JWT暗号化キー (32文字以上) | `your-jwt-secret-32-chars` |
| `GEMINI_API_KEY` | Gemini APIキー | `AIzaSy...` |
| `VITE_API_BASE_URL` | フロントエンド用APIのURL | `https://your-service.run.app` |
| `VITE_BACKEND_SERVICE_URL` | バックエンドサービスURL | `https://your-service.run.app` |
| `VITE_SERVER_URL` | サーバーURL | `https://your-service.run.app` |
| `FRONTEND_URL` | フロントエンドURL | `https://storage.googleapis.com/...` |

### サービスアカウントの作成方法
```bash
# サービスアカウント作成
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deployer"

# 必要な権限を付与
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:github-actions@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# JSONキーを作成
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@PROJECT_ID.iam.gserviceaccount.com

# key.jsonの内容をGCP_SERVICE_ACCOUNT_KEYシークレットに設定
```

## 3. Cloud Storage バケットの作成

```bash
# ナレッジベース用バケット
gsutil mb -l asia-northeast1 gs://emergency-assistance-knowledge

# 静的ファイルホスティング用バケット
gsutil mb -l asia-northeast1 gs://emergency-assistance-static

# 静的バケットを公開設定
gsutil iam ch allUsers:objectViewer gs://emergency-assistance-static

# CORSとキャッシュ設定
gsutil cors set cors-config.json gs://emergency-assistance-static
```

### cors-config.json の例
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

## 4. Cloud SQL (PostgreSQL) の設定

```bash
# Cloud SQLインスタンス作成
gcloud sql instances create emergency-assistance-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=asia-northeast1

# データベース作成
gcloud sql databases create emergency_assistance \
  --instance=emergency-assistance-db

# ユーザー作成
gcloud sql users create dbuser \
  --instance=emergency-assistance-db \
  --password=YOUR_PASSWORD

# 接続文字列を取得してDATABASE_URLシークレットに設定
```

## 5. ローカル開発環境のセットアップ

### 環境変数ファイルの作成
```bash
# クライアント側
cp client/.env.template client/.env.development
# client/.env.development を編集して実際の値を設定

# サーバー側
cp server/.env.template server/.env.development
# server/.env.development を編集して実際の値を設定
```

### 開発サーバーの起動
```bash
# サーバー起動
cd server
npm install
npm run dev

# クライアント起動（別ターミナル）
cd client
npm install
npm run dev
```

## 6. デプロイ

### 自動デプロイ
`main`ブランチにプッシュすると自動的にデプロイされます：
```bash
git add .
git commit -m "Deploy to Google Cloud"
git push origin main
```

### 手動デプロイ
GitHubのActionsタブから「Deploy to Google Cloud Run」ワークフローを手動実行できます。

## 7. デプロイ後の確認

```bash
# Cloud Runサービスの確認
gcloud run services list

# サービスURLを取得
gcloud run services describe emergency-assistance-server \
  --region asia-northeast1 \
  --format 'value(status.url)'

# ログの確認
gcloud run services logs read emergency-assistance-server \
  --region asia-northeast1
```

## トラブルシューティング

### デプロイが失敗する場合
1. GitHub Secretsが正しく設定されているか確認
2. サービスアカウントに必要な権限があるか確認
3. Cloud Run APIが有効化されているか確認

### ビルドエラーが発生する場合
1. `node_modules`を削除して再インストール
2. Node.jsのバージョンを確認（20推奨）
3. 環境変数が正しく設定されているか確認

### データベース接続エラー
1. Cloud SQLインスタンスが起動しているか確認
2. DATABASE_URLが正しいか確認
3. Cloud SQL Proxyの設定を確認

## セキュリティチェックリスト

- [ ] `.env.development`がGitにコミットされていない
- [ ] サービスアカウントキーがGitにコミットされていない
- [ ] GitHub Secretsに本番環境の認証情報が設定されている
- [ ] Cloud Storageバケットの権限が適切に設定されている
- [ ] SESSION_SECRETとJWT_SECRETが32文字以上のランダムな文字列
- [ ] 本番環境のDEBUG_MODEがfalseに設定されている

## 参考リンク

- [Google Cloud Run ドキュメント](https://cloud.google.com/run/docs)
- [Cloud Storage ドキュメント](https://cloud.google.com/storage/docs)
- [Cloud SQL ドキュメント](https://cloud.google.com/sql/docs)
- [GitHub Actions with Google Cloud](https://github.com/google-github-actions)
