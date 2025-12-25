import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { VERSION } from '../config/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const router = express.Router();

// Environment check
router.get('/env', (req, res) => {
  const safeEnv = {};
  const unsafeKeys = ['KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'CONN', 'CREDENTIAL'];

  Object.keys(process.env).forEach(key => {
    if (unsafeKeys.some(unsafe => key.toUpperCase().includes(unsafe))) {
      safeEnv[key] = process.env[key] ? '[REDACTED]' : '[NOT SET]';
    } else {
      safeEnv[key] = process.env[key];
    }
  });

  res.json({
    env: safeEnv,
    cwd: process.cwd(),
    dirname: __dirname,
    timestamp: new Date().toISOString(),
    // 重要な環境変数の確認
    criticalEnvVars: {
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY ? '✅ SET' : '❌ NOT SET',
      STORAGE_MODE: process.env.STORAGE_MODE || 'local',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ SET' : '❌ NOT SET',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || 'not set'
    }
  });
});

// Azure Blob Storage関連エンドポイントは削除済み（GCS専用システム）
// 以下のエンドポイントは無効化されました：
// - GET /blob-test (Azure Blob接続テスト)
// - GET /blob-detailed (Azure Blob詳細診断)
// 
// GCS接続テストは server/test-gcs-connection.mjs を使用してください

// Gemini API接続診断
router.get('/gemini-check', async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        status: 'error',
        message: 'GOOGLE_GEMINI_API_KEY is not set',
        details: {
          apiKeySet: false,
          error: 'Environment variable not configured'
        }
      });
    }

    // Gemini APIに簡単なテストリクエストを送信
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    // デフォルトモデルをgemini-2.0-flash-expに変更（テスト済み動作確認済み）
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
    console.log('----------------------------------------------------');
    console.log(`[VERIFY-TIME: 18:07] Gemini Check executing model: ${modelName}`);
    console.log('----------------------------------------------------');
    const model = genAI.getGenerativeModel({ model: modelName });

    const testPrompt = 'これはテストです。「OK」とだけ返答してください。';
    const result = await model.generateContent(testPrompt);
    const response = await result.response;
    const text = response.text();

    return res.json({
      success: true,
      status: 'connected',
      message: 'Gemini API connection successful',
      details: {
        apiKeySet: true,
        model: modelName,
        testResponse: text,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[Gemini Check] Error:', error);
    return res.status(500).json({
      success: false,
      status: 'error',
      message: 'Gemini API connection failed',
      details: {
        apiKeySet: !!process.env.GOOGLE_GEMINI_API_KEY,
        error: error.message,
        errorType: error.constructor.name
      }
    });
  }
});

// Azure Blob Storage関連エンドポイントは削除済み（GCS専用システム）
// GCS接続テストは server/test-gcs-connection.mjs を使用してください

export default function registerDiagRoutes(app) {
  app.use('/api/_diag', router);

  // System check endpoints (redirect to actual API endpoints)
  app.get('/api/system-check/db-check', async (req, res, next) => {
    req.url = '/api/db-check';
    return app._router.handle(req, res, next);
  });

  app.post('/api/system-check/gpt-check', async (req, res, next) => {
    req.url = '/api/gpt-check';
    return app._router.handle(req, res, next);
  });

  // Version info
  app.get('/api/version', (req, res) => {
    let deploymentInfo = {};
    try {
      const deployInfoPath = path.join(rootDir, 'deployment-info.json');
      if (fs.existsSync(deployInfoPath)) {
        deploymentInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf8'));
      }
    } catch (error) {
      console.warn('Could not read deployment-info.json:', error.message);
    }

    res.json({
      version: VERSION,
      currentTime: new Date().toISOString(),
      deployment: deploymentInfo,
      environment: process.env.NODE_ENV || 'production'
    });
  });

  app.get('/deployment-info.json', (req, res) => {
    const deployInfoPath = path.join(rootDir, 'deployment-info.json');
    if (fs.existsSync(deployInfoPath)) {
      res.sendFile(deployInfoPath);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}
