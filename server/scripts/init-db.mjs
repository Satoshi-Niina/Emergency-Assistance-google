// ローカル開発用SQLiteデータベース初期化スクリプト
import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// データベースファイルのパス
const dbPath = path.resolve(__dirname, '../dev.db');

console.log('📦 SQLiteデータベースを初期化します...');
console.log('   データベースパス:', dbPath);

// 既存のデータベースファイルを削除（オプション）
if (fs.existsSync(dbPath)) {
  console.log('   ⚠️  既存のデータベースファイルを削除します');
  fs.unlinkSync(dbPath);
}

// データベースを作成
const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // パフォーマンス向上

console.log('   ✅ データベースファイルを作成しました');

// usersテーブルを作成
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);
console.log('   ✅ usersテーブルを作成しました');

// 機械情報テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_name TEXT NOT NULL,
    machine_type TEXT,
    location TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);
console.log('   ✅ machinesテーブルを作成しました');

// 故障履歴テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS fault_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_id INTEGER,
    fault_type TEXT,
    description TEXT,
    severity TEXT,
    status TEXT DEFAULT 'open',
    reported_by TEXT,
    reported_at TEXT DEFAULT (datetime('now', 'localtime')),
    resolved_at TEXT,
    notes TEXT,
    FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE
  );
`);
console.log('   ✅ fault_historyテーブルを作成しました');

// チャット履歴テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT NOT NULL,
    role TEXT CHECK(role IN ('user', 'assistant', 'system')),
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    metadata TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);
console.log('   ✅ chat_historyテーブルを作成しました');

// ナレッジベーステーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_base (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);
console.log('   ✅ knowledge_baseテーブルを作成しました');

// 設定テーブル
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );
`);
console.log('   ✅ settingsテーブルを作成しました');

// デフォルト管理者ユーザーを作成
// パスワード: admin123 (bcryptでハッシュ化)
const bcrypt = await import('bcryptjs');
const defaultPassword = await bcrypt.hash('admin123', 10);

const insertAdmin = db.prepare(`
  INSERT OR IGNORE INTO users (username, password, role)
  VALUES (?, ?, ?)
`);

insertAdmin.run('admin', defaultPassword, 'admin');
console.log('   ✅ デフォルト管理者ユーザーを作成しました');
console.log('      ユーザー名: admin');
console.log('      パスワード: admin123');

// デフォルト設定を追加
const insertSetting = db.prepare(`
  INSERT OR IGNORE INTO settings (key, value, description)
  VALUES (?, ?, ?)
`);

insertSetting.run('app_name', 'Emergency Assistance System', 'アプリケーション名');
insertSetting.run('version', '1.0.0', 'アプリケーションバージョン');
console.log('   ✅ デフォルト設定を追加しました');

db.close();

console.log('');
console.log('✅ データベース初期化が完了しました!');
console.log('');
console.log('📝 接続情報:');
console.log('   DATABASE_URL=file:./dev.db');
console.log('');
console.log('👤 管理者アカウント:');
console.log('   ユーザー名: admin');
console.log('   パスワード: admin123');
console.log('');
