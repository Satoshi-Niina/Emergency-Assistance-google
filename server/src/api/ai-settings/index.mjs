import { uploadFile, downloadFile, fileExists } from '../../lib/storage.mjs';
import * as fs from 'fs';
import * as path from 'path';

const AI_SETTINGS_PATH = 'settings/ai-config.json';
const DEFAULT_SETTINGS = {
  gemini: {
    model: 'gemini-2.0-flash-exp',
    temperature: 0.7,
    maxOutputTokens: 2000,
    topK: 40,
    topP: 0.95,
  },
  prompts: {
    system: `あなたは建設機械の保守・トラブルシューティングの専門家です。
以下のガイドラインに従って回答してください：

1. 安全第一を最優先にする
2. 具体的で実行可能な手順を提供する
3. 専門用語を使用する場合は説明を加える
4. 緊急時は迅速に対応方法を示す
5. 必要に応じて専門家への相談を推奨する`,
    chat: `ユーザーの質問: {query}

以下のコンテキスト情報を参考に、質問に答えてください：
{context}

回答:`,
    flowGeneration: `以下のキーワードに対する建設機械の応急復旧フローを生成してください。

キーワード: {keyword}

以下のJSON形式で回答してください：
{{
  "title": "フローのタイトル",
  "steps": [
    {{"description": "ステップ1の具体的な説明"}},
    {{"description": "ステップ2の具体的な説明"}}
  ]
}}

各ステップは以下を含めてください：
- 具体的な作業内容
- 安全上の注意点
- 必要な工具や部品（該当する場合）`,
  },
  rag: {
    enabled: true,
    similarityThreshold: 0.7,
    maxResults: 5,
    enableSemanticSearch: true,
    enableKeywordSearch: true,
    chunkSize: 1000,
    chunkOverlap: 200,
  },
  safetySettings: {
    blockThreshold: 'BLOCK_MEDIUM_AND_ABOVE',
    categories: [
      'HARM_CATEGORY_HATE_SPEECH',
      'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      'HARM_CATEGORY_DANGEROUS_CONTENT',
      'HARM_CATEGORY_HARASSMENT',
    ],
  },
};

function sendPreflight(res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400',
  });
  return res.status(200).send('');
}

export default async function aiSettingsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  if (req.method === 'GET') {
    return handleGetSettings(req, res);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    return handleUpdateSettings(req, res);
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

/**
 * AI設定を取得
 */
async function handleGetSettings(req, res) {
  try {
    let settings = DEFAULT_SETTINGS;

    // ストレージから設定を読み込み
    try {
      const exists = await fileExists(AI_SETTINGS_PATH);

      if (exists) {
        const buffer = await downloadFile(AI_SETTINGS_PATH);
        settings = JSON.parse(buffer.toString('utf-8'));
        console.log('[ai-settings] Settings loaded from storage');
      } else {
        console.log('[ai-settings] Using default settings (storage file not found)');
      }
    } catch (gcsError) {
      console.warn('[ai-settings] Failed to load from GCS, using defaults:', gcsError.message);
    }

    return res.status(200).json({
      success: true,
      settings: settings,
      source: 'google-cloud-storage',
    });

  } catch (error) {
    console.error('[api/ai-settings] Get error:', error);

    return res.status(500).json({
      success: false,
      error: 'get_settings_failed',
      message: error.message || 'AI設定の取得に失敗しました',
    });
  }
}

/**
 * AI設定を更新
 */
async function handleUpdateSettings(req, res) {
  try {
    const { settings } = req.body || {};

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'settings object is required',
      });
    }

    // 既存の設定を読み込み
    let currentSettings = DEFAULT_SETTINGS;

    try {
      const exists = await fileExists(AI_SETTINGS_PATH);
      if (exists) {
        const buffer = await downloadFile(AI_SETTINGS_PATH);
        currentSettings = JSON.parse(buffer.toString('utf-8'));
      }
    } catch (storageError) {
      console.warn('[ai-settings] Could not load existing settings:', storageError.message);
    }

    // 設定をマージ
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      gemini: {
        ...currentSettings.gemini,
        ...(settings.gemini || {}),
      },
      prompts: {
        ...currentSettings.prompts,
        ...(settings.prompts || {}),
      },
      rag: {
        ...currentSettings.rag,
        ...(settings.rag || {}),
      },
      safetySettings: {
        ...currentSettings.safetySettings,
        ...(settings.safetySettings || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    // ストレージに保存
    const buffer = Buffer.from(JSON.stringify(updatedSettings, null, 2), 'utf-8');
    await uploadFile(buffer, AI_SETTINGS_PATH, 'application/json');

    console.log('[ai-settings] Settings updated successfully');

    return res.status(200).json({
      success: true,
      settings: updatedSettings,
      message: 'AI設定が正常に更新されました',
    });

  } catch (error) {
    console.error('[api/ai-settings] Update error:', error);

    return res.status(500).json({
      success: false,
      error: 'update_settings_failed',
      message: error.message || 'AI設定の更新に失敗しました',
    });
  }
}

export const methods = ['get', 'post', 'put', 'options'];
