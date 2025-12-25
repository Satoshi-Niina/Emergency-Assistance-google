#!/usr/bin/env node

/**
 * ナレッジベース処理スクリプト
 * 
 * 処理フロー:
 * 1. manuals/フォルダから元データを読み込み
 * 2. テキストをチャンク化
 * 3. Gemini APIで埋め込みベクトルを生成
 * 4. RAG処理済みJSONファイルを保存
 * 5. GCSにアップロード（オプション）
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { listFilesInGCS, downloadFromGCS, uploadBufferToGCS } from '../lib/google-cloud-storage.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 環境変数の読み込み
dotenv.config({ path: path.resolve(__dirname, '../../.env.development') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// カラー出力
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

// 設定
const STORAGE_MODE = process.env.STORAGE_MODE || 'local';
const KNOWLEDGE_BASE_PATH = path.resolve(__dirname, '../../knowledge-base');
const MANUALS_PATH = path.join(KNOWLEDGE_BASE_PATH, 'manuals');
const PROCESSED_PATH = path.join(KNOWLEDGE_BASE_PATH, 'processed');
const CHUNK_SIZE = 1000; // 文字数
const CHUNK_OVERLAP = 200; // オーバーラップ文字数

/**
 * テキストをチャンク化
 */
function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunk = text.substring(start, end);

        chunks.push({
            text: chunk,
            startIndex: start,
            endIndex: end,
            length: chunk.length
        });

        start += chunkSize - overlap;
    }

    return chunks;
}

/**
 * Gemini APIで埋め込みベクトルを生成
 */
async function generateEmbedding(text, genAI) {
    try {
        const model = genAI.getGenerativeModel({ model: 'embedding-001' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    } catch (error) {
        log(`  ⚠️  Embedding generation failed: ${error.message}`, colors.yellow);
        return null;
    }
}

/**
 * ファイルを処理してRAG JSONを生成
 */
async function processFile(filePath, fileName, genAI) {
    try {
        // ファイル読み込み
        const content = await fs.readFile(filePath, 'utf-8');

        log(`\n📄 Processing: ${fileName}`, colors.blue);
        log(`  📊 File size: ${content.length} characters`, colors.cyan);

        // チャンク化
        const chunks = chunkText(content);
        log(`  ✂️  Created ${chunks.length} chunks`, colors.cyan);

        // 各チャンクの埋め込みベクトルを生成
        const processedChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            process.stdout.write(`  🔄 Processing chunk ${i + 1}/${chunks.length}...`);

            const embedding = await generateEmbedding(chunk.text, genAI);

            processedChunks.push({
                id: `${fileName}_chunk_${i}`,
                text: chunk.text,
                startIndex: chunk.startIndex,
                endIndex: chunk.endIndex,
                embedding: embedding,
                metadata: {
                    source: fileName,
                    chunkIndex: i,
                    totalChunks: chunks.length,
                    processedAt: new Date().toISOString()
                }
            });

            process.stdout.write(` ${colors.green}✅${colors.reset}\n`);

            // API制限を考慮して少し待機
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // RAG処理済みJSONを作成
        const ragData = {
            source: fileName,
            originalPath: filePath,
            totalChunks: processedChunks.length,
            totalCharacters: content.length,
            processedAt: new Date().toISOString(),
            chunks: processedChunks,
            metadata: {
                chunkSize: CHUNK_SIZE,
                chunkOverlap: CHUNK_OVERLAP,
                embeddingModel: 'embedding-001'
            }
        };

        return ragData;

    } catch (error) {
        log(`  ❌ Failed to process file: ${error.message}`, colors.red);
        return null;
    }
}

/**
 * RAG JSONファイルを保存
 */
async function saveRagJson(ragData, outputPath) {
    try {
        // ディレクトリを作成
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // JSONファイルとして保存
        await fs.writeFile(
            outputPath,
            JSON.stringify(ragData, null, 2),
            'utf-8'
        );

        log(`  💾 Saved: ${path.basename(outputPath)}`, colors.green);

        return outputPath;

    } catch (error) {
        log(`  ❌ Failed to save: ${error.message}`, colors.red);
        return null;
    }
}

/**
 * GCSにアップロード
 */
async function uploadToGCS(ragData, fileName) {
    try {
        const jsonBuffer = Buffer.from(JSON.stringify(ragData, null, 2), 'utf-8');
        const gcsPath = `processed/${fileName}`;

        await uploadBufferToGCS(jsonBuffer, gcsPath, 'application/json');

        log(`  ☁️  Uploaded to GCS: ${gcsPath}`, colors.green);

        return true;

    } catch (error) {
        log(`  ⚠️  GCS upload failed: ${error.message}`, colors.yellow);
        return false;
    }
}

/**
 * ローカルフォルダからファイルを取得
 */
async function getLocalFiles(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            if (entry.isFile() && (entry.name.endsWith('.txt') || entry.name.endsWith('.md'))) {
                files.push({
                    name: entry.name,
                    path: path.join(dirPath, entry.name)
                });
            }
        }

        return files;

    } catch (error) {
        log(`  ❌ Failed to read directory: ${error.message}`, colors.red);
        return [];
    }
}

