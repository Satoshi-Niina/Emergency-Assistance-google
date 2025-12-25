import { generateStepResponse } from '../../lib/gemini.mjs';
import { uploadFile } from '../../lib/storage.mjs';
import { v4 as uuidv4 } from 'uuid';

function sendPreflight(res) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
    'Access-Control-Max-Age': '86400',
  });
  return res.status(200).send('');
}

export default async function flowGeneratorHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return sendPreflight(res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { keywords, keyword, description } = req.body || {};
    const targetKeyword = keywords || keyword || description;

    if (!targetKeyword || !targetKeyword.trim()) {
      return res.status(400).json({
        success: false,
        error: 'keywords, keyword, or description is required',
      });
    }

    console.log('[flow-generator] Generating flow for:', targetKeyword);

    // Gemini APIでステップ応答を生成
    const flowData = await generateStepResponse(targetKeyword);

    // フローIDを生成
    const flowId = uuidv4();
    const timestamp = new Date().toISOString();

    // 完全なフローデータを作成
    const completeFlowData = {
      id: flowId,
      title: flowData.title,
      description: `${targetKeyword}に関する応急復旧フロー`,
      keywords: targetKeyword,
      steps: flowData.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        order: index + 1,
        description: step.description,
        type: 'action',
        status: 'pending',
      })),
      metadata: {
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: 'gemini-ai',
        version: '1.0',
        category: 'emergency',
      },
    };

    // ストレージに保存（ローカルまたはGCS）
    try {
      const fileName = `flows/${flowId}.json`;
      const buffer = Buffer.from(JSON.stringify(completeFlowData, null, 2), 'utf-8');
      
      await uploadFile(buffer, fileName, 'application/json');
      
      console.log('[flow-generator] Flow saved to storage:', flowId);
    } catch (storageError) {
      console.warn('[flow-generator] Failed to save to storage, continuing anyway:', storageError.message);
      // GCS保存が失敗してもフローデータは返す
    }

    return res.status(200).json({
      success: true,
      flowData: completeFlowData,
      message: 'フローが正常に生成されました',
    });

  } catch (error) {
    console.error('[api/flow-generator] Error:', error);
    
    return res.status(500).json({
      success: false,
      error: 'flow_generation_failed',
      message: error.message || 'フローの生成に失敗しました',
      details: error.stack,
    });
  }
}

export const methods = ['post', 'options'];
