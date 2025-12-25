import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../context/chat-context';
import { useAuth } from '../context/auth-context';
import MessageBubble from '../components/chat/message-bubble';
import MessageInput from '../components/chat/message-input';
import CameraModal from '../components/chat/camera-modal';
import ImagePreviewModal from '../components/chat/image-preview-modal';
import EmergencyGuideDisplay from '../components/emergency-guide/emergency-guide-display';
import KeywordButtons from '../components/troubleshooting/keyword-buttons';
import StepByStepQA from '../components/chat/step-by-step-qa';
import TroubleshootingQABubble from '../components/chat/troubleshooting-qa-bubble';
import SolutionBubble from '../components/chat/solution-bubble';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  RotateCcw,
  Download,
  Upload,
  FileText,
  BookOpen,
  Activity,
  ArrowLeft,
  X,
  Search,
  Send,
  Camera,
  Trash2,
  RefreshCw,
  Brain,
  Wrench,
  Database,
  Save,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '../hooks/use-toast';
import {
  searchTroubleshootingFlows,
  japaneseGuideTitles,
} from '../lib/troubleshooting-search';
import { QAAnswer } from '../lib/qa-flow-manager';
import InteractiveDiagnosisChat from '../components/InteractiveDiagnosisChat';
import { Label } from '@/components/ui/label';

// 診断フロー型定義
interface DiagnosticFlow {
  problemDescription: string;
  machineType: string;
  availableTime: string;
  stepHistory: any[];
}