/**
 * GCSからファイルを取得
 */
async function getGCSFiles() {
    try {
        const files = await listFilesInGCS('manuals/');
        return files
            .filter(f => f.name.endsWith('.txt') || f.name.endsWith('.md'))
            .map(f => ({
                name: path.basename(f.name),
                gcsPath: f.name
            }));
    } catch (error) {
        log(`  ❌ Failed to list GCS files: ${error.message}`, colors.red);
        return [];
    }
}

/**
 * メイン処理
 */
async function main() {
    log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
    log('║  Knowledge Base RAG Processing Tool                  ║', colors.blue);
    log('║  マニュアルデータをチャンク化＋RAG処理               ║', colors.blue);
    log('╚═══════════════════════════════════════════════════════╝', colors.blue);

    // Gemini API初期化
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
        log('\n❌ Error: GOOGLE_GEMINI_API_KEY is not set', colors.red);
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    log('\n✅ Gemini API initialized', colors.green);

    // ファイル取得
    let files = [];

    if (STORAGE_MODE === 'gcs') {
        log('\n📦 Fetching files from GCS...', colors.blue);
        files = await getGCSFiles();
    } else {
        log('\n📁 Fetching files from local storage...', colors.blue);
        files = await getLocalFiles(MANUALS_PATH);
    }

    if (files.length === 0) {
        log('\n⚠️  No files found to process', colors.yellow);
        process.exit(0);
    }

    log(`\n📊 Found ${files.length} files to process`, colors.cyan);

    // 統計情報
    const stats = {
        processed: 0,
        failed: 0,
        totalChunks: 0
    };

    // 各ファイルを処理
    for (const file of files) {
        let content;
        let filePath;

        // ファイル読み込み
        if (STORAGE_MODE === 'gcs') {
            const buffer = await downloadFromGCS(file.gcsPath);
            content = buffer.toString('utf-8');
            filePath = file.gcsPath;

            // 一時ファイルとして保存
            const tempPath = path.join(KNOWLEDGE_BASE_PATH, 'temp', file.name);
            await fs.mkdir(path.dirname(tempPath), { recursive: true });
            await fs.writeFile(tempPath, content, 'utf-8');
            filePath = tempPath;
        } else {
            filePath = file.path;
        }

        // RAG処理
        const ragData = await processFile(filePath, file.name, genAI);

        if (ragData) {
            // ローカルに保存
            const outputFileName = `${path.parse(file.name).name}_rag.json`;
            const outputPath = path.join(PROCESSED_PATH, outputFileName);

            const saved = await saveRagJson(ragData, outputPath);

            if (saved) {
                stats.processed++;
                stats.totalChunks += ragData.totalChunks;

                // GCSにもアップロード
                if (STORAGE_MODE === 'gcs') {
                    await uploadToGCS(ragData, outputFileName);
                }
            } else {
                stats.failed++;
            }
        } else {
            stats.failed++;
        }
    }

    // サマリー表示
    log('\n╔═══════════════════════════════════════════════════════╗', colors.blue);
    log('║  Processing Summary                                   ║', colors.blue);
    log('╚═══════════════════════════════════════════════════════╝', colors.blue);
    log(`  ✅ Processed: ${stats.processed} files`, colors.green);
    log(`  ❌ Failed: ${stats.failed} files`, stats.failed > 0 ? colors.red : colors.green);
    log(`  📦 Total chunks: ${stats.totalChunks}`, colors.cyan);
    log(`\n  💾 Output directory: ${PROCESSED_PATH}`, colors.cyan);

    if (STORAGE_MODE === 'gcs') {
        log(`  ☁️  GCS path: processed/`, colors.cyan);
    }

    if (stats.failed === 0) {
        log('\n🎉 Processing completed successfully!', colors.green);
    } else {
        log('\n⚠️  Processing completed with errors', colors.yellow);
    }
}

// 実行
main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
