/**
 * RAG APIエンドポイント
 */

import express from 'express';
import { ragService } from '../services/rag-service.mjs';

const router = express.Router();

/**
 * POST /api/rag/query
 * RAGクエリを実行
 */
router.post('/query', async (req, res) => {
    try {
        const { question, topK, similarityThreshold, includeContext } = req.body;

        if (!question || typeof question !== 'string') {
            return res.status(400).json({
                error: 'Question is required and must be a string'
            });
        }

        const options = {
            topK: topK || 5,
            similarityThreshold: similarityThreshold || 0.5,
            includeContext: includeContext !== false,
            language: 'ja'
        };

        const result = await ragService.query(question, options);

        res.json({
            success: true,
            question,
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[RAG API] Query error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/rag/stats
 * RAGデータの統計情報を取得
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await ragService.getStats();

        res.json({
            success: true,
            ...stats,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[RAG API] Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/rag/search
 * チャンク検索（クエリなしで関連チャンクのみ取得）
 */
router.post('/search', async (req, res) => {
    try {
        const { query, topK, similarityThreshold } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query is required and must be a string'
            });
        }

        const chunks = await ragService.findRelevantChunks(
            query,
            topK || 5,
            similarityThreshold || 0.5
        );

        res.json({
            success: true,
            query,
            chunks: chunks.map(c => ({
                text: c.text,
                source: c.source,
                similarity: c.similarity,
                metadata: c.metadata
            })),
            count: chunks.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('[RAG API] Search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
