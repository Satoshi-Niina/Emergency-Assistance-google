import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.development') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkPasswords() {
  try {
    console.log('🔍 現在のパスワードハッシュを確認\n');
    
    const result = await pool.query(
      'SELECT username, password FROM users WHERE username IN ($1, $2) ORDER BY username',
      ['admin', 'niina']
    );
    
    for (const user of result.rows) {
      console.log(`\n━━━ ${user.username} ━━━`);
      console.log(`ハッシュ: ${user.password.substring(0, 30)}...`);
      
      // Password123で検証
      const isPassword123 = await bcrypt.compare('Password123', user.password);
      console.log(`Password123: ${isPassword123 ? '✅ 一致' : '❌ 不一致'}`);
      
      // Adomin&123で検証
      const isAdomin = await bcrypt.compare('Adomin&123', user.password);
      console.log(`Adomin&123: ${isAdomin ? '✅ 一致' : '❌ 不一致'}`);
      
      // admin (小文字)で検証
      const isAdmin = await bcrypt.compare('admin', user.password);
      console.log(`admin: ${isAdmin ? '✅ 一致' : '❌ 不一致'}`);
    }
    
    // 特殊文字のテスト
    console.log('\n\n━━━ 特殊文字テスト ━━━');
    const testPassword = 'Adomin&123';
    const testHash = await bcrypt.hash(testPassword, 10);
    console.log(`テストパスワード: ${testPassword}`);
    console.log(`生成ハッシュ: ${testHash.substring(0, 30)}...`);
    const testVerify = await bcrypt.compare(testPassword, testHash);
    console.log(`検証結果: ${testVerify ? '✅ 成功' : '❌ 失敗'}`);
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkPasswords();
