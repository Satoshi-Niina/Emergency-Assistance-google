import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: '-c search_path=public,master_data'
});

async function cleanupUnusedTables() {
  try {
    console.log('🧹 不要なテーブルのクリーンアップ開始\n');
    
    // 1. master_dataスキーマのテーブルを確認
    console.log('📋 master_dataスキーマの確認:');
    const checkResult = await pool.query(`
      SELECT tablename, 
             (SELECT COUNT(*) 
              FROM information_schema.columns 
              WHERE table_schema = 'master_data' 
              AND table_name = tablename) as column_count
      FROM pg_tables 
      WHERE schemaname = 'master_data'
      ORDER BY tablename
    `);
    
    if (checkResult.rows.length === 0) {
      console.log('  master_dataスキーマにテーブルはありません\n');
    } else {
      console.log(`  テーブル数: ${checkResult.rows.length}件`);
      checkResult.rows.forEach(row => {
        console.log(`    - ${row.tablename} (${row.column_count} columns)`);
      });
      console.log('');
    }
    
    // 2. machine_typesとmachinesのデータ数を確認
    console.log('📊 データ件数確認:');
    try {
      const mtResult = await pool.query('SELECT COUNT(*) FROM master_data.machine_types');
      console.log(`  master_data.machine_types: ${mtResult.rows[0].count}件`);
      
      const mResult = await pool.query('SELECT COUNT(*) FROM master_data.machines');
      console.log(`  master_data.machines: ${mResult.rows[0].count}件`);
    } catch (err) {
      console.log('  (テーブルが存在しないか、アクセスできません)');
    }
    
    const publicMtResult = await pool.query('SELECT COUNT(*) FROM public.machine_types');
    console.log(`  public.machine_types: ${publicMtResult.rows[0].count}件`);
    
    const publicMResult = await pool.query('SELECT COUNT(*) FROM public.machines');
    console.log(`  public.machines: ${publicMResult.rows[0].count}件\n`);
    
    // 3. 削除の確認
    console.log('❓ master_dataスキーマの空テーブルを削除しますか？');
    console.log('   - master_data.machine_types (0件)');
    console.log('   - master_data.machines (0件)\n');
    
    // 自動実行（データが0件の場合のみ）
    let deleted = false;
    
    try {
      const mtCount = await pool.query('SELECT COUNT(*) FROM master_data.machine_types');
      const mCount = await pool.query('SELECT COUNT(*) FROM master_data.machines');
      
      if (parseInt(mtCount.rows[0].count) === 0 && parseInt(mCount.rows[0].count) === 0) {
        console.log('✅ データが0件のため、安全に削除します\n');
        
        await pool.query('DROP TABLE IF EXISTS master_data.machine_types CASCADE');
        console.log('  ✅ master_data.machine_types を削除');
        
        await pool.query('DROP TABLE IF EXISTS master_data.machines CASCADE');
        console.log('  ✅ master_data.machines を削除\n');
        
        deleted = true;
      } else {
        console.log('⚠️  データが存在するため、削除をスキップします\n');
      }
    } catch (err) {
      console.log('ℹ️  テーブルが既に存在しないか、削除済みです\n');
    }
    
    // 4. 最終確認
    console.log('📋 クリーンアップ後のスキーマ確認:');
    const finalResult = await pool.query(`
      SELECT schemaname, COUNT(*) as table_count
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      GROUP BY schemaname
      ORDER BY schemaname
    `);
    
    finalResult.rows.forEach(row => {
      console.log(`  ${row.schemaname}: ${row.table_count} tables`);
    });
    
    console.log('\n✅ クリーンアップ完了');
    
    if (deleted) {
      console.log('\n📝 削除されたテーブル:');
      console.log('  - master_data.machine_types');
      console.log('  - master_data.machines');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('詳細:', error);
  } finally {
    await pool.end();
  }
}

cleanupUnusedTables();
