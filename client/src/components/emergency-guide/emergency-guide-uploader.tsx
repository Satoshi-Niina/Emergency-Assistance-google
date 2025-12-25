import React, { useState, useRef } from 'react';
import { useToast } from '../../hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader2, FileText, CheckCircle, Sparkles, Wand2 } from 'lucide-react';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { Separator } from '../../components/ui/separator';
import { buildApiUrl } from '../../lib/api/config';

interface EmergencyGuideUploaderProps {
  onUploadSuccess?: (guideId: string) => void;
  onGeneratingChange?: (isGenerating: boolean) => void;
}

const EmergencyGuideUploader: React.FC<EmergencyGuideUploaderProps> = ({
  onUploadSuccess,
  onGeneratingChange,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [saveOriginalFile, setSaveOriginalFile] = useState(false); // デフォルトで保存しない（コスト最適化）
  // 自動フロー生成は常に有効
  const autoGenerateFlow = true;

  // キーワードベースのフロー生成機能
  const [keywordsInput, setKeywordsInput] = useState<string>('');
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false);

  // キーワードからフローを生成する
  const generateFlowFromKeywords = async () => {
    if (!keywordsInput.trim()) {
      toast({
        title: '入力エラー',
        description: 'キーワードを入力してください',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGeneratingFlow(true);
      onGeneratingChange?.(true);

      toast({
        title: 'フロー生成中',
        description: `キーワード「${keywordsInput}」からフローを生成しています...`,
      });

      // Google API機能のみを使用するため、ChatGPT APIは削除されました
      // 基本的なフロー生成を使用します
      let response;
      try {
        response = await fetch(
          buildApiUrl('/flow-generator/keywords'),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              keywords: keywordsInput
            }),
          }
        );
      } catch (error) {
        // フロー生成が失敗した場合のフォールバック
        console.log(
          'フロー生成が失敗しました'
        );
        response = await fetch(
          buildApiUrl('/flow-generator/keywords'),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keywords: keywordsInput }),
          }
        );
      }

      const data = await response.json();
      console.log('APIからの応答データ:', data);

      if (!response.ok) {
        // エラーレスポンスの場合
        const errorMessage = data.error || '生成に失敗しました';
        const errorDetails = data.details || '';

        // その他のエラーメッセージの表示
        toast({
          title: '生成エラー',
          description: errorMessage,
          variant: 'destructive',
        });

        // 詳細情報をコンソールに出力
        console.error('フロー生成エラー詳細:', {
          error: errorMessage,
          details: errorDetails,
          status: response.status,
        });
        return;
      }

      if (data.success && data.flowData) {
        // 生成完了の目立つ通知
        toast({
          title: '✅ フロー生成完了！',
          description: `「${data.flowData.title || 'タイトルなし'}」の生成が完了しました。`,
          duration: 5000,
        });

        // 生成されたフローの詳細ページに移動するためのイベントを発火
        if (onUploadSuccess) {
          onUploadSuccess(data.flowData.id);
        }

        // キーワード入力をクリア
        setKeywordsInput('');
      } else {
        throw new Error('フローデータの形式が無効です');
      }
    } catch (error) {
      console.error('フロー生成エラー:', error);
      toast({
        title: '生成エラー',
        description:
          error instanceof Error ? error.message : 'フローの生成に失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingFlow(false);
      onGeneratingChange?.(false);
    }
  };

  // クリックしてファイルを選択
  const handleFileSelectClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ファイル選択ハンドラー
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      // 拡張子チェック
      const extension = file.name.toLowerCase().split('.').pop() || '';
      const allowedxtensions = ['pptx', 'ppt', 'xlsx', 'xls', 'pdf', 'json'];

      if (!allowedxtensions.includes(extension)) {
        toast({
          title: '未対応のファイル形式',
          description:
            'PowerPoint(.pptx, .ppt)、xcel(.xlsx, .xls)、PDF(.pdf)、またはJSON(.json)ファイルのみアップロード可能です',
          variant: 'destructive',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  // アップロード処理
  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'ファイルが選択されていません',
        description: 'アップロードするファイルを選択してください',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('saveOriginalFile', saveOriginalFile.toString());
      formData.append('autoGenerateFlow', autoGenerateFlow.toString());

      // 模擬的な進捗表示用のインターバル
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await fetch(
        buildApiUrl('/emergency-guide/process'),
        {
          method: 'POST',
          body: formData,
        }
      );

      clearInterval(progressInterval);

      if (!response.ok) {
        throw new Error('ファイルのアップロードに失敗しました');
      }

      const data = await response.json();

      if (data.success) {
        setUploadProgress(100);
        setUploadSuccess(true);

        toast({
          title: 'アップロード成功',
          description: 'ファイルが正常に処理されました',
        });

        if (onUploadSuccess) {
          onUploadSuccess(data.guideId);
        }

        // 数秒後にリセット
        setTimeout(() => {
          setSelectedFile(null);
          setUploadSuccess(false);
          setUploadProgress(0);
        }, 3000);
      } else {
        throw new Error(data.error || 'ファイル処理中にエラーが発生しました');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ファイルのアップロードに失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className='w-full'>
      <CardHeader>
        <CardTitle>応急処置フロー生成</CardTitle>
        <CardDescription>
          キーワードやファイルから応急処置フローを生成・編集できます
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='keywords' className='w-full'>
          <TabsList className='grid w-full grid-cols-2 mb-6'>
            <TabsTrigger value='keywords'>
              キーワードから甞成
            </TabsTrigger>
            <TabsTrigger value='file'>
              ファイルから生成
            </TabsTrigger>
          </TabsList>

          <TabsContent value='keywords' className='space-y-4'>
            <div className='space-y-4'>
              <div>
                <h3 className='text-lg font-medium mb-2'>発生事象キーワード</h3>
                <Textarea
                  placeholder='具体的な事象や状況、機器名などを入力してください！自動的に判断します。'
                  value={keywordsInput}
                  onChange={e => setKeywordsInput(e.target.value)}
                  className='min-h-[100px]'
                />
                <div className='flex justify-between text-xs text-gray-500 mt-1'>
                  <span>{keywordsInput.length}/100文字</span>
                </div>
              </div>

              <Button
                className='w-full'
                variant='default'
                onClick={generateFlowFromKeywords}
                disabled={!keywordsInput.trim()}
              >
                {isGeneratingFlow ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    生成中...
                  </>
                ) : (
                  <>
                    <Wand2 className='mr-2 h-4 w-4' />
                    GPTフロー生成
                  </>
                )}
              </Button>

              {/* 生成中の状態表示 */}
              {isGeneratingFlow && (
                <div className='flex items-center justify-center space-x-2 p-3 bg-blue-50 rounded-md border border-blue-200'>
                  <Loader2 className='h-4 w-4 animate-spin text-blue-600' />
                  <p className='text-sm font-medium text-blue-900'>
                    AIが「{keywordsInput}」のフローを生成中です...
                  </p>
                </div>
              )}

              <div className='flex items-center space-x-2 p-3 bg-blue-50 rounded-md border border-blue-200'>
                <Sparkles className='h-5 w-5 text-blue-500 flex-shrink-0' />
                <div className='text-sm text-gray-700'>
                  <p className='font-medium mb-1'>主な流れ:</p>
                  <ol className='list-decimal list-inside space-y-1 pl-1'>
                    <li>キーワードを入力してGPTフロー生成</li>
                    <li>生成された最適な応急処置フローを選択</li>
                    <li>選択したフローは以下の方法で編集可能：</li>
                    <ul className='list-disc list-inside pl-6 space-y-1'>
                      <li>
                        「テキスト編集」タブ：フローの内容をテキストベースで編集
                      </li>
                      <li>
                        「キャラクター編集」タブ：フローチャートとして視覚的に編集
                      </li>
                    </ul>
                    <li className='font-semibold text-blue-700 mt-2'>
                      ※ 画像は自動生成されません。編集画面で各ステップに個別に追加してください。
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='file' className='space-y-4'>
            <div>
              {/* ファイル入力 (非表示) */}
              <input
                type='file'
                ref={fileInputRef}
                onChange={handleFileChange}
                accept='.pptx,.ppt,.xlsx,.xls,.pdf,.json'
                className='hidden'
              />

              <div className='mb-4'>
                <h3 className='text-lg font-medium mb-2'>
                  ファイルアップロード
                </h3>
                <Button
                  variant='outline'
                  className='w-full h-24 border-dashed'
                  onClick={handleFileSelectClick}
                >
                  <div className='flex flex-col items-center'>
                    <FileText className='h-8 w-8 text-gray-400 mb-2' />
                    <p className='text-gray-700 font-medium'>
                      クリックしてファイルを選択
                    </p>
                    <p className='text-xs text-gray-500 mt-1'>
                      PowerPoint、xcel、PDF、またはJSONファイル
                    </p>
                  </div>
                </Button>
              </div>

              {selectedFile && (
                <div className='mb-4 p-3 bg-indigo-50 rounded-md border border-indigo-200'>
                  <div className='flex items-center'>
                    <FileText className='h-5 w-5 text-indigo-600 mr-2' />
                    <div>
                      <p className='font-medium text-indigo-700'>
                        {selectedFile.name}
                      </p>
                      <p className='text-xs text-gray-500'>
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* データ保存オプション */}
              <div className='flex mb-4'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='saveOriginalFile'
                    checked={saveOriginalFile}
                    onCheckedChange={checked =>
                      setSaveOriginalFile(checked === true)
                    }
                  />
                  <Label
                    htmlFor='saveOriginalFile'
                    className='text-sm text-gray-700'
                  >
                    元のファイルも保存する（通常は不要）
                    <span className='text-xs text-gray-500 block mt-1'>
                      Gemini検索用データは自動保存されます。監査用に原本が必要な場合のみチェック
                    </span>
                  </Label>
                </div>
              </div>

              {/* 自動フロー生成の情報表示 */}
              <div className='flex items-center space-x-2 mb-4 bg-amber-50 p-2 rounded-md border border-amber-200'>
                <Sparkles className='h-4 w-4 text-amber-500 flex-shrink-0' />
                <p className='text-sm text-gray-700'>
                  アップロード後、自動的に応急処置フローが生成されます
                </p>
              </div>

              {/* アップロードボタン */}
              <Button
                className='w-full'
                onClick={handleUpload}
                disabled={!selectedFile || uploadSuccess}
              >
                {isUploading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    処理中...
                  </>
                ) : uploadSuccess ? (
                  <>
                    <CheckCircle className='mr-2 h-4 w-4' />
                    完了しました
                  </>
                ) : (
                  'アップロードして処理'
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EmergencyGuideUploader;
