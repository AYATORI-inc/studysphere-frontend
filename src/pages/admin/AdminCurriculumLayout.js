import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminGuard } from '../../utils/hooks/useAuthGuard';
import AdminHeader from '../../components/AdminHeader';

const menuItems = [
  { label: 'コース管理', to: '/admin/courses' },
  { label: 'レッスン管理', to: '/admin/lessons' },
  { label: 'カリキュラムパス管理', to: '/admin/curriculum-paths' },
];

const AdminCurriculumLayout = ({ children }) => {
  const { currentUser } = useAdminGuard();

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-600">認証中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader user={currentUser} />
      <div className="flex min-h-[calc(100vh-4.5rem)] flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-sky-100 bg-sky-50 md:sticky md:top-0 md:h-[calc(100vh-4.5rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r">
          <nav className="flex gap-2 overflow-x-auto p-4 md:flex-col">
            {menuItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium ${
                    isActive
                      ? 'bg-white text-sky-800 shadow-sm'
                      : 'text-sky-900 hover:bg-white/70'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export const AdminCurriculumPlaceholder = ({ title }) => (
  <AdminCurriculumLayout>
    <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
    <p className="mt-2 text-gray-600">この画面はこれから作ります。</p>
  </AdminCurriculumLayout>
);

export default AdminCurriculumLayout;
