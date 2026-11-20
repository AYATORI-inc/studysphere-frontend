import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import DailySupportRecordModal from '../components/DailySupportRecordModal';
import UserDetailModal from '../components/modals/UserDetailModal';
import UserInputModal from '../components/modals/UserInputModal';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { getSatelliteHomeSupportUsersWithDailyRecords } from '../utils/api';
import { formatStoredMarkTime, toJapanDateKey } from '../utils/dateUtils';

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatTime = (value) => formatStoredMarkTime(value) || '未設定';

const normalizeNotes = (note) => {
  if (!note) return [];
  if (Array.isArray(note)) return note;
  if (typeof note === 'string') {
    try {
      const parsed = JSON.parse(note);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.comments)) return parsed.comments;
      if (parsed?.comment) return [parsed];
    } catch (error) {
      return [];
    }
    return [];
  }
  if (Array.isArray(note.comments)) return note.comments;
  if (note.comment) return [note];
  return [];
};

const latestNoteText = (note) => {
  const notes = normalizeNotes(note);
  if (notes.length === 0) return '';
  const latest = notes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  return latest?.comment || '';
};

const conditionStyle = (condition) => {
  if (condition === '良い') return { label: '良い', className: 'bg-green-100 text-green-800' };
  if (condition === '普通') return { label: '普通', className: 'bg-yellow-100 text-yellow-800' };
  if (condition === '悪い') return { label: '悪い', className: 'bg-red-100 text-red-800' };
  return null;
};

const attendanceStatus = (record) => {
  if (!record) return { text: '未開始', color: 'bg-red-100 text-red-800' };
  if (record.markEnd) return { text: '完了', color: 'bg-purple-100 text-purple-800' };
  if (record.markLunchStart && !record.markLunchEnd) return { text: '休憩中', color: 'bg-yellow-100 text-yellow-800' };
  if (record.markStart && !record.markEnd) return { text: '作業中', color: 'bg-green-100 text-green-800' };
  return { text: '未開始', color: 'bg-red-100 text-red-800' };
};

const HomeSupportTodayPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [satelliteId, setSatelliteId] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserInput, setShowUserInput] = useState(false);
  const [showSupportRecord, setShowSupportRecord] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const todayDate = useMemo(() => localToday(), []);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('本日利用状況: 拠点情報のパースエラー:', parseError);
      }
    }
    if (!locationToUse && currentUser.satellite_id) {
      locationToUse = {
        id: currentUser.satellite_id,
        name: currentUser.satellite_name,
        company_id: currentUser.company_id,
        company_name: currentUser.company_name,
      };
    }
    setLocalUser({
      ...currentUser,
      location: locationToUse,
      satellite_id: locationToUse?.id || currentUser.satellite_id,
      satellite_name: locationToUse?.name || currentUser.satellite_name,
      company_id: locationToUse?.company_id || currentUser.company_id,
      company_name: locationToUse?.company_name || currentUser.company_name,
    });
    setSatelliteId(locationToUse?.id || currentUser.satellite_id || null);
  }, [currentUser]);

  const loadUsers = async (nextSatelliteId) => {
    if (!nextSatelliteId) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const date = localToday();
      const response = await getSatelliteHomeSupportUsersWithDailyRecords(nextSatelliteId, null, date);
      if (!response?.success) {
        throw new Error(response?.message || '本日の利用状況を取得できませんでした');
      }
      const userMap = new Map();
      (response.data || []).forEach((record) => {
        if (!userMap.has(record.id)) {
          userMap.set(record.id, {
            id: record.id,
            name: record.name,
            date,
            dailyRecords: [],
          });
        }
        const recordDate = toJapanDateKey(record.record_date);
        if (record.daily_record_id && recordDate === date) {
          userMap.get(record.id).dailyRecords.push({
            markStart: record.mark_start,
            markLunchStart: record.mark_lunch_start,
            markLunchEnd: record.mark_lunch_end,
            markEnd: record.mark_end,
            temperature: record.temperature,
            condition: record.condition,
            conditionNote: record.condition_note,
            note: latestNoteText(record.instructor_comment),
          });
        }
      });
      setUsers(Array.from(userMap.values()));
    } catch (loadError) {
      console.error('本日利用状況の取得エラー:', loadError);
      setError(loadError.message || '本日の利用状況を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(satelliteId);
  }, [satelliteId]);

  const handleLocationChange = (newLocation) => {
    sessionStorage.setItem('selectedSatellite', JSON.stringify(newLocation));
    const updatedUser = {
      ...localUser,
      satellite_id: newLocation.id,
      satellite_name: newLocation.name,
      company_id: newLocation.company_id,
      company_name: newLocation.company_name,
      location: newLocation,
    };
    setLocalUser(updatedUser);
    setSatelliteId(newLocation.id);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  };

  const closeAndRefresh = (close) => {
    close();
    setSelectedUser(null);
    loadUsers(satelliteId);
  };

  const statistics = useMemo(() => {
    const counts = { total: users.length, active: 0, rest: 0, completed: 0 };
    users.forEach((user) => {
      const record = user.dailyRecords[0];
      const status = attendanceStatus(record).text;
      if (status === '作業中') counts.active += 1;
      if (status === '休憩中') counts.rest += 1;
      if (status === '完了') counts.completed += 1;
    });
    return counts;
  }, [users]);

  if (!currentUser || !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const actionClass = (disabled, colorClass) => (
    disabled
      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
      : `${colorClass} text-white`
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <InstructorHeader user={localUser} onLocationChange={handleLocationChange} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">在宅</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">本日利用状況</h1>
            <p className="mt-2 text-gray-600">今日の在宅利用者の開始、休憩、終了と、記録の有無を確認します。</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Link
              to="/instructor/home-support/history"
              className="text-sm text-emerald-700 hover:text-emerald-900"
            >
              利用履歴
            </Link>
            <Link
              to="/instructor/home-support"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              旧画面を開く
            </Link>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: '総利用者数', value: statistics.total, className: 'bg-blue-50 text-blue-800' },
            { label: '作業中', value: statistics.active, className: 'bg-green-50 text-green-800' },
            { label: '休憩中', value: statistics.rest, className: 'bg-yellow-50 text-yellow-800' },
            { label: '完了', value: statistics.completed, className: 'bg-purple-50 text-purple-800' },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl px-4 py-4 ${item.className}`}>
              <p className="text-sm">{item.label}</p>
              <p className="mt-1 text-2xl font-bold">{item.value}名</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-600">読み込み中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['利用者名', '開始時間', '休憩開始時間', '休憩終了時間', '終了時間', 'ステータス', '体温', '体調', 'コメント', '本人記録', '支援記録', '写真'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="px-6 py-12 text-center text-gray-500">
                        在宅利用者はまだいません。
                      </td>
                    </tr>
                  ) : users.map((user) => {
                    const record = user.dailyRecords[0];
                    const status = attendanceStatus(record);
                    const condition = conditionStyle(record?.condition);
                    const notStarted = status.text === '未開始';
                    return (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{user.name}</td>
                        <td className="px-4 py-4 text-sm text-green-800 whitespace-nowrap">{formatTime(record?.markStart)}</td>
                        <td className="px-4 py-4 text-sm text-yellow-800 whitespace-nowrap">{formatTime(record?.markLunchStart)}</td>
                        <td className="px-4 py-4 text-sm text-yellow-800 whitespace-nowrap">{formatTime(record?.markLunchEnd)}</td>
                        <td className="px-4 py-4 text-sm text-red-800 whitespace-nowrap">{formatTime(record?.markEnd)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${status.color}`}>
                            {status.text}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">
                          {record?.temperature ? `${record.temperature}°C` : '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {condition ? (
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${condition.className}`} title={record?.conditionNote || ''}>
                              {condition.label}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                          {record?.note ? '〇' : 'ー'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={notStarted}
                            onClick={() => {
                              setSelectedUser(user);
                              setShowUserInput(true);
                            }}
                            className={`rounded px-3 py-1 text-sm ${actionClass(notStarted, 'bg-indigo-600 hover:bg-indigo-700')}`}
                          >
                            本人記録
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={notStarted}
                            onClick={() => {
                              setSelectedUser(user);
                              setShowSupportRecord(true);
                            }}
                            className={`rounded px-3 py-1 text-sm ${actionClass(notStarted, 'bg-green-600 hover:bg-green-700')}`}
                          >
                            支援記録
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowPhotos(true);
                            }}
                            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                          >
                            写真
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <UserInputModal
        isOpen={showUserInput}
        onClose={() => closeAndRefresh(() => setShowUserInput(false))}
        selectedUser={selectedUser}
      />
      {showSupportRecord && selectedUser && (
        <DailySupportRecordModal
          isOpen={showSupportRecord}
          onClose={() => closeAndRefresh(() => setShowSupportRecord(false))}
          onSave={() => {}}
          student={selectedUser}
          date={todayDate}
        />
      )}
      <UserDetailModal
        isOpen={showPhotos}
        onClose={() => {
          setShowPhotos(false);
          setSelectedUser(null);
        }}
        selectedUser={selectedUser}
      />
    </div>
  );
};

export default HomeSupportTodayPage;
