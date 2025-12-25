import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import {
  Database,
  Brain,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface CheckResult {
  success: boolean;
  status: 'OK' | 'ERROR';
  message?: string;
  error?: string;
  details?: string;
  connected?: boolean;
  current_time?: string;
  version?: string;
  environment?: string;
  timestamp?: string;
}

export default function SystemDiagnosticPage() {
  const { toast } = useToast();
  const [dbCheckResult, setDbCheckResult] = useState<CheckResult | null>(null);
  const [geminiCheckResult, setGeminiCheckResult] = useState<CheckResult | null>(
    null
  );
  const [isCheckingDb, setIsCheckingDb] = useState(false);
  const [isCheckingGemini, setIsCheckingGemini] = useState(false);

  // APIのベースURLを取得
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || '';

  // API URLを構築（/apiの重複を防ぐ）
  const buildApiPath = (path: string) => {
    const base = apiBaseUrl.replace(/\/$/, ''); // 末尾の/を削除
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    // apiBaseUrlに既に/apiが含まれている場合は追加しない
    if (base.endsWith('/api')) {
      return `${base}${cleanPath}`;
    }
    return `${base}/api${cleanPath}`;
  };

  const checkDatabaseConnection = async () => {
    setIsCheckingDb(true);
    setDbCheckResult(null);

    try {
      const response = await fetch(buildApiPath('/db-check'));
      const result = await response.json();

      // サーバーのレスポンス形式に合わせて変換
      const checkResult = {
        success: result.status === 'OK',
        status: result.status || 'ERROR',
        message: result.message || 'データベース接続確認完了',
        error: result.status === 'ERROR' ? result.message : undefined,
        current_time: result.db_time,
        version: result.version,
        timestamp: result.timestamp || new Date().toISOString()
      };
      setDbCheckResult(checkResult);

      if (checkResult.status === 'OK') {
        toast({
          title: 'DB接続確認',
          description: 'データベース接続が正常です',
          variant: 'default',
        });
      } else {
        toast({
          title: 'DB接続確認',
          description: checkResult.error || checkResult.message || 'データベース接続エラー',
          variant: 'destructive',
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'ネットワークエラー';
      setDbCheckResult({
        success: false,
        status: 'ERROR',
        error: errorMessage,
      });

      toast({
        title: 'DB接続確認',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCheckingDb(false);
    }
  };

  const checkGeminiConnection = async () => {
    setIsCheckingGemini(true);
    setGeminiCheckResult(null);

    try {
      // _diag/gemini-check エンドポイントを使用
      const response = await fetch(buildApiPath('/_diag/gemini-check'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      const checkResult: CheckResult = {
        success: result.success,
        status: result.success ? 'OK' : 'ERROR',
        message: result.message,
        error: result.success ? undefined : result.message,
        details: result.details?.error || result.details?.testResponse,
        timestamp: result.details?.timestamp || new Date().toISOString()
      };
      setGeminiCheckResult(checkResult);

      if (checkResult.status === 'OK') {
        toast({
          title: 'Gemini接続確認',
          description: 'Gemini API接続が正常です',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Gemini接続確認',
          description: checkResult.error || 'Gemini API接続エラー',
          variant: 'destructive',
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'ネットワークエラー';
      setGeminiCheckResult({
        success: false,
        status: 'ERROR',
        error: errorMessage,
      });

      toast({
        title: 'Gemini接続確認',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsCheckingGemini(false);
    }
  };

  const runAllChecks = async () => {
    // 並列実行
    await Promise.all([
      checkDatabaseConnection(),
      checkGeminiConnection()
    ]);
  };

  return (
    <div className='container mx-auto p-6 max-w-4xl'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold mb-2'>システム診断</h1>
          <p className='text-muted-foreground'>
            データベース接続とGemini接続の状態を確認できます
          </p>
        </div>
        <Link to='/settings'>
          <Button variant='outline' size='sm'>
            <ArrowLeft className='mr-2 h-4 w-4' />
            設定に戻る
          </Button>
        </Link>
      </div>

      {/* 全体実行ボタン */}
      <Card className='mb-6'>
        <CardContent className='pt-6'>
          <div className='flex items-center justify-between'>
            <div>
              <h3 className='text-lg font-semibold mb-2'>一括診断</h3>
              <p className='text-sm text-muted-foreground'>
                すべての接続確認を一度に実行します
              </p>
            </div>
            <Button
              onClick={runAllChecks}
              disabled={isCheckingDb || isCheckingGemini}
              className='flex items-center gap-2'
            >
              {isCheckingDb || isCheckingGemini ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <RefreshCw className='h-4 w-4' />
              )}
              全体診断実行
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-6 md:grid-cols-2'>
        {/* DB接続確認 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Database className='h-5 w-5' />
              PostgreSQL接続確認
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>
                データベースへの接続状態を確認します
              </p>
              <Button
                onClick={checkDatabaseConnection}
                disabled={isCheckingDb}
                size='sm'
                variant='outline'
              >
                {isCheckingDb ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <CheckCircle className='h-4 w-4' />
                )}
                確認実行
              </Button>
            </div>

            {dbCheckResult && (
              <div className='space-y-3'>
                <Separator />
                <div className='flex items-center gap-2'>
                  {dbCheckResult.status === 'OK' ? (
                    <CheckCircle className='h-4 w-4 text-green-500' />
                  ) : (
                    <XCircle className='h-4 w-4 text-red-500' />
                  )}
                  <Badge
                    variant={
                      dbCheckResult.status === 'OK' ? 'default' : 'destructive'
                    }
                  >
                    {dbCheckResult.status === 'OK' ? '接続成功' : '接続失敗'}
                  </Badge>
                </div>

                {dbCheckResult.status === 'OK' && dbCheckResult.current_time && (
                  <div className='text-sm'>
                    <span className='font-medium'>DB時刻:</span>{' '}
                    {new Date(dbCheckResult.current_time).toLocaleString('ja-JP')}
                  </div>
                )}

                {dbCheckResult.status === 'ERROR' && (dbCheckResult.error || dbCheckResult.message) && (
                  <div className='text-sm text-red-600 bg-red-50 p-3 rounded-md'>
                    <div className='flex items-start gap-2'>
                      <AlertCircle className='h-4 w-4 mt-0.5 flex-shrink-0' />
                      <span>{dbCheckResult.error || dbCheckResult.message}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gemini接続確認 */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Brain className='h-5 w-5' />
              Gemini API接続確認
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <p className='text-sm text-muted-foreground'>
                Google Gemini APIへの接続状態を確認します
              </p>
              <Button
                onClick={checkGeminiConnection}
                disabled={isCheckingGemini}
                size='sm'
                variant='outline'
              >
                {isCheckingGemini ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <CheckCircle className='h-4 w-4' />
                )}
                確認実行
              </Button>
            </div>

            {geminiCheckResult && (
              <div className='space-y-3'>
                <Separator />
                <div className='flex items-center gap-2'>
                  {geminiCheckResult.status === 'OK' ? (
                    <CheckCircle className='h-4 w-4 text-green-500' />
                  ) : (
                    <XCircle className='h-4 w-4 text-red-500' />
                  )}
                  <Badge
                    variant={
                      geminiCheckResult.status === 'OK' ? 'default' : 'destructive'
                    }
                  >
                    {geminiCheckResult.status === 'OK' ? '接続成功' : '接続失敗'}
                  </Badge>
                </div>

                {geminiCheckResult.status === 'OK' && geminiCheckResult.message && (
                  <div className='text-sm'>
                    <span className='font-medium'>Gemini応答:</span>
                    <div className='mt-1 p-2 bg-gray-50 rounded text-xs max-h-20 overflow-y-auto'>
                      {geminiCheckResult.message}
                    </div>
                    {geminiCheckResult.details && (
                      <div className='mt-1 text-xs text-muted-foreground italic truncate'>
                        テスト応答: {geminiCheckResult.details}
                      </div>
                    )}
                  </div>
                )}

                {geminiCheckResult.status === 'ERROR' &&
                  (geminiCheckResult.error || geminiCheckResult.message) && (
                    <div className='text-sm text-red-600 bg-red-50 p-3 rounded-md'>
                      <div className='flex items-start gap-2'>
                        <AlertCircle className='h-4 w-4 mt-0.5 flex-shrink-0' />
                        <div className='flex-1'>
                          <div className='font-medium'>{geminiCheckResult.error}</div>
                          {geminiCheckResult.details && (
                            <div className='text-xs text-red-400 mt-1 font-mono'>
                              {geminiCheckResult.details}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 診断結果サマリー */}
      {(dbCheckResult || geminiCheckResult) && (
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>診断結果サマリー</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 gap-4'>
              <div className='flex items-center gap-2'>
                <Database className='h-4 w-4' />
                <span>PostgreSQL:</span>
                {dbCheckResult ? (
                  <Badge
                    variant={
                      dbCheckResult.status === 'OK' ? 'default' : 'destructive'
                    }
                  >
                    {dbCheckResult.status === 'OK' ? '正常' : '異常'}
                  </Badge>
                ) : (
                  <span className='text-sm text-muted-foreground'>未実行</span>
                )}
              </div>
              <div className='flex items-center gap-2'>
                <Brain className='h-4 w-4' />
                <span>Gemini API:</span>
                {geminiCheckResult ? (
                  <Badge
                    variant={
                      geminiCheckResult.status === 'OK' ? 'default' : 'destructive'
                    }
                  >
                    {geminiCheckResult.status === 'OK' ? '正常' : '異常'}
                  </Badge>
                ) : (
                  <span className='text-sm text-muted-foreground'>未実行</span>
                )}
              </div>
            </div>

            {dbCheckResult?.status === 'OK' &&
              geminiCheckResult?.status === 'OK' && (
                <div className='mt-4 p-3 bg-green-50 text-green-700 rounded-md'>
                  <div className='flex items-center gap-2'>
                    <CheckCircle className='h-4 w-4' />
                    <span className='font-medium'>すべての接続が正常です</span>
                  </div>
                </div>
              )}

            {(dbCheckResult?.status === 'ERROR' ||
              geminiCheckResult?.status === 'ERROR') && (
                <div className='mt-4 p-3 bg-yellow-50 text-yellow-700 rounded-md'>
                  <div className='flex items-center gap-2'>
                    <AlertCircle className='h-4 w-4' />
                    <span className='font-medium'>
                      一部の接続に問題があります
                    </span>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
