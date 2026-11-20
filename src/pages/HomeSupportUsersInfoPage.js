import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import HomeSupportUserAdditionModal from '../components/HomeSupportUserAdditionModal';
import HomeSupportUserDetailModal from '../components/modals/HomeSupportUserDetailModal';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { getSatelliteHomeSupportUsers, getSatelliteSupportPlanStatus } from '../utils/api';
import { buildSupportPlanAlerts } from '../utils/dashboardWarnings';

const planState = (plan) => {
  if (!plan || plan.status === 'no_record') {
    return {
      needsCheck: true,
      label: '未作成',
      detail: '個別支援計画がありません',
      className: 'bg-red-100 text-red-800',
    };
  }
  if (plan.status === 'no_goal_date' || !plan.goal_date) {
    return {
      needsCheck: true,
      label: '目標日が未設定',
      detail: '目標達成予定日を設定してください',
      className: 'bg-amber-100 text-amber-800',
    };
  }

  const updateAlert = buildSupportPlanAlerts([plan])[0];
  const goalLabel = new Date(plan.goal_date).toLocaleDateString('ja-JP');
  if (updateAlert?.status === 'update_needed') {
    return {
      needsCheck: true,
      label: '更新時期',
      detail: `目標達成予定日 ${goalLabel}（残り${updateAlert.daysUntilGoal}日）`,
      className: 'bg-amber-100 text-amber-800',
    };
  }

  return {
    needsCheck: false,
    label: '確認済み',
    detail: `目標達成予定日 ${goalLabel}`,
    className: 'bg-emerald-100 text-emerald-800',
  };
};

const HomeSupportUsersInfoPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [satelliteId, setSatelliteId] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsCheckOnly, setNeedsCheckOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('在宅利用者情報: 拠点情報のパースエラー:', parseError);
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

  const loadRows = async (nextSatelliteId) => {
    if (!nextSatelliteId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [usersResponse, plansResponse] = await Promise.all([
        getSatelliteHomeSupportUsers(nextSatelliteId),
        getSatelliteSupportPlanStatus(nextSatelliteId),
      ]);
      if (!usersResponse?.success) {
        throw new Error(usersResponse?.message || '在宅利用者の取得に失敗しました');
      }
      const plans = plansResponse?.success && Array.isArray(plansResponse.data) ? plansResponse.data : [];
      const planByUserId = new Map(plans.map((plan) => [String(plan.user_id), plan]));
      const nextRows = (usersResponse.data || []).map((user) => {
        const plan = planByUserId.get(String(user.id)) || {
          user_id: user.id,
          user_name: user.name,
          status: 'no_record',
          goal_date: null,
        };
        return {
          id: user.id,
          name: user.name,
          instructorName: user.instructor_name || '未設定',
          loginCode: user.login_code || '',
          plan,
          state: planState(plan),
        };
      }).sort((a, b) => {
        if (a.state.needsCheck !== b.state.needsCheck) {
          return a.state.needsCheck ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'ja');
      });
      setRows(nextRows);
    } catch (loadError) {
      console.error('在宅利用者情報の取得エラー:', loadError);
      setError(loadError.message || '在宅利用者情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows(satelliteId);
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
    window.dispatchEvent(new CustomEvent('satelliteChanged', {
      detail: { newLocation },
    }));
  };

  const visibleRows = useMemo(
    () => (needsCheckOnly ? rows.filter((row) => row.state.needsCheck) : rows),
    [needsCheckOnly, rows]
  );
  const needsCheckCount = rows.filter((row) => row.state.needsCheck).length;

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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">在宅</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">在宅利用者情報</h1>
            <p className="mt-2 text-gray-600">在宅利用者の追加と、個別支援計画の確認をします。</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Link
              to="/instructor/home-support"
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              旧画面を開く
            </Link>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700"
            >
              在宅利用者を追加
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow-sm">
            在宅利用者 {rows.length}名
          </span>
          <span className={`rounded-full px-3 py-1 text-sm shadow-sm ${needsCheckCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-white text-gray-700'}`}>
            計画の確認が必要 {needsCheckCount}名
          </span>
          <label className="ml-auto flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={needsCheckOnly}
              onChange={(event) => setNeedsCheckOnly(event.target.checked)}
            />
            確認が必要な人だけ表示
          </label>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-600">読み込み中...</div>
          ) : visibleRows.length === 0 ? (
            <div className="px-6 py-16 text-center text-gray-500">
              {rows.length === 0 ? '在宅利用者はまだいません。' : '確認が必要な利用者はいません。'}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">利用者</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">担当</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">個別支援計画</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{row.instructorName}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.state.className}`}>
                        {row.state.label}
                      </span>
                      <p className="mt-1 text-sm text-gray-600">{row.state.detail}</p>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedStudent({
                          id: row.id,
                          name: row.name,
                          instructorName: row.instructorName,
                          email: row.loginCode,
                        })}
                        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        計画を確認
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      <HomeSupportUserAdditionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          loadRows(satelliteId);
        }}
      />
      {selectedStudent && (
        <HomeSupportUserDetailModal
          isOpen={Boolean(selectedStudent)}
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
          onSave={() => loadRows(satelliteId)}
        />
      )}
    </div>
  );
};

export default HomeSupportUsersInfoPage;
