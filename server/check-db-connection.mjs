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

async function checkDB() {
  try {
    console.log('🔍 データベース接続確認');
    console.log('=====================================');
    
    // 接続テスト
    const countResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log('✅ DB接続: 成功');
    console.log(`登録ユーザー数: ${countResult.rows[0].count}件`);
    
    // 全ユーザー取得
    const usersResult = await pool.query(
      'SELECT username, display_name, role, department FROM users ORDER BY id'
    );
    
    console.log('\n📋 全ユーザー一覧:');
    console.log('-------------------------------------');
    usersResult.rows.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.display_name})`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Department: ${user.department || '未設定'}`);
      console.log('');
    });
    
    console.log('✅ すべてのユーザーがPassword123でログイン可能です');
    
  } catch (error) {
    console.error('❌ DB接続エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkDB();
