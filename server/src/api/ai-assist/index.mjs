/**
 * AI Assist API
 */

export default async function aiAssistHandler(req, res) {
  try {
    const method = req.method;
    const pathParts = req.path.split('/').filter(p => p);
    const action = pathParts[pathParts.length - 1]; // 最後のパス要素を取得

    console.log('[api/ai-assist] Request:', { method, action, path: req.path, pathParts });

    if (method === 'GET' && action === 'settings') {
      try {
        const path = await import('path');
        const fs = await import('fs');
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const SETTINGS_FILE = path.join(__dirname, '../../../data/ai-assist-settings.json');

        const DEFAULT_SETTINGS = {
          initialPrompt: "何か問題がありましたか？お困りの事象を教えてください。",
          conversationStyle: "frank",
          questionFlow: {
            step1: "具体的な問題を教えてください",
            step2: "いつ頃から発生していますか？",
            step3: "作業環境の状況を教えてください",
            step4: "他に気になることはありますか？",
            step5: "緊急度を教えてください"
          },
          branchingConditions: {
            timeCheck: true,
            detailsCheck: true,
            toolsCheck: true,
            safetyCheck: true
          },
          responsePattern: "step_by_step",
          escalationTime: 20,
          customInstructions: "",
          enableEmergencyContact: true
        };

        let settings = DEFAULT_SETTINGS;
        if (fs.existsSync(SETTINGS_FILE)) {
          const settingsData = fs.readFileSync(SETTINGS_FILE, { encoding: 'utf8' });
          settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsData) };
          console.log('✅ AI支援設定ファイルから読み込み成功');
        } else {
          console.log('📝 AI支援設定ファイルが存在しないため、デフォルト設定を使用');
        }

        return res.json({
          success: true,
          data: settings,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[api/ai-assist/settings] GET Error:', error);
        return res.status(500).json({
          success: false,
          error: 'AI支援設定の取得に失敗しました',
          details: error.message
        });
      }
    }

    if (method === 'POST' && action === 'settings') {
      try {
        const settings = req.body;
        console.log('[api/ai-assist] Updating settings:', settings);

        const path = await import('path');
        const fs = await import('fs');
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const SETTINGS_FILE = path.join(__dirname, '../../../data/ai-assist-settings.json');

        // データディレクトリを確保
        const dataDir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        // 設定をファイルに保存
        fs.writeFileSync(
          SETTINGS_FILE,
          JSON.stringify(settings, null, 2),
          'utf-8'
        );

        console.log('✅ AI支援設定保存成功');
        return res.json({
          success: true,
          message: 'AI支援設定を更新しました',
          data: settings
        });
      } catch (error) {
        console.error('[api/ai-assist] POST Settings update error:', error);
        return res.status(500).json({
          success: false,
          error: 'AI支援設定の更新に失敗しました',
          details: error.message
        });
      }
    }

    return res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.path
    });
  } catch (error) {
    console.error('[api/ai-assist] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

export const methods = ['get', 'post'];
