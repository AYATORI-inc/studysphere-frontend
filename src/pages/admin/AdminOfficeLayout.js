import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminGuard } from '../../utils/hooks/useAuthGuard';
import AdminHeader from '../../components/AdminHeader';

const menuItems = [
  { label: '事業所管理', to: '/admin/locations' },
  { label: '企業管理', to: '/admin/companies' },
  { label: '指導員管理', to: '/admin/instructors' },
];

const referenceItems = [
  { label: '各種仕様', to: '/admin/specifications' },
];

const AdminOfficeLayout = ({ children }) => {
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
            <div className="mx-1 hidden border-t border-sky-200 md:block" />
            {referenceItems.map((item) => (
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

export default AdminOfficeLayout;
