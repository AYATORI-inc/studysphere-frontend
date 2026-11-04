import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSatelliteEvaluationStatus } from '../../utils/api';
import { getCurrentUser } from '../../utils/userContext';

const EvaluationsTab = ({ 
  handleDailySupportRecordClick 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [evaluationUsers, setEvaluationUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentSatellite, setCurrentSatellite] = useState(null);
  const navigate = useNavigate();

  // 編集ページへの遷移時に拠点情報を保存するヘルパー関数
  const navigateWithLocation = (path) => {
    if (currentSatellite) {
      sessionStorage.setItem('selectedSatellite', JSON.stringify(currentSatellite));
    }
    navigate(path);
  };

  // 拠点情報を取得
  useEffect(() => {
    const loadSatellite = () => {
      const savedSatellite = sessionStorage.getItem('selectedSatellite');
      if (savedSatellite) {
        try {
          const satellite = JSON.parse(savedSatellite);
          setCurrentSatellite(satellite);
        } catch (e) {
          console.error('拠点情報のパースエラー:', e);
          // フォールバック: getCurrentUserから取得
          getCurrentUser().then(user => {
            if (user && user.satellite_id) {
              setCurrentSatellite({
                id: user.satellite_id,
                name: user.satellite_name
              });
            } else if (user?.satellite_ids && user.satellite_ids.length > 0) {
              let firstSatelliteId;
              if (Array.isArray(user.satellite_ids)) {
                firstSatelliteId = user.satellite_ids[0];
              } else if (typeof user.satellite_ids === 'string') {
                try {
                  const parsed = JSON.parse(user.satellite_ids);
                  firstSatelliteId = Array.isArray(parsed) ? parsed[0] : parsed;
                } catch (error) {
                  console.error('satellite_idsパースエラー:', error);
                  firstSatelliteId = user.satellite_ids;
                }
              } else {
                firstSatelliteId = user.satellite_ids;
              }
              setCurrentSatellite({
                id: firstSatelliteId,
                name: '現在の拠点'
              });
            }
          });
        }
      } else {
        // ユーザー情報から拠点を取得
        getCurrentUser().then(user => {
          if (user && user.satellite_id) {
            setCurrentSatellite({
              id: user.satellite_id,
              name: user.satellite_name
            });
          } else if (user?.satellite_ids && user.satellite_ids.length > 0) {
            let firstSatelliteId;
            if (Array.isArray(user.satellite_ids)) {
              firstSatelliteId = user.satellite_ids[0];
            } else if (typeof user.satellite_ids === 'string') {
              try {
                const parsed = JSON.parse(user.satellite_ids);
                firstSatelliteId = Array.isArray(parsed) ? parsed[0] : parsed;
              } catch (error) {
                console.error('satellite_idsパースエラー:', error);
                firstSatelliteId = user.satellite_ids;
              }
            } else {
              firstSatelliteId = user.satellite_ids;
            }
            setCurrentSatellite({
              id: firstSatelliteId,
              name: '現在の拠点'
            });
          }
        });
      }
    };

    loadSatellite();

    // 拠点変更イベントを監視（newLocation と satellite の両方に対応）
    const handleSatelliteChanged = (e) => {
      const newLocation = e.detail?.newLocation || e.detail?.satellite;
      if (newLocation) {
        setCurrentSatellite(newLocation);
      }
    };

    window.addEventListener('satelliteChanged', handleSatelliteChanged);
    return () => {
      window.removeEventListener('satelliteChanged', handleSatelliteChanged);
    };
  }, []);

  // 評価データをAPIから取得
  useEffect(() => {
    if (!currentSatellite || !currentSatellite.id) return;

    const fetchEvaluationStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const satelliteId = currentSatellite.id;
        console.log('評価状況を取得中...', { satelliteId });
        const response = await getSatelliteEvaluationStatus(satelliteId);
        
        if (response.success && response.data) {
          setEvaluationUsers(response.data);
        } else {
          throw new Error(response.message || '評価状況の取得に失敗しました');
        }
      } catch (err) {
        console.error('評価状況の取得エラー:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluationStatus();
  }, [currentSatellite]);

  // ソート機能
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // フィルタリングとソート
  const getFilteredAndSortedUsers = () => {
    let filteredUsers = [...evaluationUsers];

    // 検索フィルタリング
    if (searchTerm) {
      filteredUsers = filteredUsers.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.recipientNumber.includes(searchTerm)
      );
    }

    // ソート
    if (sortConfig.key) {
      filteredUsers.sort((a, b) => {
        let aValue, bValue;
        
        if (sortConfig.key === 'name') {
          aValue = a.name;
          bValue = b.name;
        } else if (sortConfig.key === 'recipientNumber') {
          aValue = a.recipientNumber;
          bValue = b.recipientNumber;
        } else if (sortConfig.key === 'daily') {
          aValue = a.dailyPriority;
          bValue = b.dailyPriority;
        } else if (sortConfig.key === 'weekly') {
          aValue = a.weeklyPriority;
          bValue = b.weeklyPriority;
        } else if (sortConfig.key === 'monthly') {
          aValue = a.monthlyPriority;
          bValue = b.monthlyPriority;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return filteredUsers;
  };

  // ソートアイコンの表示
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return '⇅';
    }
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">📋 評価記録</h2>
            <p className="text-lg text-gray-600">利用者別の評価状況を管理します</p>
          </div>
        </div>

        {/* 検索バー */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="利用者名または受給者証番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-3.5 text-gray-400">🔍</span>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* 利用者別評価状況 */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">👥 利用者別評価状況</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-2">
                      利用者
                      <span className="text-xs">{getSortIcon('name')}</span>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('recipientNumber')}
                  >
                    <div className="flex items-center gap-2">
                      受給者証
                      <span className="text-xs">{getSortIcon('recipientNumber')}</span>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('daily')}
                  >
                    <div className="flex items-center gap-2">
                      日次評価
                      <span className="text-xs">{getSortIcon('daily')}</span>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('weekly')}
                  >
                    <div className="flex items-center gap-2">
                      週次評価
                      <span className="text-xs">{getSortIcon('weekly')}</span>
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('monthly')}
                  >
                    <div className="flex items-center gap-2">
                      月次評価
                      <span className="text-xs">{getSortIcon('monthly')}</span>
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    確認
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        <span className="ml-3">評価状況を読み込み中...</span>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-red-500">
                      <div className="flex flex-col items-center">
                        <span className="text-xl mb-2">⚠️</span>
                        <span>{error}</span>
                      </div>
                    </td>
                  </tr>
                ) : getFilteredAndSortedUsers().length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                      {searchTerm ? '検索結果がありません' : '評価対象の利用者がいません'}
                    </td>
                  </tr>
                ) : (
                  getFilteredAndSortedUsers().map((user, index) => (
                    <tr key={user.id} className={`hover:bg-gray-50 ${index % 2 === 1 ? 'bg-gray-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.recipientNumber}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.dailyStatus === '未完了' ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            📝 未完了
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ 完了
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.weeklyStatus === '-' ? (
                          <div className="text-sm text-gray-500">-</div>
                        ) : user.weeklyStatus === '未完了' ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            📝 未完了
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ 完了
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.monthlyStatus === '-' ? (
                          <div className="text-sm text-gray-500">-</div>
                        ) : user.monthlyStatus === '未完了' ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            📝 未完了
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ 完了
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => handleDailySupportRecordClick({
                              id: user.id,
                              name: user.name,
                              recipientNumber: user.recipientNumber
                            })}
                            className="text-white text-sm px-3 py-1 rounded bg-green-600 hover:bg-green-700 transition-colors duration-200"
                          >
                            📝 支援記録
                          </button>
                          {user.weeklyStatus === '未完了' && (
                            <button 
                              onClick={() => navigateWithLocation(`/instructor/home-support/weekly-evaluation/${user.id}`)}
                              className="text-white text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                            >
                              📊 評価(週次)
                            </button>
                          )}
                          {user.monthlyStatus === '未完了' && (
                            <button 
                              onClick={() => navigateWithLocation(`/instructor/home-support/monthly-evaluation/${user.id}`)}
                              className="text-white text-sm px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 transition-colors duration-200"
                            >
                              📈 達成度評価
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => navigateWithLocation(`/instructor/home-support/records/${user.id}`)}
                            className="text-white text-sm px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 transition-colors duration-200"
                          >
                            🔍 過去の記録確認
                          </button>
                          <button 
                            onClick={() => navigateWithLocation(`/instructor/home-support/monthly-evaluation-history/${user.id}`)}
                            className="text-white text-sm px-3 py-1 rounded bg-purple-600 hover:bg-purple-700 transition-colors duration-200"
                          >
                            📊 達成度履歴確認
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationsTab;