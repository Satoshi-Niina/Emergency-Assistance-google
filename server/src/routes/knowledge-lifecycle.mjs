/**
 * ナレッジデータライフサイクル管理 APIエンドポイント
 */

import express from 'express';
import { lifecycleService } from '../services/knowledge-lifecycle.mjs';

const router = express.Router();

/**
 * GET /api/knowledge-lifecycle/stats
 * ストレージ統計情報を取得
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await lifecycleService.getStorageStats();

        res.json({
            success: true,
            ...stats
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/knowledge-lifecycle/archive
 * 30日経過データを自動アーカイブ
 */
router.post('/archive', async (req, res) => {
    try {
        const result = await lifecycleService.archiveOldData();

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Archive error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/knowledge-lifecycle/delete-old
 * 1年以上経過データを削除
 */
router.post('/delete-old', async (req, res) => {
    try {
        const { daysThreshold } = req.body;
        const result = await lifecycleService.deleteOldData(daysThreshold || 365);

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Delete error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/knowledge-lifecycle/export
 * 全データをエクスポート
 */
router.post('/export', async (req, res) => {
    try {
        const result = await lifecycleService.exportAllData();

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Export error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/knowledge-lifecycle/archives
 * アーカイブ一覧を取得
 */
router.get('/archives', async (req, res) => {
    try {
        const archives = await lifecycleService.listArchives();

        res.json({
            success: true,
            archives,
            count: archives.length
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] List archives error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/knowledge-lifecycle/remove-duplicates
 * 重複データを削除
 */
router.post('/remove-duplicates', async (req, res) => {
    try {
        const result = await lifecycleService.removeDuplicates();

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Remove duplicates error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/knowledge-lifecycle/duplicates
 * 重複データを検出
 */
router.get('/duplicates', async (req, res) => {
    try {
        const duplicates = await lifecycleService.findDuplicates();

        res.json({
            success: true,
            duplicates,
            count: duplicates.length
        });

    } catch (error) {
        console.error('[Knowledge Lifecycle API] Find duplicates error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
