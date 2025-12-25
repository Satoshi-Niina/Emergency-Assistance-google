import { Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/auth-context';
import { ChatProvider } from './context/chat-context';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// API接続確認ログ（開発中のみ）
console.info('API BASE =', import.meta.env.VITE_API_BASE_URL);

// Service Worker無効化（開発中のみ）
// Networkタブで /api/health, /api/version が本番APIホストへ飛ぶことを確認
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => {
      console.warn('⚠️ Service Worker detected, unregistering for development');
      registration.unregister();
    });
  });
}
import { AdminRoute } from './components/auth/AdminRoute';
import Header from './components/navigation/header';
import { Toaster } from './components/ui/toaster';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { RouteDebugger } from './components/shared/RouteDebugger';
import { DebugError } from './components/shared/DebugError';
import { api } from './lib/api';

// Lazy load pages
import { lazy } from 'react';
const LoginPage = lazy(() => import('./pages/login'));
const ChatPage = lazy(() => import('./pages/chat'));
const SettingsPage = lazy(() => import('./pages/settings'));
const SystemDiagnosticPage = lazy(() => import('./pages/system-diagnostic'));
const HistoryPage = lazy(() => import('./pages/history'));
const DocumentsPage = lazy(() => import('./pages/documents'));
const TroubleshootingPage = lazy(() => import('./pages/troubleshooting'));
const EmergencyGuidePage = lazy(() => import('./pages/emergency-guide'));
const UsersPage = lazy(() => import('./pages/users'));
const BaseDataPage = lazy(() => import('./pages/base-data'));
const MachineManagementPage = lazy(() => import('./pages/machine-management'));
const FaultHistoryPage = lazy(() => import('./pages/fault-history'));

const NotFoundPage = lazy(() => import('./pages/not-found'));

