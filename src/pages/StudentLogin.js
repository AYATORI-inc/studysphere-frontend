import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/contexts/AuthContext';
import { verifyTemporaryPasswordAPI, checkTempPasswordStatusAPI } from '../utils/api';
import { formatJapanTime } from '../utils/dateUtils';

const StudentLogin = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated, currentUser } = useAuth();
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempPasswordStatus, setTempPasswordStatus] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // URLパラメータからログインコードを取得
  useEffect(() => {
    console.log('StudentLogin: 現在のURL:', window.location.href);
    console.log('StudentLogin: searchParams:', searchParams.toString());
    console.log('StudentLogin: PUBLIC_URL:', process.env.PUBLIC_URL);
    
    // 複数のパラメータ名に対応
    const codeFromUrl = searchParams.get('code') || 
                       searchParams.get('loginCode') || 
                       searchParams.get('login_code');
    
    // URLから直接パラメータを取得する試行（プレフィックス問題対策）
    const urlParams = new URLSearchParams(window.location.search);
    const urlCodeFromUrl = urlParams.get('code') || 
                          urlParams.get('loginCode') || 
                          urlParams.get('login_code');
    
    const finalCodeFromUrl = codeFromUrl || urlCodeFromUrl;
    
    console.log('StudentLogin: URLパラメータ確認:', {
      codeFromUrl,
      urlCodeFromUrl,
      finalCodeFromUrl,
      allParams: Object.fromEntries(searchParams.entries())
    });
    
    if (finalCodeFromUrl) {
      setLoginCode(finalCodeFromUrl);
    }
  }, [searchParams]);

  // 一時パスワード状態を確認
  useEffect(() => {
    const checkTempPasswordStatus = async () => {
      if (!loginCode) return;
      
      try {
        setIsCheckingStatus(true);
        const result = await checkTempPasswordStatusAPI(loginCode);
        
        if (result.success) {
          setTempPasswordStatus(result.data);
          
          // 有効な一時パスワードがある場合は自動入力
          if (result.data.hasValidPassword && result.data.tempPassword) {
            setTempPassword(result.data.tempPassword);
          }
        }
      } catch (error) {
        console.error('一時パスワード状態確認エラー:', error);
        setTempPasswordStatus({
          hasValidPassword: false,
          message: '状態確認に失敗しました'
        });
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkTempPasswordStatus();
  }, [loginCode]);

  // 認証済みユーザーが利用者ログインページにアクセスした場合のリダイレクト
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      switch (currentUser.role) {
        case 'admin':
          navigate('/admin/dashboard');
          break;
        case 'instructor':
          navigate('/instructor/dashboard');
          break;
        case 'student':
          navigate('/student/dashboard');
          break;
        default:
          // デフォルトは利用者ログインページに留まる
          break;
      }
    }
  }, [isAuthenticated, currentUser, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!loginCode || !tempPassword) {
      setError('ログインコードと一時パスワードを入力してください。');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      console.log('StudentLogin: 一時パスワード認証を開始:', { loginCode, tempPassword: '***' });
      const result = await verifyTemporaryPasswordAPI(loginCode, tempPassword);
      
      if (result.success) {
        console.log('StudentLogin: 認証成功');
        console.log('StudentLogin: 指導員名デバッグ:', {
          instructorName: result.data.instructorName,
          type: typeof result.data.instructorName,
          isTruthy: !!result.data.instructorName,
          fullData: result.data
        });
        
        // ログイン成功
        const userData = {
          id: result.data.userId,
          name: result.data.userName,
          role: 'student',
          login_code: loginCode,
          instructorName: result.data.instructorName
        };
        
        console.log('StudentLogin: ユーザーデータを保存:', userData);
        
        // JWTトークンがある場合は標準認証として処理
        if (result.data.access_token && result.data.refresh_token) {
          console.log('StudentLogin: JWTトークンを受信 - 標準認証として処理');
          // JWTトークン認証の場合は、一時パスワード認証情報は保存しない
          login(userData, result.data.access_token, result.data.refresh_token);
        } else {
          console.log('StudentLogin: JWTトークンなし - 一時パスワード認証として処理');
          // 一時パスワード認証情報を保存（フォールバック）
          localStorage.setItem('autoLoginCode', loginCode);
          localStorage.setItem('tempPassword', tempPassword);
          localStorage.setItem('loginCode', loginCode);
          localStorage.setItem('temp_password', tempPassword);
          localStorage.setItem('currentUser', JSON.stringify(userData));
          if (result.data.expiresAt) {
            localStorage.setItem('tempPasswordExpiry', result.data.expiresAt);
          }
          login(userData);
        }
        navigate('/student/dashboard');
      } else {
        setError(result.message || 'ログインに失敗しました。');
      }
    } catch (error) {
      console.error('ログインエラー:', error);
      setError('ログイン処理中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-cyan-400 to-blue-500 flex items-center justify-center p-5">
      <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">利用者ログイン</h1>
          <p className="text-gray-600">ログインコードと一時パスワードを入力してください</p>
          
          {/* 一時パスワード状態表示 */}
          {isCheckingStatus && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                <span className="text-blue-700">一時パスワード状態を確認中...</span>
              </div>
            </div>
          )}
          
          {tempPasswordStatus && !isCheckingStatus && (
            <div className={`mt-4 p-3 rounded-lg border ${
              tempPasswordStatus.hasValidPassword 
                ? 'bg-green-50 border-green-200 text-green-700' 
                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
            }`}>
              <p className="text-sm">{tempPasswordStatus.message}</p>
                             {tempPasswordStatus.hasValidPassword && tempPasswordStatus.expiresAt && (
                 <p className="text-xs mt-1">
                   有効期限: {formatJapanTime(tempPasswordStatus.expiresAt)}
                 </p>
               )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="loginCode" className="block text-sm font-medium text-gray-700 mb-2">
              ログインコード <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="loginCode"
              value={loginCode}
              onChange={(e) => setLoginCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="ログインコードを入力"
              required
            />
          </div>

          <div>
            <label htmlFor="tempPassword" className="block text-sm font-medium text-gray-700 mb-2">
              一時パスワード <span className="text-red-500">*</span>
              {tempPasswordStatus?.hasValidPassword && (
                <span className="ml-2 text-xs text-green-600">(自動入力済み)</span>
              )}
            </label>
            <input
              type="password"
              id="tempPassword"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                tempPasswordStatus?.hasValidPassword ? 'border-green-300 bg-green-50' : 'border-gray-300'
              }`}
              placeholder="一時パスワードを入力"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3 px-6 rounded-lg font-medium transition-all duration-200 hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ログイン中...
              </div>
            ) : (
              'ログイン'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            支援アプリから送られてきたログインコードと一時パスワードをご利用ください
          </p>
        </div>
      </div>
    </div>
  );
};

export default StudentLogin; 