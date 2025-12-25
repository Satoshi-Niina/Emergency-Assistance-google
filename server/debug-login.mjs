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

// コマンドライン引数からユーザー名とパスワードを取得
const username = process.argv[2] || 'admin';
const password = process.argv[3] || 'Adomin&123';

async function debugLogin() {
  try {
    console.log('🔍 ログインデバッグ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`ユーザー名: ${username}`);
    console.log(`パスワード: ${password}`);
    console.log('');
    
    // 1. ユーザー取得（master_dataスキーマ）
    console.log('📋 Step 1: master_data.users からユーザー取得');
    const masterResult = await pool.query(
      'SELECT id, username, password, role FROM master_data.users WHERE username = $1',
      [username]
    );
    
    if (masterResult.rows.length > 0) {
      const user = masterResult.rows[0];
      console.log('✅ master_data.users に見つかりました');
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password Hash: ${user.password.substring(0, 30)}...`);
      
      const isValid = await bcrypt.compare(password, user.password);
      console.log(`   パスワード検証: ${isValid ? '✅ 成功' : '❌ 失敗'}`);
    } else {
      console.log('❌ master_data.users に見つかりません');
    }
    
    console.log('');
    
    // 2. search_pathでの検索（スキーマ指定なし）
    console.log('📋 Step 2: search_pathでのユーザー取得（スキーマ指定なし）');
    const defaultResult = await pool.query(
      'SELECT id, username, password, role FROM users WHERE username = $1',
      [username]
    );
    
    if (defaultResult.rows.length > 0) {
      const user = defaultResult.rows[0];
      console.log('✅ 見つかりました');
      console.log(`   ID: ${user.id}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password Hash: ${user.password.substring(0, 30)}...`);
      
      const isValid = await bcrypt.compare(password, user.password);
      console.log(`   パスワード検証: ${isValid ? '✅ 成功' : '❌ 失敗'}`);
    } else {
      console.log('❌ 見つかりません');
    }
    
    console.log('');
    
    // 3. public.usersの確認（削除されているはず）
    console.log('📋 Step 3: public.users の確認');
    try {
      const publicResult = await pool.query(
        'SELECT COUNT(*) as count FROM public.users'
      );
      console.log(`⚠️ public.users がまだ存在します（${publicResult.rows[0].count}件）`);
    } catch (e) {
      if (e.message.includes('does not exist')) {
        console.log('✅ public.users は存在しません（削除済み）');
      } else {
        console.log(`❌ エラー: ${e.message}`);
      }
    }
    
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

debugLogin();
