import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import EvidenceRecordsTab from '../components/tabs/EvidenceRecordsTab';
import UserDetailModal from '../components/modals/UserDetailModal';
import UserInputModal from '../components/modals/UserInputModal';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const HomeSupportPhotoHistoryPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserInput, setShowUserInput] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('写真履歴: 拠点情報のパースエラー:', parseError);
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
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">在宅</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">写真・記録</h1>
            <p className="mt-2 text-gray-600">利用者さまの同意をいただいたうえで撮影している画像です。作業状態の確認と、証拠としての記録に使います。</p>
          </div>
          <Link
            to="/instructor/dashboard"
            className="text-sm text-emerald-700 hover:text-emerald-900"
          >
            ダッシュボードに戻る
          </Link>
        </div>

        <EvidenceRecordsTab
          showHeading={false}
          textOnly
          handleUserInputClick={(user) => {
            setSelectedUser(user);
            setShowUserInput(true);
          }}
          handleUserDetailClick={(user) => {
            setSelectedUser(user);
            setShowPhotos(true);
          }}
        />
      </main>

      <UserInputModal
        isOpen={showUserInput}
        onClose={() => {
          setShowUserInput(false);
          setSelectedUser(null);
        }}
        selectedUser={selectedUser}
      />
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

export default HomeSupportPhotoHistoryPage;
