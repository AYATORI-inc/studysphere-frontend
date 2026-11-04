import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStudentGuard } from '../utils/hooks/useAuthGuard';
import { useAuth } from '../components/contexts/AuthContext';
import { verifyTemporaryPasswordAPI, apiGet } from '../utils/api';
import { saveTempPasswordAuth } from '../utils/authUtils';
import { API_BASE_URL } from '../config/apiConfig';
import Dashboard from './Dashboard';
import LessonList from './LessonList';
import CareerAssessment from '../components/CareerAssessment';
import ToyBox from '../components/ToyBox';
import PersonalMessageList from '../components/PersonalMessageList';
import AnnouncementList from '../components/AnnouncementList';
import useBrowserNotifications from '../utils/hooks/useBrowserNotifications';
import { fetchLatestMessageSummary, truncateText } from '../utils/messageUtils';

const StudentDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useStudentGuard();
  const { login, logout } = useAuth();
  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [userCourses, setUserCourses] = useState([]);
  const [messagePollingInterval, setMessagePollingInterval] = useState(null);
  const [newMessageNotification, setNewMessageNotification] = useState(null);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const lastUnreadCountRef = useRef(0);
  const [messageRefreshSignal, setMessageRefreshSignal] = useState(0);

  const {
    isSupported: isNotificationSupported,
    permission: notificationPermission,
    requestPermission: requestNotificationPermission,
    showNotification,
    subscribeToPush,
  } = useBrowserNotifications();

  useEffect(() => {
    if (!isNotificationSupported) {
      setShowNotificationPrompt(false);
      return;
    }
    setShowNotificationPrompt(notificationPermission === 'default');
  }, [isNotificationSupported, notificationPermission]);

  // 利用者のコース情報を取得
  useEffect(() => {
    const fetchUserCourses = async () => {
      if (currentUser?.id) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/learning/progress/${currentUser.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setUserCourses(data.data);
            }
          }
        } catch (error) {
          console.error('コース情報取得エラー:', error);
        }
      }
    };

    fetchUserCourses();
  }, [currentUser?.id]);

  // 認証状態に応じて定期確認を制御
  useEffect(() => {
    if (!currentUser) {
      stopMessagePolling();
      return;
    }

    startMessagePolling();

    return () => {
      stopMessagePolling();
    };
  }, [currentUser]);

  // クエリパラメータからの自動認証処理
  useEffect(() => {
    const handleAutoLogin = async () => {
      // 既に認証済みの場合はスキップ
      if (currentUser) {
        return;
      }

      console.log('StudentDashboard: 現在のURL:', window.location.href);
      console.log('StudentDashboard: searchParams:', searchParams.toString());
      console.log('StudentDashboard: PUBLIC_URL:', process.env.PUBLIC_URL);

      // 既存の一時パスワード認証情報を確認
      const existingLoginCode = localStorage.getItem('loginCode');
      const existingTempPassword = localStorage.getItem('tempPassword');
      const existingCurrentUser = localStorage.getItem('currentUser');
      
      console.log('StudentDashboard: 既存の認証情報確認:', {
        hasLoginCode: !!existingLoginCode,
        hasTempPassword: !!existingTempPassword,
        hasCurrentUser: !!existingCurrentUser
      });

      // 既存の一時パスワード認証情報がある場合は認証状態を復元
      if (existingLoginCode && existingTempPassword && existingCurrentUser) {
        try {
          const userData = JSON.parse(existingCurrentUser);
          console.log('StudentDashboard: 既存の認証情報から認証状態を復元:', userData);
          
          // 有効期限をチェック
          const tempPasswordExpiry = localStorage.getItem('tempPasswordExpiry');
          if (tempPasswordExpiry) {
            const expiryDate = new Date(tempPasswordExpiry);
            const now = new Date();
            
            if (expiryDate > now) {
              console.log('StudentDashboard: 一時パスワード認証情報が有効です - トークンを取得して認証状態を復元');
              
              // 既存のトークンを確認
              const existingAccessToken = localStorage.getItem('accessToken');
              const existingRefreshToken = localStorage.getItem('refreshToken');
              
              if (existingAccessToken && existingRefreshToken) {
                console.log('StudentDashboard: 既存のトークンを使用して認証');
                login(userData, existingAccessToken, existingRefreshToken);
                return;
              }
              
              // トークンがない場合は再取得
              console.log('StudentDashboard: トークンがないため、再認証してトークンを取得します');
              setIsAutoLoggingIn(true);
              
              try {
                const result = await verifyTemporaryPasswordAPI(existingLoginCode, existingTempPassword);
                
                if (result.success && result.data.access_token && result.data.refresh_token) {
                  console.log('StudentDashboard: 再認証成功、トークンを取得しました');
                  login(userData, result.data.access_token, result.data.refresh_token);
                } else {
                  console.log('StudentDashboard: 再認証に失敗、トークンなしでログイン');
                  login(userData);
                }
              } catch (error) {
                console.error('StudentDashboard: 再認証エラー:', error);
                login(userData);
              } finally {
                setIsAutoLoggingIn(false);
              }
              return;
            } else {
              console.log('StudentDashboard: 一時パスワードの有効期限が切れています - 認証情報をクリア');
              localStorage.removeItem('loginCode');
              localStorage.removeItem('tempPassword');
              localStorage.removeItem('tempPasswordExpiry');
              localStorage.removeItem('currentUser');
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
            }
          } else {
            console.log('StudentDashboard: 一時パスワード認証情報が有効です（有効期限なし）- トークンを取得して認証状態を復元');
            
            // 既存のトークンを確認
            const existingAccessToken = localStorage.getItem('accessToken');
            const existingRefreshToken = localStorage.getItem('refreshToken');
            
            if (existingAccessToken && existingRefreshToken) {
              console.log('StudentDashboard: 既存のトークンを使用して認証');
              login(userData, existingAccessToken, existingRefreshToken);
              return;
            }
            
            // トークンがない場合は再取得
            console.log('StudentDashboard: トークンがないため、再認証してトークンを取得します');
            setIsAutoLoggingIn(true);
            
            try {
              const result = await verifyTemporaryPasswordAPI(existingLoginCode, existingTempPassword);
              
              if (result.success && result.data.access_token && result.data.refresh_token) {
                console.log('StudentDashboard: 再認証成功、トークンを取得しました');
                login(userData, result.data.access_token, result.data.refresh_token);
              } else {
                console.log('StudentDashboard: 再認証に失敗、トークンなしでログイン');
                login(userData);
              }
            } catch (error) {
              console.error('StudentDashboard: 再認証エラー:', error);
              login(userData);
            } finally {
              setIsAutoLoggingIn(false);
            }
            return;
          }
        } catch (error) {
          console.error('StudentDashboard: 既存の認証情報の復元に失敗:', error);
          // 破損した認証情報をクリア
          localStorage.removeItem('loginCode');
          localStorage.removeItem('tempPassword');
          localStorage.removeItem('tempPasswordExpiry');
          localStorage.removeItem('currentUser');
        }
      }

      // クエリパラメータからトークンと一時パスワードを取得
      // 複数のパラメータ名に対応
      const token = searchParams.get('token');
      const tempPassword = searchParams.get('tempPassword') || 
                         searchParams.get('password') || 
                         searchParams.get('temp_password');
      const loginCode = searchParams.get('code') || 
                       searchParams.get('loginCode') || 
                       searchParams.get('login_code');

      console.log('StudentDashboard: クエリパラメータ確認:', { 
        token, 
        tempPassword: tempPassword ? '***' : 'なし', 
        loginCode,
        allParams: Object.fromEntries(searchParams.entries())
      });

      // URLから直接パラメータを取得する試行（プレフィックス問題対策）
      const urlParams = new URLSearchParams(window.location.search);
      const urlTempPassword = urlParams.get('tempPassword') || 
                            urlParams.get('password') || 
                            urlParams.get('temp_password');
      const urlLoginCode = urlParams.get('code') || 
                          urlParams.get('loginCode') || 
                          urlParams.get('login_code');

      console.log('StudentDashboard: URL直接取得パラメータ:', {
        urlTempPassword: urlTempPassword ? '***' : 'なし',
        urlLoginCode
      });

      // 最終的なパラメータを決定
      const finalTempPassword = tempPassword || urlTempPassword;
      const finalLoginCode = loginCode || urlLoginCode;

      console.log('StudentDashboard: 最終パラメータ:', {
        finalTempPassword: finalTempPassword ? '***' : 'なし',
        finalLoginCode
      });

      // 一時パスワードとログインコードが必要（トークンはオプション）
      if (finalTempPassword && finalLoginCode) {
        console.log('StudentDashboard: クエリパラメータから認証情報を検出');
        setIsAutoLoggingIn(true);
        setAuthError('');

        try {
          console.log('StudentDashboard: 一時パスワード認証を開始:', { 
            loginCode: finalLoginCode, 
            tempPassword: '***' 
          });
          // 一時パスワード認証を実行
          const result = await verifyTemporaryPasswordAPI(finalLoginCode, finalTempPassword);
          
          if (result.success) {
            console.log('StudentDashboard: 認証成功:', result.data);
            console.log('StudentDashboard: 指導員名デバッグ:', {
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
              login_code: finalLoginCode,
              instructorName: result.data.instructorName
            };
            
            // JWTトークンの有無をチェック
            const hasAccessToken = result.data.access_token && result.data.access_token.trim().length > 0;
            const hasRefreshToken = result.data.refresh_token && result.data.refresh_token.trim().length > 0;
            
            console.log('StudentDashboard: トークン情報:', {
              hasAccessToken,
              hasRefreshToken,
              accessTokenLength: hasAccessToken ? result.data.access_token.length : 0,
              refreshTokenLength: hasRefreshToken ? result.data.refresh_token.length : 0
            });
            
            // JWTトークンがある場合は標準認証として処理
            if (hasAccessToken && hasRefreshToken) {
              console.log('StudentDashboard: JWTトークンを受信 - 標準認証として処理');
              // 一時パスワード認証情報も保存（セッション復元用）
              saveTempPasswordAuth(finalLoginCode, finalTempPassword, userData, result.data.expiresAt);
              // トークンを使ってログイン
              login(userData, result.data.access_token, result.data.refresh_token);
            } else {
              console.log('StudentDashboard: JWTトークンなし - 一時パスワード認証として処理');
              // 一時パスワード認証情報を保存（有効期限付き）
              saveTempPasswordAuth(finalLoginCode, finalTempPassword, userData, result.data.expiresAt);
              // トークンなしでログイン（一時パスワード認証のみ）
              login(userData);
            }
            
            console.log('StudentDashboard: 自動ログイン成功:', userData);
            
            // クエリパラメータをクリア
            const newUrl = new URL(window.location);
            newUrl.searchParams.delete('token');
            newUrl.searchParams.delete('tempPassword');
            newUrl.searchParams.delete('password');
            newUrl.searchParams.delete('temp_password');
            newUrl.searchParams.delete('code');
            newUrl.searchParams.delete('loginCode');
            newUrl.searchParams.delete('login_code');
            window.history.replaceState({}, '', newUrl);
            
          } else {
            setAuthError(result.message || '認証に失敗しました');
            console.error('StudentDashboard: 認証失敗:', result.message);
          }
        } catch (error) {
          console.error('StudentDashboard: 自動ログインエラー:', error);
          const errorMessage = error.message || '認証処理中にエラーが発生しました';
          setAuthError(errorMessage);
        } finally {
          setIsAutoLoggingIn(false);
        }
      } else {
        // localStorageからの自動ログイン処理
        const autoLoginCode = localStorage.getItem('autoLoginCode');
        const tempPassword = localStorage.getItem('tempPassword') || localStorage.getItem('temp_password');
        const currentUserStr = localStorage.getItem('currentUser');
        
        console.log('StudentDashboard: localStorage確認:', {
          hasAutoLoginCode: !!autoLoginCode,
          hasTempPassword: !!tempPassword,
          hasCurrentUser: !!currentUserStr
        });

        // 認証情報が存在するがユーザー情報がない場合の復旧処理
        if (autoLoginCode && tempPassword && !currentUserStr) {
          console.log('StudentDashboard: 認証情報は存在するがユーザー情報が不足しています。復旧処理を開始');
          setIsAutoLoggingIn(true);
          
          try {
            const result = await verifyTemporaryPasswordAPI(autoLoginCode, tempPassword);
            
            if (result.success) {
              console.log('StudentDashboard: 復旧認証成功');
              
              const userData = {
                id: result.data.userId,
                name: result.data.userName,
                role: 'student',
                login_code: autoLoginCode,
                instructorName: result.data.instructorName
              };
              
              login(userData);
            } else {
              console.error('StudentDashboard: 復旧認証失敗');
              // 無効な認証情報をクリア
              localStorage.removeItem('autoLoginCode');
              localStorage.removeItem('tempPassword');
              localStorage.removeItem('loginCode');
              localStorage.removeItem('temp_password');
              localStorage.removeItem('currentUser');
            }
          } catch (error) {
            console.error('StudentDashboard: 復旧処理エラー:', error);
          } finally {
            setIsAutoLoggingIn(false);
          }
        }
        
        // 従来の自動ログイン処理（RemoteSupportからの自動ログイン）
        const autoLoginUser = localStorage.getItem('autoLoginUser');
        const autoLoginTarget = localStorage.getItem('autoLoginTarget');

        if (autoLoginCode && autoLoginUser && autoLoginTarget && !currentUser) {
          console.log('StudentDashboard: RemoteSupport自動ログイン情報を検出:', { autoLoginCode, autoLoginUser, autoLoginTarget });
          
          // 自動ログイン情報をクリア
          localStorage.removeItem('autoLoginCode');
          localStorage.removeItem('autoLoginUser');
          localStorage.removeItem('autoLoginTarget');
          
          // 一時パスワードが設定されている場合は自動ログインを試行
          if (tempPassword) {
            console.log('StudentDashboard: 一時パスワードが存在するため自動ログインを試行');
            setIsAutoLoggingIn(true);
            
            try {
              const result = await verifyTemporaryPasswordAPI(autoLoginCode, tempPassword);
              
              if (result.success) {
                console.log('StudentDashboard: RemoteSupport自動ログイン成功');
                
                const userData = {
                  id: result.data.userId,
                  name: result.data.userName,
                  role: 'student',
                  login_code: autoLoginCode,
                  instructorName: result.data.instructorName
                };
                
                login(userData);
              } else {
                console.log('StudentDashboard: RemoteSupport自動ログイン失敗。手動入力が必要です');
                setAuthError('一時パスワードを入力してください');
              }
            } catch (error) {
              console.error('StudentDashboard: RemoteSupport自動ログインエラー:', error);
              setAuthError('自動ログインに失敗しました');
            } finally {
              setIsAutoLoggingIn(false);
            }
          } else {
            console.log('StudentDashboard: 一時パスワードが不足しています。手動入力が必要です');
            setAuthError('一時パスワードを入力してください');
          }
        }
      }
    };

    handleAutoLogin();
  }, [currentUser, login, navigate, searchParams]);

  const handleLogout = () => {
    // ログアウト確認ダイアログ
    if (window.confirm('ログアウトしますか？')) {
      console.log('ログアウト処理を開始');
      
      // 認証情報をクリア
      localStorage.removeItem('autoLoginCode');
      localStorage.removeItem('tempPassword');
      localStorage.removeItem('loginCode');
      localStorage.removeItem('temp_password');
      localStorage.removeItem('autoLoginUser');
      localStorage.removeItem('autoLoginTarget');
      
      // ログアウト処理を実行
      logout();
      
      console.log('ログアウト完了');
    }
  };

  // 新着メッセージ確認
  const checkNewMessages = async () => {
    // 認証されていない場合はスキップ
    if (!currentUser) {
      console.log('認証されていないため、新着メッセージ確認をスキップします');
      return;
    }

    try {
      const response = await apiGet('/api/messages/unread-count');
      if (response.success) {
        const unreadCount = response.data.unread_count || 0;
        const hasUnreadCountChanged = unreadCount !== lastUnreadCountRef.current;
        const hasUnreadIncreased = unreadCount > lastUnreadCountRef.current;

        if (hasUnreadCountChanged) {
          setMessageRefreshSignal(prev => prev + 1);
        }

        let latestMessageSummary = null;

        if (unreadCount > 0 && hasUnreadCountChanged) {
          latestMessageSummary = await fetchLatestMessageSummary();
        }

        if (unreadCount > 0) {
          // 新着メッセージがある場合の通知
          setNewMessageNotification({
            count: unreadCount,
            timestamp: new Date(),
            latestMessage: latestMessageSummary
          });

          const shouldShowDesktopNotification = hasUnreadIncreased;

          if (
            shouldShowDesktopNotification &&
            isNotificationSupported &&
            notificationPermission === 'granted'
          ) {
            const notificationBody = latestMessageSummary?.messageText
              ? `${latestMessageSummary.senderName ? `${latestMessageSummary.senderName}: ` : ''}${truncateText(latestMessageSummary.messageText)}`
              : `新着メッセージが${unreadCount}件あります。`;

            showNotification('Study Sphere', {
              body: notificationBody,
              tag: 'study-sphere-messages',
              renotify: true
            });
          }
          
          // 3秒後に通知を自動で非表示
          setTimeout(() => {
            setNewMessageNotification(null);
          }, 3000);
        }
        lastUnreadCountRef.current = unreadCount;
      }
    } catch (error) {
      console.error('新着メッセージ確認エラー:', error);
    }
  };

  // 定期確認の開始
  const startMessagePolling = () => {
    // 認証されていない場合はスキップ
    if (!currentUser) {
      console.log('認証されていないため、メッセージ定期確認を開始しません');
      return;
    }

    if (messagePollingInterval) {
      clearInterval(messagePollingInterval);
    }
    
    // 初回確認
    checkNewMessages();
    
    // 5分間隔で定期確認
    const interval = setInterval(checkNewMessages, 5 * 60 * 1000); // 5分 = 300,000ms
    setMessagePollingInterval(interval);
  };

  // 定期確認の停止
  const stopMessagePolling = () => {
    if (messagePollingInterval) {
      clearInterval(messagePollingInterval);
      setMessagePollingInterval(null);
    }
  };

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission();
    if (result !== 'granted') {
      alert('通知を有効にするにはブラウザのサイト設定から許可を行ってください。');
      return;
    }

    const subscribeResult = await subscribeToPush();
    if (!subscribeResult?.success) {
      console.warn('プッシュ通知の登録に失敗しました:', subscribeResult?.message);
    }
  };

  // タブ切り替えとコース選択の処理
  const handleTabChange = (tab, courseId = null) => {
    setActiveTab(tab);
    if (courseId) {
      setSelectedCourseId(courseId);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-blue-600 text-xl font-semibold mb-4">
            {isAutoLoggingIn ? '自動ログイン中...' : '認証中...'}
          </div>
          {isAutoLoggingIn && (
            <div className="text-gray-600 text-sm">
              一時パスワードを入力してログインを完了してください
            </div>
          )}
          {authError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-700 font-medium mb-2">認証エラー</div>
              <div className="text-red-600 text-sm">{authError}</div>
              <div className="mt-3 space-y-2">
                <button 
                  className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  onClick={() => navigate('/student-login')}
                >
                  ログインページへ
                </button>
                <button 
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={() => window.location.reload()}
                >
                  再試行
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex flex-col">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">Study Sphere</h1>
                <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">
                  利用者
                </span>
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="font-medium text-white">
                  {currentUser.name}さん
                  {(() => {
                    console.log('指導員情報デバッグ:', {
                      instructorName: currentUser.instructorName,
                      type: typeof currentUser.instructorName,
                      isTruthy: !!currentUser.instructorName,
                      currentUser: currentUser
                    });
                    
                    // 指導員名が存在し、空文字列でない場合のみ表示
                    if (currentUser.instructorName && currentUser.instructorName.trim() !== '') {
                      return (
                        <span className="text-blue-100 text-sm ml-2">
                          （担当：{currentUser.instructorName}指導員）
                        </span>
                      );
                    } else {
                      return (
                        <span className="text-blue-100 text-sm ml-2">
                          （担当：未設定）
                        </span>
                      );
                    }
                  })()}
                </span>
                <button 
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 border border-red-400 rounded-lg transition-all duration-200 font-medium text-white shadow-sm hover:shadow-md"
                  onClick={handleLogout}
                  title="ログアウト"
                >
                  🚪 ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-3">
            <button 
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
              onClick={() => handleTabChange('dashboard')}
            >
              📊 ダッシュボード
            </button>
            <button 
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'lessons'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
              onClick={() => handleTabChange('lessons')}
            >
              📚 レッスン一覧
            </button>
            <button 
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeTab === 'career-assessment'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
              onClick={() => handleTabChange('career-assessment')}
            >
              🎯 適職診断
            </button>
            <button 
              className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                activeTab === 'toybox'
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
              }`}
              onClick={() => handleTabChange('toybox')}
            >
              <img 
                src="/images/toybox/TOYBOX.png" 
                alt="TOYBOX" 
                className="h-5 w-auto object-contain"
              />
              <span>TOYBOX</span>
            </button>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* デスクトップ通知の案内 */}
        {isNotificationSupported && showNotificationPrompt && (
          <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3 text-indigo-700 font-medium">
              <span role="img" aria-label="notification">
                🔔
              </span>
              <span>新着メッセージをPC通知で受け取るには、通知を有効化してください。</span>
            </div>
            <button
              onClick={handleEnableNotifications}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
            >
              通知を有効化
            </button>
          </div>
        )}

        {isNotificationSupported && notificationPermission === 'denied' && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            ブラウザで通知がブロックされています。PC通知を受け取るには、ブラウザのサイト設定から通知を許可してください。
          </div>
        )}

        {/* 新着メッセージ通知 */}
        {newMessageNotification && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <span className="text-blue-500 mr-2">📬</span>
                <span className="text-blue-700 font-medium">
                  新着メッセージ {newMessageNotification.count}件があります
                </span>
              </div>
              <button
                onClick={() => setNewMessageNotification(null)}
                className="text-blue-500 hover:text-blue-700"
              >
                ✕
              </button>
            </div>
            {newMessageNotification.latestMessage?.messageText && (
              <div className="mt-2 text-sm text-blue-600">
                {newMessageNotification.latestMessage.senderName
                  ? `${newMessageNotification.latestMessage.senderName}: ${truncateText(newMessageNotification.latestMessage.messageText, 120)}`
                  : truncateText(newMessageNotification.latestMessage.messageText, 120)}
              </div>
            )}
          </div>
        )}

        <div className="space-y-8">
          {/* アクティブタブに応じたコンテンツ表示 */}
          {activeTab === 'dashboard' && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <Dashboard onTabChange={handleTabChange} messageRefreshSignal={messageRefreshSignal} />
            </div>
          )}
          
          {activeTab === 'lessons' && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <LessonList selectedCourseId={selectedCourseId} />
            </div>
          )}
          
          {activeTab === 'career-assessment' && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <CareerAssessment />
            </div>
          )}
          
          {activeTab === 'toybox' && (
            <div className="bg-white rounded-2xl shadow-xl p-8">
              <ToyBox />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard; 