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

async function deletePublicUsersTable() {
  try {
    console.log('🗑️ public.users テーブルを削除します...\n');
    
    // バックアップとして、削除前にデータを表示
    console.log('削除されるデータ:');
    const backupResult = await pool.query('SELECT username, display_name FROM public.users ORDER BY created_at');
    backupResult.rows.forEach((u, i) => {
      console.log(`  ${i + 1}. ${u.username} (${u.display_name})`);
    });
    
    console.log('\n⚠️ 5秒後に削除を実行します...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // public.usersテーブルを削除
    await pool.query('DROP TABLE IF EXISTS public.users CASCADE');
    
    console.log('\n✅ public.users テーブルを削除しました');
    
    // 確認
    const checkResult = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'users'
    `);
    
    console.log('\n📋 残っているusersテーブル:');
    checkResult.rows.forEach(t => {
      console.log(`  ${t.table_schema}.${t.table_name}`);
    });
    
    console.log('\n✅ 完了！master_data.users テーブルのみが残っています');
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
  } finally {
    await pool.end();
  }
}

deletePublicUsersTable();
