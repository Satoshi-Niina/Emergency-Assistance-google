/**
 * ナレッジデータライフサイクル管理サービス
 * 
 * 機能:
 * - GCSファイル統計情報の取得
 * - 30日経過データの自動アーカイブ
 * - 重複データの検出
 * - 古いデータの削除
 */

import { listFilesInGCS, downloadFromGCS, uploadBufferToGCS, deleteFromGCS } from '../lib/google-cloud-storage.mjs';
import archiver from 'archiver';
import { Readable } from 'stream';

export class KnowledgeLifecycleService {
    constructor() {
        this.storageMode = process.env.STORAGE_MODE || 'local';
        this.archivePath = 'temp/archives';
        this.retentionDays = 30; // アーカイブまでの日数
        this.deletionDays = 90; // 削除までの日数（GCSライフサイクルと同期）
    }

    /**
     * GCSファイル統計情報を取得
     */
    async getStorageStats() {
        try {
            const stats = {
                totalFiles: 0,
                totalSize: 0,
                filesByType: {},
                filesByFolder: {},
                oldFiles: [],
                duplicates: [],
                lastUpdated: new Date().toISOString()
            };

            if (this.storageMode !== 'gcs') {
                return {
                    ...stats,
                    message: 'GCS mode is not enabled'
                };
            }

            // GCSからすべてのファイルを取得
            const folders = ['manuals', 'processed', 'temp', 'chat-exports', 'troubleshooting', 'ai-context'];

            for (const folder of folders) {
                try {
                    const files = await listFilesInGCS(`${folder}/`);

                    for (const file of files) {
                        stats.totalFiles++;
                        stats.totalSize += file.metadata?.size || 0;

                        // ファイルタイプ別集計
                        const ext = file.name.split('.').pop();
                        stats.filesByType[ext] = (stats.filesByType[ext] || 0) + 1;

                        // フォルダ別集計
                        stats.filesByFolder[folder] = (stats.filesByFolder[folder] || 0) + 1;

                        // 古いファイルの検出（30日以上経過）
                        const fileAge = this.getFileAge(file.metadata?.updated || file.metadata?.timeCreated);
                        if (fileAge > this.retentionDays) {
                            stats.oldFiles.push({
                                name: file.name,
                                size: file.metadata?.size || 0,
                                age: fileAge,
                                updated: file.metadata?.updated || file.metadata?.timeCreated
                            });
                        }
                    }
                } catch (folderError) {
                    console.warn(`Failed to list files in ${folder}:`, folderError.message);
                }
            }

            // 重複ファイルの検出
            stats.duplicates = await this.findDuplicates();

            return stats;

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to get storage stats:', error);
            throw error;
        }
    }

    /**
     * ファイルの経過日数を計算
     */
    getFileAge(dateString) {
        if (!dateString) return 0;

        const fileDate = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - fileDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return diffDays;
    }

    /**
     * 重複ファイルを検出
     */
    async findDuplicates() {
        try {
            const duplicates = [];
            const fileHashes = new Map();

            // processedフォルダ内のJSONファイルを確認
            const files = await listFilesInGCS('processed/');

            for (const file of files) {
                if (!file.name.endsWith('.json')) continue;

                try {
                    const content = await downloadFromGCS(file.name);
                    const data = JSON.parse(content.toString('utf-8'));

                    // タイトルとコンテンツのハッシュを作成
                    const hash = this.createContentHash(data.title, data.content);

                    if (fileHashes.has(hash)) {
                        duplicates.push({
                            original: fileHashes.get(hash),
                            duplicate: file.name,
                            title: data.title
                        });
                    } else {
                        fileHashes.set(hash, file.name);
                    }
                } catch (parseError) {
                    console.warn(`Failed to parse ${file.name}:`, parseError.message);
                }
            }

            return duplicates;

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to find duplicates:', error);
            return [];
        }
    }

    /**
     * コンテンツハッシュを作成
     */
    createContentHash(title, content) {
        const crypto = require('crypto');
        const text = `${title}${content}`.substring(0, 1000);
        return crypto.createHash('md5').update(text).digest('hex');
    }

