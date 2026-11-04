import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../../utils/api';
import { getCurrentUserSatelliteId } from '../../utils/locationUtils';
import { useAuth } from '../contexts/AuthContext';

const TodayActiveModal = ({ 
  isOpen, 
  onClose, 
  students, 
  selectedStudents, 
  onStudentsUpdate,
  onSelectStudents 
}) => {
  const { currentUser } = useAuth();
  // 基本状態管理
  const [tempPasswordUsers, setTempPasswordUsers] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [selectedInstructors, setSelectedInstructors] = useState([]);
  const [expiryTime, setExpiryTime] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [tempPasswordLoading, setTempPasswordLoading] = useState(false);
  const [expiryTimeError, setExpiryTimeError] = useState('');

  // 有効期限のバリデーション（現在時刻より前の時間をチェック）
  const validateExpiryTime = (timeString) => {
    if (!timeString || timeString.trim() === '') {
      setExpiryTimeError('');
      return true;
    }

    // HH:MM形式の検証
    const timePattern = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    if (!timePattern.test(timeString)) {
      setExpiryTimeError('正しい時間形式を入力してください（HH:MM形式）');
      return false;
    }

    // 現在の日本時間を取得（時と分のみ）
    const now = new Date();
    const japanTimeString = now.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [currentHours, currentMinutes] = japanTimeString.split(':').map(Number);

    // 入力された時間を取得
    const [hours, minutes] = timeString.split(':').map(Number);

    // 現在時刻（時:分）と入力時刻（時:分）を比較
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;
    const inputTimeInMinutes = hours * 60 + minutes;

    // 現在時刻より前または同じ時間の場合はエラー
    if (inputTimeInMinutes <= currentTimeInMinutes) {
      setExpiryTimeError('現在時刻より後の時間を入力してください');
      return false;
    }

    setExpiryTimeError('');
    return true;
  };

  // 有効期限入力のハンドラー
  const handleExpiryTimeChange = (e) => {
    const value = e.target.value;
    setExpiryTime(value);
    validateExpiryTime(value);
  };

  
  // モーダルが開かれた時の初期化
  useEffect(() => {
    if (isOpen) {
      initializeModal();
    }
  }, [isOpen]);

  // selectedInstructorsが変更された時に一時パスワード対象利用者を再取得
  useEffect(() => {
    if (isOpen) {
      fetchTempPasswordUsers();
    }
  }, [selectedInstructors, isOpen]);

  // モーダル初期化
  const initializeModal = async () => {
    try {
      setTempPasswordLoading(true);
      
      // 指導員一覧を取得（自分自身を除外）
      const currentSatelliteId = getCurrentUserSatelliteId(currentUser);
      const instructorParams = new URLSearchParams();
      if (currentSatelliteId) {
        instructorParams.append('satellite_id', currentSatelliteId);
      }
      const instructorResponse = await apiGet(`/api/temp-passwords/instructors?${instructorParams}`);
      console.log('指導員一覧取得レスポンス:', instructorResponse);
      
      if (instructorResponse.success) {
        // バックエンドで既に自分自身を除外しているため、フロントエンドでのフィルタリングは不要
        console.log('取得した指導員数:', instructorResponse.data.length);
        setInstructors(instructorResponse.data);
      } else {
        console.error('指導員一覧取得失敗:', instructorResponse);
        alert('指導員一覧の取得に失敗しました: ' + (instructorResponse.message || '不明なエラー'));
      }
      
      // 一時パスワード対象利用者を取得
      await fetchTempPasswordUsers();
      
    } catch (error) {
      console.error('一時パスワード機能初期化エラー:', error);
      alert('一時パスワード機能の初期化に失敗しました。');
    } finally {
      setTempPasswordLoading(false);
    }
  };

  // 一時パスワード対象利用者を取得
  const fetchTempPasswordUsers = async () => {
    try {
      const params = new URLSearchParams();
      
      // 現在選択中の拠点IDを取得して追加
      let currentSatelliteId = getCurrentUserSatelliteId(currentUser);
      console.log('=== TodayActiveModal fetchTempPasswordUsers デバッグ ===');
      console.log('currentUser:', currentUser);
      console.log('currentSatelliteId (初回取得):', currentSatelliteId);
      
      // 拠点IDが取得できない場合、セッションストレージから直接取得を試みる
      if (!currentSatelliteId) {
        try {
          const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
          if (sessionSelectedSatellite) {
            const satelliteData = JSON.parse(sessionSelectedSatellite);
            if (satelliteData && satelliteData.id) {
              currentSatelliteId = parseInt(satelliteData.id);
              console.log('セッションストレージから拠点IDを取得:', currentSatelliteId);
            }
          }
        } catch (error) {
          console.error('セッションストレージからの拠点ID取得エラー:', error);
        }
      }
      
      // まだ取得できていない場合、ユーザーの所属拠点から最初の拠点を使用
      if (!currentSatelliteId && currentUser && currentUser.satellite_ids) {
        try {
          let satelliteIds = currentUser.satellite_ids;
          if (typeof satelliteIds === 'string') {
            satelliteIds = JSON.parse(satelliteIds);
          }
          if (Array.isArray(satelliteIds) && satelliteIds.length > 0) {
            currentSatelliteId = parseInt(satelliteIds[0]);
            console.log('ユーザーの所属拠点から最初の拠点IDを使用:', currentSatelliteId);
          }
        } catch (error) {
          console.error('ユーザーの所属拠点からの取得エラー:', error);
        }
      }
      
      console.log('最終的なcurrentSatelliteId:', currentSatelliteId);
      console.log('selectedInstructors:', selectedInstructors);
      
      if (currentSatelliteId) {
        params.append('satellite_id', currentSatelliteId);
        console.log('satellite_id パラメータを追加:', currentSatelliteId);
      } else {
        console.log('satellite_id が取得できませんでした');
      }
      
      if (selectedInstructors.length > 0) {
        selectedInstructors.forEach(instructorId => {
          params.append('selected_instructor_ids', instructorId);
        });
        console.log('selected_instructor_ids パラメータを追加:', selectedInstructors);
      }
      
      console.log('送信するパラメータ:', params.toString());
      const response = await apiGet(`/api/temp-passwords/users?${params}`);
      
      console.log('一時パスワード対象利用者取得レスポンス:', response);
      console.log('取得した利用者数:', response.data?.length || 0);
      console.log('利用者データ詳細:', response.data);
      
      if (response.success) {
        setTempPasswordUsers(response.data);
        // 全選択状態でスタート
        const allSelected = response.data.map(user => user.id);
        onSelectStudents(allSelected);
      } else {
        console.error('一時パスワード対象利用者取得失敗:', response);
        setTempPasswordUsers([]);
      }
    } catch (error) {
      console.error('一時パスワード対象利用者取得エラー:', error);
    }
  };

  // ユーザータイプに応じた表示名を取得
  const getUserTypeLabel = (userType) => {
    switch (userType) {
      case 'my_user':
        return '自分の担当利用者';
      case 'no_instructor_no_temp':
        return '担当なし・パスワード未発行';
      case 'selected_instructor':
        return '選択指導員の担当利用者';
      case 'other_instructor':
        return 'その他の担当者の利用者';
      default:
        return 'その他';
    }
  };

  // 一時パスワード発行実行
  const sendTodayActiveEmails = async () => {
    if (selectedStudents.length === 0) {
      alert('一時パスワード発行対象の利用者を選択してください。');
      return;
    }

    // 有効期限のバリデーション
    if (expiryTime && !validateExpiryTime(expiryTime)) {
      alert('有効期限の入力内容を確認してください。');
      return;
    }
    
    try {
      setTempPasswordLoading(true);
      const requestData = {
        user_ids: selectedStudents,
        expiry_time: expiryTime || null,
        announcement_title: announcementTitle || null,
        announcement_message: announcementMessage || null
      };

      const response = await apiPost('/api/temp-passwords/issue', requestData);
      
      if (response.success) {
        alert(`${selectedStudents.length}名の利用者に一時パスワードを発行しました。`);
        
        // 利用者一覧を更新
        onStudentsUpdate();
        
        // モーダルを閉じて状態をリセット
        handleClose();
      } else {
        alert('一時パスワードの発行に失敗しました。');
      }
    } catch (error) {
      console.error('一時パスワード発行エラー:', error);
      alert('一時パスワードの発行に失敗しました。');
    } finally {
      setTempPasswordLoading(false);
    }
  };



  // モーダルを閉じる
  const handleClose = () => {
    setExpiryTime('');
    setExpiryTimeError('');
    setAnnouncementTitle('');
    setAnnouncementMessage('');
    // 選択された指導員の状態は保持する（ユーザビリティ向上のため）
    // setSelectedInstructors([]);
    onClose();
  };

  // 全選択/全解除
  const toggleAllUsers = () => {
    if (selectedStudents.length === tempPasswordUsers.length) {
      onSelectStudents([]);
    } else {
      onSelectStudents(tempPasswordUsers.map(user => user.id));
    }
  };

  // 個別選択/選択解除
  const toggleUserSelection = (userId) => {
    const newSelected = selectedStudents.includes(userId)
      ? selectedStudents.filter(id => id !== userId)
      : [...selectedStudents, userId];
    onSelectStudents(newSelected);
  };

  // 指導員選択/選択解除
  const toggleInstructorSelection = (instructorId) => {
    const newSelected = selectedInstructors.includes(instructorId)
      ? selectedInstructors.filter(id => id !== instructorId)
      : [...selectedInstructors, instructorId];
    
    setSelectedInstructors(newSelected);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
                     <div className="flex items-center justify-between">
             <h3 className="text-2xl font-bold text-gray-800">
               🔑 本日有効 - 一時パスワード発行
             </h3>
            <button 
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </div>
        
                          <div className="p-6 space-y-8">
             <>
                               {/* 別担当者選択 */}
                <div className="bg-white p-6 rounded-lg shadow">
                  <h4 className="text-lg font-semibold mb-4">別担当者選択（オプション）</h4>
                                     <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto">
                     {instructors.map((instructor, index) => (
                       <button
                         key={`instructor-${instructor.id}-${index}`}
                         onClick={() => toggleInstructorSelection(instructor.id)}
                         className={`px-4 py-2 rounded-lg border transition-all duration-200 min-w-0 flex-1 basis-64 text-left ${
                           selectedInstructors.includes(instructor.id)
                             ? 'bg-blue-500 text-white border-blue-500 hover:bg-blue-600'
                             : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                         }`}
                       >
                         <div className="font-medium truncate">{instructor.name}</div>
                         <div className={`text-sm truncate ${
                           selectedInstructors.includes(instructor.id)
                             ? 'text-blue-100'
                             : 'text-gray-600'
                         }`}>
                           {instructor.company_name} {instructor.satellite_name ? `/ ${instructor.satellite_name}` : ''}
                         </div>
                       </button>
                     ))}
                   </div>
                  <p className="text-sm text-gray-600 mt-2">
                    選択すると、その指導員のパスワード未発行担当利用者もリストに追加されます
                  </p>
                </div>

              {/* 利用者選択 */}
              <div className="bg-white p-6 rounded-lg shadow">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-semibold">利用者選択</h4>
                  <button
                    onClick={toggleAllUsers}
                    className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                  >
                    {selectedStudents.length === tempPasswordUsers.length ? '全解除' : '全選択'}
                  </button>
                </div>

                {tempPasswordLoading ? (
                  <div className="text-center py-4">読み込み中...</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {tempPasswordUsers.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">利用者が見つかりません</div>
                    ) : (
                      tempPasswordUsers.map((user, index) => (
                      <div key={`${user.id}-${user.user_type}-${index}`} className="flex items-center p-3 border rounded hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-gray-600">
                            {user.company_name} / {user.satellite_name}
                          </div>
                          <div className="text-xs text-blue-600">
                            {getUserTypeLabel(user.user_type)}
                          </div>
                        </div>
                      </div>
                    )))
                    }
                  </div>
                )}
              </div>

              {/* 有効期限設定 */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h4 className="text-lg font-semibold mb-4">有効期限設定（オプション）</h4>
                <div className="flex items-center space-x-4">
                  <input
                    type="text"
                    value={expiryTime}
                    onChange={handleExpiryTimeChange}
                    placeholder="HH:MM（例：23:59）"
                    pattern="^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$"
                    className={`p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      expiryTimeError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  <span className="text-gray-600">まで有効</span>
                </div>
                {expiryTimeError && (
                  <p className="text-sm text-red-600 mt-2">
                    {expiryTimeError}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-2">
                  指定なしの場合は日本時間23:59まで有効です（HH:MM形式で入力してください。現在時刻より後の時間を選択してください）
                </p>
              </div>

              {/* アナウンスメッセージ */}
              <div className="bg-white p-6 rounded-lg shadow">
                <h4 className="text-lg font-semibold mb-4">アナウンスメッセージ（オプション）</h4>
                <input
                  type="text"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="アナウンスタイトル"
                  className="w-full p-2 border border-gray-300 rounded mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <textarea
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="アナウンスメッセージ"
                  rows="4"
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-600 mt-2">
                  選択された利用者のダッシュボードで閲覧できるアナウンスメッセージを一括送信します
                </p>
              </div>
                         </>

          {/* アクションボタン */}
          <div className="flex gap-4 pt-6 border-t border-gray-200">
            <button 
              className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
              onClick={handleClose}
            >
              キャンセル
            </button>
                         <button 
               className="flex-1 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
               onClick={sendTodayActiveEmails}
               disabled={tempPasswordLoading || selectedStudents.length === 0}
             >
               {tempPasswordLoading 
                 ? '処理中...' 
                 : `${selectedStudents.length}名に一時パスワードを発行`
               }
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodayActiveModal;
