/**
 * Knowledge Base パス管理モジュール
 * 
 * ローカルとGCS環境の両方で一貫したパス管理を提供
 */

import path from 'path';

// 環境判定
export const isLocal = () => process.env.STORAGE_MODE === 'local';
export const isGCS = () => process.env.STORAGE_MODE === 'gcs';

// ベースパス
const getLocalBasePath = () => {
  return process.env.KNOWLEDGE_BASE_PATH || path.join(process.cwd(), 'knowledge-base');
};

const getGCSBasePath = () => {
  return ''; // GCSの場合はバケット名がベース
};

/**
 * 正規化されたknowledge-baseパス構造
 */
export const KB_PATHS = {
  // チャットエクスポート
  CHAT_EXPORTS: {
    JSON: 'chat-exports/json',
    IMAGES: 'chat-exports/images',
  },
  
  // トラブルシューティング（応急処置）
  TROUBLESHOOTING: {
    FLOWS: 'troubleshooting/flows',
    IMAGES: 'troubleshooting/images',
  },
  
  // AI学習データ
  AI_TRAINING: {
    MANUALS: 'ai-training/manuals',
    FAQS: 'ai-training/faqs',
    KNOWLEDGE: 'ai-training/knowledge',
  },
  
  // ベクトルデータ（RAG用）
  VECTORS: {
    EMBEDDINGS: 'vectors/embeddings',
    INDEXES: 'vectors/indexes',
  },
  
  // 一時ファイル
  TEMP: {
    UPLOADS: 'temp/uploads',
  },
  
  // バックアップ
  BACKUPS: 'backups',
};

/**
 * 相対パスから完全パスを生成
 * @param relativePath KB_PATHSからの相対パス
 * @param fileName オプションのファイル名
 * @returns 完全パス（ローカル）またはGCSパス
 */
export function resolveKBPath(relativePath: string, fileName?: string): string {
  if (isLocal()) {
    const basePath = getLocalBasePath();
    const fullPath = path.join(basePath, relativePath);
    return fileName ? path.join(fullPath, fileName) : fullPath;
  } else {
    // GCS: パスをそのまま返す（バケット名は別途指定）
    return fileName ? `${relativePath}/${fileName}` : relativePath;
  }
}

/**
 * チャットエクスポートJSON保存パス
 * @param fileName ファイル名（例: MC-300_100_uuid_timestamp.json）
 */
export function getChatExportJsonPath(fileName: string): string {
  return resolveKBPath(KB_PATHS.CHAT_EXPORTS.JSON, fileName);
}

/**
 * チャット画像保存パス
 * @param imageName 画像ファイル名（例: uuid_image1.png）
 */
export function getChatExportImagePath(imageName: string): string {
  return resolveKBPath(KB_PATHS.CHAT_EXPORTS.IMAGES, imageName);
}

/**
 * トラブルシューティングフローJSON保存パス
 * @param flowId フローID
 */
export function getTroubleshootingFlowPath(flowId: string): string {
  const fileName = flowId.endsWith('.json') ? flowId : `${flowId}.json`;
  return resolveKBPath(KB_PATHS.TROUBLESHOOTING.FLOWS, fileName);
}

/**
 * トラブルシューティング画像保存パス
 * @param flowId フローID
 * @param stepNumber ステップ番号（オプション）
 */
export function getTroubleshootingImagePath(flowId: string, stepNumber?: number): string {
  const imageName = stepNumber !== undefined 
    ? `${flowId}_step_${stepNumber}.png`
    : `${flowId}.png`;
  return resolveKBPath(KB_PATHS.TROUBLESHOOTING.IMAGES, imageName);
}

/**
 * AI学習用マニュアルパス
 * @param category カテゴリ名（例: machine-manual, safety-guide）
 * @param type 'original' | 'chunks' | 'metadata'
 */
export function getAITrainingManualPath(
  category: string, 
  type: 'original' | 'chunks' | 'metadata',
  fileName?: string
): string {
  const categoryPath = `${KB_PATHS.AI_TRAINING.MANUALS}/${category}`;
  
  if (type === 'original') {
    return fileName 
      ? resolveKBPath(`${categoryPath}/original`, fileName)
      : resolveKBPath(`${categoryPath}/original`);
  } else if (type === 'chunks') {
    return resolveKBPath(categoryPath, 'chunks.json');
  } else {
    return resolveKBPath(categoryPath, 'metadata.json');
  }
}

/**
 * AI学習用FAQパス
 * @param category カテゴリ名
 * @param type 'chunks' | 'metadata'
 */
