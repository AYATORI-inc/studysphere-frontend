import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminGuard } from '../utils/hooks/useAuthGuard';
import AdminHeader from '../components/AdminHeader';
import AdminPasswordChangeModal from '../components/AdminPasswordChangeModal';
import { API_BASE_URL } from '../config/apiConfig';

const dashboardGroups = [
  {
    id: 'office',
    title: '事業所関連',
    panelClass: 'border-sky-100 bg-sky-50',
    titleClass: 'text-sky-800',
    accent: 'from-sky-500 to-sky-600',
    cards: [
      {
        id: 'locations',
        icon: '🏢',
        title: '事業所管理',
        description: '事業所と拠点を追加し、確認します。',
        path: '/admin/locations',
      },
    ],
  },
  {
    id: 'curriculum',
    title: 'カリキュラム関連',
    panelClass: 'border-amber-100 bg-amber-50',
    titleClass: 'text-amber-800',
    accent: 'from-amber-500 to-amber-600',
    cards: [
      {
        id: 'courses',
        icon: '📚',
        title: 'コース管理',
        description: 'システム全体のコースを管理します。',
        path: '/admin/courses',
      },
    ],
  },
  {
    id: 'management',
    title: '管理関連',
    panelClass: 'border-rose-100 bg-rose-50',
    titleClass: 'text-rose-800',
    accent: 'from-rose-500 to-rose-600',
    cards: [
      {
        id: 'admins',
        icon: '👥',
        title: '管理者管理',
        description: '管理者アカウントの追加と、操作ログを確認します。',
        path: '/admin/admins',
      },
      {
        id: 'sso',
        icon: '🔗',
        title: 'SSO管理',
        description: '信頼できる連携先と、SSOの監査ログを確認します。',
        path: '/admin/sso',
      },
    ],
  },
];

const DashboardCard = ({ action, accent, onSelect }) => (
  <button
    type="button"
    onClick={() => onSelect(action.path)}
    className="flex h-full flex-col rounded-2xl border border-white bg-white p-6 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
  >
    <span className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r text-2xl text-white ${accent}`}>
      {action.icon}
    </span>
    <span className="text-xl font-bold text-gray-900">{action.title}</span>
    <span className="mt-2 text-sm leading-6 text-gray-600">{action.description}</span>
  </button>
);

const AdminCardDashboard = () => {
  const navigate = useNavigate();
  const { currentUser } = useAdminGuard();
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);

  useEffect(() => {
    if (currentUser?.passwordResetRequired) {
      setShowPasswordChangeModal(true);
    }
  }, [currentUser]);

  const handlePasswordChange = async (currentPassword, newPassword) => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_BASE_URL}/api/users/${currentUser.id}/change-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });

    const data = await response.json();

    if (data.success) {
      alert('パスワードが正常に変更されました。');
      const updatedUser = { ...currentUser, passwordResetRequired: false };
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      window.location.reload();
      return;
    }

    throw new Error(data.message || 'パスワード変更に失敗しました');
  };

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-600">認証中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={showPasswordChangeModal ? 'pointer-events-none opacity-50' : ''}>
        <AdminHeader user={currentUser} />

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
              <p className="mt-2 text-gray-600">事業所、カリキュラム、管理の作業から始められます。</p>
            </div>
            <Link
              to="/admin/old-dashboard"
              className="self-start text-sm text-gray-500 underline underline-offset-4 hover:text-rose-600"
            >
              旧ダッシュボード
            </Link>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {dashboardGroups.filter((group) => group.id !== 'management').map((group) => (
                <section key={group.id} className={`rounded-3xl border p-5 sm:p-6 ${group.panelClass}`}>
                  <h2 className={`mb-4 text-sm font-semibold tracking-wide ${group.titleClass}`}>
                    {group.title}
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    {group.cards.map((action) => (
                      <DashboardCard
                        key={action.id}
                        action={action}
                        accent={group.accent}
                        onSelect={navigate}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {dashboardGroups.filter((group) => group.id === 'management').map((group) => (
              <section key={group.id} className={`rounded-3xl border p-5 sm:p-6 ${group.panelClass}`}>
                <h2 className={`mb-4 text-sm font-semibold tracking-wide ${group.titleClass}`}>
                  {group.title}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {group.cards.map((action) => (
                    <DashboardCard
                      key={action.id}
                      action={action}
                      accent={group.accent}
                      onSelect={navigate}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>

      <AdminPasswordChangeModal
        isOpen={showPasswordChangeModal}
        onClose={() => setShowPasswordChangeModal(false)}
        onPasswordChange={handlePasswordChange}
        user={currentUser}
      />
    </div>
  );
};

export default AdminCardDashboard;
