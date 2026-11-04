import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { logAdminAccountOperation } from '../utils/adminLogger';
import { getUserInfo, reauthenticateForSatellite } from '../utils/api';
import CompanySatelliteSwitchModal from './CompanySatelliteSwitchModal';

import { API_BASE_URL } from '../config/apiConfig';

const InstructorHeader = ({ user, onLocationChange, showBackButton = false, backButtonText = "戻る", onBackClick }) => {
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [currentCompany, setCurrentCompany] = useState(null);
  const [currentSatellite, setCurrentSatellite] = useState(null);
  const [userSatellites, setUserSatellites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userInfoLoaded, setUserInfoLoaded] = useState(false);
  const { logout, updateAuthForSatellite } = useAuth();

  // セッションストレージから拠点情報を取得するuseEffect
  useEffect(() => {
    const selectedSatellite = sessionStorage.getItem('selectedSatellite');
    console.log('InstructorHeader: セッションストレージから拠点情報を取得開始');
    console.log('selectedSatellite:', selectedSatellite);
    
    if (selectedSatellite) {
      try {
        const satelliteData = JSON.parse(selectedSatellite);
        console.log('InstructorHeader: セッションストレージから拠点情報を取得:', satelliteData);
        setCurrentSatellite(satelliteData);
        
        // 企業情報も設定
        if (satelliteData.company_id && satelliteData.company_name) {
          setCurrentCompany({
            id: satelliteData.company_id,
            name: satelliteData.company_name
          });
        }
      } catch (error) {
        console.error('InstructorHeader: 拠点情報のパースエラー:', error);
      }
    } else {
      console.log('InstructorHeader: セッションストレージに拠点情報がありません');
    }
  }, []);

  // JWTトークンをデコードする関数
  const decodeJWT = (token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('JWTデコードエラー:', error);
      return null;
    }
  };

    // ロール番号からロール名を取得する関数
  const getRoleName = (roleId) => {
    const roleMap = {
      4: '指導員',
      5: '拠点管理者',
      9: 'システム管理者',
      10: 'マスターユーザ'
    };
    
         const numericRoleId = parseInt(roleId, 10);
     let roleName = roleMap[numericRoleId] || '指導員';
     
     // 拠点情報が利用可能な場合のみ管理者判定を実行
     const isManager = currentSatellite ? isCurrentSatelliteManager() : false;
    
    console.log('ロール名判定:', {
      roleId: roleId,
      numericRoleId: numericRoleId,
      baseRoleName: roleName,
      isManager: isManager,
      currentSatellite: currentSatellite
    });
    
    // ロール4（指導員）で現在の拠点の管理者の場合は「拠点管理者」と表示
    if (numericRoleId === 4 && isManager) {
      roleName = '拠点管理者';
      console.log('拠点管理者として表示に変更');
    }
    
    // 管理者（ロール9以上）が指導員ダッシュボードにいる場合は「システム管理者」と表示
    if (numericRoleId >= 9) {
      roleName = 'システム管理者';
      console.log('システム管理者として表示');
    }
    
    console.log('最終的なロール名:', roleName);
    return roleName;
  };

  // ユーザーの実際のロール番号を取得（無限ループ防止版）
  const getActualRoleId = () => {
    // まずJWTトークンからロール情報を取得
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      const decodedToken = decodeJWT(accessToken);
      console.log('JWTトークンデコード結果:', decodedToken);
      if (decodedToken && decodedToken.role) {
                 console.log('JWTトークンから取得したロール:', decodedToken.role);
         
         // 拠点管理者判定をチェック（拠点情報が利用可能な場合のみ）
         const isManager = currentSatellite ? isCurrentSatelliteManager() : false;
        if (decodedToken.role === 4 && isManager) {
          console.log('拠点管理者として判定されたため、ロールを5に更新します');
          // 拠点管理者の場合はロール5として扱う
          return 5;
        }
        
        return decodedToken.role;
      }
    }
    
    // JWTから取得できない場合は、ユーザーオブジェクトのroleを試行
    console.log('ユーザーオブジェクトから取得したロール:', user?.role);
    return user?.role;
  };

  // 現在の拠点で拠点管理者かどうかを判定（無限ループ防止版）
  const isCurrentSatelliteManager = () => {
    if (!currentSatellite) {
      console.log('拠点管理者判定: 拠点情報が不足');
      return false;
    }
    
    // ユーザーIDを取得
    const accessToken = localStorage.getItem('accessToken');
    let userId = null;
    if (accessToken) {
      const decodedToken = decodeJWT(accessToken);
      userId = decodedToken?.user_id;
    }
    
    if (!userId) {
      console.log('拠点管理者判定: ユーザーIDが取得できません');
      return false;
    }
    
    console.log('管理者判定開始:', {
      userId: userId,
      satelliteId: currentSatellite.id,
      satelliteName: currentSatellite.name,
      managerIds: currentSatellite.manager_ids,
      isManager: currentSatellite.is_manager
    });
    
    // APIから返されたis_managerの値を確認
    const apiIsManager = currentSatellite.is_manager === true;
    
    // バックアップ判定: ユーザーIDが拠点の管理者リストに含まれているかチェック
    let backupIsManager = false;
    if (currentSatellite.manager_ids) {
      try {
        // manager_idsが既に配列の場合はそのまま使用、文字列の場合はパース
        let managerIds = currentSatellite.manager_ids;
        if (typeof managerIds === 'string') {
          managerIds = JSON.parse(managerIds);
        }
        
        console.log('管理者ID解析結果:', {
          originalManagerIds: currentSatellite.manager_ids,
          parsedManagerIds: managerIds,
          isArray: Array.isArray(managerIds),
          length: Array.isArray(managerIds) ? managerIds.length : 0
        });
        
        if (Array.isArray(managerIds)) {
          // 数値として比較（より確実な方法）
          const userIdNum = parseInt(userId);
          backupIsManager = managerIds.some(managerId => {
            const managerIdNum = parseInt(managerId);
            const isMatch = managerIdNum === userIdNum;
            
            console.log(`管理者ID比較: ${managerId} (${typeof managerId}) == ${userId} (${typeof userId}) = ${isMatch}`, {
              managerIdNum,
              userIdNum,
              isMatch
            });
            
            return isMatch;
          });
        }
      } catch (error) {
        console.error('manager_ids parse error:', error);
      }
    }
    
    const finalIsManager = apiIsManager || backupIsManager;
    
    console.log('拠点管理者判定最終結果:', {
      userId: userId,
      satelliteName: currentSatellite.name,
      satelliteId: currentSatellite.id,
      apiIsManager: apiIsManager,
      backupIsManager: backupIsManager,
      finalIsManager: finalIsManager,
      managerIds: currentSatellite.manager_ids,
      userRole: user?.role
    });
    
    return finalIsManager;
  };



  // ユーザー情報を取得（無限ループ防止版）
  const loadUserInfo = async () => {
    // 既にローディング中の場合は重複実行を防ぐ
    if (loading) {
      console.log('loadUserInfo: 既にローディング中のためスキップ');
      return;
    }
    
    setLoading(true);
    try {
      // まずsessionStorageから保存された拠点情報を取得（最優先）
      const savedSatellite = sessionStorage.getItem('selectedSatellite');
      let savedSatelliteData = null;
      if (savedSatellite) {
        try {
          savedSatelliteData = JSON.parse(savedSatellite);
          console.log('loadUserInfo: sessionStorageから保存された拠点情報を取得:', savedSatelliteData);
        } catch (error) {
          console.error('loadUserInfo: sessionStorageの拠点情報パースエラー:', error);
        }
      }
      
      const result = await getUserInfo();
      if (result.success && result.data) {
        const { user: userInfo, satellites, companies } = result.data;
        
        console.log('APIから取得したユーザー情報:', userInfo);
        console.log('APIから取得したロール:', userInfo.role);
        console.log('APIから取得した拠点情報:', satellites);
        console.log('APIから取得した企業情報:', companies);
        
        // 拠点情報を設定
        setUserSatellites(Array.isArray(satellites) ? satellites : []);
        
        // 拠点の設定：sessionStorageを最優先、次にAPIから取得したリストから選択
        let targetSatellite = null;
        
        // 1. sessionStorageに保存された拠点情報を優先（存在し、APIのリストにも含まれている場合）
        if (savedSatelliteData && savedSatelliteData.id && satellites && satellites.length > 0) {
          const savedId = parseInt(savedSatelliteData.id);
          targetSatellite = satellites.find(s => parseInt(s.id) === savedId);
          if (targetSatellite) {
            console.log('loadUserInfo: sessionStorageの拠点情報を使用:', targetSatellite);
            // 企業情報も更新
            if (savedSatelliteData.company_id && savedSatelliteData.company_name) {
              setCurrentCompany({
                id: savedSatelliteData.company_id,
                name: savedSatelliteData.company_name
              });
            }
            setCurrentSatellite(targetSatellite);
          } else {
            console.log('loadUserInfo: sessionStorageの拠点IDがAPIリストに見つからないため、フォールバック処理へ');
          }
        }
        
        // 2. sessionStorageの情報が使えない場合のフォールバック処理
        if (!targetSatellite) {
          // アドミン権限（ロール9以上）の場合の特別処理
          if (userInfo.role >= 9) {
            // システム管理者として設定
            setCurrentCompany({
              id: null,
              name: 'システム管理者',
              address: null,
              phone: null
            });
            
            // フォールバック: user?.satellite_idまたは最初の拠点
            const selectedSatelliteId = user?.satellite_id || (savedSatelliteData ? savedSatelliteData.id : null);
            if (selectedSatelliteId && satellites && satellites.length > 0) {
              targetSatellite = satellites.find(s => s.id === selectedSatelliteId) || satellites[0];
            } else if (satellites && satellites.length > 0) {
              targetSatellite = satellites[0];
            }
            
            if (targetSatellite) {
              console.log('loadUserInfo: フォールバック処理で拠点を設定（管理者）:', targetSatellite);
              setCurrentSatellite(targetSatellite);
            }
          } else {
            // 通常のユーザー（ロール9未満）の処理
            setCurrentCompany({
              id: userInfo.company_id,
              name: userInfo.company_name,
              address: userInfo.company_address,
              phone: userInfo.company_phone
            });
            
            // フォールバック: user?.satellite_idまたは最初の拠点
            const selectedSatelliteId = user?.satellite_id || (savedSatelliteData ? savedSatelliteData.id : null);
            if (selectedSatelliteId && satellites && satellites.length > 0) {
              targetSatellite = satellites.find(s => s.id === selectedSatelliteId) || satellites[0];
            } else if (satellites && satellites.length > 0) {
              targetSatellite = satellites[0];
            }
            
            if (targetSatellite) {
              console.log('loadUserInfo: フォールバック処理で拠点を設定（通常ユーザー）:', targetSatellite);
              setCurrentSatellite(targetSatellite);
            }
          }
        }
        
        // 3. 最終的に設定された拠点情報をsessionStorageに同期（存在する場合）
        if (targetSatellite && targetSatellite.id) {
          const currentSavedSatellite = sessionStorage.getItem('selectedSatellite');
          if (!currentSavedSatellite || JSON.parse(currentSavedSatellite).id !== targetSatellite.id) {
            const satelliteInfo = {
              id: targetSatellite.id,
              name: targetSatellite.name,
              company_id: targetSatellite.company_id || (userInfo.role >= 9 ? null : userInfo.company_id),
              company_name: targetSatellite.company_name || (userInfo.role >= 9 ? 'システム管理者' : userInfo.company_name)
            };
            sessionStorage.setItem('selectedSatellite', JSON.stringify(satelliteInfo));
            console.log('loadUserInfo: sessionStorageに拠点情報を同期:', satelliteInfo);
          }
        }
      }
    } catch (error) {
      console.error('ユーザー情報取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 拠点再認証処理を分離（無限ループ防止のため削除）
  // const performSatelliteReauth = async (satellite) => {
  //   // 再認証処理は削除
  // };

  useEffect(() => {
    // 初期化時のみ実行（無限ループ防止）
    if (!userInfoLoaded && !loading) {
      loadUserInfo();
      setUserInfoLoaded(true);
    }
  }, [userInfoLoaded, loading]); // フラグを使用して一度だけ実行
  
  // 拠点情報の変更を監視するuseEffect（無限ループ防止）
  useEffect(() => {
    console.log('InstructorHeader: 拠点情報変更を監視');
    console.log('currentSatellite:', currentSatellite);
    
    if (currentSatellite && currentSatellite.id) {
      // セッションストレージの現在の値を取得
      const storedSatellite = sessionStorage.getItem('selectedSatellite');
      let storedSatelliteData = null;
      
      try {
        if (storedSatellite) {
          storedSatelliteData = JSON.parse(storedSatellite);
        }
      } catch (error) {
        console.error('セッションストレージの拠点情報パースエラー:', error);
      }
      
      // 拠点情報が実際に変更された場合のみ更新（無限ループ防止）
      if (!storedSatelliteData || storedSatelliteData.id !== currentSatellite.id) {
        const selectedSatelliteInfo = {
          id: currentSatellite.id,
          name: currentSatellite.name,
          company_id: currentSatellite.company_id,
          company_name: currentSatellite.company_name
        };
        sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
        console.log('InstructorHeader: 拠点情報変更によりセッションストレージを更新:', selectedSatelliteInfo);
      }
    }
  }, [currentSatellite?.id]); // 拠点IDのみを依存配列に含める

  // ロール情報を更新する関数（無限ループ防止のため削除）
  // const updateRoleInfo = async () => {
  //   // 関数全体を削除
  // };

  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      if (user && user.role === 'instructor') {
        logAdminAccountOperation('logout', user);
      }
      logout();
    }
  };

  const handleCompanySelect = (company) => {
    setCurrentCompany(company);
    // 企業が変更された場合、その企業の最初の拠点を選択
    const companySatellites = userSatellites.filter(s => s.company_id === company.id);
    if (companySatellites.length > 0) {
      setCurrentSatellite(companySatellites[0]);
    }
  };

  const handleSatelliteSelect = async (satellite) => {
    console.log('=== 拠点選択処理開始 ===');
    console.log('選択された拠点:', satellite);
    console.log('現在のユーザー:', user);
    
    try {
      // 拠点変更時の再認証を実行
      console.log('拠点変更時再認証API呼び出し開始...');
      const reauthResult = await reauthenticateForSatellite(satellite.id);
      console.log('拠点変更時再認証結果:', reauthResult);
      
      if (reauthResult.success && reauthResult.data) {
        // 新しいトークンを保存
        const { access_token, refresh_token } = reauthResult.data;
        
        // ユーザー情報を更新
        const updatedUser = {
          ...user,
          role: reauthResult.data.user.role,
          company_id: reauthResult.data.user.company_id,
          company_name: reauthResult.data.user.company_name,
          satellite_id: reauthResult.data.user.satellite_id,
          satellite_name: reauthResult.data.user.satellite_name
        };
        
        // 認証コンテキストを更新
        updateAuthForSatellite(updatedUser, access_token, refresh_token);
        console.log('拠点変更後のユーザー情報:', updatedUser);
        
        // 古いselectedSatellite情報をクリア
        sessionStorage.removeItem('selectedSatellite');
        console.log('古いselectedSatellite情報をクリアしました');
        
        // 新しい拠点情報をselectedSatelliteに保存
        const selectedSatelliteInfo = {
          id: satellite.id,
          name: satellite.name,
          company_id: satellite.company_id || reauthResult.data.user.company_id,
          company_name: satellite.company_name || reauthResult.data.user.company_name
        };
        sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
        console.log('新しい拠点情報をselectedSatelliteに保存:', selectedSatelliteInfo);
        
        // デバッグ: 保存後の確認
        const savedSatellite = sessionStorage.getItem('selectedSatellite');
        console.log('保存後のselectedSatellite確認:', savedSatellite);
        if (savedSatellite) {
          try {
            const parsedSatellite = JSON.parse(savedSatellite);
            console.log('パースされた拠点情報:', parsedSatellite);
          } catch (error) {
            console.error('保存後の拠点情報パースエラー:', error);
          }
        }
        
        // 現在の拠点を更新
        setCurrentSatellite(satellite);
        
        // 親コンポーネントに変更を通知
        if (onLocationChange) {
          onLocationChange(satellite);
        }
        
        // 拠点変更時の処理完了
        return;
      } else {
        console.error('拠点変更時再認証に失敗:', reauthResult.message);
        alert('拠点変更に失敗しました: ' + reauthResult.message);
        return;
      }
    } catch (error) {
      console.error('拠点変更時再認証エラー:', error);
      alert('拠点変更中にエラーが発生しました: ' + error.message);
      return;
    }
  };

  // ユーザーのロール名を取得（拠点情報が利用可能になってから実行）
  const actualRoleId = currentSatellite ? getActualRoleId() : user?.role || 4;
  const userRoleName = currentSatellite ? getRoleName(actualRoleId) : '指導員';
  
  // 権限チェック
  const canSwitchCompany = actualRoleId >= 9;
  // 指導員の場合は、複数拠点に所属している場合のみ切り替え可能
  const canSwitchSatellite = actualRoleId >= 9 || (Array.isArray(userSatellites) && userSatellites.length > 1);
  const canSwitchAnything = canSwitchCompany || canSwitchSatellite;

  return (
    <header className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white py-4 shadow-lg">
      <div className="max-w-7xl mx-auto px-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <button
              onClick={onBackClick}
              className="flex items-center gap-2 px-3 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-all duration-200 text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {backButtonText}
            </button>
          )}
          <h1 className="text-2xl font-bold text-white m-0">Study Sphere</h1>
        </div>
        <div className="flex items-center gap-4">
                     <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
               <span className="font-medium text-white">{user?.name}</span>
               <span className="px-2 py-1 rounded-full text-xs font-semibold bg-white bg-opacity-20 text-white">
                 {userRoleName}
               </span>
             </div>
             <div className="flex flex-col items-end">
               <div className="flex items-center gap-2">
                 <div className="text-lg font-bold">
                   {currentSatellite?.name || '拠点未選択'}
                 </div>
                 <span className="text-sm bg-white/20 px-2 py-0.5 rounded">
                   {currentSatellite?.office_type_name?.includes('学習塾') ? '📚' : 
                    currentSatellite?.office_type_name?.includes('就労移行') ? '🏢' :
                    currentSatellite?.office_type_name?.includes('A型') ? '🏭' :
                    currentSatellite?.office_type_name?.includes('B型') ? '🏗️' : '🏫'}
                 </span>
               </div>
               <div className="text-sm text-white/80">
                 {currentCompany?.name || '企業未選択'}
               </div>
             </div>
           </div>
          {canSwitchAnything && (
            <button 
              onClick={() => setIsSwitchModalOpen(true)}
              className="bg-white bg-opacity-10 text-white border-2 border-white border-opacity-30 px-4 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-opacity-20 hover:border-opacity-50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
              企業・拠点切り替え
            </button>
          )}
          

          
          <button 
            className="bg-white bg-opacity-10 text-white border-2 border-white border-opacity-30 px-4 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-opacity-20 hover:border-opacity-50"
            onClick={handleLogout}
          >
            ログアウト
          </button>
        </div>
      </div>

      <CompanySatelliteSwitchModal
        isOpen={isSwitchModalOpen}
        onClose={() => setIsSwitchModalOpen(false)}
        currentCompany={currentCompany}
        currentSatellite={currentSatellite}
        onCompanySelect={handleCompanySelect}
        onSatelliteSelect={handleSatelliteSelect}
        userRole={actualRoleId}
        userSatellites={userSatellites}
      />
    </header>
  );
};

export default InstructorHeader; 