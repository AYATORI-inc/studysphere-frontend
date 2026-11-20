import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import EvaluationsTab from '../components/tabs/EvaluationsTab';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const HomeSupportEvaluationRecordsPage = () => {
  const { currentUser } = useInstructorGuard();
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
        console.error('評価記録: 拠点情報のパースエラー:', parseError);
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
        <div className="mb-6 flex justify-end">
          <Link
            to="/instructor/home-support"
            onClick={() => sessionStorage.setItem('homeSupportDashboardActiveTab', 'evaluations')}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            旧画面を開く
          </Link>
        </div>
        <EvaluationsTab showSupportRecord={false} alwaysShowCreate />
      </main>
    </div>
  );
};

export default HomeSupportEvaluationRecordsPage;
