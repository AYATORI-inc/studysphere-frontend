import React, { useState, useEffect } from 'react';
import SanitizedInput from './SanitizedInput';
import SanitizedTextarea from './SanitizedTextarea';
import { SANITIZE_OPTIONS } from '../utils/sanitizeUtils';
import { apiGet, apiPost, apiPut, apiDelete, apiCall } from '../utils/api';
import { useAuth } from './contexts/AuthContext';
import ModalErrorDisplay from './common/ModalErrorDisplay';

const InstructorManagement = () => {
  const { currentUser } = useAuth();
  
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

  // ユーザーの実際のロール番号を取得
  const getActualRoleId = () => {
    // まずJWTトークンからロール情報を取得
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      const decodedToken = decodeJWT(accessToken);
      if (decodedToken && decodedToken.role) {
        // 拠点管理者判定をチェック（簡易版）
        if (decodedToken.role === 4) {
          // 拠点管理者の場合はロール5として扱う
          return 5;
        }
        return decodedToken.role;
      }
    }
    
    // JWTから取得できない場合は、ユーザーオブジェクトのroleを試行
    return currentUser?.role;
  };
  
  // 権限チェック（ロール5以上のみアクセス可能）
  const actualRoleId = getActualRoleId();
  const hasPermission = actualRoleId >= 5;
  
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [facilityLocations, setFacilityLocations] = useState([]);
  const [companies, setCompanies] = useState([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [showTempPasswordDialog, setShowTempPasswordDialog] = useState(false);
  const [generatedTempPassword, setGeneratedTempPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [facilityLocationFilter, setFacilityLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNoLocationFilter, setShowNoLocationFilter] = useState(false);
  const [satelliteManagers, setSatelliteManagers] = useState({});
  const [modalError, setModalError] = useState(null);
  
  const [newInstructor, setNewInstructor] = useState({
    name: '',
    username: '', // ログインIDを追加
    email: '',
    department: '',
    company_id: '',
    facilityLocationIds: [],
    managerSettings: {}, // 拠点ごとの管理者設定
    password: ''
  });
  
  // リアルタイムバリデーション用の状態
  const [usernameValidation, setUsernameValidation] = useState({
    isChecking: false,
    isValid: null,
    message: '',
    suggestions: []
  });

  // username重複チェック関数
  const checkUsernameAvailability = async (username) => {
    if (!username || username.trim() === '') {
      setUsernameValidation({
        isChecking: false,
        isValid: null,
        message: '',
        suggestions: []
      });
      return;
    }
    
    setUsernameValidation(prev => ({ ...prev, isChecking: true }));
    
    try {
      const response = await apiGet(`/api/username/check/${encodeURIComponent(username)}`);
      
      if (response.success) {
        setUsernameValidation({
          isChecking: false,
          isValid: response.available,
          message: response.message,
          suggestions: []
        });
        
        // 利用不可の場合、候補を取得
        if (!response.available) {
          try {
            const suggestionsResponse = await apiGet(`/api/username/suggestions/${encodeURIComponent(username)}`);
            if (suggestionsResponse.success && suggestionsResponse.suggestions.length > 0) {
              setUsernameValidation(prev => ({
                ...prev,
                suggestions: suggestionsResponse.suggestions
              }));
            }
          } catch (suggestionsError) {
            console.error('候補取得エラー:', suggestionsError);
          }
        }
      } else {
        setUsernameValidation({
          isChecking: false,
          isValid: false,
          message: response.message || 'ログインIDのチェックに失敗しました',
          suggestions: []
        });
      }
    } catch (error) {
      console.error('username重複チェックエラー:', error);
      setUsernameValidation({
        isChecking: false,
        isValid: false,
        message: 'ログインIDのチェックに失敗しました',
        suggestions: []
      });
    }
  };

  // デバウンス用のタイマー
  const [usernameCheckTimer, setUsernameCheckTimer] = useState(null);

  // 企業一覧を取得
  const fetchCompanies = async () => {
    try {
      console.log('=== 企業一覧取得開始 ===');
      const response = await apiGet('/api/companies');
      console.log('企業APIレスポンス:', response);
      console.log('レスポンスの型:', typeof response);
      console.log('レスポンスが配列か:', Array.isArray(response));
      
      // レスポンス構造を確認して適切に処理
      let companiesData = [];
      if (response && response.success && response.data) {
        console.log('パターン1: response.success && response.data');
        companiesData = response.data;
      } else if (Array.isArray(response)) {
        console.log('パターン2: responseが配列');
        companiesData = response;
      } else if (response && Array.isArray(response.data)) {
        console.log('パターン3: response.dataが配列');
        companiesData = response.data;
      } else {
        console.log('パターン4: 該当なし、空配列を設定');
        companiesData = [];
      }
      
      console.log('処理後の企業データ:', companiesData);
      console.log('企業データ件数:', companiesData.length);
      setCompanies(companiesData);
      console.log('=== 企業一覧取得完了 ===');
    } catch (error) {
      console.error('企業一覧取得エラー:', error);
      setCompanies([]);
    }
  };

  // 拠点一覧を取得
  const fetchFacilityLocations = async () => {
    try {
      console.log('拠点一覧を取得中...');
      const response = await apiGet('/api/satellites');
      console.log('拠点データ:', response);

      // APIレスポンスの形式を確認（success/data形式）
      const data = response.success ? response.data : [];
      
      // データが配列かどうかチェック
      if (!Array.isArray(data)) {
        console.warn('拠点データが配列ではありません:', data);
        setFacilityLocations([]);
        return;
      }

             // 拠点データを変換
       const locations = data.map(satellite => ({
         id: satellite.id.toString(),
         name: satellite.name,
         company_id: satellite.company_id,
         organizationName: satellite.company_name || '',
         type: satellite.office_type_name || '未分類',
         address: satellite.address || '',
         managerIds: satellite.manager_ids ? (Array.isArray(satellite.manager_ids) ? satellite.manager_ids : JSON.parse(satellite.manager_ids)) : []
       }));

      console.log('拠点データ変換後:', locations);
      setFacilityLocations(locations);
      
      // 拠点管理者の情報をマップ化
      const managersMap = {};
      locations.forEach(location => {
        if (location.managerIds && location.managerIds.length > 0) {
          managersMap[location.id] = location.managerIds;
        } else {
          managersMap[location.id] = [];
        }
      });
      console.log('管理者マップ:', managersMap);
      setSatelliteManagers(managersMap);
    } catch (error) {
      console.error('拠点一覧取得エラー:', error);
      // エラー時は空配列を設定（エラーを投げない）
      setFacilityLocations([]);
    }
  };

  // 指導員一覧を取得
  const fetchInstructors = async () => {
    try {
      console.log('=== 指導員一覧取得開始 ===');
      console.log('apiGet を呼び出します: /api/users');
      
      const data = await apiGet('/api/users');
      console.log('APIレスポンス取得成功');
      console.log('取得したデータの型:', typeof data);
      console.log('取得したデータが配列か:', Array.isArray(data));
      console.log('取得したデータの長さ:', Array.isArray(data) ? data.length : '配列ではありません');
      console.log('取得したデータ:', data);

      // データが配列かどうかチェック
      if (!Array.isArray(data)) {
        console.warn('APIから配列が返されませんでした:', data);
        setInstructors([]);
        return;
      }

      // 全ユーザーのロールを確認
      console.log('全ユーザーのロール確認:');
      data.forEach((user, index) => {
        console.log(`ユーザー${index + 1}: ID=${user.id}, 名前=${user.name}, ロール=${user.role}, ロール型=${typeof user.role}`);
      });

      // ロール4、5のユーザーのみをフィルタリング
      const instructorUsers = data.filter(user => {
        const isInstructor = user.role >= 4 && user.role <= 5;
        console.log(`ユーザー ${user.name} (ID: ${user.id}): ロール=${user.role}, 指導員判定=${isInstructor}`);
        return isInstructor;
      });
      
              console.log('フィルタリング後の指導員ユーザー:', instructorUsers);
        console.log('指導員ユーザー数:', instructorUsers.length);
        console.log('指導員ユーザーの詳細:', instructorUsers.map(u => ({ 
        id: u.id, 
        name: u.name, 
        username: u.username, 
        role: u.role,
        email: u.email 
      })));
      
              // 指導員ユーザーが空の場合は空配列を設定
      if (instructorUsers.length === 0) {
                  console.log('指導員ユーザーが見つかりません。新規登録で追加してください。');
        setInstructors([]);
        return;
      }
      
              // 各指導員の専門分野を取得
      const instructorsWithSpecializations = await Promise.all(
        instructorUsers.map(async (user) => {
          try {
            const specData = await apiGet(`/api/instructors/${user.id}/specializations`);
            
            // バックエンドから返された拠点情報を使用
            let facilityLocationNames = [];
            let facilityLocationIds = [];
            
            if (user.satellite_details && Array.isArray(user.satellite_details)) {
              facilityLocationNames = user.satellite_details.map(satellite => satellite.name).filter(name => name);
              facilityLocationIds = user.satellite_details.map(satellite => satellite.id.toString());
            } else if (user.satellite_ids) {
              // satellite_detailsが空の場合、satellite_idsから拠点情報を取得
              try {
                let satelliteIds;
                if (Array.isArray(user.satellite_ids)) {
                  satelliteIds = user.satellite_ids;
                } else if (typeof user.satellite_ids === 'string') {
                  satelliteIds = JSON.parse(user.satellite_ids);
                } else {
                  satelliteIds = [user.satellite_ids];
                }
                if (!Array.isArray(satelliteIds)) {
                  satelliteIds = [satelliteIds];
                }
                facilityLocationIds = satelliteIds.map(id => id.toString());
                
                // 拠点名を取得（facilityLocationsから）
                facilityLocationNames = satelliteIds.map(id => {
                  const location = facilityLocations.find(loc => loc.id === id.toString());
                  return location ? location.name : `拠点${id}`;
                });
              } catch (e) {
                console.error('拠点ID処理エラー:', e);
              }
            }
            
            return {
              id: user.id.toString(),
              name: user.name,
              username: user.username || '', // ログインIDを追加
              email: user.email || '',
              department: specData.success && specData.data.length > 0 ? specData.data[0].specialization : '',
              facilityLocationIds: facilityLocationIds,
              facilityLocationNames: facilityLocationNames,
              status: user.status === 1 ? 'active' : 'inactive',
              lastLogin: user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('ja-JP') : '-',
              passwordResetRequired: user.password_reset_required === 1,
              specializations: specData.success ? specData.data : []
            };
          } catch (error) {
            console.error(`指導員${user.id}の専門分野取得エラー:`, error);
            
            // バックエンドから返された拠点情報を使用
            let facilityLocationNames = [];
            let facilityLocationIds = [];
            
            if (user.satellite_details && Array.isArray(user.satellite_details)) {
              facilityLocationNames = user.satellite_details.map(satellite => satellite.name).filter(name => name);
              facilityLocationIds = user.satellite_details.map(satellite => satellite.id.toString());
            } else if (user.satellite_ids) {
              // satellite_detailsが空の場合、satellite_idsから拠点情報を取得
              try {
                let parsed;
                if (Array.isArray(user.satellite_ids)) {
                  parsed = user.satellite_ids;
                } else if (typeof user.satellite_ids === 'string') {
                  parsed = JSON.parse(user.satellite_ids);
                } else {
                  parsed = [user.satellite_ids];
                }
                const satelliteIds = Array.isArray(parsed) ? parsed : [parsed];
                facilityLocationIds = satelliteIds.map(id => id.toString());
                
                // 拠点名を取得（facilityLocationsから）
                facilityLocationNames = satelliteIds.map(id => {
                  const location = facilityLocations.find(loc => loc.id === id.toString());
                  return location ? location.name : `拠点${id}`;
                });
              } catch (e) {
                console.error('拠点ID処理エラー:', e);
              }
            }
            
            return {
              id: user.id.toString(),
              name: user.name,
              username: user.username || '', // ログインIDを追加
              email: user.email || '',
              department: '',
              facilityLocationIds: facilityLocationIds,
              facilityLocationNames: facilityLocationNames,
              status: user.status === 1 ? 'active' : 'inactive',
              lastLogin: user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('ja-JP') : '-',
              passwordResetRequired: user.password_reset_required === 1,
              specializations: []
            };
          }
        })
      );

      console.log('最終的なinstructorsデータ:', instructorsWithSpecializations.map(i => ({ id: i.id, name: i.name, username: i.username })));
      setInstructors(instructorsWithSpecializations);
    } catch (error) {
      console.error('指導員一覧取得エラー:', error);
      // エラー時は空配列を設定（エラーを投げない）
      setInstructors([]);
    }
  };

  // 初期データ読み込み
  useEffect(() => {
    console.log('InstructorManagement useEffect が実行されました');
    const loadData = async () => {
      console.log('loadData 関数が開始されました');
      setLoading(true);
      setError(null);
      
      try {
        console.log('fetchCompanies を呼び出します');
        await fetchCompanies();
        console.log('fetchFacilityLocations を呼び出します');
        await fetchFacilityLocations();
        console.log('fetchInstructors を呼び出します');
        await fetchInstructors();
      } catch (error) {
        console.error('データ読み込みエラー:', error);
        // エラーが発生してもローディング状態を解除
        console.log('データ読み込みでエラーが発生しましたが、処理を続行します。');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // フィルタリング機能
  const getFilteredInstructors = () => {
    return instructors.filter(instructor => {
      const matchesSearch = instructor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           instructor.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           instructor.department.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesLocation = facilityLocationFilter === 'all' || 
                             instructor.facilityLocationIds.includes(facilityLocationFilter);
      
      const matchesStatus = statusFilter === 'all' || instructor.status === statusFilter;
      
      const matchesNoLocation = !showNoLocationFilter || instructor.facilityLocationIds.length === 0;
      
      return matchesSearch && matchesLocation && matchesStatus && matchesNoLocation;
    });
  };

  const handlePasswordReset = (instructor) => {
    setSelectedInstructor(instructor);
    setShowPasswordResetModal(true);
  };

  const executePasswordReset = async (action) => {
    if (!selectedInstructor) return;

    try {
      if (action === 'issue_temp_password') {
        // 一時パスワード発行
        const result = await apiPost(`/api/users/${selectedInstructor.id}/reset-password`, {
          action: 'issue_temp_password'
        });
        
        if (result.success) {
          setGeneratedTempPassword(result.data.tempPassword);
          setShowTempPasswordDialog(true);
          setShowPasswordResetModal(false);
        } else {
          alert(`一時パスワード発行に失敗しました: ${result.message}`);
        }
      } else if (action === 'require_password_change') {
        // パスワード変更要求
        const result = await apiPost(`/api/users/${selectedInstructor.id}/reset-password`, {
          action: 'require_password_change'
        });
        
        if (result.success) {
          alert('パスワード変更要求が送信されました。');
          setShowPasswordResetModal(false);
        } else {
          alert(`パスワード変更要求に失敗しました: ${result.message}`);
        }
      }

      // 指導員一覧を再取得
      await fetchInstructors();
    } catch (error) {
      console.error('パスワードリセットエラー:', error);
      alert(`パスワードリセットに失敗しました: ${error.message}`);
    }
  };

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleAddInstructor = async (e) => {
    e.preventDefault();
    
    // バリデーション
    if (!newInstructor.username) {
      alert('ログインIDを入力してください。');
      return;
    }
    
    if (!/^[a-zA-Z0-9_/.-]+$/.test(newInstructor.username)) {
      alert('ログインIDは半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使用可能です。');
      return;
    }
    
    if (!newInstructor.company_id) {
      alert('企業を選択してください。');
      return;
    }
    
    if (newInstructor.facilityLocationIds.length === 0) {
      alert('少なくとも1つの拠点を選択してください。');
      return;
    }
    
    try {
      // 送信データをログ出力
      const requestData = {
        name: newInstructor.name,
        username: newInstructor.username, // ログインIDを追加
        password: newInstructor.password, // パスワードを追加
        role: 4, // 指導員ロール
        status: 1,
        login_code: (() => {
          // XXXX-XXXX-XXXX形式（英数大文字小文字交じり）
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          const generatePart = () => {
            let result = '';
            for (let i = 0; i < 4; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
          };
          return `${generatePart()}-${generatePart()}-${generatePart()}`;
        })(),
        company_id: newInstructor.company_id, // 選択された企業ID
        satellite_ids: newInstructor.facilityLocationIds,
        email: newInstructor.email
      };
      
      console.log('=== 指導員追加API呼び出し ===');
      console.log('送信データ:', requestData);
      
      // 新しい指導者を追加するAPI呼び出し
      const data = await apiPost('/api/users/create', requestData);
      console.log('APIレスポンス:', data);

      // 管理者設定を処理
      const managerSatellites = Object.keys(newInstructor.managerSettings)
        .filter(satelliteId => newInstructor.managerSettings[satelliteId])
        .map(satelliteId => parseInt(satelliteId));

      if (managerSatellites.length > 0) {
        // 管理者として設定された拠点のmanager_idsを更新
        for (const satelliteId of managerSatellites) {
          const currentManagers = satelliteManagers[satelliteId] || [];
          const updatedManagers = [...currentManagers, data.data.id];
          
          console.log(`新規指導員追加時の管理者設定:`, {
            satelliteId,
            currentManagers,
            newInstructorId: data.data.id,
            updatedManagers
          });
          
          await apiPut(`/api/satellites/${satelliteId}/managers`, {
            manager_ids: updatedManagers
          });
          
          // ローカル状態も即座に更新
          setSatelliteManagers(prev => ({
            ...prev,
            [satelliteId]: updatedManagers
          }));
        }
      }

      // 専門分野を設定
      if (newInstructor.department) {
        await apiPost(`/api/instructors/${data.data.id}/specializations`, {
          specializations: [newInstructor.department]
        });
      }

      // 指導員一覧を再取得
      await fetchInstructors();
      
      // 拠点一覧を再取得して管理者情報を更新
      await fetchFacilityLocations();
      
      // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      
      // 成功時のみフォームをリセットしてモーダルを閉じる
      setNewInstructor({
        name: '',
        username: '', // ログインIDを追加
        email: '',
        department: '',
        company_id: '',
        facilityLocationIds: [],
        managerSettings: {},
        password: ''
      });
      setUsernameValidation({
        isChecking: false,
        isValid: null,
        message: '',
        suggestions: []
      });
      setShowAddForm(false);
      setModalError(null);
      
      alert('指導員が正常に追加されました。');
    } catch (error) {
      console.error('指導員追加エラー:', error);
      setModalError(`指導員の追加に失敗しました: ${error.message}`);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // usernameの場合はリアルタイムチェックを実行
    if (name === 'username') {
      // 既存のタイマーをクリア
      if (usernameCheckTimer) {
        clearTimeout(usernameCheckTimer);
      }
      
      // 新しいタイマーを設定（500ms後にチェック実行）
      const newTimer = setTimeout(() => {
        checkUsernameAvailability(value);
      }, 500);
      setUsernameCheckTimer(newTimer);
    }
    
    setNewInstructor(prev => {
      const updated = {
        ...prev,
        [name]: value
      };
      
      // 企業が変更された場合、拠点選択と管理者設定をリセット
      if (name === 'company_id') {
        updated.facilityLocationIds = [];
        updated.managerSettings = {};
      }
      
      return updated;
    });
  };

  // 企業選択時の拠点フィルタリング
  const getFilteredLocations = () => {
    if (!newInstructor.company_id) {
      return [];
    }
    return facilityLocations.filter(location => location.company_id == newInstructor.company_id);
  };

  const toggleInstructorStatus = async (instructorId) => {
    try {
      const instructor = instructors.find(i => i.id === instructorId);
      const newStatus = instructor.status === 'active' ? 0 : 1;
      
      await apiPut(`/api/users/${instructorId}`, {
        status: newStatus
      });

      // 指導員一覧を再取得
      await fetchInstructors();
      
      // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
    } catch (error) {
      console.error('指導員ステータス更新エラー:', error);
      alert(`指導員ステータスの更新に失敗しました: ${error.message}`);
    }
  };

  // ソート機能を追加
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedInstructors = () => {
    const filtered = getFilteredInstructors();
    return [...filtered].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      if (sortConfig.key === 'status') {
        aValue = getStatusLabel(aValue);
        bValue = getStatusLabel(bValue);
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getStatusLabel = (status) => {
    return status === 'active' ? 'アクティブ' : '非アクティブ';
  };

  const handleEditInstructor = (instructor) => {
    // 拠点管理者の情報を初期化
    const isManagerData = {};
    instructor.facilityLocationIds.forEach(locationId => {
      isManagerData[locationId] = isSatelliteManager(instructor.id, locationId);
    });
    
    setSelectedInstructor({
      ...instructor,
      username: instructor.username || '', // ログインIDを追加
      isManager: isManagerData
    });
    setShowEditForm(true);
  };

  const handleUpdateInstructor = async (e) => {
    e.preventDefault();
    
    // バリデーション
    if (!selectedInstructor.username) {
      alert('ログインIDを入力してください。');
      return;
    }
    
    if (!/^[a-zA-Z0-9_/.-]+$/.test(selectedInstructor.username)) {
      alert('ログインIDは半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使用可能です。');
      return;
    }
    
    try {
      // 指導員情報を更新するAPI呼び出し
      await apiPut(`/api/users/${selectedInstructor.id}`, {
        name: selectedInstructor.name,
        username: selectedInstructor.username, // ログインIDを追加
        email: selectedInstructor.email,
        satellite_ids: selectedInstructor.facilityLocationIds
      });

      // 専門分野を更新
      if (selectedInstructor.department) {
        await apiPost(`/api/instructors/${selectedInstructor.id}/specializations`, {
          specializations: [selectedInstructor.department]
        });
      }

      // 拠点管理者の設定を更新
      for (const locationId of selectedInstructor.facilityLocationIds) {
        const shouldBeManager = selectedInstructor.isManager[locationId] || false;
        
        // 現在の管理者情報を最新の状態で取得
        try {
          const satelliteResponse = await apiGet(`/api/satellites/${locationId}`);
          if (!satelliteResponse.success) {
            console.error(`拠点${locationId}の情報取得に失敗しました`);
            continue;
          }
          
          const satellite = satelliteResponse.data;
          let currentManagerIds = [];
          
          if (satellite.manager_ids) {
            // データの型と内容をログ出力
            console.log('manager_ids の生データ:', satellite.manager_ids);
            console.log('manager_ids の型:', typeof satellite.manager_ids);
            console.log('manager_ids が配列か:', Array.isArray(satellite.manager_ids));
            
            // 既に配列の場合はそのまま使用
            if (Array.isArray(satellite.manager_ids)) {
              currentManagerIds = satellite.manager_ids;
              console.log('既に配列形式です:', currentManagerIds);
            } else if (typeof satellite.manager_ids === 'string') {
              // 文字列の場合はJSONパースを試行
              try {
                const parsed = JSON.parse(satellite.manager_ids);
                // パース結果が配列の場合はそのまま、そうでなければ配列に変換
                currentManagerIds = Array.isArray(parsed) ? parsed : [parsed];
                console.log('文字列からパース成功:', currentManagerIds);
              } catch (e) {
                console.error('管理者IDのパースエラー:', e);
                console.error('パースに失敗したデータ:', satellite.manager_ids);
                currentManagerIds = [];
              }
            } else if (satellite.manager_ids !== null && satellite.manager_ids !== undefined) {
              // その他の型（数値、オブジェクトなど）の場合は配列に変換
              currentManagerIds = [satellite.manager_ids];
              console.log('その他の型を配列に変換:', currentManagerIds);
            } else {
              // null や undefined の場合は空配列
              currentManagerIds = [];
              console.log('null/undefinedのため空配列に設定');
            }
          }
          
          const isCurrentlyManager = currentManagerIds.includes(Number(selectedInstructor.id));
          
          if (shouldBeManager && !isCurrentlyManager) {
            // 管理者として追加
            const updatedManagers = [...currentManagerIds, Number(selectedInstructor.id)];
            console.log(`拠点${locationId}の管理者設定:`, {
              currentManagerIds,
              selectedInstructorId: selectedInstructor.id,
              updatedManagers,
              shouldBeManager,
              isCurrentlyManager
            });
            
            await apiPut(`/api/satellites/${locationId}/managers`, {
              manager_ids: updatedManagers
            });
            
            // ローカル状態も即座に更新
            setSatelliteManagers(prev => ({
              ...prev,
              [locationId]: updatedManagers
            }));
          } else if (!shouldBeManager && isCurrentlyManager) {
            // 管理者から削除（専用エンドポイントを使用）
            await apiDelete(`/api/satellites/${locationId}/managers/${selectedInstructor.id}`);
            
            // ローカル状態も即座に更新
            setSatelliteManagers(prev => ({
              ...prev,
              [locationId]: currentManagerIds.filter(id => id !== Number(selectedInstructor.id))
            }));
          }
        } catch (error) {
          console.error(`拠点${locationId}の管理者更新エラー:`, error);
        }
      }

      // 指導者一覧と拠点情報を再取得
      await fetchInstructors();
      await fetchFacilityLocations();
      
      // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      
      setShowEditForm(false);
      setSelectedInstructor(null);
      
      alert('指導員情報が正常に更新されました。');
    } catch (error) {
      console.error('指導員更新エラー:', error);
      alert(`指導員の更新に失敗しました: ${error.message}`);
    }
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    
    // usernameの場合はリアルタイムチェックを実行
    if (name === 'username') {
      // 既存のタイマーをクリア
      if (usernameCheckTimer) {
        clearTimeout(usernameCheckTimer);
      }
      
      // 新しいタイマーを設定（500ms後にチェック実行）
      const newTimer = setTimeout(() => {
        checkUsernameAvailability(value);
      }, 500);
      setUsernameCheckTimer(newTimer);
    }
    
    setSelectedInstructor(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditLocationChange = (locationId, checked) => {
    setSelectedInstructor(prev => ({
      ...prev,
      facilityLocationIds: checked
        ? [...prev.facilityLocationIds, locationId]
        : prev.facilityLocationIds.filter(id => id !== locationId)
    }));
  };

  const handleManagerChange = (locationId, checked) => {
    setSelectedInstructor(prev => ({
      ...prev,
      isManager: {
        ...prev.isManager,
        [locationId]: checked
      }
    }));
  };

  // 拠点管理者かどうかを判定する関数
  const isSatelliteManager = (instructorId, locationId) => {
    const managerIds = satelliteManagers[locationId];
    const result = managerIds && managerIds.includes(Number(instructorId));
    console.log(`isSatelliteManager(${instructorId}, ${locationId}):`, {
      managerIds,
      instructorId: Number(instructorId),
      result
    });
    return result;
  };

  const handleResetPassword = async (instructorId) => {
    try {
      const tempPassword = generateTempPassword();
      
      await apiPost(`/api/users/${instructorId}/reset-password`, {
        resetType: 'temp',
        tempPassword
      });

      setGeneratedTempPassword(tempPassword);
      setShowTempPasswordDialog(true);
    } catch (error) {
      console.error('パスワードリセットエラー:', error);
      alert(`パスワードリセットに失敗しました: ${error.message}`);
    }
  };

  // 管理者設定/解除の切り替え機能
  const handleToggleManagerStatus = async (instructor) => {
    const isCurrentlyManager = instructor.facilityLocationIds.some(locationId => 
      isSatelliteManager(instructor.id, locationId)
    );
    
    const action = isCurrentlyManager ? '解除' : '設定';
    if (!window.confirm(`指導員「${instructor.name}」の管理者権限を${action}しますか？`)) {
      return;
    }

    try {
      // 各拠点で管理者設定/解除を実行
      for (const locationId of instructor.facilityLocationIds) {
        const currentManagerIds = satelliteManagers[locationId] || [];
        const isManagerInThisLocation = currentManagerIds.includes(Number(instructor.id));
        
        if (isCurrentlyManager && isManagerInThisLocation) {
          // 管理者から削除
          await apiDelete(`/api/satellites/${locationId}/managers/${instructor.id}`);
          
          // ローカル状態も即座に更新
          setSatelliteManagers(prev => ({
            ...prev,
            [locationId]: currentManagerIds.filter(id => id !== Number(instructor.id))
          }));
        } else if (!isCurrentlyManager && !isManagerInThisLocation) {
          // 管理者として追加
          const updatedManagers = [...currentManagerIds, Number(instructor.id)];
          await apiPut(`/api/satellites/${locationId}/managers`, {
            manager_ids: updatedManagers
          });
          
          // ローカル状態も即座に更新
          setSatelliteManagers(prev => ({
            ...prev,
            [locationId]: updatedManagers
          }));
        }
      }
      
      // 指導者一覧を再取得
      await fetchInstructors();
      
      alert(`管理者権限を${action}しました。`);
    } catch (error) {
      console.error('管理者権限切り替えエラー:', error);
      alert(`管理者権限の${action}に失敗しました: ${error.message}`);
    }
  };

  const handleDeleteInstructor = async (instructor) => {
    if (!window.confirm(`指導員「${instructor.name}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      // 指導員を削除
      const result = await apiCall(`/api/users/${instructor.id}`, {
        method: 'DELETE'
      });
      
      if (result.success) {
        // 拠点管理者からも削除
        for (const locationId of instructor.facilityLocationIds) {
          const currentManagers = satelliteManagers[locationId] || [];
          if (currentManagers.includes(Number(instructor.id))) {
            const updatedManagers = currentManagers.filter(id => id !== Number(instructor.id));
            await apiPut(`/api/satellites/${locationId}/managers`, {
              manager_ids: updatedManagers
            });
            
            // ローカル状態も即座に更新
            setSatelliteManagers(prev => ({
              ...prev,
              [locationId]: updatedManagers
            }));
          }
        }
        
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
        
        // 指導者一覧を再取得
        await fetchInstructors();
        
        alert('指導員を削除しました。');
      } else {
        alert(`指導員の削除に失敗しました: ${result.message}`);
      }
    } catch (error) {
      console.error('指導員削除エラー:', error);
      alert(`指導員の削除に失敗しました: ${error.message}`);
    }
  };

  // ローディング状態
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">データを読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">エラーが発生しました</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  // 権限チェック
  if (!hasPermission) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <h2 className="text-2xl font-bold mb-4">閲覧権限がありません</h2>
            <p className="text-gray-600">拠点情報は拠点管理者のみ閲覧できます。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8 pb-4 border-b-2 border-gray-200">
        <h2 className="text-3xl font-bold text-gray-800">指導員管理</h2>
        <button 
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-6 py-3 rounded-lg font-medium transition-all duration-300 hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
          onClick={() => setShowAddForm(true)}
        >
          + 新しい指導員を追加
        </button>
      </div>

      {/* フィルターセクション */}
      <div className="bg-gray-50 rounded-xl p-6 mb-6 shadow-sm">
        <div className="mb-4">
          <input
            type="text"
            placeholder="指導員名、メール、専門分野で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
          />
        </div>

        <div className="flex flex-wrap gap-6 items-end mb-4">
          <div className="flex flex-col min-w-[150px]">
            <label className="font-semibold text-gray-700 mb-2 text-sm">事業所(拠点):</label>
            <select 
              value={facilityLocationFilter} 
              onChange={(e) => {
                setFacilityLocationFilter(e.target.value);
              }}
              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
            >
              <option value="all">全ての事業所(拠点)</option>
              {facilityLocations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>



          <div className="flex flex-col min-w-[150px]">
            <label className="font-semibold text-gray-700 mb-2 text-sm">ステータス:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
            >
              <option value="all">全て</option>
              <option value="active">アクティブ</option>
              <option value="inactive">非アクティブ</option>
            </select>
          </div>

          <button 
            className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-700"
            onClick={() => {
              setSearchTerm('');
              setFacilityLocationFilter('all');
              setShowNoLocationFilter(false);
              setStatusFilter('all');
            }}
          >
            フィルタークリア
          </button>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showNoLocationFilter"
              checked={showNoLocationFilter}
              onChange={(e) => setShowNoLocationFilter(e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="showNoLocationFilter" className="font-semibold text-gray-700 text-sm cursor-pointer">
              拠点未設定の指導員のみ表示
            </label>
          </div>
        </div>

        <div className="font-semibold text-gray-700 text-sm">
          表示中: {getFilteredInstructors().length}名 / 全{instructors.length}名
        </div>
      </div>

      {/* 指導員一覧テーブル */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-red-50">
              <tr>
                                 <th 
                   className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                   onClick={() => handleSort('name')}
                 >
                   👤 指導員名
                   {sortConfig.key === 'name' && (
                     <span className="ml-1">
                       {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                     </span>
                   )}
                 </th>
                 <th 
                   className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                   onClick={() => handleSort('username')}
                 >
                   🔑 ユーザID
                   {sortConfig.key === 'username' && (
                     <span className="ml-1">
                       {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                     </span>
                   )}
                 </th>
                 <th 
                   className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                   onClick={() => handleSort('email')}
                 >
                   📧 メールアドレス
                   {sortConfig.key === 'email' && (
                     <span className="ml-1">
                       {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                     </span>
                   )}
                 </th>
                 <th 
                   className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                   onClick={() => handleSort('department')}
                 >
                   🎯 専門分野
                   {sortConfig.key === 'department' && (
                     <span className="ml-1">
                       {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                     </span>
                   )}
                 </th>

                <th 
                  className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                  onClick={() => handleSort('facilityLocationNames')}
                >
                  🏢 事業所(拠点)
                  {sortConfig.key === 'facilityLocationNames' && (
                    <span className="ml-1">
                      {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
                <th 
                  className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                  onClick={() => handleSort('status')}
                >
                  📊 ステータス
                  {sortConfig.key === 'status' && (
                    <span className="ml-1">
                      {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-red-800">🔐 パスワード</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-red-800">⚙️ 操作</th>
              </tr>
            </thead>
            <tbody>
              {getSortedInstructors().map((instructor, index) => (
                <tr key={instructor.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200 ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                } ${
                  instructor.facilityLocationIds.length === 0 ? 'bg-yellow-50 hover:bg-yellow-100' : ''
                }`}>
                                                       <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div>
                        <strong className="text-gray-800">{instructor.name}</strong>
                        {/* 管理者状態を表示 */}
                        {instructor.facilityLocationIds.some(locationId => 
                          isSatelliteManager(instructor.id, locationId)
                        ) && (
                          <div className="mt-1">
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-semibold">
                              👑 拠点管理者
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                      {instructor.username || '-'}
                    </code>
                  </td>
                   <td className="px-6 py-4 text-gray-600">
                     📧 {instructor.email}
                   </td>
                   <td className="px-6 py-4">
                     <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                       {instructor.department}
                     </span>
                   </td>

                  <td className="px-6 py-4">
                    {instructor.facilityLocationNames && instructor.facilityLocationNames.length > 0 ? (
                      <div className="space-y-1">
                        {instructor.facilityLocationNames.map((name, index) => {
                          const locationId = instructor.facilityLocationIds[index];
                          const isManager = isSatelliteManager(instructor.id, locationId);
                          return (
                            <div key={index} className="flex flex-col">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium block ${
                                isManager ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                              }`}>
                                {isManager && '👑 '}{name}
                              </span>
                              {isManager && (
                                <span className="text-xs text-gray-500 mt-1">(管理者)</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                        ⚠️ 拠点未設定
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      instructor.status === 'active' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {getStatusLabel(instructor.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {instructor.passwordResetRequired ? (
                      <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold">
                        ⚠️ 変更要求
                      </span>
                    ) : (
                      <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold">
                        ✅ 正常
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button 
                        className="bg-orange-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-orange-600"
                        onClick={() => handlePasswordReset(instructor)}
                        title="パスワードリセット"
                      >
                        🔑 リセット
                      </button>
                      <button 
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-blue-600"
                        onClick={() => handleEditInstructor(instructor)}
                        title="編集"
                      >
                        ✏️ 編集
                      </button>
                      {/* 管理者設定/解除ボタン - 拠点管理者の場合のみ表示 */}
                      {instructor.facilityLocationIds.length > 0 && (
                        <button 
                          className={`px-3 py-1 rounded text-sm font-medium transition-colors duration-300 ${
                            instructor.facilityLocationIds.some(locationId => 
                              isSatelliteManager(instructor.id, locationId)
                            )
                              ? 'bg-red-500 text-white hover:bg-red-600'
                              : 'bg-yellow-500 text-white hover:bg-yellow-600'
                          }`}
                          onClick={() => handleToggleManagerStatus(instructor)}
                          title={
                            instructor.facilityLocationIds.some(locationId => 
                              isSatelliteManager(instructor.id, locationId)
                            )
                              ? '管理者権限を解除'
                              : '管理者権限を付与'
                          }
                        >
                          {instructor.facilityLocationIds.some(locationId => 
                            isSatelliteManager(instructor.id, locationId)
                          )
                            ? '👑 管理者解除'
                            : '👑 管理者設定'
                          }
                        </button>
                      )}
                      <button 
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-red-600"
                        onClick={() => handleDeleteInstructor(instructor)}
                        title="削除"
                      >
                        🗑️ 削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

                 {getSortedInstructors().length === 0 && (
           <div className="text-center py-12">
             <p className="text-gray-500 text-lg">
               {instructors.length === 0 
                 ? '指導員が登録されていません。「+ 新しい指導員を追加」ボタンから指導員を追加してください。'
                 : '条件に合致する指導員が見つかりません。'
               }
             </p>
           </div>
         )}
      </div>

      {/* パスワードリセットモーダル */}
      {showPasswordResetModal && selectedInstructor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800">パスワード管理 - {selectedInstructor.name}</h3>
              <button 
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors duration-200"
                onClick={() => setShowPasswordResetModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">一時パスワード発行</h4>
                <p className="text-gray-600 text-sm mb-4">新しい一時パスワードを発行します。指導員は次回ログイン時に新しいパスワードを設定する必要があります。</p>
                <button 
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-blue-600"
                  onClick={() => executePasswordReset('issue_temp_password')}
                >
                  一時パスワードを発行
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">パスワード変更要求</h4>
                <p className="text-gray-600 text-sm mb-4">指導員に次回ログイン時のパスワード変更を要求します。現在のパスワードは無効になりません。</p>
                <button 
                  className="bg-orange-500 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-orange-600"
                  onClick={() => executePasswordReset('require_password_change')}
                >
                  パスワード変更を要求
                </button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-2">現在の状況</h4>
              <p className="text-blue-700 text-sm">
                パスワードリセット要求: {selectedInstructor.passwordResetRequired ? 'あり' : 'なし'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 一時パスワードダイアログ */}
      {showTempPasswordDialog && selectedInstructor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-800 mb-4">一時パスワード発行完了</h3>
              <p className="text-gray-600 mb-6">
                指導員 <strong>{selectedInstructor.name}</strong> の一時パスワードを発行しました。
              </p>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">一時パスワード:</label>
                <div className="relative">
                  <input
                    type="text"
                    value={generatedTempPassword}
                    readOnly
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 font-mono text-lg text-center"
                  />
                  <button
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-200 hover:bg-gray-300 p-2 rounded transition-colors duration-200"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(generatedTempPassword);
                        alert('パスワードをクリップボードにコピーしました！');
                      } catch (error) {
                        console.error('クリップボードへのコピーに失敗しました:', error);
                        alert('クリップボードへのコピーに失敗しました。手動でコピーしてください。');
                      }
                    }}
                    title="コピー"
                  >
                    📋
                  </button>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-yellow-800 text-sm">
                  <strong>注意:</strong> このパスワードは一度だけ表示されます。指導員に安全に伝達してください。
                </p>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-blue-600"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedTempPassword);
                      alert('パスワードをクリップボードにコピーしました！');
                      setShowTempPasswordDialog(false);
                      setSelectedInstructor(null);
                    } catch (error) {
                      console.error('クリップボードへのコピーに失敗しました:', error);
                      alert('クリップボードへのコピーに失敗しました。手動でコピーしてください。');
                    }
                  }}
                >
                  コピーして閉じる
                </button>
                <button
                  className="bg-gray-500 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-600"
                  onClick={() => {
                    setShowTempPasswordDialog(false);
                    setSelectedInstructor(null);
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 指導員追加フォームモーダル */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">新しい指導員を追加</h3>
              <button 
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors duration-200"
                onClick={() => {
                  setShowAddForm(false);
                  setModalError(null);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {/* エラー表示 */}
              <ModalErrorDisplay 
                error={modalError} 
                onClose={() => setModalError(null)} 
              />
              
              <form onSubmit={handleAddInstructor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">指導員名: <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="name"
                  value={newInstructor.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ユーザID: <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    value={newInstructor.username}
                    onChange={handleInputChange}
                    required
                    pattern="[a-zA-Z0-9_/.-]+"
                    title="半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使用可能です"
                    placeholder="例: instructor001"
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none transition-colors duration-300 ${
                      usernameValidation.isValid === true 
                        ? 'border-green-400 focus:border-green-500' 
                        : usernameValidation.isValid === false 
                        ? 'border-red-400 focus:border-red-500' 
                        : 'border-gray-200 focus:border-indigo-400'
                    }`}
                  />
                  {usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                    </div>
                  )}
                  {usernameValidation.isValid === true && !usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {usernameValidation.isValid === false && !usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">使用可能文字: 半角英数字、アンダースコア(_)、ハイフン(-)、スラッシュ(/)、ドット(.)</p>
                
                {/* バリデーションメッセージ */}
                {usernameValidation.message && (
                  <div className={`mt-2 text-sm ${
                    usernameValidation.isValid === true 
                      ? 'text-green-600' 
                      : usernameValidation.isValid === false 
                      ? 'text-red-600' 
                      : 'text-gray-600'
                  }`}>
                    {usernameValidation.message}
                  </div>
                )}
                
                {/* 候補表示 */}
                {usernameValidation.suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 mb-1">利用可能な候補:</p>
                    <div className="flex flex-wrap gap-2">
                      {usernameValidation.suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setNewInstructor(prev => ({ ...prev, username: suggestion }));
                            checkUsernameAvailability(suggestion);
                          }}
                          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">メールアドレス: <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  name="email"
                  value={newInstructor.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">専門分野: <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="department"
                  value={newInstructor.department}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
                              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">企業: <span className="text-red-500">*</span></label>
                  <select
                    name="company_id"
                    value={newInstructor.company_id}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                  >
                    <option value="">選択してください</option>
                    {companies && companies.length > 0 ? (
                      companies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>企業データが読み込まれていません</option>
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">企業数: {companies ? companies.length : 0}</p>
                </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">事業所(拠点): <span className="text-red-500">*</span></label>
                {!newInstructor.company_id ? (
                  <p className="text-sm text-gray-500">まず企業を選択してください</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto border-2 border-gray-200 rounded-lg p-2">
                    {getFilteredLocations().map(location => (
                        <div key={location.id} className="p-2 hover:bg-gray-50 rounded">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              name="facilityLocationIds"
                              value={location.id}
                              checked={newInstructor.facilityLocationIds.includes(location.id)}
                              onChange={(e) => {
                                const { value, checked } = e.target;
                                setNewInstructor(prev => ({
                                  ...prev,
                                  facilityLocationIds: checked
                                    ? [...prev.facilityLocationIds, value]
                                    : prev.facilityLocationIds.filter(id => id !== value)
                                }));
                              }}
                              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-gray-800">{location.name}</div>
                              <div className="text-xs text-gray-500">{location.organizationName} - {location.type}</div>
                            </div>
                          </label>
                          {newInstructor.facilityLocationIds.includes(location.id) && (
                            <div className="ml-7 mt-2">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newInstructor.managerSettings[location.id] || false}
                                  onChange={(e) => {
                                    setNewInstructor(prev => ({
                                      ...prev,
                                      managerSettings: {
                                        ...prev.managerSettings,
                                        [location.id]: e.target.checked
                                      }
                                    }));
                                  }}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2"
                                />
                                <span className="text-sm text-gray-600">この拠点の管理者にする</span>
                              </label>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">複数の拠点を選択できます（必須）</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">初期パスワード: <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  name="password"
                  value={newInstructor.password}
                  onChange={handleInputChange}
                  required
                  minLength="6"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
                <p className="text-xs text-gray-500 mt-1">6文字以上で入力してください</p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-600"
                >
                  追加
                </button>
                <button
                  type="button"
                  className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-600"
                  onClick={() => setShowAddForm(false)}
                >
                  キャンセル
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {/* 指導員編集フォームモーダル */}
      {showEditForm && selectedInstructor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-800">指導員情報を編集</h3>
              <button 
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors duration-200"
                onClick={() => {
                  setShowEditForm(false);
                  setSelectedInstructor(null);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <form onSubmit={handleUpdateInstructor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">指導員名: <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="name"
                  value={selectedInstructor.name}
                  onChange={handleEditInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ユーザID: <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="text"
                    name="username"
                    value={selectedInstructor.username}
                    onChange={handleEditInputChange}
                    required
                    pattern="[a-zA-Z0-9_/.-]+"
                    title="半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使用可能です"
                    placeholder="例: instructor001"
                    className={`w-full px-4 py-3 border-2 rounded-lg focus:outline-none transition-colors duration-300 ${
                      usernameValidation.isValid === true 
                        ? 'border-green-400 focus:border-green-500' 
                        : usernameValidation.isValid === false 
                        ? 'border-red-400 focus:border-red-500' 
                        : 'border-gray-200 focus:border-indigo-400'
                    }`}
                  />
                  {usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                    </div>
                  )}
                  {usernameValidation.isValid === true && !usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {usernameValidation.isValid === false && !usernameValidation.isChecking && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">使用可能文字: 半角英数字、アンダースコア(_)、ハイフン(-)、スラッシュ(/)、ドット(.)</p>
                
                {/* バリデーションメッセージ */}
                {usernameValidation.message && (
                  <div className={`mt-2 text-sm ${
                    usernameValidation.isValid === true 
                      ? 'text-green-600' 
                      : usernameValidation.isValid === false 
                      ? 'text-red-600' 
                      : 'text-gray-600'
                  }`}>
                    {usernameValidation.message}
                  </div>
                )}
                
                {/* 候補表示 */}
                {usernameValidation.suggestions.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 mb-1">利用可能な候補:</p>
                    <div className="flex flex-wrap gap-2">
                      {usernameValidation.suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setSelectedInstructor(prev => ({ ...prev, username: suggestion }));
                            checkUsernameAvailability(suggestion);
                          }}
                          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">メールアドレス: <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  name="email"
                  value={selectedInstructor.email}
                  onChange={handleEditInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">専門分野: <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="department"
                  value={selectedInstructor.department}
                  onChange={handleEditInputChange}
                  required
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">企業:</label>
                <select
                  name="company_id"
                  value={selectedInstructor.company_id}
                  onChange={handleEditInputChange}
                  disabled={selectedInstructor.role >= 4 && selectedInstructor.role <= 5}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">選択してください</option>
                  {companies.map(company => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>

              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">事業所(拠点):</label>
                <div className="max-h-40 overflow-y-auto border-2 border-gray-200 rounded-lg p-2">
                  {facilityLocations.map(location => {
                    const isManager = isSatelliteManager(selectedInstructor.id, location.id);
                    const isSelected = selectedInstructor.facilityLocationIds.includes(location.id);
                    return (
                      <div key={location.id} className="p-2 hover:bg-gray-50 rounded">
                        <label className="flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            name="facilityLocationIds"
                            value={location.id}
                            checked={isSelected}
                            onChange={(e) => handleEditLocationChange(location.id, e.target.checked)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-3"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-800">
                              {isManager && '👑 '}{location.name}
                            </div>
                            <div className="text-xs text-gray-500">{location.organizationName} - {location.type}</div>
                          </div>
                        </label>
                        {isSelected && (
                          <div className="mt-2 ml-7">
                            <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedInstructor.isManager[location.id] || false}
                                onChange={(e) => handleManagerChange(location.id, e.target.checked)}
                                className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500 mr-2"
                              />
                              <span className="text-sm text-gray-700">👑 この拠点の管理者にする</span>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 mt-1">👑 マークは拠点管理者を示します</p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-blue-600"
                >
                  更新
                </button>
                <button
                  type="button"
                  className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-600"
                  onClick={() => {
                    setShowEditForm(false);
                    setSelectedInstructor(null);
                  }}
                >
                  キャンセル
                </button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstructorManagement; 