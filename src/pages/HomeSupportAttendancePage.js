import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import AttendanceTab from '../components/tabs/AttendanceTab';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const HomeSupportAttendancePage = () => {
  const { currentUser } = useInstructorGuard();
  const navigate = useNavigate();
  const [localUser, setLocalUser] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('勤怠管理: 拠点情報のパースエラー:', parseError);
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
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-emerald-700">在宅</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">⏰ 在宅勤怠管理(日時)</h1>
            <p className="mt-2 text-gray-600">在宅支援利用者の勤怠状況を管理できます</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <button
              type="button"
              onClick={() => navigate('/instructor/home-support/monthly-attendance')}
              className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
            >
              月次勤怠管理
            </button>
            <Link
              to="/instructor/dashboard"
              className="text-sm text-emerald-700 hover:text-emerald-900"
            >
              ダッシュボードに戻る
            </Link>
          </div>
        </div>

        <AttendanceTab showHeading={false} />
      </main>
    </div>
  );
};

export default HomeSupportAttendancePage;
