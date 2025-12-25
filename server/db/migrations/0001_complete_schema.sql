-- 完全なスキーマ初期化マイグレーション
-- Google Gemini & PostgreSQL用
-- 作成日: 2025-12-23

-- pgvector拡張を有効化（RAG用）
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================================
-- ユーザー認証テーブル
-- ===================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- デフォルト管理者ユーザーを作成（パスワード: admin123）
-- bcrypt hash for "admin123"
INSERT INTO users (username, password, role) 
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ===================================
-- 機械マスターテーブル
-- ===================================
CREATE TABLE IF NOT EXISTS machines (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    machine_type TEXT,
    machine_number TEXT,
    office TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ===================================
-- 設定テーブル
-- ===================================
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- デフォルト設定
INSERT INTO settings (key, value, description) 
VALUES 
    ('gemini_model', 'gemini-pro', 'Google Gemini model name'),
    ('max_tokens', '2048', 'Maximum tokens for AI responses'),
    ('temperature', '0.7', 'AI response temperature')
ON CONFLICT (key) DO NOTHING;

-- ===================================
-- チャット履歴テーブル
-- ===================================
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);

-- ===================================
-- 故障履歴テーブル
-- ===================================
CREATE TABLE IF NOT EXISTS fault_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title TEXT NOT NULL,
    description TEXT,
    machine_type TEXT,
    machine_number TEXT,
    office TEXT,
    category TEXT,
    keywords JSONB,
    emergency_guide_title TEXT,
    emergency_guide_content TEXT,
    json_data JSONB NOT NULL,
    metadata JSONB,
    storage_mode TEXT NOT NULL DEFAULT 'database',
    file_path TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 故障履歴に関連する画像テーブル
CREATE TABLE IF NOT EXISTS fault_history_images (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    fault_history_id TEXT NOT NULL REFERENCES fault_history(id) ON DELETE CASCADE,
    original_file_name TEXT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    relative_path TEXT,
    mime_type TEXT,
    file_size INTEGER,
    description TEXT,
    image_data TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 故障履歴インデックス
CREATE INDEX IF NOT EXISTS idx_fault_history_machine_type ON fault_history(machine_type);
CREATE INDEX IF NOT EXISTS idx_fault_history_machine_number ON fault_history(machine_number);
CREATE INDEX IF NOT EXISTS idx_fault_history_category ON fault_history(category);
CREATE INDEX IF NOT EXISTS idx_fault_history_office ON fault_history(office);
CREATE INDEX IF NOT EXISTS idx_fault_history_created_at ON fault_history(created_at);
CREATE INDEX IF NOT EXISTS idx_fault_history_storage_mode ON fault_history(storage_mode);
CREATE INDEX IF NOT EXISTS idx_fault_history_keywords ON fault_history USING GIN (keywords);
CREATE INDEX IF NOT EXISTS idx_fault_history_json_data ON fault_history USING GIN (json_data);
CREATE INDEX IF NOT EXISTS idx_fault_history_images_fault_id ON fault_history_images(fault_history_id);
CREATE INDEX IF NOT EXISTS idx_fault_history_images_file_name ON fault_history_images(file_name);

-- ===================================
-- ナレッジベーステーブル（RAG用）
-- ===================================
CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    hash TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[],
    chunk_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Google Gemini embedding用ベクトルテーブル（768次元）
-- Gemini text-embedding-004は768次元
CREATE TABLE IF NOT EXISTS kb_vectors (
    chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
    embedding VECTOR(768) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tags ON chunks USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_kb_vectors_embedding ON kb_vectors USING ivfflat (embedding vector_cosine_ops);

-- ===================================
-- 更新日時自動更新トリガー
-- ===================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_machines_updated_at
    BEFORE UPDATE ON machines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fault_history_updated_at
    BEFORE UPDATE ON fault_history
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ===================================
-- テーブルコメント
-- ===================================
COMMENT ON TABLE users IS 'ユーザー認証テーブル';
COMMENT ON TABLE machines IS '機械マスターデータ';
COMMENT ON TABLE settings IS 'システム設定';
COMMENT ON TABLE chat_history IS 'AIチャット履歴';
COMMENT ON TABLE fault_history IS '故障履歴データ（JSON形式サポート）';
COMMENT ON TABLE fault_history_images IS '故障履歴添付画像';
COMMENT ON TABLE documents IS 'ナレッジベースドキュメント';
COMMENT ON TABLE chunks IS 'ドキュメントチャンク';
COMMENT ON TABLE kb_vectors IS 'Google Gemini用ベクトル埋め込み（768次元）';

-- スキーマ適用完了
SELECT 'Schema migration completed successfully!' AS status;
