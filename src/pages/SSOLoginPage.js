import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/contexts/AuthContext';
import { API_BASE_URL } from '../config/apiConfig';

/**
 * SSOインバウンド用ログインページ
 * 他のサイトからStudySphereへの自動ログイン処理を行う
 * 
 * 処理フロー:
 * 1. URLクエリパラメータから `ticket` を取得
 * 2. StudySphere APIにSSOログインリクエストを送信（チケット検証 + JWTトークン生成）
 * 3. ログイン成功時にユーザー情報とJWTトークンを取得
 * 4. 認証処理を実行（AuthContextを使用）
 * 5. ロールに応じて適切なダッシュボードへリダイレクト
 */
const SSOLoginPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login, isAuthenticated, currentUser } = useAuth();
  
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const hasProcessedRef = useRef(false); // 処理済みフラグ（重複実行を防ぐ）

  // SSOログインAPI呼び出し
  const performSSOLogin = async (ticket) => {
    try {
      console.log('SSOLoginPage: SSOログインAPI呼び出し開始', { ticket: ticket ? '***' : 'なし' });

      const response = await fetch(`${API_BASE_URL}/api/sso/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('SSOLoginPage: SSOログイン失敗', result);
        
        // NO_LOGIN_CODEエラーの場合、元システムにリダイレクト
        if (result.error === 'NO_LOGIN_CODE' && result.source_system) {
          const sourceSystem = result.source_system;
          const redirectUrl = `${sourceSystem.base_url}${sourceSystem.landing_path}`;
          
          console.log('SSOLoginPage: ログインコード未所持のため元システムにリダイレクト', {
            sourceSystem: sourceSystem.system_key,
            redirectUrl
          });
          
          // 元システムにリダイレクト（即座に実行）
          window.location.href = redirectUrl;
          return { success: false, redirecting: true };
        }

        // NO_TEMP_PASSWORDエラーの場合、アラートを表示して元システムにリダイレクト
        if (result.error === 'NO_TEMP_PASSWORD' && result.source_system) {
          const sourceSystem = result.source_system;
          const redirectUrl = `${sourceSystem.base_url}${sourceSystem.landing_path}`;
          const errorMessage = result.message || '一時パスワードが発行されていません。担当者に一時パスワードの発行を依頼してください';
          
          console.log('SSOLoginPage: 一時パスワード未発行のため元システムにリダイレクト', {
            sourceSystem: sourceSystem.system_key,
            redirectUrl,
            errorMessage
          });
          
          // アラートを表示してから元システムにリダイレクト
          alert(errorMessage);
          window.location.href = redirectUrl;
          return { success: false, redirecting: true };
        }

        return {
          success: false,
          error: result.error || 'UNKNOWN_ERROR',
          message: result.message || 'SSOログインに失敗しました'
        };
      }

      console.log('SSOLoginPage: SSOログイン成功', {
        userId: result.data.user_id,
        username: result.data.username,
        name: result.data.name,
        role: result.data.role
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      console.error('SSOLoginPage: SSOログインAPI呼び出しエラー', error);
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || 'ネットワークエラーが発生しました'
      };
    }
  };

  // 自動ログイン処理
  useEffect(() => {
    // 既に処理済みの場合はスキップ（React StrictModeや再レンダリングによる重複実行を防ぐ）
    if (hasProcessedRef.current) {
      console.log('SSOLoginPage: 既に処理済みのためスキップ');
      return;
    }

    const handleSSOLogin = async () => {
      // 処理開始フラグを設定
      hasProcessedRef.current = true;

      try {
        // クエリパラメータからticketを取得
        const ticket = searchParams.get('ticket');

        if (!ticket) {
          console.error('SSOLoginPage: ticketパラメータがありません');
          setStatus('error');
          setErrorMessage('チケットが提供されていません');
          
          // 3秒後にログインページへリダイレクト
          setTimeout(() => {
            navigate('/admin-instructor-login');
          }, 3000);
          return;
        }

        // 既に認証済みの場合はダッシュボードにリダイレクト
        if (isAuthenticated && currentUser) {
          console.log('SSOLoginPage: 既に認証済みです');
          redirectToDashboard(currentUser.role);
          return;
        }

        // SSOログイン処理
        const loginResult = await performSSOLogin(ticket);

        if (loginResult.redirecting) {
          // 元システムへのリダイレクト中
          return;
        }

        if (!loginResult.success) {
          setStatus('error');
          setErrorMessage(loginResult.message || 'SSOログインに失敗しました');
          console.error('SSOLoginPage: SSOログイン失敗', loginResult);
          
          // エラー表示後、3秒後にログインページへリダイレクト
          setTimeout(() => {
            navigate('/admin-instructor-login');
          }, 3000);
          return;
        }

        const userData = loginResult.data;

        // JWTトークンをlocalStorageに保存
        if (userData.access_token) {
          localStorage.setItem('accessToken', userData.access_token);
          console.log('SSOLoginPage: アクセストークンを保存');
        }
        if (userData.refresh_token) {
          localStorage.setItem('refreshToken', userData.refresh_token);
          console.log('SSOLoginPage: リフレッシュトークンを保存');
        }

        // ユーザー情報を準備
        const authUserData = {
          id: userData.user_id,
          name: userData.name,
          role: userData.role,
          login_code: userData.username,
          company_id: userData.company_id,
          company_name: userData.company_name,
          locationNames: userData.locationNames || []
        };

        console.log('SSOLoginPage: ユーザーデータを準備', authUserData);

        // 認証処理を実行（JWTトークン付きでログイン）
        login(
          authUserData,
          userData.access_token,
          userData.refresh_token
        );

        console.log('SSOLoginPage: 自動ログイン成功');

        // ロールに応じてダッシュボードへリダイレクト
        redirectToDashboard(userData.role);

      } catch (error) {
        console.error('SSOLoginPage: 処理エラー', error);
        setStatus('error');
        setErrorMessage('ログイン処理中にエラーが発生しました');
        
        // 3秒後にログインページへリダイレクト
        setTimeout(() => {
          navigate('/admin-instructor-login');
        }, 3000);
      }
    };

    handleSSOLogin();
  }, [searchParams, login, isAuthenticated, currentUser, navigate]);

  // ロールに応じてダッシュボードへリダイレクト
  const redirectToDashboard = (role) => {
    console.log('SSOLoginPage: ダッシュボードへリダイレクト', { role });
    
    // ロールに応じてリダイレクト先を決定
    switch (role) {
      case 1: // 利用者
        navigate('/student/dashboard');
        break;
      case 4: // 指導員
      case 5: // 管理者
        navigate('/instructor/dashboard');
        break;
      case 9: // アドミン
      case 10: // マスターユーザー
        navigate('/admin/dashboard');
        break;
      default:
        console.warn('SSOLoginPage: 不明なロール', role);
        navigate('/admin-instructor-login');
        break;
    }
  };

  // ローディング表示
  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-blue-600 text-xl font-semibold mb-2">
            SSOログイン中...
          </div>
          <div className="text-gray-600 text-sm">
            認証情報を確認しています
          </div>
        </div>
      </div>
    );
  }

  // エラー表示
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
            <div className="text-red-600 text-xl font-semibold mb-2">
              SSOログインエラー
            </div>
            <div className="text-red-700 mb-4">
              {errorMessage}
            </div>
            <div className="text-gray-600 text-sm">
              ログインページに移動します...
            </div>
          </div>
          <button 
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            onClick={() => navigate('/admin-instructor-login')}
          >
            今すぐログインページへ
          </button>
        </div>
      </div>
    );
  }

  // 通常はここに到達しないが、念のため
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-gray-600 text-lg">
          処理中...
        </div>
      </div>
    </div>
  );
};

export default SSOLoginPage;







