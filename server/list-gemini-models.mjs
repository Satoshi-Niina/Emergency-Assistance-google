#!/usr/bin/env node
// 利用可能なGeminiモデルをリストアップ
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 環境変数を読み込み
dotenv.config({ path: path.join(rootDir, '.env.development') });

async function listGeminiModels() {
  console.log('🔍 利用可能なGeminiモデルをリストアップ中...\n');

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_GEMINI_API_KEY が設定されていません');
    process.exit(1);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // listModels メソッドを使用
    const models = await genAI.listModels();
    
    console.log('✅ 利用可能なモデル一覧:\n');
    
    for await (const model of models) {
      console.log(`モデル名: ${model.name}`);
      console.log(`  表示名: ${model.displayName || 'N/A'}`);
      console.log(`  説明: ${model.description || 'N/A'}`);
      
      if (model.supportedGenerationMethods && model.supportedGenerationMethods.length > 0) {
        console.log(`  サポートされるメソッド: ${model.supportedGenerationMethods.join(', ')}`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ モデル一覧の取得に失敗');
    console.error('エラーメッセージ:', error.message);
    process.exit(1);
  }
}

listGeminiModels();
