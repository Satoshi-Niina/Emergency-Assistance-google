import { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../hooks/use-toast';
import { API_BASE_URL } from '../lib/api/config';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Badge } from '../components/ui/badge';
import {
  Settings,
  Volume2,
  Mic,
  Monitor,
  Smartphone,
  LogOut,
  User,
  Shield,
  Save,
  Trash2,
  FileX,
  UserPlus,
  FileType,
  Info,
  Plus,
  Database,
  X,
  Wrench,
  CheckCircle,
  AlertTriangle,
  Lock,
  HardDrive,
  DollarSign,
  Calendar,
  Activity,
  TrendingUp,
  Package,
} from 'lucide-react';
import { WarningDialog } from '../components/shared/warning-dialog';
import { Separator } from '../components/ui/separator';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Link } from 'react-router-dom';

// SystemHealth interface is removed - integrated into system diagnostic page
// Settings page updated: removed permission checks for maintenance and security cards
// Build: 2025-01-27 - Fixed card visibility issue by removing dist from git tracking
// Trigger: Force workflow execution - 2025-01-27

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // デバッグ: カードが表示されることを確認
  useEffect(() => {
    console.log('🔍 SettingsPage rendered:', {
      user: user?.username,
      role: user?.role,
      timestamp: new Date().toISOString()
    });
  }, [user]);

  // Settings state
  const [notifications, setNotifications] = useState(true);
  const [textToSpeech, setTextToSpeech] = useState(true);
  const [speechVolume, setSpeechVolume] = useState([80]);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [useOnlyKnowledgeBase, setUseOnlyKnowledgeBase] = useState(true);

  // システム健全性チェック
  // System health state removed - integrated into system diagnostic page

  // LocalStorageからの設定読み込み
  useEffect(() => {
    const loadSettings = () => {
      try {
        const savedSettings = localStorage.getItem('emergencyRecoverySettings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);

          if (settings.notifications !== undefined)
            setNotifications(settings.notifications);
          if (settings.textToSpeech !== undefined)
            setTextToSpeech(settings.textToSpeech);
          if (settings.speechVolume !== undefined)
            setSpeechVolume(settings.speechVolume);
          if (settings.darkMode !== undefined) setDarkMode(settings.darkMode);
          if (settings.autoSave !== undefined) setAutoSave(settings.autoSave);
          if (settings.useOnlyKnowledgeBase !== undefined)
            setUseOnlyKnowledgeBase(settings.useOnlyKnowledgeBase);
        }
      } catch (error) {
        console.error('設定の読み込みに失敗しました:', error);
      }
    };

    loadSettings();
  }, []);

  // 設定保存関数（トップレベルに移動）
  const saveSettings = () => {
    try {
      const settings = {
        notifications,
        textToSpeech,
        speechVolume,
        darkMode,
        autoSave,
        useOnlyKnowledgeBase,
      };
      localStorage.setItem(
        'emergencyRecoverySettings',
        JSON.stringify(settings)
      );
      localStorage.setItem(
        'useOnlyKnowledgeBase',
        useOnlyKnowledgeBase.toString()
      );
      window.dispatchEvent(
        new CustomEvent('settingsChanged', { detail: settings })
      );
    } catch (error) {
      console.error('設定の保存に失敗しました:', error);
    }
  };

  // 設定変更時の自動保存
  useEffect(() => {
    saveSettings();
  }, [
    notifications,
    textToSpeech,
    speechVolume,
    darkMode,
    autoSave,
    useOnlyKnowledgeBase,
  ]);

  const handleLogout = async () => {
    setShowWarningDialog(true);
  };

  const confirmLogout = async () => {
    try {
      await logout();
    } catch (error) {
      toast({
        title: 'ログアウト失敗',
        description: 'ログアウト中にエラーが発生しました。',
        variant: 'destructive',
      });
    } finally {
      setShowWarningDialog(false);
    }
  };

  const handleCleanupUploads = async () => {
    try {
      toast({
        title: 'クリーンアップ開始',
        description: '一時ファイルのクリーンアップを開始しています...',
      });

      const response = await fetch(
        `${API_BASE_URL}/tech-support/cleanup-uploads`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'クリーンアップに失敗しました');
      }

      const result = await response.json();

      if (result.success) {
        const details = result.details;
        const fileSize = details?.sizeInMB || '0';
        toast({
          title: 'クリーンアップ完了',
          description: `${details?.removedFiles || 0}件のファイルを削除しました (${fileSize} MB)`,
        });
      } else {
        throw new Error(result.error || 'クリーンアップに失敗しました');
      }
    } catch (error) {
      console.error('クリーンアップエラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : 'クリーンアップに失敗しました',
        variant: 'destructive',
      });
    }
  };

  // チャットクリア後に孤立画像をクリーンアップ
  const cleanupOrphanedImagesAfterChatClear = async () => {
    try {
      const { buildApiUrl } = await import('../lib/api');
      const response = await fetch(buildApiUrl('/history/cleanup-orphaned-images'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ チャットクリア後の孤立画像クリーンアップ:', result.stats);
      }
    } catch (error) {
      console.warn('⚠️ 孤立画像クリーンアップ失敗:', error);
    }
  };

  const handleCleanupOrphanedImages = async () => {
    try {
      // まずドライランで孤立画像の数を確認
      toast({
        title: 'スキャン中',
        description: '孤立画像をスキャンしています...',
      });

      const dryRunResponse = await fetch(
        `${API_BASE_URL}/history/cleanup-orphaned-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dryRun: true }),
        }
      );

      if (!dryRunResponse.ok) {
        const errorData = await dryRunResponse.json();
        throw new Error(errorData.error || 'スキャンに失敗しました');
      }

      const dryRunResult = await dryRunResponse.json();
      const orphanedCount = dryRunResult.stats.orphanedImages;
      const orphanedSizeMB = dryRunResult.stats.deletedSizeMB;

      if (orphanedCount === 0) {
        toast({
          title: '孤立画像なし',
          description: '削除対象の孤立画像はありません。',
        });
        return;
      }

      // 確認ダイアログ
      const confirmed = window.confirm(
        `${orphanedCount}個の孤立画像 (約${orphanedSizeMB} MB) が見つかりました。\n\n` +
        '削除すると元に戻せません。削除しますか？'
      );

      if (!confirmed) {
        toast({
          title: 'キャンセル',
          description: 'クリーンアップをキャンセルしました。',
        });
        return;
      }

      // 実際に削除
      toast({
        title: 'クリーンアップ開始',
        description: '孤立画像を削除しています...',
      });

      const response = await fetch(
        `${API_BASE_URL}/history/cleanup-orphaned-images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ dryRun: false }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'クリーンアップに失敗しました');
      }

      const result = await response.json();

      if (result.success) {
        const deletedCount = result.stats.deletedCount;
        const deletedSizeMB = result.stats.deletedSizeMB;
        toast({
          title: 'クリーンアップ完了',
          description: `${deletedCount}個の孤立画像を削除しました (${deletedSizeMB} MB)`,
        });
      } else {
        throw new Error(result.error || 'クリーンアップに失敗しました');
      }
    } catch (error) {
      console.error('孤立画像クリーンアップエラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : 'クリーンアップに失敗しました',
        variant: 'destructive',
      });
    }
  };

  const handleBackupLogs = async () => {
    try {
      toast({
        title: 'バックアップ開始',
        description: 'ログファイルのバックアップを開始しています...',
      });

      const response = await fetch(
        `${API_BASE_URL}/tech-support/backup-logs`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'ログファイルバックアップに失敗しました'
        );
      }

      const result = await response.json();

      if (result.success) {
        const fileSize = result.totalSize
          ? (result.totalSize / 1024 / 1024).toFixed(2)
          : '0';

        // バックアップ完了通知
        toast({
          title: 'バックアップ完了',
          description: `${result.fileCount}件のログファイルをバックアップしました (${fileSize} MB)。通知のダウンロードボタンをクリックしてください。`,
        });

        // 自動的にダウンロードを開始
        if (result.backupFileName) {
          setTimeout(() => {
            const downloadUrl = `${API_BASE_URL}/tech-support/download-backup/${result.backupFileName}`;
            window.open(downloadUrl, '_blank');
          }, 1000);
        }
      } else {
        throw new Error(result.message || 'バックアップに失敗しました');
      }
    } catch (error) {
      console.error('ログファイルバックアップエラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ログファイルバックアップに失敗しました',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className='flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full bg-gradient-to-br from-blue-50 to-indigo-50'>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold flex items-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent'>
          <Settings className='mr-2 h-6 w-6 text-indigo-500' />
          設定
        </h1>
        <p className='text-blue-400'>アプリケーションの設定を管理します</p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* User Profile */}
        <Card className='border border-blue-200 shadow-md overflow-hidden'>
          <CardHeader className='pb-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white'>
            <CardTitle className='text-lg flex items-center'>
              <User className='mr-2 h-5 w-5' />
              ユーザープロフィール
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-white'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between py-2'>
                <div>
                  <p className='font-medium text-blue-800'>
                    {user?.displayName}
                  </p>
                  <p className='text-sm text-blue-400'>{user?.username}</p>
                  <p className='text-sm text-blue-400'>
                    {user?.department || '部署未設定'}
                  </p>
                </div>
                <div
                  className={`text-white text-xs px-3 py-1 rounded-full ${
                    user?.role === 'admin' 
                      ? 'bg-gradient-to-r from-red-500 to-purple-500' 
                      : user?.role === 'operator'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                      : 'bg-gradient-to-r from-blue-500 to-green-500'
                  }`}
                >
                  {user?.role === 'admin' ? 'システム管理者' : user?.role === 'operator' ? '運用管理' : '一般ユーザー'}
                </div>
              </div>

              {/* このアプリについての説明 */}
              <div className='border-t border-blue-100 pt-3'>
                <div className='space-y-2'>
                  <p className='text-sm font-medium text-blue-700'>
                    Emergency Recovery Chat
                  </p>
                  <p className='text-sm text-blue-500'>バージョン 1.0.0</p>
                  <p className='text-sm text-blue-500'>
                    © 2024 All Rights Reserved
                  </p>
                  <p className='text-xs text-blue-400'>
                    応急復旧サポートのための対話型アシスタントシステム
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin Settings */}
        <Card className='border border-blue-200 shadow-md overflow-hidden'>
          <CardHeader className='pb-2 bg-gradient-to-r from-blue-700 to-indigo-700 text-white'>
            <CardTitle className='text-lg flex items-center'>
              <Shield className='mr-2 h-5 w-5' />
              管理者設定
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-white'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-blue-800'>ユーザー管理</p>
                  <p className='text-sm text-blue-400'>
                    ユーザーアカウントを管理する
                  </p>
                </div>
                <Link to='/users'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='border-blue-300 text-blue-700 hover:bg-blue-50'
                  >
                    <UserPlus className='mr-2 h-4 w-4 text-blue-500' />
                    管理
                  </Button>
                </Link>
              </div>

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-blue-800'>システム診断</p>
                  <p className='text-sm text-blue-400'>
                    DB接続とGPT接続の状態を確認
                  </p>
                </div>
                <Link to='/system-diagnostic'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='border-blue-300 text-blue-700 hover:bg-blue-50'
                  >
                    <CheckCircle className='mr-2 h-4 w-4 text-blue-500' />
                    診断
                  </Button>
                </Link>
              </div>

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-blue-800'>
                    機種・機械番号管理
                  </p>
                  <p className='text-sm text-blue-400'>
                    機種と機械番号の詳細管理
                  </p>
                </div>
                <Link to='/machine-management'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='border-blue-300 text-blue-700 hover:bg-blue-50'
                  >
                    <Wrench className='mr-2 h-4 w-4 text-blue-500' />
                    管理
                  </Button>
                </Link>
              </div>

              {/* システムメンテナンス */}
              <div className='border-t border-blue-100 pt-4 space-y-3'>
                <div className='text-sm font-medium text-blue-800 mb-3'>
                  システムメンテナンス
                </div>

                <div className='grid grid-cols-1 gap-3'>
                  {/* 一時ファイル削除 */}
                  <div className='bg-blue-50 border border-blue-200 rounded-lg p-3'>
                    <div className='flex items-start justify-between mb-2'>
                      <div className='flex-1'>
                        <div className='flex items-center mb-1'>
                          <Info className='h-4 w-4 text-blue-600 mr-2' />
                          <p className='font-medium text-blue-900 text-sm'>一時ファイルとは？</p>
                        </div>
                        <p className='text-xs text-blue-700 mb-2'>
                          ファイルアップロード時に作成される一時的なファイルです。
                          処理完了後も残っている場合があり、ストレージ容量を圧迫します。
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleCleanupUploads}
                      variant='destructive'
                      className='w-full'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      一時ファイルを削除
                    </Button>
                  </div>

                  {/* ログバックアップ */}
                  <div className='bg-amber-50 border border-amber-200 rounded-lg p-3'>
                    <div className='flex items-start justify-between mb-2'>
                      <div className='flex-1'>
                        <div className='flex items-center mb-1'>
                          <Info className='h-4 w-4 text-amber-600 mr-2' />
                          <p className='font-medium text-amber-900 text-sm'>ログファイルバックアップ</p>
                        </div>
                        <p className='text-xs text-amber-700 mb-2'>
                          システムログファイルをZIP形式でアーカイブします。
                          バックアップ後、ダウンロードボタンからローカルに保存できます。
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleBackupLogs}
                      variant='outline'
                      className='w-full border-amber-300 text-amber-700 hover:bg-amber-100'
                    >
                      <FileType className='mr-2 h-4 w-4' />
                      ログファイルバックアップ
                    </Button>
                  </div>

                  {/* 孤立画像クリーンアップ */}
                  <div className='bg-purple-50 border border-purple-200 rounded-lg p-3'>
                    <div className='flex items-start justify-between mb-2'>
                      <div className='flex-1'>
                        <div className='flex items-center mb-1'>
                          <Info className='h-4 w-4 text-purple-600 mr-2' />
                          <p className='font-medium text-purple-900 text-sm'>孤立画像ファイルとは？</p>
                        </div>
                        <p className='text-xs text-purple-700 mb-2'>
                          チャットで送信したがエクスポートしなかった画像や、削除された履歴に紐づいていた画像です。
                          これらの画像はJSONファイルから参照されておらず、ストレージを圧迫します。
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleCleanupOrphanedImages}
                      variant='destructive'
                      className='w-full'
                    >
                      <FileX className='mr-2 h-4 w-4' />
                      孤立画像を削除
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* セキュリティ監視カード - 常に表示 */}
        <Card className='border border-red-200 shadow-md overflow-hidden' style={{ display: 'block' }}>
          <CardHeader className='pb-2 bg-gradient-to-r from-red-500 to-orange-500 text-white'>
            <CardTitle className='text-lg flex items-center'>
              <Lock className='mr-2 h-5 w-5' />
              セキュリティ監視
              <Badge variant='destructive' className='ml-2'>3</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-white'>
            <div className='space-y-4'>
              <div className='bg-red-50 border border-red-200 rounded-lg p-3'>
                <div className='flex items-center justify-between mb-2'>
                  <div className='flex items-center'>
                    <AlertTriangle className='h-5 w-5 text-red-600 mr-2' />
                    <p className='font-medium text-red-900 text-sm'>今日のアラート</p>
                  </div>
                  <span className='text-red-700 font-bold'>3件</span>
                </div>
                <div className='text-xs text-red-700 space-y-1'>
                  <p>• 不正アクセス試行: 2回</p>
                  <p>• 未登録デバイス: 1台</p>
                </div>
              </div>
              <div className='border-t border-blue-100 pt-3'>
                <p className='font-medium text-blue-800 mb-2 text-sm'>ブロックされたアクセス</p>
                <div className='space-y-2 text-xs'>
                  <div className='flex justify-between items-center bg-gray-50 p-2 rounded'>
                    <span className='text-gray-700'>192.168.1.100 (中国)</span>
                    <Badge variant='outline' className='text-xs'>5回試行</Badge>
                  </div>
                  <div className='flex justify-between items-center bg-gray-50 p-2 rounded'>
                    <span className='text-gray-700'>203.0.113.50 (未登録)</span>
                    <Badge variant='outline' className='text-xs'>2回試行</Badge>
                  </div>
                </div>
              </div>
              <div className='border-t border-blue-100 pt-3'>
                <p className='font-medium text-blue-800 mb-2 text-sm'>登録デバイス</p>
                <div className='space-y-2 text-xs'>
                  <div className='flex justify-between items-center'>
                    <div>
                      <p className='text-gray-700 font-medium'>iPad-001 (山田太郎)</p>
                      <p className='text-gray-400'>最終アクセス: 2時間前</p>
                    </div>
                    <Badge className='bg-green-500'>稼働中</Badge>
                  </div>
                  <div className='flex justify-between items-center'>
                    <div>
                      <p className='text-gray-700 font-medium'>Tablet-002 (佐藤花子)</p>
                      <p className='text-gray-400'>最終アクセス: 5分前</p>
                    </div>
                    <Badge className='bg-green-500'>稼働中</Badge>
                  </div>
                </div>
              </div>
              <Button variant='outline' className='w-full mt-2' size='sm'>
                詳細を表示
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 保守管理カード - 常に表示 */}
        <Card className='border border-amber-200 shadow-md overflow-hidden' style={{ display: 'block' }}>
          <CardHeader className='pb-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white'>
            <CardTitle className='text-lg flex items-center'>
              <Wrench className='mr-2 h-5 w-5' />
              保守管理
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-white'>
            <div className='space-y-4'>
              <div className='bg-amber-50 border border-amber-200 rounded-lg p-3'>
                <div className='flex items-center justify-between mb-2'>
                  <div className='flex items-center'>
                    <Package className='h-5 w-5 text-amber-600 mr-2' />
                    <p className='font-medium text-amber-900 text-sm'>モジュール更新</p>
                  </div>
                </div>
                <div className='text-xs text-amber-700 space-y-1'>
                  <p className='flex justify-between'>
                    <span>⚠️ 脆弱性あり:</span>
                    <span className='font-bold'>2個 (重大:1, 高:1)</span>
                  </p>
                  <p className='flex justify-between'>
                    <span>⏰ 更新可能:</span>
                    <span className='font-bold'>12パッケージ</span>
                  </p>
                </div>
                <Button variant='outline' size='sm' className='w-full mt-2 border-amber-300 text-amber-700'>
                  更新を確認
                </Button>
              </div>
              <div className='border-t border-blue-100 pt-3'>
                <p className='font-medium text-blue-800 mb-2 text-sm flex items-center'>
                  <Calendar className='h-4 w-4 mr-2' />
                  期限管理
                </p>
                <div className='space-y-2 text-xs'>
                  <div className='flex justify-between items-center bg-red-50 p-2 rounded'>
                    <span className='text-red-700 font-medium'>SSL証明書</span>
                    <Badge variant='destructive' className='text-xs'>15日後</Badge>
                  </div>
                  <div className='flex justify-between items-center bg-yellow-50 p-2 rounded'>
                    <span className='text-yellow-700 font-medium'>APIキー</span>
                    <Badge className='bg-yellow-500 text-xs'>45日後</Badge>
                  </div>
                  <div className='flex justify-between items-center bg-green-50 p-2 rounded'>
                    <span className='text-green-700 font-medium'>データ保持</span>
                    <Badge className='bg-green-500 text-xs'>問題なし</Badge>
                  </div>
                </div>
              </div>
              <div className='border-t border-blue-100 pt-3'>
                <p className='font-medium text-blue-800 mb-2 text-sm flex items-center'>
                  <HardDrive className='h-4 w-4 mr-2' />
                  ストレージ使用状況
                </p>
                <div className='space-y-2'>
                  <div className='flex justify-between text-xs'>
                    <span className='text-gray-600'>使用中: 3.4GB / 5GB</span>
                    <span className='font-bold text-amber-600'>68%</span>
                  </div>
                  <div className='w-full bg-gray-200 rounded-full h-2'>
                    <div className='bg-gradient-to-r from-blue-500 to-amber-500 h-2 rounded-full' style={{ width: '68%' }}></div>
                  </div>
                  <div className='text-xs space-y-1 text-gray-600'>
                    <p className='flex justify-between'>
                      <span>• アップロード:</span>
                      <span>1.2GB</span>
                    </p>
                    <p className='flex justify-between'>
                      <span>• ログファイル:</span>
                      <span>0.8GB</span>
                    </p>
                    <p className='flex justify-between'>
                      <span>• 一時ファイル:</span>
                      <span className='text-amber-600 font-bold'>1.4GB ⚠️</span>
                    </p>
                  </div>
                </div>
              </div>
              <Button variant='outline' className='w-full mt-2' size='sm'>
                詳細を表示
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* App Settings */}
        <Card className='border border-blue-200 shadow-md overflow-hidden'>
          <CardHeader className='pb-2 bg-gradient-to-r from-indigo-500 to-blue-600 text-white'>
            <CardTitle className='text-lg flex items-center'>
              <Settings className='mr-2 h-5 w-5' />
              アプリ設定
            </CardTitle>
          </CardHeader>
          <CardContent className='bg-white'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between py-2'>
                <div>
                  <p className='font-medium text-blue-700'>通知を有効にする</p>
                  <p className='text-sm text-blue-400'>
                    新しいメッセージの通知を受け取る
                  </p>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                  className='data-[state=checked]:bg-blue-500'
                />
              </div>

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-blue-700'>音声読み上げ</p>
                  <p className='text-sm text-blue-400'>
                    AI応答を音声で読み上げる
                  </p>
                </div>
                <Switch
                  checked={textToSpeech}
                  onCheckedChange={setTextToSpeech}
                  className='data-[state=checked]:bg-blue-500'
                />
              </div>

              {textToSpeech && (
                <div className='py-2 border-t border-blue-100 pt-3'>
                  <p className='font-medium mb-2 text-blue-700'>音声の音量</p>
                  <Slider
                    value={speechVolume}
                    onValueChange={setSpeechVolume}
                    max={100}
                    step={1}
                    className='data-[state=checked]:bg-blue-500'
                  />
                  <div className='flex justify-between mt-1'>
                    <Volume2 className='h-4 w-4 text-blue-400' />
                    <span className='text-sm text-blue-500 font-medium'>
                      {speechVolume[0]}%
                    </span>
                  </div>
                </div>
              )}

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-indigo-700'>ダークモード</p>
                  <p className='text-sm text-indigo-400'>
                    暗い色のテーマを使用する
                  </p>
                </div>
                <Switch
                  checked={darkMode}
                  onCheckedChange={setDarkMode}
                  className='data-[state=checked]:bg-indigo-500'
                />
              </div>

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-indigo-700'>自動保存</p>
                  <p className='text-sm text-indigo-400'>
                    会話を自動的に保存する
                  </p>
                </div>
                <Switch
                  checked={autoSave}
                  onCheckedChange={setAutoSave}
                  className='data-[state=checked]:bg-indigo-500'
                />
              </div>

              <div className='flex items-center justify-between py-2 border-t border-blue-100 pt-3'>
                <div>
                  <p className='font-medium text-indigo-700'>
                    独自の技術資料のみを使用
                  </p>
                  <p className='text-sm text-indigo-400'>
                    AI応答に登録済みナレッジのみを使用する
                  </p>
                </div>
                <Switch
                  checked={useOnlyKnowledgeBase}
                  onCheckedChange={setUseOnlyKnowledgeBase}
                  className='data-[state=checked]:bg-indigo-500'
                />
              </div>

              <div className='py-2 border-t border-blue-100 pt-3 flex justify-end'>
                <Button
                  onClick={saveSettings}
                  className='bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600'
                >
                  <Save className='mr-2 h-4 w-4' />
                  設定を保存
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning Dialog */}
      <WarningDialog
        open={showWarningDialog}
        title='ログアウト確認'
        message='ログアウトしてもよろしいですか？未保存のデータは失われる可能性があります。'
        onCancel={() => setShowWarningDialog(false)}
        onConfirm={confirmLogout}
      />
    </div>
  );
}
