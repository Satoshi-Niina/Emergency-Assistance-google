import helmet from 'helmet';

// Azure BLOB Storageは使用しないため、GCS用のURLを設定
// Google Cloud Storageは認証付きURLを使用するため、CSPで特定のURLを許可する必要なし
const storageUrl = "https://storage.googleapis.com";

export const helmetConfig = {
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        storageUrl
      ],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": ["'self'", storageUrl],
    },
  },
};

export const createSecurityMiddleware = () => helmet(helmetConfig);
