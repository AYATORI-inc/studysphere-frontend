import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import InstructorHeader from '../components/InstructorHeader';
import StudentManagement from '../components/StudentManagement';
import LocationManagementForInstructor from '../components/LocationManagementForInstructor';
import SatelliteManagement from '../components/SatelliteManagement';
import HomeSupportEvaluationsPage from './HomeSupportEvaluationsPage';
import HomeSupportUserAdditionModal from '../components/HomeSupportUserAdditionModal';
import SanitizedInput from '../components/SanitizedInput';
import SanitizedTextarea from '../components/SanitizedTextarea';
import { SANITIZE_OPTIONS } from '../utils/sanitizeUtils';
import InstructorPasswordChangeModal from '../components/InstructorPasswordChangeModal';
import PersonalMessageList from '../components/PersonalMessageList';
import MessageSender from '../components/MessageSender';
import AnnouncementCreator from '../components/AnnouncementCreator';
import AnnouncementList from '../components/AnnouncementList';
import TestApprovalModal from '../components/student-management/TestApprovalModal';
import SubmissionApprovalModal from '../components/student-management/SubmissionApprovalModal';
import PendingApprovalAlert from '../components/student-management/PendingApprovalAlert';
import { API_BASE_URL } from '../config/apiConfig';
import PendingSubmissionAlert from '../components/student-management/PendingSubmissionAlert';
import useBrowserNotifications from '../utils/hooks/useBrowserNotifications';
import { fetchLatestMessageSummary, truncateText } from '../utils/messageUtils';
import LearningPreviewPanel from '../components/instructor/LearningPreviewPanel';

import { 
  getInstructorSpecializations, 
  addInstructorSpecialization, 
  updateInstructorSpecialization, 
  deleteInstructorSpecialization,
  updateUser,
  apiGet
} from '../utils/api';

