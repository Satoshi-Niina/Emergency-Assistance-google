import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  fetchFaultHistoryList,
  fetchFaultHistoryDetail,
  fetchFaultHistoryStats,
  importFromExports,
  saveFaultHistory,
  getFaultHistoryImageUrl,
  type FaultHistoryItem,
  type FaultHistorySearchFilters,
  type FaultHistoryStats,
} from '../../lib/api/fault-history-api';
// Toast通知の代替
const showToast = {
  success: (message: string) => alert(`✅ ${message}`),
  error: (message: string) => alert(`❌ ${message}`),
};

interface FaultHistoryManagerProps {
  onHistorySelect?: (history: FaultHistoryItem) => void;
}

export default function FaultHistoryManager({ onHistorySelect }: FaultHistoryManagerProps) {
  const [historyItems, setHistoryItems] = useState<FaultHistoryItem[]>([]);
  const [stats, setStats] = useState<FaultHistoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchFilters, setSearchFilters] = useState<FaultHistorySearchFilters>({
    limit: 20,
    offset: 0,
  });
  const [selectedHistory, setSelectedHistory] = useState<FaultHistoryItem | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // 故障履歴一覧を取得
  const loadHistoryList = async (filters: FaultHistorySearchFilters = searchFilters) => {
    try {
      setLoading(true);
      const response = await fetchFaultHistoryList(filters);

      if (filters.offset === 0) {
        setHistoryItems(response.data);
      } else {
        setHistoryItems(prev => [...prev, ...response.data]);
      }

      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (error) {
      console.error('故障履歴取得エラー:', error);
      showToast.error('故障履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 統計情報を取得
  const loadStats = async () => {
    try {
      const statsData = await fetchFaultHistoryStats();
      setStats(statsData);
    } catch (error) {
      console.error('統計情報取得エラー:', error);
    }
  };

  // 故障履歴詳細を取得
  const loadHistoryDetail = async (id: string) => {
    try {
      const detail = await fetchFaultHistoryDetail(id);
      setSelectedHistory(detail);
    } catch (error) {
      console.error('故障履歴詳細取得エラー:', error);
      showToast.error('故障履歴詳細の取得に失敗しました');
    }
  };

  // エクスポートからインポート
  const handleImportFromExports = async (force = false) => {
    try {
      setImportLoading(true);
      const result = await importFromExports(force);

      if (result.imported > 0) {
        showToast.success(`${result.imported}件の履歴をインポートしました`);
        await loadHistoryList({ ...searchFilters, offset: 0 });
        await loadStats();
      } else {
        showToast.success('インポートする新しい履歴はありませんでした');
      }

      if (result.errors && result.errors.length > 0) {
        console.warn('インポートエラー:', result.errors);
        showToast.error(`${result.errors.length}件のファイルでエラーが発生しました`);
      }

      setShowImportDialog(false);
    } catch (error) {
      console.error('インポートエラー:', error);
      showToast.error('インポートに失敗しました');
    } finally {
      setImportLoading(false);
    }
  };

  // 検索フィルターの更新
  const updateFilters = (newFilters: Partial<FaultHistorySearchFilters>) => {
    const updatedFilters = { ...searchFilters, ...newFilters, offset: 0 };
    setSearchFilters(updatedFilters);
    loadHistoryList(updatedFilters);
  };

  // さらに読み込み
  const loadMore = () => {
    const newOffset = (searchFilters.offset || 0) + (searchFilters.limit || 20);
    const updatedFilters = { ...searchFilters, offset: newOffset };
    setSearchFilters(updatedFilters);
    loadHistoryList(updatedFilters);
  };

  // 初期データ読み込み
  useEffect(() => {
    loadHistoryList();
    loadStats();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">故障履歴管理</h1>
        <div className="space-x-2">
          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                エクスポートから移行
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>エクスポートファイルから移行</DialogTitle>
                <DialogDescription>
                  knowledge-base/exportsディレクトリにあるJSONファイルをデータベースに移行します。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  この操作により、エクスポートファイルがデータベースに保存され、画像ファイルが適切な場所に移動されます。
                </p>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => handleImportFromExports(false)}
                    disabled={importLoading}
                  >
                    {importLoading ? '移行中...' : '新規のみ移行'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleImportFromExports(true)}
                    disabled={importLoading}
                  >
                    {importLoading ? '移行中...' : '全て強制移行'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">履歴一覧</TabsTrigger>
          <TabsTrigger value="stats">統計情報</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {/* 検索フィルター */}
          <Card>
            <CardHeader>
              <CardTitle>検索・フィルター</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <Input
                  placeholder="キーワード検索"
                  value={searchFilters.keyword || ''}
                  onChange={(e) => updateFilters({ keyword: e.target.value })}
                />
                <Input
                  placeholder="機種"
                  value={searchFilters.machineType || ''}
                  onChange={(e) => updateFilters({ machineType: e.target.value })}
                />
                <Input
                  placeholder="機械番号"
                  value={searchFilters.machineNumber || ''}
                  onChange={(e) => updateFilters({ machineNumber: e.target.value })}
                />
                <Input
                  placeholder="事業所"
                  value={searchFilters.office || ''}
                  onChange={(e) => updateFilters({ office: e.target.value })}
                />
                <Input
                  placeholder="カテゴリ"
                  value={searchFilters.category || ''}
                  onChange={(e) => updateFilters({ category: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 履歴一覧 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {historyItems.map((item) => (
              <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-2">{item.title}</CardTitle>
                    <Badge variant={item.storageMode === 'database' ? 'default' : 'secondary'}>
                      {item.storageMode === 'database' ? 'DB' : 'ファイル'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {/* 画像プレビュー */}
                    {item.images && item.images.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {item.images.slice(0, 3).map((image, idx) => (
                          <div key={image.fileName || idx} className="relative aspect-square">
                            <img
                              src={getFaultHistoryImageUrl(image)}
                              alt={image.description || image.originalFileName || image.fileName}
                              className="w-full h-full object-cover rounded border"
                              onError={(e) => {
                                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                              }}
                            />
                          </div>
                        ))}
                        {item.images.length > 3 && (
                          <div className="flex items-center justify-center bg-gray-100 rounded border text-sm text-gray-600">
                            +{item.images.length - 3}
                          </div>
                        )}
                      </div>
                    )}

                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {item.machineType && (
                        <Badge variant="outline" className="text-xs">
                          {item.machineType}
                        </Badge>
                      )}
                      {item.machineNumber && (
                        <Badge variant="outline" className="text-xs">
                          {item.machineNumber}
                        </Badge>
                      )}
                      {item.office && (
                        <Badge variant="outline" className="text-xs">
                          {item.office}
                        </Badge>
                      )}
                    </div>

                    {item.keywords && item.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.keywords.slice(0, 3).map((keyword, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {keyword}
                          </Badge>
                        ))}
                        {item.keywords.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{item.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      <div className="space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => loadHistoryDetail(item.id)}
                        >
                          詳細
                        </Button>
                        {onHistorySelect && (
                          <Button
                            size="sm"
                            onClick={() => onHistorySelect(item)}
                          >
                            選択
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ローディング・もっと読み込み */}
          {loading && <div className="text-center py-4">読み込み中...</div>}

          {!loading && hasMore && (
            <div className="text-center">
              <Button onClick={loadMore} variant="outline">
                さらに読み込む ({historyItems.length} / {total})
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>総件数</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{stats.total}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>30日以内</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-blue-600">{stats.recentCount}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>機種別</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.byMachineType).slice(0, 5).map(([type, count]) => (
                      <div key={type} className="flex justify-between">
                        <span className="text-sm">{type}</span>
                        <Badge>{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>事業所別</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(stats.byOffice).slice(0, 5).map(([office, count]) => (
                      <div key={office} className="flex justify-between">
                        <span className="text-sm">{office}</span>
                        <Badge>{count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 詳細表示ダイアログ */}
      <Dialog open={!!selectedHistory} onOpenChange={() => setSelectedHistory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedHistory && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedHistory.title}</DialogTitle>
                <DialogDescription>
                  {selectedHistory.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* 基本情報 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold">機種</h4>
                    <p>{selectedHistory.machineType || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">機械番号</h4>
                    <p>{selectedHistory.machineNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">事業所</h4>
                    <p>{selectedHistory.office || 'N/A'}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold">カテゴリ</h4>
                    <p>{selectedHistory.category || 'N/A'}</p>
                  </div>
                </div>

                {/* キーワード */}
                {selectedHistory.keywords && selectedHistory.keywords.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">キーワード</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedHistory.keywords.map((keyword, index) => (
                        <Badge key={index} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* 画像 */}
                {selectedHistory.images && selectedHistory.images.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">関連画像</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedHistory.images.map((image) => (
                        <div key={image.id} className="border rounded-lg p-2">
                          <img
                            src={getFaultHistoryImageUrl(image)}
                            alt={image.description || image.originalFileName}
                            className="w-full h-32 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                            }}
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {image.originalFileName}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* JSON データプレビュー */}
                <div>
                  <h4 className="font-semibold mb-2">元データ</h4>
                  <pre className="bg-gray-100 p-4 rounded text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(selectedHistory.jsonData, null, 2)}
                  </pre>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
