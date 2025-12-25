/**
 * ナレッジベース検索ライブラリ
 * 全フォルダから関連ファイルを検索してGeminiに渡す
 */

import { listFiles, downloadFile } from './storage.mjs';
import * as fs from 'fs';
import * as path from 'path';

// 検索対象フォルダ（優先度順）
// ローカル・本番共通でシンプルに
const SEARCH_FOLDERS = [
  'manuals/',                 // マニュアル（最優先）
  'troubleshooting/flows/',   // 応急処置フローJSON
  'troubleshooting/images/',  // フロー画像
  'chat-history/sessions/',   // チャット履歴JSON
];

/**
 * キーワードに基づいてナレッジベース全体を検索
 * @param {string} query - 検索キーワード
 * @param {object} options - 検索オプション
 * @returns {Promise<Array>} 関連ファイルのリスト
 */
export async function searchKnowledgeBase(query, options = {}) {
  const {
    maxResults = 5,
    machineTag = null,
    folders = SEARCH_FOLDERS,
  } = options;

  console.log('[searchKnowledgeBase] Searching for:', query, {
    maxResults,
    machineTag,
    folders: folders.length,
  });

  const results = [];
  const queryLower = query.toLowerCase();

  try {
    // 各フォルダから検索
    for (const folder of folders) {
      try {
        const files = await listFiles(folder);
        
        for (const file of files) {
          // .gitkeepやREADME.mdはスキップ
          if (file.name === '.gitkeep' || file.name === 'README.md') continue;

          const fileName = file.name.toLowerCase();
          let score = 0;

          // ファイル名にキーワードが含まれるか
          if (fileName.includes(queryLower)) {
            score += 10;
          }

          // 機種タグが一致するか
          if (machineTag && fileName.includes(`[${machineTag.toLowerCase()}]`)) {
            score += 20;
          }

          // キーワードを分解して部分一致
          const keywords = queryLower.split(/\s+/);
          keywords.forEach(keyword => {
            if (fileName.includes(keyword)) {
              score += 5;
            }
          });

          if (score > 0) {
            results.push({
              path: file.path,
              name: file.name,
              folder: folder,
              score: score,
              size: file.size,
              modified: file.modified,
            });
          }
        }
      } catch (err) {
        console.warn(`[searchKnowledgeBase] Error reading folder ${folder}:`, err.message);
      }
    }

    // スコアでソート
    results.sort((a, b) => b.score - a.score);

    // 上位N件を返す
    return results.slice(0, maxResults);

  } catch (error) {
    console.error('[searchKnowledgeBase] Search error:', error);
    return [];
  }
}

/**
 * 検索結果のファイル内容を読み込んでGemini用プロンプトを生成
 * @param {Array} searchResults - searchKnowledgeBaseの結果
 * @returns {Promise<string>} Gemini用の統合プロンプト
 */
export async function buildKnowledgePrompt(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return '';
  }

  let prompt = '\n\n【参考資料】\n';

  for (const result of searchResults) {
    try {
      // ファイル内容を読み込み
      const content = await downloadFile(result.path);
      
      // テキスト形式に変換（バイナリの場合はスキップ）
      let textContent = '';
      if (Buffer.isBuffer(content)) {
        textContent = content.toString('utf-8');
      } else {
        textContent = String(content);
      }

      // 長すぎる場合は最初の5000文字のみ
      if (textContent.length > 5000) {
        textContent = textContent.substring(0, 5000) + '\n...(省略)...';
      }

      prompt += `\n■ ${result.name}（${result.folder}）\n`;
      prompt += `${textContent}\n`;
      prompt += `\n${'='.repeat(50)}\n`;

    } catch (err) {
      console.warn(`[buildKnowledgePrompt] Error reading ${result.path}:`, err.message);
    }
  }

  return prompt;
}

/**
 * 全フォルダの統計情報を取得
 * @returns {Promise<object>} フォルダ別のファイル数とサイズ
 */
export async function getKnowledgeBaseStats() {
  const stats = {};

  for (const folder of SEARCH_FOLDERS) {
    try {
      const files = await listFiles(folder);
      const validFiles = files.filter(f => f.name !== '.gitkeep' && f.name !== 'README.md');
      
      stats[folder] = {
        totalFiles: validFiles.length,
        totalSize: validFiles.reduce((sum, f) => sum + (f.size || 0), 0),
      };
    } catch (err) {
      stats[folder] = {
        totalFiles: 0,
        totalSize: 0,
        error: err.message,
      };
    }
  }

  return stats;
}

/**
 * 特定のフォルダ内の全ファイルを一覧表示
 * @param {string} folder - フォルダパス
 * @returns {Promise<Array>} ファイル一覧
 */
export async function listFolderContents(folder) {
  try {
    const files = await listFiles(folder);
    return files.filter(f => f.name !== '.gitkeep' && f.name !== 'README.md');
  } catch (error) {
    console.error(`[listFolderContents] Error reading ${folder}:`, error);
    return [];
  }
}
