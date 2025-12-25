# 基礎データ管理 - フォルダ構造とファイル保存

## フォルダ構造（最新版）

```
knowledge-base/
├── manuals/                 ← 📁 アップロードされた元ファイル（PDF/XLSX等）
│   └── .gitkeep
├── ai-context/              ← 🤖 AI検索用処理済みデータ（チャンク化テキスト）
│   ├── manuals/            ← マニュアルから抽出したチャンク
│   ├── faqs/               ← FAQ・ガイドライン
│   └── .gitkeep
├── troubleshooting/         ← 🚨 応急処置・緊急対応フロー
│   ├── flows/              ← フローJSON
│   └── images/             ← フロー用画像
├── chat-history/            ← 💬 チャット履歴
│   ├── sessions/           ← セッションJSON
│   └── archives/           ← アーカイブ
├── images/
│   ├── chat-exports/       ← チャット画像
│   └── troubleshooting/    ← フロー画像
└── temp/                    ← 🗑️ 一時ファイル
```

## データフロー（環境別）

### ローカル開発環境（LOCAL_DEV=true）

```
【アップロード時】
1. PDFアップロード
2. 「元のファイルも保存する」を選択した場合のみ → manuals/ に保存
3. テキスト抽出 → チャンク化（1000文字/チャンク）
4. 処理済みデータを ai-context/manuals/ に保存

【検索時】
1. ユーザー質問
2. ai-context/ から関連チャンク検索（キーワード + 機種タグ）
3. 上位3-5チャンクをGeminiに渡す
4. 回答生成（高速）

【検索対象フォルダ】
✅ ai-context/manuals/     ← 事前処理済みデータ（メイン）
✅ ai-context/faqs/        ← FAQ・ガイドライン
✅ troubleshooting/flows/  ← フローJSON
✅ troubleshooting/images/ ← フロー画像
✅ chat-history/sessions/  ← チャット履歴JSON

【画像参照（検索対象外）】
📷 images/chat-exports/    ← チャット画像（JSONから参照）
📷 images/troubleshooting/ ← フロー画像（JSONから参照）

【重要】
- 元ファイル（PDF/XLSX）はオプション（デフォルト: 保存する）
- 検索には ai-context/ のみ使用（元ファイル不要）
- 元ファイル削除後も検索は正常動作
```

### 本番環境（Azure）

```
【アップロード時】
1. PDFアップロード → manuals/ に保存
2. （事前処理なし - シンプル構成）

【検索時】
1. ユーザー質問
2. 検索対象フォルダから直接ファイル検索（ファイル名マッチ）
3. 関連ファイルの内容をGeminiに渡す
4. ストリーミングで回答生成

【検索対象フォルダ】
✅ manuals/                ← 元ファイル（PDF/XLSX等）
✅ troubleshooting/flows/  ← フローJSON
✅ troubleshooting/images/ ← フロー画像
✅ chat-history/sessions/  ← チャット履歴JSON

【画像参照（検索対象外）】
📷 images/chat-exports/    ← チャット画像（JSONから参照）
📷 images/troubleshooting/ ← フロー画像（JSONから参照）

【重要】
- 元ファイル（PDF/XLSX）は必須保存
- ai-context/ は使用しない（シンプル構成）
- ファイル読み込みは非同期処理（レスポンス遅延なし）
```

### メリット・デメリット

| 項目 | ローカル開発 | 本番環境 |
|------|------------|---------|
| 速度 | ⚡ 高速（< 1秒） | 🐢 やや遅い（3-5秒） |
| トークン消費 | ✅ 少ない | ⚠️ 多い |
| 実装複雑度 | ⚠️ 複雑 | ✅ シンプル |
| メンテナンス | ⚠️ 要再処理 | ✅ 不要 |
| コスト | ✅ 低い | ⚠️ やや高い |

