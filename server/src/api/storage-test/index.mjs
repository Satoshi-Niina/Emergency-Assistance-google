// Google Cloud Storage接続テストAPIエンドポイント
import { uploadFile, downloadFile, fileExists, listFiles } from '../../lib/storage.mjs';
import { STORAGE_MODE } from '../../config/env.mjs';

/**
 * POST /api/storage-test
 * ストレージの接続テスト（実際にファイルをアップロード/ダウンロード）
 */
export default async function handler(req, res) {
  if (req.method === 'POST') {
    return handleTest(req, res);
  }
  
  return res.status(405).json({
    success: false,
    error: 'Method not allowed',
  });
}

async function handleTest(req, res) {
  const testResults = {
    mode: STORAGE_MODE,
    tests: [],
    success: false,
    timestamp: new Date().toISOString(),
  };
  
  try {
    console.log('[storage-test] Starting storage connection test...');
    
    // テスト1: ファイルアップロード
    console.log('[storage-test] Test 1: File upload');
    const testData = {
      test: 'connection-test',
      timestamp: new Date().toISOString(),
      mode: STORAGE_MODE,
    };
    const testBuffer = Buffer.from(JSON.stringify(testData, null, 2), 'utf-8');
    const testFileName = `temp/connection-test-${Date.now()}.json`;
    
    try {
      await uploadFile(testBuffer, testFileName, 'application/json');
      testResults.tests.push({
        name: 'upload',
        success: true,
        message: 'ファイルのアップロードに成功しました',
        fileName: testFileName,
      });
      console.log('[storage-test] ✓ Upload test passed');
    } catch (error) {
      testResults.tests.push({
        name: 'upload',
        success: false,
        message: 'ファイルのアップロードに失敗しました',
        error: error.message,
      });
      console.error('[storage-test] ✗ Upload test failed:', error.message);
      throw error; // 後続のテストをスキップ
    }
    
    // テスト2: ファイル存在確認
    console.log('[storage-test] Test 2: File exists check');
    try {
      const exists = await fileExists(testFileName);
      testResults.tests.push({
        name: 'exists',
        success: exists,
        message: exists ? 'ファイルの存在確認に成功しました' : 'ファイルが見つかりません',
      });
      console.log('[storage-test] ✓ Exists test passed:', exists);
    } catch (error) {
      testResults.tests.push({
        name: 'exists',
        success: false,
        message: 'ファイルの存在確認に失敗しました',
        error: error.message,
      });
      console.error('[storage-test] ✗ Exists test failed:', error.message);
    }
    
    // テスト3: ファイルダウンロード
    console.log('[storage-test] Test 3: File download');
    try {
      const downloadedBuffer = await downloadFile(testFileName);
      const downloadedData = JSON.parse(downloadedBuffer.toString('utf-8'));
      const dataMatches = downloadedData.test === testData.test;
      
      testResults.tests.push({
        name: 'download',
        success: dataMatches,
        message: dataMatches 
          ? 'ファイルのダウンロードとデータ検証に成功しました' 
          : 'データが一致しません',
        downloadedData,
      });
      console.log('[storage-test] ✓ Download test passed');
    } catch (error) {
      testResults.tests.push({
        name: 'download',
        success: false,
        message: 'ファイルのダウンロードに失敗しました',
        error: error.message,
      });
      console.error('[storage-test] ✗ Download test failed:', error.message);
    }
    
    // テスト4: ファイル一覧取得
    console.log('[storage-test] Test 4: List files');
    try {
      const files = await listFiles('temp/');
      const fileFound = files.some(f => (f.name || f).includes('connection-test'));
      
      testResults.tests.push({
        name: 'list',
        success: fileFound,
        message: fileFound 
          ? `ファイル一覧の取得に成功しました（${files.length}件）` 
          : 'テストファイルが一覧に見つかりません',
        fileCount: files.length,
      });
      console.log('[storage-test] ✓ List test passed:', files.length, 'files');
    } catch (error) {
      testResults.tests.push({
        name: 'list',
        success: false,
        message: 'ファイル一覧の取得に失敗しました',
        error: error.message,
      });
      console.error('[storage-test] ✗ List test failed:', error.message);
    }
    
    // 全テストの成否を判定
    const allPassed = testResults.tests.every(test => test.success);
    testResults.success = allPassed;
    
    console.log('[storage-test] Test complete:', allPassed ? 'ALL PASSED' : 'SOME FAILED');
    
    return res.status(allPassed ? 200 : 500).json({
      success: allPassed,
      message: allPassed 
        ? 'すべての接続テストに成功しました' 
        : '一部の接続テストに失敗しました',
      results: testResults,
    });
    
  } catch (error) {
    console.error('[storage-test] Fatal error during test:', error);
    
    return res.status(500).json({
      success: false,
      error: 'ストレージ接続テスト中にエラーが発生しました',
      details: error.message,
      results: testResults,
    });
  }
}
