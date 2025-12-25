import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  login as authLogin,
  logout as authLogout,
  getCurrentUser,
} from '../lib/auth-unified';

interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'operator' | 'user';
  department?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  authMode: 'safe' | 'jwt-bypass' | 'jwt' | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const normalizeRole = (role?: string | null): User['role'] => {
  if (!role) return 'user';
  const normalized = role.toString().trim().toLowerCase();
  
  // システム管理者
  if (normalized === 'admin' || normalized === 'administrator' || normalized === 'システム管理者') {
    return 'admin';
  }
  
  // 運用管理者
  if (normalized === 'operator' || normalized === '運用管理者') {
    return 'operator';
  }
  
  // 一般ユーザー
  return 'user';
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState<'safe' | 'jwt-bypass' | 'jwt' | null>(null);

  // AUTH_BYPASS設定を確認
  const authBypass = import.meta.env.VITE_AUTH_BYPASS === 'true';

  // 初期認証状態チェック
  useEffect(() => {
    const checkAuthStatus = async () => {
      // バイパスモード時は仮ユーザーで初期化
      if (authBypass) {
        setUser({
          id: 'demo',
          username: 'demo',
          displayName: 'Demo User',
          role: normalizeRole('user')
        });
        setIsLoading(false);
        setAuthChecked(true);
        return;
      }

      try {
        setIsLoading(true);

        // 開発時は強制的にログイン画面を表示（認証状態をリセット）
        // console.log('🔐 開発モード: ログイン画面を強制表示');
        // localStorage.removeItem('authToken');
        // sessionStorage.removeItem('authToken');
        // クッキーもクリア
        // document.cookie = 'authToken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        // setUser(null);

        // localStorageからトークンを確認
        const token = localStorage.getItem('authToken');
        if (token) {
          console.log('🔐 トークンが見つかりました、認証状態を確認中...');
          try {
            // トークンが有効かどうか確認
            const userData = await getCurrentUser();
            if (userData && userData.success && userData.user) {
              console.log('✅ トークンが有効、ユーザー情報を復元');
              setUser({
                id: userData.user.id,
                username: userData.user.username,
                displayName: userData.user.displayName || userData.user.display_name,
                role: normalizeRole(userData.user.role),
                department: userData.user.department,
              });
            } else {
              console.log('❌ トークンが無効、クリア');
              localStorage.removeItem('authToken');
              setUser(null);
            }
          } catch (error) {
            console.log('❌ トークン検証エラー、クリア:', error);
            localStorage.removeItem('authToken');
            setUser(null);
          }
        } else {
          console.log('ℹ️ トークンが見つかりません、ログイン画面を表示');
          setUser(null);
        }
      } catch (error) {
        console.warn('⚠️ 認証状態確認エラー:', error);
        setUser(null);
      } finally {
        setIsLoading(false);
        setAuthChecked(true);
      }
    };

    checkAuthStatus();
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    console.log('🔐 ログイン試行開始:', { username });

    // バイパスモード時は仮ログイン
    if (authBypass) {
      setUser({
        id: 'demo',
        username: username,
        displayName: username,
        role: normalizeRole('user')
      });
      return;
    }

    try {
      setIsLoading(true);

      // 直接APIを呼び出してログイン
      const userData = await authLogin({ username, password });
      console.log('🔍 ログインレスポンス:', userData);

      if (userData && userData.success && userData.user) {
        // トークンをlocalStorageに保存（tokenまたはaccessTokenのいずれかを使用）
        const token = userData.token || userData.accessToken;
        if (token) {
          localStorage.setItem('authToken', token);
          console.log('✅ トークンをlocalStorageに保存');
        }

        setUser({
          id: userData.user.id,
          username: userData.user.username,
          displayName: userData.user.displayName || userData.user.display_name,
          role: normalizeRole(userData.user.role),
          department: userData.user.department,
        });
      } else {
        console.log('❌ ログインレスポンスが無効:', userData);
        throw new Error('ログインに失敗しました');
      }
    } catch (error) {
      console.error('❌ ログインエラー:', error);
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    console.log('🔐 ログアウト処理開始');

    try {
      await authLogout();
      console.log('✅ ログアウト成功');
    } catch (error) {
      console.error('❌ ログアウトエラー:', error);
    } finally {
      // トークンをlocalStorageから削除
      localStorage.removeItem('authToken');
      console.log('✅ トークンをlocalStorageから削除');
      setUser(null);
    }
  };

  // console.log('🔧 AuthProvider レンダリング:', {
  //   user: user ? user.username : null,
  //   isLoading,
  //   authChecked,
  //   authMode,
  //   timestamp: new Date().toISOString(),
  // });

  // 認証状態確認中は常にローディング画面を表示（nullレンダリング禁止）
  if (isLoading) {
    // console.log('⏳ AuthProvider: 認証状態確認中、ローディング画面を表示');
    return (
      <AuthContext.Provider value={{ user, isLoading, login, logout, authMode }}>
        <div className='flex justify-center items-center h-screen'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
            <p className='text-gray-600'>認証状態を確認中...</p>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  // console.log('✅ AuthProvider: 認証状態確認完了、子コンポーネントを表示');
  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, authMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
