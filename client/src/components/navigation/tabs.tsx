import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/button';
import {
  Tabs as TabsPrimitive,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import {
  MessageSquare,
  Database,
  Settings,
  FileText,
  History,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';

interface TabItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  requiredRole?: 'user' | 'operator' | 'admin'; // 必要な最小権限
  className?: string;
}

export function Tabs() {
  const location = useLocation();
  const currentPath = location.pathname;
  const { user } = useAuth();

  // ユーザーロールに基づく表示制御
  const userRole = user?.role || 'user';
  
  // 権限レベル: user < operator < admin
  const hasPermission = (requiredRole?: 'user' | 'operator' | 'admin') => {
    if (!requiredRole) return true; // 権限不要
    if (userRole === 'admin') return true; // 管理者は全て閲覧可能
    if (userRole === 'operator' && (requiredRole === 'user' || requiredRole === 'operator')) return true;
    if (userRole === 'user' && requiredRole === 'user') return true;
    return false;
  };

  const tabs: TabItem[] = [
    {
      title: '応急処置サポート',
      path: '/chat',
      icon: <MessageSquare className='mr-2 h-5 w-5 text-blue-600' />,
      requiredRole: 'user', // 全ユーザー
      className:
        'text-blue-600 font-bold text-lg border border-blue-300 rounded-md bg-blue-50',
    },
    {
      title: '履歴管理',
      path: '/history',
      icon: <History className='mr-2 h-4 w-4' />,
      requiredRole: 'user', // 全ユーザー
    },
    {
      title: '基礎データ管理',
      path: '/base-data',
      icon: <Wrench className='mr-2 h-4 w-4' />,
      requiredRole: 'admin', // システム管理者のみ
    },
    {
      title: '応急復旧データ管理',
      path: '/troubleshooting',
      icon: <FileText className='mr-2 h-4 w-4' />,
      requiredRole: 'operator', // 運用管理者以上
    },
    {
      title: '設定',
      path: '/settings',
      icon: <Settings className='mr-2 h-4 w-4' />,
      requiredRole: 'admin', // システム管理者のみ
    },
  ];

  const filteredTabs = tabs.filter(tab => hasPermission(tab.requiredRole));

  return (
    <div className='flex items-center space-x-2'>
      {filteredTabs.map(tab => (
        <Link key={tab.path} to={tab.path}>
          <Button
            variant='ghost'
            className={cn(
              'px-4 py-3 rounded-md',
              currentPath === tab.path
                ? 'text-primary font-semibold bg-blue-100'
                : 'text-gray-600 hover:bg-gray-100',
              tab.className
            )}
          >
            {tab.icon}
            {tab.title}
          </Button>
        </Link>
      ))}
    </div>
  );
}
