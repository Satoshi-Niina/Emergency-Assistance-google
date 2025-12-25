import pg from 'pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 環境変数読み込み
config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// 標準パスワード（開発用）
const DEFAULT_PASSWORD = 'Password123';

// DBから見えるユーザーリスト（ロール: admin=システム管理者, operator=運用管理者, employee=一般ユーザー）
const users = [
  { username: 'admin', display_name: '管理者', role: 'admin', department: null },
  { username: 'employee', display_name: '一般ユーザー', role: 'employee', department: '一般ユーザー' },
  { username: 'Kose001', display_name: 'Kose001', role: 'employee', department: '一般ユーザー' },
  { username: 'niina', display_name: '新名 聡志', role: 'admin', department: 'システム管理者' },
  { username: 'takaben001', display_name: 'takaben001', role: 'operator', department: '運用管理者' },
  { username: 'takaben002', display_name: 'takaben002', role: 'employee', department: '一般ユーザー' }
];

async function resetAllPasswords() {
  try {
    console.log('🔐 全ユーザーのパスワードをリセット');
    console.log('=====================================');
    console.log(`標準パスワード: ${DEFAULT_PASSWORD}`);
    console.log('');
    
    // パスワードハッシュを生成
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    console.log(`ハッシュ生成: ${hashedPassword.substring(0, 30)}...`);
    console.log('');
    
    // 次に使用するID番号を取得
    const maxIdResult = await pool.query(
      'SELECT COALESCE(MAX(CAST(id AS INTEGER)), 0) as max_id FROM users'
    );
    let nextId = maxIdResult.rows[0].max_id + 1;
    
    for (const user of users) {
      console.log(`📝 処理中: ${user.username} (${user.display_name})`);
      
      // ユーザーが存在するか確認
      const checkResult = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [user.username]
      );
      
      if (checkResult.rows.length > 0) {
        // 既存ユーザーのパスワード、ロール、部署を更新
        await pool.query(
          'UPDATE users SET password = $1, role = $2, department = $3, display_name = $4 WHERE username = $5',
          [hashedPassword, user.role, user.department, user.display_name, user.username]
        );
        console.log(`  ✅ パスワード・ロール更新完了 (ID: ${checkResult.rows[0].id}, Role: ${user.role})`);
      } else {
        // 新規ユーザーを作成（IDは数値文字列）
        const insertResult = await pool.query(
          `INSERT INTO users (id, username, display_name, password, role, department, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id`,
          [nextId.toString(), user.username, user.display_name, hashedPassword, user.role, user.department]
        );
        console.log(`  ✅ ユーザー作成完了 (ID: ${insertResult.rows[0].id}, Role: ${user.role})`);
        nextId++;
      }
    }
    
    console.log('\n✅ 全ユーザーの処理が完了しました');
    console.log('\n📋 ログイン情報:');
    console.log('=====================================');
    for (const user of users) {
      const roleLabel = user.role === 'admin' ? 'システム管理者' : 
                        user.role === 'operator' ? '運用管理者' : '一般ユーザー';
      console.log(`Username: ${user.username}`);
      console.log(`Password: ${DEFAULT_PASSWORD}`);
      console.log(`Role: ${user.role} (${roleLabel})`);
      console.log(`Department: ${user.department || '未設定'}`);
      console.log('-------------------------------------');
    }
    
    // 確認
    console.log('\n🔍 データベース確認:');
    const allUsers = await pool.query(
      'SELECT id, username, display_name, role FROM users ORDER BY id'
    );
    
    console.log(`\n登録ユーザー数: ${allUsers.rows.length}件`);
    allUsers.rows.forEach(u => {
      console.log(`  ${u.id}. ${u.username} (${u.display_name}) - ${u.role}`);
    });
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('詳細:', error);
  } finally {
    await pool.end();
  }
}

resetAllPasswords();
