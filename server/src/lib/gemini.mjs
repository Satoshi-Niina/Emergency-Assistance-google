// Google Gemini AI クライアント
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM用__dirname定義
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .envファイルの読み込み
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../server/.env') });

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

// APIキーの取得
const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

// デバッグ用ログ
console.log('[DEBUG] Gemini initialization - API KEY exists:', apiKey ? 'YES' : 'NO');
console.log('[DEBUG] Gemini API KEY prefix:', apiKey ? apiKey.substring(0, 10) + '...' : 'NOT FOUND');
console.log('[DEBUG] Environment variables:', {
  GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY ? 'SET' : 'NOT SET',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET',
  NODE_ENV: process.env.NODE_ENV,
});

// Geminiクライアントの初期化
let genAI = null;
let model = null;

if (apiKey && apiKey !== 'your-google-api-key-here') {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    console.log('[DEBUG] Gemini client initialized successfully');
  } catch (error) {
    console.error('[DEBUG] Gemini client initialization failed:', error);
    genAI = null;
    model = null;
  }
} else {
  console.log('[DEV] Gemini client not initialized - API key not available or is placeholder');
}

/**
 * Geminiクライアントの状態を確認する関数
 */
export function getGeminiClientStatus() {
  return {
    clientExists: !!genAI,
    modelExists: !!model,
    apiKeyExists: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NOT FOUND',
    apiKeyLength: apiKey ? apiKey.length : 0,
    isPlaceholder: apiKey === 'your-google-api-key-here',
  };
}

/**
 * Gemini APIにリクエストを送信して応答を取得する関数
 * @param {string} prompt プロンプト文字列
 * @param {object} options オプション設定
 * @returns {Promise<string>} Gemini APIからの応答テキスト
 */
export async function processGeminiRequest(prompt, options = {}) {
  // Geminiクライアントが利用可能かチェック
  if (!model) {
    console.log('[DEV] Gemini model not available');
    return '申し訳ございません。現在AI機能は利用できません。開発環境ではGoogle API キーが設定されていません。';
  }

  try {
    const {
      temperature = 0.7,
      maxOutputTokens = 2000,
      topK = 40,
      topP = 0.95,
    } = options;

    // Gemini API呼び出し
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens,
        topK,
        topP,
      },
    });

    const response = await result.response;
    const text = response.text();

    console.log('[DEBUG] Gemini API response received successfully');
    return text;

  } catch (error) {
    console.error('Gemini APIリクエストエラー:', error);

    // エラータイプに応じた処理
    if (error.message?.includes('API key')) {
      throw new Error('Google API キーが無効です。システム管理者に連絡してください。');
    } else if (error.message?.includes('quota')) {
      throw new Error('APIの利用制限に達しました。しばらくしてからもう一度お試しください。');
    } else if (error.message?.includes('SAFETY')) {
      throw new Error('安全性フィルターにより、応答が生成できませんでした。質問内容を変更してください。');
    }

    throw new Error('Gemini APIでの処理に失敗しました: ' + error.message);
  }
}

/**
 * キーワードからステップ形式のレスポンスを生成する
 * @param {string} keyword キーワード
 * @returns {Promise<{title: string, steps: {description: string}[]}>}
 */
export async function generateStepResponse(keyword) {
  try {
    // Geminiクライアントが利用可能かチェック
    if (!model) {
      console.log('[DEV] Gemini model not available for step response generation');
      return {
        title: keyword,
        steps: [
          { description: '開発環境ではステップ生成機能が利用できません。' },
        ],
      };
    }

    const prompt = `あなたは建設機械の保守・トラブルシューティングの専門家です。
以下のキーワードに対する応急処置手順を、ステップバイステップで生成してください。

キーワード: ${keyword}

以下のJSON形式で回答してください：
{
  "title": "手順のタイトル",
  "steps": [
    {"description": "ステップ1の説明"},
    {"description": "ステップ2の説明"},
    ...
  ]
}

各ステップは具体的で実行可能な内容にしてください。`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSONとして解析（コードブロックを除去）
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsedResult = JSON.parse(jsonText);

    return {
      title: parsedResult.title || keyword,
      steps: parsedResult.steps || [],
    };
  } catch (error) {
    console.error('ステップレスポンス生成エラー:', error);
    return {
      title: keyword,
      steps: [{ description: 'レスポンスの生成に失敗しました。' }],
    };
  }
}

/**
 * 検索クエリを最適化する関数
 * @param {string} text 元のテキスト
 * @returns {Promise<string>} 最適化された検索クエリ
 */
export async function optimizeSearchQuery(text) {
  try {
    if (!model) {
      console.log('[DEV] Gemini model not available for query optimization');
      return text;
    }

    const prompt = `以下のテキストから、最も重要なキーワードを抽出して、簡潔な検索クエリを生成してください。
テキスト: ${text}

検索クエリのみを返してください（説明不要）。`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();

  } catch (error) {
    console.error('検索クエリ最適化エラー:', error);
    return text;
  }
}

export { genAI, model };
