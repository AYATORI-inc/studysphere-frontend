import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/contexts/AuthContext';
import { verifyTemporaryPasswordAPI } from '../utils/api';

const AutoLoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, currentUser } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleAutoLogin = async () => {
      console.log('AutoLoginPage: コンポーネントがマウントされました');
      console.log('AutoLoginPage: 現在のURL:', window.location.href);
      console.log('AutoLoginPage: searchParams:', searchParams.toString());
      console.log('AutoLoginPage: PUBLIC_URL:', process.env.PUBLIC_URL);
      console.log('AutoLoginPage: basename:', process.env.PUBLIC_URL);
      
      try {
        // クエリパラメータからログインコードと一時パスワードを取得
        // 複数のパラメータ名に対応
        const loginCode = searchParams.get('loginCode') || 
                         searchParams.get('code') || 
                         searchParams.get('login_code');
        const tempPassword = searchParams.get('tempPassword') || 
                           searchParams.get('password') || 
                           searchParams.get('temp_password');

        console.log('AutoLoginPage: クエリパラメータ確認:', { 
          loginCode, 
          tempPassword: tempPassword ? '***' : 'なし',
          allParams: Object.fromEntries(searchParams.entries())
        });

        // URLから直接パラメータを取得する試行（プレフィックス問題対策）
        const urlParams = new URLSearchParams(window.location.search);
        const urlLoginCode = urlParams.get('loginCode') || 
                           urlParams.get('code') || 
                           urlParams.get('login_code');
        const urlTempPassword = urlParams.get('tempPassword') || 
                              urlParams.get('password') || 
                              urlParams.get('temp_password');

        console.log('AutoLoginPage: URL直接取得パラメータ:', {
          urlLoginCode,
          urlTempPassword: urlTempPassword ? '***' : 'なし'
        });

        // 最終的なパラメータを決定
        const finalLoginCode = loginCode || urlLoginCode;
        const finalTempPassword = tempPassword || urlTempPassword;

        console.log('AutoLoginPage: 最終パラメータ:', {
          finalLoginCode,
          finalTempPassword: finalTempPassword ? '***' : 'なし'
        });

        // 必要なパラメータが不足している場合
        if (!finalLoginCode || !finalTempPassword) {
          console.error('AutoLoginPage: 必要なパラメータが不足しています');
          console.error('AutoLoginPage: 利用可能なパラメータ:', Object.fromEntries(searchParams.entries()));
          setError('ログインコードまたは一時パスワードが指定されていません');
          setTimeout(() => {
            navigate('/student-login/');
          }, 3000);
          return;
        }

        // 既に認証済みの場合はダッシュボードにリダイレクト
        if (isAuthenticated && currentUser) {
          console.log('AutoLoginPage: 既に認証済みです');
          navigate('/student/dashboard');
          return;
        }

        console.log('AutoLoginPage: 一時パスワード認証を開始');
        
        // 一時パスワード認証を実行
        console.log('AutoLoginPage: 認証API呼び出し開始');
        const result = await verifyTemporaryPasswordAPI(finalLoginCode, finalTempPassword);
        console.log('AutoLoginPage: 認証API応答:', result);
        
        if (result.success) {
          console.log('AutoLoginPage: 認証成功:', result.data);
          
          // JWTトークンをlocalStorageに保存
          if (result.data.access_token) {
            localStorage.setItem('accessToken', result.data.access_token);
            console.log('AutoLoginPage: アクセストークンを保存');
          }
          if (result.data.refresh_token) {
            localStorage.setItem('refreshToken', result.data.refresh_token);
            console.log('AutoLoginPage: リフレッシュトークンを保存');
          }
          
          // 認証情報をlocalStorageに保存
          localStorage.setItem('autoLoginCode', finalLoginCode);
          localStorage.setItem('tempPassword', finalTempPassword);
          localStorage.setItem('loginCode', finalLoginCode);
          localStorage.setItem('temp_password', finalTempPassword);
          
          // ログイン成功
          const userData = {
            id: result.data.userId,
            name: result.data.userName,
            role: 'student',
            login_code: finalLoginCode,
            instructorName: result.data.instructorName
          };
          
          console.log('AutoLoginPage: ユーザーデータを保存:', userData);
          
          // 認証処理を実行（JWTトークン付きでログイン）
          login(userData, result.data.access_token, result.data.refresh_token);
          
          // 認証情報の保存確認
          console.log('AutoLoginPage: 保存された認証情報確認:', {
            autoLoginCode: localStorage.getItem('autoLoginCode'),
            tempPassword: localStorage.getItem('tempPassword') ? '***' : 'なし',
            loginCode: localStorage.getItem('loginCode'),
            temp_password: localStorage.getItem('temp_password') ? '***' : 'なし',
            accessToken: localStorage.getItem('accessToken') ? '***' : 'なし',
            refreshToken: localStorage.getItem('refreshToken') ? '***' : 'なし',
            currentUser: localStorage.getItem('currentUser') ? '存在' : 'なし'
          });
          
          console.log('AutoLoginPage: 自動ログイン成功');
          
          // 利用者ダッシュボードにリダイレクト
          navigate('/student/dashboard');
          
        } else {
          console.error('AutoLoginPage: 認証失敗:', result);
          const errorMessage = result.message || '認証に失敗しました';
          setError(`認証エラー: ${errorMessage}`);
          
          // 3秒後にログインページにリダイレクト
          setTimeout(() => {
            navigate('/student-login/');
          }, 3000);
        }
        
      } catch (error) {
        console.error('AutoLoginPage: 認証処理エラー:', error);
        setError('認証処理中にエラーが発生しました');
        
        // 3秒後にログインページにリダイレクト
        setTimeout(() => {
          navigate('/student-login/');
        }, 3000);
        
      } finally {
        setIsProcessing(false);
      }
    };

    handleAutoLogin();
  }, [searchParams, login, isAuthenticated, currentUser, navigate]);

  // ローディング表示
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-blue-600 text-xl font-semibold mb-2">
            自動ログイン中...
          </div>
          <div className="text-gray-600 text-sm">
            認証情報を確認しています
          </div>
        </div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-4">
            <div className="text-red-600 text-xl font-semibold mb-2">
              認証エラー
            </div>
            <div className="text-red-700 mb-4">
              {error}
            </div>
            <div className="text-gray-600 text-sm">
              ログインページに移動します...
            </div>
          </div>
          <button 
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            onClick={() => navigate('/student-login/')}
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

export default AutoLoginPage;
