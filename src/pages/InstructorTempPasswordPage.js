import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import TodayActiveModal from '../components/student-management/TodayActiveModal';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const InstructorTempPasswordPage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('一時パスワード: 拠点情報のパースエラー:', parseError);
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
    if (locationToUse) {
      sessionStorage.setItem('selectedSatellite', JSON.stringify(locationToUse));
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
    setSelectedStudents([]);
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
      <InstructorHeader user={localUser} onLocationChange={handleLocationChange} />
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">学習</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">一時パスワード</h1>
            <p className="mt-2 text-gray-600">本日ログインする利用者へ、一時パスワードを発行します。</p>
          </div>
          <Link
            to="/instructor/dashboard"
            className="text-sm text-indigo-700 hover:text-indigo-900"
          >
            ダッシュボードに戻る
          </Link>
        </div>

        <TodayActiveModal
          key={localUser.satellite_id || 'none'}
          asPage
          selectedStudents={selectedStudents}
          onSelectStudents={setSelectedStudents}
        />
      </main>
    </div>
  );
};

export default InstructorTempPasswordPage;
