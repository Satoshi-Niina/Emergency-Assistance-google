import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.development') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkTables() {
  try {
    console.log('📋 usersテーブルの存在確認:\n');
    
    const result = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'users' 
      ORDER BY table_schema
    `);
    
    result.rows.forEach(t => {
      console.log(`  スキーマ: ${t.table_schema}, テーブル: ${t.table_name}`);
    });
    
    // 現在のsearch_pathを確認
    const pathResult = await pool.query('SHOW search_path');
    console.log('\n現在のsearch_path:', pathResult.rows[0].search_path);
    
    // publicスキーマのusersテーブルの構造
    console.log('\n\n📊 publicスキーマのusersテーブル:');
    const publicUsersSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    publicUsersSchema.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (null: ${col.is_nullable})`);
    });
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
