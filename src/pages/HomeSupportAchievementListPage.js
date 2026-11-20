import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import DailySupportRecordModal from '../components/DailySupportRecordModal';
import InstructorHeader from '../components/InstructorHeader';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { apiCall } from '../utils/api';

const formatJapanDate = (value) => {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${year}/${month}/${day}`;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '-';
  return `${year}/${month}/${day}`;
};

const todayString = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
};

const INITIAL_END_DATE = todayString();
const INITIAL_START_DATE = `${INITIAL_END_DATE.slice(0, 8)}01`;
const PAGE_SIZE = 50;

const toDateKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

const monthlyOverlapsPeriod = (record, rangeStart, rangeEnd) => {
  const point = toDateKey(record.date || record.created_at);
  const start = toDateKey(record.period_start) || point;
  const end = toDateKey(record.period_end) || toDateKey(record.period_start) || point;
  if (!start || !end) return false;
  return start <= rangeEnd && end >= rangeStart;
};

const periodSortKey = (record, type) => {
  if (type === 'daily') return toDateKey(record.date || record.created_at);
  return toDateKey(record.period_end) || toDateKey(record.date) || toDateKey(record.created_at);
};

const periodParts = (record, type) => {
  if (type === 'daily') return [formatJapanDate(record.date || record.created_at)];
  const start = formatJapanDate(record.period_start);
  const end = formatJapanDate(record.period_end);
  if (start !== '-' && end !== '-') return [start, end];
  if (end !== '-') return [end];
  if (start !== '-') return [start];
  return [formatJapanDate(record.date || record.created_at)];
};

const HomeSupportAchievementListPage = () => {
  const { userId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [userName, setUserName] = useState(location.state?.userName || '');
  const [studentProfile, setStudentProfile] = useState(null);
  const [dailyRow, setDailyRow] = useState(null);
  const [rows, setRows] = useState([]);
  const [startDate, setStartDate] = useState(INITIAL_START_DATE);
  const [endDate, setEndDate] = useState(INITIAL_END_DATE);
  const [showDaily, setShowDaily] = useState(true);
  const [showWeekly, setShowWeekly] = useState(true);
  const [showMonthly, setShowMonthly] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const passedUserName = location.state?.userName || '';

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('実績確認: 拠点情報のパースエラー:', parseError);
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
  }, [currentUser]);

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
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    window.dispatchEvent(new CustomEvent('satelliteChanged', {
      detail: { newLocation },
    }));
  };

  const loadRows = useCallback(async () => {
    if (!userId || !startDate || !endDate) return;
    if (startDate > endDate) {
      setError('開始日は終了日以前にしてください。');
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [userResponse, dailyResponse, weeklyResponse, monthlyResponse] = await Promise.all([
        apiCall(`/api/users/${userId}`, { method: 'GET' }),
        apiCall(
          `/api/remote-support/daily-reports?userId=${userId}&startDate=${startDate}&endDate=${endDate}&limit=0`,
          { method: 'GET' }
        ),
        apiCall(
          `/api/weekly-evaluations/user/${userId}?periodStart=${startDate}&periodEnd=${endDate}`,
          { method: 'GET' }
        ),
        apiCall(`/api/monthly-evaluations/user/${userId}`, { method: 'GET' }),
      ]);

      if (userResponse?.success && userResponse.data) {
        setStudentProfile(userResponse.data);
      }
      const resolvedName = userResponse?.success && userResponse.data?.name
        ? userResponse.data.name
        : passedUserName;
      setUserName(resolvedName);

      if (!dailyResponse?.success) {
        throw new Error(dailyResponse?.message || '日次支援記録の取得に失敗しました');
      }
      if (!weeklyResponse?.success) {
        throw new Error(weeklyResponse?.message || '週次評価の取得に失敗しました');
      }
      if (!monthlyResponse?.success) {
        throw new Error(monthlyResponse?.message || '月次評価の取得に失敗しました');
      }

      const dailyReports = dailyResponse.data?.reports || [];
      const weeklyReports = Array.isArray(weeklyResponse.data) ? weeklyResponse.data : [];
      const monthlyReports = (Array.isArray(monthlyResponse.data) ? monthlyResponse.data : [])
        .filter((record) => monthlyOverlapsPeriod(record, startDate, endDate));
      const nextRows = [
        ...dailyReports.map((record) => ({
          key: `daily-${record.id}`,
          id: record.id,
          type: 'daily',
          typeLabel: '日次支援記録',
          sortKey: periodSortKey(record, 'daily'),
          periodParts: periodParts(record, 'daily'),
          record,
        })),
        ...weeklyReports.map((record) => ({
          key: `weekly-${record.id}`,
          id: record.id,
          type: 'weekly',
          typeLabel: '週次評価',
          sortKey: periodSortKey(record, 'weekly'),
          periodParts: periodParts(record, 'weekly'),
          record,
        })),
        ...monthlyReports.map((record) => ({
          key: `monthly-${record.id}`,
          id: record.id,
          type: 'monthly',
          typeLabel: '月次評価',
          sortKey: periodSortKey(record, 'monthly'),
          periodParts: periodParts(record, 'monthly'),
          record,
        })),
      ].sort((a, b) => {
        if (a.sortKey === b.sortKey) return 0;
        return a.sortKey < b.sortKey ? 1 : -1;
      });
      setRows(nextRows);
    } catch (loadError) {
      console.error('実績確認の取得エラー:', loadError);
      setError(loadError.message || '実績の取得に失敗しました');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, startDate, endDate, passedUserName]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => rows.filter((row) => (
    (row.type === 'daily' && showDaily)
    || (row.type === 'weekly' && showWeekly)
    || (row.type === 'monthly' && showMonthly)
  )), [rows, showDaily, showWeekly, showMonthly]);

  useEffect(() => {
    setCurrentPage(1);
  }, [userId, startDate, endDate, showDaily, showWeekly, showMonthly]);

  const totalCount = visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE);

  const goToPage = (page) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openDetail = (row) => {
    if (row.type === 'daily') {
      setDailyRow(row);
      return;
    }
    if (row.type === 'weekly') {
      const start = toDateKey(row.record.period_start);
      const end = toDateKey(row.record.period_end);
      const params = new URLSearchParams({ evaluationId: String(row.id) });
      if (start) params.set('start', start);
      if (end) params.set('end', end);
      navigate(`/instructor/home-support/weekly-evaluation/${userId}?${params.toString()}`, {
        state: { weeklyRecord: row.record, userName },
      });
      return;
    }
    navigate(`/instructor/home-support/monthly-evaluation-history/${userId}`, {
      state: { userName },
    });
  };

  const deleteRow = async (row) => {
    const confirmed = window.confirm(`この${row.typeLabel}を削除しますか？\nこの操作は取り消せません。`);
    if (!confirmed) return;

    const endpoint = row.type === 'daily'
      ? `/api/remote-support/daily-reports/${row.id}`
      : row.type === 'weekly'
        ? `/api/weekly-evaluations/${row.id}`
        : `/api/monthly-evaluations/${row.id}`;

    setDeletingKey(row.key);
    setError(null);
    try {
      const response = await apiCall(endpoint, { method: 'DELETE' });
      if (!response?.success) {
        throw new Error(response?.message || '削除に失敗しました');
      }
      setRows((current) => current.filter((item) => item.key !== row.key));
    } catch (deleteError) {
      console.error('実績の削除エラー:', deleteError);
      setError(deleteError.message || '削除に失敗しました');
    } finally {
      setDeletingKey(null);
    }
  };

  if (!currentUser || !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InstructorHeader user={localUser} onLocationChange={handleLocationChange} />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-emerald-700">在宅</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">実績確認</h1>
          <p className="mt-2 text-gray-600">日次支援記録、週次評価、月次評価を一覧で確認します。</p>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
          <p className="text-sm text-gray-500">利用者名</p>
          <p className="mt-1 text-xl font-semibold text-gray-900">{userName || '読み込み中...'}</p>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block text-sm text-gray-700">
              開始日
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="block text-sm text-gray-700">
              終了日
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-gray-700">
            <span className="font-medium text-gray-500">データ種別</span>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showDaily}
                onChange={(event) => setShowDaily(event.target.checked)}
              />
              日次支援記録
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showWeekly}
                onChange={(event) => setShowWeekly(event.target.checked)}
              />
              週次評価
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showMonthly}
                onChange={(event) => setShowMonthly(event.target.checked)}
              />
              月次評価
            </label>
            <label className="ml-auto flex items-center gap-2">
              <input
                type="checkbox"
                checked={showDelete}
                onChange={(event) => setShowDelete(event.target.checked)}
              />
              削除ボタンを表示
            </label>
          </div>
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
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">日付(期間)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">データ種別</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="px-6 py-16 text-center text-gray-500">
                      {!showDaily && !showWeekly && !showMonthly ? '表示するデータ種別を選んでください。' : 'この期間の実績はありません。'}
                    </td>
                  </tr>
                ) : pageRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                      {row.periodParts.map((part, index) => (
                        <span key={`${row.key}-${index}`}>
                          {index > 0 && <span className="mx-1 font-normal text-gray-400">〜</span>}
                          <span className={row.type === 'daily' ? 'tabular-nums' : 'font-semibold tabular-nums'}>{part}</span>
                        </span>
                      ))}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.type === 'daily' ? 'bg-green-100 text-green-800' : row.type === 'weekly' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                        {row.typeLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(row)}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                          詳細
                        </button>
                        {showDelete && (
                          <button
                            type="button"
                            onClick={() => deleteRow(row)}
                            disabled={deletingKey === row.key}
                            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
                          >
                            {deletingKey === row.key ? '削除中' : '削除'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && totalCount > PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage === 1}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${safePage === 1 ? 'cursor-not-allowed bg-gray-200 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                前へ
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1)
                .filter((page) => page === 1 || page === totalPages || (page >= safePage - 2 && page <= safePage + 2))
                .map((page, index, pages) => {
                  const previousPage = pages[index - 1];
                  const showEllipsis = previousPage && page - previousPage > 1;
                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && <span className="px-2 text-gray-500">...</span>}
                      <button
                        type="button"
                        onClick={() => goToPage(page)}
                        className={`rounded-lg px-4 py-2 text-sm font-medium ${safePage === page ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}
              <button
                type="button"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage === totalPages}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${safePage === totalPages ? 'cursor-not-allowed bg-gray-200 text-gray-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                次へ
              </button>
              <span className="ml-2 text-sm text-gray-600">
                {totalCount}件中 {pageStart + 1}〜{Math.min(pageStart + PAGE_SIZE, totalCount)}件
              </span>
            </div>
          )}
        </div>
      </main>

      {dailyRow && (
        <DailySupportRecordModal
          isOpen
          heading="📝 在宅における就労支援記録（編集）"
          onClose={() => {
            setDailyRow(null);
            loadRows();
          }}
          onSave={() => {}}
          student={{
            id: studentProfile?.id || userId,
            name: studentProfile?.name || userName,
            recipientNumber: studentProfile?.recipient_number || studentProfile?.recipientNumber || '',
          }}
          date={toDateKey(dailyRow.record.date || dailyRow.record.created_at)}
        />
      )}
    </div>
  );
};

export default HomeSupportAchievementListPage;
