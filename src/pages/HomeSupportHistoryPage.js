import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import DailySupportRecordModal from '../components/DailySupportRecordModal';
import UserDetailModal from '../components/modals/UserDetailModal';
import UserInputModal from '../components/modals/UserInputModal';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { createHomeSupportDailyRecord, deleteHomeSupportDailyRecord, getSatelliteHomeSupportUsers, getSatelliteHomeSupportUsersWithDailyRecords } from '../utils/api';
import { formatJapanTimeOfInstant, toJapanDateKey } from '../utils/dateUtils';

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const shiftDate = (value, days) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatTime = (value) => formatJapanTimeOfInstant(value) || '未設定';

const formatDateLabel = (value) => {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${year}/${month}/${day}`;
};

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

const HomeSupportHistoryPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [satelliteId, setSatelliteId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(localToday);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserInput, setShowUserInput] = useState(false);
  const [showSupportRecord, setShowSupportRecord] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createUserId, setCreateUserId] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('利用履歴: 拠点情報のパースエラー:', parseError);
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

  const loadRows = async (nextSatelliteId, date) => {
    if (!nextSatelliteId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await getSatelliteHomeSupportUsersWithDailyRecords(nextSatelliteId, null, date);
      if (!response?.success) {
        throw new Error(response?.message || '利用履歴を取得できませんでした');
      }
      const nextRows = [];
      (response.data || []).forEach((record) => {
        const recordDate = toJapanDateKey(record.record_date);
        if (!record.daily_record_id || recordDate !== date) return;
        nextRows.push({
          key: `${record.id}-${record.daily_record_id}`,
          id: record.id,
          name: record.name,
          recipientNumber: record.recipient_number || '-',
          date,
          dailyRecordId: record.daily_record_id,
          markStart: record.mark_start,
          markLunchStart: record.mark_lunch_start,
          markLunchEnd: record.mark_lunch_end,
          markEnd: record.mark_end,
          temperature: record.temperature,
          condition: record.condition,
          conditionNote: record.condition_note,
          note: latestNoteText(record.instructor_comment),
        });
      });
      nextRows.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setRows(nextRows);
    } catch (loadError) {
      console.error('利用履歴の取得エラー:', loadError);
      setError(loadError.message || '利用履歴を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows(satelliteId, selectedDate);
  }, [satelliteId, selectedDate]);

  useEffect(() => {
    if (!satelliteId) {
      setUserOptions([]);
      return;
    }
    let cancelled = false;
    getSatelliteHomeSupportUsers(satelliteId).then((response) => {
      if (cancelled || !response?.success) return;
      const options = (response.data || [])
        .map((user) => ({ id: String(user.id), name: user.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      setUserOptions(options);
    }).catch((loadError) => {
      console.error('利用履歴: 利用者一覧の取得エラー:', loadError);
    });
    return () => {
      cancelled = true;
    };
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
    loadRows(satelliteId, selectedDate);
  };

  const recordedUserIds = new Set(rows.map((row) => String(row.id)));
  const creatableUsers = userOptions.filter((user) => !recordedUserIds.has(user.id));

  const openCreate = () => {
    setCreateUserId(creatableUsers[0]?.id || '');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createUserId) return;
    setCreating(true);
    setError(null);
    try {
      const response = await createHomeSupportDailyRecord(createUserId, selectedDate);
      if (!response?.success) {
        throw new Error(response?.message || '利用記録を作成できませんでした');
      }
      setShowCreate(false);
      setCreateUserId('');
      await loadRows(satelliteId, selectedDate);
    } catch (createError) {
      setError(createError.message || '利用記録を作成できませんでした');
      if (createError.status === 409) {
        await loadRows(satelliteId, selectedDate);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (row) => {
    const confirmed = window.confirm(`${row.name}さんの${formatDateLabel(row.date)}の利用記録を削除しますか？\nこの操作は取り消せません。`);
    if (!confirmed) return;
    setDeletingId(row.dailyRecordId);
    setError(null);
    try {
      const response = await deleteHomeSupportDailyRecord(row.dailyRecordId);
      if (!response?.success) {
        throw new Error(response?.message || '利用記録を削除できませんでした');
      }
      await loadRows(satelliteId, selectedDate);
    } catch (deleteError) {
      setError(deleteError.message || '利用記録を削除できませんでした');
    } finally {
      setDeletingId(null);
    }
  };

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
            <h1 className="mt-1 text-3xl font-bold text-gray-900">利用履歴</h1>
            <p className="mt-2 text-gray-600">日付を選んで、その日の在宅利用を確認します。</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              新規作成
            </button>
            <Link
              to="/instructor/home-support/today"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              本日の状況を開く
            </Link>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            ← 前日
          </button>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-gray-700"
            />
            <button
              type="button"
              onClick={() => setSelectedDate(localToday())}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              今日
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            翌日 →
          </button>
        </div>
        <div className="mb-4 text-center">
          <p className="text-lg font-semibold text-gray-700">
            📅 {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'short',
            })}
          </p>
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
                    {['日付', '利用者名', '開始時間', '休憩開始時間', '休憩終了時間', '終了時間', 'ステータス', '体温', '体調', 'コメント', '本人記録', '支援記録', '写真', '削除'].map((label) => (
                      <th key={label} className="px-4 py-3 text-left text-xs font-medium text-gray-500 whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan="14" className="px-6 py-12 text-center text-gray-500">
                        この日に利用した人はいません。
                      </td>
                    </tr>
                  ) : rows.map((row) => {
                    const status = attendanceStatus(row);
                    const condition = conditionStyle(row.condition);
                    const notStarted = status.text === '未開始';
                    const openUser = {
                      id: row.id,
                      name: row.name,
                      date: row.date,
                      recipientNumber: row.recipientNumber,
                      dailyRecordId: row.dailyRecordId,
                    };
                    return (
                      <tr key={row.key} className="hover:bg-gray-50">
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDateLabel(row.date)}</td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">{row.name}</td>
                        <td className="px-4 py-4 text-sm text-green-800 whitespace-nowrap">{formatTime(row.markStart)}</td>
                        <td className="px-4 py-4 text-sm text-yellow-800 whitespace-nowrap">{formatTime(row.markLunchStart)}</td>
                        <td className="px-4 py-4 text-sm text-yellow-800 whitespace-nowrap">{formatTime(row.markLunchEnd)}</td>
                        <td className="px-4 py-4 text-sm text-red-800 whitespace-nowrap">{formatTime(row.markEnd)}</td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${status.color}`}>
                            {status.text}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">
                          {row.temperature ? `${row.temperature}°C` : '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {condition ? (
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${condition.className}`} title={row.conditionNote || ''}>
                              {condition.label}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                          {row.note ? '〇' : 'ー'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUser(openUser);
                              setShowUserInput(true);
                            }}
                            className="rounded bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
                          >
                            本人記録
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={notStarted}
                            onClick={() => {
                              setSelectedUser(openUser);
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
                              setSelectedUser(openUser);
                              setShowPhotos(true);
                            }}
                            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                          >
                            写真
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            disabled={deletingId === row.dailyRecordId}
                            className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700 disabled:bg-gray-300"
                          >
                            {deletingId === row.dailyRecordId ? '削除中' : '削除'}
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
        staffInput
      />
      {showSupportRecord && selectedUser && (
        <DailySupportRecordModal
          isOpen={showSupportRecord}
          onClose={() => closeAndRefresh(() => setShowSupportRecord(false))}
          onSave={() => {}}
          student={selectedUser}
          date={selectedUser.date}
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
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">利用記録の新規作成</h2>
            <p className="mt-2 text-sm text-gray-600">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('ja-JP')} の記録を作ります。本人記録の作業予定には「作成　要編集」が入ります。
            </p>
            <label className="mt-4 block text-sm text-gray-700">
              利用者
              <select
                value={createUserId}
                onChange={(event) => setCreateUserId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {creatableUsers.length === 0 ? (
                  <option value="">追加できる利用者がいません</option>
                ) : creatableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !createUserId}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
              >
                {creating ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeSupportHistoryPage;
