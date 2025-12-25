import express from 'express';
import bcrypt from 'bcryptjs';
import { dbQuery } from '../infra/db.mjs';
import { NODE_ENV } from '../config/env.mjs';

const router = express.Router();

// ロール正規化関数: 日本語・英語の両方に対応
const normalizeUserRole = (rawRole) => {
  if (!rawRole) return 'employee';
  const role = String(rawRole).toLowerCase().trim();
  
  // システム管理者
  if (role === 'admin' || role === 'administrator' || role === 'システム管理者' || role === 'system_admin') {
    return 'admin';
  }
  
  // 運用管理者
  if (role === 'operator' || role === '運用管理者' || role === 'operation_manager') {
    return 'operator';
  }
  
  // 一般ユーザー（従業員含む）
  if (role === 'employee' || role === 'staff' || role === '従業員' || role === '一般ユーザー' || role === 'user') {
    return 'employee';
  }
  
  return 'employee'; // デフォルトは一般ユーザー
};

// Login
router.post('/login', async (req, res) => {
  try {
    console.log('[auth/login] Login attempt:', { username: req.body?.username });

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'ユーザー名とパスワードが必要です'
      });
    }

    // DB接続確認（master_dataスキーマを明示）
    let result;
    try {
      result = await dbQuery(
        'SELECT id, username, display_name, password, role, department FROM master_data.users WHERE username = $1',
        [username]
      );
    } catch (dbError) {
      console.error('[auth/login] Database query failed:', dbError);
      return res.status(503).json({
        success: false,
        error: 'データベースに接続できません。管理者に連絡してください。',
        details: NODE_ENV === 'production' ? undefined : dbError.message
      });
    }

    if (result.rows.length === 0) {
      console.log('[auth/login] User not found:', username);
      return res.status(401).json({
        success: false,
        error: 'ユーザー名またはパスワードが間違っています'
      });
    }

    const user = result.rows[0];
    
    // パスワードハッシュの形式チェック
    if (!user.password || !user.password.startsWith('$2')) {
      console.error('[auth/login] Invalid password hash format for user:', username);
      return res.status(500).json({
        success: false,
        error: 'データベースのユーザー情報が破損しています。管理者に連絡してください。'
      });
    }

    console.log('[auth/login] Password validation for:', username);

    // DB保存されたハッシュと入力パスワードを比較（必ずDBのみを使用）
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log('[auth/login] Password validation failed for user:', username);
      return res.status(401).json({
        success: false,
        error: 'ユーザー名またはパスワードが間違っています'
      });
    }

    console.log('[auth/login] ✅ Login successful for:', username, 'Role:', user.role);
    console.log('[auth/login] Authentication source: Database (PostgreSQL)');
    console.log('[auth/login] Session debug:', {
      sessionID: req.sessionID,
      cookie: req.session.cookie,
      hasSession: !!req.session
    });

    req.session.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: normalizeUserRole(user.role),
      department: user.department
    };

    // セッション保存を確実にする
    req.session.save((err) => {
      if (err) {
        console.error('[auth/login] Session save error:', err);
        return res.status(500).json({
          success: false,
          error: 'セッション保存エラー'
        });
      }

      console.log('[auth/login] Session saved successfully');
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          role: normalizeUserRole(user.role),
          department: user.department
        },
        message: 'ログインに成功しました',
        timestamp: new Date().toISOString(),
        debug: {
          sessionID: req.sessionID,
          cookieSet: true
        }
      });
    });

  } catch (error) {
    console.error('[auth/login] Error:', error);
    res.status(500).json({
      success: false,
      error: 'ログイン処理に失敗しました',
      details: NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Handshake
router.get('/handshake', (req, res) => {
  res.json({
    ok: true,
    mode: 'session',
    env: 'azure-production',
    timestamp: new Date().toISOString(),
    sessionId: req.sessionID
  });
});

// Me
router.get('/me', (req, res) => {
  if (req.session.user) {
    const normalizedRole = normalizeUserRole(req.session.user.role);
    const normalizedUser = {
      ...req.session.user,
      role: normalizedRole
    };
    req.session.user = normalizedUser;

    res.json({
      success: true,
      user: normalizedUser,
      message: '認証済み',
      debug: {
        sessionId: req.sessionID,
        userRole: normalizedRole,
        timestamp: new Date().toISOString()
      }
    });
  } else {
    res.status(401).json({
      success: false,
      message: '未認証',
      debug: {
        sessionId: req.sessionID,
        hasSession: !!req.session,
        hasCookie: !!req.headers.cookie,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Check Admin (システム管理者)
router.get('/check-admin', (req, res) => {
  const userRole = req.session.user ? normalizeUserRole(req.session.user.role) : null;
  if (req.session.user && userRole === 'admin') {
    res.json({
      success: true,
      message: 'システム管理者権限あり',
      user: { ...req.session.user, role: userRole },
      permissions: ['all'] // すべてのUI
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'システム管理者権限がありません',
      currentRole: userRole
    });
  }
});

// Check Operator (運用管理者)
router.get('/check-operator', (req, res) => {
  const userRole = req.session.user ? normalizeUserRole(req.session.user.role) : null;
  if (req.session.user && (userRole === 'operator' || userRole === 'admin')) {
    res.json({
      success: true,
      message: '運用管理者権限あり',
      user: { ...req.session.user, role: userRole },
      permissions: ['chat', 'history', 'emergency-data'] // チャット+履歴+応急復旧データ
    });
  } else {
    res.status(403).json({
      success: false,
      message: '運用管理者権限がありません',
      currentRole: userRole
    });
  }
});

// Check Employee (従業員) - 後方互換性のため残す
router.get('/check-employee', (req, res) => {
  const userRole = req.session.user ? normalizeUserRole(req.session.user.role) : null;
  if (req.session.user && (userRole === 'employee' || userRole === 'operator' || userRole === 'admin')) {
    res.json({
      success: true,
      message: 'ユーザー権限あり',
      user: { ...req.session.user, role: userRole },
      permissions: ['chat', 'history'] // チャット+履歴のみ
    });
  } else {
    res.status(403).json({
      success: false,
      message: 'ユーザー権限がありません',
      currentRole: userRole
    });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).json({
        success: false,
        message: 'ログアウトに失敗しました'
      });
    }
    res.json({
      success: true,
      message: 'ログアウトしました'
    });
  });
});

export default function registerAuthRoutes(app) {
  app.use('/api/auth', router);
}
