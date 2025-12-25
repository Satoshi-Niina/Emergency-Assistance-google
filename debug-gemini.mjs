import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function listModels() {
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_GEMINI_API_KEY not found in .env');
        return;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // There is no direct listModels in the client, we have to use the API directly or check documentation
        // However, we can try to initialize some common ones and see if they work.
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

        for (const modelName of models) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Say OK');
                const response = await result.response;
                console.log(`✅ Model ${modelName} works: ${response.text()}`);
            } catch (e) {
                console.log(`❌ Model ${modelName} failed: ${e.message}`);
                if (e.status) console.log(`   Status: ${e.status}`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

listModels();