export function getAITrainingFAQPath(
  category: string,
  type: 'chunks' | 'metadata'
): string {
  const categoryPath = `${KB_PATHS.AI_TRAINING.FAQS}/${category}`;
  const fileName = type === 'chunks' ? 'chunks.json' : 'metadata.json';
  return resolveKBPath(categoryPath, fileName);
}

/**
 * ベクトル埋め込みパス
 * @param documentId ドキュメントID
 */
export function getVectorEmbeddingPath(documentId: string): string {
  return resolveKBPath(KB_PATHS.VECTORS.EMBEDDINGS, `${documentId}_embeddings.json`);
}

/**
 * 一時アップロードパス
 * @param fileName ファイル名
 */
export function getTempUploadPath(fileName: string): string {
  return resolveKBPath(KB_PATHS.TEMP.UPLOADS, fileName);
}

/**
 * バックアップパス
 * @param date 日付（例: 2025-12-24）
 * @param fileName オプションのファイル名
 */
export function getBackupPath(date: string, fileName?: string): string {
  const datePath = `${KB_PATHS.BACKUPS}/${date}`;
  return fileName 
    ? resolveKBPath(datePath, fileName)
    : resolveKBPath(datePath);
}

/**
 * ディレクトリを取得（ファイル名部分を除く）
 * @param fullPath 完全パス
 */
export function getDirectory(fullPath: string): string {
  return isLocal() ? path.dirname(fullPath) : fullPath.substring(0, fullPath.lastIndexOf('/'));
}

/**
 * GCSバケット名取得
 */
export function getGCSBucketName(): string {
  return process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'emergency-knowledge-assets';
}

/**
 * すべてのチャットエクスポートJSONを取得するためのプレフィックス
 */
export function getChatExportJsonPrefix(): string {
  return KB_PATHS.CHAT_EXPORTS.JSON;
}

/**
 * すべてのチャット画像を取得するためのプレフィックス
 */
export function getChatExportImagePrefix(): string {
  return KB_PATHS.CHAT_EXPORTS.IMAGES;
}

/**
 * すべてのトラブルシューティングフローを取得するためのプレフィックス
 */
export function getTroubleshootingFlowPrefix(): string {
  return KB_PATHS.TROUBLESHOOTING.FLOWS;
}

/**
 * AI学習用マニュアルカテゴリ一覧を取得するためのプレフィックス
 */
export function getAITrainingManualPrefix(): string {
  return KB_PATHS.AI_TRAINING.MANUALS;
}

/**
 * 後方互換性のための旧パスから新パスへのマッピング
 */
export function migrateOldPath(oldPath: string): string {
  // 旧: knowledge-base/history/*.json → 新: chat-exports/json/*.json
  if (oldPath.includes('knowledge-base/history/') || oldPath.includes('knowledge-base/exports/')) {
    return oldPath.replace(/knowledge-base\/(history|exports)\//, KB_PATHS.CHAT_EXPORTS.JSON + '/');
  }
  
  // 旧: knowledge-base/images/chat-exports/*.png → 新: chat-exports/images/*.png
  if (oldPath.includes('knowledge-base/images/chat-exports/')) {
    return oldPath.replace('knowledge-base/images/chat-exports/', KB_PATHS.CHAT_EXPORTS.IMAGES + '/');
  }
  
  // 旧: knowledge-base/troubleshooting/*.json → 新: troubleshooting/flows/*.json
  if (oldPath.includes('knowledge-base/troubleshooting/')) {
    return oldPath.replace('knowledge-base/troubleshooting/', KB_PATHS.TROUBLESHOOTING.FLOWS + '/');
  }
  
  // 旧: knowledge-base/manuals/ → 新: ai-training/manuals/
  if (oldPath.includes('knowledge-base/manuals/')) {
    return oldPath.replace('knowledge-base/manuals/', KB_PATHS.AI_TRAINING.MANUALS + '/');
  }
  
  // マッチしない場合はそのまま返す
  return oldPath;
}

export default {
  isLocal,
  isGCS,
  KB_PATHS,
  resolveKBPath,
  getChatExportJsonPath,
  getChatExportImagePath,
  getTroubleshootingFlowPath,
  getTroubleshootingImagePath,
  getAITrainingManualPath,
  getAITrainingFAQPath,
  getVectorEmbeddingPath,
  getTempUploadPath,
  getBackupPath,
  getDirectory,
  getGCSBucketName,
  getChatExportJsonPrefix,
  getChatExportImagePrefix,
  getTroubleshootingFlowPrefix,
  getAITrainingManualPrefix,
  migrateOldPath,
};
