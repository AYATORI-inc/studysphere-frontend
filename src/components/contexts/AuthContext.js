import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  getStoredTokens, 
  handleTokenInvalid, 
  isAuthRequiredPage, 
  handleLogout,
  isRefreshTokenExpired,
  shouldRefreshToken,
  getTokenExpiryTime,
  isTokenValid,
  clearStoredTokens,
  storeTokens
} from '../../utils/authUtils';
import { refreshTokenAPI } from '../../utils/authUtils';
import { setGlobalNavigate, setupFetchInterceptor } from '../../utils/httpInterceptor';
import { addOperationLog } from '../../utils/operationLogManager';
import { markTempPasswordAsUsedAPI } from '../../utils/api';
import { API_BASE_URL } from '../../config/apiConfig';

// 認証コンテキストの作成
export const AuthContext = createContext();

// カスタムフック
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const tokenCheckInterval = useRef(null);
  const tokenRefreshTimeout = useRef(null);
  // 更新試行回数の制限（統一）
  const MAX_REFRESH_ATTEMPTS = 3; // 10回から3回に戻す
  const refreshAttempts = useRef(0);
  const isRefreshing = useRef(false); // リフレッシュ中フラグを追加

  // 初期認証チェック
  useEffect(() => {
    // グローバルナビゲーション関数を設定
    setGlobalNavigate(navigate);
    
    // HTTPインターセプターを設定
    setupFetchInterceptor();
    
    const checkInitialAuth = async () => {
      // ログインページの場合は認証チェックをスキップ
      const currentPath = location.pathname;
      const isLoginPage = currentPath === '/' || currentPath.startsWith('/student/login') || currentPath.startsWith('/login');
      
      if (isLoginPage) {
        console.log('AuthContext: ログインページのため、初期認証チェックをスキップします');
        setIsAuthenticated(false);
        setCurrentUser(null);
        setIsLoading(false);
        return;
      }
      try {
        console.log('=== 初期認証チェック開始 ===');
        const userData = localStorage.getItem('currentUser');
        console.log('localStorage currentUser:', userData ? '存在' : 'なし');
        
        if (!userData) {
          console.log('ユーザーデータがありません');
          setIsAuthenticated(false);
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }

        const user = JSON.parse(userData);
        console.log('ユーザー情報:', { role: user.role, name: user.name });
        console.log('初期認証チェック - 指導員名デバッグ:', {
          instructorName: user.instructorName,
          type: typeof user.instructorName,
          isTruthy: !!user.instructorName
        });
        setCurrentUser(user);

        // JWT認証または一時パスワード認証の確認
        const { accessToken, refreshToken } = getStoredTokens();
        console.log('保存されたトークン:', { 
          accessToken: accessToken ? '存在' : 'なし', 
          refreshToken: refreshToken ? '存在' : 'なし' 
        });
        
        // 一時パスワード認証情報の確認
        const loginCode = localStorage.getItem('loginCode');
        const tempPassword = localStorage.getItem('tempPassword');
        const tempPasswordExpiry = localStorage.getItem('tempPasswordExpiry');
        
        console.log('一時パスワード認証情報:', {
          loginCode: loginCode ? '存在' : 'なし',
          tempPassword: tempPassword ? '存在' : 'なし',
          expiry: tempPasswordExpiry || 'なし'
        });
        
        // JWTトークンがない場合、一時パスワード認証情報をチェック
        if (!accessToken || !refreshToken) {
          if (loginCode && tempPassword) {
            // 一時パスワード認証情報がある場合
            if (tempPasswordExpiry) {
              const expiryDate = new Date(tempPasswordExpiry);
              const now = new Date();
              
              if (expiryDate > now) {
                console.log('一時パスワード認証情報が有効です - 認証済みとして設定');
                setIsAuthenticated(true);
                setCurrentUser(user);
                setIsLoading(false);
                return;
              } else {
                console.log('一時パスワードの有効期限が切れています');
                // 期限切れの認証情報をクリア
                localStorage.removeItem('loginCode');
                localStorage.removeItem('tempPassword');
                localStorage.removeItem('tempPasswordExpiry');
                localStorage.removeItem('currentUser');
              }
            } else {
              console.log('一時パスワード認証情報が有効です（有効期限なし）- 認証済みとして設定');
              setIsAuthenticated(true);
              setCurrentUser(user);
              setIsLoading(false);
              return;
            }
          }
          
          console.log('有効な認証情報が見つかりません - 認証されていません');
          setIsAuthenticated(false);
          setCurrentUser(null);
          setIsLoading(false);
          return;
        }
        
        // リフレッシュトークンの有効期限をチェック
        console.log('リフレッシュトークンの有効期限をチェック中...');
        if (isRefreshTokenExpired(refreshToken)) {
          console.log('リフレッシュトークンの有効期限が切れています');
          handleTokenInvalid(navigate, 'リフレッシュトークンの有効期限が切れました');
          return;
        }
        console.log('リフレッシュトークンは有効です');
        
        // トークンの詳細を確認（デバッグ用）
        if (accessToken) {
          console.log('アクセストークン詳細:', {
            length: accessToken.length,
            startsWith: accessToken.substring(0, 20) + '...',
            containsDots: accessToken.includes('.'),
            dotCount: (accessToken.match(/\./g) || []).length,
            fullToken: accessToken // 完全なトークンを表示
          });
        }
        if (refreshToken) {
          console.log('リフレッシュトークン詳細:', {
            length: refreshToken.length,
            startsWith: refreshToken.substring(0, 20) + '...',
            containsDots: refreshToken.includes('.'),
            dotCount: (refreshToken.match(/\./g) || []).length,
            fullToken: refreshToken // 完全なトークンを表示
          });
        }

        // トークンの形式をチェック
        if (!accessToken.includes('.') || accessToken.split('.').length !== 3) {
          console.error('アクセストークンの形式が不正です:', accessToken);
          handleTokenInvalid(navigate, 'アクセストークンの形式が不正です');
          return;
        }

        if (!refreshToken.includes('.') || refreshToken.split('.').length !== 3) {
          console.error('リフレッシュトークンの形式が不正です:', refreshToken);
          handleTokenInvalid(navigate, 'リフレッシュトークンの形式が不正です');
          return;
        }

        // アクセストークンの有効性をチェック
        console.log('アクセストークンの有効性をチェック中...');
        const isValid = isTokenValid(accessToken);
        const remainingTime = getTokenExpiryTime(accessToken);
        
        console.log('トークン有効性チェック:', { 
          isValid, 
          remainingTime, 
          shouldRefresh: shouldRefreshToken(accessToken),
          remainingMinutes: Math.floor(remainingTime / 60)
        });

        if (!isValid) {
          // アクセストークンが完全に無効な場合はリフレッシュトークンで更新を試行
          console.log('アクセストークンが無効です。トークン更新を試行します。');
          try {
            await handleTokenRefresh(refreshToken);
            // 更新成功時は認証済みとして設定
            console.log('トークン更新成功 - 認証済みとして設定');
            setIsAuthenticated(true);
            setIsLoading(false);
          } catch (error) {
            console.error('初期認証時のトークン更新に失敗:', error);
            // 更新失敗時はログアウト処理
            handleTokenInvalid(navigate, 'トークンの有効期限が切れました');
          }
          return;
        }

        // アクセストークンが有効な場合
        console.log('アクセストークンが有効です');
        setIsAuthenticated(true);
        setIsLoading(false);
        
        // 30分以内に期限切れになる場合は更新を試行
        if (shouldRefreshToken(accessToken)) {
          console.log('アクセストークンが30分以内に期限切れになります。バックグラウンドで更新を試行します。');
          handleTokenRefresh(refreshToken).catch(error => {
            console.error('バックグラウンドトークン更新に失敗:', error);
            // バックグラウンド更新の失敗は致命的ではないので、ログアウトしない
          });
        }
      } catch (error) {
        console.error('Initial auth check error:', error);
        handleTokenInvalid(navigate, '認証チェック中にエラーが発生しました');
      }
    };

    checkInitialAuth();
  }, []);

  // トークン更新処理の改善
  const handleTokenRefresh = async (refreshToken) => {
    // 既にリフレッシュ中の場合は待機
    if (isRefreshing.current) {
      console.log('トークン更新が既に進行中です。待機します。');
      return false;
    }

    // 試行回数制限チェック
    if (refreshAttempts.current >= MAX_REFRESH_ATTEMPTS) {
      console.error(`トークン更新の試行回数が上限(${MAX_REFRESH_ATTEMPTS}回)に達しました`);
      handleTokenInvalid(navigate, '認証セッションが期限切れです。再度ログインしてください。');
      return false;
    }

    try {
      isRefreshing.current = true;
      refreshAttempts.current++;
      console.log(`トークン更新試行 ${refreshAttempts.current}/${MAX_REFRESH_ATTEMPTS}`);

      const response = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('トークン更新成功');
        const { access_token, refresh_token } = result.data;
        storeTokens(access_token, refresh_token);
        
        // 試行回数をリセット
        refreshAttempts.current = 0;
        isRefreshing.current = false;
        return true;
      } else {
        throw new Error(result.message || 'トークン更新に失敗しました');
      }
    } catch (error) {
      console.error('トークン更新エラー:', error);
      
      // 最後の試行で失敗した場合
      if (refreshAttempts.current >= MAX_REFRESH_ATTEMPTS) {
        console.error('トークン更新の最大試行回数に達しました');
        handleTokenInvalid(navigate, '認証セッションが期限切れです。再度ログインしてください。');
      } else {
        console.log(`更新失敗。残り試行回数: ${MAX_REFRESH_ATTEMPTS - refreshAttempts.current}`);
      }
      
      isRefreshing.current = false;
      return false;
    }
  };

  // 定期的なトークンチェック処理の改善
  const checkTokenPeriodically = async () => {
    try {
      const { accessToken, refreshToken } = getStoredTokens();
      
      if (!accessToken || !refreshToken) {
        console.log('トークンが存在しません');
        return;
      }

      // リフレッシュトークンの有効期限チェック
      if (isRefreshTokenExpired(refreshToken)) {
        console.log('リフレッシュトークンの有効期限が切れています');
        handleTokenInvalid(navigate, 'セッションが期限切れです。再度ログインしてください。');
        return;
      }

      // アクセストークンの有効性チェック
      const isValid = isTokenValid(accessToken);
      const shouldRefresh = shouldRefreshToken(accessToken);
      
      // アクセストークンが有効でも残り30分以下なら更新（有効期限切れ前に更新）
      if (shouldRefresh) {
        console.log('アクセストークンの残り時間が30分以下です。更新を試行します。');
        const success = await handleTokenRefresh(refreshToken);
        
        if (!success) {
          // 更新に失敗した場合はログアウト
          console.log('トークン更新に失敗しました。ログアウトします。');
          await logout();
        }
      } else if (!isValid) {
        // アクセストークンが無効で、更新タイミングでない場合（残り30分以上あるが期限切れ）
        console.log('アクセストークンが無効です。更新を試行します。');
        const success = await handleTokenRefresh(refreshToken);
        
        if (!success) {
          // 更新に失敗した場合はログアウト
          console.log('トークン更新に失敗しました。ログアウトします。');
          await logout();
        }
      }
    } catch (error) {
      console.error('定期的なトークンチェックでエラー:', error);
      // エラーが発生した場合はログアウト
      await logout();
    }
  };

  // ページ変更時の認証チェック
  useEffect(() => {
    if (isLoading) return;

    const pathname = location.pathname;
    
    // 認証が必要なページで認証されていない場合
    if (isAuthRequiredPage(pathname) && !isAuthenticated) {
      handleTokenInvalid(navigate, '認証が必要です');
      return;
    }

    // 認証済みでログインページにアクセスした場合の処理を削除
    // これにより、ログアウト後にログインページに戻れるようになる
    // また、利用者ログイン時も既存セッションがあっても新しいログインが可能になる
  }, [location.pathname, isAuthenticated, isLoading]);

  // 定期的なトークンチェック（認証済みの場合のみ）
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // 初回チェック
    checkTokenPeriodically();

    // 5分ごとにチェック
    tokenCheckInterval.current = setInterval(checkTokenPeriodically, 5 * 60 * 1000);

    return () => {
      if (tokenCheckInterval.current) {
        clearInterval(tokenCheckInterval.current);
        tokenCheckInterval.current = null;
      }
    };
  }, [isAuthenticated]);

  // ログアウト処理の改善
  const logout = async () => {
    console.log('=== ログアウト処理開始 ===');
    
    // リフレッシュ状態をリセット
    isRefreshing.current = false;
    refreshAttempts.current = 0;
    
    // 既存のタイマーをクリア
    if (tokenCheckInterval.current) {
      clearInterval(tokenCheckInterval.current);
      tokenCheckInterval.current = null;
    }
    if (tokenRefreshTimeout.current) {
      clearTimeout(tokenRefreshTimeout.current);
      tokenRefreshTimeout.current = null;
    }

    // ユーザーデータを取得（ログ用）
    const userData = localStorage.getItem('currentUser');
    let userName = '不明';
    let userRole = '不明';
    let userId = null;
    let userRoleId = null;
    
    if (userData) {
      try {
        const user = JSON.parse(userData);
        userName = user.name || '不明';
        userRoleId = user.role;
        userId = user.id;
        
        // ロール番号に基づいてロール名を判定
        if (userRoleId === 1) {
          userRole = '利用者';
        } else if (userRoleId >= 4) {
          userRole = '管理者・指導員';
        } else {
          userRole = '不明';
        }
      } catch (error) {
        console.error('ユーザー情報の解析に失敗しました:', error);
      }
    }
    
    // 利用者（role=1）の場合、一時パスワードを使用済みにマーク
    if (userRoleId === 1 && userId) {
      try {
        console.log('利用者の一時パスワードを使用済みにマークします');
        await markTempPasswordAsUsedAPI(userId);
        console.log('一時パスワードを使用済みにマークしました');
      } catch (error) {
        console.error('一時パスワードの使用済みマークに失敗しました:', error);
      }
    }
    
    // 操作ログを記録
    try {
      await addOperationLog({
        action: 'ログアウト',
        details: `${userRole}「${userName}」がログアウトしました`
      });
    } catch (error) {
      console.error('ログアウトログの記録に失敗しました:', error);
    }
    
    // 一時パスワード認証情報を保持するため、特定の項目のみクリア
    const tempPasswordAuth = {
      loginCode: localStorage.getItem('loginCode'),
      tempPassword: localStorage.getItem('tempPassword'),
      tempPasswordExpiry: localStorage.getItem('tempPasswordExpiry'),
      autoLoginCode: localStorage.getItem('autoLoginCode'),
      temp_password: localStorage.getItem('temp_password')
    };
    
    // ローカルストレージをクリア
    localStorage.removeItem('currentUser');
    clearStoredTokens();
    
    // 追加のクリア処理（確実性のため）
    localStorage.clear();
    sessionStorage.clear();
    
    // 一時パスワード認証情報を復元（利用者ログイン用）
    if (tempPasswordAuth.loginCode) {
      localStorage.setItem('loginCode', tempPasswordAuth.loginCode);
    }
    if (tempPasswordAuth.tempPassword) {
      localStorage.setItem('tempPassword', tempPasswordAuth.tempPassword);
    }
    if (tempPasswordAuth.tempPasswordExpiry) {
      localStorage.setItem('tempPasswordExpiry', tempPasswordAuth.tempPasswordExpiry);
    }
    if (tempPasswordAuth.autoLoginCode) {
      localStorage.setItem('autoLoginCode', tempPasswordAuth.autoLoginCode);
    }
    if (tempPasswordAuth.temp_password) {
      localStorage.setItem('temp_password', tempPasswordAuth.temp_password);
    }
    
    console.log('LocalStorageとSessionStorageを完全にクリアしました');
    
    // 状態をリセット
    setIsAuthenticated(false);
    setCurrentUser(null);
    
    // ロールに応じてナビゲーション先を変更
    if (userRoleId === 1) {
      // 利用者（ロール1）の場合
      console.log('利用者のため、利用者ログインページにリダイレクトします');
      navigate('/student-login/');
    } else if (userRoleId >= 4) {
      // 管理者・指導員（ロール4以上）の場合
      console.log('管理者・指導員のため、管理者・指導員ログインページにリダイレクトします');
      navigate('/admin-instructor-login');
    } else {
      // 不明なロールの場合、ホームページにリダイレクト
      console.log('不明なロールのため、ホームページにリダイレクトします');
      navigate('/homepage');
    }
    
    console.log('ログアウト処理完了');
  };

  // ログイン処理
  const login = (userData, accessToken, refreshToken) => {
    console.log('=== ログイン処理開始 ===');
    console.log('ユーザーデータ:', userData);
    console.log('指導員名デバッグ:', {
      instructorName: userData.instructorName,
      type: typeof userData.instructorName,
      isTruthy: !!userData.instructorName
    });
    console.log('アクセストークン:', accessToken ? '存在' : 'なし');
    console.log('リフレッシュトークン:', refreshToken ? '存在' : 'なし');
    
    // 更新試行回数をリセット
    refreshAttempts.current = 0;
    
    // ローディング状態を開始
    setIsLoading(true);
    
    // トークンの詳細を確認（デバッグ用）
    if (accessToken) {
      console.log('ログイン時 - アクセストークン詳細:', {
        length: accessToken.length,
        startsWith: accessToken.substring(0, 20) + '...',
        containsDots: accessToken.includes('.'),
        dotCount: (accessToken.match(/\./g) || []).length,
        fullToken: accessToken // 完全なトークンを表示
      });
    }
    if (refreshToken) {
      console.log('ログイン時 - リフレッシュトークン詳細:', {
        length: refreshToken.length,
        startsWith: refreshToken.substring(0, 20) + '...',
        containsDots: refreshToken.includes('.'),
        dotCount: (refreshToken.match(/\./g) || []).length,
        fullToken: refreshToken // 完全なトークンを表示
      });
    }
    
    // 既存のユーザーデータのみクリア（一時パスワード認証情報は保持）
    localStorage.removeItem('currentUser');
    
    // 管理者の場合、拠点情報をセッションストレージに保存
    if (userData.role >= 6 && userData.satellite_id) {
      const selectedSatelliteInfo = {
        id: userData.satellite_id,
        name: userData.satellite_name,
        company_id: userData.company_id,
        company_name: userData.company_name
      };
      sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
      console.log('管理者ログイン時: selectedSatelliteを保存:', selectedSatelliteInfo);
    }
    
    localStorage.setItem('currentUser', JSON.stringify(userData));
    console.log('ユーザーデータをlocalStorageに保存完了');
    
    // トークンが提供されている場合のみ保存
    if (accessToken && refreshToken) {
      storeTokens(accessToken, refreshToken);
      console.log('トークンをlocalStorageに保存完了');
    } else {
      // トークンがない場合は、アクセストークンのみクリア（一時パスワード認証情報は保持）
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      console.log('トークンなし - 一時パスワード認証として処理');
    }
    
    // 状態を同期的に更新
    setCurrentUser(userData);
    setIsAuthenticated(true);
    setIsLoading(false);
    console.log('認証状態を設定完了');
    console.log('設定されたユーザーデータ:', userData);
    console.log('設定されたロール:', userData.role);
    console.log('ロールの型:', typeof userData.role);
  };

  // 拠点変更時の認証更新処理
  const updateAuthForSatellite = (userData, accessToken, refreshToken) => {
    console.log('=== 拠点変更時認証更新処理開始 ===');
    console.log('ユーザーデータ:', userData);
    console.log('アクセストークン:', accessToken ? '存在' : 'なし');
    console.log('リフレッシュトークン:', refreshToken ? '存在' : 'なし');
    
    // 更新試行回数をリセット
    refreshAttempts.current = 0;
    
    localStorage.setItem('currentUser', JSON.stringify(userData));
    console.log('ユーザーデータをlocalStorageに更新完了');
    
    // トークンを更新
    if (accessToken && refreshToken) {
      storeTokens(accessToken, refreshToken);
      console.log('トークンをlocalStorageに更新完了');
    }
    
    setCurrentUser(userData);
    console.log('認証状態を更新完了');
  };

  const value = {
    isAuthenticated,
    isLoading,
    currentUser,
    login,
    logout,
    updateAuthForSatellite
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};