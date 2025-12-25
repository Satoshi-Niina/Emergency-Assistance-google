import { z } from 'zod';

export type User = {
  id: string;
  username: string;
  displayName: string;
  role: 'employee' | 'operator' | 'admin';
  department?: string;
};

// ログインスキーマの定義
export const loginSchema = z.object({
  username: z.string().min(1, 'ユーザー名を入力してください'),
  password: z.string().min(1, 'パスワードを入力してください'),
});

// 他のスキーマや型定義があればここに追加
