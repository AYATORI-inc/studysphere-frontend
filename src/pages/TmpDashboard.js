import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import InstructorHeader from '../components/InstructorHeader';

const dashboardGroups = [
  {
    id: 'learning',
    title: '学習',
    panelClass: 'border-indigo-100 bg-indigo-50',
    titleClass: 'text-indigo-800',
    accent: 'from-indigo-500 to-indigo-600',
    layoutClass: 'sm:grid-cols-2 xl:grid-cols-4',
    cards: [
      {
        id: 'temp-password',
        icon: '🔑',
        title: '一時パスワード',
        description: '本日ログインする利用者へ、一時パスワードを発行します。',
      },
      {
        id: 'students',
        icon: '👥',
        title: '利用者管理',
        description: '利用者の追加、稼働状態、担当を確認します。',
      },
      {
        id: 'voice',
        icon: '💬',
        title: '声かけ',
        description: '利用者へのメッセージと声かけを扱います。',
      },
      {
        id: 'courses',
        icon: '📚',
        title: '学習コース確認',
        description: '拠点で使える学習コースとレッスンを、利用者の画面で確認します。',
      },
    ],
  },
  {
    id: 'home',
    title: '在宅',
    panelClass: 'border-emerald-100 bg-emerald-50',
    titleClass: 'text-emerald-800',
    accent: 'from-emerald-500 to-emerald-600',
    layoutClass: 'sm:grid-cols-2',
    cards: [
      {
        id: 'home-today',
        icon: '📷',
        title: '今日の在宅状況',
        description: '在宅支援の記録と証拠を確認します。',
      },
      {
        id: 'home-support',
        icon: '🏠',
        title: '在宅支援管理',
        description: '在宅の支援記録、評価、勤怠を扱います。',
      },
    ],
  },
  {
    id: 'office',
    title: '拠点と設定',
    panelClass: 'border-slate-200 bg-slate-100',
    titleClass: 'text-slate-700',
    accent: 'from-slate-500 to-slate-600',
    layoutClass: 'sm:grid-cols-2',
    cards: [
      {
        id: 'location',
        icon: '🏢',
        title: '拠点管理',
        description: '拠点の情報を確認します。',
      },
      {
        id: 'settings',
        icon: '⚙️',
        title: '設定',
        description: 'アカウントとパスワードを変更します。',
      },
    ],
  },
];

const DashboardCard = ({ action, accent, passwordResetRequired, onSelect }) => {
  const needsPasswordChange = action.id === 'settings' && passwordResetRequired;

  return (
    <button
      type="button"
      onClick={() => onSelect(action.id)}
      className={`relative flex h-full flex-col rounded-2xl border bg-white p-6 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        needsPasswordChange ? 'border-red-300' : 'border-white'
      }`}
    >
      {needsPasswordChange && (
        <span className="absolute right-4 top-4 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          要対応
        </span>
      )}
      <span className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r text-2xl text-white ${
        needsPasswordChange ? 'from-red-500 to-red-600' : accent
      }`}>
        {action.icon}
      </span>
      <span className="text-xl font-bold text-gray-900">{action.title}</span>
      <span className="mt-2 text-sm leading-6 text-gray-600">
        {needsPasswordChange ? 'パスワードの変更が必要です。' : action.description}
      </span>
    </button>
  );
};

const TmpDashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    if (localUser && localUser.id === currentUser.id) return;

    let locationToUse = currentUser.location || null;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (error) {
        console.error('TmpDashboard: 保存された拠点情報のパースエラー:', error);
      }
    } else if (currentUser.satellite_id) {
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
  }, [currentUser, localUser]);

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
      detail: { newLocation }
    }));
  };

  const openDashboardTab = (tab, action) => {
    const params = new URLSearchParams({ tab });
    if (action) params.set('action', action);
    navigate(`/instructor/old-dashboard?${params.toString()}`);
  };

  const openHomeSupport = (tab) => {
    if (localUser?.satellite_id) {
      sessionStorage.setItem('selectedSatellite', JSON.stringify({
        id: localUser.satellite_id,
        name: localUser.satellite_name,
        company_id: localUser.company_id,
        company_name: localUser.company_name,
        type: localUser.location?.type || '就労移行支援事業所',
        organization: localUser.location?.organization || 'スタディスフィア株式会社',
      }));
    }
    sessionStorage.setItem('homeSupportDashboardActiveTab', tab);
    navigate('/instructor/home-support');
  };

  const handleCardAction = (actionId) => {
    if (actionId === 'temp-password') {
      openDashboardTab('students', 'issue-temp-password');
      return;
    }
    if (actionId === 'students') {
      openDashboardTab('students');
      return;
    }
    if (actionId === 'voice') {
      openDashboardTab('overview');
      return;
    }
    if (actionId === 'courses') {
      openDashboardTab('learning-preview');
      return;
    }
    if (actionId === 'home-today') {
      openHomeSupport('evidence');
      return;
    }
    if (actionId === 'home-support') {
      openHomeSupport('overview');
      return;
    }
    if (actionId === 'location') {
      openDashboardTab('location');
      return;
    }
    if (actionId === 'settings') {
      openDashboardTab('settings');
    }
  };

  if (!currentUser || !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  const satelliteName = localUser.satellite_name || localUser.location?.name || '拠点未選択';
  const passwordResetRequired = Boolean(localUser.passwordResetRequired);

  return (
    <div className="min-h-screen bg-gray-50">
      <InstructorHeader
        user={localUser}
        onLocationChange={handleLocationChange}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
            <p className="mt-2 text-gray-600">{satelliteName} でよく使う作業から始められます。</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/instructor/old-dashboard')}
            className="self-start text-sm text-gray-500 underline underline-offset-4 hover:text-indigo-600"
          >
            従来のダッシュボードを開く
          </button>
        </div>

        <div className="space-y-6">
          <section className={`rounded-3xl border p-5 sm:p-6 ${dashboardGroups[0].panelClass}`}>
            <h2 className={`mb-4 text-sm font-semibold tracking-wide ${dashboardGroups[0].titleClass}`}>
              {dashboardGroups[0].title}
            </h2>
            <div className={`grid grid-cols-1 gap-4 ${dashboardGroups[0].layoutClass}`}>
              {dashboardGroups[0].cards.map((action) => (
                <DashboardCard
                  key={action.id}
                  action={action}
                  accent={dashboardGroups[0].accent}
                  passwordResetRequired={passwordResetRequired}
                  onSelect={handleCardAction}
                />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {dashboardGroups.slice(1).map((group) => (
              <section key={group.id} className={`rounded-3xl border p-5 sm:p-6 ${group.panelClass}`}>
                <h2 className={`mb-4 text-sm font-semibold tracking-wide ${group.titleClass}`}>
                  {group.title}
                </h2>
                <div className={`grid grid-cols-1 gap-4 ${group.layoutClass}`}>
                  {group.cards.map((action) => (
                    <DashboardCard
                      key={action.id}
                      action={action}
                      accent={group.accent}
                      passwordResetRequired={passwordResetRequired}
                      onSelect={handleCardAction}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default TmpDashboard;
