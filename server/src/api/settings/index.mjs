/**
 * Settings API - RAG設定管理
 * GET /api/settings/rag - RAG設定取得
 * POST /api/settings/rag - RAG設定更新
 */

export default async function settingsHandler(req, res) {
  const method = req.method;
  const pathParts = req.path.split('/').filter(p => p);
  const action = pathParts[pathParts.length - 1]; // 最後のパス要素を取得

  console.log('[api/settings] Request:', { method, action, path: req.path, pathParts });

  // GET /api/settings/rag - RAG設定取得
  if (method === 'GET' && action === 'rag') {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const RAG_SETTINGS_FILE = path.join(__dirname, '../../../data/rag-settings.json');
      
      const DEFAULT_RAG_SETTINGS = {
        chunkSize: 500,
        chunkOverlap: 200,
        similarityThreshold: 0.7,
        maxResults: 5,
        useSemanticSearch: true,
        useKeywordSearch: true,
        enableSemantic: true,
        enableKeyword: true,
        removeDuplicates: true,
        preprocessing: {
          removeStopWords: true,
          normalizeCasing: true,
          removeSpecialChars: false,
        },
        preprocessingOptions: {
          removeStopWords: true,
          lowercaseText: true,
          removeSpecialChars: false,
        },
        customPrompt: '',
        customInstructions: `【回答ルール】
1. ユーザーの質問に対して1問1答形式で回答する
2. 回答は最大2行まで（簡潔に）
3. ナレッジベース（manuals/processed/）を優先的に参照し、情報が不足している場合のみ一般情報を検索する
4. ユーザーの情報から機械故障の原因を推測し、さらに新しい情報から絞り込んで回答する
5. 問題が解消できた場合は、「チャット履歴をサーバーに送信してください」と表示する
6. 問題が解消できない場合は、「支援要員に連絡してください」と表示する

【情報源の明示】
- ナレッジベースから: [ドキュメント]
- 一般知識から: [一般知識]`,
        temperature: 0.7,
        maxTokens: 2000,
      };
      
      let ragSettings = DEFAULT_RAG_SETTINGS;
      if (fs.existsSync(RAG_SETTINGS_FILE)) {
        const settingsData = fs.readFileSync(RAG_SETTINGS_FILE, { encoding: 'utf8' });
        ragSettings = { ...DEFAULT_RAG_SETTINGS, ...JSON.parse(settingsData) };
        console.log('✅ RAG設定ファイルから読み込み成功');
      } else {
        console.log('📝 RAG設定ファイルが存在しないため、デフォルト設定を使用');
      }

      return res.json({
        success: true,
        data: ragSettings,
      });
    } catch (error) {
      console.error('[api/settings/rag] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'RAG設定の取得に失敗しました',
        details: error.message,
      });
    }
  }

  // POST /api/settings/rag - RAG設定更新
  if (method === 'POST' && action === 'rag') {
    try {
      const settings = req.body;
      console.log('[api/settings/rag] Updating settings:', settings);

      // RAG設定ファイルのパス
      const path = await import('path');
      const fs = await import('fs');
      const __dirname = path.dirname(new URL(import.meta.url).pathname);
      const RAG_SETTINGS_FILE = path.join(__dirname, '../../../data/rag-settings.json');
      
      // データディレクトリを確保
      const dataDir = path.dirname(RAG_SETTINGS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // 既存の設定を読み込む
      let existingSettings = {};
      if (fs.existsSync(RAG_SETTINGS_FILE)) {
        const existingData = fs.readFileSync(RAG_SETTINGS_FILE, 'utf-8');
        existingSettings = JSON.parse(existingData);
      }

      // customInstructionsが空欄の場合、既存の値を保持
      const mergedSettings = {
        ...existingSettings,
        ...settings
      };

      if (!settings.customInstructions || settings.customInstructions.trim() === '') {
        mergedSettings.customInstructions = existingSettings.customInstructions || '';
      }

      // 設定をファイルに保存
      fs.writeFileSync(
        RAG_SETTINGS_FILE,
        JSON.stringify(mergedSettings, null, 2),
        'utf-8'
      );

      console.log('✅ RAG設定保存成功');
      return res.json({
        success: true,
        message: 'RAG設定を更新しました',
        data: mergedSettings,
      });
    } catch (error) {
      console.error('[api/settings/rag] Error:', error);
      return res.status(500).json({
        success: false,
        error: 'RAG設定の更新に失敗しました',
        details: error.message,
      });
    }
  }

  return res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
}

export const methods = ['get', 'post', 'put', 'delete'];
