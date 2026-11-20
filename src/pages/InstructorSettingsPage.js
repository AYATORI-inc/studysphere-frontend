import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import InstructorSettingsPanel from '../components/instructor/InstructorSettingsPanel';
import InstructorPasswordChangeModal from '../components/InstructorPasswordChangeModal';
import { API_BASE_URL } from '../config/apiConfig';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const InstructorSettingsPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('設定: 拠点情報のパースエラー:', parseError);
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
      location: locationToUse || currentUser.location,
      satellite_id: locationToUse?.id || currentUser.satellite_id,
      satellite_name: locationToUse?.name || currentUser.satellite_name,
      company_id: locationToUse?.company_id || currentUser.company_id,
      company_name: locationToUse?.company_name || currentUser.company_name,
    });
  }, [currentUser]);

  useEffect(() => {
    if (localUser?.passwordResetRequired) {
      setShowPasswordChangeModal(true);
    }
  }, [localUser?.passwordResetRequired]);

  const handlePasswordChange = async (currentPassword, newPassword) => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_BASE_URL}/api/users/${localUser.id}/change-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'パスワード変更に失敗しました');
    }
    alert('パスワードが正常に変更されました。');
    const updatedUser = { ...localUser, passwordResetRequired: false };
    setLocalUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  };

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

  if (!currentUser || !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={showPasswordChangeModal ? 'pointer-events-none opacity-50' : ''}>
      <InstructorHeader user={localUser} onLocationChange={handleLocationChange} />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">拠点と設定</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">設定</h1>
            <p className="mt-2 text-gray-600">アカウントとパスワードを変更します。</p>
          </div>
          <Link
            to="/instructor/dashboard"
            className="text-sm text-indigo-700 hover:text-indigo-900"
          >
            ダッシュボードに戻る
          </Link>
        </div>

        <InstructorSettingsPanel
          user={localUser}
          onUserUpdated={(patch) => setLocalUser((prev) => ({ ...prev, ...patch }))}
        />
      </main>
      </div>
      <InstructorPasswordChangeModal
        isOpen={showPasswordChangeModal}
        onClose={() => setShowPasswordChangeModal(false)}
        onPasswordChange={handlePasswordChange}
        user={localUser}
      />
    </div>
  );
};

export default InstructorSettingsPage;
