import { z } from 'zod';
// 認証関連のバリデーションスキーマ
export const loginSchema: any = z.object({
  username: z.string().min(1, 'ユーザー名は必須です'),
  password: z.string().min(1, 'パスワードは必須です'),
});
export const insertUserSchema: any = z.object({
  username: z
    .string()
    .min(1, 'ユーザー名は必須です')
    .max(50, 'ユーザー名は50文字以内で入力してください'),
  password: z.string().min(6, 'パスワードは6文字以上で入力してください'),
  display_name: z
    .string()
    .min(1, '表示名は必須です')
    .max(100, '表示名は100文字以内で入力してください'),
  role: z.enum(['admin', 'employee', 'manager']).default('employee'),
  department: z.string().optional(),
});
export const updateUserSchema: any = insertUserSchema
  .partial()
  .omit({ password: true });
// チャット関連のバリデーションスキーマ
export const insertChatSchema: any = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'ユーザーIDは必須です'),
  title: z
    .string()
    .max(200, 'タイトルは200文字以内で入力してください')
    .optional(),
});
export const insertMessageSchema: any = z.object({
  chatId: z.string().min(1, 'チャットIDは必須です'),
  content: z.string().min(1, 'メッセージ内容は必須です'),
  isAiResponse: z.boolean().default(false),
  senderId: z.string().nullable(),
});
export const updateMessageSchema: any = insertMessageSchema.partial();
// メディア関連のバリデーションスキーマ
export const insertMediaSchema: any = z.object({
  messageId: z.string().min(1, 'メッセージIDは必須です'),
  type: z.enum(['image', 'video', 'audio', 'document']),
  url: z.string().url('有効なURLを入力してください'),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
});
// ドキュメント関連のバリデーションスキーマ
export const insertDocumentSchema: any = z.object({
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(200, 'タイトルは200文字以内で入力してください'),
  content: z.string().min(1, '内容は必須です'),
  userId: z.string().min(1, 'ユーザーIDは必須です'),
});
export const updateDocumentSchema: any = insertDocumentSchema.partial();
// キーワード関連のバリデーションスキーマ
export const insertKeywordSchema: any = z.object({
  documentId: z.string().optional(),
  word: z
    .string()
    .min(1, 'キーワードは必須です')
    .max(100, 'キーワードは100文字以内で入力してください'),
});
// 緊急フロー関連のバリデーションスキーマ
export const emergencyFlowStepSchema: any = z.object({
  id: z.string().min(1, 'ステップIDは必須です'),
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(200, 'タイトルは200文字以内で入力してください'),
  description: z
    .string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional(),
  type: z.enum(['action', 'decision', 'end']),
  nextStepId: z.string().optional(),
  conditions: z
    .array(
      z.object({
        condition: z.string().min(1, '条件は必須です'),
        nextStepId: z.string().min(1, '次のステップIDは必須です'),
      })
    )
    .optional(),
  actions: z.array(z.string()).optional(),
  imageUrl: z.string().url('有効なURLを入力してください').optional(),
});
export const insertEmergencyFlowSchema: any = z.object({
  title: z
    .string()
    .min(1, 'タイトルは必須です')
    .max(200, 'タイトルは200文字以内で入力してください'),
  description: z
    .string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional(),
  steps: z
    .array(emergencyFlowStepSchema)
    .min(1, '少なくとも1つのステップが必要です'),
  keyword: z
    .string()
    .min(1, 'キーワードは必須です')
    .max(100, 'キーワードは100文字以内で入力してください'),
  category: z
    .string()
    .max(100, 'カテゴリは100文字以内で入力してください')
    .default(''),
});
export const updateEmergencyFlowSchema: any =
  insertEmergencyFlowSchema.partial();
// 画像関連のバリデーションスキーマ
export const insertImageSchema: any = z.object({
  url: z.string().url('有効なURLを入力してください'),
  description: z
    .string()
    .min(1, '説明は必須です')
    .max(500, '説明は500文字以内で入力してください'),
  embedding: z.array(z.number()).min(1, '埋め込みベクトルは必須です'),
});
// チャットエクスポート関連のバリデーションスキーマ
export const insertChatExportSchema: any = z.object({
  chatId: z.string().min(1, 'チャットIDは必須です'),
  userId: z.string().min(1, 'ユーザーIDは必須です'),
});
// 検索関連のバリデーションスキーマ
export const searchQuerySchema: any = z.object({
  query: z
    .string()
    .min(1, '検索クエリは必須です')
    .max(500, '検索クエリは500文字以内で入力してください'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  type: z
    .enum(['all', 'documents', 'troubleshooting', 'images'])
    .default('all'),
});
// ファイルアップロード関連のバリデーションスキーマ（ブラウザ環境でのみ使用）
export const fileUploadSchema: any = z.object({
  file: z.any().refine((file: any) => {
    // ブラウザ環境でのみFile型をチェック
    if (typeof window !== 'undefined' && file instanceof File) {
      return file.size <= 10 * 1024 * 1024; // 10MB制限
    }
    return true;
  }, 'ファイルサイズは10MB以下にしてください'),
  type: z.enum(['image', 'document', 'video', 'audio']),
  description: z
    .string()
    .max(500, '説明は500文字以内で入力してください')
    .optional(),
});
// システム設定関連のバリデーションスキーマ
export const systemConfigSchema: any = z.object({
  version: z.string(),
  environment: z.enum(['development', 'production', 'staging']),
  features: z.object({
    chat: z.boolean(),
    emergencyGuide: z.boolean(),
    troubleshooting: z.boolean(),
    knowledgeBase: z.boolean(),
    voiceAssistant: z.boolean(),
  }),
  limits: z.object({
    maxFileSize: z.number(),
    maxUploadFiles: z.number(),
    maxChatHistory: z.number(),
  }),
});