**推奨**: 本番でも大量の質問が予想される場合は、ai-context処理を有効化してください。
```

## ファイル保存フロー

### 1. ファイルインポート (`/api/files/import`)
- **保存先**: `knowledge-base/manuals/タイムスタンプ_ファイル名`
- **条件**: `saveOriginalFile=true`の場合のみ保存
- **形式**: 元のファイル形式のまま (PDF, PPTX, XLSX, etc.)

### 2. データ処理 (`/api/data-processor/process`)
- **処理内容**:
  1. テキスト抽出 (PDF parsing, etc.)
  2. テキストチャンキング (800文字, 80文字オーバーラップ)
  3. エンベディング生成 (OpenAI Embeddings)
  4. メタデータ保存

- **保存先**: `knowledge-base/manuals/processed/doc-タイムスタンプ.json`
- **内容**: チャンク化されたテキスト + エンベディング

### 3. 保存確認

```powershell
# manualsフォルダの内容確認
Get-ChildItem "knowledge-base/manuals" -Recurse

# 最新のアップロードファイル確認
Get-ChildItem "knowledge-base/manuals" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# 処理済みメタデータ確認
Get-ChildItem "knowledge-base/manuals/processed" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

## トラブルシューティング

### 問題: ファイルがアップロードされない

**原因**:
- フォルダが存在しない
- 書き込み権限がない
- ファイルサイズが制限を超えている (100MB)

**対策**:
```powershell
# フォルダを作成
New-Item -ItemType Directory -Path "knowledge-base/manuals" -Force
New-Item -ItemType Directory -Path "knowledge-base/manuals/processed" -Force

# 権限確認
Get-Acl "knowledge-base/manuals" | Format-List
```

### 問題: 完了メッセージが表示されるがファイルが見つからない

**原因**:
- `saveOriginalFile=false`に設定されている
- 処理がバックグラウンドで実行中
- Azure Blob Storageに保存されている (LOCAL_DEV環境でない場合)

**確認方法**:
1. ブラウザの開発者ツールでネットワークタブを確認
2. サーバーログで`[api/files/import]`を検索
3. `knowledge-base/manuals/processed/`に処理済みファイルが生成されているか確認

### 問題: .gitkeepだけが表示される

**原因**:
- 実際にはファイルがアップロードされていない
- UIの表示バグ
- フォルダが空

**対策**:
```powershell
# 実際のファイル数を確認
(Get-ChildItem "knowledge-base/manuals" -File | Where-Object { $_.Name -ne '.gitkeep' }).Count

# ファイルの詳細を表示
Get-ChildItem "knowledge-base/manuals" -File | Where-Object { $_.Name -ne '.gitkeep' } | Format-Table Name,Length,LastWriteTime
```

## ログ確認

サーバーログで以下のキーワードを検索:

```
[api/files/import]          # ファイルアップロード処理
[api/data-processor]        # データ処理
✅                          # 成功ログ
❌                          # エラーログ
📁                          # ファイルパス情報
```

## 今回の修正内容

1. ✅ `knowledge-base/manuals/`フォルダを作成
2. ✅ `knowledge-base/manuals/processed/`フォルダを作成
3. ✅ 各フォルダに`.gitkeep`を配置
4. ✅ 詳細なログ出力を追加
5. ✅ ファイル保存確認処理を追加

## 次回のテスト手順

1. 基礎データ管理UIからファイルをアップロード
2. 「元のファイルも保存する」にチェックを入れる
3. アップロード後、以下を確認:
   - サーバーログに `✅ ファイル保存成功` が表示されるか
   - `knowledge-base/manuals/`にファイルが保存されているか
   - `knowledge-base/manuals/processed/`にメタデータが保存されているか

### 確認コマンド

```powershell
# 最新のアップロードファイル
Get-ChildItem "knowledge-base/manuals" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Format-List

# 最新の処理済みファイル
Get-ChildItem "knowledge-base/manuals/processed" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content | ConvertFrom-Json | Select-Object id,title,timestamp
```

## 関連ファイル

- `/server/src/api/files/index.mjs` - ファイルアップロード処理
- `/server/src/api/data-processor/index.mjs` - データ処理
- `/server/src/infra/blob.mjs` - ストレージ抽象化層
