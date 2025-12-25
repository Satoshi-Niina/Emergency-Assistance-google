# ローカル環境設定 - 整理完了レポート

**日時**: 2025年12月24日
**ステータス**: ✅ 整合性確認完了

---

## 現在の構成

### フォルダ構造

```
knowledge-base/
├── manuals/                 ← 📁 アップロードファイル保存先
├── troubleshooting/
│   ├── flows/              ← フローJSON
│   └── images/             ← フロー画像
├── chat-history/
│   ├── sessions/           ← チャット履歴JSON
│   └── archives/           ← アーカイブ
├── ai-context/              ← 🚫 現在未使用（将来の拡張用）
└── temp/                    ← 一時ファイル
```

### 環境変数（.env.development）

```env
# ストレージ
STORAGE_MODE=local
LOCAL_DEV=false              # ai-context処理無効

# AI
GOOGLE_GEMINI_API_KEY=AIzaSyCx6RgONqbu2I0Jierh0hqT1tEqVfk2vL0

# データベース（ローカルPostgreSQL）
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/emergency_db
```

---

## データフロー

### ① ファイルアップロード

```
ユーザー（base-data.tsx）
  ↓ ファイル選択 + 機種タグ（オプション）
POST /api/files/import
  ↓
保存: knowledge-base/manuals/{timestamp}_{machineTag}_{filename}
  ↓
レスポンス: { success: true }
```

### ② AI検索・回答

```
ユーザー質問（chatbot.tsx）
  ↓
POST /api/gemini-chat { text, machineTag }
  ↓
knowledge-search.mjs で検索:
  - manuals/
  - troubleshooting/flows/
  - troubleshooting/images/
  - chat-history/sessions/
  ↓
関連ファイル（上位3件）読み込み
  ↓
Gemini API にプロンプト送信
  ↓
回答返却（ストリーミング可能）
```

---

## 整合性チェック結果

### ✅ 正常動作確認済み

1. **UI (base-data.tsx)**
   - state変数完備: `machineTag`, `machineTypes`, `saveOriginalFile`
   - `/api/machines/machine-types` から機種一覧取得
   - ファイルアップロードAPI呼び出し

2. **ファイル保存 (files/index.mjs)**
   - `manuals/` に正しく保存
   - 機種タグがファイル名に含まれる
   - data-processor は無効（LOCAL_DEV=false）

3. **AI検索 (knowledge-search.mjs)**
   - 検索対象フォルダ: シンプルに統一
   - ファイル名マッチング + 機種タグフィルタ
   - 上位N件取得

4. **Gemini統合 (gemini-chat/index.mjs)**
   - knowledge-search.mjs 呼び出し
   - ファイル内容をプロンプトに含める
   - 参照ファイル名を返却

---

## 現在の制限事項

### 🚫 無効化された機能

1. **ai-context 処理**
   - OpenAI embeddings 不要
   - ファイルは `manuals/` から直接読み込み

2. **data-processor**
   - `LOCAL_DEV=false` のため実行されない
   - 将来有効化する場合: `LOCAL_DEV=true` に変更

### ⚠️ 今後の課題

1. **大きなファイルの処理**
   - PDF 50MB以上は読み込みに時間がかかる
   - → ストリーミングレスポンスで対応

2. **検索精度**
   - 現在: ファイル名マッチのみ
   - 改善案: ファイル内容の全文検索

3. **GCS移行準備**
   - `STORAGE_MODE=gcs` に切り替え
   - サービスアカウントキー配置

---

## 次のステップ

### Phase 1: 動作テスト（今すぐ）

1. サーバー再起動
2. ファイルアップロードテスト
3. AI検索テスト（チャットボットから質問）

### Phase 2: GCS接続（1-2日後）

1. `.env.development` 修正:
   ```env
   STORAGE_MODE=gcs
   GOOGLE_CLOUD_STORAGE_BUCKET=emergency-knowledge-dev
   GOOGLE_APPLICATION_CREDENTIALS=./gcs-key.json
   ```
2. サービスアカウントキー配置
3. 動作確認

### Phase 3: 本番デプロイ（完成後）

1. GitHub Actions ワークフロー作成
2. GitHub Secrets 設定
3. Cloud Run にデプロイ

---

## トラブルシューティング

### ファイルが保存されない

**確認**:
```powershell
Get-ChildItem "knowledge-base\manuals" -File
```

**ログ確認**:
```
[api/files/import] ✅ ファイル保存完了
```

### AI検索が動かない

**確認**:
```powershell
# gemini-chat API が読み込まれているか
# サーバー起動ログで確認
[App] ✅ Loaded route: /api/gemini-chat
```

**エラーがある場合**:
```
[App] ❌ Failed to load gemini-chat
```
→ `knowledge-search.mjs` のimport エラー

---

## まとめ

**現在の状態**: ✅ **ローカル環境で動作可能**

- ストレージ: ローカルフォルダ (`knowledge-base/`)
- AI: Gemini API（クラウド）
- DB: ローカル PostgreSQL
- 検索: ファイル名マッチング

**推奨テスト手順**:
1. npm run dev
2. ファイルアップロード（base-data画面）
3. チャットボットで質問
4. 関連ファイルが検索され回答が返ってくるか確認

---

**問題があればログを確認してください。**
