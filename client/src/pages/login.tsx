import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '../lib/schema';
import { useAuth } from '../context/auth-context';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from '../components/ui/card';
import {
  Form,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';
import { Input } from '../components/ui/input';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { login, user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ログイン済みユーザーはチャット画面にリダイレクト
  useEffect(() => {
    if (!authLoading && user && user.username) {
      navigate('/chat', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    if (isLoading) return;
    if (!username.trim() || !password) {
      setErrorMessage('ユーザー名/パスワードを入力してください');
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      navigate('/chat');
    } catch (e: any) {
      let errorMsg = 'ログインに失敗しました';
      if (e?.message) {
        if (e.message.includes('500')) {
          errorMsg = 'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。';
        } else if (e.message.includes('401')) {
          errorMsg = 'ユーザー名またはパスワードが正しくありません。';
        } else if (e.message.includes('ネットワーク')) {
          errorMsg = 'ネットワーク接続を確認してください。';
        } else if (e.message.includes('バックエンド')) {
          errorMsg = 'サーバーに接続できません。しばらく時間をおいてから再度お試しください。';
        } else {
          errorMsg = e.message;
        }
      }
      setErrorMessage(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // 認証状態読み込み中の表示
  if (authLoading) {
    return (
      <div className='min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-primary/10 to-primary/5 p-4'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4'></div>
          <p className='text-gray-600'>認証状態を確認中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen w-full flex items-center justify-center bg-gradient-to-b from-primary/10 to-primary/5 p-4'>
      <div className='w-full max-w-2xl'>
        <div className='text-center mb-6'>
          <h1 className='text-2xl font-bold text-primary'>
            応急処置サポートシステム
          </h1>
          <p className='text-neutral-600 mt-2'>Emergency Support System</p>
        </div>
        <Card className='w-full shadow-lg'>
          <CardHeader className='text-center bg-primary text-white rounded-t-lg'>
            <CardTitle className='text-2xl font-bold'>ログイン</CardTitle>
          </CardHeader>
          <CardContent className='pt-6'>
            <Form {...form}>
              <form
                id='login-form'
                onSubmit={onSubmit}
                className='space-y-4'
                noValidate
              >
                <FormItem>
                  <FormLabel>ユーザー名</FormLabel>
                  <FormControl>
                    <Input
                      name='username'
                      placeholder='ユーザー名を入力'
                      autoComplete='off'
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                <FormItem>
                  <FormLabel>パスワード</FormLabel>
                  <FormControl>
                    <Input
                      name='password'
                      type='password'
                      placeholder='パスワードを入力'
                      autoComplete='new-password'
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                {errorMessage && (
                  <div className='p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md'>
                    {errorMessage}
                  </div>
                )}
                {/* システム利用の説明 */}
                <div className='mt-4 space-y-3'>
                  <div className='bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-sm'>
                    <div className='flex items-start gap-3'>
                      <div className='flex-shrink-0 mt-0.5'>
                        <svg className='w-5 h-5 text-blue-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                        </svg>
                      </div>
                      <div className='flex-1'>
                        <h3 className='text-sm font-semibold text-blue-900 mb-1'>
                          ユーザー権限について
                        </h3>
                        <p className='text-sm text-blue-700'>
                          ログインするユーザーの権限（一般ユーザー/管理者）により、利用可能なメニューが異なります。
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className='bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 shadow-sm'>
                    <div className='flex items-start gap-3'>
                      <div className='flex-shrink-0 mt-0.5'>
                        <svg className='w-5 h-5 text-purple-600' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                          <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' />
                        </svg>
                      </div>
                      <div className='flex-1'>
                        <h3 className='text-sm font-semibold text-purple-900 mb-1'>
                          お問い合わせ
                        </h3>
                        <p className='text-sm text-purple-700'>
                          不具合の報告や機能改善のご要望は、<span className='font-medium'>新納</span>までお気軽にご連絡ください。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  type='submit'
                  className='w-full bg-primary'
                  disabled={isLoading}
                  form='login-form'
                >
                  {isLoading ? 'ログイン中...' : 'ログイン'}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className='flex flex-col space-y-2 text-center text-sm text-neutral-500 border-t pt-4 mt-2'>
            <p>システムにログインしてください</p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
