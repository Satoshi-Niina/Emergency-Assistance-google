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

async function checkUserIds() {
  try {
    console.log('🔍 ユーザーIDの型を確認\n');
    
    const result = await pool.query(
      'SELECT id, username, display_name FROM users ORDER BY username'
    );
    
    result.rows.forEach(user => {
      console.log(`${user.username}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  型: ${typeof user.id}`);
      console.log(`  表示名: ${user.display_name}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkUserIds();
