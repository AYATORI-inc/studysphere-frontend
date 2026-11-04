import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/contexts/AuthContext';
import { API_BASE_URL } from '../config/apiConfig';

/**
 * SSO Dispatcher（ルーティングコンポーネント）
 * クエリパラメータから遷移元・遷移先を判断し、チケット検証・生成・リダイレクトを実行
 * 
 * 処理フロー:
 * 1. ログインセッション確認
 * 2. 遷移元チケット検証（ticketパラメータがある場合）
 * 3. 遷移先システムの検証（チケット生成時に自動検証）
 * 4. 遷移先用チケット生成
 * 5. リダイレクト実行
 */
const SSODispatcherPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, currentUser } = useAuth();
  
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const hasProcessedRef = useRef(false); // 処理済みフラグ（重複実行を防ぐ）

  // チケット検証API呼び出し
  const verifyTicket = async (ticket) => {
    try {
      console.log('SSODispatcherPage: チケット検証API呼び出し開始', { ticket: ticket ? '***' : 'なし' });

      const response = await fetch(`${API_BASE_URL}/api/sso/ticket/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticket }),
      });

      const result = await response.json();

      if (!response.ok || !result.valid) {
        console.error('SSODispatcherPage: チケット検証失敗', result);
        return {
          success: false,
          error: result.error || 'INVALID_TICKET',
          message: result.message || 'チケットの検証に失敗しました'
        };
      }

      console.log('SSODispatcherPage: チケット検証成功', {
        userId: result.data.user_id,
        sourceSystem: result.data.source_system,
        targetSystem: result.data.target_system
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      console.error('SSODispatcherPage: チケット検証API呼び出しエラー', error);
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || 'ネットワークエラーが発生しました'
      };
    }
  };

  // チケット生成API呼び出し
  const generateTicket = async (targetSystem, sourceSystem) => {
    try {
      console.log('SSODispatcherPage: チケット生成API呼び出し開始', {
        targetSystem,
        sourceSystem
      });

      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        return {
          success: false,
          error: 'NO_AUTH_TOKEN',
          message: '認証トークンが見つかりません'
        };
      }

      const response = await fetch(`${API_BASE_URL}/api/sso/ticket/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          target_system: targetSystem,
          source_system: sourceSystem || 'studysphere',
          context: 'sso_dispatch'
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('SSODispatcherPage: チケット生成失敗', result);
        
        // 信頼システムが存在しない場合のエラー
        if (result.message && result.message.includes('信頼システム')) {
          return {
            success: false,
            error: 'INVALID_TARGET_SYSTEM',
            message: '遷移先システムが信頼システムリストに存在しません'
          };
        }

        return {
          success: false,
          error: result.error || 'GENERATION_ERROR',
          message: result.message || 'チケット生成に失敗しました'
        };
      }

      console.log('SSODispatcherPage: チケット生成成功', {
        ticket: result.data.ticket ? '***' : 'なし',
        expiresIn: result.data.expires_in
      });

      return {
        success: true,
        data: result.data
      };
    } catch (error) {
      console.error('SSODispatcherPage: チケット生成API呼び出しエラー', error);
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message || 'ネットワークエラーが発生しました'
      };
    }
  };


  // メイン処理
  useEffect(() => {
    // 既に処理済みの場合はスキップ（React StrictModeや再レンダリングによる重複実行を防ぐ）
    if (hasProcessedRef.current) {
      console.log('SSODispatcherPage: 既に処理済みのためスキップ');
      return;
    }

    const handleDispatch = async () => {
      // 処理開始フラグを設定
      hasProcessedRef.current = true;

      try {
        // クエリパラメータを取得
        const target = searchParams.get('target');
        const ticket = searchParams.get('ticket');
        const source = searchParams.get('source');

        console.log('SSODispatcherPage: クエリパラメータ確認', {
          target,
          ticket: ticket ? '***' : 'なし',
          source
        });

        // targetパラメータが必須
        if (!target) {
          console.error('SSODispatcherPage: targetパラメータがありません');
          setStatus('error');
          setErrorMessage('遷移先システム（target）が指定されていません');
          
          // 3秒後にダッシュボードへリダイレクト
          setTimeout(() => {
            if (isAuthenticated && currentUser) {
              redirectToDashboard(currentUser.role);
            } else {
              navigate('/admin-instructor-login');
            }
          }, 3000);
          return;
        }

        // ログインセッション確認
        if (!isAuthenticated || !currentUser) {
          console.log('SSODispatcherPage: 未ログインのためログインページへリダイレクト');
          const returnUrl = encodeURIComponent(`/sso-dispatch?target=${target}${ticket ? `&ticket=${ticket}` : ''}${source ? `&source=${source}` : ''}`);
          
          // referrerやURLから利用者ダッシュボード経由かどうかを判定
          const referrer = document.referrer;
          const isFromStudentDashboard = referrer.includes('/student/dashboard') || 
                                         window.location.href.includes('/student/');
          
          // 利用者ダッシュボードから来た場合は利用者ログインページへ
          if (isFromStudentDashboard) {
            navigate(`/student-login?return_url=${returnUrl}`);
          } else {
            navigate(`/admin-instructor-login?return_url=${returnUrl}`);
          }
          return;
        }

        // 遷移元チケット検証（ticketパラメータがある場合）
        let verifiedSourceSystem = source || 'studysphere';
        if (ticket) {
          console.log('SSODispatcherPage: 遷移元チケット検証を開始');
          const verifyResult = await verifyTicket(ticket);

          if (!verifyResult.success) {
            setStatus('error');
            setErrorMessage(verifyResult.message || 'チケットの検証に失敗しました');
            console.error('SSODispatcherPage: チケット検証失敗', verifyResult);
            
            // エラー表示後、3秒後にダッシュボードへリダイレクト
            setTimeout(() => {
              redirectToDashboard(currentUser.role);
            }, 3000);
            return;
          }

          // 検証成功時、source_systemを取得
          if (verifyResult.data && verifyResult.data.source_system) {
            verifiedSourceSystem = verifyResult.data.source_system;
          }
        }

        // 遷移先用チケット生成
        console.log('SSODispatcherPage: 遷移先用チケット生成を開始', {
          targetSystem: target,
          sourceSystem: verifiedSourceSystem
        });

        const generateResult = await generateTicket(target, verifiedSourceSystem);

        if (!generateResult.success) {
          setStatus('error');
          setErrorMessage(generateResult.message || 'チケット生成に失敗しました');
          console.error('SSODispatcherPage: チケット生成失敗', generateResult);
          
          // エラー表示後、3秒後にダッシュボードへリダイレクト
          setTimeout(() => {
            redirectToDashboard(currentUser.role);
          }, 3000);
          return;
        }

        const generatedTicket = generateResult.data.ticket;

        // リダイレクト先URLを構築
        // APIレスポンスからbase_urlとlanding_pathを取得
        const targetSystemInfo = generateResult.data.target_system;
        if (!targetSystemInfo || !targetSystemInfo.base_url) {
          setStatus('error');
          setErrorMessage('遷移先システムの情報を取得できませんでした');
          console.error('SSODispatcherPage: 遷移先システム情報が取得できません', generateResult.data);
          setTimeout(() => {
            redirectToDashboard(currentUser.role);
          }, 3000);
          return;
        }

        // landing_pathがスラッシュで始まらない場合は追加
        const landingPath = targetSystemInfo.landing_path.startsWith('/')
          ? targetSystemInfo.landing_path
          : `/${targetSystemInfo.landing_path}`;

        // base_urlの末尾スラッシュを削除してからlanding_pathを結合
        const baseUrl = targetSystemInfo.base_url.replace(/\/+$/, '');
        const redirectUrl = `${baseUrl}${landingPath}?ticket=${generatedTicket}`;

        console.log('SSODispatcherPage: リダイレクト実行', {
          targetSystem: target,
          redirectUrl: redirectUrl.replace(/ticket=[^&]+/, 'ticket=***')
        });

        // リダイレクト実行
        window.location.href = redirectUrl;

      } catch (error) {
        console.error('SSODispatcherPage: 処理エラー', error);
        setStatus('error');
        setErrorMessage('SSOディスパッチ処理中にエラーが発生しました');
        
        // 3秒後にダッシュボードへリダイレクト
        setTimeout(() => {
          if (isAuthenticated && currentUser) {
            redirectToDashboard(currentUser.role);
          } else {
            navigate('/admin-instructor-login');
          }
        }, 3000);
      }
    };

    // 認証状態の初期化を待つ（別タブで開いた場合の対応）
    const checkAuthAndDispatch = async () => {
      // 少し待ってから認証状態を再確認（AuthContextの初期化を待つ）
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // localStorageから認証情報を確認
      const accessToken = localStorage.getItem('accessToken');
      const currentUserStr = localStorage.getItem('currentUser');
      
      console.log('SSODispatcherPage: 認証状態確認', {
        hasAccessToken: !!accessToken,
        hasCurrentUser: !!currentUserStr,
        isAuthenticated,
        currentUser: currentUser ? '存在' : 'なし'
      });
      
      // 認証情報がlocalStorageにあるが、AuthContextがまだ初期化されていない場合
      // 少し待ってから再確認
      if ((accessToken || currentUserStr) && (!isAuthenticated || !currentUser)) {
        console.log('SSODispatcherPage: 認証情報は存在するが、AuthContextが未初期化の可能性。少し待機...');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      handleDispatch();
    };

    checkAuthAndDispatch();
  }, [searchParams, isAuthenticated, currentUser, navigate]);

  // ロールに応じてダッシュボードへリダイレクト
  const redirectToDashboard = (role) => {
    console.log('SSODispatcherPage: ダッシュボードへリダイレクト', { role });
    
    // ロールに応じてリダイレクト先を決定
    switch (role) {
      case 1: // 利用者
        navigate('/student/dashboard');
        break;
      case 4: // 指導員
        navigate('/instructor/dashboard');
        break;
      case 5: // 管理者
      case 9: // アドミン
      case 10: // マスターユーザー
        navigate('/admin/dashboard');
        break;
      default:
        console.warn('SSODispatcherPage: 不明なロール', role);
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
            SSO転送処理中...
          </div>
          <div className="text-gray-600 text-sm">
            システム間の認証情報を確認しています
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
              SSO転送エラー
            </div>
            <div className="text-red-700 mb-4">
              {errorMessage}
            </div>
            <div className="text-gray-600 text-sm">
              ダッシュボードに移動します...
            </div>
          </div>
          <button 
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            onClick={() => {
              if (isAuthenticated && currentUser) {
                redirectToDashboard(currentUser.role);
              } else {
                navigate('/admin-instructor-login');
              }
            }}
          >
            ダッシュボードへ戻る
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

export default SSODispatcherPage;

