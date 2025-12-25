import { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Search, Edit, Trash2, ArrowLeft, Settings, Wrench, Hash, Filter } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

interface MachineType {
  id: string;
  machine_type_name: string;
  created_at?: string;
}

interface Machine {
  id: string;
  machine_number: string;
  machine_type_id: string;
  machine_type_name?: string;
  created_at?: string;
}

export default function MachineManagementPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [machineTypes, setMachineTypes] = useState<MachineType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [filteredMachines, setFilteredMachines] = useState<Machine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [isMachineDialogOpen, setIsMachineDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<MachineType | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  const [newTypeName, setNewTypeName] = useState('');
  const [newMachineNumber, setNewMachineNumber] = useState('');
  const [selectedMachineType, setSelectedMachineType] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/chat');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = machines;
    if (searchQuery.trim()) {
      filtered = filtered.filter(machine =>
        machine.machine_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (machine.machine_type_name && machine.machine_type_name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    if (selectedTypeFilter !== 'all') {
      filtered = filtered.filter(machine => machine.machine_type_id === selectedTypeFilter);
    }
    setFilteredMachines(filtered);
  }, [machines, searchQuery, selectedTypeFilter]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { buildApiUrl } = await import('../lib/api');

      const typesResponse = await fetch(buildApiUrl('/machines/machine-types'));
      if (!typesResponse.ok) {
        throw new Error('機種データ取得エラー');
      }
      const typesResult = await typesResponse.json();
      if (typesResult.success) {
        const typesData = typesResult.machineTypes || typesResult.data || [];
        const formattedTypes = typesData.map((type: any) => ({
          id: type.id,
          machine_type_name: type.name || type.machine_type_name || type.category
        }));
        setMachineTypes(formattedTypes);
      }

      const machinesResponse = await fetch(buildApiUrl('/machines'));
      if (!machinesResponse.ok) {
        throw new Error('機械データ取得エラー');
      }
      const machinesResult = await machinesResponse.json();
      if (machinesResult.success) {
        const machinesData = machinesResult.machines || machinesResult.data || [];
        const formattedMachines = machinesData.map((machine: any) => ({
          id: machine.id,
          machine_number: machine.machine_number,
          machine_type_id: machine.machine_type_id,
          machine_type_name: machine.type || machine.machine_type_name
        }));
        setMachines(formattedMachines);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      setError(error instanceof Error ? error : new Error('Unknown error'));
      toast({
        title: 'エラー',
        description: 'データの取得に失敗しました。データベースに接続してください。',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTypeSubmit = async () => {
    try {
      const { buildApiUrl } = await import('../lib/api');
      const url = editingType
        ? buildApiUrl(`/machines/machine-types/${editingType.id}`)
        : buildApiUrl('/machines/machine-types');

      const method = editingType ? 'PUT' : 'POST';
      const body = { machine_type_name: newTypeName };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '機種の保存に失敗しました');
      }

      const result = await response.json();
      if (result.success) {
        toast({
          title: editingType ? '更新完了' : '追加完了',
          description: result.message || '機種を保存しました',
        });
        setIsTypeDialogOpen(false);
        setNewTypeName('');
        setEditingType(null);
        fetchData();
      } else {
        throw new Error(result.error || '機種の保存に失敗しました');
      }
    } catch (error) {
      console.error('機種保存エラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : '機種の保存に失敗しました',
        variant: 'destructive',
      });
    }
  };

  const handleTypeDelete = async (typeId: string) => {
    // 関連する機械番号があるかチェック
    const relatedMachines = machines.filter(machine => machine.machine_type_id === typeId);

    let cascade = false;

    if (relatedMachines.length > 0) {
      const machineNumbers = relatedMachines.slice(0, 3).map(m => m.machine_number).join(', ');
      const moreText = relatedMachines.length > 3 ? `他${relatedMachines.length - 3}個` : '';

      // 3つの選択肢を提供
      const choice = window.confirm(
        `この機種には${relatedMachines.length}個の機械番号（${machineNumbers}${moreText}）が登録されています。\n\n` +
        `OKを選択: 機種と関連する機械番号をすべて削除\n` +
        `キャンセル: 削除を中止`
      );

      if (!choice) {
        return; // キャンセルが選択された場合
      }

      cascade = true; // 一括削除を選択
    } else {
      if (!confirm('この機種を削除してもよろしいですか？')) {
        return;
      }
    }

    try {
      const { buildApiUrl } = await import('../lib/api');
      const url = cascade
        ? buildApiUrl(`/machines/machine-types/${typeId}?cascade=true`)
        : buildApiUrl(`/machines/machine-types/${typeId}`);

      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();

        // 関連する機械番号が存在する場合の詳細メッセージ
        if (errorData.details && errorData.details.machines) {
          const machineList = errorData.details.machines.join(', ');
          const moreText = errorData.details.hasMore ? '他' : '';
          throw new Error(`${errorData.message}\n関連機械番号: ${machineList}${moreText}`);
        }

        throw new Error(errorData.message || errorData.error || '機種の削除に失敗しました');
      }

      const result = await response.json();
      if (result.success) {
        toast({
          title: '削除完了',
          description: result.message || '機種を削除しました',
        });
        fetchData();
      } else {
        throw new Error(result.message || result.error || '機種の削除に失敗しました');
      }
    } catch (error) {
      console.error('機種削除エラー:', error);
      toast({
        title: '削除できません',
        description: error instanceof Error ? error.message : '機種の削除に失敗しました',
        variant: 'destructive',
      });
    }
  };

  const handleMachineSubmit = async () => {
    try {
      if (!selectedMachineType) {
        toast({
          title: 'エラー',
          description: '機種を選択してください',
          variant: 'destructive',
        });
        return;
      }

      if (!newMachineNumber.trim()) {
        toast({
          title: 'エラー',
          description: '機械番号を入力してください',
          variant: 'destructive',
        });
        return;
      }

      const { buildApiUrl } = await import('../lib/api');
      const url = editingMachine
        ? buildApiUrl(`/machines/${editingMachine.id}`)
        : buildApiUrl('/machines');

      const method = editingMachine ? 'PUT' : 'POST';
      const body = {
        machine_number: newMachineNumber.trim(),
        machine_type_id: selectedMachineType,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '機械番号の保存に失敗しました');
      }

      const result = await response.json();
      if (result.success) {
        toast({
          title: editingMachine ? '更新完了' : '追加完了',
          description: result.message || '機械番号を保存しました',
        });
        setIsMachineDialogOpen(false);
        setNewMachineNumber('');
        setSelectedMachineType('');
        setEditingMachine(null);
        fetchData();
      } else {
        throw new Error(result.error || '機械番号の保存に失敗しました');
      }
    } catch (error) {
      console.error('機械番号保存エラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : '機械番号の保存に失敗しました',
        variant: 'destructive',
      });
    }
  };

  const handleMachineDelete = async (machineId: string) => {
    if (!confirm('この機械番号を削除してもよろしいですか？')) {
      return;
    }

    try {
      const { buildApiUrl } = await import('../lib/api');
      const response = await fetch(buildApiUrl(`/machines/${machineId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '機械番号の削除に失敗しました');
      }

      const result = await response.json();
      if (result.success) {
        toast({
          title: '削除完了',
          description: '機械番号を削除しました',
        });
        fetchData();
      } else {
        throw new Error(result.error || '機械番号の削除に失敗しました');
      }
    } catch (error) {
      console.error('機械番号削除エラー:', error);
      toast({
        title: 'エラー',
        description: error instanceof Error ? error.message : '機械番号の削除に失敗しました',
        variant: 'destructive',
      });
    }
  };

  const resetTypeDialog = () => {
    setNewTypeName('');
    setEditingType(null);
    setIsTypeDialogOpen(false);
  };

  const resetMachineDialog = () => {
    setNewMachineNumber('');
    setSelectedMachineType('');
    setEditingMachine(null);
    setIsMachineDialogOpen(false);
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-blue-600">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            <Wrench className="mr-3 h-8 w-8 text-indigo-500" />
            機種機械番号管理
          </h1>
          <p className="text-blue-600 mt-2">機種と機械番号の詳細管理を行います</p>
        </div>
        <Link to="/settings">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            設定に戻る
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border border-blue-200 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardTitle className="text-xl flex items-center justify-between">
              <div className="flex items-center">
                <Settings className="mr-2 h-6 w-6" />
                機種管理
              </div>
              <Dialog open={isTypeDialogOpen} onOpenChange={setIsTypeDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingType(null);
                      setNewTypeName('');
                    }}
                    className="bg-white text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    追加
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingType ? '機種を編集' : '機種を追加'}</DialogTitle>
                    <DialogDescription>
                      {editingType ? '機種名を編集してください' : '新しい機種名を入力してください'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="type-name">機種名</Label>
                      <Input
                        id="type-name"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        placeholder="機種名を入力"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleTypeSubmit();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetTypeDialog}>
                      キャンセル
                    </Button>
                    <Button onClick={handleTypeSubmit}>
                      {editingType ? '更新' : '追加'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-blue-800">登録済み機種</h3>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {machineTypes.length === 0 ? (
                <div className="text-center py-8 text-blue-600">
                  <p>データベースに接続して機種データを取得してください</p>
                </div>
              ) : (
                machineTypes.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100"
                  >
                    <span className="font-medium text-blue-800">{type.machine_type_name}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingType(type);
                          setNewTypeName(type.machine_type_name);
                          setIsTypeDialogOpen(true);
                        }}
                        className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTypeDelete(type.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-blue-200 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
            <CardTitle className="text-xl flex items-center justify-between">
              <div className="flex items-center">
                <Hash className="mr-2 h-6 w-6" />
                機械管理
              </div>
              <Dialog open={isMachineDialogOpen} onOpenChange={setIsMachineDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingMachine(null);
                      setNewMachineNumber('');
                      setSelectedMachineType('');
                    }}
                    className="bg-white text-indigo-600 hover:bg-indigo-50"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    追加
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingMachine ? '機械番号を編集' : '機械番号を追加'}</DialogTitle>
                    <DialogDescription>
                      {editingMachine ? '機械番号を編集してください' : '新しい機械番号を入力してください'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label htmlFor="machine-type">機種</Label>
                      <Select
                        value={selectedMachineType}
                        onValueChange={setSelectedMachineType}
                        disabled={!!editingMachine}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="機種を選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {machineTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.machine_type_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="machine-number">機械番号</Label>
                      <Input
                        id="machine-number"
                        value={newMachineNumber}
                        onChange={(e) => setNewMachineNumber(e.target.value)}
                        placeholder="機械番号を入力"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleMachineSubmit();
                          }
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={resetMachineDialog}>
                      キャンセル
                    </Button>
                    <Button onClick={handleMachineSubmit}>
                      {editingMachine ? '更新' : '追加'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="機械番号または機種で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="機種で絞り込み" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全ての機種</SelectItem>
                  {machineTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.machine_type_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>機械番号</TableHead>
                    <TableHead>機種</TableHead>
                    <TableHead className="w-24">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMachines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-blue-600">
                        データベースに接続して機械データを取得してください
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMachines.map((machine) => (
                      <TableRow key={machine.id}>
                        <TableCell className="font-medium">{machine.machine_number}</TableCell>
                        <TableCell>{machine.machine_type_name}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingMachine(machine);
                                setNewMachineNumber(machine.machine_number);
                                setSelectedMachineType(machine.machine_type_id);
                                setIsMachineDialogOpen(true);
                              }}
                              className="h-8 w-8 p-0 text-indigo-600 hover:text-indigo-800"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMachineDelete(machine.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">エラーが発生しました: {error.message}</p>
        </div>
      )}
    </div>
  );
}
