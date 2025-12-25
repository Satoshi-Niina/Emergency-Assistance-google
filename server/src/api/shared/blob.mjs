// GCS専用ストレージシステム（Azure Blob削除済み）
// このファイルは後方互換性のためのみ残されています

// Azure関連の関数は削除済み - GCSは lib/storage.mjs を使用
export function getBlobServiceClient() {
  console.warn('Azure BLOB Storage is deprecated, use STORAGE_MODE=gcs with lib/storage.mjs');
  return null;
}

// パスを正規化する関数
export function norm(p) {
  return p.replace(/\\/g, '/');
}
