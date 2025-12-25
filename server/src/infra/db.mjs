import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import { DATABASE_URL, PG_SSL, DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_DISPLAY_NAME } from '../config/env.mjs';

export let dbPool = null;

export function getDbPool() {
  return dbPool;
}

export function initializeDatabase() {
  if (!DATABASE_URL) {
    console.error('[DB] ⚠️ ERROR: DATABASE_URL is not set. Database functionality will not work.');
    console.error('[DB] Please set DATABASE_URL in your .env file');
    return false;
  }

  try {
    const sslConfig = PG_SSL === 'require'
      ? { rejectUnauthorized: false }
      : PG_SSL === 'disable'
        ? false
        : { rejectUnauthorized: false };

    dbPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: sslConfig,
      max: 20,                    // 最大接続数を増やしてパフォーマンス向上
      min: 5,                     // 最小接続数を増やして常に利用可能に
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,  // 接続タイムアウトを延長
      query_timeout: 30000,
      statement_timeout: 30000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      allowExitOnIdle: false,
      options: '-c search_path=public,master_data',  // デフォルトスキーマをpublicに設定
    });

    console.log('[DB] ✅ Pool initialized with enhanced configuration');
    console.log('[DB] Max connections: 20, Min connections: 5');
    
    // Warmup with retry
    const attemptConnection = async (retries = 3) => {
      for (let i = 1; i <= retries; i++) {
        try {
          const client = await dbPool.connect();
          console.log('[DB] ✅ Connection test successful');
          await client.query('SELECT NOW()');
          console.log('[DB] ✅ Database query test successful');
          client.release();
          return true;
        } catch (err) {
          console.error(`[DB] ❌ Connection test failed (attempt ${i}/${retries}):`, err.message);
          if (i < retries) {
            console.log(`[DB] Retrying in ${i * 2} seconds...`);
            await new Promise(resolve => setTimeout(resolve, i * 2000));
          }
        }
      }
      console.error('[DB] ⚠️ Failed to establish database connection after', retries, 'attempts');
      return false;
    };

    attemptConnection(3);

    // エラーハンドラーを追加
    dbPool.on('error', (err) => {
      console.error('[DB] ⚠️ Unexpected pool error:', err);
      console.error('[DB] Pool will attempt to recover automatically');
    });

    dbPool.on('connect', () => {
      console.log('[DB] ✅ New client connected to pool');
    });

    dbPool.on('remove', () => {
      console.log('[DB] ⚠️ Client removed from pool');
    });

    return true;
  } catch (error) {
    console.error('[DB] ❌ Initialization failed:', error);
    console.error('[DB] Please check your DATABASE_URL and PostgreSQL server status');
    return false;
  }
}

export async function dbQuery(sql, params = [], retries = 3) {
  if (!dbPool) {
    const error = new Error('Database connection not initialized. Please check DATABASE_URL configuration.');
    console.error('[DB] ❌', error.message);
    throw error;
  }

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let client;
    try {
      // 接続タイムアウトを設定
      const connectPromise = dbPool.connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
      );

      client = await Promise.race([connectPromise, timeoutPromise]);
      
      // SQL実行
      const result = await client.query(sql, params);
      
      // 成功時のログ（詳細モード）
      if (attempt > 1) {
        console.log(`[DB] ✅ Query succeeded on attempt ${attempt}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      console.error(`[DB] ❌ Query attempt ${attempt}/${retries} failed:`, {
        error: error.message,
        code: error.code,
        sqlState: error.sqlState,
        isTimeout: error.message.includes('timeout'),
        isConnection: error.message.includes('connect')
      });

      // リトライ可能なエラーかどうか判定
      const isRetryable = error.message.includes('timeout') || 
                         error.message.includes('connect') ||
                         error.code === 'ECONNRESET' ||
                         error.code === 'ETIMEDOUT';

      if (attempt < retries && isRetryable) {
        const waitTime = attempt * 1000; // 1秒, 2秒, 3秒...
        console.log(`[DB] ⏱️ Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // リトライ不可能なエラー、または最終試行失敗
      throw error;
    } finally {
      if (client) {
        try {
          client.release();
        } catch (e) {
          console.error('[DB] ⚠️ Error releasing client:', e.message);
        }
      }
    }
  }
  
  throw lastError;
}

// 初期データ投入などのロジックも必要ならここに移動するか、別ファイルにする
// 今回は簡略化のため、initializeDatabase 内でのテーブル作成ロジックは省略し、
// 必要であれば startupSequence から呼び出す形にするか、マイグレーションツールに任せるべきだが、
// azure-server.mjs にあったテーブル作成ロジックも移植しておくのが安全。

export async function ensureTables() {
  if (!dbPool) return;
  
  try {
    const client = await dbPool.connect();
    try {
      await client.query(`
        -- usersテーブルはmaster_dataスキーマに存在するため、publicスキーマには作成しない
        -- CREATE TABLE IF NOT EXISTS users は削除済み

        CREATE TABLE IF NOT EXISTS machine_types (
          id SERIAL PRIMARY KEY,
          machine_type_name TEXT UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS machines (
          id SERIAL PRIMARY KEY,
          machine_number TEXT NOT NULL,
          machine_type_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (machine_type_id) REFERENCES machine_types(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_history (
          id SERIAL PRIMARY KEY,
          title TEXT,
          machine_type TEXT,
          machine_number TEXT,
          content TEXT,
          conversation_history TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS base_documents (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          category TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_history_machine_type ON chat_history(machine_type);
        CREATE INDEX IF NOT EXISTS idx_chat_history_machine_number ON chat_history(machine_number);
        CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);
      `);
      
      // Admin user check (master_dataスキーマを使用)
      const adminCheck = await client.query('SELECT id FROM master_data.users WHERE username = $1', [DEFAULT_ADMIN_USERNAME]);
      if (adminCheck.rows.length === 0) {
        const hashedPassword = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
        await client.query(
          'INSERT INTO master_data.users (username, password, display_name, role, department) VALUES ($1, $2, $3, $4, $5)',
          [DEFAULT_ADMIN_USERNAME, hashedPassword, DEFAULT_ADMIN_DISPLAY_NAME, 'admin', 'IT']
        );
        console.log('[DB] Default admin user created:', DEFAULT_ADMIN_USERNAME);
        if (DEFAULT_ADMIN_PASSWORD === 'admin') {
          console.warn('[DB] ⚠️ WARNING: Using default weak password. Please change it immediately!');
        }
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] Table creation failed:', err);
  }
}
