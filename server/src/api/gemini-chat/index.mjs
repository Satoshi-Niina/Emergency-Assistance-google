import { processGeminiRequest } from '../../lib/gemini.mjs';
import { searchKnowledgeBase, buildKnowledgePrompt } from '../../lib/knowledge-search.mjs';

function sendPreflight(res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400',
  });
  return res.status(200).send('');
}

export default async function geminiChatHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { text, message, conversationHistory = [], machineTag = null } = req.body || {};
  const userMessage = text || message;

  if (!userMessage || !userMessage.trim()) {
    return res.status(400).json({ success: false, error: 'text or message is required' });
  }

  try {
    const path = await import('path');
    const fs = await import('fs');
    const url = await import('url');
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const DATA_DIR = path.join(__dirname, '../../../data');

    // RAG設定の読み込み
    const RAG_SETTINGS_FILE = path.join(DATA_DIR, 'rag-settings.json');
    let ragSettings = {
      maxResults: 3,
      similarityThreshold: 0.5,
      customInstructions: 'あなたは建設機械の保守・トラブルシューティングの専門家です。'
    };
    if (fs.existsSync(RAG_SETTINGS_FILE)) {
      try {
        const data = fs.readFileSync(RAG_SETTINGS_FILE, 'utf-8');
        ragSettings = { ...ragSettings, ...JSON.parse(data) };
      } catch (e) {
        console.error('[gemini-chat] Failed to parse RAG settings:', e);
      }
    }

    // AI支援設定の読み込み
    const AI_ASSIST_SETTINGS_FILE = path.join(DATA_DIR, 'ai-assist-settings.json');
    let aiAssistSettings = {
      conversationStyle: 'frank',
      customInstructions: ''
    };
    if (fs.existsSync(AI_ASSIST_SETTINGS_FILE)) {
      try {
        const data = fs.readFileSync(AI_ASSIST_SETTINGS_FILE, 'utf-8');
        aiAssistSettings = { ...aiAssistSettings, ...JSON.parse(data) };
      } catch (e) {
        console.error('[gemini-chat] Failed to parse AI assist settings:', e);
      }
    }

    console.log('[gemini-chat] Processing request:', {
      messageLength: userMessage.length,
      hasHistory: conversationHistory.length > 0,
      machineTag: machineTag || 'all',
      settings: {
        ragMaxResults: ragSettings.maxResults,
        aiStyle: aiAssistSettings.conversationStyle
      }
    });

    // ナレッジベースから関連資料を検索 (RAG設定を使用)
    const searchResults = await searchKnowledgeBase(userMessage, {
      maxResults: ragSettings.maxResults,
      similarityThreshold: ragSettings.similarityThreshold,
      machineTag: machineTag,
    });

    console.log('[gemini-chat] Found knowledge:', {
      count: searchResults.length,
      files: searchResults.map(r => r.name),
    });

    // 会話履歴を含めたプロンプトを作成
    let prompt = '';

    // システム指示の構築
    let systemInstructions = ragSettings.customInstructions || 'あなたは建設機械の保守・トラブルシューティングの専門家です。';

    // 会話スタイルの適用
    const styles = {
      frank: '親しみやすくフランクな言葉遣いで回答してください。',
      business: '丁寧なビジネス敬語で、誠実に対応してください。',
      technical: '専門用語を適切に使用し、技術的に詳細で正確な回答を心がけてください。'
    };
    systemInstructions += `\n\n【回答スタイル】\n${styles[aiAssistSettings.conversationStyle] || styles.frank}`;

    if (aiAssistSettings.customInstructions) {
      systemInstructions += `\n\n【追加指示】\n${aiAssistSettings.customInstructions}`;
    }

    prompt += `システム指示:\n${systemInstructions}\n\n`;

    if (conversationHistory.length > 0) {
      prompt += '以前の会話:\n';
      conversationHistory.slice(-10).forEach((msg, index) => {
        const role = msg.isAiResponse ? 'AI' : 'ユーザー';
        prompt += `${role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }

    // ナレッジベースから取得した参考資料を追加
    if (searchResults.length > 0) {
      const knowledgePrompt = await buildKnowledgePrompt(searchResults);
      prompt += knowledgePrompt;
      prompt += '\n\n';
    }

    prompt += `ユーザーの質問に対して、上記の指示に従って回答してください。
${searchResults.length > 0 ? '提供された参考資料を最大限に活用してください。' : ''}

質問: ${userMessage}

回答:`;

    const response = await processGeminiRequest(prompt, {
      temperature: ragSettings.temperature || 0.7,
      maxOutputTokens: ragSettings.maxTokens || 2000,
    });

    console.log('[gemini-chat] Response generated successfully');

    return res.status(200).json({
      success: true,
      response: response,
      message: response,
      knowledgeSources: searchResults.length,
      referencedFiles: searchResults.map(r => r.name),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[api/gemini-chat] Error:', error);

    return res.status(500).json({
      success: false,
      error: 'gemini_request_failed',
      message: error.message || 'Gemini APIでの処理に失敗しました',
    });
  }
}

export const methods = ['post', 'options'];
