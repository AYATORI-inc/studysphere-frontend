import React, { useState, useEffect } from 'react';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import InstructorHeader from '../components/InstructorHeader';
import HomeSupportTab from '../components/tabs/HomeSupportTab';
import HomeSupportUserAdditionModal from '../components/HomeSupportUserAdditionModal';
import DailySupportRecordModal from '../components/DailySupportRecordModal';
import OverviewTab from '../components/tabs/OverviewTab';
import EvaluationsTab from '../components/tabs/EvaluationsTab';
import AttendanceTab from '../components/tabs/AttendanceTab';
import EvidenceRecordsTab from '../components/tabs/EvidenceRecordsTab';
import UserDetailModal from '../components/modals/UserDetailModal';
import SupportPlanModal from '../components/modals/SupportPlanModal';
import UserInputModal from '../components/modals/UserInputModal';
import { getCurrentUser } from '../utils/userContext';

const HomeSupportDashboard = () => {
  console.log('=== HomeSupportDashboard_new.js Component Mounted ===');
  console.log('Current URL:', window.location.href);
  console.log('Current pathname:', window.location.pathname);
  
  const [activeTab, setActiveTab] = useState(() => {
    // sessionStorageからタブ状態を復元
    const savedTab = sessionStorage.getItem('homeSupportDashboardActiveTab');
    return savedTab && ['overview', 'users', 'evidence', 'evaluations', 'attendance'].includes(savedTab) 
      ? savedTab 
      : 'overview';
  });

  const [showHomeSupportModal, setShowHomeSupportModal] = useState(false);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [showSupportPlanModal, setShowSupportPlanModal] = useState(false);
  const [showDailySupportRecordModal, setShowDailySupportRecordModal] = useState(false);
  const [showUserInputModal, setShowUserInputModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [localUser, setLocalUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { currentUser: authUser, logout } = useInstructorGuard();

  useEffect(() => {
    if (!authUser) return;

    // sessionStorageから保存された拠点情報を取得（最優先）
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let savedLocation = null;
    
    if (savedSatellite) {
      try {
        savedLocation = JSON.parse(savedSatellite);
        console.log('HomeSupportDashboard: 保存された拠点情報を復元:', savedLocation);
      } catch (error) {
        console.error('HomeSupportDashboard: 保存された拠点情報のパースエラー:', error);
      }
    }
    
    // ローカルユーザー状態を設定
    if (!localUser || localUser.id !== authUser.id) {
      // 優先順位: 保存された拠点情報（sessionStorage） > ユーザーの現在の拠点情報 > 初期値
      let locationToUse;
      
      if (savedLocation && savedLocation.id) {
        // sessionStorageに保存された拠点情報を最優先で使用
        locationToUse = {
          id: savedLocation.id,
          name: savedLocation.name || authUser.satellite_name || '拠点未選択',
          company_id: savedLocation.company_id || authUser.company_id,
          company_name: savedLocation.company_name || authUser.company_name,
          type: savedLocation.type || authUser.location?.type || '就労移行支援事業所',
          organization: savedLocation.organization || authUser.location?.organization || 'スタディスフィア株式会社'
        };
        console.log('HomeSupportDashboard: sessionStorageの拠点情報を優先使用:', locationToUse);
        
        // sessionStorageの情報を確実に保存（データが不完全な場合の補完）
        sessionStorage.setItem('selectedSatellite', JSON.stringify(locationToUse));
      } else if (authUser.satellite_id && authUser.satellite_name) {
        // ユーザーの現在の拠点情報を使用
        locationToUse = {
          id: authUser.satellite_id,
          name: authUser.satellite_name,
          company_id: authUser.company_id,
          company_name: authUser.company_name,
          type: authUser.location?.type || '就労移行支援事業所',
          organization: authUser.location?.organization || 'スタディスフィア株式会社'
        };
        console.log('HomeSupportDashboard: ユーザーの現在の拠点情報を使用:', locationToUse);
        
        // sessionStorageに保存
        sessionStorage.setItem('selectedSatellite', JSON.stringify(locationToUse));
      } else {
        // 最後の手段として初期値を使用（この場合は通常発生しない）
        locationToUse = {
          id: 'office001',
          name: '東京教育渋谷校',
          type: '就労移行支援事業所',
          organization: 'スタディスフィア株式会社'
        };
        console.log('HomeSupportDashboard: 初期拠点情報を使用（警告）:', locationToUse);
      }
      
      setLocalUser({
        ...authUser,
        location: locationToUse,
        satellite_id: locationToUse.id,
        satellite_name: locationToUse.name,
        company_id: locationToUse.company_id,
        company_name: locationToUse.company_name
      });
    }
    
    setCurrentUser(authUser);
  }, [authUser?.id]);

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
  };

  const handleSupportPlanClick = (user) => {
    setSelectedUser(user);
    setShowSupportPlanModal(true);
  };

  const handleUserDetailClick = (user) => {
    setSelectedUser(user);
    setShowUserDetailModal(true);
  };

  const handleDailySupportRecordClick = (user) => {
    setSelectedUser(user);
    setShowDailySupportRecordModal(true);
  };

  const handleUserInputClick = (user) => {
    setSelectedUser(user);
    setShowUserInputModal(true);
  };

  const handleHomeSupportSuccess = () => {
    setShowHomeSupportModal(false);
    // 必要に応じてデータを再読み込み
  };

  const handleAiAssist = (type, data) => {
    console.log('AI支援:', type, data);
    // AI支援機能の実装
  };

  // 日次支援記録を保存
  const handleSaveDailySupportRecord = (data) => {
    console.log('日次支援記録を保存:', data);
    // TODO: APIに保存処理を実装
    alert('日次支援記録を保存しました。');
    setShowDailySupportRecordModal(false);
    setSelectedUser(null);
  };

  // AI提案機能（日次支援記録用）
  const handleDailyRecordAIAssist = (field, context) => {
    const { student, record, date } = context;
    
    // フィールドごとのAI提案ロジック
    let suggestion = '';
    
    switch (field) {
      case 'workContent':
        suggestion = `・ITリテラシー・AIの基本の学習を実施\n・HTML/CSS基礎学習とレスポンシブデザイン実習を行い、基本概念を理解\n・Webページ作成の基礎を習得`;
        break;
      case 'supportContent':
        suggestion = `・9:00　利用者から作業開始の連絡。本日の学習内容と目標を確認（${student?.name || '対象者'}さん）\n・12:00　午前中の学習進捗を電話で確認。HTML基礎の理解が進んでいることを確認\n・15:00　午後の学習内容について助言。CSS実習の注意点を説明\n・16:00　本日の学習成果を確認。次回の目標設定と、生活リズムを保つよう助言`;
        break;
      case 'healthStatus':
        suggestion = `・9:00　体温36.2℃、睡眠時間7時間と確認。体調は良好な様子\n・16:00　長時間の学習でやや疲労感があるとのこと。適度な休憩を取りながら、メリハリをつけて学習することを助言\n・生活リズムを保つために、就寝・起床時間を守ることを助言`;
        break;
      default:
        suggestion = 'AI提案を生成中...';
    }
    
    return suggestion;
  };

  if (!authUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">認証中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InstructorHeader 
        user={localUser} 
        onLogout={logout}
        onLocationChange={handleLocationChange}
        showLocationSelector={true}
      />
      
      <div className="flex flex-col flex-1 h-[calc(100vh-80px)] overflow-hidden">
        <aside className="w-full bg-white text-gray-800 flex-shrink-0 overflow-y-auto border-b border-gray-200">
          <nav className="p-4 flex flex-row gap-2 overflow-x-auto">
            <button
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'overview' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('overview');
                sessionStorage.setItem('homeSupportDashboardActiveTab', 'overview');
              }}
            >
              🏠 在宅支援メイン
            </button>
            <button 
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'users' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('users');
                sessionStorage.setItem('homeSupportDashboardActiveTab', 'users');
              }}
            >
              👥 利用者管理
            </button>
            <button
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'evidence' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('evidence');
                sessionStorage.setItem('homeSupportDashboardActiveTab', 'evidence');
              }}
            >
              📷 記録・証拠
            </button>
            <button
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'evaluations' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('evaluations');
                sessionStorage.setItem('homeSupportDashboardActiveTab', 'evaluations');
              }}
            >
              📋 評価記録
            </button>
            <button
              className={`flex items-center gap-3 px-6 py-4 bg-transparent border-none text-gray-800 cursor-pointer transition-all duration-300 text-center text-sm min-w-[150px] flex-shrink-0 rounded-lg hover:bg-indigo-50 hover:-translate-y-0.5 ${activeTab === 'attendance' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white' : ''}`}
              onClick={() => {
                setActiveTab('attendance');
                sessionStorage.setItem('homeSupportDashboardActiveTab', 'attendance');
              }}
            >
              ⏰ 勤怠管理
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto bg-white">
          {activeTab === 'overview' && (
            <OverviewTab 
              handleUserInputClick={handleUserInputClick}
              handleDailySupportRecordClick={handleDailySupportRecordClick}
              handleUserDetailClick={handleUserDetailClick}
            />
          )}

          {activeTab === 'users' && (
            <HomeSupportTab />
          )}

          {activeTab === 'evidence' && (
            <EvidenceRecordsTab 
              handleUserInputClick={handleUserInputClick}
              handleUserDetailClick={handleUserDetailClick}
            />
          )}

          {activeTab === 'evaluations' && (
            <EvaluationsTab 
              handleDailySupportRecordClick={handleDailySupportRecordClick}
            />
          )}

          {activeTab === 'attendance' && (
            <AttendanceTab />
          )}
        </main>
      </div>

      {/* 在宅支援利用者追加モーダル */}
      <HomeSupportUserAdditionModal
        isOpen={showHomeSupportModal}
        onClose={() => setShowHomeSupportModal(false)}
        onSuccess={handleHomeSupportSuccess}
      />

      {/* 利用者詳細モーダル */}
      <UserDetailModal
        isOpen={showUserDetailModal}
        onClose={() => setShowUserDetailModal(false)}
        selectedUser={selectedUser}
      />

      {/* 支援計画モーダル */}
      <SupportPlanModal
        isOpen={showSupportPlanModal}
        onClose={() => setShowSupportPlanModal(false)}
        selectedUser={selectedUser}
      />

      {/* 日次支援記録モーダル */}
      {showDailySupportRecordModal && selectedUser && (
        <DailySupportRecordModal
          isOpen={showDailySupportRecordModal}
          onClose={() => setShowDailySupportRecordModal(false)}
          onSave={handleSaveDailySupportRecord}
          student={selectedUser}
          date={selectedDate}
          aiAssist={handleDailyRecordAIAssist}
        />
      )}

      {/* 利用者入力確認モーダル */}
      <UserInputModal
        isOpen={showUserInputModal}
        onClose={() => setShowUserInputModal(false)}
        selectedUser={selectedUser}
      />
    </div>
  );
};

export default HomeSupportDashboard;