const InstructorDashboard = () => {
  console.log('=== InstructorDashboard Component Mounted ===');
  console.log('Current location:', window.location.href);
  console.log('Current pathname:', window.location.pathname);
  console.log('Current hash:', window.location.hash);
  
  const [activeTab, setActiveTab] = useState(() => {
    // sessionStorageからタブの状態を復元
    const savedTab = sessionStorage.getItem('instructorDashboardActiveTab');
    return savedTab && ['overview', 'students', 'location', 'learning-preview', 'settings'].includes(savedTab) 
      ? savedTab 
      : 'overview';
  });

  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [showHomeSupportModal, setShowHomeSupportModal] = useState(false);
  const [authError, setAuthError] = useState(null);
  
  // テスト承認・提出物承認モーダル関連の状態
  const [showTestApprovalModal, setShowTestApprovalModal] = useState(false);
  const [showSubmissionApprovalModal, setShowSubmissionApprovalModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedSatelliteId, setSelectedSatelliteId] = useState(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  
  // 専門分野関連の状態
  const [specializations, setSpecializations] = useState([]);
  const [editingSpecialization, setEditingSpecialization] = useState(null);
  const [newSpecialization, setNewSpecialization] = useState('');
  
  // アカウント情報編集関連の状態
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: '',
    email: '',
    specializations: []
  });
  
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [messagePollingInterval, setMessagePollingInterval] = useState(null);
  const [newMessageNotification, setNewMessageNotification] = useState(null);
  const [messageRefreshSignal, setMessageRefreshSignal] = useState(0);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const lastUnreadCountRef = useRef(0);

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

  useEffect(() => {
    if (!currentUser) return;

    // 初期の拠点情報を設定
    const initialLocation = {
      id: 'office001',
      name: '東京教育渋谷校',
      type: '就労移行支援事業所',
      organization: 'スタディスフィア株式会社'
    };
    
    // ローカルユーザー状態を設定（無限ループ防止のため条件を追加）
    if (!localUser || localUser.id !== currentUser.id) {
      setLocalUser({
        ...currentUser,
        location: currentUser.location || initialLocation
      });
    }
    
    // URLパラメータからタブを設定（初回のみ）
    if (!localUser) {
      const initialTab = location.search.split('tab=')[1];
      if (initialTab && ['overview', 'students', 'location', 'learning-preview', 'settings'].includes(initialTab)) {
        setActiveTab(initialTab);
        sessionStorage.setItem('instructorDashboardActiveTab', initialTab);
      }
    }

    // パスワード変更要求があるかチェック
    if (currentUser.passwordResetRequired) {
      setShowPasswordChangeModal(true);
    }

    // パスワード変更申請一覧を取得
    // fetchPasswordRequests(); // この関数は削除されたため、ここでは呼び出さない
  }, [currentUser?.id]); // currentUser.idのみを依存配列に含める

  // 専門分野を取得
  useEffect(() => {
    if (currentUser && activeTab === 'settings') {
      loadSpecializations();
    }
  }, [currentUser, activeTab]);

  // 声かけタブのアクティブ状態に応じて定期確認を制御
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

  // 専門分野一覧を取得
  const loadSpecializations = async () => {
    try {
      const response = await getInstructorSpecializations(currentUser.id);
      if (response.success) {
        setSpecializations(response.data || []);
      }
    } catch (error) {
      console.error('専門分野の取得に失敗:', error);
    }
  };

  // 新着メッセージ確認
  const checkNewMessages = async () => {
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



  // アカウント情報編集開始
  const handleStartAccountEdit = () => {
    setAccountForm({
      name: localUser.name || '',
      email: localUser.email || '',
      specializations: [...specializations]
    });
    setIsEditingAccount(true);
  };

  // アカウント情報更新
  const handleAccountUpdate = async (e) => {
    e.preventDefault();
    
    if (!accountForm.name.trim()) {
      alert('名前は必須です。');
      return;
    }
    
    setIsUpdatingAccount(true);
    try {
      // アカウント情報を更新
      const response = await updateUser(currentUser.id, {
        name: accountForm.name.trim(),
        email: accountForm.email.trim() || null
      });
      
      if (response.success) {
        // 専門分野を更新
        await updateSpecializations(accountForm.specializations);
        
        // ローカルユーザー情報を更新
        setLocalUser(prev => ({
          ...prev,
          name: accountForm.name.trim(),
          email: accountForm.email.trim() || null
        }));
        
        // LocalStorageも更新
        const updatedUser = { ...currentUser, name: accountForm.name.trim(), email: accountForm.email.trim() || null };
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        
        // 専門分野一覧を再取得
        await loadSpecializations();
        
        setIsEditingAccount(false);
        alert('アカウント情報が更新されました。');
      } else {
        alert('アカウント情報の更新に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('アカウント情報の更新に失敗:', error);
      alert('アカウント情報の更新に失敗しました。');
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  // 専門分野一括更新
  const updateSpecializations = async (newSpecializations) => {
    try {
      // 現在の専門分野を取得
      const currentResponse = await getInstructorSpecializations(currentUser.id);
      const currentSpecs = currentResponse.success ? currentResponse.data : [];
      
      // 削除する専門分野を特定
      const specsToDelete = currentSpecs.filter(current => 
        !newSpecializations.some(newSpec => newSpec.id === current.id)
      );
      
      // 削除処理
      for (const spec of specsToDelete) {
        await deleteInstructorSpecialization(currentUser.id, spec.id);
      }
      
      // 追加・更新する専門分野を処理
      for (const spec of newSpecializations) {
        if (spec.id) {
          // 既存の専門分野を更新
          await updateInstructorSpecialization(currentUser.id, spec.id, spec.specialization);
        } else {
          // 新しい専門分野を追加
          await addInstructorSpecialization(currentUser.id, spec.specialization);
        }
      }
    } catch (error) {
      console.error('専門分野の更新に失敗:', error);
      throw error;
    }
  };

  // 専門分野の追加（編集モード用）
  const handleAddSpecializationInEdit = () => {
    if (!accountForm.newSpecialization || !accountForm.newSpecialization.trim()) return;
    
    setAccountForm(prev => ({
      ...prev,
      specializations: [...prev.specializations, { specialization: prev.newSpecialization.trim() }],
      newSpecialization: ''
    }));
  };

  // 専門分野の削除（編集モード用）
  const handleRemoveSpecializationInEdit = (index) => {
    setAccountForm(prev => ({
      ...prev,
      specializations: prev.specializations.filter((_, i) => i !== index)
    }));
  };

  // パスワード変更
  const handlePasswordChange = async (currentPassword, newPassword) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE_URL}/api/users/${currentUser.id}/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert('パスワードが正常に変更されました。');
        setShowPasswordChangeForm(false);
        // パスワード変更要求フラグをクリア
        if (localUser) {
          setLocalUser(prev => ({
            ...prev,
            passwordResetRequired: false
          }));
        }
        // LocalStorageも更新
        const updatedUser = { ...currentUser, passwordResetRequired: false };
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      } else {
        throw new Error(data.message || 'パスワード変更に失敗しました');
      }
    } catch (error) {
      console.error('パスワード変更に失敗:', error);
      alert(`パスワード変更に失敗しました: ${error.message}`);
      throw error;
    }
  };

  // 新しいパスワード変更フォームの処理
  const handlePasswordFormChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({
      ...prev,
      [name]: value
    }));
    // エラーをクリア
    if (passwordErrors[name]) {
      setPasswordErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) errors.push('8文字以上で入力してください');
    if (!/[A-Z]/.test(password)) errors.push('大文字を含めてください');
    if (!/[a-z]/.test(password)) errors.push('小文字を含めてください');
    if (!/[0-9]/.test(password)) errors.push('数字を含めてください');
    return errors;
  };

  const handlePasswordFormSubmit = async (e) => {
    e.preventDefault();
    setPasswordErrors({});
    setIsChangingPassword(true);

    // バリデーション
    const errors = {};
    
    if (!passwordForm.currentPassword) {
      errors.currentPassword = '現在のパスワードを入力してください';
    }
    
    if (!passwordForm.newPassword) {
      errors.newPassword = '新しいパスワードを入力してください';
    } else {
      const passwordValidation = validatePassword(passwordForm.newPassword);
      if (passwordValidation.length > 0) {
        errors.newPassword = passwordValidation.join(', ');
      }
    }
    
    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = 'パスワードの確認を入力してください';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'パスワードが一致しません';
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      setIsChangingPassword(false);
      return;
    }

    try {
      await handlePasswordChange(passwordForm.currentPassword, passwordForm.newPassword);
      // 成功時はフォームをリセット
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setPasswordErrors({});
      setShowPasswordChangeForm(false);
    } catch (error) {
      console.error('パスワード変更に失敗:', error);
    } finally {
      setIsChangingPassword(false);
    }
  };



  const handleLocationChange = (newLocation) => {
    console.log('拠点情報が変更されました:', newLocation);
    
    // 拠点情報をsessionStorageに保存
    sessionStorage.setItem('selectedSatellite', JSON.stringify(newLocation));
    
    // ユーザー情報を更新
    const updatedUser = {
      ...localUser,
      satellite_id: newLocation.id,
      satellite_name: newLocation.name,
      company_id: newLocation.company_id,
      company_name: newLocation.company_name
    };
    
    setLocalUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    
    // 拠点切り替えイベントを発火
    window.dispatchEvent(new CustomEvent('satelliteChanged', {
      detail: { newLocation }
    }));
    
    // ページリロードを削除し、状態更新のみで対応
    console.log('拠点変更により状態を更新しました');
  };

  const handleHomeSupportSuccess = (result) => {
    console.log('在宅支援利用者が追加されました:', result);
    // 在宅利用者リストを更新するためのイベントを発火
    window.dispatchEvent(new CustomEvent('homeSupportUserAdded'));
  };

  // テスト承認モーダルを開く
  const handleTestApproval = (student) => {
    setSelectedStudent(student);
    
    // 現在選択されている拠点IDを取得
    const selectedSatellite = sessionStorage.getItem('selectedSatellite');
    let currentSatelliteId = null;
    
    if (selectedSatellite) {
      try {
        const satelliteData = JSON.parse(selectedSatellite);
        currentSatelliteId = satelliteData.id;
      } catch (error) {
        console.error('拠点情報のパースエラー:', error);
      }
    }
    
    // 利用者のsatellite_idまたは現在選択されている拠点IDを使用
    setSelectedSatelliteId(student.satellite_id || currentSatelliteId || 1); // デフォルトは1
    setShowTestApprovalModal(true);
  };

  // 提出物確認モーダルを開く
  const handleSubmissionApproval = (student) => {
    setSelectedStudent(student);
    setShowSubmissionApprovalModal(true);
  };

  // 承認成功時のコールバック
  const handleApprovalSuccess = () => {
    // 利用者リストを更新するためのイベントを発火
    window.dispatchEvent(new CustomEvent('studentListUpdated'));
  };

  // 在宅利用者追加モーダルを開く関数をグローバルに公開
  useEffect(() => {
    window.openHomeSupportModal = () => {
      setShowHomeSupportModal(true);
    };
    
    return () => {
      delete window.openHomeSupportModal;
    };
  }, []);

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // 定期確認を停止
      stopMessagePolling();
    };
  }, []);

  if (!currentUser || !localUser) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className={showPasswordChangeModal ? 'pointer-events-none opacity-50' : ''}>
        <InstructorHeader 
          user={localUser} 
          onLocationChange={handleLocationChange}
        />
      </div>
      
      <div className="flex flex-col flex-1 h-[calc(100vh-80px)] overflow-hidden">
        <aside className="w-full bg-white text-gray-800 flex-shrink-0 overflow-y-auto border-b border-gray-200">
          <nav className={`p-4 flex flex-row gap-2 overflow-x-auto ${showPasswordChangeModal ? 'pointer-events-none opacity-50' : ''}`}>
            <button 
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'overview' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('overview');
                sessionStorage.setItem('instructorDashboardActiveTab', 'overview');
              }}
            >
              💬 声かけ
            </button>
            <button 
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'students' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('students');
                sessionStorage.setItem('instructorDashboardActiveTab', 'students');
              }}
            >
              👥 利用者一覧
            </button>

                          <button 
                className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'location' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
                onClick={() => {
                  setActiveTab('location');
                  sessionStorage.setItem('instructorDashboardActiveTab', 'location');
                }}
              >
                🏢 拠点管理
              </button>

            <button 
              className="flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('在宅支援管理ボタンがクリックされました');
                
                try {
                  // 現在の拠点情報をsessionStorageに保存してから遷移
                  if (localUser) {
                    const currentLocation = {
                      id: localUser.satellite_id,
                      name: localUser.satellite_name,
                      company_id: localUser.company_id,
                      company_name: localUser.company_name,
                      type: localUser.location?.type || '就労移行支援事業所',
                      organization: localUser.location?.organization || 'スタディスフィア株式会社'
                    };
                    sessionStorage.setItem('selectedSatellite', JSON.stringify(currentLocation));
                    console.log('在宅支援ダッシュボード遷移前に拠点情報を保存:', currentLocation);
                  } else {
                    console.warn('localUserが設定されていません。在宅支援ダッシュボードに遷移します。');
                  }
                  
                  console.log('在宅支援ダッシュボードに遷移します: /instructor/home-support');
                  console.log('遷移前のURL:', window.location.href);
                  
                  // React Routerのnavigateを使用
                  navigate('/instructor/home-support');
                  console.log('navigate()を実行しました');
                  
                  // フォールバック: 1秒後にwindow.locationを使用
                  setTimeout(() => {
                    if (window.location.pathname !== '/instructor/home-support') {
                      console.log('React Routerの遷移が失敗したため、window.locationを使用します');
                      window.location.href = '/instructor/home-support';
                    }
                  }, 1000);
                } catch (error) {
                  console.error('在宅支援ダッシュボードへの遷移中にエラーが発生しました:', error);
                  alert('在宅支援ダッシュボードへの遷移に失敗しました。ページをリロードして再試行してください。');
                }
              }}
            >
              🏠 在宅支援管理
            </button>
            <button 
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'learning-preview' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('learning-preview');
                sessionStorage.setItem('instructorDashboardActiveTab', 'learning-preview');
              }}
            >
              🎓 学習画面プレビュー
            </button>
            <button 
              className={`relative flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5
                ${localUser.passwordResetRequired
                  ? 'bg-gradient-to-r from-red-500 to-red-600 text-white animate-pulse'
                  : activeTab === 'settings'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                    : ''
                }`}
              onClick={() => {
                setActiveTab('settings');
                sessionStorage.setItem('instructorDashboardActiveTab', 'settings');
              }}
            >
              ⚙️ 設定
              {localUser.passwordResetRequired && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-bold flex items-center justify-center shadow-lg">
                  !
                </span>
              )}
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto bg-white">
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

          {/* 認証エラーメッセージ */}
          {authError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className="text-red-500 mr-2">⚠️</span>
                  <span className="text-red-700 font-medium">{authError}</span>
                </div>
                <button
                  onClick={() => setAuthError(null)}
                  className="text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* 声かけシステム */}
              <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
                {/* ヘッダー部分 */}
                <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                        💬 声かけ・メッセージ管理
                      </h2>
                      <p className="text-lg text-gray-600">利用者とのコミュニケーションを管理できます</p>
                    </div>
                    <div className="flex gap-3">
                      <a
                        href="https://discord.gg/9N5wpBUmDQ"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                        </svg>
                        Discord で相談
                      </a>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-blue-600 text-lg">💡</span>
                      <h3 className="font-semibold text-blue-800">外部サポートについて</h3>
                    </div>
                    <p className="text-blue-700 text-sm">
                      画面共有やAI以外の技術的な質問については、Discordサーバーで直接サポートを受けることができます。
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* アナウンスメッセージ（左カラム） */}
                  <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent mb-4 flex items-center gap-2">
                      📢 アナウンスメッセージ
                    </h3>
                    <AnnouncementCreator />
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <AnnouncementList />
                    </div>
                  </div>

                  {/* 1対1メッセージ（右カラム） */}
                  <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
                    <h3 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-green-800 bg-clip-text text-transparent mb-4 flex items-center gap-2">
                      💬 1対1メッセージ
                    </h3>
                    <MessageSender />
                  </div>
                </div>

                {/* メッセージ一覧・会話表示 */}
                <div className="mt-6 bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent mb-4 flex items-center gap-2">
                    📥 メッセージ受信・会話
                  </h3>
                  <PersonalMessageList refreshSignal={messageRefreshSignal} />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'students' && (
            <StudentManagement 
              instructorId={localUser.id}
              onTestApproval={handleTestApproval}
              onSubmissionApproval={handleSubmissionApproval}
            />
          )}

          {activeTab === 'location' && <LocationManagementForInstructor currentUser={localUser} onLocationChange={handleLocationChange} />}
          
          {activeTab === 'learning-preview' && (
            <LearningPreviewPanel />
          )}
          
          {activeTab === 'settings' && (
            <div className="p-8 bg-white rounded-lg shadow-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800">個人設定</h2>
                <p className="text-lg text-gray-600">アカウント情報とセキュリティ設定を管理できます。</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* アカウント情報 */}
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">🏷️ アカウント情報</h3>
                    <button
                      onClick={isEditingAccount ? () => setIsEditingAccount(false) : handleStartAccountEdit}
                      className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                    >
                      {isEditingAccount ? 'キャンセル' : '編集'}
                    </button>
                  </div>
                  
                                     {!isEditingAccount ? (
                     <div className="grid grid-cols-2 gap-3 text-gray-700">
                       <div>
                         <span className="font-medium">個人トークン:</span>
                         <span>{localUser.login_code || localUser.id || '未設定'}</span>
                       </div>
                       <div>
                         <span className="font-medium">名前:</span>
                         <span>{localUser.name}</span>
                       </div>
                       <div>
                         <span className="font-medium">メールアドレス:</span>
                         <span>{localUser.email}</span>
                       </div>
                       <div>
                         <span className="font-medium">最終ログイン:</span>
                         <span>{new Date().toLocaleDateString()}</span>
                       </div>
                       <div className="col-span-2">
                         <span className="font-medium">専門分野:</span>
                         <div className="mt-2">
                           {specializations.length > 0 ? (
                             <div className="space-y-1">
                               {specializations.map((spec) => (
                                 <div key={spec.id} className="p-2 bg-white rounded border border-gray-200">
                                   <span className="text-gray-700">{spec.specialization}</span>
                                 </div>
                               ))}
                             </div>
                           ) : (
                             <p className="text-gray-500 text-sm">専門分野が設定されていません</p>
                           )}
                         </div>
                       </div>
                     </div>
                                     ) : (
                     <form onSubmit={handleAccountUpdate} className="space-y-4">
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">
                           名前 <span className="text-red-500">*</span>
                         </label>
                         <SanitizedInput
                           type="text"
                           value={accountForm.name}
                           onChange={(e) => setAccountForm(prev => ({ ...prev, name: e.target.value }))}
                           sanitizeMode={SANITIZE_OPTIONS.TEXT}
                           className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         />
                       </div>
                       
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">
                           メールアドレス
                         </label>
                         <SanitizedInput
                           type="email"
                           value={accountForm.email}
                           onChange={(e) => setAccountForm(prev => ({ ...prev, email: e.target.value }))}
                           sanitizeMode={SANITIZE_OPTIONS.TEXT}
                           className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                         />
                       </div>
                       
                       <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">
                           専門分野
                         </label>
                         <div className="space-y-2">
                           {accountForm.specializations.map((spec, index) => (
                             <div key={index} className="flex items-center gap-2">
                               <SanitizedInput
                                 type="text"
                                 value={spec.specialization}
                                 onChange={(e) => {
                                   const newSpecs = [...accountForm.specializations];
                                   newSpecs[index].specialization = e.target.value;
                                   setAccountForm(prev => ({ ...prev, specializations: newSpecs }));
                                 }}
                                 sanitizeMode={SANITIZE_OPTIONS.TEXT}
                                 className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                               />
                               <button
                                 type="button"
                                 onClick={() => handleRemoveSpecializationInEdit(index)}
                                 className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                               >
                                 削除
                               </button>
                             </div>
                           ))}
                           <div className="flex gap-2">
                             <SanitizedInput
                               type="text"
                               value={accountForm.newSpecialization || ''}
                               onChange={(e) => setAccountForm(prev => ({ ...prev, newSpecialization: e.target.value }))}
                               placeholder="新しい専門分野を入力"
                               sanitizeMode={SANITIZE_OPTIONS.TEXT}
                               className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                             />
                             <button
                               type="button"
                               onClick={handleAddSpecializationInEdit}
                               disabled={!accountForm.newSpecialization || !accountForm.newSpecialization.trim()}
                               className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                             >
                               追加
                             </button>
                           </div>
                         </div>
                       </div>
                       
                       <div className="flex gap-3 pt-4">
                         <button
                           type="submit"
                           disabled={isUpdatingAccount}
                           className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
                         >
                           {isUpdatingAccount ? '更新中...' : '更新'}
                         </button>
                         <button
                           type="button"
                           onClick={() => setIsEditingAccount(false)}
                           className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
                         >
                           キャンセル
                         </button>
                       </div>
                     </form>
                   )}
                </div>

                {/* パスワード変更セクション */}
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">🔐 パスワード変更</h3>
                    {localUser.passwordResetRequired && (
                      <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
                        <span className="text-red-500">⚠️</span>
                        パスワードの変更が必要です
                      </div>
                    )}
                  </div>
                  
                  {!showPasswordChangeForm ? (
                    <div className="text-gray-700 mb-4">
                      <p>指導員は自身のパスワードをいつでも変更できます。</p>
                      <button 
                        className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-300"
                        onClick={() => setShowPasswordChangeForm(true)}
                      >
                        パスワードを変更する
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                      <h4 className="text-lg font-medium text-gray-800 mb-4">パスワード変更</h4>
                      <form onSubmit={handlePasswordFormSubmit} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            現在のパスワード <span className="text-red-500">*</span>
                          </label>
                          <SanitizedInput
                            type="password"
                            name="currentPassword"
                            value={passwordForm.currentPassword}
                            onChange={handlePasswordFormChange}
                            sanitizeMode={SANITIZE_OPTIONS.NONE}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              passwordErrors.currentPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                          />
                          {passwordErrors.currentPassword && (
                            <p className="text-red-500 text-sm mt-1">{passwordErrors.currentPassword}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            新しいパスワード <span className="text-red-500">*</span>
                          </label>
                          <SanitizedInput
                            type="password"
                            name="newPassword"
                            value={passwordForm.newPassword}
                            onChange={handlePasswordFormChange}
                            sanitizeMode={SANITIZE_OPTIONS.NONE}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              passwordErrors.newPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                          />
                          {passwordErrors.newPassword && (
                            <p className="text-red-500 text-sm mt-1">{passwordErrors.newPassword}</p>
                          )}
                          <p className="text-gray-500 text-sm mt-1">
                            パスワード要件: 8文字以上、大文字・小文字・数字を含む
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            新しいパスワード（確認） <span className="text-red-500">*</span>
                          </label>
                          <SanitizedInput
                            type="password"
                            name="confirmPassword"
                            value={passwordForm.confirmPassword}
                            onChange={handlePasswordFormChange}
                            sanitizeMode={SANITIZE_OPTIONS.NONE}
                            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              passwordErrors.confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'
                            }`}
                          />
                          {passwordErrors.confirmPassword && (
                            <p className="text-red-500 text-sm mt-1">{passwordErrors.confirmPassword}</p>
                          )}
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button
                            type="submit"
                            disabled={isChangingPassword}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors duration-300"
                          >
                            {isChangingPassword ? '変更中...' : 'パスワードを変更'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowPasswordChangeForm(false)}
                            className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition-colors duration-300"
                          >
                            キャンセル
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>

                {/* セキュリティ情報 */}
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">🛡️ セキュリティ情報</h3>
                  <div className="text-gray-700">
                    <h4 className="text-lg font-medium text-gray-800 mb-3">パスワードセキュリティのヒント:</h4>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>定期的にパスワードを変更してください</li>
                      <li>他のサービスと同じパスワードを使用しないでください</li>
                      <li>パスワードを他人と共有しないでください</li>
                      <li>セッション終了時は必ずログアウトしてください</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* パスワード変更モーダル */}
      <InstructorPasswordChangeModal
        isOpen={showPasswordChangeModal}
        onClose={() => setShowPasswordChangeModal(false)}
        onPasswordChange={handlePasswordChange}
        user={currentUser}
      />

      {/* 在宅支援利用者追加モーダル */}
      <HomeSupportUserAdditionModal
        isOpen={showHomeSupportModal}
        onClose={() => setShowHomeSupportModal(false)}
        onSuccess={handleHomeSupportSuccess}
      />

      {/* テスト承認モーダル */}
      <TestApprovalModal
        isOpen={showTestApprovalModal}
        onClose={() => setShowTestApprovalModal(false)}
        student={selectedStudent}
        satelliteId={selectedSatelliteId}
        onApprovalSuccess={handleApprovalSuccess}
      />

      {/* 提出物確認モーダル */}
      <SubmissionApprovalModal
        isOpen={showSubmissionApprovalModal}
        onClose={() => setShowSubmissionApprovalModal(false)}
        student={selectedStudent}
        onApprovalSuccess={handleApprovalSuccess}
      />
    </div>
  );
};

export default InstructorDashboard; 