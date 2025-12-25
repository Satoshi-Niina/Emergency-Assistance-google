import { apiRequest } from '../api';

// 敁Eー履歴の型定義
export interface FaultHistoryItem {
  id: string;
  title: string;
  description?: string;
  machineType?: string;
  machineNumber?: string;
  office?: string;
  category?: string;
  keywords?: string[];
  emergencyGuideTitle?: string;
  emergencyGuideContent?: string;
  jsonData: any;
  storageMode: 'database' | 'file';
  filePath?: string;
  createdAt: string;
  updatedAt: string;
  images?: FaultHistoryImage[];
}

export interface FaultHistoryImage {
  id: string;
  faultHistoryId: string;
  originalFileName?: string;
  fileName: string;
  filePath: string;
  relativePath?: string;
  mimeType?: string;
  fileSize?: string;
  description?: string;
  createdAt: string;
  url?: string; // GCSの直接URLがある場合
}

export interface FaultHistoryCreateData {
  jsonData: any;
  title?: string;
  description?: string;
  extractImages?: boolean;
}

export interface FaultHistorySearchFilters {
  machineType?: string;
  machineNumber?: string;
  category?: string;
  office?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
}

export interface FaultHistoryListResponse {
  success: boolean;
  data: FaultHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface FaultHistoryStats {
  total: number;
  byMachineType: Record<string, number>;
  byCategory: Record<string, number>;
  byOffice: Record<string, number>;
  recentCount: number;
}

/**
 * 敁Eー履歴を保孁E
 */
export const saveFaultHistory = async (
  data: FaultHistoryCreateData
): Promise<{ id: string; imagePaths?: string[]; imageCount: number }> => {
  const formData = new FormData();

  formData.append('jsonData', JSON.stringify(data.jsonData));

  if (data.title) {
    formData.append('title', data.title);
  }

  if (data.description) {
    formData.append('description', data.description);
  }

  formData.append('extractImages', data.extractImages !== false ? 'true' : 'false');

  const response = await apiRequest('/fault-history', {
    method: 'POST',
    body: formData,
  });

  if (!response.success) {
    throw new Error(response.error || '敁Eー履歴の保存に失敗しました');
  }

  return {
    id: response.id,
    imagePaths: response.imagePaths,
    imageCount: response.imageCount,
  };
};

/**
 * 敁Eー履歴一覧を取征E
 */
export const fetchFaultHistoryList = async (
  filters: FaultHistorySearchFilters = {}
): Promise<FaultHistoryListResponse> => {
  const params = new URLSearchParams();

  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());
  if (filters.machineType) params.append('machineType', filters.machineType);
  if (filters.machineNumber) params.append('machineNumber', filters.machineNumber);
  if (filters.category) params.append('category', filters.category);
  if (filters.office) params.append('office', filters.office);
  if (filters.keyword) params.append('keyword', filters.keyword);

  const response = await apiRequest(`/fault-history?${params.toString()}`);

  if (!response.success) {
    throw new Error(response.error || '敁Eー履歴の取得に失敗しました');
  }

  return response;
};

/**
 * 敁Eー履歴詳細を取征E
 */
export const fetchFaultHistoryDetail = async (id: string): Promise<FaultHistoryItem> => {
  const response = await apiRequest(`/fault-history/${id}`);

  if (!response.success) {
    throw new Error(response.error || '敁Eー履歴の取得に失敗しました');
  }

  return response.data;
};

/**
 * 敁Eー履歴統計を取征E
 */
export const fetchFaultHistoryStats = async (): Promise<FaultHistoryStats> => {
  const response = await apiRequest('/fault-history/stats');

  if (!response.success) {
    throw new Error(response.error || '統計情報の取得に失敗しました');
  }

  return response.data;
};

/**
 * 既存�EexportティングEーレクトリかティングE�Eタベ�Eスに移衁E
 */
export const importFromExports = async (force = false): Promise<{
  imported: number;
  skipped: number;
  errors?: string[];
  totalFiles: number;
}> => {
  const response = await apiRequest('/fault-history/import-from-exports', {
    method: 'POST',
    body: JSON.stringify({ force }),
  });

  if (!response.success) {
    throw new Error(response.error || '移行に失敗しました');
  }

  return {
    imported: response.imported,
    skipped: response.skipped,
    errors: response.errors,
    totalFiles: response.totalFiles,
  };
};

/**
 * 故障履歴画像のURLを生成
 * @param filenameOrImage ファイル名（chat-exports/images/... 形式）、または FaultHistoryImage オブジェクト
 */
export const getFaultHistoryImageUrl = (filenameOrImage: string | FaultHistoryImage): string => {
  // FaultHistoryImageオブジェクトの場合
  if (typeof filenameOrImage === 'object') {
    // GCSの直接URLがある場合はそれを優先使用
    if (filenameOrImage.filePath && filenameOrImage.filePath.startsWith('https://storage.googleapis.com/')) {
      return filenameOrImage.filePath;
    }
    // relativePath（storage path）がある場合
    if (filenameOrImage.relativePath) {
      return getImageUrlFromPath(filenameOrImage.relativePath);
    }
    // fileNameを使用
    return getImageUrlFromPath(filenameOrImage.fileName);
  }

  // 文字列の場合
  return getImageUrlFromPath(filenameOrImage);
};

/**
 * 画像パスからAPIのURLを生成
 */
function getImageUrlFromPath(imagePath: string): string {
  const baseUrl = import.meta.env.DEV
    ? ''
    : import.meta.env.VITE_API_BASE_URL || window.location.origin;

  // GCSの直接URLの場合はそのまま返す
  if (imagePath.startsWith('https://storage.googleapis.com/')) {
    return imagePath;
  }

  // chat-exports/images/ で始まる場合はそのパスを使用
  let path = imagePath;
  if (imagePath.startsWith('chat-exports/images/')) {
    path = imagePath.replace('chat-exports/images/', '');
  }

  return `${baseUrl}/api/fault-history/images/${path}`;
}

/**
 * チャティングーエクスポ�Eトデータから敁Eー履歴を�E動保孁E
 */
export const saveFromChatExport = async (
  exportData: any,
  options: {
    title?: string;
    description?: string;
  } = {}
): Promise<{ id: string; imagePaths?: string[]; imageCount: number }> => {
  // エクスポ�Eトデータから基本惁Eーを抽出
  const title = options.title ||
    exportData.title ||
    exportData.metadata?.title ||
    '敁Eー対応履歴';

  const description = options.description ||
    exportData.description ||
    exportData.metadata?.description ||
    `チャティングーエクスポ�Eトから�E動保孁E ${new Date().toLocaleString()}`;

  return await saveFaultHistory({
    jsonData: exportData,
    title,
    description,
    extractImages: true,
  });
};

/**
 * 敁Eー履歴を削除�E�忁Eーに応じて実裁EーE
 */
export const deleteFaultHistory = async (id: string): Promise<void> => {
  const response = await apiRequest(`/fault-history/${id}`, {
    method: 'DELETE',
  });

  if (!response.success) {
    throw new Error(response.error || '敁Eー履歴の削除に失敗しました');
  }
};
