// 統一APIクライアント - シンプル版
// ローカル開発・本番環境対応

// 環境判定
const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

// APIベースURL決定
const getApiBaseUrl = (): string => {
    // window.runtimeConfigが設定されている場合は最優先
    if (typeof window !== 'undefined' && (window as any).runtimeConfig?.API_BASE_URL) {
        return (window as any).runtimeConfig.API_BASE_URL;
    }

    // 環境変数が設定されていて、本番環境の場合のみ使用
    if (isProduction && import.meta.env.VITE_API_BASE_URL) {
        return import.meta.env.VITE_API_BASE_URL;
    }

    // 開発・その他では相対パス（統合サーバーを使用）
    return '';
};

// API URL構築
export const buildApiUrl = (path: string): string => {
    // パスの正規化（先頭の/を確保）
    let cleanPath = path.startsWith('/') ? path : `/${path}`;

    // /api/ で始まっている場合は /api を除去
    if (cleanPath.startsWith('/api/')) {
        cleanPath = cleanPath.substring(4);
    }

    const apiBaseUrl = getApiBaseUrl();

    if (apiBaseUrl) {
        const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, '');

        if (normalizedBaseUrl.endsWith('/api')) {
            return `${normalizedBaseUrl}${cleanPath}`;
        } else {
            return `${normalizedBaseUrl}/api${cleanPath}`;
        }
    } else {
        // 開発環境: 相対パス（Viteプロキシが /api を http://localhost:8080 に転送）
        return `/api${cleanPath}`;
    }
};

// 認証トークン取得
const getAuthToken = (): string | null => {
    return localStorage.getItem('authToken');
};

// 統一APIリクエスト関数
export const apiRequest = async <T = any>(
    path: string,
    options: RequestInit = {}
): Promise<T> => {
    const url = buildApiUrl(path);
    const token = getAuthToken();

    const config: RequestInit = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        },
        credentials: 'include',
        mode: 'cors',
    };

    try {
        const response = await fetch(url, config);

        if (!response.ok) {
            let errorMessage = `API Error ${response.status}: ${response.statusText}`;
            try {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error || errorData.message || errorMessage;
                } catch {
                    errorMessage = errorText || errorMessage;
                }
            } catch {
                // エラーレスポンスの読み取りに失敗
            }

            if (response.status === 401) {
                localStorage.removeItem('authToken');
                throw new Error('AUTHENTICATION_ERROR');
            }

            throw new Error(errorMessage);
        }

        const data = await response.json();

        // サーバーがsuccess: falseを返している場合
        if (data && typeof data === 'object' && 'success' in data && data.success === false) {
            const errorMessage = data.error || data.message || 'Unknown error';
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        // ネットワーク未解決等で失敗した場合のフォールバック（本番のみ）
        try {
            const base = getApiBaseUrl();
            if (base && error instanceof TypeError) {
                let cleanPath = path.startsWith('/') ? path : `/${path}`;
                if (cleanPath.startsWith('/api/')) {
                    cleanPath = cleanPath.substring(4);
                }
                const fallbackUrl = `/api${cleanPath}`;
                const retryResponse = await fetch(fallbackUrl, config);
                if (retryResponse.ok) {
                    return await retryResponse.json();
                }
            }
        } catch {
            // フォールバックも失敗
        }
        throw error;
    }
};

// HTTPメソッドヘルパー
export const api = {
    get: <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' }),
    post: <T = any>(path: string, data?: any) =>
        apiRequest<T>(path, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined
        }),
    put: <T = any>(path: string, data?: any) =>
        apiRequest<T>(path, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined
        }),
    delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

// 認証関連API
export const authApi = {
    login: (credentials: { username: string; password: string }) =>
        api.post('/auth/login', credentials),
    logout: () => api.post('/auth/logout'),
    me: () => api.get('/auth/me'),
};

// 後方互換性のためのエイリアス
export const userApi = {
    get: <T = any>(path: string) => apiRequest<T>(path, { method: 'GET' }),
    post: <T = any>(path: string, data?: any) =>
        apiRequest<T>(path, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined
        }),
    put: <T = any>(path: string, data?: any) =>
        apiRequest<T>(path, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined
        }),
    delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
    login: (credentials: { username: string; password: string }) =>
        apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        }),
};

export const auth = {
    login: (credentials: { username: string; password: string }) =>
        userApi.post('/auth/login', credentials),
    logout: () => userApi.post('/auth/logout'),
    me: () => userApi.get('/auth/me'),
    getCurrentUser: () => userApi.get('/auth/me'),
    handshake: () => Promise.resolve({ valid: true }),
};

export const storage = {
    list: (prefix: string) => api.get(`/storage/list?prefix=${encodeURIComponent(prefix)}`),
    getJson: (name: string) => api.get(`/storage/json/${encodeURIComponent(name)}`),
    putJson: (name: string, data: any, etag?: string) => {
        const headers = etag ? { 'If-Match': etag } : {};
        return apiRequest(`/storage/json/${encodeURIComponent(name)}`, {
            method: 'PUT',
            body: JSON.stringify(data),
            headers
        });
    },
    getImageUrl: (name: string) => api.get(`/storage/image-url?name=${encodeURIComponent(name)}`),
};

// ヘルスチェック機能
export const health = {
    check: () => api.get('/health').then(() => true).catch(() => false),
};

export default api;
