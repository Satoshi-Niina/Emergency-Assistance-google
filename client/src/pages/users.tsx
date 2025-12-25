import { useState, useEffect } from 'react';
import { api, userApi } from '../lib/api';
import { useAuth } from '../context/auth-context';
import { useToast } from '../hooks/use-toast';
import * as XLSX from 'xlsx';

import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Shield,
  UserPlus,
  ArrowLeft,
  User,
  Edit,
  Trash2,
  AlertCircle,
  Search,
  Upload,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';

// ユーザーインターフェース
interface UserData {
  id: string;
  username: string;
  display_name: string;
  role: 'employee' | 'operator' | 'admin';
  department?: string;
  description?: string;
}

// 新規ユーザー作成用インターフェース
interface NewUserData {
  username: string;
  password: string;
  display_name: string;
  role: 'employee' | 'operator' | 'admin';
  department?: string;
  description?: string;
}

export default function UsersPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // すべてのフックを最初に宣言（条件分岐の前に）
  const [error, setError] = useState<Error | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [queryError, setQueryError] = useState<Error | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewUserDialog, setShowNewUserDialog] = useState(false);
  const [showEditUserDialog, setShowEditUserDialog] = useState(false);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [newUser, setNewUser] = useState<Partial<NewUserData>>({
    username: '',
    password: '',
    display_name: '',
    role: 'employee',
    department: '',
    description: '',
  });
  const [editUser, setEditUser] = useState<
    Partial<UserData & { password?: string; description?: string }>
  >({
    id: '',
    username: '',
    display_name: '',
    role: 'employee',
    department: '',
    description: '',
  });

  // ユーザーが未認証の場合はリダイレクト（一般ユーザーでもアクセス可能）
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/chat');
    }
  }, [user, authLoading, navigate]);

  // ユーザー一覧取得
  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setQueryError(null);
      const userData = await userApi.get('/users');
      if (userData.success && userData.data) {
        setUsers(userData.data);
        setFilteredUsers(userData.data);
      } else {
        console.error('❌ 予期しないユーザーデータ形式:', userData);
        throw new Error('ユーザーデータの形式が不正です');
      }
    } catch (error) {
      console.error('❌ ユーザー一覧取得エラー:', error);
      setQueryError(
        error instanceof Error ? error : new Error('Unknown error')
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [user]);

  // 検索機能
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
      return;
    }

    const filtered = users.filter(user => {
      const query = searchQuery.toLowerCase();

      // ワイルドカード検索の処理
      if (query.includes('*')) {
        const pattern = query.replace(/\*/g, '.*');
        const regex = new RegExp(pattern, 'i');

        return (
          regex.test(user.username) ||
          regex.test(user.display_name) ||
          regex.test(user.role) ||
          (user.department && regex.test(user.department)) ||
          (user.description && regex.test(user.description))
        );
      }

      // 通常の部分一致検索
      return (
        user.username.toLowerCase().includes(query) ||
        user.display_name.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        (user.department && user.department.toLowerCase().includes(query)) ||
        (user.description && user.description.toLowerCase().includes(query))
      );
    });

    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  // エラー表示の追加
  useEffect(() => {
    if (queryError) {
      console.error('ユーザー一覧取得エラー詳細:', queryError);

      let errorMessage = 'ユーザー一覧の取得に失敗しました';
      if (queryError instanceof Error) {
        errorMessage = queryError.message;
      }

      toast({
        title: 'エラー',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  }, [queryError, toast]);

  // フォームの値をリセット
  const resetNewUserForm = () => {
    setNewUser({
      username: '',
      password: '',
      display_name: '',
      role: 'employee',
      department: '',
      description: '',
    });
  };

  const resetEditUserForm = () => {
    setEditUser({
      id: '',
      username: '',
      display_name: '',
      role: 'employee',
      department: '',
      password: '',
      description: '',
    });
  };

  // 新規ユーザー作成
  const handleCreateUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    try {
      if (!newUser.username || !newUser.password || !newUser.display_name) {
        toast({
          title: 'エラー',
          description: '必須項目を入力してください',
          variant: 'destructive',
        });
        return;
      }

      const result = await userApi.post('/users', newUser);
      console.log('✅ ユーザー作成成功:', result);

      // APIレスポンスからusers配列を取得して更新
      if (result.users && Array.isArray(result.users)) {
        setUsers(result.users);
        console.log('✅ ユーザー一覧を更新:', result.users.length, '件');
      } else {
        console.warn('⚠️ APIレスポンスにusers配列がありません:', result);
        // フォールバック: 手動で再取得
        await fetchUsers();
      }

      toast({
        title: '成功',
        description: 'ユーザーが作成されました',
      });

      setShowNewUserDialog(false);
      resetNewUserForm();
    } catch (error) {
      console.error('❌ ユーザー作成エラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ユーザーの作成に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // ユーザー編集
  const handleEditUser = (user: UserData) => {
    setEditUser({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      department: user.department || '',
      description: user.description || '',
      password: '', // パスワードフィールドを追加（空文字列）
    });
    setShowEditUserDialog(true);
  };

  // ユーザー更新
  const handleUpdateUser = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    try {
      if (!editUser.id || !editUser.username || !editUser.display_name) {
        toast({
          title: 'エラー',
          description: '必須項目を入力してください',
          variant: 'destructive',
        });
        return;
      }

      // パスワードが空の場合は送信しない（既存のパスワードを維持）
      const updateData = { ...editUser };
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password;
        console.log('[users] パスワードが空のため、パスワード更新をスキップします');
      } else {
        console.log('[users] パスワードを更新します:', {
          passwordLength: updateData.password.length,
          hasSpecialChars: /[&<>"']/.test(updateData.password)
        });
      }

      const result = await userApi.put(`/users/${editUser.id}`, updateData);
      console.log('✅ ユーザー更新成功:', result);

      // APIレスポンスからusers配列を取得して更新
      if (result.users && Array.isArray(result.users)) {
        setUsers(result.users);
        console.log('✅ ユーザー一覧を更新:', result.users.length, '件');
      } else {
        // フォールバック: 手動で再取得
        await fetchUsers();
      }

      toast({
        title: '成功',
        description: 'ユーザーが更新されました',
      });

      setShowEditUserDialog(false);
      resetEditUserForm();
    } catch (error) {
      console.error('❌ ユーザー更新エラー:', error);

      // 認証エラーの場合は特別な処理
      if (error instanceof Error && error.message === 'AUTHENTICATION_ERROR') {
        toast({
          title: '認証エラー',
          description: 'セッションが期限切れです。再度ログインしてください。',
          variant: 'destructive',
        });
        // 認証エラーの場合はログアウトしてログイン画面に遷移
        navigate('/login');
        return;
      }

      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ユーザーの更新に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // ユーザー削除
  const handleDeleteUser = (userId: string) => {
    setSelectedUserId(userId);
    setShowDeleteConfirmDialog(true);
  };

  // ユーザー削除実行
  const confirmDeleteUser = async () => {
    try {
      if (!selectedUserId) return;

      const result = await userApi.delete(`/users/${selectedUserId}`);
      console.log('✅ ユーザー削除成功:', result);

      // APIレスポンスからusers配列を取得して更新
      if (result.users && Array.isArray(result.users)) {
        setUsers(result.users);
        console.log('✅ ユーザー一覧を更新:', result.users.length, '件');
      } else {
        // フォールバック: 手動で再取得
        await fetchUsers();
      }

      toast({
        title: '成功',
        description: 'ユーザーが削除されました',
      });

      setShowDeleteConfirmDialog(false);
      setSelectedUserId(null);

      // ユーザー一覧を再取得（ページリロードではなく状態更新）
      await fetchUsers();
    } catch (error) {
      console.error('❌ ユーザー削除エラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ユーザーの削除に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // エクセルファイルインポート
  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  // インポート実行
  const handleImportUsers = async () => {
    if (!importFile) return;

    try {
      setIsImporting(true);

      const formData = new FormData();
      formData.append('file', importFile);

      const result = await api.post('/users/import', formData);
      setImportResults(result);

      toast({
        title: '成功',
        description: `ユーザーをインポートしました（成功: ${result.successCount}件、失敗: ${result.errorCount}件）`,
      });

      setShowImportDialog(false);
      setImportFile(null);

      // ユーザー一覧を再取得
      window.location.reload();
    } catch (error) {
      console.error('❌ インポートエラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error ? error.message : 'インポートに失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // エクセルファイルエクスポート
  const handleExportUsers = async () => {
    try {
      const ws = XLSX.utils.json_to_sheet(
        users.map(user => ({
          username: user.username,
          display_name: user.display_name,
          role: user.role,
          department: user.department || '',
          description: user.description || '',
        }))
      );

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Users');

      const filename = `users_${new Date().toISOString().split('T')[0]}.xlsx`;

      // File System Access API がサポートされている場合は保存先を選択
      if ('showSaveFilePicker' in window) {
        try {
          const opts = {
            suggestedName: filename,
            types: [{
              description: 'Excel ファイル',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          };

          const handle = await (window as any).showSaveFilePicker(opts);
          const writable = await handle.createWritable();
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          await writable.write(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          await writable.close();

          toast({
            title: '成功',
            description: 'ユーザー一覧をエクスポートしました',
          });
          return;
        } catch (err: any) {
          // ユーザーがキャンセルした場合
          if (err.name === 'AbortError') {
            console.log('ファイル保存がキャンセルされました');
            return;
          }
          console.warn('File System Access API でのエラー、従来の方法にフォールバック:', err);
        }
      }

      // フォールバック: 従来のダウンロード方法
      XLSX.writeFile(wb, filename);

      toast({
        title: '成功',
        description: 'ユーザー一覧をエクスポートしました',
      });
    } catch (error) {
      console.error('❌ エクスポートエラー:', error);
      toast({
        title: 'エラー',
        description: 'エクスポートに失敗しました',
        variant: 'destructive',
      });
    }
  };

  // エラー表示
  if (queryError instanceof Error) {
    return (
      <div className='flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full'>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <h1 className='text-2xl font-bold flex items-center'>
              <Shield className='mr-2 h-6 w-6' />
              ユーザー管理
            </h1>
            <p className='text-neutral-300'>システムの全ユーザーを管理します</p>
          </div>
          <Link to='/settings'>
            <Button variant='outline' size='sm'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              設定に戻る
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className='p-6'>
            <div className='text-center'>
              <AlertCircle className='h-12 w-12 text-red-500 mx-auto mb-4' />
              <h3 className='text-lg font-semibold mb-2'>
                エラーが発生しました
              </h3>
              <p className='text-gray-600 mb-4'>{queryError.message}</p>
              <div className='space-x-2'>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className='mr-2 h-4 w-4' />
                  再読み込み
                </Button>
                <Link to='/chat'>
                  <Button variant='outline'>チャットに戻る</Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 新規ユーザーフォーム（フックは既に上で宣言済み）

  // フォーム送信処理（関数は既に上で定義済み）
  const handleSubmit = handleCreateUser;

  // 入力フィールド更新処理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewUser(prev => ({ ...prev, [name]: value }));
  };

  // セレクト更新処理
  const handleSelectChange = (name: string, value: string) => {
    setNewUser(prev => ({ ...prev, [name]: value }));
  };

  // 編集用セレクト更新処理
  const handleEditSelectChange = (name: string, value: string) => {
    setEditUser(prev => ({ ...prev, [name]: value }));
  };

  // エクセルファイル選択処理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // ファイル形式チェック
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      const validExtensions = ['.xlsx', '.xls'];

      const isValidType =
        validTypes.includes(file.type) ||
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

      if (!isValidType) {
        toast({
          title: 'ファイル形式エラー',
          description:
            'エクセルファイル（.xlsx, .xls）のみアップロード可能です',
          variant: 'destructive',
        });
        return;
      }

      setImportFile(file);
    }
  };

  // エクセルインポート処理
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!importFile) {
      toast({
        title: 'ファイルエラー',
        description: 'エクセルファイルを選択してください',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setImportResults(null);

    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const result = await api.post('/users/import-excel', formData);

      if (result.success) {
        setImportResults(result.results);
        toast({
          title: 'インポート完了',
          description: `成功: ${result.results.success}件, 失敗: ${result.results.failed}件`,
        });

        // ユーザー一覧を再取得
        const fetchUsers = async () => {
          try {
            const userData = await userApi.get('/users');
            if (userData.success && userData.data) {
              setUsers(userData.data);
              setFilteredUsers(userData.data);
            }
          } catch (error) {
            console.error('ユーザー一覧再取得エラー:', error);
          }
        };

        fetchUsers();
      } else {
        throw new Error(result.error || 'インポートに失敗しました');
      }
    } catch (error) {
      console.error('エクセルインポートエラー:', error);
      toast({
        title: 'インポートエラー',
        description:
          error instanceof Error
            ? error.message
            : 'インポート中にエラーが発生しました',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // エクセルテンプレートダウンロード
  const handleDownloadTemplate = () => {
    const templateData = [
      [
        'username',
        'password',
        'display_name',
        'role',
        'department',
        'description',
      ],
      [
        'user1',
        'Password123!',
        'ユーザー1',
        'employee',
        '営業部',
        '一般ユーザー',
      ],
      ['admin1', 'Admin123!', '管理者1', 'admin', '管理部', 'システム管理者'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');

    XLSX.writeFile(wb, 'user_import_template.xlsx');
  };

  // 編集用入力フィールド更新処理
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditUser(prev => ({ ...prev, [name]: value }));
  };

  // ユーザー編集準備（関数は既に上で定義済み）

  // ユーザー削除実行（関数は既に上で定義済み）
  const handleDeleteConfirm = confirmDeleteUser;

  // 編集フォーム送信処理（関数は既に上で定義済み）
  const handleEditSubmit = handleUpdateUser;

  // 管理者でない場合のローディング表示
  if (!user || (user && user.role !== 'admin')) {
    return <div>Loading...</div>;
  }

  return (
    <div className='flex-1 overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full'>
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold flex items-center'>
            <Shield className='mr-2 h-6 w-6' />
            ユーザー管理
          </h1>
          <p className='text-neutral-300'>システムの全ユーザーを管理します</p>
        </div>

        <div className='flex space-x-2'>
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button variant='outline'>
                <Upload className='mr-2 h-4 w-4' />
                エクセルインポート
              </Button>
            </DialogTrigger>
          </Dialog>
          <Dialog open={showNewUserDialog} onOpenChange={setShowNewUserDialog}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className='mr-2 h-4 w-4' />
                新規ユーザー作成
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新規ユーザー作成</DialogTitle>
                <DialogDescription>
                  新しいユーザーアカウントを作成します。
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit}>
                <div className='grid gap-4 py-4'>
                  <div className='grid gap-2'>
                    <Label htmlFor='username'>ユーザー名</Label>
                    <Input
                      id='username'
                      name='username'
                      value={newUser.username}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className='grid gap-2'>
                    <Label htmlFor='password'>パスワード</Label>
                    <Input
                      id='password'
                      name='password'
                      type='password'
                      value={newUser.password}
                      onChange={handleInputChange}
                      required
                    />
                    <p className='text-sm text-gray-500'>
                      パスワードは8文字以上で、大文字・小文字・数字・記号をそれぞれ1文字以上含めてください
                    </p>
                  </div>

                  <div className='grid gap-2'>
                    <Label htmlFor='display_name'>表示名</Label>
                    <Input
                      id='display_name'
                      name='display_name'
                      value={newUser.display_name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div className='grid gap-2'>
                    <Label htmlFor='department'>部署</Label>
                    <Input
                      id='department'
                      name='department'
                      value={newUser.department || ''}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className='grid gap-2'>
                    <Label htmlFor='description'>説明</Label>
                    <Input
                      id='description'
                      name='description'
                      value={newUser.description || ''}
                      onChange={handleInputChange}
                      placeholder='ユーザーの説明（任意）'
                    />
                  </div>

                  <div className='grid gap-2'>
                    <Label htmlFor='role'>権限</Label>
                    <Select
                      value={newUser.role}
                      onValueChange={value => handleSelectChange('role', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='権限を選択' />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='employee'>一般ユーザー</SelectItem>
                        <SelectItem value='operator'>運用管理</SelectItem>
                        <SelectItem value='admin'>システム管理者</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setShowNewUserDialog(false)}
                  >
                    キャンセル
                  </Button>
                  <Button type='submit'>作成</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Link to='/settings'>
            <Button variant='outline' size='sm'>
              <ArrowLeft className='mr-2 h-4 w-4' />
              設定に戻る
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className='pb-2'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-lg flex items-center'>
              <User className='mr-2 h-5 w-5' />
              ユーザー一覧
            </CardTitle>
            <div className='flex items-center space-x-2'>
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
                <Input
                  type='text'
                  placeholder='ユーザー検索（*でワイルドカード）'
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className='pl-10 w-64'
                />
              </div>
              {searchQuery && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setSearchQuery('')}
                >
                  クリア
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='flex flex-col items-center justify-center p-8'>
              <RefreshCw className='h-8 w-8 animate-spin text-blue-500 mb-4' />
              <p className='text-gray-600'>ユーザー一覧を読み込み中...</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ユーザー名</TableHead>
                    <TableHead>表示名</TableHead>
                    <TableHead>権限</TableHead>
                    <TableHead>部署</TableHead>
                    <TableHead>説明</TableHead>
                    <TableHead className='text-right'>アクション</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers && filteredUsers.length > 0 ? (
                    filteredUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.display_name}</TableCell>
                        <TableCell>
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${
                              user.role === 'admin'
                                ? 'bg-red-100 text-red-800'
                                : user.role === 'operator'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {user.role === 'admin' ? 'システム管理者' : user.role === 'operator' ? '運用管理' : '一般ユーザー'}
                          </span>
                        </TableCell>
                        <TableCell>{user.department || '-'}</TableCell>
                        <TableCell>{user.description || '-'}</TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => handleEditUser(user)}
                            >
                              <Edit className='h-4 w-4' />
                            </Button>
                            <Button
                              variant='outline'
                              size='sm'
                              onClick={() => handleDeleteUser(user.id)}
                              className='text-red-500 hover:text-red-700'
                            >
                              <Trash2 className='h-4 w-4' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className='text-center'>
                        {searchQuery
                          ? '検索条件に一致するユーザーが見つかりません'
                          : 'ユーザーが見つかりません'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {searchQuery && (
                <div className='mt-4 text-sm text-gray-500'>
                  検索結果: {filteredUsers.length}件 / 全{users.length}件
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ユーザー編集ダイアログ */}
      <Dialog open={showEditUserDialog} onOpenChange={setShowEditUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザー編集</DialogTitle>
            <DialogDescription>
              ユーザーアカウント情報を編集します。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit}>
            <div className='grid gap-4 py-4'>
              <div className='grid gap-2'>
                <Label htmlFor='edit-username'>ユーザー名</Label>
                <Input
                  id='edit-username'
                  name='username'
                  value={editUser.username}
                  onChange={handleEditInputChange}
                  required
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='edit-display_name'>表示名</Label>
                <Input
                  id='edit-display_name'
                  name='display_name'
                  value={editUser.display_name}
                  onChange={handleEditInputChange}
                  required
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='edit-password'>
                  新しいパスワード（変更する場合のみ）
                </Label>
                <Input
                  id='edit-password'
                  name='password'
                  type='password'
                  value={editUser.password || ''}
                  onChange={handleEditInputChange}
                  placeholder='パスワードを変更しない場合は空欄のまま'
                />
                <p className='text-sm text-gray-500 mt-1'>
                  ※パスワードを変更しない場合は空のままにしてください
                </p>
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='edit-department'>部署</Label>
                <Input
                  id='edit-department'
                  name='department'
                  value={editUser.department || ''}
                  onChange={handleEditInputChange}
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='edit-description'>説明</Label>
                <Input
                  id='edit-description'
                  name='description'
                  value={editUser.description || ''}
                  onChange={handleEditInputChange}
                  placeholder='ユーザーの説明（任意）'
                />
              </div>

              <div className='grid gap-2'>
                <Label htmlFor='edit-role'>権限</Label>
                <Select
                  value={editUser.role}
                  onValueChange={value => handleEditSelectChange('role', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='権限を選択' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='employee'>一般ユーザー</SelectItem>
                    <SelectItem value='operator'>運用管理</SelectItem>
                    <SelectItem value='admin'>システム管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setShowEditUserDialog(false)}
              >
                キャンセル
              </Button>
              <Button type='submit'>更新</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ユーザー削除確認ダイアログ */}
      <Dialog
        open={showDeleteConfirmDialog}
        onOpenChange={setShowDeleteConfirmDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <AlertCircle className='h-5 w-5 mr-2 text-red-500' />
              ユーザー削除の確認
            </DialogTitle>
            <DialogDescription>
              このユーザーを削除すると、関連するすべてのデータが削除されます。この操作は元に戻せません。
            </DialogDescription>
          </DialogHeader>

          <div className='py-4 space-y-2'>
            <p className='text-center font-medium'>
              本当にこのユーザーを削除しますか？
            </p>
            <div className='bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800'>
              <p className='flex items-start'>
                <AlertCircle className='h-4 w-4 mr-2 mt-0.5 flex-shrink-0' />
                <span>
                  <strong>注意:</strong>{' '}
                  チャット、メッセージ、ドキュメントなど、このユーザーに関連するすべてのデータが削除されます。
                  ユーザーがチャットやドキュメントを持っている場合、それらも同時に削除されます。
                </span>
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowDeleteConfirmDialog(false)}
            >
              キャンセル
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={handleDeleteConfirm}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* エクセルインポートダイアログ */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center'>
              <Upload className='mr-2 h-5 w-5' />
              エクセルファイルからユーザー一括インポート
            </DialogTitle>
            <DialogDescription>
              エクセルファイルからユーザーを一括でインポートします。
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4'>
            {/* テンプレートダウンロード */}
            <div className='bg-blue-50 border border-blue-200 rounded-md p-4'>
              <h4 className='font-medium text-blue-900 mb-2'>
                テンプレートファイル
              </h4>
              <p className='text-sm text-blue-700 mb-3'>
                エクセルファイルの形式に合わせてテンプレートをダウンロードしてください。
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={handleDownloadTemplate}
                className='text-blue-700 border-blue-300 hover:bg-blue-100'
              >
                <Download className='mr-2 h-4 w-4' />
                テンプレートをダウンロード
              </Button>
            </div>

            {/* ファイルアップロード */}
            <form onSubmit={handleImportSubmit}>
              <div className='space-y-4'>
                <div>
                  <Label htmlFor='excel-file'>エクセルファイルを選択</Label>
                  <Input
                    id='excel-file'
                    type='file'
                    accept='.xlsx,.xls'
                    onChange={handleFileSelect}
                    className='mt-1'
                  />
                  <p className='text-sm text-gray-500 mt-1'>
                    対応形式: .xlsx, .xls（最大5MB）
                  </p>
                </div>

                {importFile && (
                  <div className='bg-green-50 border border-green-200 rounded-md p-3'>
                    <p className='text-sm text-green-700'>
                      選択されたファイル: {importFile.name} (
                      {(importFile.size / 1024 / 1024).toFixed(2)}MB)
                    </p>
                  </div>
                )}

                {/* インポート結果表示 */}
                {importResults && (
                  <div className='bg-gray-50 border border-gray-200 rounded-md p-4'>
                    <h4 className='font-medium mb-2'>インポート結果</h4>
                    <div className='space-y-2'>
                      <p className='text-sm'>
                        <span className='text-green-600 font-medium'>
                          成功: {importResults.success}件
                        </span>
                        {importResults.failed > 0 && (
                          <span className='text-red-600 font-medium ml-4'>
                            失敗: {importResults.failed}件
                          </span>
                        )}
                      </p>

                      {importResults.errors &&
                        importResults.errors.length > 0 && (
                          <div>
                            <p className='text-sm font-medium text-red-600 mb-2'>
                              エラー詳細:
                            </p>
                            <div className='max-h-40 overflow-y-auto space-y-1'>
                              {importResults.errors.map(
                                (error: string, index: number) => (
                                  <p
                                    key={index}
                                    className='text-xs text-red-600 bg-red-50 p-2 rounded'
                                  >
                                    {error}
                                  </p>
                                )
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => {
                      setShowImportDialog(false);
                      setImportFile(null);
                      setImportResults(null);
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button type='submit' disabled={!importFile || isImporting}>
                    {isImporting ? 'インポート中...' : 'インポート実行'}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