    /**
     * 30日経過データを自動アーカイブ
     */
    async archiveOldData() {
        try {
            const stats = await this.getStorageStats();
            const filesToArchive = stats.oldFiles.filter(f => f.age >= this.retentionDays && f.age < this.deletionDays);

            if (filesToArchive.length === 0) {
                return {
                    success: true,
                    message: 'No files to archive',
                    archived: 0
                };
            }

            console.log(`[KnowledgeLifecycle] Archiving ${filesToArchive.length} files...`);

            // アーカイブファイル名
            const archiveName = `archive_${new Date().toISOString().split('T')[0]}.zip`;
            const archivePath = `${this.archivePath}/${archiveName}`;

            // ZIPアーカイブを作成
            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', chunk => chunks.push(chunk));

            // ファイルをアーカイブに追加
            for (const file of filesToArchive) {
                try {
                    const content = await downloadFromGCS(file.name);
                    archive.append(content, { name: file.name });
                } catch (downloadError) {
                    console.warn(`Failed to download ${file.name}:`, downloadError.message);
                }
            }

            await archive.finalize();

            // アーカイブをGCSにアップロード
            const archiveBuffer = Buffer.concat(chunks);
            await uploadBufferToGCS(archiveBuffer, archivePath, 'application/zip');

            console.log(`[KnowledgeLifecycle] Archive created: ${archivePath}`);

            // 元ファイルを削除
            let deletedCount = 0;
            for (const file of filesToArchive) {
                try {
                    await deleteFromGCS(file.name);
                    deletedCount++;
                } catch (deleteError) {
                    console.warn(`Failed to delete ${file.name}:`, deleteError.message);
                }
            }

            return {
                success: true,
                message: `Archived ${filesToArchive.length} files`,
                archived: filesToArchive.length,
                deleted: deletedCount,
                archivePath: archivePath,
                archiveSize: archiveBuffer.length
            };

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to archive old data:', error);
            throw error;
        }
    }

    /**
     * 1年以上経過データを削除
     */
    async deleteOldData(daysThreshold = 365) {
        try {
            const stats = await this.getStorageStats();
            const filesToDelete = stats.oldFiles.filter(f => f.age >= daysThreshold);

            if (filesToDelete.length === 0) {
                return {
                    success: true,
                    message: 'No files to delete',
                    deleted: 0
                };
            }

            console.log(`[KnowledgeLifecycle] Deleting ${filesToDelete.length} files...`);

            let deletedCount = 0;
            for (const file of filesToDelete) {
                try {
                    await deleteFromGCS(file.name);
                    deletedCount++;
                } catch (deleteError) {
                    console.warn(`Failed to delete ${file.name}:`, deleteError.message);
                }
            }

            return {
                success: true,
                message: `Deleted ${deletedCount} files`,
                deleted: deletedCount,
                totalSize: filesToDelete.reduce((sum, f) => sum + f.size, 0)
            };

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to delete old data:', error);
            throw error;
        }
    }

    /**
     * 全データをエクスポート
     */
    async exportAllData() {
        try {
            console.log('[KnowledgeLifecycle] Exporting all data...');

            const exportName = `full_export_${new Date().toISOString().split('T')[0]}.zip`;
            const exportPath = `temp/exports/${exportName}`;

            const archive = archiver('zip', { zlib: { level: 9 } });
            const chunks = [];

            archive.on('data', chunk => chunks.push(chunk));

            // すべてのフォルダからファイルを取得
            const folders = ['manuals', 'processed', 'chat-exports', 'troubleshooting', 'ai-context'];

            for (const folder of folders) {
                const files = await listFilesInGCS(`${folder}/`);

                for (const file of files) {
                    try {
                        const content = await downloadFromGCS(file.name);
                        archive.append(content, { name: file.name });
                    } catch (downloadError) {
                        console.warn(`Failed to download ${file.name}:`, downloadError.message);
                    }
                }
            }

            await archive.finalize();

            const exportBuffer = Buffer.concat(chunks);
            await uploadBufferToGCS(exportBuffer, exportPath, 'application/zip');

            return {
                success: true,
                message: 'Export completed',
                exportPath: exportPath,
                exportSize: exportBuffer.length
            };

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to export data:', error);
            throw error;
        }
    }

    /**
     * アーカイブ一覧を取得
     */
    async listArchives() {
        try {
            const archives = await listFilesInGCS(`${this.archivePath}/`);

            return archives.map(file => ({
                name: file.name,
                size: file.metadata?.size || 0,
                created: file.metadata?.timeCreated,
                updated: file.metadata?.updated
            }));

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to list archives:', error);
            return [];
        }
    }

    /**
     * 重複データを削除
     */
    async removeDuplicates() {
        try {
            const duplicates = await this.findDuplicates();

            if (duplicates.length === 0) {
                return {
                    success: true,
                    message: 'No duplicates found',
                    removed: 0
                };
            }

            let removedCount = 0;
            for (const dup of duplicates) {
                try {
                    await deleteFromGCS(dup.duplicate);
                    removedCount++;
                } catch (deleteError) {
                    console.warn(`Failed to delete duplicate ${dup.duplicate}:`, deleteError.message);
                }
            }

            return {
                success: true,
                message: `Removed ${removedCount} duplicate files`,
                removed: removedCount
            };

        } catch (error) {
            console.error('[KnowledgeLifecycle] Failed to remove duplicates:', error);
            throw error;
        }
    }
}

// シングルトンインスタンス
export const lifecycleService = new KnowledgeLifecycleService();
