import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDailyAttendance } from '../../utils/api';
import { getCurrentUser } from '../../utils/userContext';
import { formatUTCToJSTTimeOnly } from '../../utils/dateUtils';
import AttendanceEditModal from '../modals/AttendanceEditModal';

const AttendanceTab = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSatellite, setCurrentSatellite] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
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
        }
      } else {
        // ユーザー情報から拠点を取得
        getCurrentUser().then(user => {
          if (user && user.satellite_id) {
            setCurrentSatellite({
              id: user.satellite_id,
              name: user.satellite_name
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

  // 勤怠データを取得
  useEffect(() => {
    if (currentSatellite && currentSatellite.id) {
      fetchAttendanceData();
    }
  }, [selectedDate, currentSatellite]);

  const fetchAttendanceData = async () => {
    if (!currentSatellite || !currentSatellite.id) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await getDailyAttendance(currentSatellite.id, selectedDate);
      
      if (response.success) {
        // UTC時刻をJST時刻に変換して表示用データを作成
        const convertedData = (response.data || []).map(record => {
          const hours = Math.floor(record.workingMinutes / 60);
          const minutes = record.workingMinutes % 60;
          const workingTimeDisplay = record.workingMinutes > 0 
            ? minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`
            : '0時間';
          
          return {
            ...record,
            startTime: record.startTimeUTC ? formatUTCToJSTTimeOnly(record.startTimeUTC) : null,
            endTime: record.endTimeUTC ? formatUTCToJSTTimeOnly(record.endTimeUTC) : null,
            breakStartTime: record.breakStartTimeUTC ? formatUTCToJSTTimeOnly(record.breakStartTimeUTC) : null,
            breakEndTime: record.breakEndTimeUTC ? formatUTCToJSTTimeOnly(record.breakEndTimeUTC) : null,
            workingTimeDisplay: workingTimeDisplay
          };
        });
        setAttendanceData(convertedData);
      } else {
        setError(response.message || '勤怠データの取得に失敗しました');
      }
    } catch (err) {
      console.error('勤怠データ取得エラー:', err);
      setError('勤怠データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (record) => {
    setSelectedRecord(record);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedRecord(null);
    fetchAttendanceData(); // データを再取得
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      '通所': { bg: 'bg-blue-100', text: 'text-blue-800' },
      '業務終了': { bg: 'bg-green-100', text: 'text-green-800' },
      '作業中': { bg: 'bg-green-100', text: 'text-green-800' },
      '休憩中': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      '未開始': { bg: 'bg-red-100', text: 'text-red-800' }
    };

    const config = statusConfig[status] || statusConfig['未開始'];

    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${config.bg} ${config.text}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">⏰ 在宅勤怠管理(日時)</h2>
            <p className="text-lg text-gray-600">在宅支援利用者の勤怠状況を管理できます</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => navigateWithLocation('/instructor/home-support/monthly-attendance')}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              月次勤怠管理
            </button>
          </div>
        </div>

        {/* 日付選択 */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <button 
            onClick={() => {
              const date = new Date(selectedDate);
              date.setDate(date.getDate() - 1);
              setSelectedDate(date.toISOString().split('T')[0]);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            ← 前日
          </button>
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-gray-700"
            />
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              今日
            </button>
          </div>
          <button 
            onClick={() => {
              const date = new Date(selectedDate);
              date.setDate(date.getDate() + 1);
              setSelectedDate(date.toISOString().split('T')[0]);
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            翌日 →
          </button>
        </div>

        {/* 選択日付の表示 */}
        <div className="mb-4 text-center">
          <p className="text-lg font-semibold text-gray-700">
            📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'short'
            })}
          </p>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* 勤怠一覧テーブル */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">データを読み込み中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名前
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    受給者証
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    開始時間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    終了時間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    休憩開始
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    休憩終了
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    勤務時間
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状態
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceData.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                      データがありません
                    </td>
                  </tr>
                ) : (
                  attendanceData.map((record, index) => (
                    <tr key={record.userId} className={index % 2 === 0 ? "hover:bg-gray-50" : "hover:bg-gray-50 bg-gray-50"}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {record.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {record.recipientCertificateId}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {record.startTime || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {record.endTime || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {record.breakStartTime || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {record.breakEndTime || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {record.workingTimeDisplay}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(record.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleEditClick(record)}
                          className="text-white text-sm px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                        >
                          修正
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* 修正モーダル */}
        <AttendanceEditModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedRecord(null);
          }}
          record={selectedRecord}
          date={selectedDate}
          onSuccess={handleEditSuccess}
        />
      </div>
    </div>
  );
};

export default AttendanceTab;