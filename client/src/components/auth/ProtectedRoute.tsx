import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireOperator?: boolean;
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requireOperator = false,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  console.log('🔍 ProtectedRoute - 認証状態確認:', {
    isLoading,
    hasUser: !!user,
    username: user?.username,
    role: user?.role,
    requireAdmin,
    requireOperator,
    currentPath: location.pathname,
    timestamp: new Date().toISOString(),
  });

  // 認証状態読み込み中
  if (isLoading) {
    console.log('⏳ ProtectedRoute - 認証状態読み込み中...');
    return (
      <div className='flex justify-center items-center h-screen'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-gray-600'>認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  // 未認証の場合はログインページにリダイレクト
  if (!user) {
    console.log('🚫 ProtectedRoute - 未認証、ログインページにリダイレクト');
    return <Navigate to='/login' state={{ from: location }} replace />;
  }

  // 管理者権限が必要で、管理者でない場合
  if (requireAdmin && user.role !== 'admin') {
    console.log('🚫 ProtectedRoute - 管理者権限が必要ですが、権限がありません');
    return <Navigate to='/chat' replace />;
  }

  // 運用管理者以上の権限が必要で、権限がない場合
  if (requireOperator && user.role !== 'admin' && user.role !== 'operator') {
    console.log('🚫 ProtectedRoute - 運用管理者以上の権限が必要ですが、権限がありません');
    return <Navigate to='/chat' replace />;
  }

  console.log('✅ ProtectedRoute - 認証OK、コンテンツを表示');
  return <>{children}</>;
}