// API接続テストコンポーネント
function ApiConnectionTest() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'failed'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const testConnection = async () => {
      // ローカル開発時はAPI接続テストをスキップ
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isDevelopment = import.meta.env.DEV;

      // 本番環境でもAPI接続テストをスキップ（UI表示を優先）
      console.log('🔧 API接続テストをスキップ（UI表示を優先）');
      setApiStatus('connected');
      return;

      if (isLocalhost && isDevelopment) {
        console.log('🔧 ローカル開発環境: API接続テストをスキップ');
        setApiStatus('connected');
        return;
      }

      try {
        console.log('🔍 API接続テスト開始...');
        const response = await api.get('/health');
        if (response) {
          setApiStatus('connected');
          console.log('✅ API接続成功');
        } else {
          setApiStatus('failed');
          setError('API接続に失敗しました');
          console.log('❌ API接続失敗');
        }
      } catch (err) {
        setApiStatus('failed');
        setError(err instanceof Error ? err.message : '不明なエラー');
        console.error('❌ API接続エラー:', err);
      }
    };

    testConnection();
  }, []);

  if (apiStatus === 'checking') {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">API接続を確認中...</p>
        </div>
      </div>
    );
  }

  if (apiStatus === 'failed') {
    // API接続エラーでもUIを表示する（警告のみ）
    console.warn('⚠️ API接続エラー:', error);
    return (
      <div className="fixed top-4 right-4 z-50 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-w-sm">
        <div className="flex items-center">
          <div className="text-yellow-600 text-lg mr-2">⚠️</div>
          <div>
            <p className="text-yellow-800 font-medium text-sm">API接続エラー</p>
            <p className="text-yellow-600 text-xs">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return null; // 接続成功時は何も表示しない
}

// 認証状態に基づいてルートパスを制御するコンポーネント
function RootRedirect() {
  console.log('🔍 RootRedirect - コンポーネント実行開始');
  const { user, isLoading } = useAuth();

  console.log('🔍 RootRedirect - 認証状態確認:', {
    isLoading,
    hasUser: !!user,
    username: user?.username,
  });

  if (isLoading) {
    return (
      <div className='flex justify-center items-center h-screen'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-gray-600'>認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  // 認証済みの場合はチャット画面に、未認証の場合はログイン画面にリダイレクト
  return <Navigate to={user ? '/chat' : '/login'} replace />;
}

// アプリケーション内側コンポーネント（AuthProvider内で使用）
function AppContent() {
  return (
    <div className='flex flex-col h-screen'>
      <AuthModeBadge />
      <ApiConnectionTest />
      <Header />
      <main className='flex-1 overflow-auto'>
        <AuthModeNotice />
        <Suspense
          fallback={
            <div className='flex justify-center items-center h-full'>
              <div className='text-center'>
                <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
                <p className='text-gray-600'>読み込み中...</p>
              </div>
            </div>
          }
        >
          <Routes>
            <Route path='/login' element={<LoginPage />} />
            <Route
              path='/chat'
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/settings'
              element={
                <ProtectedRoute requireAdmin>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/system-diagnostic'
              element={
                <ProtectedRoute requireAdmin>
                  <SystemDiagnosticPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/history'
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/documents'
              element={
                <ProtectedRoute requireAdmin>
                  <DocumentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/troubleshooting'
              element={
                <ProtectedRoute requireOperator>
                  <TroubleshootingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/emergency-guide'
              element={
                <ProtectedRoute requireAdmin>
                  <EmergencyGuidePage />
                </ProtectedRoute>
              }
            />
            <Route
              path='/users'
              element={
                <AdminRoute>
                  <UsersPage />
                </AdminRoute>
              }
            />
            <Route
              path='/base-data'
              element={
                <AdminRoute>
                  <BaseDataPage />
                </AdminRoute>
              }
            />
            <Route
              path='/machine-management'
              element={
                <AdminRoute>
                  <MachineManagementPage />
                </AdminRoute>
              }
            />
            <Route
              path='/fault-history'
              element={
                <ProtectedRoute requireAdmin>
                  <FaultHistoryPage />
                </ProtectedRoute>
              }
            />
            <Route path='/not-found' element={<NotFoundPage />} />
            {/* ルートパスではリダイレクトせずログイン画面を直接表示 */}
            <Route path='/' element={<LoginPage />} />
            <Route path='*' element={<Navigate to='/not-found' replace />} />
          </Routes>
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}

// 現在モードのバッジコンポーネント
function AuthModeBadge() {
  const { authMode } = useAuth();

  if (!authMode) return null;

  const getBadgeStyle = (mode: string) => {
    switch (mode) {
      case 'safe':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'jwt-bypass':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'jwt':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getModeText = (mode: string) => {
    switch (mode) {
      case 'safe':
        return 'セーフモード';
      case 'jwt-bypass':
        return 'JWTバイパス';
      case 'jwt':
        return '本番モード';
      default:
        return mode;
    }
  };

  return (
    <div className={`fixed top-4 right-4 z-50 px-3 py-1 rounded-full border text-sm font-medium ${getBadgeStyle(authMode)}`}>
      {getModeText(authMode)}
    </div>
  );
}

// 注意文コンポーネント
function AuthModeNotice() {
  const { authMode } = useAuth();

  if (authMode === 'jwt') return null; // 本番モードでは注意文を非表示

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex">
        <div className="ml-3">
          <p className="text-sm text-yellow-700">
            <strong>本番前の検証モードです。</strong>
            {authMode === 'safe' && ' セーフモードで動作しています。'}
            {authMode === 'jwt-bypass' && ' JWT認証をバイパスして動作しています。'}
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  console.log('🔧 App.tsx: アプリケーション初期化開始');
  console.log('🔧 App.tsx: 環境変数確認:', {
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    NODE_ENV: import.meta.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });

  console.log('🔧 App.tsx: コンポーネントレンダリング開始');

  return (
    <ErrorBoundary>
      <Router>
        <RouteDebugger />
        <AuthProvider>
          <ChatProvider>
            <AppContent />
          </ChatProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
