import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import FaultHistoryManager from '../components/fault-history/fault-history-manager';
import { saveFromChatExport, getFaultHistoryImageUrl, type FaultHistoryItem } from '../lib/api/fault-history-api';
import { Printer, Edit, Save, X } from 'lucide-react';

// 履歴詳細表示コンポーネント
function HistoryDetailView({ history }: { history: FaultHistoryItem }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({
    title: history.title,
    description: history.description || '',
    machineType: history.machineType || '',
    machineNumber: history.machineNumber || '',
    office: history.office || '',
    category: history.category || '',
  });

  const handleSave = async () => {
    try {
      // TODO: 保存API実装
      alert('保存機能は実装中です');
      setIsEditing(false);
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存に失敗しました');
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const imagesHtml = history.images && history.images.length > 0
      ? `
        <div class="images-section">
          <h3>関連画像</h3>
          <div class="images-grid">
            ${history.images.map(img => `
              <div class="image-item">
                <img src="${getFaultHistoryImageUrl(img)}" alt="${img.description || img.originalFileName}" />
                <p>${img.description || img.originalFileName}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `
      : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>故障履歴印刷 - ${editedData.title}</title>
          <style>
            @media print {
              @page { size: A4; margin: 20mm; }
            }
            body {
              font-family: 'Yu Gothic', 'Meiryo', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              border-bottom: 3px solid #2563eb;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            h2 {
              color: #2563eb;
              margin-top: 30px;
              border-left: 4px solid #2563eb;
              padding-left: 10px;
            }
            h3 {
              color: #1e40af;
              margin-top: 20px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              margin: 20px 0;
            }
            .info-item {
              padding: 10px;
              background: #f3f4f6;
              border-radius: 4px;
            }
            .info-label {
              font-weight: bold;
              color: #6b7280;
              font-size: 0.875rem;
            }
            .info-value {
              color: #111827;
              margin-top: 4px;
            }
            .images-section {
              margin: 30px 0;
            }
            .images-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 20px;
              margin-top: 15px;
            }
            .image-item {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 10px;
              text-align: center;
            }
            .image-item img {
              max-width: 100%;
              height: auto;
              border-radius: 4px;
              margin-bottom: 8px;
            }
            .image-item p {
              font-size: 0.875rem;
              color: #6b7280;
            }
            .keywords {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
              margin: 10px 0;
            }
            .keyword {
              background: #dbeafe;
              color: #1e40af;
              padding: 4px 12px;
              border-radius: 16px;
              font-size: 0.875rem;
            }
            .json-section {
              background: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 15px;
              margin-top: 20px;
              overflow-x: auto;
            }
            .json-section pre {
              margin: 0;
              font-size: 0.75rem;
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <h1>${editedData.title}</h1>

          ${editedData.description ? `<p style="margin-bottom: 20px;">${editedData.description}</p>` : ''}

          <h2>基本情報</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">機種</div>
              <div class="info-value">${editedData.machineType || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">機械番号</div>
              <div class="info-value">${editedData.machineNumber || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">事業所</div>
              <div class="info-value">${editedData.office || 'N/A'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">カテゴリ</div>
              <div class="info-value">${editedData.category || 'N/A'}</div>
            </div>
          </div>

          ${history.keywords && history.keywords.length > 0 ? `
            <h3>キーワード</h3>
            <div class="keywords">
              ${history.keywords.map(kw => `<span class="keyword">${kw}</span>`).join('')}
            </div>
          ` : ''}

          ${imagesHtml}

          <h2>メタデータ</h2>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">ID</div>
              <div class="info-value">${history.id}</div>
            </div>
            <div class="info-item">
              <div class="info-label">保存モード</div>
              <div class="info-value">${history.storageMode}</div>
            </div>
            <div class="info-item">
              <div class="info-label">作成日時</div>
              <div class="info-value">${new Date(history.createdAt).toLocaleString()}</div>
            </div>
            <div class="info-item">
              <div class="info-label">更新日時</div>
              <div class="info-value">${new Date(history.updatedAt).toLocaleString()}</div>
            </div>
          </div>

          <div class="json-section">
            <h3>元データ (JSON)</h3>
            <pre>${JSON.stringify(history.jsonData, null, 2)}</pre>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={editedData.title}
                onChange={(e) => setEditedData({ ...editedData, title: e.target.value })}
                className="text-2xl font-bold"
                placeholder="タイトル"
              />
              <Textarea
                value={editedData.description}
                onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
                placeholder="説明"
                rows={2}
              />
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold">{editedData.title}</h2>
              {editedData.description && (
                <p className="text-gray-600 mt-1">{editedData.description}</p>
              )}
            </>
          )}
        </div>
        <div className="flex space-x-2 ml-4">
          {isEditing ? (
            <>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1" />
                保存
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-1" />
                キャンセル
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <Edit className="w-4 h-4 mr-1" />
                編集
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-1" />
                印刷
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本情報 */}
        <Card>
          <CardHeader>
            <CardTitle>基本情報</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">機種</label>
                  <Input
                    value={editedData.machineType}
                    onChange={(e) => setEditedData({ ...editedData, machineType: e.target.value })}
                    placeholder="機種"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">機械番号</label>
                  <Input
                    value={editedData.machineNumber}
                    onChange={(e) => setEditedData({ ...editedData, machineNumber: e.target.value })}
                    placeholder="機械番号"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">事業所</label>
                  <Input
                    value={editedData.office}
                    onChange={(e) => setEditedData({ ...editedData, office: e.target.value })}
                    placeholder="事業所"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
                  <Input
                    value={editedData.category}
                    onChange={(e) => setEditedData({ ...editedData, category: e.target.value })}
                    placeholder="カテゴリ"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">機種</label>
                  <p className="mt-1">{editedData.machineType || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">機械番号</label>
                  <p className="mt-1">{editedData.machineNumber || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">事業所</label>
                  <p className="mt-1">{editedData.office || 'N/A'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">カテゴリ</label>
                  <p className="mt-1">{editedData.category || 'N/A'}</p>
                </div>
              </div>
            )}

            {history.keywords && history.keywords.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">キーワード</label>
                <div className="flex flex-wrap gap-1">
                  {history.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* メタデータ */}
        <Card>
          <CardHeader>
            <CardTitle>メタデータ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">ID:</span> {history.id}
              </div>
              <div>
                <span className="font-medium">保存モード:</span> {history.storageMode}
              </div>
              <div>
                <span className="font-medium">作成日時:</span> {new Date(history.createdAt).toLocaleString()}
              </div>
              <div>
                <span className="font-medium">更新日時:</span> {new Date(history.updatedAt).toLocaleString()}
              </div>
              {history.images && (
                <div>
                  <span className="font-medium">関連画像:</span> {history.images.length}件
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 画像一覧 */}
      {history.images && history.images.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>関連画像 ({history.images.length}件)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {history.images.map((image) => (
                <div key={image.id} className="border rounded-lg p-2 hover:shadow-lg transition-shadow">
                  <img
                    src={getFaultHistoryImageUrl(image)}
                    alt={image.description || image.originalFileName}
                    className="w-full h-32 object-cover rounded mb-2"
                    onError={(e) => {
                      e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23ddd%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23999%22%3ENo Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {image.description || image.originalFileName}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 元のJSONデータ */}
      <Card>
        <CardHeader>
          <CardTitle>元データ (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-100 rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-xs">
              {JSON.stringify(history.jsonData, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function FaultHistoryPage() {
  const [selectedHistory, setSelectedHistory] = useState<FaultHistoryItem | null>(null);
  const [importTestLoading, setImportTestLoading] = useState(false);

  // チャットエクスポートのテストインポート
  const handleTestImport = async () => {
    try {
      setImportTestLoading(true);

      // テスト用のダミーデータ
      const testExportData = {
        title: 'テスト故障履歴',
        description: 'システムテスト用の故障履歴データ',
        machineType: 'MT-100',
        machineNumber: 'M001',
        office: 'テスト事業所',
        category: '故障対応',
        conversationHistory: [
          {
            role: 'user',
            content: '機械が異音を立てています。対処方法を教えてください。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'assistant',
            content: '異音の状況を確認させていただきます。まず、機械の電源をOFFにして安全を確保してください。',
            timestamp: new Date().toISOString(),
          },
          {
            role: 'user',
            content: 'データから見ても確認できませんが、画像を添付します。',
            timestamp: new Date().toISOString(),
          },
        ],
        metadata: {
          exportedAt: new Date().toISOString(),
          version: '1.0',
        },
      };

      const result = await saveFromChatExport(testExportData, {
        title: 'テスト故障履歴 - ' + new Date().toLocaleString(),
        description: 'システムテスト用にインポートされた故障履歴',
      });

      alert(`✅ テストインポート完了: ID=${result.id}, 画像数=${result.imageCount}`);
    } catch (error) {
      console.error('テストインポートエラー:', error);
      alert('❌ テストインポートに失敗しました');
    } finally {
      setImportTestLoading(false);
    }
  };

  const handleHistorySelect = (history: FaultHistoryItem) => {
    setSelectedHistory(history);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">故障履歴データベース</h1>
            <p className="text-gray-600 mt-2">
              故障履歴をデータベースで管理し、GPTのナレッジベースとして活用します
            </p>
          </div>
          <div className="space-x-2">
            <Button
              onClick={handleTestImport}
              disabled={importTestLoading}
              variant="outline"
            >
              {importTestLoading ? 'テスト中...' : 'テストインポート'}
            </Button>
          </div>
        </div>

        {/* システム説明 */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-800 mb-2">システム概要</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• 故障履歴はJSON形式でデータベースに保存されます</li>
            <li>• 添付画像は knowledge-base/images/chat-exports に保存されます</li>
            <li>• 基礎データ管理（GPTのナレッジ）として活用されます</li>
            <li>• 本番環境では環境変数 FAULT_HISTORY_STORAGE_MODE=database で切り替わります</li>
            <li>• ローカル環境では現在ファイルモードで動作中です</li>
          </ul>
        </div>
      </div>

      <Tabs defaultValue="manager" className="w-full">
        <TabsList>
          <TabsTrigger value="manager">故障履歴管理</TabsTrigger>
          <TabsTrigger value="detail">選択中の履歴</TabsTrigger>
        </TabsList>

        <TabsContent value="manager">
          <FaultHistoryManager onHistorySelect={handleHistorySelect} />
        </TabsContent>

        <TabsContent value="detail">
          {selectedHistory ? (
            <HistoryDetailView history={selectedHistory} />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>故障履歴を選択してください</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
