/**
 * RAGサービス
 * 
 * 処理済みJSONファイルを使用してGeminiにクエリを送信
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { listFilesInGCS, downloadFromGCS } from '../lib/google-cloud-storage.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class RAGService {
    constructor() {
        this.apiKey = process.env.GOOGLE_GEMINI_API_KEY;
        this.storageMode = process.env.STORAGE_MODE || 'local';
        this.knowledgeBasePath = path.resolve(__dirname, '../../knowledge-base');
        this.processedPath = path.join(this.knowledgeBasePath, 'processed');

        if (!this.apiKey) {
            throw new Error('GOOGLE_GEMINI_API_KEY is not set');
        }

        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });

        // キャッシュ
        this.ragDataCache = new Map();
    }

    /**
     * コサイン類似度を計算
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) {
            return 0;
        }

        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

        if (magnitudeA === 0 || magnitudeB === 0) {
            return 0;
        }

        return dotProduct / (magnitudeA * magnitudeB);
    }

    /**
     * クエリの埋め込みベクトルを生成
     */
    async generateQueryEmbedding(query) {
        try {
            const embeddingModel = this.genAI.getGenerativeModel({ model: 'embedding-001' });
            const result = await embeddingModel.embedContent(query);
            return result.embedding.values;
        } catch (error) {
            console.error('Failed to generate query embedding:', error);
            return null;
        }
    }

    /**
     * 処理済みRAG JSONファイルを読み込み
     */
    async loadRagData() {
        const ragFiles = [];

        if (this.storageMode === 'gcs') {
            // GCSから読み込み
            try {
                const files = await listFilesInGCS('processed/');

                for (const file of files) {
                    if (file.name.endsWith('_rag.json')) {
                        const buffer = await downloadFromGCS(file.name);
                        const data = JSON.parse(buffer.toString('utf-8'));
                        ragFiles.push(data);
                    }
                }
            } catch (error) {
                console.error('Failed to load RAG data from GCS:', error);
            }
        } else {
            // ローカルから読み込み
            try {
                const files = await fs.readdir(this.processedPath);

                for (const file of files) {
                    if (file.endsWith('_rag.json')) {
                        const filePath = path.join(this.processedPath, file);
                        const content = await fs.readFile(filePath, 'utf-8');
                        const data = JSON.parse(content);
                        ragFiles.push(data);
                    }
                }
            } catch (error) {
                console.error('Failed to load RAG data from local:', error);
            }
        }

        return ragFiles;
    }

    /**
     * 関連するチャンクを検索
     */
    async findRelevantChunks(query, topK = 5, similarityThreshold = 0.5) {
        // クエリの埋め込みベクトルを生成
        const queryEmbedding = await this.generateQueryEmbedding(query);

        if (!queryEmbedding) {
            console.warn('Failed to generate query embedding, using keyword search');
            return this.keywordSearch(query, topK);
        }

        // RAGデータを読み込み
        const ragDataList = await this.loadRagData();

        // すべてのチャンクを収集
        const allChunks = [];

        for (const ragData of ragDataList) {
            for (const chunk of ragData.chunks) {
                if (chunk.embedding) {
                    const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);

                    if (similarity >= similarityThreshold) {
                        allChunks.push({
                            ...chunk,
                            similarity,
                            source: ragData.source
                        });
                    }
                }
            }
        }

        // 類似度でソート
        allChunks.sort((a, b) => b.similarity - a.similarity);

        // 上位K件を返す
        return allChunks.slice(0, topK);
    }

    /**
     * キーワード検索（フォールバック）
     */
    async keywordSearch(query, topK = 5) {
        const ragDataList = await this.loadRagData();
        const keywords = query.toLowerCase().split(/\s+/);
        const scoredChunks = [];

        for (const ragData of ragDataList) {
            for (const chunk of ragData.chunks) {
                const text = chunk.text.toLowerCase();
                let score = 0;

                for (const keyword of keywords) {
                    const count = (text.match(new RegExp(keyword, 'g')) || []).length;
                    score += count;
                }

                if (score > 0) {
                    scoredChunks.push({
                        ...chunk,
                        similarity: score / keywords.length,
                        source: ragData.source
                    });
                }
            }
        }

        scoredChunks.sort((a, b) => b.similarity - a.similarity);
        return scoredChunks.slice(0, topK);
    }

    /**
     * RAGクエリを実行
     */
    async query(userQuestion, options = {}) {
        const {
            topK = 5,
            similarityThreshold = 0.5,
            includeContext = true,
            language = 'ja'
        } = options;

        console.log(`[RAG] Processing query: "${userQuestion}"`);

        // 関連チャンクを検索
        const relevantChunks = await this.findRelevantChunks(
            userQuestion,
            topK,
            similarityThreshold
        );

        console.log(`[RAG] Found ${relevantChunks.length} relevant chunks`);

        if (relevantChunks.length === 0) {
            return {
                answer: '申し訳ございません。関連する情報が見つかりませんでした。',
                sources: [],
                chunks: []
            };
        }

        // コンテキストを構築
        const context = relevantChunks
            .map((chunk, index) => {
                return `[参考資料${index + 1}: ${chunk.source}]\n${chunk.text}`;
            })
            .join('\n\n---\n\n');

        // Geminiにクエリ
        const prompt = `
あなたは技術サポートアシスタントです。以下の参考情報を使用して、ユーザーの質問に${language === 'ja' ? '日本語' : '英語'}で正確に答えてください。

参考情報に含まれていない内容については、「参考資料には記載がありません」と明記してください。

【参考情報】
${context}

【質問】
${userQuestion}

【回答】
`;

        try {
            const result = await this.model.generateContent(prompt);
            const response = result.response;
            const answer = response.text();

            // ソース情報を抽出
            const sources = [...new Set(relevantChunks.map(c => c.source))];

            return {
                answer,
                sources,
                chunks: includeContext ? relevantChunks.map(c => ({
                    text: c.text,
                    source: c.source,
                    similarity: c.similarity
                })) : [],
                metadata: {
                    queryEmbeddingGenerated: true,
                    chunksFound: relevantChunks.length,
                    topSimilarity: relevantChunks[0]?.similarity || 0
                }
            };

        } catch (error) {
            console.error('[RAG] Gemini query failed:', error);
            throw new Error(`Failed to generate response: ${error.message}`);
        }
    }

    /**
     * RAGデータの統計情報を取得
     */
    async getStats() {
        const ragDataList = await this.loadRagData();

        let totalChunks = 0;
        let totalCharacters = 0;
        const sources = [];

        for (const ragData of ragDataList) {
            totalChunks += ragData.totalChunks;
            totalCharacters += ragData.totalCharacters;
            sources.push({
                name: ragData.source,
                chunks: ragData.totalChunks,
                characters: ragData.totalCharacters,
                processedAt: ragData.processedAt
            });
        }

        return {
            totalFiles: ragDataList.length,
            totalChunks,
            totalCharacters,
            sources,
            storageMode: this.storageMode
        };
    }
}

// シングルトンインスタンス
export const ragService = new RAGService();