export default function ChatPage() {
  const { user } = useAuth();
  const {
    messages,
    setMessages,
    sendMessage,
    isLoading,
    clearChatHistory,
    isClearing,
    chatId,
    initializeChat,
    exportChatHistory,
    hasUnexportedMessages,
  } = useChat();

  // 管理者権限の確認
  const isAdmin = user?.role === 'admin';

  const { toast } = useToast();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmergencyGuide, setShowEmergencyGuide] = useState(false);
  const [availableGuides, setAvailableGuides] = useState<any[]>([]);
  const [filteredGuides, setFilteredGuides] = useState<any[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingGuides, setIsLoadingGuides] = useState(false);

  // インタラクティブ診断モードの状態管理
  const [interactiveDiagnosisMode, setInteractiveDiagnosisMode] =
    useState(false);
  // AI支援モードの状態管理
  const [aiSupportMode, setAiSupportMode] = useState(false);
  const [aiSupportStartTime, setAiSupportStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [emergencyStep, setEmergencyStep] = useState<number>(0);
  const [problemType, setProblemType] = useState<string>('');
  // 追加: 機種と機械番号のオートコンプリート状態管理
  const [machineTypes, setMachineTypes] = useState<
    Array<{ id: string; machine_type_name: string }>
  >([]);
  const [machines, setMachines] = useState<
    Array<{ id: string; machine_number: string }>
  >([]);
  const [selectedMachineType, setSelectedMachineType] = useState<string>('');
  const [selectedMachineNumber, setSelectedMachineNumber] =
    useState<string>('');
  const [isLoadingMachineTypes, setIsLoadingMachineTypes] = useState(false);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);

  // オートコンプリート用の状態
  const [machineTypeInput, setMachineTypeInput] = useState('');
  const [machineNumberInput, setMachineNumberInput] = useState('');
  const [showMachineTypeSuggestions, setShowMachineTypeSuggestions] =
    useState(false);
  const [showMachineNumberSuggestions, setShowMachineNumberSuggestions] =
    useState(false);
  const [filteredMachineTypes, setFilteredMachineTypes] = useState<
    Array<{ id: string; machine_type_name: string }>
  >([]);
  const [filteredMachines, setFilteredMachines] = useState<
    Array<{ id: string; machine_number: string }>
  >([]);

  // トラブルシューティングQAの状態管理
  const [troubleshootingMode, setTroubleshootingMode] = useState(false);
  const [troubleshootingSession, setTroubleshootingSession] = useState<{
    problemDescription: string;
    answers: any[];
    currentQuestion?: string;
    currentOptions?: string[];
    reasoning?: string;
  } | null>(null);

  // 機種・機械番号未設定時に保存するメッセージ
  const [pendingMessage, setPendingMessage] = useState<{
    content: string;
    media: any[];
  } | null>(null);
  const [isProcessingPendingMessage, setIsProcessingPendingMessage] = useState(false);

  // ナレッジデータ管理の状態
  const [knowledgeData, setKnowledgeData] = useState<any[]>([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);

  // 機種データの初期読み込み
  useEffect(() => {
    fetchMachineTypes();
    fetchKnowledgeData();
    loadAiAssistSettings().catch(error => {
      console.error('AI支援設定の初期読み込みエラー:', error);
    }); // AI支援設定を初期化時に読み込み
  }, []);

  // 機種データが更新された時にフィルタリングリストも更新
  useEffect(() => {
    console.log('🔍 機種データ更新検知:', {
      machineTypesCount: machineTypes.length,
      machineTypes: machineTypes,
      filteredMachineTypesCount: filteredMachineTypes.length,
    });
    setFilteredMachineTypes(machineTypes);
  }, [machineTypes]);

  // 機械データが更新された時にフィルタリングリストも更新
  useEffect(() => {
    console.log('🔍 機械番号データ更新検知:', {
      machinesCount: machines.length,
      machines: machines,
      filteredMachinesCount: filteredMachines.length,
    });
    setFilteredMachines(machines);
  }, [machines]);

  // ナレッジデータを取得
  const fetchKnowledgeData = async () => {
    try {
      setIsLoadingKnowledge(true);
      // 統一API設定を使用
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/knowledge-base');
      const response = await fetch(apiUrl);

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setKnowledgeData(result.data);
          console.log('✅ ナレッジデータ取得成功', result.data.length + '件');
        } else {
          console.error('❌ ナレッジデータ取得失敗', result.message);
          setKnowledgeData([]);
        }
      } else {
        throw new Error(
          `Failed to fetch knowledge data: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error('❌ ナレッジデータ取得エラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ナレッジデータの取得に失敗しました',
        variant: 'destructive',
      });
      setKnowledgeData([]);
    } finally {
      setIsLoadingKnowledge(false);
    }
  };

  // ナレッジデータのベクトル化処理
  const processKnowledgeData = async () => {
    try {
      setIsLoadingKnowledge(true);
      // 統一API設定を使用
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/knowledge-base/process');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          toast({
            title: '成功',
            description: 'ナレッジデータのベクトル化処理が完了しました',
          });
          // データを再取得
          await fetchKnowledgeData();
        } else {
          throw new Error(result.message || 'ベクトル化処理が失敗しました');
        }
      } else {
        throw new Error(
          `Failed to process knowledge data: ${response.statusText}`
        );
      }
    } catch (error) {
      console.error('❌ ナレッジデータ処理エラー:', error);
      toast({
        title: 'エラー',
        description:
          error instanceof Error
            ? error.message
            : 'ナレッジデータの処理が失敗しました',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingKnowledge(false);
    }
  };

  // ドロップダウンの表示/非表示制御
  useEffect(() => {
    const handleClickOutside = (event: Event) => {
      const target = event.target as Element;
      if (
        !target.closest('#machine-type') &&
        !target.closest('#machine-number') &&
        !target.closest('#machine-type-menu') &&
        !target.closest('#machine-number-menu')
      ) {
        setShowMachineTypeSuggestions(false);
        setShowMachineNumberSuggestions(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // AI支援システムのセッション管理
  const [aiSupportSessionData, setAiSupportSessionData] = useState<{
    answers: string[];
    solution: string;
    knowledgeContext: string[];
    questions: string[];
  } | null>(null);

  // AI支援カスタマイズ設定
  const [aiAssistSettings, setAiAssistSettings] = useState({
    initialPrompt: '何か問題がありましたか？お困りの事象を教えてください。',
    conversationStyle: 'frank',
    questionFlow: {
      step1: '具体的な問題を教えてください',
      step2: 'いつ頃から発生していますか？',
      step3: '作業環境の状況を教えてください',
      step4: '他に気になることはありますか？',
      step5: '緊急度を教えてください'
    },
    branchingConditions: {
      timeCheck: true,
      detailsCheck: true,
      toolsCheck: true,
      safetyCheck: true
    },
    responsePattern: 'step_by_step',
    escalationTime: 20,
    customInstructions: '',
    enableEmergencyContact: true
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // AI支援設定の読み込み
  const loadAiAssistSettings = async () => {
    try {
      const response = await fetch('/api/ai-assist/settings', {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        const settings = result.success ? result.data : result;
        if (settings) {
          setAiAssistSettings(prev => ({
            ...prev,
            ...settings,
            // ネストされたオブジェクトもマージ
            questionFlow: {
              ...prev.questionFlow,
              ...settings.questionFlow,
            },
            branchingConditions: {
              ...prev.branchingConditions,
              ...settings.branchingConditions,
            },
          }));
          // ローカルストレージにもバックアップとして保存
          localStorage.setItem('aiAssistSettings', JSON.stringify(settings));
          console.log('✓ AI支援設定をサーバーから読み込みました:', settings);
          return settings;
        }
      } else {
        // サーバーから取得できない場合は、ローカルストレージから読み込む（フォールバック）
        const saved = localStorage.getItem('aiAssistSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setAiAssistSettings(parsed);
          console.log('✅ AI支援設定をローカルストレージから読み込みました:', parsed);
          return parsed;
        }
      }
    } catch (error) {
      console.warn('AI支援設定読み込みエラー、ローカルストレージから読み込みを試行', error);
      // エラー時はローカルストレージから読み込む（フォールバック）
      try {
        const saved = localStorage.getItem('aiAssistSettings');
        if (saved) {
          const parsed = JSON.parse(saved);
          setAiAssistSettings(parsed);
          console.log('✓ AI支援設定をローカルストレージから読み込みました（フォールバック）', parsed);
          return parsed;
        }
      } catch (_localError) {
        console.error('❌ AI支援設定の読み込みエラー:', _localError);
        // ローカルストレージからの読み込みも失敗した場合はデフォルト値を使用
      }
    }
    return null;
  };

  // localStorageの変更を監視してAI支援設定を再読み込み
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'aiAssistSettings' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setAiAssistSettings(parsed);
          console.log('✅ localStorage変更を検知してAI支援設定を再読み込みしました:', parsed);
        } catch (error) {
          console.error('❌ AI支援設定の再読み込みエラー:', error);
        }
      }
    };

    // 同じウィンドウ内の変更も監視（カスタムイベント）
    const handleCustomStorageChange = async () => {
      const loaded = await loadAiAssistSettings();
      if (loaded) {
        console.log('✅ カスタムイベントでAI支援設定を再読み込みしました:', loaded);
        // 初期メッセージが既に表示されている場合は、最新の設定で更新
        if (aiSupportMode && initialPromptSentRef.current && loaded.initialPrompt) {
          // 最新の設定で初期メッセージを更新
          setMessages((prev: any) => {
            // 最初のai_supportタイプのメッセージを探して更新
            const firstAiSupportIndex = prev.findIndex((m: any) => m.type === 'ai_support');
            if (firstAiSupportIndex !== -1) {
              const updatedMessages = [...prev];
              updatedMessages[firstAiSupportIndex] = {
                ...updatedMessages[firstAiSupportIndex],
                content: loaded.initialPrompt,
              };
              return updatedMessages;
            }
            return prev;
          });
        }
      }
    };

    // 応急復旧マニュアル完了イベントのリスナー
    const handleEmergencyGuideCompleted = (event: CustomEvent) => {
      const { detail } = event;
      console.log('📋 応急復旧マニュアル履歴受信:', detail);

      // マニュアルの実行履歴をメッセージとして追加
      const summaryText = `【応急復旧マニュアル実行履歴】\n\nマニュアル: ${detail.title}\n\n実行したステップ:\n${detail.executedSteps.map((step: any, index: number) => `${index + 1}. ${step.title}\n   ${step.message}${step.selectedCondition ? `\n   選択: ${step.selectedCondition}` : ''}`).join('\n\n')}\n\n${detail.isPartial ? '※ 途中までの実行履歴です' : '完了'}`;

      sendMessage(summaryText, [], false);

      toast({
        title: '履歴を追加しました',
        description: 'マニュアルの実行履歴をチャットに追加しました',
      });
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('aiAssistSettingsChanged', handleCustomStorageChange);
    window.addEventListener('emergency-guide-completed', handleEmergencyGuideCompleted as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('aiAssistSettingsChanged', handleCustomStorageChange);
      window.removeEventListener('emergency-guide-completed', handleEmergencyGuideCompleted as EventListener);
    };
  }, []);

  // 追加: 機種一覧を取得する関数（設定UIと同じAPIを使用）
  const fetchMachineTypes = useCallback(async () => {
    try {
      setIsLoadingMachineTypes(true);
      console.log('🔍 機種一覧取得開始');

      // 統一API設定を使用
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/machines/machine-types');
      console.log('🔍 機種一覧取得URL:', apiUrl);
      console.log('🔍 現在のURL:', window.location.href);
      console.log('🔍 環境変数:', {
        VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
        NODE_ENV: import.meta.env.NODE_ENV,
        MODE: import.meta.env.MODE
      });

      const response = await fetch(apiUrl, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
        credentials: 'include', // セッション維持のため
      });
      console.log('🔍 機種一覧取得レスポンスステータス:', response.status);
      console.log(
        '🔍 機種一覧取得レスポンスヘッダー:',
        Object.fromEntries(response.headers.entries())
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 機種一覧取得結果:', result);
        if (result.success) {
          // APIレスポンス形式に対応（machineTypesキーにデータが入っている）
          const typesData = result.machineTypes || result.data || [];
          console.log('✅ 機種一覧設定完了:', typesData.length, '件');
          console.log('✓ 機種データ:', typesData);

          // データ形式を統一（machine_type_nameフィールドに統一）
          const formattedData = typesData.map((type: any) => ({
            id: type.id,
            machine_type_name: type.name || type.machine_type_name || type.category
          }));

          setMachineTypes(formattedData);
          setFilteredMachineTypes(formattedData); // 初期表示用にも設定

          if (formattedData.length === 0) {
            console.log('⚠️ 機種データが0件です');
          }
        } else {
          console.error('❌ 機種一覧取得成功だがデータが無効:', result);
          setMachineTypes([]);
          setFilteredMachineTypes([]);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ 機種一覧取得エラー:', response.status, errorText);

        if (response.status === 401) {
          console.log('🔐 認証エラーが発生しました。ログインが必要です');
        }

        setMachineTypes([]);
        setFilteredMachineTypes([]);
      }
    } catch (error) {
      console.error('❌ 機種一覧取得エラー:', error);
      setMachineTypes([]);
      setFilteredMachineTypes([]);
    } finally {
      setIsLoadingMachineTypes(false);
      console.log('🔍 機種一覧取得完了 - 最終状態', {
        machineTypesCount: machineTypes.length,
        filteredMachineTypesCount: filteredMachineTypes.length,
      });
    }
  }, []);

  // 機種入力のフィルタリング
  const filterMachineTypes = (input: string) => {
    console.log(
      '🔍 機種フィルタリング開始:',
      input,
      '機種数:',
      machineTypes.length
    );
    if (!input.trim()) {
      console.log('✅ 入力が空のため全機種を表示:', machineTypes.length, '件');
      setFilteredMachineTypes(machineTypes);
      return;
    }

    const filtered = machineTypes.filter(type =>
      type.machine_type_name.toLowerCase().includes(input.toLowerCase())
    );
    console.log('✅ フィルタリング結果:', filtered.length, '件');
    setFilteredMachineTypes(filtered);
  };

  // 機械番号入力のフィルタリング
  const filterMachines = (input: string) => {
    console.log(
      '🔍 機械番号フィルタリング開始',
      input,
      '機械数:',
      machines.length
    );
    if (!input.trim()) {
      console.log('✅ 入力が空のため全機械を表示:', machines.length, '件');
      setFilteredMachines(machines);
      return;
    }

    const filtered = machines.filter(machine =>
      machine.machine_number.toLowerCase().includes(input.toLowerCase())
    );
    console.log('✅ フィルタリング結果:', filtered.length, '件');
    setFilteredMachines(filtered);
  };

  // 機種選択の処理
  const handleMachineTypeSelect = (type: {
    id: string;
    machine_type_name: string;
  }) => {
    console.log('🔍 機種選択処理開始 ===========================');
    console.log('🔍 選択された機種:', type);

    try {
      // バッチ状態更新を使用
      setMachineTypeInput(type.machine_type_name);
      setSelectedMachineType(type.id);
      selectedMachineTypeRef.current = type.id; // refも更新
      setShowMachineTypeSuggestions(false);

      // 機種変更時は機械番号をリセット
      setSelectedMachineNumber('');
      selectedMachineNumberRef.current = ''; // refも更新
      setMachineNumberInput('');
      setMachines([]);
      setFilteredMachines([]);

      // 警告メッセージのrefをリセット（機種が変更されたため）
      lastWarningMessageRef.current = null;

      console.log('✅ 機種選択完了:', type.machine_type_name);

      // 対応する機械番号を取得
      fetchMachines(type.id);
    } catch (error) {
      console.error('❌ 機種選択処理にエラー:', error);
    }
  };

  // 機械番号選択の処理
  const handleMachineNumberSelect = async (machine: {
    id: string;
    machine_number: string;
  }) => {
    console.log('🔍 機械番号選択開始:', machine);

    try {
      // 状態を確実に更新
      setMachineNumberInput(machine.machine_number);
      setShowMachineNumberSuggestions(false);

      console.log('✅ 機械番号選択完了', machine.machine_number);

      // 機械番号変更処理を呼び出し（自動再送信処理を含む）
      await handleMachineNumberChange(machine.id);
    } catch (error) {
      console.error('❌ 機械番号選択処理にエラー:', error);
    }
  };

  // 追加: 特定の機種に紐づく機械番号一覧を取得する関数（設定UIと同じAPIを使用）
  const fetchMachines = useCallback(
    async (typeId: string) => {
      try {
        setIsLoadingMachines(true);
        console.log('🔍 機械番号一覧取得開始 - 機種ID:', typeId);

        // 統一API設定を使用
        const { buildApiUrl } = await import('../lib/api');
        const apiUrl = buildApiUrl(`/machines?type_id=${typeId}`);
        console.log('🔍 機械番号一覧取得URL:', apiUrl);

        const response = await fetch(apiUrl, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
          credentials: 'include', // セッション維持のため
        });
        console.log(
          '🔍 機械番号一覧取得レスポンスステータス:',
          response.status
        );

        if (response.ok) {
          const result = await response.json();
          console.log('✅ 機械番号一覧取得結果:', result);
          if (result.success) {
            // APIレスポンス形式に対応（machinesキーにデータが入っている）
            const machinesData = result.machines || result.data || [];
            console.log('✅ 機械番号一覧設定完了:', machinesData.length, '件');
            console.log('✅ 機械番号データ:', machinesData);

            // データ形式を統一（machine_numberフィールドに統一）
            const formattedMachines = machinesData.map((machine: any) => ({
              id: machine.id,
              machine_number: machine.machine_number
            }));

            setMachines(formattedMachines);
            setFilteredMachines(formattedMachines); // 初期表示用

            // 機械番号データ取得完了、状態確認
            console.log('🔧 機械番号取得後の状態', {
              machinesCount: formattedMachines.length,
              machines: formattedMachines,
              machineNumberInput,
              selectedMachineNumber,
              showMachineNumberSuggestions,
            });
          } else {
            console.error('❌ 機械番号一覧取得成功だがsuccess=false:', result);
            setMachines([]);
            setFilteredMachines([]);
          }
        } else {
          const errorText = await response.text();
          console.error(
            '❌ 機械番号一覧取得エラー:',
            response.status,
            errorText
          );
          setMachines([]);
          setFilteredMachines([]);
        }
      } catch (error) {
        console.error('❌ 機械番号一覧取得エラー:', error);
        setMachines([]);
        setFilteredMachines([]);
      } finally {
        setIsLoadingMachines(false);
        console.log('🔍 機械番号一覧取得完了 - 最終状態', {
          machinesCount: machines.length,
          filteredMachinesCount: filteredMachines.length,
        });
      }
    },
    [
      machines.length,
      filteredMachines.length,
      machineNumberInput,
      selectedMachineNumber,
      showMachineNumberSuggestions,
    ]
  );

  // 追加: 機種選択時の処理（オートコンプリート用）
  const handleMachineTypeChange = (typeId: string) => {
    setSelectedMachineType(typeId);
    selectedMachineTypeRef.current = typeId; // refも更新
    setSelectedMachineNumber(''); // 機種変更時は機械番号をリセット
    selectedMachineNumberRef.current = ''; // refも更新
    setMachineNumberInput(''); // 機械番号入力もリセット
    lastWarningMessageRef.current = null; // 警告メッセージのrefをリセット

    if (typeId) {
      fetchMachines(typeId);
    } else {
      setMachines([]);
      setFilteredMachines([]);
    }
  };

  // 機械番号選択時の処理
  const handleMachineNumberChange = async (machineNumber: string) => {
    setSelectedMachineNumber(machineNumber);
    selectedMachineNumberRef.current = machineNumber;
    lastWarningMessageRef.current = null;

    // 機種と機械番号の両方が入力された場合、保存されたメッセージを自動再送信
    if (selectedMachineType && machineNumber && pendingMessage && !isProcessingPendingMessage) {
      console.log('✅ 機種・機械番号が入力されました。保存されたメッセージを自動再送信します', {
        selectedMachineType,
        machineNumber,
        pendingMessage: pendingMessage.content
      });
      
      try {
        setIsProcessingPendingMessage(true);
        const savedMessage = { ...pendingMessage };
        // 保存されたメッセージを先にクリア（重複防止）
        setPendingMessage(null);
        
        // AI支援モードの場合は処理を実行（skipMachineCheck=trueで機種・機械番号チェックをスキップ）
        if (aiSupportMode) {
          await handleAiSupportMessage(savedMessage.content, savedMessage.media, true);
        } else {
          // 通常モードの場合はメッセージ送信
          await sendMessage(savedMessage.content, savedMessage.media, false);
        }
      } catch (error) {
        console.error('❌ 保存メッセージの再送信エラー:', error);
        toast({
          title: 'エラー',
          description: 'メッセージの送信に失敗しました',
          variant: 'destructive',
        });
      } finally {
        setIsProcessingPendingMessage(false);
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // AI支援モードの自動開始用のref - 一度だけ実行するため
  const aiSupportInitializedRef = useRef(false);
  const machineInfoMessageSentRef = useRef(false);
  const initialPromptSentRef = useRef(false);
  const lastWarningMessageRef = useRef<string | null>(null);
  // 機種・機械番号の最新状態を追跡するref
  const selectedMachineTypeRef = useRef<string>('');
  const selectedMachineNumberRef = useRef<string>('');

  // 機種・機械番号の状態変更を監視してrefを更新
  useEffect(() => {
    selectedMachineTypeRef.current = selectedMachineType;
    if (selectedMachineType && selectedMachineNumber) {
      // 両方入力された場合�E警告メティングーージのrefをリセティングー
      lastWarningMessageRef.current = null;
    }
  }, [selectedMachineType]);

  useEffect(() => {
    selectedMachineNumberRef.current = selectedMachineNumber;
    if (selectedMachineType && selectedMachineNumber) {
      // 両方入力された場合�E警告メティングーージのrefをリセティングー
      lastWarningMessageRef.current = null;
    }
  }, [selectedMachineNumber]);

  // コンポ�Eネント�Eウント時の初期匁E
  useEffect(() => {
    console.log('🚀 チャットページマウント - 初期化開始');

    // チャットIDの初期化を確実に行う
    if (!chatId) {
      console.log('🔄 チャットIDが未設定のため初期化を実行');
      try {
        initializeChat();
      } catch (error) {
        console.error('❌ チャットID初期化エラー:', error);
      }
    }

    // 機種データの取得
    fetchMachineTypes().catch(error => {
      console.error(
        '❌ 機種データ取得でエラーが発生しましたが、チャット画面は表示されます',
        error
      );
    });
  }, [chatId, initializeChat, fetchMachineTypes]);

  // AI支援モードの自動開始を無効化（ボタン押下で手動開始に変更）
  // useEffect(() => {
  //   if (!aiSupportMode && !aiSupportInitializedRef.current) {
  //     console.log('AI支援モードをデフォルトで有効化');
  //     aiSupportInitializedRef.current = true;
  //     (async () => {
  //       try {
  //         const loadedSettings = await loadAiAssistSettings();
  //         setAiSupportMode(true);
  //         setAiSupportStartTime(new Date());
  //         setElapsedTime(0);
  //         if (!initialPromptSentRef.current) {
  //           initialPromptSentRef.current = true;
  //           const initialPrompt = loadedSettings?.initialPrompt || aiAssistSettings.initialPrompt;
  //           const aiSupportMessage = {
  //             id: Date.now().toString(),
  //             content: initialPrompt,
  //             isAiResponse: true,
  //             timestamp: new Date(),
  //             type: 'ai_support',
  //           };
  //           setMessages((prev: any) => [...prev, aiSupportMessage]);
  //           console.log('初期メッセージを表示:', initialPrompt);
  //         }
  //       } catch (error) {
  //         console.error('AI支援モード自動開始エラー:', error);
  //       }
  //     })();
  //   }
  // }, [aiSupportMode, loadAiAssistSettings, aiAssistSettings, setMessages]);

  // 機種・機械番号が両方入力された時に警告メティングーージを削除�E�オプション�E�E
  useEffect(() => {
    if (aiSupportMode && selectedMachineType && selectedMachineNumber && machineInfoMessageSentRef.current) {
      // 機種・機械番号が�E力されたら、警告メティングーージはそ�Eまま残す�E�削除しなぁEーE
      console.log('✅ 機種・機械番号が入力されました');
    }
  }, [aiSupportMode, selectedMachineType, selectedMachineNumber]);

  // 機種シューティングの状態変更を監視してフィルタリングを更新
  useEffect(() => {
    console.log('📊 機種シューティング状態更新:', {
      machineTypesCount: machineTypes.length,
      selectedMachineType,
      machineTypeInput,
      isLoadingMachineTypes,
    });

    // 機種シューティングが更新されたら、現在の入力に基づぁEーフィルタリングを更新
    if (machineTypes.length > 0) {
      filterMachineTypes(machineTypeInput);
    }
  }, [machineTypes, machineTypeInput]);

  // 機種入力�E状態変更を監視（デバッグ用�E�E
  useEffect(() => {
    console.log('📊 機種入力状態更新:', {
      machineTypeInput,
      selectedMachineType,
    });
  }, [machineTypeInput, selectedMachineType]);

  // machineTypeInputの値の変更を詳細に監要E
  useEffect(() => {
    console.log('🔍 machineTypeInput値変更検索:', {
      currentValue: machineTypeInput,
      length: machineTypeInput.length,
      timestamp: new Date().toISOString(),
    });
  }, [machineTypeInput]);

  // 機械番号シューティングの状態変更を監視してフィルタリングを更新
  useEffect(() => {
    console.log('📊 機械番号シューティング状態更新:', {
      machinesCount: machines.length,
      selectedMachineNumber,
      machineNumberInput,
      isLoadingMachines,
    });

    // 機械番号シューティングが更新されたら、現在の入力に基づぁEーフィルタリングを更新
    if (machines.length > 0) {
      filterMachines(machineNumberInput);
    }
  }, [machines, machineNumberInput]);

  // 機械番号入力�E状態変更を監視（デバッグ用�E�E
  useEffect(() => {
    console.log('📊 機械番号入力状態更新:', {
      machineNumberInput,
      selectedMachineNumber,
    });
  }, [machineNumberInput, selectedMachineNumber]);

  // 追加: Q&Aモード�E初期化（動皁Eー問生成システィングーに変更済み�E�E

  // AI支援時間表示とエスカレーション機�EのためのuseEffect
  useEffect(() => {
    let interval: any;

    if (aiSupportMode && aiSupportStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - aiSupportStartTime.getTime()) / 1000);
        setElapsedTime(elapsed);

        // エスカレーション時間をチェティングー�E�カスタム設定対応！E
        const elapsedMinutes = Math.floor(elapsed / 60);
        if (aiAssistSettings.enableEmergencyContact &&
          elapsedMinutes >= aiAssistSettings.escalationTime &&
          elapsedMinutes % 5 === 0) { // 5刁Eーとに通知

          const escalationMessage = {
            id: Date.now().toString(),
            content: `🚨 **救援要請の検討**\n\nAI支援開始から${elapsedMinutes}分が経過しました。\n**技術支援センター:**\n📞 0123-456-789\n\n**または**\n現場の専門家に連絡することをお勧めします。\n安全を最優先に行動してください。`,
            isAiResponse: true,
            timestamp: new Date(),
            type: 'escalation_notice',
          };

          setMessages((prev: any) => [...prev, escalationMessage]);
        }
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [aiSupportMode, aiSupportStartTime, aiAssistSettings]);

  // AI支援開始（カスタマイズ対応版）
  const handleStartAiSupport = async () => {
    try {
      // AI支援設定を読み込み
      const loadedSettings = await loadAiAssistSettings();

      // AI支援モードを開始
      setAiSupportMode(true);
      setAiSupportStartTime(new Date());
      setElapsedTime(0);

      // 初期化フラグをリセット
      aiSupportInitializedRef.current = false;
      initialPromptSentRef.current = false;
      machineInfoMessageSentRef.current = false;
      lastWarningMessageRef.current = null;

      // カスタマイズされた初期メッセージを送信
      const initialPrompt = loadedSettings?.initialPrompt || aiAssistSettings.initialPrompt;
      const aiSupportMessage = {
        id: Date.now().toString(),
        content: initialPrompt,
        isAiResponse: true,
        timestamp: new Date(),
        type: 'ai_support',
      };

      setMessages((prev: any) => [...prev, aiSupportMessage]);
      console.log('✅ AI支援開始 - 初期メッセージを表示:', initialPrompt);

      toast({
        title: 'AI支援開始',
        description: 'AI支援が開始されました。チャットエリアでやり取りしてください',
      });
    } catch (error) {
      console.error('AI支援開始エラー:', error);
      toast({
        title: 'エラー',
        description: 'AI支援の開始に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // AI支援終了後のチャットエリアリセット処理
  const handleAiSupportExit = async () => {
    // AI支援終了メッセージを送信
    const aiSupportEndMessage = {
      id: Date.now().toString(),
      content: 'AI支援を終了しました',
      isAiResponse: true,
      timestamp: new Date(),
      type: 'ai_support_end',
    };

    setMessages(prev => [...prev, aiSupportEndMessage]);

    // AI支援モードを終了
    setAiSupportMode(false);
    setAiSupportStartTime(null);
    setElapsedTime(0);
    setEmergencyStep(0);
    setProblemType('');

    // 初期化フラグをリセット
    aiSupportInitializedRef.current = false;
    initialPromptSentRef.current = false;
    machineInfoMessageSentRef.current = false;
    lastWarningMessageRef.current = null;

    toast({
      title: '支援終了',
      description: 'AI支援を終了しました',
    });

    // 継続選択ダイアログを表示
    const shouldContinue = await new Promise<boolean>((resolve) => {
      const dialog = document.createElement('div');
      dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:24px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:9999;min-width:400px';
      dialog.innerHTML = `
        <h3 style="font-size:18px;font-weight:bold;margin-bottom:16px">AI支援終了</h3>
        <p style="margin-bottom:24px;color:#666">引き続き別の機能を使用しますか？</p>
        <div style="display:flex;gap:12px;justify-content:flex-end">
          <button id="continue-btn" style="padding:8px 16px;background:#3B82F6;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">継続する</button>
          <button id="end-btn" style="padding:8px 16px;background:#6B7280;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">終了</button>
        </div>
      `;
      document.body.appendChild(dialog);

      document.getElementById('continue-btn')!.onclick = () => {
        document.body.removeChild(dialog);
        resolve(true);
      };
      document.getElementById('end-btn')!.onclick = async () => {
        document.body.removeChild(dialog);
        
        // 🔧 未エクスポート画像の削除処理
        if (hasUnexportedMessages && messages.length > 0) {
          console.log('🗑️ AI支援終了: 未エクスポート画像のクリーンアップを実行');
          
          try {
            const { buildApiUrl } = await import('../lib/api');
            const cleanupResponse = await fetch(buildApiUrl('/history/cleanup-orphaned-images'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ dryRun: false }),
            });
            
            if (cleanupResponse.ok) {
              const result = await cleanupResponse.json();
              console.log('✅ 孤立画像クリーンアップ完了:', result.stats);
            }
          } catch (err) {
            console.warn('⚠️ クリーンアップ失敗:', err);
          }
        }
        
        resolve(false);
      };
    });

    if (shouldContinue) {
      // 継続する場合：メッセージを保持したまま再度AI支援や他機能を使用可能にする
      toast({
        title: '継続モード',
        description: '引き続きAI支援や応急復旧マニュアル等をご利用いただけます',
        duration: 3000,
      });
    }
  };

  const handleExport = async () => {
    try {
      await exportChatHistory();
      toast({
        title: 'エクスポート完了',
        description: 'チャット履歴をエクスポートしました',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'エクスポートエラー',
        description: 'チャット履歴のエクスポートに失敗しました',
        variant: 'destructive',
      });
    }
  };

  // サーバーへ履歴を送信する機能
  const handleSendToServer = async () => {
    try {
      // チャット履歴を追加
      console.log('🚀 送信前�E状態確誁E', {
        chatId: chatId,
        messagesLength: messages.length,
        hasChatId: !!chatId,
        hasMessages: messages.length > 0,
        messagesWithContent: messages.filter(
          msg => msg.content && msg.content.trim()
        ).length,
        machineInfo: {
          selectedMachineType,
          selectedMachineNumber,
          machineTypeInput,
          machineNumberInput,
        },
      });

      // より詳細な条件チェティングー
      const hasValidChatId = !!chatId;
      const hasMessages = messages.length > 0;
      const hasValidMessages = messages.some(
        msg => msg.content && msg.content.trim()
      );

      console.log('🔍 送信条件チェティングー:', {
        hasValidChatId,
        hasMessages,
        hasValidMessages,
        messagesCount: messages.length,
        messagesWithContent: messages.filter(
          msg => msg.content && msg.content.trim()
        ).length,
      });

      if (!hasValidChatId) {
        console.log('❌ 送信エラー: チャットIDが無効 - 初期化を実行');
        try {
          // チャットIDが無効な場合の初期化を実行
          await initializeChat();
          console.log('✅ チャットID初期化完了');
          // 初期化成功後、再度送信処理を実行
          setTimeout(() => {
            handleSendToServer();
          }, 100);
          return;
        } catch (initError) {
          console.error('❌ チャットID初期化エラー:', initError);
          toast({
            title: '送信エラー',
            description: 'チャットIDの初期化に失敗しました',
            variant: 'destructive',
          });
          return;
        }
      }

      if (!hasValidMessages) {
        console.log('❌ 送信エラー: 有効なメッセージがありません');
        toast({
          title: '送信エラー',
          description: '送信するチャット内容がありません',
          variant: 'destructive',
        });
        return;
      }

      // チャティングー冁EーをJSON形式で整形
      const chatData = {
        chatId: chatId,
        timestamp: new Date().toISOString(),
        // 機種と機械番号の惁Eーを追加
        machineInfo: {
          selectedMachineType: selectedMachineType,
          selectedMachineNumber: selectedMachineNumber,
          machineTypeName: machineTypeInput,
          machineNumber: machineNumberInput,
        },
        messages: messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          isAiResponse: msg.isAiResponse,
          timestamp: msg.timestamp,
          media:
            msg.media?.map((media: any) => ({
              id: media.id,
              type: media.type,
              url: media.url,
              title: media.title,
              fileName: media.fileName || '',
            })) || [],
        })),
        savedImages: messages
          .flatMap(msg => msg.media || [])
          .filter((media: any) => media.type === 'image')
          .map((media: any) => ({
            id: media.id,
            type: media.type,
            url: media.url,
            title: media.title,
            fileName: media.fileName || '',
          })),
      };

      console.log('📤 送信シューティング:', {
        chatId: chatData.chatId,
        messageCount: chatData.messages.length,
        machineInfo: chatData.machineInfo,
        savedImagesCount: chatData.savedImages?.length,
        savedImages: chatData.savedImages,
        totalDataSize: JSON.stringify(chatData).length,
      });

      // 統一API設定を使用してサーバーに履歴を送信
      const { buildApiUrl } = await import('../lib/api');

      // 環境に応じてエンドポイントを選択
      const isDevelopment = import.meta.env.DEV || window.location.hostname === 'localhost';
      const endpoint = isDevelopment
        ? `/chats/${chatId}/send-test`  // 開発環墁Eーはティングート用エンド�Eインティング
        : `/chats/${chatId}/send`;      // 本番環墁Eーは本番用エンド�Eインティング

      const apiUrl = buildApiUrl(endpoint);

      console.log('🌐 送信URL:', apiUrl);
      console.log('🏗�E�E開発環墁E', isDevelopment);
      console.log('🏠 ホスト名:', window.location.hostname);
      console.log('🔧 環墁Eー数:', {
        NODE_ENV: import.meta.env.MODE,
        DEV: import.meta.env.DEV,
        PROD: import.meta.env.PROD,
        VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          chatData: chatData,
          exportType: 'manual_send',
        }),
      });

      console.log('📡 送信レスポンス:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      if (response.ok) {
        const result = await response.json();

        // 機種と機械番号の惁Eーを含む送信成功メティングーージ
        const machineInfoText =
          selectedMachineType && selectedMachineNumber
            ? ` (機種: ${machineTypeInput}, 機械番号: ${machineNumberInput})`
            : '';

        console.log('✅ サーバー送信成功:', result);

        toast({
          title: '送信成功',
          description: `チャット内容をサーバーに送信しました (${messages.filter(msg => msg.content && msg.content.trim()).length}件のメッセージ)${machineInfoText}。ナレッジ反映は履歴管理UIの「機械故障情報インポート」から実行してください。`,
        });

        // 送信後の選択ダイアログを表示
        const shouldContinue = await new Promise<boolean>((resolve) => {
          const dialog = document.createElement('div');
          dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:24px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:9999;min-width:400px';
          dialog.innerHTML = `
            <h3 style="font-size:18px;font-weight:bold;margin-bottom:16px">チャット送信完了</h3>
            <p style="margin-bottom:24px;color:#666">チャットを継続しますか？</p>
            <div style="display:flex;gap:12px;justify-content:flex-end">
              <button id="continue-btn" style="padding:8px 16px;background:#3B82F6;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">継続する（上書き保存）</button>
              <button id="clear-btn" style="padding:8px 16px;background:#EF4444;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">クリアして新規</button>
            </div>
          `;
          document.body.appendChild(dialog);

          document.getElementById('continue-btn')!.onclick = () => {
            document.body.removeChild(dialog);
            resolve(true);
          };
          document.getElementById('clear-btn')!.onclick = () => {
            document.body.removeChild(dialog);
            resolve(false);
          };
        });

        if (!shouldContinue) {
          // クリアを選択した場合
          await clearChatHistory();
          setSelectedMachineType('');
          selectedMachineTypeRef.current = '';
          setSelectedMachineNumber('');
          selectedMachineNumberRef.current = '';
          setMachineTypeInput('');
          setMachineNumberInput('');
        }
        // 継続を選択した場合は何もしない（チャットIDとメッセージを保持）
        setMachines([]);
        setFilteredMachines([]);
        lastWarningMessageRef.current = null;

        toast({
          title: 'チャットクリア完了',
          description: '送信後にチャット履歴をクリアしました',
        });

        console.log('🧹 チャティングー状態をリセティングーしました');
      } else {
        // エラーレスポンスの詳細を取征E
        let errorMessage = `送信失敁E ${response.status} ${response.statusText}`;
        let errorDetails = '';

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          errorDetails = errorData.details || errorData.error || '';
          console.error('❌ サーバーエラーレスポンス:', errorData);
        } catch (parseError) {
          console.warn('⚠�E�Eエラーレスポンスの解析に失敁E', parseError);
        }

        // より詳細なエラーメティングーージを構篁E
        const fullErrorMessage = errorDetails
          ? `${errorMessage}\n詳細: ${errorDetails}`
          : errorMessage;

        throw new Error(fullErrorMessage);
      }
    } catch (error) {
      console.error('❌ サーバー送信エラー:', error);
      toast({
        title: '送信エラー',
        description:
          error instanceof Error
            ? error.message
            : 'サーバーへの送信に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // ローカル保存機�E�E�削除済み�E�E

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // importChat関数は現在実裁EーれてぁEーぁEーめ、簡易的な実裁E
        const text = await file.text();
        const importedData = JSON.parse(text);

        if (importedData.messages && Array.isArray(importedData.messages)) {
          // メッセージを設定（既存のメッセージに追加）
          setMessages([...messages, ...importedData.messages]);
          toast({
            title: 'インポート成功',
            description: 'チャット履歴をインポートしました',
          });
        } else {
          throw new Error('無効なファイル形式です');
        }
      } catch (error) {
        console.error('Import error:', error);
        toast({
          title: 'インポートエラー',
          description: 'チャット履歴のインポートに失敗しました',
          variant: 'destructive',
        });
      }
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 応急処置ガイド関連の関数
  const fetchAvailableGuides = async () => {
    try {
      setIsLoadingGuides(true);
      console.log('🔄 応急処置ガイド一覧取得開始');

      // キャッシュ無効化のためにタイムスタンプを追加
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const cacheBuster = `?ts=${timestamp}&r=${randomId}`;

      // 統一API設定を使用 - emergency-flow APIを使用
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl(`/emergency-flow/list${cacheBuster}`);

      console.log('🌐 API URL:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      console.log('📡 レスポンス状態', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('📊 取得したデータ:', data);

        if (data.success) {
          const guides = data.data || [];
          setAvailableGuides(guides);
          setFilteredGuides(guides);
          console.log('✁E応急処置ガイド取得�E劁E', guides.length + '件');

          // ティングーティングー用�E�各ガイド�E詳細をログ出劁E
          guides.forEach((guide: any, index: number) => {
            console.log(`📋 ガイティング${index + 1}:`, {
              id: guide.id,
              title: guide.title,
              fileName: guide.fileName,
              description: guide.description?.substring(0, 50) + '...',
            });
          });
        } else {
          console.error('❁E応急処置ガイド取得失敁E', data.message);
          setAvailableGuides([]);
          setFilteredGuides([]);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ API エラー:', errorText);
        throw new Error(
          `Failed to fetch emergency guides: ${response.status} - ${errorText}`
        );
      }
    } catch (error) {
      console.error('ガイド一覧の取得に失敁E', error);
      toast({
        title: 'エラー',
        description: '応急処置シューティングの取得に失敗しました',
        variant: 'destructive',
      });
      setAvailableGuides([]);
      setFilteredGuides([]);
    } finally {
      setIsLoadingGuides(false);
    }
  };

  const handleEmergencyGuide = async () => {
    await fetchAvailableGuides();
    setShowEmergencyGuide(true);
  };

  const handleSelectGuide = (guideId: string) => {
    setSelectedGuideId(guideId);
  };

  const handleExitGuide = () => {
    setShowEmergencyGuide(false);
    setSelectedGuideId(null);
    setSearchQuery('');
  };

  // 検索処琁E
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setFilteredGuides(availableGuides);
      return;
    }

    try {
      // クライアントサイド検索を実衁E
      const searchResults = availableGuides.filter(guide => {
        const searchText =
          `${guide.title} ${guide.description} ${guide.keyword || ''}`.toLowerCase();
        return searchText.includes(query.toLowerCase());
      });

      setFilteredGuides(searchResults);
      console.log(`🔍 検索結果: "${query}" -> ${searchResults.length}件`);
    } catch (error) {
      console.error('検索処琁Eーラー:', error);
      setFilteredGuides(availableGuides);
    }
  };

  // キーワード�Eタンクリティングー時�E処琁E
  const handleKeywordClick = (keyword: string) => {
    handleSearch(keyword);
  };

  // カメラボタンのクリティングー処琁E
  const handleCameraClick = () => {
    console.log('📸 カメラボタンがクリティングーされました');
    // カメラモーダルを開くイベントを発火
    window.dispatchEvent(new CustomEvent('open-camera'));

    // ティングーティングー用: イベントが正しく発火されたかを確誁E
    console.log('📸 open-camera イベントを発火しました');
  };

  // トラブルシューティングQA開始
  const startTroubleshootingQA = async (problemDescription: string) => {
    try {
      setTroubleshootingMode(true);
      setTroubleshootingSession({
        problemDescription,
        answers: [],
      });

      // 統一API設定を使用してトラブルシューティングQA APIを呼び出ぁE
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/troubleshooting-qa/start');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          problemDescription,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const qaResponse = data.data;

        setTroubleshootingSession(prev => ({
          ...prev!,
          currentQuestion: qaResponse.question,
          currentOptions: qaResponse.options || [],
          reasoning: qaResponse.reasoning,
        }));

        // 初期質問をメティングーージとして追加
        sendMessage(qaResponse.question, [], true);
      } else {
        throw new Error('トラブルシューティングQAの開始に失敗しました');
      }
    } catch (error) {
      console.error('❌ トラブルシューティングQA開始エラー:', error);
      toast({
        title: 'エラー',
        description: 'トラブルシューティングQAの開始に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // トラブルシューティングQA回答�E琁E
  const handleTroubleshootingAnswer = async (answer: string) => {
    if (!troubleshootingSession) return;

    try {
      // 回答をセティングーョンに追加
      const updatedSession = {
        ...troubleshootingSession,
        answers: [
          ...troubleshootingSession.answers,
          {
            stepId: `step_${Date.now()}`,
            answer,
            timestamp: new Date(),
          },
        ],
      };
      setTroubleshootingSession(updatedSession);

      // 回答をメティングーージとして追加
      sendMessage(answer, [], false);

      // 統一API設定を使用してトラブルシューティングQA APIを呼び出ぁE
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/troubleshooting-qa/answer');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          problemDescription: troubleshootingSession.problemDescription,
          previousAnswers: updatedSession.answers.slice(0, -1), // 現在の回答を除ぁE
          currentAnswer: answer,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const qaResponse = data.data;

        if (qaResponse.status === 'complete') {
          // 解決策を表示
          setTroubleshootingSession(prev => ({
            ...prev!,
            currentQuestion: undefined,
            currentOptions: undefined,
          }));
          sendMessage(qaResponse.solution, [], true);
          setTroubleshootingMode(false);
        } else if (qaResponse.status === 'emergency') {
          // 緊急対応を表示
          setTroubleshootingSession(prev => ({
            ...prev!,
            currentQuestion: undefined,
            currentOptions: undefined,
          }));
          sendMessage(qaResponse.emergencyAction, [], true);
          setTroubleshootingMode(false);
        } else {
          // 次の質問を表示
          setTroubleshootingSession(prev => ({
            ...prev!,
            currentQuestion: qaResponse.question,
            currentOptions: qaResponse.options || [],
            reasoning: qaResponse.reasoning,
          }));
          sendMessage(qaResponse.question, [], true);
        }
      } else {
        throw new Error('回答�E処琁Eー失敗しました');
      }
    } catch (error) {
      console.error('❁EトラブルシューティングQA回答�E琁Eーラー:', error);
      toast({
        title: 'エラー',
        description: '回答�E処琁Eー失敗しました',
        variant: 'destructive',
      });
    }
  };

  // AI支援メティングーージ処琁EーEPT応答を使用�E�E
  const handleAiSupportMessage = async (content: string, media: any[] = [], skipMachineCheck: boolean = false) => {
    try {
      // refとstateの両方を確認し、どちらかが有効な値を持ってぁEーかを確誁E
      // refが優先、なければstateを使用
      // 機種は、selectedMachineType�E�ED�E�また�EmachineTypeInput�E�表示値�EーEどちらかがあれ�EOK
      const currentMachineType = selectedMachineTypeRef.current || selectedMachineType || machineTypeInput;
      const currentMachineNumber = selectedMachineNumberRef.current || selectedMachineNumber || machineNumberInput;

      // 最終的な判定（空斁Eー�EでなぁEーとを確認！E
      const hasMachineType = currentMachineType && currentMachineType.trim() !== '' && currentMachineType !== 'null' && currentMachineType !== 'undefined';
      const hasMachineNumber = currentMachineNumber && currentMachineNumber.trim() !== '' && currentMachineNumber !== 'null' && currentMachineNumber !== 'undefined';

      console.log('🔍 機種・機械番号チェティングー:', {
        skipMachineCheck,
        selectedMachineTypeRef: selectedMachineTypeRef.current,
        selectedMachineNumberRef: selectedMachineNumberRef.current,
        selectedMachineType,
        selectedMachineNumber,
        machineTypeInput,
        machineNumberInput,
        currentMachineType,
        currentMachineNumber,
        hasMachineType,
        hasMachineNumber
      });

      // ユーザーメティングーージを�Eに追加�E�常に表示する�E�E
      const userMessage = {
        id: Date.now().toString(),
        content: content,
        isAiResponse: false,
        timestamp: new Date(),
        type: 'user_message',
        media: media,
      };

      // メティングーージを追加し、最新の状態を取征E
      let updatedMessages: any[] = [];
      setMessages(prev => {
        updatedMessages = [...prev, userMessage];
        return updatedMessages;
      });

      // 機種・機械番号が入力されていない場合の処理（skipMachineCheckがtrueの場合はスキップ）
      if (!skipMachineCheck && (!hasMachineType || !hasMachineNumber)) {
        // ユーザーのメッセージを保存（後で自動再送信するため）
        // ただし、既に保存されているメッセージと同じ場合は保存しない
        if (!pendingMessage || pendingMessage.content !== content) {
          console.log('📝 機種・機械番号未設定のため、メッセージを保存します:', content);
          setPendingMessage({
            content: content,
            media: media || [],
          });
        }

        // 機種・機械番号が入力されていない場合の警告メッセージ（連続表示を防ぐ）
        const warningContent = '機種及び機械番号を選択入力してください';
        const currentTime = Date.now();

        // 前回の警告メティングーージから5秒以上経過してぁEー場合�Eみ表示
        const lastWarningTime = lastWarningMessageRef.current
          ? parseInt(lastWarningMessageRef.current)
          : 0;
        const timeSinceLastWarning = currentTime - lastWarningTime;

        if (timeSinceLastWarning > 5000) {
          lastWarningMessageRef.current = currentTime.toString();
          const warningMessage = {
            id: (Date.now() + 1).toString(),
            content: warningContent,
            isAiResponse: true,
            timestamp: new Date(),
            type: 'ai_support',
          };
          setMessages((prev: any) => [...prev, warningMessage]);
          console.log('⚠️ 警告メッセージを表示:', warningContent);
        } else {
          console.log('⏭️ 警告メッセージをスキップ（30秒以内）', timeSinceLastWarning);
        }
        return; // GPT応答を生成せずに終了
      }

      // 機種・機械番号が入力されている場合は、警告メッセージのrefをリセット
      lastWarningMessageRef.current = null;
      console.log('✅ 機種・機械番号が入力されています。GPT応答を生成します', {
        content,
        machineType: currentMachineType,
        machineNumber: currentMachineNumber
      });

      // 会話履歴を取得（AI支援メッセージのみ、最新のメッセージを含める）
      const conversationHistory = updatedMessages
        .filter(msg => msg.type === 'ai_support' || msg.type === 'ai_support_response' || msg.type === 'user_message')
        .map(msg => ({
          content: msg.content,
          isAiResponse: msg.isAiResponse,
          timestamp: msg.timestamp,
          type: msg.type,
        }));

      console.log('📝 会話履歴:', conversationHistory.length, '件');

      // GPTにリクエストを送信してAI応答を生成
      console.log('🤖 GPTレスポンス生成開始...');
      const aiResponse = await generateAiSupportResponse(content, conversationHistory);
      console.log('✅ GPTレスポンス生成完了:', aiResponse.substring(0, 100));

      // AI応答メッセージを追加
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        content: aiResponse,
        isAiResponse: true,
        timestamp: new Date(),
        type: 'ai_support_response',
      };

      setMessages(prev => [...prev, aiMessage]);
      console.log('✅ AIメッセージを追加しました');

    } catch (error) {
      console.error('AI支援メティングーージ処琁Eーラー:', error);

      // エラー時のフォールバック応答
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: '申し訳ございません。現在AI支援の応答を生成できません。しばらく時間をおいてから再度お試しください。',
        isAiResponse: true,
        timestamp: new Date(),
        type: 'ai_support_response',
      };

      setMessages(prev => [...prev, errorMessage]);

      toast({
        title: 'エラー',
        description: 'AI支援の応答生成に失敗しました',
        variant: 'destructive',
      });
    }
  };

  // 段階的応急処置フローに基づくAI応答生成（カスタマイズ対応！E
  const generateStepByStepResponse = async (userInput: string): Promise<string> => {
    try {
      // カスタム設定から�E質問を取征E
      const customQuestion = getCustomQuestion(userInput, emergencyStep);
      if (customQuestion) {
        // スティングープ�E更新
        updateEmergencyStep(userInput, customQuestion);
        return applyConversationStyle(customQuestion);
      }

      // フォールバック: 基本皁Eー質問を返す
      const fallbackQuestions = [
        aiAssistSettings.questionFlow.step1,
        aiAssistSettings.questionFlow.step2,
        aiAssistSettings.questionFlow.step3,
        aiAssistSettings.questionFlow.step4,
        aiAssistSettings.questionFlow.step5
      ];

      const fallbackQuestion = fallbackQuestions[emergencyStep % fallbackQuestions.length];

      // スティングープ�E更新
      updateEmergencyStep(userInput, fallbackQuestion);

      return applyConversationStyle(fallbackQuestion);
    } catch (_error) {
      return '申し訳ございません。現在AI支援の応答を生成できません。しばらく時間をおいてから再度お試しください。';
    }
  };

  // カスタム設定に基づく質問を取征E
  const getCustomQuestion = (userInput: string, step: number): string | null => {
    const lowerInput = userInput.toLowerCase();

    // スティングープに応じてカスタム質問を返す
    switch (step) {
      case 0:
        return aiAssistSettings.questionFlow.step1;
      case 1:
        return aiAssistSettings.questionFlow.step2;
      case 2:
        // 分岐条件をチェック
        if (aiAssistSettings.branchingConditions.timeCheck &&
          (lowerInput.includes('急') || lowerInput.includes('すぐ'))) {
          return '時間はありますか？';
        }
        return aiAssistSettings.questionFlow.step3;
      case 3:
        if (aiAssistSettings.branchingConditions.detailsCheck) {
          return '詳細を教えていただけますか？';
        }
        return aiAssistSettings.questionFlow.step4;
      case 4:
        if (aiAssistSettings.branchingConditions.toolsCheck) {
          return '必要な工具はありますか？';
        }
        return aiAssistSettings.questionFlow.step5;
      default:
        if (aiAssistSettings.branchingConditions.safetyCheck) {
          return '安全に作業できる状況ですか？';
        }
        return null;
    }
  };

  // 会話スタイルを適用
  const applyConversationStyle = (question: string): string => {
    switch (aiAssistSettings.conversationStyle) {
      case 'frank':
        return question.replace(/ください/g, 'くださいね').replace(/ますか/g, 'ますか？');
      case 'business':
        return `恐れ入りますが、${question}をお聞かせいただけますでしょうか。`;
      case 'technical':
        return `技術的確認として、${question}`;
      default:
        return question;
    }
  };

  // ハ�Eドコードされた質問を取征E
  const getHardcodedQuestion = (userInput: string, step: number, problemType: string): string | null => {
    const lowerInput = userInput.toLowerCase();

    console.log('🔍 getHardcodedQuestion:', {
      userInput,
      lowerInput,
      step,
      problemType
    });

    // エンジン回転上がらない問題の質問リスト
    if (problemType === 'engine_rpm' || lowerInput.includes('エンジン') && lowerInput.includes('回転')) {
      const questions = [
        "応急処置する時間がありますか？",
        "エンジンルームにあるアクセルワイヤーが外れていませんか？",
        "アクセルレバーを指で押して動きますか？",
        "アクセルレバーを押した時、エンジン回転が上がりますか？"
      ];

      if (step < questions.length) {
        console.log('✅ ハードコード質問選択', questions[step]);
        return questions[step];
      } else if (lowerInput.includes('変わらない') || lowerInput.includes('変化ない')) {
        return "応急処置は困難です。アイドリング状態で退避してください";
      } else if (lowerInput.includes('上がる') || lowerInput.includes('成功')) {
        return "応急処置完了です";
      }
    }

    // エンジン始動しない問題の質問リスト
    if (problemType === 'engine_start' || lowerInput.includes('エンジン') && lowerInput.includes('かからない')) {
      const questions = [
        "応急処置する時間がありますか？",
        "エアー圧はありますか？",
        "バッテリー電圧は正常ですか？",
        "スターターモーターは回りますか？"
      ];

      if (step < questions.length) {
        console.log('✅ ハードコード質問選択', questions[step]);
        return questions[step];
      } else if (lowerInput.includes('回らない') || lowerInput.includes('動かない')) {
        return "応急処置は困難です。専門家に連絡してください";
      } else if (lowerInput.includes('回る') || lowerInput.includes('成功')) {
        return "応急処置完了です";
      }
    }

    // そ�E他�E問顁E
    if (step === 0) {
      return "応急処置する時間がありますか？";
    }

    // デフォルトの質問リスト（確実に質問を返す）
    const defaultQuestions = [
      "応急処置する時間がありますか？",
      "問題の詳細を教えてください",
      "他に症状はありますか？",
      "応急処置を試してみてください"
    ]; return defaultQuestions[step % defaultQuestions.length];
  };

  // 応急処置スティングープ�E更新
  const updateEmergencyStep = (userInput: string, aiResponse: string) => {
    const lowerInput = userInput.toLowerCase();
    const lowerResponse = aiResponse.toLowerCase();

    console.log('🔍 updateEmergencyStep:', {
      userInput,
      lowerInput,
      currentStep: emergencyStep,
      currentProblemType: problemType
    });

    // 問題タイプの設定（初回のみ）
    if (emergencyStep === 0 && !problemType) {
      if (lowerInput.includes('エンジン') && lowerInput.includes('回転')) {
        setProblemType('engine_rpm');
      } else if (lowerInput.includes('エンジン') && lowerInput.includes('かからない')) {
        setProblemType('engine_start');
      } else if (lowerInput.includes('ブレーキ')) {
        setProblemType('brake');
      } else {
        setProblemType('general');
      }
    }

    // ユーザーの回答に基づくスティングープ進行（より確実に�E�E
    console.log('🔄 Processing user input for step progression:', lowerInput);

    // 完了・困難・退避の場合のリセット
    if (lowerInput.includes('完了') || lowerInput.includes('困難') || lowerInput.includes('退避') ||
      lowerInput.includes('変わらない') || lowerInput.includes('変化ない')) {
      console.log('🔄 Resetting due to completion/difficulty');
      setEmergencyStep(0);
      setProblemType('');
      return;
    }

    // そ�E他�E場合�E確実にスティングープを進める
    console.log('🔄 Advancing step from', emergencyStep, 'to', emergencyStep + 1);
    setEmergencyStep(prev => prev + 1);
  };

  // ステップ結果の解析
  const parseStepResult = (content: string): 'success' | 'no_change' | 'worsened' | 'new_error' | null => {
    const lowerContent = content.toLowerCase();
    if (lowerContent.includes('成功')) return 'success';
    if (lowerContent.includes('変化ない') || lowerContent.includes('変わらない')) return 'no_change';
    if (lowerContent.includes('悪化')) return 'worsened';
    if (lowerContent.includes('新しいエラー') || lowerContent.includes('別のエラー')) return 'new_error';
    return null;
  };

  // 完了メッセージの生成
  const generateCompletionMessage = (flow: DiagnosticFlow): string => {
    return `🎉 **診断完亁E*

お疲れ様でした�E�問題�E解決が完亁Eーました、E

**診断サマリー:**
- 問顁E ${flow.problemDescription}
- 機種: ${flow.machineType}
- 対応時閁E ${flow.availableTime}刁E
- 実行スティングープ数: ${flow.stepHistory.length}

何か他にお困り�Eことがあれ�E、いつでもお声がけください�E�`;
  };

  // 緊急連絡メティングーージの生�E
  const generateEmergencyContactMessage = (): string => {
    return `🚨 **緊急連絡が忁EーE*

現在の状況では、専門家による対応が忁Eーです、E

**技術支援センター:**
📞 0123-456-789

**連絡時に伝える�E容:**
- 発生した問顁E
- 実行した�E置
- 現在の状況E

安�Eを最優先に、専門家の持Eーに従ってください。`;
  };

  // AI支援応答生成（時間制限と救援要請機�E付き�E�E
  const generateAiSupportResponse = async (
    userMessage: string,
    conversationHistory: any[] = []
  ): Promise<string> => {
    try {
      // 統一API設定を使用
      const { buildApiUrl } = await import('../lib/api');
      const apiUrl = buildApiUrl('/gemini-chat');

      // 会話履歴から経過時間を計算
      const startTime = conversationHistory.find(msg =>
        msg.type === 'ai_support'
      )?.timestamp;

      const elapsedMinutes = startTime ?
        Math.floor((Date.now() - new Date(startTime).getTime()) / (1000 * 60)) : 0;

      // 時間制限チェック（20分）
      if (elapsedMinutes >= 20) {
        return `⏰ 診断時間が20分を超過しました。\n技術支援センターへの救援要請をお勧めします：\n📞 技術支援センター: 0123-456-789\n\nお疲れ様でした。また何かお困りのことがあれば、いつでもお声がけください。`;
      }

      // 会話履歴を構築（ナレッジベース検索用のコンテキストとして使用）
      const conversationContext = conversationHistory
        .slice(-6) // 直近6件の履歴を使用
        .map(msg => `${msg.isAiResponse ? 'AI' : 'ユーザー'}: ${msg.content}`)
        .join('\n');

      // ユーザーメッセージと会話履歴を組み合わせたプロンプト
      const enhancedPrompt = conversationContext
        ? `【これまでの会話】\n${conversationContext}\n\n【現在の質問】\n${userMessage}`
        : userMessage;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          text: enhancedPrompt,
          useOnlyKnowledgeBase: true, // knowledge-baseからのデータのみを使用
          conversationHistory: conversationHistory.slice(-4), // 直近4件の履歴
          elapsedMinutes: elapsedMinutes,
          aiSupportMode: true,
          aiAssistSettings: {
            responsePattern: aiAssistSettings.responsePattern,
            customInstructions: aiAssistSettings.customInstructions,
            conversationStyle: aiAssistSettings.conversationStyle,
            questionFlow: aiAssistSettings.questionFlow,
            branchingConditions: aiAssistSettings.branchingConditions,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ GPT APIエラー:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        throw new Error(`AI支援応答の取得に失敗しました (${response.status}: ${response.statusText})`);
      }

      const data = await response.json();
      // APIレスポンスのキーは `response` / `answer` の両方に対応させる
      let aiResponse = data.response || data.answer || '申し訳ございません。現在AI支援の応答を生成できません';

      // 会話スタイルを適用
      aiResponse = applyConversationStyle(aiResponse);

      // 応答パターンに応じて調整
      if (aiAssistSettings.responsePattern === 'minimal') {
        // 最小限表示：要点のみ簡潔に
        const sentences = aiResponse.split(/[、。\n]/).filter(s => s.trim());
        aiResponse = sentences.slice(0, 2).join('、') + (sentences.length > 2 ? '...' : '');
      } else if (aiAssistSettings.responsePattern === 'comprehensive') {
        // 包括的表示：そのまま（既に包括的）
      } else {
        // 段階的表示（デフォルト）：1問1答形式を維持
        // 既に1問1答形式なので、そのまま
      }

      // カスタム指示を適用
      if (aiAssistSettings.customInstructions) {
        // カスタム指示があれば、応答の最後に追加するが、状況に応じて判断
        // ただし、1問1答形式を維持するため、ここでは適用しない
      }

      // フレンドリーな言い回しに調整
      aiResponse = makeFriendlyResponse(aiResponse);

      // 時間制限の警告を追加（15分経過時）
      if (elapsedMinutes >= 15 && elapsedMinutes < 20) {
        aiResponse += `\n\n⏰ 診断開始から${elapsedMinutes}分が経過しています。あと5分で技術支援センターへの救援要請をお勧めします。`;
      }

      return aiResponse;
    } catch (error) {
      console.error('AI支援応答生成エラー:', error);
      return '申し訳ございません。現在AI支援の応答を生成できません。しばらく時間をおいてから再度お試しください。';
    }
  };

  // フレンドリーな言い回しに調整する関数（厳格版）
  const makeFriendlyResponse = (response: string): string => {
    // テキストをクリーンアップ
    let cleanResponse = response.trim();

    // 複数の質問がある場合は最初の質問のみを抽出
    const questionMarks = cleanResponse.split('？');
    if (questionMarks.length > 1) {
      cleanResponse = questionMarks[0] + '？';
    }

    // 改行で分割して最初の質問のみを取得
    const lines = cleanResponse.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && (
        trimmedLine.includes('？') ||
        trimmedLine.includes('ですか') ||
        trimmedLine.includes('ますか') ||
        trimmedLine.includes('ありますか') ||
        trimmedLine.includes('でしょうか')
      )) {
        cleanResponse = trimmedLine;
        break;
      }
    }

    // 長すぎる場合�E短縮
    if (cleanResponse.length > 100) {
      cleanResponse = cleanResponse.substring(0, 100);
    }

    // 硬ぁEー現をフレンドリーに変更
    const friendlyReplacements = [
      { from: /確認してください/g, to: '確認してみてくださいね' },
      { from: /してください/g, to: 'してみてください' },
      { from: /教えてください/g, to: '教えてくださいね' },
      { from: /ありますか/g, to: 'ありますか？' },
      { from: /ありませんか/g, to: 'ありませんか？' },
      { from: /でしょうか/g, to: 'でしょうか？' },
      { from: /です。/g, to: 'です。' },
      { from: /ます。/g, to: 'ます。' },
    ];

    let friendlyResponse = cleanResponse;
    friendlyReplacements.forEach(({ from, to }) => {
      friendlyResponse = friendlyResponse.replace(from, to);
    });

    return friendlyResponse;
  };

  // 時間表示のためのヘルパ�E関数
  const formatElapsedTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 時間制限�E警告レベルを取征E
  const getTimeWarningLevel = (seconds: number): 'normal' | 'warning' | 'critical' => {
    const minutes = Math.floor(seconds / 60);
    if (minutes >= 20) return 'critical';
    if (minutes >= 15) return 'warning';
    return 'normal';
  };

  // メティングーージ送信処琁Eー拡張
  const handleSendMessage = async (content: string, media: any[] = []) => {
    if (!content.trim() && media.length === 0) return;

    // トラブルシューティングモード�E場合�E特別な処琁E
    if (troubleshootingMode && troubleshootingSession) {
      await handleTroubleshootingAnswer(content);
      return;
    }

    // AI支援モード�E場合�E特別な処琁E
    if (aiSupportMode) {
      await handleAiSupportMessage(content, media);
      return;
    }

    // 通常のメティングーージ送信処琁E
    sendMessage(content, media, false);
  };

  // トラブルシューティングQA開始�Eタンの追加
  const handleStartTroubleshooting = () => {
    const problemDescription = prompt(
      '発生した事象を教えてください�E�例：エンジンが止まった、ブレーキが効かなぁEーど�E�E'
    );
    if (problemDescription && problemDescription.trim()) {
      startTroubleshootingQA(problemDescription.trim());
    }
  };

  // クリア機�E
  const handleClearChat = async () => {
    try {
      await clearChatHistory();
      setTroubleshootingMode(false);
      setTroubleshootingSession(null);
      setAiSupportMode(false);

      // 機種・機械番号の選択状態�Eみクリア�E�選択肢シューティングは保持�E�E
      setSelectedMachineType('');
      selectedMachineTypeRef.current = '';
      setSelectedMachineNumber('');
      selectedMachineNumberRef.current = '';
      setMachineTypeInput('');
      setMachineNumberInput('');
      // フィルタリングされた機種リストをクリアして、次回のフォーカス時に再読み込み
      setFilteredMachineTypes([]);

      // 機械番号は機種選択後に再取得されるため、クリア
      setMachines([]);
      setFilteredMachines([]);

      // AI支援モード�E初期化フラグもリセティングー
      aiSupportInitializedRef.current = false;
      machineInfoMessageSentRef.current = false;
      initialPromptSentRef.current = false;
      lastWarningMessageRef.current = null;

      // 保存されたメッセージもクリア
      setPendingMessage(null);

      toast({
        title: '成功',
        description: 'チャット履歴をクリアしました',
      });
    } catch (error) {
      toast({
        title: 'エラー',
        description: 'クリアに失敗しました',
        variant: 'destructive',
      });
    }
  };

  // カメラモーダルの表示管琁E
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImagePreview, setShowImagePreview] = useState(false);

  // AI支援の質問生成！EPTとの一問一答チャティングー�E�E
  const generateEmergencyQuestion = async (
    context: string,
    previousAnswers: string[]
  ): Promise<{ question: string; options?: string[] }> => {
    try {
      // 最佁Eつの質問を生�Eするまで続衁E
      if (previousAnswers.length >= 5) {
        return {
          question: '',
          options: [],
        };
      }

      // 前�E回答に基づぁEー次の質問を生�E
      if (previousAnswers.length === 0) {
        return {
          question: '具体的な痁Eーを教えてください',
          options: [],
        };
      } else if (previousAnswers.length === 1) {
        const firstAnswer = previousAnswers[0].toLowerCase();

        // 故障の種類を動的に判断
        if (
          firstAnswer.includes('動作') ||
          firstAnswer.includes('動かない') ||
          firstAnswer.includes('効かない')
        ) {
          return {
            question: '故障部位はどこですか？',
            options: [],
          };
        } else if (firstAnswer.includes('異音') || firstAnswer.includes('音')) {
          return {
            question: '異音の発生箇所はどこですか？',
            options: [],
          };
        } else if (
          firstAnswer.includes('警告') ||
          firstAnswer.includes('ランプ') ||
          firstAnswer.includes('アラーム')
        ) {
          return {
            question: '警告の内容はなんですか？',
            options: [],
          };
        } else if (
          firstAnswer.includes('漏れ') ||
          firstAnswer.includes('油漏れ')
        ) {
          return {
            question: '何が漏れていますか？',
            options: [],
          };
        } else if (
          firstAnswer.includes('振動') ||
          firstAnswer.includes('揺れる')
        ) {
          return {
            question: '振動箇所はどこですか？',
            options: [],
          };
        } else {
          return {
            question: '問題�E詳細を教えてください',
            options: [],
          };
        }
      } else if (previousAnswers.length === 2) {
        const firstAnswer = previousAnswers[0].toLowerCase();
        const secondAnswer = previousAnswers[1].toLowerCase();

        // 故障部位や機器の情報を収集
        return {
          question: '作業現場は安全ですか？',
          options: [],
        };
      } else if (previousAnswers.length === 3) {
        // 3つ目の質問：故障の詳細情報
        return {
          question: '故障の発生時期はいつですか？',
          options: [],
        };
      } else if (previousAnswers.length === 4) {
        // 4つ目の質問：作業環境の確認
        return {
          question: '作業に必要な工具はありますか？',
          options: [],
        };
      }

      return {
        question: '詳細を教えてください',
        options: [],
      };
    } catch (error) {
      console.error('AI支援質問生成エラー:', error);
      return {
        question: '詳細な状況を教えてください',
        options: [],
      };
    }
  };

  // エクスポート機能
  const handleExportChat = async () => {
    try {
            const chatData = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: new Date().toISOString(),
      }));

      const blob = new Blob([JSON.stringify(chatData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat_history_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ チャット履歴をエクスポートしました');
    } catch (error) {
      console.error('❌ エクスポートエラー:', error);
    }
  };

  return (
    <div className='flex flex-col h-screen bg-gray-50'>
      {/* ヘッダー - 固定表示 */}
      <div className='sticky top-0 z-50 bg-white border-b px-6 py-2 flex items-center justify-between shadow-sm'>
        {/* 左側：機種・機械番号選択 */}
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2'>
            <Label
              htmlFor='machine-type'
              className='text-sm font-medium text-gray-700'
            >
              機種:
            </Label>
            <div className='relative'>
              <TooltipProvider>
                <Tooltip open={
                  aiSupportMode &&
                  !selectedMachineTypeRef.current &&
                  !selectedMachineType &&
                  !machineTypeInput.trim()
                }>
                  <TooltipTrigger asChild>
                    <div className='w-56'>
                      <Input
                        id='machine-type'
                        type='text'
                        autoComplete='off'
                        autoCorrect='off'
                        autoCapitalize='off'
                        spellCheck='false'
                        placeholder={
                          isLoadingMachineTypes ? '読み込み中...' : '機種を選択...'
                        }
                        value={machineTypeInput}
                        onChange={e => {
                          const value = e.target.value;
                          console.log('🔍 機種入力変更:', value);
                          setMachineTypeInput(value);
                          filterMachineTypes(value);
                          setShowMachineTypeSuggestions(true);
                        }}
                        onFocus={() => {
                          console.log('🔍 機種入力フォーカス:', {
                            machineTypesCount: machineTypes.length,
                            machineTypeInput: machineTypeInput,
                            filteredMachineTypesCount: filteredMachineTypes.length,
                          });
                          setShowMachineTypeSuggestions(true);
                          // フォーカス時、現在の入力値でフィルタリング（空の場合は全機種表示）
                          if (machineTypes.length > 0) {
                            filterMachineTypes(machineTypeInput);
                          }
                        }}
                        onBlur={e => {
                          // ドロティング�Eダウン冁E�Eクリティングーの場合�E閉じなぁE
                          const relatedTarget = e.relatedTarget as HTMLElement;
                          if (
                            relatedTarget &&
                            relatedTarget.closest('.machine-type-dropdown')
                          ) {
                            return;
                          }
                          // 少し遁Eーさせてクリティングーイベントが処琁Eーれるのを征Eー
                          setTimeout(() => {
                            setShowMachineTypeSuggestions(false);
                          }, 150);
                        }}
                        disabled={isLoadingMachineTypes}
                        className='w-48'
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='bg-yellow-100 text-yellow-800 border-yellow-300'>
                    <p>選択または入力してください</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {(() => {
                console.log('🔍 機種ドロップダウン表示条件:', {
                  showMachineTypeSuggestions,
                  filteredMachineTypesCount: filteredMachineTypes.length,
                  filteredMachineTypes: filteredMachineTypes,
                  machineTypesCount: machineTypes.length,
                  machineTypes: machineTypes,
                  isLoadingMachineTypes,
                });
                return null;
              })()}
              {showMachineTypeSuggestions && (
                <div
                  id='machine-type-menu'
                  className='absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto machine-type-dropdown'
                >
                  {isLoadingMachineTypes ? (
                    <div className='px-3 py-2 text-sm text-gray-500'>
                      読み込み中...
                    </div>
                  ) : filteredMachineTypes.length > 0 ? (
                    filteredMachineTypes.map(type => (
                      <div
                        key={type.id}
                        className='px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm'
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMachineTypeSelect(type);
                        }}
                        onMouseDown={e => {
                          // マウスダウンイベントでブラウザのフォーカス変更を防ぁE
                          e.preventDefault();
                        }}
                        tabIndex={0}
                      >
                        {type.machine_type_name}
                      </div>
                    ))
                  ) : (
                    <div className='px-3 py-2 text-sm text-gray-500'>
                      {machineTypeInput.trim()
                        ? '該当する機種が見つかりません'
                        : machineTypes.length === 0
                          ? '機種シューティングを読み込み中...'
                          : '機種を入力してください'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Label
              htmlFor='machine-number'
              className='text-sm font-medium text-gray-700'
            >
              機械番号:
            </Label>
            <div className='relative'>
              <TooltipProvider>
                <Tooltip open={
                  aiSupportMode &&
                  (selectedMachineTypeRef.current || selectedMachineType) &&
                  !selectedMachineNumberRef.current &&
                  !selectedMachineNumber &&
                  !machineNumberInput.trim()
                }>
                  <TooltipTrigger asChild>
                    <div className='w-56'>
                      <Input
                        id='machine-number'
                        type='text'
                        autoComplete='off'
                        autoCorrect='off'
                        autoCapitalize='off'
                        spellCheck='false'
                        placeholder={
                          isLoadingMachines ? '読み込み中...' : '機械番号を選択...'
                        }
                        value={machineNumberInput}
                        onChange={e => {
                          const value = e.target.value;
                          console.log('🔍 機械番号入力変更:', value);
                          setMachineNumberInput(value);
                          filterMachines(value);
                          setShowMachineNumberSuggestions(true);
                        }}
                        onFocus={() => {
                          console.log('🔍 機械番号入力フォーカス');
                          console.log('🔧 フォーカス時の状態', {
                            selectedMachineType,
                            machinesCount: machines.length,
                            machines: machines,
                            filteredMachinesCount: filteredMachines.length,
                            filteredMachines: filteredMachines,
                            isLoadingMachines,
                            machineNumberInput,
                            showMachineNumberSuggestions,
                          });
                          setShowMachineNumberSuggestions(true);
                          // フォーカス時に全機械番号を表示
                          if (machines.length > 0) {
                            setFilteredMachines(machines);
                            console.log(
                              '✁Eフォーカス時に機械番号リストを設宁E',
                              machines.length,
                              '件'
                            );
                          } else {
                            console.log('⚠️ フォーカス時に機械番号がありません');
                          }
                        }}
                        onBlur={e => {
                          // ドロップダウン内のクリックの場合は閉じない
                          const relatedTarget = e.relatedTarget as HTMLElement;
                          if (
                            relatedTarget &&
                            relatedTarget.closest('.machine-number-dropdown')
                          ) {
                            return;
                          }
                          // 少し遅延させてクリックイベントが処理されるのを待つ
                          setTimeout(() => {
                            setShowMachineNumberSuggestions(false);
                          }, 150);
                        }}
                        disabled={!selectedMachineType || isLoadingMachines}
                        className='w-48'
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side='top' className='bg-yellow-100 text-yellow-800 border-yellow-300'>
                    <p>選択または入力してください</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {(() => {
                console.log('🔍 機械番号ドロップダウン表示条件:', {
                  showMachineNumberSuggestions,
                  filteredMachinesCount: filteredMachines.length,
                  filteredMachines: filteredMachines,
                  selectedMachineType,
                  machineNumberInput,
                  isLoadingMachines,
                });
                return null;
              })()}
              {showMachineNumberSuggestions && (
                <div
                  id='machine-number-menu'
                  className='absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto machine-number-dropdown'
                >
                  {filteredMachines.length > 0 ? (
                    filteredMachines.map(machine => (
                      <div
                        key={machine.id}
                        className='px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm'
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleMachineNumberSelect(machine);
                        }}
                        onMouseDown={e => {
                          // マウスダウンイベントでブラウザのフォーカス変更を防ぁE
                          e.preventDefault();
                        }}
                        tabIndex={0}
                      >
                        {machine.machine_number}
                      </div>
                    ))
                  ) : (
                    <div className='px-3 py-2 text-sm text-gray-500'>
                      {machineNumberInput.trim()
                        ? '該当する機械番号が見つかりません'
                        : selectedMachineType
                          ? 'この機種に登録されている機械番号がありません'
                          : '先に機種を選択してください'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 中央�E�AI支援・カメラ・応急処置ガイド�Eタン */}
        <div className='flex items-center gap-4'>
          {/* 応急復旧マニュアルボタン */}
          <Button
            variant='outline'
            size='lg'
            onClick={handleEmergencyGuide}
            disabled={isLoadingGuides}
            className='bg-yellow-400 border-yellow-600 text-yellow-900 hover:bg-yellow-500 border-3 px-6 py-2 text-lg font-bold'
          >
            <Activity className='w-6 h-6 mr-2' />
            応急復旧マニュアル
          </Button>

          {/* カメラボタン */}
          <Button
            variant='outline'
            size='sm'
            onClick={handleCameraClick}
            className='bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
          >
            <Camera className='w-4 h-4 mr-2' />
            カメラ
          </Button>

          {/* AI支援開始/終了ボタン - カメラの右側に配置 */}
          <Button
            variant='outline'
            size='lg'
            onClick={aiSupportMode ? handleAiSupportExit : handleStartAiSupport}
            disabled={isLoading}
            className={`px-6 py-2 text-lg font-bold border-3 ${aiSupportMode
              ? 'bg-orange-50 border-orange-600 text-orange-700 hover:bg-orange-100'
              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-600'
              }`}
          >
            {aiSupportMode ? (
              <>
                <X className='w-6 h-6 mr-2' />
                支援終了
              </>
            ) : (
              <>
                <Brain className='w-6 h-6 mr-2' />
                AI支援開始
              </>
            )}
          </Button>

          {/* 時間表示 - AI支援モードが有効な時のみ表示 */}
          {aiSupportMode && (
            <div className={`px-4 py-2 rounded-lg border text-sm font-medium ${getTimeWarningLevel(elapsedTime) === 'critical'
              ? 'bg-red-100 text-red-800 border-red-200'
              : getTimeWarningLevel(elapsedTime) === 'warning'
                ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                : 'bg-green-100 text-green-800 border-green-200'
              }`}>
              <div className='flex items-center gap-2'>
                <span>⏰</span>
                <span>{formatElapsedTime(elapsedTime)}</span>
                {getTimeWarningLevel(elapsedTime) === 'warning' && (
                  <span className='text-xs'>(あと5分)</span>
                )}
                {getTimeWarningLevel(elapsedTime) === 'critical' && (
                  <span className='text-xs'>(救援要請推奨)</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右側のアクションボタン */}
        <div className='flex items-center gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleSendToServer}
            disabled={isLoading || messages.length === 0}
            className='border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 text-blue-700'
          >
            <Upload className='w-4 h-4 mr-2' />
            サーバーへ送信
          </Button>

          <Button
            variant='outline'
            size='sm'
            onClick={handleClearChat}
            disabled={isLoading || isClearing || messages.length === 0}
          >
            <Trash2 className='w-4 h-4 mr-2' />
            クリア
          </Button>
        </div>
      </div>

      {/* メインコンティングーティングーリア */}
      {interactiveDiagnosisMode ? (
        /* インタラクティングーブ診断モーティング*/
        <div className='flex-1'>
          <InteractiveDiagnosisChat />
        </div>
      ) : (
        /* 通常チャティングーモーティング*/
        <>
          {/* メティングーージ表示エリア */}
          <div className='flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth'>
            {messages.map(message => (
              <div
                key={message.id}
                className="w-full"
              >
                <div className="w-full">
                  {message.isAiResponse &&
                    troubleshootingMode &&
                    troubleshootingSession?.currentQuestion ===
                    message.content ? (
                    // トラブルシューティングQAバブル
                    <TroubleshootingQABubble
                      question={message.content}
                      options={troubleshootingSession?.currentOptions || []}
                      reasoning={troubleshootingSession?.reasoning}
                      onAnswer={handleTroubleshootingAnswer}
                      isLoading={isLoading}
                    />
                  ) : message.isAiResponse &&
                    (message.content.includes('解決策') ||
                      message.content.includes('緊急対応')) ? (
                    // 解決策バブル
                    <SolutionBubble
                      solution={message.content}
                      problemDescription={
                        troubleshootingSession?.problemDescription
                      }
                      isEmergency={message.content.includes('緊急対応')}
                    />
                  ) : (
                    // 通常のメッセージバブル
                    <MessageBubble message={message} />
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className='flex justify-end'>
                <div className='bg-white rounded-lg shadow-sm border p-4'>
                  <div className='flex items-center gap-2'>
                    <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600'></div>
                    <span className='text-gray-600'>AIが応答を生�E中...</span>
                  </div>
                </div>
              </div>
            )}

            {/* スクロール用の余白 */}
            <div ref={messagesEndRef} className='h-4' />
          </div>

          {/* メティングーージ入力エリア�E�通常チャティングーモード！E*/}
          <div className='border-t bg-white p-4'>
            <MessageInput
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              disabled={
                troubleshootingMode && !troubleshootingSession?.currentQuestion
              }
            />
          </div>
        </>
      )}

      {/* カメラモーダル */}
      <CameraModal />

      {/* 画像�Eレビューモーダル */}
      {showImagePreview && selectedImage && <ImagePreviewModal />}

      {/* 応急処置ガイドモーダル */}
      {showEmergencyGuide && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
          <div className='bg-white rounded-lg p-6 w-full max-w-6xl max-h-[85vh] overflow-y-auto'>
            <div className='flex justify-between items-center mb-4'>
              <h2 className='text-xl font-semibold'>応急処置ガイド</h2>
              <Button
                variant='ghost'
                size='sm'
                onClick={handleExitGuide}
                className='text-gray-500 hover:text-gray-700'
              >
                <X className='w-4 h-4 mr-2' />
                閉じる
              </Button>
            </div>

            {/* 検索機�E */}
            <div className='mb-4'>
              <Input
                type='text'
                placeholder='ガイドを検索...'
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                className='w-full'
              />
            </div>

            {/* キーワード�Eタン */}
            <div className='mb-4'>
              <KeywordButtons onKeywordClick={handleKeywordClick} />
            </div>

            {/* ガイド一覧 */}
            {!selectedGuideId && (
              <div className='overflow-auto'>
                <table className='w-full border-collapse border border-gray-300 text-sm'>
                  <thead>
                    <tr className='bg-gray-100'>
                      <th className='border border-gray-300 p-3 text-left text-sm font-medium'>
                        タイトル
                      </th>
                      <th className='border border-gray-300 p-3 text-left text-sm font-medium'>
                        説昁E
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGuides.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className='border border-gray-300 p-4 text-center text-gray-500'
                        >
                          ガイドが見つかりません
                        </td>
                      </tr>
                    ) : (
                      filteredGuides.map(guide => (
                        <tr
                          key={guide.id}
                          className={`hover:bg-gray-50 cursor-pointer ${selectedGuideId === guide.id
                            ? 'bg-blue-50 ring-2 ring-blue-500'
                            : ''
                            }`}
                          onClick={() => handleSelectGuide(guide.id)}
                        >
                          <td className='border border-gray-300 p-3'>
                            <div className='break-words leading-tight text-sm font-semibold hover:text-blue-600'>
                              {guide.title}
                            </div>
                          </td>
                          <td className='border border-gray-300 p-3'>
                            <div className='break-words leading-tight text-sm text-gray-600'>
                              {guide.description}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 選択されたガイド�E表示 */}
            {selectedGuideId && (
              <div className='mt-6'>
                <EmergencyGuideDisplay
                  guideId={selectedGuideId}
                  onxit={() => setSelectedGuideId(null)}
                  backButtonText='一覧に戻る'
                  onSendToChat={() => {
                    console.log('応急処置ガイドをチャットに送信 - 継続可能');
                    // マニュアルは閉じずに継続できるようにする（EmergencyGuideDisplay側で制御）
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
