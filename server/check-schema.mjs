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

async function checkSchema() {
  try {
    console.log('📋 usersテーブルのスキーマ:\n');
    
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    result.rows.forEach(col => {
      const maxLen = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
      console.log(`  ${col.column_name}: ${col.data_type}${maxLen}`);
    });
    
    console.log('\n\n📊 実際のユーザーデータ:');
    const usersResult = await pool.query('SELECT * FROM users LIMIT 2');
    console.log(JSON.stringify(usersResult.rows, null, 2));
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
