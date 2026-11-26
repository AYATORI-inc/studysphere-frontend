import React from 'react';
import { Link } from 'react-router-dom';
import { useAdminGuard } from '../utils/hooks/useAuthGuard';
import AdminHeader from '../components/AdminHeader';
import AdminManagement from '../components/AdminManagement';
import SSOManagement from '../components/SSOManagement';
import AdminSsoGuidePage from './admin/AdminSsoGuidePage';

const AdminSectionPage = ({ children }) => {
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
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <Link
          to="/admin/dashboard"
          className="text-sm text-gray-500 underline underline-offset-4 hover:text-rose-600"
        >
          ダッシュボードに戻る
        </Link>
      </div>
      {children}
    </div>
  );
};

export const AdminAdminsPage = () => (
  <AdminSectionPage>
    <AdminManagement />
  </AdminSectionPage>
);

export const AdminSsoPage = () => (
  <AdminSectionPage>
    <div className="mx-auto max-w-7xl p-6">
      <SSOManagement />
    </div>
  </AdminSectionPage>
);

export const AdminSsoGuideRoute = () => (
  <AdminSectionPage>
    <AdminSsoGuidePage />
  </AdminSectionPage>
);
