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

async function checkBothTables() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 master_data.users テーブル');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const masterDataResult = await pool.query(`
      SELECT COUNT(*) as count FROM master_data.users
    `);
    console.log(`データ件数: ${masterDataResult.rows[0].count}件`);
    
    if (masterDataResult.rows[0].count > 0) {
      const masterDataUsers = await pool.query(`
        SELECT id, username, display_name, role 
        FROM master_data.users 
        ORDER BY id 
        LIMIT 5
      `);
      console.log('\nユーザー一覧（最大5件）:');
      masterDataUsers.rows.forEach(u => {
        console.log(`  ${u.id}. ${u.username} (${u.display_name}) - ${u.role}`);
      });
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 public.users テーブル');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const publicResult = await pool.query(`
      SELECT COUNT(*) as count FROM public.users
    `);
    console.log(`データ件数: ${publicResult.rows[0].count}件`);
    
    if (publicResult.rows[0].count > 0) {
      const publicUsers = await pool.query(`
        SELECT id, username, display_name, role 
        FROM public.users 
        ORDER BY created_at 
        LIMIT 5
      `);
      console.log('\nユーザー一覧（最大5件）:');
      publicUsers.rows.forEach(u => {
        console.log(`  ${u.id}. ${u.username} (${u.display_name}) - ${u.role}`);
      });
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 推奨アクション:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    if (masterDataResult.rows[0].count > 0 && publicResult.rows[0].count === 0) {
      console.log('✅ master_data.users に実データあり');
      console.log('❌ public.users は空');
      console.log('→ public.users テーブルを削除することを推奨');
    } else if (publicResult.rows[0].count > 0 && masterDataResult.rows[0].count === 0) {
      console.log('❌ master_data.users は空');
      console.log('✅ public.users に実データあり');
      console.log('→ master_data.users テーブルを削除することを推奨');
    } else if (masterDataResult.rows[0].count > 0 && publicResult.rows[0].count > 0) {
      console.log('⚠️ 両方のテーブルにデータが存在します');
      console.log('→ データを確認してマージまたは不要な方を削除してください');
    } else {
      console.log('⚠️ 両方のテーブルが空です');
    }
    
  } catch (error) {
    console.error('エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkBothTables();
